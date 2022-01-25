from typing import List, Dict, Any, NamedTuple, Callable, Tuple, Union, Mapping, TYPE_CHECKING
if TYPE_CHECKING:
    from typing import TypedDict
else:
    TypedDict = object
from .persist import Persister, Dummy
from enum import IntFlag, IntEnum
from .logs import logging
from .messages import CANVASTYPE, CreateObjectMessage, StrippedObj, CANVASFLAG, MapFlags, GRIDTYPE, CanvasDeleteMessage, CanvasUpdateMessage, CreateObjectsMessage
from . import db
import appconfig

class MapDict(TypedDict):
    map_id: int
    objects: List[StrippedObj]
    map_name: str
    flags: MapFlags
    grid_type: GRIDTYPE

class Map(NamedTuple):
    map_id: int
    objects: List[StrippedObj]
    map_name: str
    flags: MapFlags = MapFlags.NONE
    grid_type: GRIDTYPE = GRIDTYPE.SQUARE
    def with_live_objs(self) -> MapDict:
        md: MapDict = self._asdict() # type: ignore
        md['objects'] = [o for o in md['objects'] if not (o[4] & CANVASFLAG.DELETED)]
        return md

def load_maps(campaign:str, dont_persist=False) -> Dict[int, Dummy[Map]]:
    campaign_id = db.lookup_campaign(campaign)
    assert campaign_id is not None
    o = db.get_maps(campaign_id)
    if not o:
        o = [{'map_id':0, 'objects':[], 'map_name':'Untitled'}]
    maps = load_canvas(o)
    result = {}
    for k, m in maps.items():
        result[k] = SingleMapPersister(campaign, m, dont_persist=dont_persist).obj
        result[k].dirty = False
    return result

class SingleMapPersister(Persister[Map]):
    def read_obj(self, obj:Map):
        o = Dummy(obj)
        return o
    def write_obj(self, obj:Dummy[Map]):
        db.save_map(self.campaign_id, **obj.value.with_live_objs())
    def __init__(self, campaign:str, obj:Map, dont_persist=False):
        campaign_id = db.lookup_campaign(campaign)
        assert campaign_id is not None
        self.campaign_id =  campaign_id 
        name = f'{campaign!r}/maps/{obj.map_name!r}'
        super().__init__(obj, name, dont_persist=dont_persist)


def save_canvas(maps:Dict[int, Map]) -> List[MapDict]:
    return [v.with_live_objs() for v in maps.values() if not (v.flags & MapFlags.DELETED)]

def load_canvas(data) -> Dict[int, Map]:
    result = {}
    for d in data:
        m = Map(**d)
        result[m.map_id] = m
    return result

def create_maps(room:str) -> None:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    if campaign in MAPS:
        return
    MAPS[campaign] = load_maps(campaign)
    MAP_OBJS_BY_ID[campaign] = {k:{o[1]:o for o in v.value.objects} for k,v in MAPS[campaign].items()}

def create_map(room:str, map_id:int) -> None:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    if campaign in MAPS and map_id in MAPS[campaign]:
        return
    MAPS[campaign][map_id] = SingleMapPersister(campaign, Map(map_id, [], 'Untitled')).obj
    MAP_OBJS_BY_ID[campaign][map_id] = {}

def name_map(room:str, map_id: int, map_name:str) -> None:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    m = MAPS[campaign][map_id]
    MAPS[campaign][map_id].value = m.value._replace(map_name=map_name)

def change_grid_type(room:str, map_id:int, grid_type:GRIDTYPE) -> None:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    m = MAPS[campaign][map_id]
    MAPS[campaign][map_id].value = m.value._replace(grid_type=grid_type)

def set_numbered(room:str, map_id:int, numbered:MapFlags) -> None:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    m = MAPS[campaign][map_id]
    if numbered & MapFlags.NUMBERED:
        flags = m.value.flags | MapFlags.NUMBERED
    else:
        flags = m.value.flags & ~(MapFlags.NUMBERED)
    MAPS[campaign][map_id].value = m.value._replace(flags=flags)

def new_map_request(room:str, map_name:str, grid_type:GRIDTYPE, flags:MapFlags) -> int:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    new_map_id = max(MAPS[campaign].keys()) + 1
    MAPS[campaign][new_map_id] = SingleMapPersister(campaign, Map(new_map_id, [], map_name, grid_type=grid_type, flags=flags)).obj
    MAP_OBJS_BY_ID[campaign][new_map_id] = {}
    return new_map_id

def delete_map(room:str, map_id:int) -> bool:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    m = MAPS[campaign][map_id]
    if m.value.flags & MapFlags.DELETED:
        return False
    if m.value.flags & MapFlags.CANT_DELETE:
        return False
    # Check that we will have at least one map after the deletion.
    # If we won't then reject the request.
    for m in MAPS[campaign].values():
        if m.value.map_id == map_id:
            continue
        if m.value.flags & MapFlags.DELETED:
            continue
        break
    else:
        return False

    m = MAPS[campaign][map_id]
    MAPS[campaign][map_id].value = m.value._replace(flags=m.value.flags | MapFlags.DELETED)
    return True

def handle_create(room:str, data:CreateObjectMessage) -> List[CreateObjectsMessage]:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    '''
    { map_id: 0, object:{...}, }
    '''
    map_id = data['map_id']
    obj_id = data['object'][1]
    obj = data['object']
    MAPS[campaign][map_id].value.objects.append(obj)
    MAP_OBJS_BY_ID[campaign][map_id][obj_id] = obj
    MAPS[campaign][map_id].dirty = True
    return [{'map_id':data['map_id'], 'objects':[data['object']]}]

def handle_delete(room:str, data:CanvasDeleteMessage) -> CanvasDeleteMessage:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    '''
    {map_id: 0, ids:[1,23]}
    '''
    map_id = data['map_id']
    OBJS_BY_ID = MAP_OBJS_BY_ID[campaign][map_id]
    obj_ids = data['ids']
    for obj_id in obj_ids:
        OBJS_BY_ID[obj_id][4] |= CANVASFLAG.DELETED # type: ignore
    MAPS[campaign][map_id].dirty = True
    return data

def handle_update(room:str, data:CanvasUpdateMessage) -> CanvasUpdateMessage:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    '''
    {map_id:0, obj_states: {...}}
    '''
    map_id = data['map_id']
    OBJS_BY_ID = MAP_OBJS_BY_ID[campaign][map_id]
    obj_states = data['obj_states']
    for obj_state in obj_states:
        obj_id = obj_state[1]
        # This must mutate the array!
        OBJS_BY_ID[obj_id][:] = obj_state # type: ignore
    MAPS[campaign][map_id].dirty = True
    return data

def get_state(room:str) -> list:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    return save_canvas({k:v.value for k, v in MAPS[campaign].items()})

MAPS = {'':load_maps('', dont_persist=not appconfig.DEV)}
MAP_OBJS_BY_ID = {'':{k:{o[1]:o for o in v.value.objects} for k,v in MAPS[''].items()}} # type: Dict[str,Dict[int, Dict[int, StrippedObj]]]

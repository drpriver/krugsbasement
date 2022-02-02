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

def load_maps(campaign_id:int) -> Dict[int, Dummy[Map]]:
    assert campaign_id is not None
    o = db.get_maps(campaign_id)
    if not o:
        o = [{'map_id':0, 'objects':[], 'map_name':'Untitled'}]
    maps = load_canvas(o)
    result = {}
    for k, m in maps.items():
        result[k] = SingleMapPersister(campaign_id, m).obj
        result[k].dirty = False
    return result

class SingleMapPersister(Persister[Map]):
    def read_obj(self, obj:Map):
        o = Dummy(obj)
        return o
    def write_obj(self, obj:Dummy[Map]):
        db.save_map(self.campaign_id, **obj.value.with_live_objs())
    def __init__(self, campaign_id:int, obj:Map):
        assert campaign_id is not None
        self.campaign_id =  campaign_id 
        name = f'{campaign_id!r}/maps/{obj.map_name!r}'
        super().__init__(obj, name, dont_persist=campaign_id==1)


def save_canvas(maps:Dict[int, Map]) -> List[MapDict]:
    return [v.with_live_objs() for v in maps.values() if not (v.flags & MapFlags.DELETED)]

def load_canvas(data) -> Dict[int, Map]:
    result = {}
    for d in data:
        m = Map(**d)
        result[m.map_id] = m
    return result

def create_maps(campaign:int) -> None:
    if campaign in MAPS:
        return
    MAPS[campaign] = load_maps(campaign)
    MAP_OBJS_BY_ID[campaign] = {k:{o[1]:o for o in v.value.objects} for k,v in MAPS[campaign].items()}

def create_map(campaign:int, map_id:int) -> None:
    if campaign in MAPS and map_id in MAPS[campaign]:
        return
    MAPS[campaign][map_id] = SingleMapPersister(campaign, Map(map_id, [], 'Untitled')).obj
    MAP_OBJS_BY_ID[campaign][map_id] = {}

def name_map(campaign:int, map_id: int, map_name:str) -> None:
    m = MAPS[campaign][map_id]
    MAPS[campaign][map_id].value = m.value._replace(map_name=map_name)

def change_grid_type(campaign:int, map_id:int, grid_type:GRIDTYPE) -> None:
    m = MAPS[campaign][map_id]
    MAPS[campaign][map_id].value = m.value._replace(grid_type=grid_type)

def set_numbered(campaign:int, map_id:int, numbered:MapFlags) -> None:
    m = MAPS[campaign][map_id]
    if numbered & MapFlags.NUMBERED:
        flags = m.value.flags | MapFlags.NUMBERED
    else:
        flags = m.value.flags & ~(MapFlags.NUMBERED)
    MAPS[campaign][map_id].value = m.value._replace(flags=flags)

def new_map_request(campaign:int, map_name:str, grid_type:GRIDTYPE, flags:MapFlags) -> int:
    new_map_id = max(MAPS[campaign].keys()) + 1
    MAPS[campaign][new_map_id] = SingleMapPersister(campaign, Map(new_map_id, [], map_name, grid_type=grid_type, flags=flags)).obj
    MAP_OBJS_BY_ID[campaign][new_map_id] = {}
    return new_map_id

def delete_map(campaign:int, map_id:int) -> bool:
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

def handle_create(campaign:int, data:CreateObjectMessage) -> List[CreateObjectsMessage]:
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

def handle_delete(campaign:int, data:CanvasDeleteMessage) -> CanvasDeleteMessage:
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

def handle_update(campaign:int, data:CanvasUpdateMessage) -> CanvasUpdateMessage:
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

def get_state(campaign:int) -> list:
    assert isinstance(campaign, int)
    return save_canvas({k:v.value for k, v in MAPS[campaign].items()})

MAPS = {} # type: Dict[int, Dict[int, Dummy[Map]]]
MAP_OBJS_BY_ID = {} # type: Dict[int,Dict[int, Dict[int, StrippedObj]]]

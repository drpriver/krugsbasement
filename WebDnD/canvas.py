from typing import List, Dict, Any, NamedTuple, Callable, Tuple, Union, Mapping, TYPE_CHECKING
if TYPE_CHECKING:
    from typing import TypedDict
else:
    TypedDict = object
from .persist import Persister
from enum import IntFlag, IntEnum
from .logs import logging
from .messages import CANVASTYPE, CreateObjectMessage, StrippedObj, CANVASFLAG, MapFlags, GRIDTYPE, CanvasDeleteMessage, CanvasUpdateMessage, CreateObjectsMessage

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

MAPS = {'/':{0:Map(0, [], 'Untitled')}}

def save_canvas(maps:Dict[int, Map]) -> List[MapDict]:
    return [v.with_live_objs() for v in maps.values() if not (v.flags & MapFlags.DELETED)]

def arrayify(objects):
    print('arrayify')
    result = []
    def get(*args):
        try:
            obj.extend([o[a] for a in args])
        except Exception as e:
            print('------->', e)
    for o in objects:
        t = o['type']
        obj = [o['type'], o['id'], o['base_x'], o['base_y'], o['flags']]
        if t == CANVASTYPE.FREEHAND_LINE:
            get('color', 'points', 'thickness')
        elif t == CANVASTYPE.GRID_LINE:
            get('color', 'points')
        elif t == CANVASTYPE.RECT:
            get('color', 'width', 'height')
        elif t == CANVASTYPE.FILLED_RECT:
            get('color', 'color2', 'width', 'height')
        elif t == CANVASTYPE.GRID_RECT:
            get('color', 'width', 'height')
        elif t == CANVASTYPE.ELLIPSE:
            get('color', 'color2', 'width', 'height', 'variant')
        elif t == CANVASTYPE.IMAGE:
            get('width', 'height', 'url')
        elif t == CANVASTYPE.TEXT:
            get('text', 'size')
            alignment = o.get('alignment', 1)
            obj.append(alignment)
        elif t == CANVASTYPE.EZ_TOKEN:
            get('text', 'color', 'width',  'height', 'statusflags')
        elif t == CANVASTYPE.IMG_TOKEN:
            get('url', 'width', 'height', 'statusflags')
        elif t == CANVASTYPE.DOOR:
            get('doortype', 'color', 'width', 'orientation')
        elif t == CANVASTYPE.STAIRS:
            get('width', 'height', 'rotation')
        elif t == CANVASTYPE.MEASURE:
            continue
        elif t == CANVASTYPE.FIXTURE:
            get('width', 'height', 'ftype')
        elif t == CANVASTYPE.FILLED_TILE:
            get('color')
            size = o.get('size', 1)
            obj.append(size)
        elif t == CANVASTYPE.TERRAIN_TILE:
            get('terrain_id')
        elif t == CANVASTYPE.ICON_TILE:
            get('terrainicon_id')
        else:
            raise AssertionError
        result.append(obj)
    return result # type: ignore


def load_canvas(data) -> Dict[int, Map]:
    result = {}
    for d in data:
        if 'map_name' not in d:
            d['map_name'] = 'Untitled'
        if d['objects'] and isinstance(d['objects'][0], dict):
            d['objects'] = arrayify(d['objects'])
        d['objects'] = [o for o in d['objects'] if o[0] != CANVASTYPE.MEASURE]
        m = Map(**d)
        result[m.map_id] = m
    return result



def create_maps(room:str) -> None:
    if room in MAPS:
        return
    MAPS[room] = Persister({0:Map(0, [], 'Untitled')}, 'BadDb'+room+'/canvas.json', save_func=save_canvas, load_func=load_canvas).obj
    MAP_OBJS_BY_ID[room] = {k:{o[1]:o for o in v.objects} for k,v in MAPS[room].items()}

def create_map(room:str, map_id:int) -> None:
    if room in MAPS and map_id in MAPS[room]:
        return
    MAPS[room][map_id] = Map(map_id, [], 'Untitled')
    MAP_OBJS_BY_ID[room][map_id] = {}

def name_map(room:str, map_id: int, map_name:str) -> None:
    m = MAPS[room][map_id]
    MAPS[room][map_id] = m._replace(map_name=map_name)

def change_grid_type(room:str, map_id:int, grid_type:GRIDTYPE) -> None:
    m = MAPS[room][map_id]
    MAPS[room][map_id] = m._replace(grid_type=grid_type)

def set_numbered(room:str, map_id:int, numbered:int) -> None:
    m = MAPS[room][map_id]
    if numbered:
        flags = m.flags | MapFlags.NUMBERED
    else:
        flags = m.flags & ~(MapFlags.NUMBERED)
    MAPS[room][map_id] = m._replace(flags=flags)

def new_map_request(room:str, map_name:str, grid_type:GRIDTYPE) -> int:
    new_map_id = max(MAPS[room].keys()) + 1
    MAPS[room][new_map_id] = Map(new_map_id, [], map_name, grid_type=grid_type)
    MAP_OBJS_BY_ID[room][new_map_id] = {}
    return new_map_id

def delete_map(room:str, map_id:int) -> bool:
    m = MAPS[room][map_id]
    if m.flags & MapFlags.DELETED:
        return False
    if m.flags & MapFlags.CANT_DELETE:
        return False
    # Check that we will have at least one map after the deletion.
    # If we won't then reject the request.
    for m in MAPS[room].values():
        if m.map_id == map_id:
            continue
        if m.flags & MapFlags.DELETED:
            continue
        break
    else:
        return False

    MAPS[room][map_id] = m._replace(flags=m.flags | MapFlags.DELETED)
    return True

def handle_create(room:str, data:CreateObjectMessage) -> List[CreateObjectsMessage]:
    '''
    { map_id: 0, object:{...}, }
    '''
    map_id = data['map_id']
    obj_id = data['object'][1]
    obj = data['object']
    MAPS[room][map_id].objects.append(obj)
    MAP_OBJS_BY_ID[room][map_id][obj_id] = obj
    return [{'map_id':data['map_id'], 'objects':[data['object']]}]

def handle_delete(room:str, data:CanvasDeleteMessage) -> CanvasDeleteMessage:
    '''
    {map_id: 0, ids:[1,23]}
    '''
    map_id = data['map_id']
    OBJS_BY_ID = MAP_OBJS_BY_ID[room][map_id]
    obj_ids = data['ids']
    for obj_id in obj_ids:
        OBJS_BY_ID[obj_id][4] |= CANVASFLAG.DELETED # type: ignore
    return data

def handle_update(room:str, data:CanvasUpdateMessage) -> CanvasUpdateMessage:
    '''
    {map_id:0, obj_states: {...}}
    '''
    map_id = data['map_id']
    OBJS_BY_ID = MAP_OBJS_BY_ID[room][map_id]
    obj_states = data['obj_states']
    for obj_state in obj_states:
        OBJS_BY_ID[obj_state[1]] = obj_state
    return data

def clear(room:str) -> None:
    MAPS[room].clear()
    MAP_OBJS_BY_ID[room].clear()

def get_state(room:str) -> list:
    return save_canvas(MAPS[room])

def set_state(room:str, state:list) -> None:
    MAPS[room].clear()
    MAPS[room].update(load_canvas(state))
    global MAP_OBJS_BY_ID
    MAP_OBJS_BY_ID[room] = {k:{o[1]:o for o in v.objects} for k,v in MAPS[room].items()}

MAPS['/'] = Persister(MAPS['/'], 'BadDb/canvas.json', save_func=save_canvas, load_func=load_canvas, dont_persist=True).obj
MAP_OBJS_BY_ID = {'/':{k:{o[1]:o for o in v.objects} for k,v in MAPS['/'].items()}} # type: Dict[str,Dict[int, Dict[int, StrippedObj]]]

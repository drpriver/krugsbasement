from typing import List, Dict, Any, NamedTuple, Callable, Tuple, Union
from .persist import Persister
from enum import IntFlag, IntEnum

class MapFlag(IntFlag):
    NONE = 0
    DELETED = 1
    CANT_DELETE = 2

class GridType(IntEnum):
    SQUARE = 0
    HEX = 1
    NOGRID = 2

class Map(NamedTuple):
    map_id: int
    objects: List[Dict[str, Any]]
    map_name: str
    flags: MapFlag = MapFlag.NONE
    grid_type: GridType = GridType.SQUARE
    def with_live_objs(self) -> Dict[str, Any]:
        md = self._asdict()
        md['objects'] = [o for o in md['objects'] if not (o['flags'] & Flags.DELETED)]
        return md


MAPS = {'/':{0:Map(0, [], 'Untitled')}}
class Flags(IntFlag):
    NONE = 0
    DELETED = 1


class CANVASTYPE(IntEnum):
    FREEHAND_LINE = 1
    GRID_LINE     = 2
    RECT          = 3
    GRID_RECT     = 4
    FILLED_RECT   = 5
    ELLIPSE       = 6
    IMAGE         = 7
    TEXT          = 8
    EZ_TOKEN      = 9
    IMG_TOKEN     = 10
    DOOR          = 11
    STAIRS        = 12
    MEASURE       = 13
    FIXTURE       = 14

def save_canvas(maps:Dict[int, Map]) -> List[Dict[str, Any]]:
    return [v.with_live_objs() for v in maps.values() if not (v.flags & MapFlag.DELETED)]

def load_canvas(data) -> Dict[int, Map]:
    result = {}
    for d in data:
        if 'map_name' not in d:
            d['map_name'] = 'Untitled'
        m = Map(**d)
        result[m.map_id] = m
    return result

MAPS['/'] = Persister(MAPS['/'], 'BadDb/canvas.json', save_func=save_canvas, load_func=load_canvas, dont_persist=True).obj
MAP_OBJS_BY_ID = {'/':{k:{o['id']:o for o in v.objects} for k,v in MAPS['/'].items()}} # type: Dict[str,Dict[int, Dict[int, dict]]]

def create_maps(room:str) -> None:
    if room in MAPS:
        return
    MAPS[room] = Persister({0:Map(0, [], 'Untitled')}, 'BadDb'+room+'/canvas.json', save_func=save_canvas, load_func=load_canvas).obj
    MAP_OBJS_BY_ID[room] = {k:{o['id']:o for o in v.objects} for k,v in MAPS[room].items()}

def create_map(room:str, map_id:int) -> None:
    if room in MAPS and map_id in MAPS[room]:
        return
    MAPS[room][map_id] = Map(map_id, [], 'Untitled')
    MAP_OBJS_BY_ID[room][map_id] = {}

def name_map(room:str, map_id: int, map_name:str) -> None:
    m = MAPS[room][map_id]
    MAPS[room][map_id] = m._replace(map_name=map_name)

def change_grid_type(room:str, map_id:int, grid_type:GridType) -> None:
    m = MAPS[room][map_id]
    MAPS[room][map_id] = m._replace(grid_type=grid_type)

def new_map_request(room:str, map_name:str, grid_type:int) -> int:
    new_map_id = max(MAPS[room].keys()) + 1
    MAPS[room][new_map_id] = Map(new_map_id, [], map_name, grid_type=grid_type)
    MAP_OBJS_BY_ID[room][new_map_id] = {}
    return new_map_id

def delete_map(room:str, map_id:int) -> bool:
    m = MAPS[room][map_id]
    if m.flags & MapFlag.DELETED:
        return False
    if m.flags & MapFlag.CANT_DELETE:
        return False
    # Check that we will have at least one map after the deletion.
    # If we won't then reject the request.
    for m in MAPS[room].values():
        if m.map_id == map_id:
            continue
        if m.flags & MapFlag.DELETED:
            continue
        break
    else:
        return False

    MAPS[room][map_id] = m._replace(flags=m.flags | MapFlag.DELETED)
    return True

VALIDATE_OBJ = {} # type: Dict[int, Callable[[dict], None]]
vfunc = Callable[[dict], None]

class Sentinel: pass
POINTS = Sentinel()

class Validator:
    def __init__(self, **types:Union[type, Tuple[type, ...], Sentinel]): 
        types['type']   = int
        types['id']     = int
        types['base_x'] = (float, int)
        types['base_y'] = (float, int)
        types['flags']  = int
        self.types = types
    def validate(self, obj:dict, POINTS=POINTS) -> None:
        if set(obj) != set(self.types):
            raise TypeError('Keys missing or extra')
        for key, t in self.types.items():
            v = obj[key]
            if t is POINTS:
                if not isinstance(v, list):
                    raise TypeError('Points not a list', key, type(v))
                for vv in v:
                    if not isinstance(vv, (int, float)):
                        raise TypeError('Points element is wrong type', key, type(vv))
            else:
                if not isinstance(v, t): # type: ignore
                    raise TypeError('field is wrong type', key, t, type(v))

def validate(ct:CANVASTYPE, **kwargs:Union[type, Tuple[type, ...], Sentinel]) -> None:
    VALIDATE_OBJ[ct] = Validator(**kwargs).validate

NUMBER = (float, int)
CT = CANVASTYPE
validate(CT.FREEHAND_LINE, color=str, points=POINTS, thickness=int)
validate(CT.GRID_LINE, color=str, points=POINTS)
validate(CT.RECT, color=str, width=NUMBER, height=NUMBER)
validate(CT.FILLED_RECT, color=str, color2=str, width=NUMBER, height=NUMBER)
validate(CT.ELLIPSE, color=str, width=NUMBER, height=NUMBER)
validate(CT.GRID_RECT, color=str, width=NUMBER, height=NUMBER)
validate(CT.IMAGE, width=NUMBER, height=NUMBER, url=str)
validate(CT.TEXT, text=str, size=NUMBER)
validate(CT.EZ_TOKEN, text=str, color=str, width=NUMBER, height=NUMBER)
validate(CT.IMG_TOKEN, url=str, width=NUMBER, height=NUMBER)
validate(CT.DOOR, doortype=int, color=str, width=NUMBER, orientation=int)
validate(CT.STAIRS, width=NUMBER, height=NUMBER, rotation=int)
validate(CT.MEASURE, x1=NUMBER, y1=NUMBER, color=str)
validate(CT.FIXTURE, width=NUMBER, height=NUMBER, ftype=int)



def validate_object(obj:dict) -> None:
    if not isinstance(obj, dict):
        raise TypeError('Obj is not a dict')
    if 'type' not in obj:
        raise TypeError('Obj has no type.')
    if not isinstance(obj['type'], int):
        raise TypeError('Obj has non-int type field')
    obj_type = obj['type']
    if obj_type not in VALIDATE_OBJ:
        raise TypeError('Unknown obj type', obj_type)
    VALIDATE_OBJ[obj_type](obj)

def handle_create(room:str, data:dict) -> list:
    '''
    { map_id: 0, object:{...}, }
    '''
    map_id = data['map_id']
    obj_id = data['object']['id']
    obj = data['object']
    validate_object(obj)
    MAPS[room][map_id].objects.append(obj)
    MAP_OBJS_BY_ID[room][map_id][obj_id] = obj
    return [{'map_id':data['map_id'], 'objects':[data['object']]}]

def handle_delete(room:str, data:dict) -> dict:
    '''
    {map_id: 0, ids:[1,23]}
    '''
    map_id = data['map_id']
    OBJS_BY_ID = MAP_OBJS_BY_ID[room][map_id]
    obj_ids = data['ids']
    for obj_id in obj_ids:
        OBJS_BY_ID[obj_id]['flags'] |= Flags.DELETED
    return data

def handle_update(room:str, data:dict) -> dict:
    '''
    {map_id:0, obj_states: {...}}
    '''
    map_id = data['map_id']
    OBJS_BY_ID = MAP_OBJS_BY_ID[room][map_id]
    obj_states = data['obj_states']
    for obj_state in obj_states:
        validate_object(obj_state)
        OBJS_BY_ID[obj_state['id']].update(obj_state)
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
    MAP_OBJS_BY_ID[room] = {k:{o['id']:o for o in v.objects} for k,v in MAPS[room].items()}

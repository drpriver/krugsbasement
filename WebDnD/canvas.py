from typing import List, Dict, Any, NamedTuple, Callable, Tuple, Union
from .persist import Persister
from enum import IntFlag, IntEnum

class MapFlag(IntFlag):
    NONE = 0
    DELETED = 1
    CANT_DELETE = 2

class Map(NamedTuple):
    map_id: int
    objects: List[Dict[str, Any]]
    map_name: str
    flags: MapFlag = MapFlag.NONE
    def with_live_objs(self) -> Dict[str, Any]:
        md = self._asdict()
        md['objects'] = [o for o in md['objects'] if not (o['flags'] & Flags.DELETED)]
        return md


MAPS = {0:Map(0, [], 'Untitled')}
class Flags(IntFlag):
    NONE = 0
    DELETED = 1


class CANVASTYPE(IntEnum):
    FREEHAND_LINE = 1
    GRID_LINE     = 2
    RECT          = 3
    GRID_RECT     = 4
    FILLED_RECT   = 5
    IMAGE         = 7
    TEXT          = 8
    EZ_TOKEN      = 9
    IMG_TOKEN     = 10
    DOOR          = 11
    STAIRS        = 12

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

MAPS = Persister(MAPS, 'BadDb/canvas.json', save_func=save_canvas, load_func=load_canvas).obj
MAP_OBJS_BY_ID = {k:{o['id']:o for o in v.objects} for k,v in MAPS.items()} # type: Dict[int, Dict[int, dict]]

def create_map(map_id:int) -> None:
    if map_id in MAPS:
        return
    MAPS[map_id] = Map(map_id, [], 'Untitled')
    MAP_OBJS_BY_ID[map_id] = {}

def name_map(map_id: int, map_name:str) -> None:
    m = MAPS[map_id]
    MAPS[map_id] = m._replace(map_name=map_name)

def new_map_request(map_name:str) -> int:
    new_map_id = max(MAPS.keys()) + 1
    MAPS[new_map_id] = Map(new_map_id, [], map_name)
    MAP_OBJS_BY_ID[new_map_id] = {}
    return new_map_id

def delete_map(map_id:int) -> bool:
    m = MAPS[map_id]
    if m.flags & MapFlag.DELETED:
        return False
    if m.flags & MapFlag.CANT_DELETE:
        return False
    # Check that we will have at least one map after the deletion.
    # If we won't then reject the request.
    for m in MAPS.values():
        if m.map_id == map_id:
            continue
        if m.flags & MapFlag.DELETED:
            continue
        break
    else:
        return False

    MAPS[map_id] = m._replace(flags=m.flags | MapFlag.DELETED)
    return True
    

def get_map(map_id:int) -> dict:
    m = MAPS[map_id]
    return m._asdict()

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
                    raise TypeError('Points not a list')
                for vv in v:
                    if not isinstance(vv, (int, float)):
                        raise TypeError('Points wrong type')
            else:
                if not isinstance(v, t): # type: ignore
                    raise TypeError('field is wrong type', key, t)
VALIDATE_OBJ[CANVASTYPE.FREEHAND_LINE] = Validator(
        color=str,
        points=POINTS
).validate
VALIDATE_OBJ[CANVASTYPE.GRID_LINE] = Validator(
        color=str,
        points=POINTS
).validate
VALIDATE_OBJ[CANVASTYPE.RECT] = Validator(
        color=str,
        width=(float, int),
        height=(float, int),
).validate
VALIDATE_OBJ[CANVASTYPE.FILLED_RECT] = Validator(
        color=str,
        color2=str,
        width=(float, int),
        height=(float, int),
).validate
VALIDATE_OBJ[CANVASTYPE.GRID_RECT] = Validator(
        color=str,
        width=(float, int),
        height=(float, int),
).validate
VALIDATE_OBJ[CANVASTYPE.IMAGE] = Validator(
        width=(float, int),
        height=(float, int),
        url=str,
).validate
VALIDATE_OBJ[CANVASTYPE.TEXT] = Validator(
        text=str,
        size=(float,int),
).validate
VALIDATE_OBJ[CANVASTYPE.EZ_TOKEN] = Validator(
        text=str,
        color=str,
        width=(float,int),
        height=(float,int),
).validate
VALIDATE_OBJ[CANVASTYPE.IMG_TOKEN] = Validator(
        url=str,
        width=(float,int),
        height=(float,int),
).validate
VALIDATE_OBJ[CANVASTYPE.DOOR] = Validator(
        doortype=int,
        color=str,
        width=(float,int),
        orientation=int,
).validate
VALIDATE_OBJ[CANVASTYPE.STAIRS] = Validator(
        width=int,
        height=int,
        rotation=int,
).validate



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

def handle_create(data:dict) -> list:
    '''
    { map_id: 0, object:{...}, }
    '''
    map_id = data['map_id']
    obj_id = data['object']['id']
    obj = data['object']
    validate_object(obj)
    MAPS[map_id].objects.append(obj)
    MAP_OBJS_BY_ID[map_id][obj_id] = obj
    return [{'map_id':data['map_id'], 'objects':[data['object']]}]

def handle_delete(data:dict) -> dict:
    '''
    {map_id: 0, ids:[1,23]}
    '''
    map_id = data['map_id']
    OBJS_BY_ID = MAP_OBJS_BY_ID[map_id]
    obj_ids = data['ids']
    for obj_id in obj_ids:
        OBJS_BY_ID[obj_id]['flags'] |= Flags.DELETED
    return data

def handle_update(data:dict) -> dict:
    '''
    {map_id:0, obj_states: {...}}
    '''
    map_id = data['map_id']
    OBJS_BY_ID = MAP_OBJS_BY_ID[map_id]
    obj_states = data['obj_states']
    for obj_state in obj_states:
        validate_object(obj_state)
        OBJS_BY_ID[obj_state['id']].update(obj_state)
    return data

def clear() -> None:
    MAPS.clear()
    MAP_OBJS_BY_ID.clear()

def get_state() -> list:
    return save_canvas(MAPS)

def set_state(state:list) -> None:
    MAPS.clear()
    MAPS.update(load_canvas(state))
    global MAP_OBJS_BY_ID
    MAP_OBJS_BY_ID = {k:{o['id']:o for o in v.objects} for k,v in MAPS.items()}

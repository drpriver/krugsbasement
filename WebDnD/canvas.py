from typing import List, Dict, Any, NamedTuple, Callable, Tuple, Union
from .persist import Persister
from enum import IntFlag, IntEnum

class Map(NamedTuple):
    map_id: int
    objects: List[Dict[str, Any]]
    def with_live_objs(self) -> Dict[str, Any]:
        md = self._asdict()
        md['objects'] = [o for o in md['objects'] if not (o['flags'] & Flags.DELETED)]
        return md


MAPS = {0:Map(0, [])}
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
    return [v.with_live_objs() for v in maps.values()]

def load_canvas(data) -> Dict[int, Map]:
    result = {}
    for d in data:
        m = Map(**d)
        result[m.map_id] = m
    return result

MAPS = Persister(MAPS, 'BadDb/canvas.json', save_func=save_canvas, load_func=load_canvas).obj
MAP_OBJS_BY_ID = {k:{o['id']:o for o in v.objects} for k,v in MAPS.items()} # type: Dict[int, Dict[int, dict]]

def create_map(map_id:int) -> None:
    if map_id in MAPS:
        return
    MAPS[map_id] = Map(map_id, [])
    MAP_OBJS_BY_ID[map_id] = {}

def get_map(map_id:int) -> dict:
    m = MAPS[map_id]
    return m._asdict()

VALIDATE_OBJ = {} # type: Dict[int, Callable[[dict], None]]
vfunc = Callable[[dict], None]

class Sentinel: pass
POINTS = Sentinel()

class Validator:
    def __init__(self, **types:Union[type, Tuple[type, ...], Sentinel]): 
        self.types = types
    def validate(self, obj:dict) -> None:
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
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
        color=str,
        points=POINTS
).validate
VALIDATE_OBJ[CANVASTYPE.GRID_LINE] = Validator(
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
        color=str,
        points=POINTS
).validate
VALIDATE_OBJ[CANVASTYPE.RECT] = Validator(
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
        color=str,
        width=(float, int),
        height=(float, int),
).validate
VALIDATE_OBJ[CANVASTYPE.FILLED_RECT] = Validator(
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
        color=str,
        color2=str,
        width=(float, int),
        height=(float, int),
).validate
VALIDATE_OBJ[CANVASTYPE.GRID_RECT] = Validator(
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
        color=str,
        width=(float, int),
        height=(float, int),
).validate
VALIDATE_OBJ[CANVASTYPE.IMAGE] = Validator(
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
        width=(float, int),
        height=(float, int),
        url=str,
).validate
VALIDATE_OBJ[CANVASTYPE.TEXT] = Validator(
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
        text=str,
        size=(float,int),
).validate
VALIDATE_OBJ[CANVASTYPE.EZ_TOKEN] = Validator(
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
        text=str,
        color=str,
        width=(float,int),
        height=(float,int),
).validate
VALIDATE_OBJ[CANVASTYPE.IMG_TOKEN] = Validator(
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
        url=str,
        width=(float,int),
        height=(float,int),
).validate
VALIDATE_OBJ[CANVASTYPE.DOOR] = Validator(
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
        doortype=int,
        color=str,
        width=(float,int),
        orientation=int,
).validate
VALIDATE_OBJ[CANVASTYPE.STAIRS] = Validator(
        type=int,
        id=int,
        base_x=(float, int),
        base_y=(float, int),
        flags=int,
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

def validate_obj_state(obj_state:dict) -> None:
    pass

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

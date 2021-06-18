from typing import List, Dict, Any, NamedTuple, Callable, Tuple, Union, Mapping
from .persist import Persister
from enum import IntFlag, IntEnum

class MapFlag(IntFlag):
    NONE        = 0x0
    DELETED     = 0x1
    CANT_DELETE = 0x2
    NUMBERED    = 0x4

class GridType(IntFlag):
    SQUARE = 0x0
    HEX    = 0x1
    NOGRID = 0x2

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
    FILLED_TILE   = 15
    TERRAIN_TILE  = 16
    ICON_TILE     = 17

def save_canvas(maps:Dict[int, Map]) -> List[Dict[str, Any]]:
    return [v.with_live_objs() for v in maps.values() if not (v.flags & MapFlag.DELETED)]

def load_canvas(data) -> Dict[int, Map]:
    result = {}
    for d in data:
        if 'map_name' not in d:
            d['map_name'] = 'Untitled'
        m = Map(**d)
        for o in m.objects:
            repair(o)
        result[m.map_id] = m
    return result


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

def set_numbered(room:str, map_id:int, numbered:int) -> None:
    m = MAPS[room][map_id]
    if numbered:
        flags = m.flags | MapFlag.NUMBERED
    else:
        flags = m.flags & ~(MapFlag.NUMBERED)
    MAPS[room][map_id] = m._replace(flags=flags)

def new_map_request(room:str, map_name:str, grid_type:int) -> int:
    new_map_id = max(MAPS[room].keys()) + 1
    MAPS[room][new_map_id] = Map(new_map_id, [], map_name, grid_type=grid_type) # type: ignore
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

VALIDATE_OBJ = {} # type: Dict[int, Validator]

class Sentinel: pass
POINTS = Sentinel()

class Validator:
    def __init__(self, type:CANVASTYPE, defaults:Dict[str, Any]={}, **types:Union[type, Tuple[type, ...], Sentinel]) -> None:
        self.ct = type
        types['type']   = int
        types['id']     = int
        types['base_x'] = (float, int)
        types['base_y'] = (float, int)
        types['flags']  = int
        self.types = types
        self.defaults = defaults
    def validate(self, obj:dict, POINTS=POINTS) -> None:
        if set(obj) != set(self.types):
            extra = set(obj) - set(self.types)
            if extra:
                raise TypeError(f'extra keys {extra} for {self.ct.name}')
            else:
                missing = set(self.types) - set(obj)
                raise TypeError(f'missing keys {missing} for {self.ct.name}')
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
    def repair_and_validate(self, obj, POINTS=POINTS) -> None:
        for key, t in self.types.items():
            if key not in obj:
                if key in self.defaults:
                    obj[key] = self.defaults[key]
                elif t is POINTS:
                    obj[key] = []
                elif t == NUMBER:
                    obj[key] = 0
                else:
                    obj[key] = t() # type: ignore
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

        if set(obj) != set(self.types):
            extra = set(obj) - set(self.types)
            if extra:
                raise TypeError(f'extra keys {extra} for {self.ct.name}')
            else:
                missing = set(self.types) - set(obj)
                raise TypeError(f'missing keys {missing} for {self.ct.name}')

def validate(ct:CANVASTYPE, defaults:Dict[str, Any]={}, **kwargs:Union[type, Tuple[type, ...], Sentinel]) -> None:
    VALIDATE_OBJ[ct] = Validator(defaults=defaults, **kwargs, type=ct) # type: ignore

def repair(obj:dict) -> None:
    if not isinstance(obj, dict):
        raise TypeError('Obj is not a dict')
    if 'type' not in obj:
        raise TypeError('Obj has no type.')
    if not isinstance(obj['type'], int):
        raise TypeError('Obj has non-int type field')
    obj_type = obj['type']
    if obj_type not in VALIDATE_OBJ:
        raise TypeError('Unknown obj type', obj_type)
    VALIDATE_OBJ[obj_type].repair_and_validate(obj)


NUMBER = (float, int)
CT = CANVASTYPE
validate(CT.FREEHAND_LINE, color=str, points=POINTS, thickness=int, defaults=dict(color='#000000', thickness=4))
validate(CT.GRID_LINE, color=str, points=POINTS, defaults=dict(color='#000000'))
validate(CT.RECT, color=str, width=NUMBER, height=NUMBER, defaults=dict(color='#000000', width=64, height=64))
validate(CT.FILLED_RECT, color=str, color2=str, width=NUMBER, height=NUMBER, defaults=dict(color='#000000', color2='#ff0000', width=64, height=64))
validate(CT.ELLIPSE, color=str, color2=str, width=NUMBER, height=NUMBER, variant=int, defaults=dict(color = '#000000', color2='#000000', width=64, height=64, variant=0))
validate(CT.GRID_RECT, color=str, width=NUMBER, height=NUMBER, defaults=dict(width=64, height=64))
validate(CT.IMAGE, width=NUMBER, height=NUMBER, url=str, defaults=dict(width=64, height=64))
validate(CT.TEXT, text=str, size=NUMBER, alignment=int, defaults=dict(size=18, alignment=1))
validate(CT.EZ_TOKEN, text=str, color=str, width=NUMBER, height=NUMBER, statusflags=int, defaults=dict(width=1, height=1, color='#ff00ff', statusflags=0))
validate(CT.IMG_TOKEN, url=str, width=NUMBER, height=NUMBER, statusflags=int, defaults=dict(url='/tokens/gb.png', width=1, height=1, statusflags=0))
validate(CT.DOOR, doortype=int, color=str, width=NUMBER, orientation=int, defaults=dict(width=64, color='#000000'))
validate(CT.STAIRS, width=NUMBER, height=NUMBER, rotation=int, defaults=dict(width=64, height=64))
validate(CT.MEASURE, x1=NUMBER, y1=NUMBER, color=str)
validate(CT.FIXTURE, width=NUMBER, height=NUMBER, ftype=int, defaults=dict(width=64, height=64))
validate(CT.FILLED_TILE, color=str, defaults=dict(color='#555555'))
validate(CT.TERRAIN_TILE, terrain_id=int, defaults=dict(terrain_id=0))
validate(CT.ICON_TILE, terrainicon_id=int, defaults=dict(terrainicon_id=0))



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
    VALIDATE_OBJ[obj_type].validate(obj)

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

MAPS['/'] = Persister(MAPS['/'], 'BadDb/canvas.json', save_func=save_canvas, load_func=load_canvas, dont_persist=True).obj
MAP_OBJS_BY_ID = {'/':{k:{o['id']:o for o in v.objects} for k,v in MAPS['/'].items()}} # type: Dict[str,Dict[int, Dict[int, dict]]]

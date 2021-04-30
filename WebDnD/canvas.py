from typing import List, Dict, Any, NamedTuple
from .persist import Persister
from enum import IntFlag

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

def create_map(map_id) -> None:
    if map_id in MAPS:
        return
    MAPS[map_id] = Map(map_id, [])
    MAP_OBJS_BY_ID[map_id] = {}

def get_map(map_id:int) -> dict:
    m = MAPS[map_id]
    return m._asdict()

def validate_object(obj:dict) -> None:
    pass

def handle_create(data:dict) -> dict:
    '''
    { map_id: 0, object:{...}, }
    '''
    map_id = data['map_id']
    obj_id = data['object']['id']
    obj = data['object']
    validate_object(obj)
    MAPS[map_id].objects.append(obj)
    MAP_OBJS_BY_ID[map_id][obj_id] = obj
    return [{'map_id':data['map_id'], 'objects':[data]}]

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
        validate_obj_state(obj_state)
        OBJS_BY_ID[obj_state['id']].update(obj_state)
    return data

def clear() -> None:
    MAPS.clear()
    MAP_OBJS_BY_ID.clear()

def get_state() -> list:
    return save_canvas(MAPS)

def set_state(state:list) -> None:
    global MAPS
    global MAP_OBJS_BY_ID
    MAPS = load_canvas(state)
    MAP_OBJS_BY_ID = {k:{o['id']:o for o in v.objects} for k,v in MAPS.items()}

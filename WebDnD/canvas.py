from typing import List, Dict
from .persist import Persister
OBJS = []  # type: List[dict]
from enum import IntFlag
class Flags(IntFlag):
    NONE = 0
    DELETED = 1
def save_canvas_objs(objs:List[dict]) -> List[dict]:
    return get_live_objects()
OBJS = Persister(OBJS, 'BadDb/canvas.json', save_func=save_canvas_objs).obj
OBJS_BY_ID = {o['id']:o for o in OBJS} # type: Dict[int, dict]

def get_objects() -> List[dict]:
    return OBJS

def get_live_objects() -> List[dict]:
    result = [o for o in OBJS if not (o['flags'] & Flags.DELETED)]
    return result

def handle_create(obj:dict) -> List[dict]:
    OBJS.append(obj)
    OBJS_BY_ID[obj['id']] = obj
    return [obj]

def handle_delete(obj_ids:List[int]) -> List[int]:
    for obj_id in obj_ids:
        OBJS_BY_ID[obj_id]['flags'] |= Flags.DELETED
    return obj_ids

def handle_update(obj_states:List[dict]) -> List[dict]:
    for obj_state in obj_states:
        OBJS_BY_ID[obj_state['id']].update(obj_state)
    return obj_states

def clear() -> None:
    OBJS_BY_ID.clear()
    OBJS.clear()

def set_state(state:List[dict]) -> None:
    global OBJS
    global OBJS_BY_ID
    OBJS = state
    OBJS_BY_ID = {o['id']:o for o in OBJS}


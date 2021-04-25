from typing import List, Dict
from .persist import Persister
OBJS = []  # type: List[dict]
def save_canvas_objs(objs:List[dict]) -> List[dict]:
    return [o for o in objs if not o['deleted']]
OBJS = Persister(OBJS, 'BadDb/canvas.json', save_func=save_canvas_objs).obj
OBJS_BY_ID = {o['id']:o for o in OBJS} # type: Dict[int, dict]

def get_live_objects() -> List[dict]:
    return OBJS

def handle_create(obj:dict) -> List[dict]:
    OBJS.append(obj)
    OBJS_BY_ID[obj['id']] = obj
    return [obj]

def handle_delete(obj_ids:List[int]) -> List[int]:
    for obj_id in obj_ids:
        OBJS_BY_ID[obj_id]['deleted'] = True
    return obj_ids

def handle_update(obj_states:List[dict]) -> List[dict]:
    for obj_state in obj_states:
        OBJS_BY_ID[obj_state['id']].update(obj_state)
    return obj_states

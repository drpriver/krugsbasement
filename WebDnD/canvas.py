OBJS = []
OBJS_BY_ID = {}

from typing import List, Dict

def get_live_objects() -> List[dict]:
    return OBJS

def handle_create(obj:dict) -> None:
    OBJS.append(obj)
    OBJS_BY_ID[obj['id']] = obj
    return [obj]



#
# Copyright © 2021-2026, David Priver <david@davidpriver.com>
#
from __future__ import annotations
from typing import List, Dict, Any, NamedTuple, Callable, Tuple, Union, Mapping, TYPE_CHECKING
if TYPE_CHECKING:
    from typing import TypedDict
else:
    TypedDict = object
from .persist import DirtyCell, RepeatTimer
from threading import RLock
from enum import IntFlag, IntEnum
from .logs import logging
from .messages import StrippedObj, CanvasFlag, MapFlags, GridType, CanvasDeleteMessage, CanvasUpdateMessage, CreateObjectsMessage, InitializeMap
from . import db
import atexit

MapDict = InitializeMap

class Map(NamedTuple):
    map_id: int
    objects: List[StrippedObj]
    map_name: str
    flags: MapFlags = MapFlags.NONE
    grid_type: GridType = GridType.SQUARE
    grid_color: str = ''
    bg_color: str = ''
    parent: int = -1
    def with_live_objs(self) -> MapDict:
        md: MapDict = self._asdict() # type: ignore
        md['objects'] = [o for o in md['objects'] if not (o[4] & CanvasFlag.DELETED)]
        return md

def load_maps(campaign_id:int) -> Dict[int, DirtyCell[Map]]:
    assert campaign_id is not None
    o = db.get_maps(campaign_id)
    if not o:
        o = [{'map_id':0, 'objects':[], 'map_name':'Untitled'}]
    maps = load_canvas(o)
    result = {}
    for k, m in maps.items():
        result[k] = DirtyCell(m)
        result[k].dirty = False
    return result

def save_canvas(maps:Dict[int, Map]) -> List[MapDict]:
    return [v.with_live_objs() for v in maps.values() if not (v.flags & MapFlags.DELETED)]

def load_canvas(data:list) -> Dict[int, Map]:
    result = {}
    for d in data:
        m = Map(**d)
        result[m.map_id] = m
    return result

def create_maps(campaign:int) -> None:
    with CANVASLOCK:
        if campaign in MAPS:
            return
        MAPS[campaign] = load_maps(campaign)
        MAP_OBJS_BY_ID[campaign] = {k:{o[1]:o for o in v.value.objects} for k,v in MAPS[campaign].items()}

def create_map(campaign:int, map_id:int) -> bool:
    with CANVASLOCK:
        if campaign in MAPS and map_id in MAPS[campaign]:
            return False
        MAPS[campaign][map_id] = DirtyCell(Map(map_id, [], 'Untitled'))
        MAP_OBJS_BY_ID[campaign][map_id] = {}
        return True

def name_map(campaign:int, map_id: int, map_name:str) -> bool:
    with CANVASLOCK:
        if map_id not in MAPS[campaign]:
            return False
        m = MAPS[campaign][map_id]
        MAPS[campaign][map_id].value = m.value._replace(map_name=map_name)
        return True

def change_grid_type(campaign:int, map_id:int, grid_type:GridType) -> bool:
    with CANVASLOCK:
        if map_id not in MAPS[campaign]:
            return False
        m = MAPS[campaign][map_id]
        MAPS[campaign][map_id].value = m.value._replace(grid_type=grid_type)
        return True

def change_grid_color(campaign:int, map_id:int, grid_color:str) -> bool:
    with CANVASLOCK:
        if map_id not in MAPS[campaign]:
            return False
        m = MAPS[campaign][map_id]
        MAPS[campaign][map_id].value = m.value._replace(grid_color=grid_color)
        return True

def change_bg_color(campaign:int, map_id:int, bg_color:str) -> bool:
    with CANVASLOCK:
        if map_id not in MAPS[campaign]:
            return False
        m = MAPS[campaign][map_id]
        MAPS[campaign][map_id].value = m.value._replace(bg_color=bg_color)
        return True

# FIXME: actually sets flags, not numbered
def set_flags(campaign:int, map_id:int, numbered:MapFlags) -> bool:
    with CANVASLOCK:
        if map_id not in MAPS[campaign]:
            return False
        m = MAPS[campaign][map_id]
        flags = m.value.flags
        if numbered & MapFlags.NUMBERED:
            flags |= MapFlags.NUMBERED
        else:
            flags &= ~(MapFlags.NUMBERED)
        if numbered & MapFlags.BIG_HEX:
            flags |= MapFlags.BIG_HEX
        else:
            flags &= ~(MapFlags.BIG_HEX)
        MAPS[campaign][map_id].value = m.value._replace(flags=flags)
        return True

def set_parent(campaign:int, map_id:int, parent:int) -> bool:
    with CANVASLOCK:
        if not valid_parent(campaign, map_id, parent, existing=True):
            return False
        m = MAPS[campaign][map_id]
        MAPS[campaign][map_id].value = m.value._replace(parent=parent)
        return True

def valid_parent(campaign:int, map_id:int, parent:int, existing:bool) -> bool:
    maps = MAPS[campaign]
    if existing and map_id not in maps:
        return False
    if not existing and map_id in maps:
        return False
    if parent == -1:
        return True
    if parent == map_id or parent not in maps:
        return False
    if maps[parent].value.flags & MapFlags.DELETED:
        return False
    seen = set()
    while parent != -1:
        if parent == map_id or parent in seen:
            return False
        seen.add(parent)
        parent_obj = maps.get(parent)
        if parent_obj is None:
            return False
        parent = parent_obj.value.parent
    return True

def new_map_request(campaign:int, map_name:str, grid_type:GridType, flags:MapFlags, grid_color:str, bg_color:str, parent:int) -> int | None:
    with CANVASLOCK:
        new_map_id = max(MAPS[campaign].keys()) + 1
        if not valid_parent(campaign, new_map_id, parent, existing=False):
            return None
        MAPS[campaign][new_map_id] = DirtyCell(Map(new_map_id, [], map_name, grid_type=grid_type, flags=flags, grid_color=grid_color, bg_color=bg_color, parent=parent))
        MAP_OBJS_BY_ID[campaign][new_map_id] = {}
        return new_map_id

def delete_map(campaign:int, map_id:int) -> bool:
    with CANVASLOCK:
        if map_id not in MAPS[campaign]:
            return False
        m = MAPS[campaign][map_id]
        if m.value.flags & MapFlags.DELETED:
            return False
        if m.value.flags & MapFlags.CANT_DELETE:
            return False
        for child in MAPS[campaign].values():
            if child.value.flags & MapFlags.DELETED:
                continue
            if child.value.parent == map_id:
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

def handle_create(campaign:int, data:List[CreateObjectsMessage]) -> List[CreateObjectsMessage] | None:
    '''
    { map_id: 0, object:{...}, }
    '''
    with CANVASLOCK:
        for d in data:
            map_id = d['map_id']
            if map_id not in MAPS[campaign]:
                return None
            if map_id not in MAP_OBJS_BY_ID[campaign]:
                return None
            for obj in d['objects']:
                obj_id = obj[1]
                if obj_id in MAP_OBJS_BY_ID[campaign][map_id]:
                    return None
        for d in data:
            map_id = d['map_id']
            for obj in d['objects']:
                obj_id = obj[1]
                MAPS[campaign][map_id].value.objects.append(obj)
                MAP_OBJS_BY_ID[campaign][map_id][obj_id] = obj
            MAPS[campaign][map_id].dirty = True
        return data

def handle_delete(campaign:int, data:CanvasDeleteMessage) -> CanvasDeleteMessage | None:
    '''
    {map_id: 0, ids:[1,23]}
    '''
    with CANVASLOCK:
        map_id = data['map_id']
        if map_id not in MAP_OBJS_BY_ID[campaign]:
            return None
        OBJS_BY_ID = MAP_OBJS_BY_ID[campaign][map_id]
        obj_ids = data['ids']
        for obj_id in obj_ids:
            if obj_id not in OBJS_BY_ID:
                return None
        for obj_id in obj_ids:
            OBJS_BY_ID[obj_id][4] |= CanvasFlag.DELETED # type: ignore
        MAPS[campaign][map_id].dirty = True
        return data

def handle_update(campaign:int, data:CanvasUpdateMessage) -> CanvasUpdateMessage | None:
    '''
    {map_id:0, obj_states: {...}}
    '''
    with CANVASLOCK:
        map_id = data['map_id']
        if map_id not in MAP_OBJS_BY_ID[campaign]:
            return None
        OBJS_BY_ID = MAP_OBJS_BY_ID[campaign][map_id]
        obj_states = data['obj_states']
        for obj_state in obj_states:
            obj_id = obj_state[1]
            if obj_id not in OBJS_BY_ID:
                return None
        for obj_state in obj_states:
            obj_id = obj_state[1]
            # This must mutate the array!
            OBJS_BY_ID[obj_id][:] = obj_state # type: ignore
        MAPS[campaign][map_id].dirty = True
        return data

def get_state(campaign:int) -> List[MapDict]:
    assert isinstance(campaign, int)
    with CANVASLOCK:
        return save_canvas({k:v.value for k, v in MAPS[campaign].items()})

def maps_reaper() -> None:
    with CANVASLOCK:
        for campaign, maps in list(MAPS.items()):
            if campaign == 1:
                continue
            for m in maps.values():
                if not m.dirty:
                    continue
                try:
                    db.save_map(campaign, **m.value.with_live_objs())
                except Exception as e:
                    logging.error('Error saving map %r/%r: %s', campaign, m.value.map_id, e)
                    continue
                m.dirty = False

CANVASLOCK = RLock()
MAPS = {} # type: Dict[int, Dict[int, DirtyCell[Map]]]
MAP_OBJS_BY_ID = {} # type: Dict[int,Dict[int, Dict[int, StrippedObj]]]

Reaper = RepeatTimer(60, maps_reaper)
Reaper.start()
atexit.register(maps_reaper)

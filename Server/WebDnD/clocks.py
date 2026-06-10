#
# Copyright © 2025-2026, David Priver <david@davidpriver.com>
#
from __future__ import annotations
from typing import Callable, Any, DefaultDict
from threading import RLock
import atexit
import time
from .persist import RepeatTimer
from . import db
from .logs import logging
import appconfig
from collections import defaultdict
import json

if appconfig.DEV:
    dlog = logging.info
else:
    def dlog(*args): # type: ignore
        return
from .messages import ClockClear, ClockMsg, ClockNew, ClockData, ClockEdit, ClockShow, ClockEvent, ClockFlags, ClockDelete, ClockInitialize, ClockEventNew, ClockEventEdit, ClockEventFlags, ClockEventDelete, ClockMsgType

LOCK = RLock()
CLOCKS: dict[int, Clocks] = {}

def clock_reaper() -> None:
    with LOCK:
        t = time.time()
        for campaign, clocks in list(CLOCKS.items()):
            if clocks.dirty: clocks.persist()
            if should_unload(clocks, t):
                logging.info('Unloading clocks for campaign %r', campaign)
                del CLOCKS[campaign]
                del clocks

def should_unload(c:Clocks, t:float) -> bool:
    return t - c._last_mod > 60*10

# server-side version of the clock
class Clocks:
    def __init__(
        self,
        campaign: int,
        clocks: list[ClockData]
    ) -> None:
        self.campaign = campaign
        self.clocks = {c['id']: c for c in clocks}
        self._last_mod = time.time()
        self.dirty = False
        self.highest_id = max(c['id'] for c in clocks) if clocks else 0

    def alloc_id(self) -> int:
        self.highest_id += 1
        return self.highest_id

    def persist(self) -> None:
        logging.info('persisting clocks for campaign %r', self.campaign)
        data:list[tuple[int, int, str, int, str, int, str, int]] = [
            (self.campaign, c['id'], c['name'], c['flags'], c['value_name'], c['value'], json.dumps(c['events']), c['hidinguser']) 
            for c in self.clocks.values()
        ]
        db.save_clocks(self.campaign, data)
        self.dirty = False

    def get_msg(self) -> ClockInitialize:
        return {'type': ClockMsgType.INITIALIZE, 'clocks': sorted(self.clocks.values(), key = lambda c: c['id'])}

    def add_clock(self, msg: ClockNew) -> bool:
        msg['id'] = self.alloc_id()
        cd: ClockData = {
            'id': msg['id'],
            'name': msg['name'],
            'value_name': msg['value_name'],
            'value': msg['value'],
            'flags': msg['flags'],
            'events': [],
            'hidinguser': msg['hidinguser'],
        }
        self.clocks[msg['id']] = cd
        self._last_mod = time.time()
        self.dirty = True
        return True

    def clear_clock(self, msg:ClockClear) -> bool:
        id = msg['id']
        c = self.clocks.get(id)
        if c is None:
            return False
        c['events'].clear()
        self._last_mod = time.time()
        self.dirty = True
        return True

    def del_clock(self, msg:ClockDelete) -> bool:
        id = msg['id']
        if id not in self.clocks:
            return False
        del self.clocks[id]
        self._last_mod = time.time()
        self.dirty = True
        return True

    def edit_clock(self, msg:ClockEdit) -> bool:
        id = msg['id']
        c = self.clocks.get(id)
        if c is None:
            return False
        c['name'] = msg['name']
        c['value_name'] = msg['value_name']
        c['value'] = msg['value']
        c['flags'] = msg['flags']
        c['hidinguser'] = msg['hidinguser']
        self._last_mod = time.time()
        self.dirty = True
        return True

    def add_clock_event(self, msg:ClockEventNew) -> bool:
        id = msg['clock_id']
        c = self.clocks.get(id)
        if c is None:
            return False
        msg['id'] = 1 + (max(ev['id'] for ev in c['events']) if c['events'] else 0)
        e: ClockEvent = {
            'id': msg['id'],
            'name': msg['name'],
            'when': msg['when'],
            'flags': msg['flags'],
        }
        c['events'].append(e)
        self._last_mod = time.time()
        self.dirty = True
        return True
    def edit_clock_event(self, msg:ClockEventEdit) -> bool:
        id = msg['clock_id']
        c = self.clocks.get(id)
        if c is None:
            return False
        id = msg['id']
        for e in c['events']:
            if e['id'] == id:
                e['name'] = msg['name']
                e['when'] = msg['when']
                e['flags'] = msg['flags']
                self._last_mod = time.time()
                self.dirty = True
                return True
        return False
    def del_clock_event(self, msg:ClockEventDelete) -> bool:
        id = msg['clock_id']
        c = self.clocks.get(id)
        if c is None:
            return False
        id = msg['id']
        new_events = [e for e in c['events'] if e['id'] != id]
        if len(new_events) == len(c['events']):
            return False
        c['events'] = new_events
        self._last_mod = time.time()
        self.dirty = True
        return True


def load_clocks(campaign:int) -> None:
    dlog("load clocks for campaign %r", campaign)
    clocks = db.get_clocks(campaign)
    if clocks is None:
        dlog("no clocks for campaign %r", campaign)
        clocks = []
    CLOCKS[campaign] = Clocks(campaign, clocks)

def get_clocks(campaign:int) -> ClockMsg | None:
    # dlog('campaign: %r', campaign)
    if campaign not in CLOCKS:
        load_clocks(campaign)
    if campaign not in CLOCKS:
        dlog('no clock for campaign???: %r', campaign)
        return None
    c = CLOCKS[campaign]
    # dlog('msg: %r', c.get_msg())
    return  c.get_msg()


def handle(campaign: int, msg: ClockMsg) -> ClockMsg | None:
    # dlog("msg: %r", msg)
    with LOCK:
        if campaign not in CLOCKS:
            load_clocks(campaign)
        clocks = CLOCKS[campaign]
        if msg['type'] == ClockMsgType.INITIALIZE:
            return None
        if msg['type'] == ClockMsgType.SHOW:
            return msg
        if msg['type'] == ClockMsgType.CLEAR:
            return msg if clocks.clear_clock(msg) else None
        if msg['type'] == ClockMsgType.NEW:
            return msg if clocks.add_clock(msg) else None
        if msg['type'] == ClockMsgType.DELETE:
            return msg if clocks.del_clock(msg) else None
        if msg['type'] == ClockMsgType.EDIT:
            return msg if clocks.edit_clock(msg) else None
        if msg['type'] == ClockMsgType.EVENT_NEW:
            return msg if clocks.add_clock_event(msg) else None
        if msg['type'] == ClockMsgType.EVENT_EDIT:
            return msg if clocks.edit_clock_event(msg) else None
        if msg['type'] == ClockMsgType.EVENT_DELETE:
            return msg if clocks.del_clock_event(msg) else None

Reaper = RepeatTimer(60, clock_reaper)
Reaper.start()
atexit.register(clock_reaper)

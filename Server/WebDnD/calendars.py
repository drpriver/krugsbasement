#
# Copyright © 2024, David Priver
#
from __future__ import annotations
from typing import Optional, Callable, Any, DefaultDict
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
from .messages import CalendarMsg, CalendarMsgType, CalendarInitialize, CalendarFlags, CalendarEditDay, CalendarDay, CalendarAddYear

LOCK = RLock()
CALENDARS: dict[int, Calendar] = {}

def calendar_reaper() -> None:
    with LOCK:
        t = time.time()
        for campaign, calendar in list(CALENDARS.items()):
            if calendar.dirty: calendar.persist()
            if should_unload(calendar, t):
                logging.info('Unloading calendar for campaign %r', campaign)
                del CALENDARS[campaign]
            del calendar

def should_unload(c:Calendar, t:float) -> bool:
    # dlog('last_mod: %r', c._last_mod)
    # dlog('t: %r', t)
    # dlog('diff: %r', t - c._last_mod)
    return t - c._last_mod > 60*10

# server-side version of the calendar
class Calendar:
    def __init__(
        self,
        campaign:int,
        starting_year:int,
        starting_day_of_week: int,
        month_names: list[str],
        month_lengths: list[int],
        weekday_names: list[str],
        flags: CalendarFlags,
        data: list[CalendarDay],
    ) -> None:
        self.campaign = campaign
        self.starting_year = starting_year
        self.starting_day_of_week = starting_day_of_week
        self.month_names = month_names
        self.month_lengths = month_lengths
        self.weekday_names = weekday_names
        self.data = defaultdict(lambda: defaultdict(lambda: defaultdict(str))) # type: DefaultDict[int, DefaultDict[int, DefaultDict[int, str]]]
        self.flags = flags
        for y, m, d, txt in data:
            self.data[y][m][d] = txt
        self._last_mod = time.time()
        self.dirty = False

    def edit_days(self, data:list[CalendarDay]) -> None:
        for y, m, d, txt in data:
            self.data[y][m][d] = txt
        self._last_mod = time.time()
        self.dirty = True

    def get_days(self) -> list:
        result = []
        for y, x in self.data.items():
            for m, xx in x.items():
                for d, txt in xx.items():
                    result.append([y, m, d, txt])
        # dlog('%r', result)
        return result

    def persist(self) -> None:
        logging.info('persisting calendar for campaign %r', self.campaign)
        db.save_calendar(
            (
            self.campaign,
            self.starting_year,
            self.starting_day_of_week,
            json.dumps(self.month_names),
            json.dumps(self.month_lengths),
            json.dumps(self.weekday_names),
            int(self.flags),
            json.dumps(self.get_days()),
            ))
        self.dirty = False

    def get_msg(self) -> CalendarInitialize:
        return [
            CalendarMsgType.INITIALIZE,
            self.starting_year,
            self.starting_day_of_week,
            self.month_names,
            self.month_lengths,
            self.weekday_names,
            self.flags,
            self.get_days(),
        ] # type: ignore


def load_calendar(campaign:int) -> None:
    dlog("load calendar for campaign %r", campaign)
    data = db.get_calendar(campaign)
    if data is None:
        dlog("no calendar for campaign %r", campaign)
        return
    CALENDARS[campaign] = Calendar(**data)

def get_calendar(campaign:int) -> CalendarMsg | None:
    if campaign not in CALENDARS:
        load_calendar(campaign)
    if campaign not in CALENDARS:
        return None
    c = CALENDARS[campaign]
    return  c.get_msg()



def handle(campaign: int, msg: CalendarMsg) -> CalendarMsg | None:
    dlog("msg: %r", msg)
    with LOCK:
        if campaign not in CALENDARS:
            load_calendar(campaign)
        if msg[0] == CalendarMsgType.INITIALIZE:
            if campaign in CALENDARS:
                logging.info('campaign %r already has calendar', campaign)
                return None
            logging.info('initing calendar from campaign %r', campaign)
            CALENDARS[campaign] = Calendar(campaign, *msg[1:])
            CALENDARS[campaign].dirty = True
            return msg
        if msg[0] == CalendarMsgType.EDITDAY:
            if campaign not in CALENDARS:
                return None
            CALENDARS[campaign].edit_days(msg[1])
            return msg
        if msg[0] == CalendarMsgType.ADDYEAR:
            return msg

Reaper = RepeatTimer(60, calendar_reaper)
Reaper.start()
atexit.register(calendar_reaper)

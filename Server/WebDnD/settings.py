#
# Copyright © 2021-2026, David Priver <david@davidpriver.com>
#
from __future__ import annotations
from . import db
from .logs import logging
from .persist import RepeatTimer
import time
from typing import Any, TypeVar
T = TypeVar('T')
import json
from threading import RLock
import atexit
import appconfig

if appconfig.DEV:
    dlog = logging.info
else:
    def dlog(*args): # type: ignore
        return

class Settings:
    def __init__(self, userid:int) -> None:
        self.userid = userid
        self.global_settings = None # type: dict[str, Any]|None
        self.local_settings = {} # type: dict[int, dict[str, dict[str, Any]]]
        self.local_dirty = set() # type: set[tuple[int, str, str]]
        self.global_dirty = set() # type: set[str]
        # record when accessed so we can estimate whether it is worth it to unload
        self.last_access = time.time()
        logging.info('Loading settings for %r', userid)

    def get_global(self) -> dict[str, Any]:

        self.last_access = time.time()
        if self.global_settings is None:
            self.global_settings = db.get_global_settings(self.userid)
        return self.global_settings
    def get_local(self, campaignid:int) -> dict[str, Any]:
        self.last_access = time.time()
        if campaignid not in self.local_settings:
            self.local_settings[campaignid] = db.get_local_settings(self.userid, campaignid)
        return self.local_settings[campaignid]

    def set_local(self, campaignid:int, category:str, key:str, value:str) -> None:
        self.last_access = time.time()
        if campaignid not in self.local_settings:
            self.local_settings[campaignid] = db.get_local_settings(self.userid, campaignid)
        local = self.local_settings[campaignid]
        if category not in local:
            local[category] = {}
        cat = local[category]
        value = json.loads(value)
        if key in cat and value == cat[key]:
            return
        cat[key] = value
        self.local_dirty.add((campaignid, category, key))

    def set_global(self, key:str, value:Any) -> None:
        self.last_access = time.time()
        if self.global_settings is None:
            self.global_settings = db.get_global_settings(self.userid)
        if key in self.global_settings and self.global_settings[key] == value:
            return
        self.global_settings[key] = value
        self.global_dirty.add(key)

    def should_unload(self, t:float) -> bool:
        return t > self.last_access + 60*10

    def commit(self) -> None:
        if self.local_dirty or self.global_dirty:
            dlog('Committing settings for %r', self.userid)
        for campaignid, category, key in self.local_dirty:
            value = self.local_settings[campaignid][category][key]
            js = json.dumps(value)
            db.store_local_setting(self.userid, campaignid, category, key, js)
        self.local_dirty.clear()
        if self.global_dirty:
            global_settings = self.global_settings
            assert global_settings is not None
            for key in self.global_dirty:
                value = global_settings[key]
                js = json.dumps(value)
                db.store_global_settings(self.userid, key, js)
        self.global_dirty.clear()

settingslock = RLock()
all_settings = {} # type: dict[int, Settings]
def get_settings(userid:int) -> Settings:
    if userid not in all_settings:
        all_settings[userid] = Settings(userid)
    return all_settings[userid]

def get_local(userid:int, campaignid:int) -> dict[str, Any]:
    with settingslock:
        return get_settings(userid).get_local(campaignid)

def get_local_ckvd(userid:int, campaignid: int, category:str, key:str, d:T) -> T:
    s = get_local(userid, campaignid)
    return s.get(category, {}).get(key, d)

def get_global(userid:int) -> dict[str, Any]:
    with settingslock:
        return get_settings(userid).get_global()

def set_local(userid:int, campaignid:int, category:str, key:str, value:Any) -> None:
    with settingslock:
        get_settings(userid).set_local(campaignid, category, key, value)

def set_global(userid:int, key:str, value:Any) -> None:
    with settingslock:
        get_settings(userid).set_global(key, value)

def settings_reaper() -> None:
    with settingslock:
        items = list(all_settings.items())
        t = time.time()
        for k, setting in items:
            setting.commit()
            if setting.should_unload(t):
                logging.info('Unloading settings for userid: %r', setting.userid)
                del all_settings[k]
            del setting
Reaper = RepeatTimer(60, settings_reaper)
Reaper.start()
atexit.register(settings_reaper)

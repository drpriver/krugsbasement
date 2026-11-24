#
# Copyright © 2021-2026, David Priver <david@davidpriver.com>
#
from __future__ import annotations
from threading import RLock
import atexit
import time
from .persist import RepeatTimer
from . import db
from .logs import logging
import appconfig

if appconfig.DEV:
    dlog = logging.info
else:
    def dlog(*args): # type: ignore
        return

from .messages import SpreadSheetMsg, SpreadSheetMsgType, SpreadSheetData
from .sheet_model import SpreadSheet as SheetModel, METHODS, blank_cell, valid_func_io

def sheets_reaper() -> None:
    with SHEETSLOCK:
        t = time.time()
        for campaign, sheets in list(SPREADSHEETS.items()):
            for s in sheets:
                if s.dirty: s.persist()
                del s
            if should_unload(sheets, t):
                logging.info('Unloading sheets for campaign %r', campaign)
                del SPREADSHEETS[campaign]
            del sheets


def should_unload(sheets:list[SpreadSheet], t:float) -> bool:
    for s in sheets:
        if t < s._last_mod + 60*10:
            return False
    return True

class SpreadSheet(SheetModel):

    def persist(self) -> None:
        if self._cells_dirty:
            dlog('saving cells for sheet %r (%r,%r)', self.name, self.campaign, self.id)
            db.save_sheet_cells(self.campaign, self.id, self.cells)
            self._cells_dirty = False
        if self._col_names_dirty:
            dlog('saving columns for sheet %r (%r,%r)', self.name, self.campaign, self.id)
            db.save_sheet_col_names(self.campaign, self.id, self.column_names)
            self._col_names_dirty = False

        if self._name_dirty:
            dlog('saving name for sheet %r (%r,%r)', self.name, self.campaign, self.id)
            db.save_sheet_name(self.campaign, self.id, self.name)
            self._name_dirty = False

        if self._flags_dirty:
            dlog('saving flags for sheet %r (%r,%r): %r', self.name, self.campaign, self.id, self.flags)
            db.save_sheet_flags(self.campaign, self.id, self.flags)
            self._flags_dirty = False

        if self._parent_dirty:
            dlog('saving parent for sheet %r (%r,%r): %r', self.name, self.campaign, self.id, self.parent)
            db.save_sheet_parent(self.campaign, self.id, self.parent)
            self._parent_dirty = False

        if self._func_io_dirty:
            dlog('saving func_io for sheet %r (%r,%r): %r %r %r', self.name, self.campaign, self.id, self.n_args, self.outx, self.outy)
            db.save_sheet_func_io(self.campaign, self.id, self.n_args, self.outx, self.outy)
            self._func_io_dirty = False


def get_sheet(campaign:int, id:int) -> SpreadSheet|None:
    if campaign not in SPREADSHEETS:
        dlog('campaign does not have spreadsheets: %r')
        return None
    sheets = SPREADSHEETS[campaign]
    for s in sheets:
        if s.id == id: return s
    dlog('Unable to find spreadsheet (%r, %r)', campaign, id)
    return None

def valid_parent(sheets:list[SpreadSheet], id:int, parent:int) -> bool:
    if parent == 0:
        return True
    if parent < 0 or parent == id:
        return False
    by_id = {s.id:s for s in sheets}
    if parent not in by_id:
        return False
    seen = {id}
    while parent:
        if parent in seen:
            return False
        seen.add(parent)
        sheet = by_id.get(parent)
        if sheet is None:
            return False
        parent = sheet.parent
    return True

# access must be protected with SHEETSLOCK
SHEETSLOCK = RLock()
SPREADSHEETS = {} # type: dict[int, list[SpreadSheet]]

def load_spreadsheets(campaign:int) -> None:
    dlog('loading sheets for campaign %r', campaign)
    assert campaign not in SPREADSHEETS
    sheets = []
    for data in db.get_sheets(campaign):
        sheets.append(SpreadSheet(campaign=campaign, **data))
    SPREADSHEETS[campaign] = sheets


def handle(campaign:int, msg:SpreadSheetMsg) -> SpreadSheetMsg|None:
    if msg[0] == SpreadSheetMsgType.SHOW:
        return msg
    with SHEETSLOCK:
        if campaign not in SPREADSHEETS:
            load_spreadsheets(campaign)
        if msg[0] == SpreadSheetMsgType.DELETE:
            if get_sheet(campaign, msg[1]) is None:
                return None
            if any(s.parent == msg[1] for s in SPREADSHEETS[campaign]):
                return None
            db.delete_sheet(campaign, msg[1])
            SPREADSHEETS[campaign] = [s for s in SPREADSHEETS[campaign] if s.id != msg[1]]
            return msg
        if msg[0] == SpreadSheetMsgType.NEW_SHEET:
            if SPREADSHEETS[campaign]:
                id = max(s.id for s in SPREADSHEETS[campaign]) + 1
            else:
                id = 1
            data = msg[1]
            data['id'] = id
            if not data['column_names']:
                data['column_names'] = [''] * 3
                data['cells'] = [blank_cell() for _ in range(12)]
            if not valid_parent(SPREADSHEETS[campaign], id, data['parent']):
                return None
            if len(data['cells']) % len(data['column_names']) != 0:
                return None
            ncols = len(data['column_names'])
            nrows = len(data['cells']) // ncols
            if not valid_func_io(data['n_args'], data['outx'], data['outy'], ncols, nrows):
                return None
            SPREADSHEETS[campaign].append(SpreadSheet(campaign=campaign, **data))
            db.save_sheet(campaign, **data)
            return msg
        if msg[0] == SpreadSheetMsgType.INITIALIZE:
            #TODO: log
            return None
        sheet = get_sheet(campaign, msg[1])
        if sheet is None: return None
        if msg[0] == SpreadSheetMsgType.PARENT and not valid_parent(SPREADSHEETS[campaign], msg[1], msg[2]):
            return None
        meth = METHODS[msg[0]]
        if not meth(sheet, *msg[2:]):
            return None
        return msg

def get_spreadsheets(campaign:int) -> list[SpreadSheetData]:
    with SHEETSLOCK:
        if campaign not in SPREADSHEETS:
            load_spreadsheets(campaign)
        return [s.as_data() for s in SPREADSHEETS[campaign]]

Reaper = RepeatTimer(60, sheets_reaper)
Reaper.start()
atexit.register(sheets_reaper)

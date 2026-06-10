#
# Copyright © 2021-2024, David Priver
#
from __future__ import annotations
from typing import Callable, Any
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

from .messages import SpreadSheetMsg, SpreadSheetMsgType, SpreadSheetData, SpreadSheetFlags, CellFlags, CellData

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

def blank_cell() -> CellData:
    return ['', '', CellFlags.NONE] # type: ignore

def valid_func_io(n_args:int, outx:int, outy:int, ncols:int, nrows:int) -> bool:
    if n_args < 0:
        return False
    no_output = outx == -1 and outy == -1
    if not no_output and (outx < 0 or outy < 0):
        return False
    if n_args > ncols:
        return False
    if not no_output and (outx >= ncols or outy >= nrows):
        return False
    return True

EDITABLE_FLAGS = (
    SpreadSheetFlags.CAN_ADD_ROW
    | SpreadSheetFlags.CAN_ADD_COL
    | SpreadSheetFlags.CAN_SORT_COLS
    | SpreadSheetFlags.CAN_DEL_ROW
    | SpreadSheetFlags.CAN_DEL_COL
    | SpreadSheetFlags.NUMBERED
    | SpreadSheetFlags.CAN_MOVE_COLUMNS
    | SpreadSheetFlags.CAN_MOVE_ROWS
    | SpreadSheetFlags.LOCKED_FORMULAS
    | SpreadSheetFlags.CAN_EDIT_CELLS
)

# We need to have a server side version of the spreadsheet
# so that we can interpret the abstract commands.
class SpreadSheet:
    def __init__(self, campaign:int, id:int, name:str, flags:SpreadSheetFlags, column_names:list[str], cells:list[CellData], parent:int, n_args:int, outx:int, outy:int) -> None:
        self.campaign = campaign
        self.id = id
        self.name = name
        self.flags = flags
        self.column_names = column_names
        self.cells = cells
        self.parent = parent
        self.n_args = n_args
        self.outx = outx
        self.outy = outy
        self._cells_dirty = False
        self._col_names_dirty = False
        self._last_mod = time.time()
        self._name_dirty = False
        self._flags_dirty = False
        self._parent_dirty = False
        self._func_io_dirty = False

    @property
    def dirty(self) -> bool:
        return self._cells_dirty or self._col_names_dirty or self._flags_dirty or self._name_dirty or self._parent_dirty or self._func_io_dirty

    @property
    def cells_dirty(self) -> bool:
        return self._cells_dirty

    @cells_dirty.setter
    def cells_dirty(self, v:bool) -> None:
        assert v
        self._cells_dirty = v
        self._last_mod = time.time()

    @property
    def col_names_dirty(self) -> bool:
        return self._col_names_dirty

    @col_names_dirty.setter
    def col_names_dirty(self, v:bool) -> None:
        assert v
        self._col_names_dirty = v
        self._last_mod = time.time()

    @property
    def name_dirty(self) -> bool:
        return self._name_dirty

    @name_dirty.setter
    def name_dirty(self, v:bool) -> None:
        assert v
        self._name_dirty = v
        self._last_mod = time.time()

    @property
    def flags_dirty(self) -> bool:
        return self._flags_dirty

    @flags_dirty.setter
    def flags_dirty(self, v:bool) -> None:
        assert v
        self._flags_dirty = v
        self._last_mod = time.time()

    @property
    def parent_dirty(self) -> bool:
        return self._parent_dirty

    @parent_dirty.setter
    def parent_dirty(self, v:bool) -> None:
        assert v
        self._parent_dirty = v
        self._last_mod = time.time()

    @property
    def func_io_dirty(self) -> bool:
        return self._func_io_dirty

    @func_io_dirty.setter
    def func_io_dirty(self, v:bool) -> None:
        assert v
        self._func_io_dirty = v
        self._last_mod = time.time()

    def as_data(self) -> SpreadSheetData:
        return dict(
            id = self.id,
            name = self.name,
            flags = self.flags,
            column_names = self.column_names,
            cells = self.cells,
            parent = self.parent,
            n_args = self.n_args,
            outx = self.outx,
            outy = self.outy,
        )

    def ncols(self) -> int:
        return len(self.column_names)

    def nrows(self) -> int:
        ncols = self.ncols()
        if not ncols:
            return 0
        return len(self.cells) // ncols

    def delete_column(self, col_idx:int) -> bool:
        if not (self.flags & SpreadSheetFlags.CAN_DEL_COL):
            return False
        if col_idx < 0: return False
        if self.ncols() <= 1: return False
        if col_idx >= self.ncols(): return False
        del self.cells[col_idx::self.ncols()]
        del self.column_names[col_idx]
        self.cells_dirty = True
        self.col_names_dirty = True
        return True

    def delete_row(self, row_idx:int) -> bool:
        if not (self.flags & SpreadSheetFlags.CAN_DEL_ROW):
            return False
        if row_idx < 0: return False
        if row_idx >= self.nrows(): return False
        ncols = self.ncols()
        idx = row_idx*ncols
        del self.cells[idx:idx+ncols]
        self.cells_dirty = True
        return True

    def rename_column(self, col_idx:int, name:str) -> bool:
        if col_idx < 0: return False
        if col_idx >= self.ncols(): return False
        self.column_names[col_idx] = name
        self.col_names_dirty = True
        return True

    def move_column(self, from_:int, to_:int) -> bool:
        if not (self.flags & SpreadSheetFlags.CAN_MOVE_COLUMNS):
            return False
        ncols = self.ncols()
        if from_ < 0 or from_ >= ncols: return False
        if to_ < 0 or to_ >= ncols: return False
        if from_ == to_: return False
        c = self.cells
        c[from_::ncols], c[to_::ncols] = c[to_::ncols], c[from_::ncols]
        cn = self.column_names
        cn[from_], cn[to_] = cn[to_], cn[from_]
        self.col_names_dirty = True
        self.cells_dirty = True
        return True

    def move_row(self, from_:int, to_:int) -> bool:
        if not (self.flags & SpreadSheetFlags.CAN_MOVE_ROWS):
            return False
        nrows = self.nrows()
        if from_ < 0 or from_ >= nrows: return False
        if to_ < 0 or to_ >= nrows: return False
        if from_ == to_: return False
        ncols = self.ncols()
        from_ *= ncols
        to_ *= ncols
        c = self.cells
        c[from_:from_+ncols], c[to_:to_+ncols] = c[to_:to_+ncols], c[from_:from_+ncols]
        self.cells_dirty = True
        return True

    def edit_cell(self, row_idx:int, col_idx:int, val:CellData) -> bool:
        # dlog('edit_cell: %r %r %r', row_idx, col_idx, val)
        # TODO: should this just forward to `edit_cells`? or maybe be deleted?
        if row_idx < 0: return False
        if col_idx < 0: return False
        if not (self.flags & SpreadSheetFlags.CAN_EDIT_CELLS):
            return False
        if col_idx >= self.ncols():
            return False
        if row_idx >= self.nrows():
            return False

        oldval = self.cells[row_idx * self.ncols()+col_idx]
        if (self.flags & SpreadSheetFlags.LOCKED_FORMULAS) and oldval[0] and oldval[0][0] == '=' and oldval[0] != val[0]:
            return False
        self.cells[row_idx*self.ncols()+col_idx] = val
        self.cells_dirty = True
        return True

    def edit_cells(self, row_idxes:list[int], col_idxes:list[int], vals:list[CellData]) -> bool:
        # dlog('edit_cells: %r %r %r', row_idxes, col_idxes, vals)
        if len(row_idxes) != len(col_idxes):
            return False
        if len(row_idxes) != len(vals):
            return False
        for row_idx, col_idx, val in zip(row_idxes, col_idxes, vals):
            if row_idx < 0: return False
            if col_idx < 0: return False
            if not (self.flags & SpreadSheetFlags.CAN_EDIT_CELLS):
                return False
            if col_idx >= self.ncols():
                return False
            if row_idx >= self.nrows():
                return False
            oldval = self.cells[row_idx * self.ncols()+col_idx]
            if (self.flags & SpreadSheetFlags.LOCKED_FORMULAS) and oldval[0] and oldval[0][0] == '=' and oldval[0] != val[0]:
                return False

        for row_idx, col_idx, val in zip(row_idxes, col_idxes, vals):
            self.cells[row_idx*self.ncols()+col_idx] = val

        self.cells_dirty = True
        return True

    def add_row(self, whence:int) -> bool:
        if not (self.flags & SpreadSheetFlags.CAN_ADD_ROW):
            return False
        if whence < 0: return False
        if whence > self.nrows(): return False
        begin = whence * self.ncols()
        self.cells[begin:begin] = [blank_cell() for _ in self.column_names]
        self.cells_dirty = True
        return True

    def add_column(self, whence:int) -> bool:
        if not (self.flags & SpreadSheetFlags.CAN_ADD_COL):
            return False
        if whence < 0: return False
        if whence > self.ncols(): return False
        old_cnl = self.ncols()
        nrows = self.nrows()
        if old_cnl == 0:
            if whence != 0: return False
            self.column_names.append('')
            self.col_names_dirty = True
            return True
        self.column_names.insert(whence, '')
        new_cnl = self.ncols()
        for row in range(nrows):
            self.cells.insert(whence+row*new_cnl, blank_cell())
        self.col_names_dirty = True
        self.cells_dirty = True
        return True

    def sort(self, idxes:list[int]) -> bool:
        if not (self.flags & SpreadSheetFlags.CAN_SORT_COLS):
            return False
        lcn = self.ncols()
        if lcn == 0:
            return False
        nrows = self.nrows()
        if len(idxes) != nrows: return False
        if sorted(idxes) != list(range(nrows)): return False
        cells = []
        for idx in idxes:
            cells.extend(self.cells[idx*lcn:idx*lcn+lcn])
        self.cells = cells
        self.cells_dirty = True
        return True

    def set_flags(self, flags:SpreadSheetFlags) -> bool:
        flags = (self.flags & ~EDITABLE_FLAGS) | (flags & EDITABLE_FLAGS)
        if flags == self.flags:
            return False
        self.flags = flags
        self.flags_dirty = True
        return True

    def set_name(self, name:str) -> bool:
        if not name: return False
        self.name = name
        self.name_dirty = True
        return True

    def set_parent(self, parent:int) -> bool:
        if self.parent == parent:
            return False
        if self.id == parent:
            return False
        if parent < 0:
            return False
        self.parent = parent
        self.parent_dirty = True
        return True

    def set_func_io(self, n_args:int, outx:int, outy:int) -> bool:
        if not valid_func_io(n_args, outx, outy, self.ncols(), self.nrows()):
            return False
        self.n_args = n_args
        self.outx = outx
        self.outy = outy
        self.func_io_dirty = True
        return True

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

# IDK how to express that first arg needs to be a SpreadSheet
METHODS:dict[SpreadSheetMsgType, Callable[..., bool]] = {
    SpreadSheetMsgType.DELETE_ROW: SpreadSheet.delete_row,
    SpreadSheetMsgType.DELETE_COL: SpreadSheet.delete_column,
    SpreadSheetMsgType.RENAME_COL: SpreadSheet.rename_column,
    SpreadSheetMsgType.MOVE_COL: SpreadSheet.move_column,
    SpreadSheetMsgType.MOVE_ROW: SpreadSheet.move_row,
    SpreadSheetMsgType.EDIT_CELL: SpreadSheet.edit_cell,
    SpreadSheetMsgType.ADD_ROW: SpreadSheet.add_row,
    SpreadSheetMsgType.ADD_COL: SpreadSheet.add_column,
    SpreadSheetMsgType.SORT: SpreadSheet.sort,
    SpreadSheetMsgType.FLAG: SpreadSheet.set_flags,
    SpreadSheetMsgType.NAME: SpreadSheet.set_name,
    SpreadSheetMsgType.PARENT: SpreadSheet.set_parent,
    SpreadSheetMsgType.FUNCTION_IO: SpreadSheet.set_func_io,
    SpreadSheetMsgType.EDIT_CELLS: SpreadSheet.edit_cells,
}

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

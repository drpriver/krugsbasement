from typing import List, Dict, Union, NamedTuple, Optional
from .persist import Persister, JsType
from enum import IntFlag
from . import db
import logging
logging.basicConfig(level=logging.INFO,format='[%(asctime)s][%(levelname)s] - %(funcName)s: %(message)s')

class NoteFlags(IntFlag):
    NONE = 0x0
    DELETED = 0x1


def load_notes(data:JsType) -> Dict[int, Dict[str, JsType]]:
    assert isinstance(data, list)
    result = {}
    for d in data:
        if not isinstance(d.get('flags'), int):
            d['flags'] = 0
        if not isinstance(d.get('title'), str):
            d['title'] = 'Untitled'
        if not isinstance(d.get('body'), str):
            d['body'] = ''
        if not isinstance(d.get('id'), int):
            continue
        id = d.pop('id')
        for extra in set(d) - {'flags', 'title', 'body'}:
            del d[extra]
        result[id] = d
    return result

def save_notes(notes:Dict[int, Dict[str, JsType]]) -> List[Dict[str, JsType]]:
    result = [] # type: List[Dict[str, JsType]]
    for note_id, note in notes.items():
        if note['flags'] & NoteFlags.DELETED: # type: ignore
            continue
        result.append({
            'id': note_id,
            **note,
        })
    return result

class NotesPersister(Persister[Dict[str, dict]]):
    def read_obj(self, obj):
        o = db.get_notes(self.campaign_id)
        return load_notes(o) if o is not None else obj
    def write_obj(self, obj):
        db.save_notes(self.campaign_id, save_notes(obj))
    def __init__(self, campaign:str, dont_persist=False):
        name = f'{campaign}/notes'
        self.campaign_id = db.lookup_campaign(campaign)
        assert self.campaign_id is not None
        super().__init__({}, name, dont_persist=dont_persist)

NOTES = {'':NotesPersister('', True).obj}

def new_note_request(room:str) -> int:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    if campaign not in NOTES:
        create_notes_for_room(room)
    notes = NOTES[campaign]
    if not notes:
        result = 1
    else:
        result = max(notes.keys())+1
    notes[result] = dict(
            flags = NoteFlags.NONE,
            title = 'Untitled',
            body = '')
    return result

def create_notes_for_room(room:str) -> None:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    if campaign in NOTES:
        return
    empty_notes = {} # type: Dict[int, Dict[str, JsType]]
    NOTES[campaign] = NotesPersister(campaign).obj

def get_notes_for_room(room:str) -> List[Dict[str, JsType]]:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    return save_notes(NOTES[campaign])

def get_note(room:str, note_id:int) -> Optional[dict]:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    if campaign not in NOTES:
        logging.error("Updating a note for a campaign that doesn't exist: %s", campaign)
        return None
    notes = NOTES[campaign]
    if note_id not in notes:
        logging.error("Updating a note that doesn't exist: %s (campaign: %s)", note_id, campaign)
        return None
    note = notes[note_id]
    return note

def note_update_title(room:str, note_id:int, title:str) -> None:
    note = get_note(room, note_id)
    if note is None:
        return
    note['title'] = title

def note_update_body(room:str, note_id:int, body:str) -> None:
    note = get_note(room, note_id)
    if note is None:
        return
    note['body'] = body

def note_delete(room:str, note_id:int) -> None:
    note = get_note(room, note_id)
    if note is None:
        return
    note['flags'] |= NoteFlags.DELETED

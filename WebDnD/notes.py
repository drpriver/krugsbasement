from typing import List, Dict, Union, Any, NamedTuple, Optional
from .persist import Persister, JsType
from enum import IntFlag
import logging
logging.basicConfig(level=logging.INFO,format='[%(asctime)s][%(levelname)s] - %(funcName)s: %(message)s')

class NoteFlags(IntFlag):
    NONE = 0x0
    DELETED = 0x1


def load_notes(data:JsType) -> Dict[int, Dict[str, Any]]:
    assert isinstance(data, list)
    result = {}
    for d in data:
        if not isinstance(d.get('flags'), int):
            d['flags'] = 0
        if not isinstance(d.get('title'), str):
            d['title'] = 'Untitled Note'
        if not isinstance(d.get('body'), str):
            d['body'] = ''
        if not isinstance(d.get('id'), int):
            continue
        for extra in set(d) - {'flags', 'title', 'body'}:
            del d[extra]
        id = d.pop('id')
        result[id] = d
    return result

def save_notes(notes:Dict[int, Dict[str, Any]]) -> JsType:
    result = []
    for note_id, note in notes.items():
        if note['flags'] & NoteFlags.DELETED:
            continue
        result.append({
            'id': note_id,
            **note,
            })
    return result

NOTES = {'/':{}} # type: Dict[str, Dict[int, Dict[str, Any]]]
NOTES['/'] = Persister(NOTES['/'], 'BadDb/notes.json', dont_persist=True, load_func=load_notes, save_func=save_notes).obj

def new_note_request(room:str) -> int:
    if room not in NOTES:
        create_notes_for_room(room)
    notes = NOTES[room]
    if not notes:
        result = 1
    else:
        result = max(notes.keys())+1
    notes[result] = dict(
            flags = NoteFlags.NONE,
            title = 'Untitled Note',
            body = '')
    return result

def create_notes_for_room(room:str) -> None:
    if room in NOTES:
        return
    NOTES[room] = Persister({}, 'BadDb'+room+'/notes.json', save_func=save_notes, load_func=load_notes).obj

def get_notes_for_room(room:str) -> Dict[int, Dict[str, Any]]:
    return save_notes(NOTES[room])

def get_note(room:str, note_id:int) -> Optional[dict]:
    if room not in NOTES:
        logging.error("Update a note for a room that doesn't exist: %s", room)
        return None
    notes = NOTES[room]
    if note_id not in notes:
        logging.error("Update a note that doesn't exist: %s (room: %s)", not_id, room)
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

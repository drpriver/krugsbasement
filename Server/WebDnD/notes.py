#
# Copyright © 2021-2023, David Priver
#

from typing import List, Dict, Union, NamedTuple, Optional
from .persist import JsType, RepeatTimer
from enum import IntFlag
from . import db
import logging
from .messages import Note, NOTEFLAGS
import atexit
import threading
logging.basicConfig(level=logging.INFO,format='[%(asctime)s][%(levelname)s] - %(funcName)s: %(message)s')

savequeue = set()
# I think you could elide this one as you would just save that
# note on the next tick.
savelock = threading.RLock()
# This prevents torn reads in the face of contention.
# GIL lets you elide a lot of your own locks, but the note
# could get edited in the middle of reading it and so you'll
# end up saving a note that was in a state that never existed.
noteslock = threading.RLock()


def queue_save(campaign_id:int, noteid:int) -> None:
    with savelock:
        savequeue.add((campaign_id, noteid))

def save_queued_notes() -> None:
    while True:
        with savelock:
            if not savequeue: break
            campaign_id, noteid = savequeue.pop()
        if campaign_id == 1: continue
        note = NOTES[campaign_id][noteid]
        with noteslock:
            title, body, flags, id, parent = note['title'], note['body'], note['flags'], note['id'], note['parent']
        db.save_note(campaign_id, title, body, flags, id, parent)
rt = RepeatTimer(60, save_queued_notes)
rt.start()
atexit.register(save_queued_notes)



def load_the_notes(campaign_id:int) -> Dict[int, Note]:
    notes = db.get_notes(campaign_id)
    return {n['id']:n for n in notes}

NOTES = {} # type: Dict[int, Dict[int, Note]]

def new_note_request(campaign:int, parent:int) -> int:
    assert campaign is not None
    with noteslock:
        if campaign not in NOTES:
            NOTES[campaign] = load_the_notes(campaign)
        notes = NOTES[campaign]
        if not notes:
            result = 1
        else:
            result = max(notes.keys())+1
        notes[result] = dict(
            flags = NOTEFLAGS.NONE,
            title = 'Untitled',
            body = '',
            id = result,
            parent = parent,
        )
    return result

def get_notes_for_room(campaign:int) -> List[Note]:
    assert campaign is not None
    with noteslock:
        if campaign not in NOTES:
            NOTES[campaign] = load_the_notes(campaign)
        notes = NOTES[campaign]
        return [n for n in notes.values() if not (n['flags'] & NOTEFLAGS.DELETED)]

def get_note(campaign:int, note_id:int) -> Optional[Note]:
    with noteslock:
        if campaign not in NOTES:
            logging.error("Updating a note for a campaign that doesn't exist: %r", campaign)
            return None
        notes = NOTES[campaign]
        if note_id not in notes:
            logging.error("Updating a note that doesn't exist: %r (campaign: %r)", note_id, campaign)
            return None
        note = notes[note_id]
        if note['flags'] & NOTEFLAGS.DELETED:
            logging.error("Getting deleted note for campaign %r: %r", campaign, note_id)
            return None
        return note

def note_update_title(campaign:int, note_id:int, title:str) -> None:
    note = get_note(campaign, note_id)
    if note is None:
        return
    with noteslock:
        note['title'] = title
    noteid = note['id']
    assert campaign is not None
    queue_save(campaign, noteid)
    # db.save_note(campaign_id, note['title'], note['body'], note['flags'], note['id'])

def note_update_body(campaign:int, note_id:int, body:str) -> None:
    note = get_note(campaign, note_id)
    if note is None:
        return
    with noteslock:
        note['body'] = body
    noteid = note['id']
    assert campaign is not None
    queue_save(campaign, noteid)
    # db.save_note(campaign_id, note['title'], note['body'], note['flags'], note['id'])

def note_update_parent(campaign:int, note_id:int, parent:int) -> None:
    note = get_note(campaign, note_id)
    if note is None:
        return
    with noteslock:
        note['parent'] = parent
    noteid = note['id']
    assert campaign is not None
    queue_save(campaign, noteid)


def note_delete(campaign:int, note_id:int) -> None:
    note = get_note(campaign, note_id)
    # logging.info('deleting note %r: %r', note_id, note)
    if note is None:
        return
    with noteslock:
        note['flags'] |= NOTEFLAGS.DELETED
    noteid = note['id']
    assert campaign is not None
    queue_save(campaign, noteid)

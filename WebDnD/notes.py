from typing import List, Dict, Union, NamedTuple, Optional
from .persist import Persister, JsType, RepeatTimer
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


def queue_save(campaign, campaign_id, noteid):
    with savelock:
        savequeue.add((campaign, campaign_id, noteid))

def save_queued_notes():
    while True:
        with savelock:
            if not savequeue: break
            campaign, campaign_id, noteid = savequeue.pop()
        note = NOTES[campaign][noteid]
        with noteslock:
            title, body, flags, id = note['title'], note['body'], note['flags'], note['id']
        db.save_note(campaign_id, title, body, flags, id)
rt = RepeatTimer(60, save_queued_notes)
rt.start()
atexit.register(save_queued_notes)



def load_the_notes(campaign_id:int) -> Dict[int, Note]:
    notes = db.get_notes(campaign_id)
    return {n['id']:n for n in notes}

NOTES = {} # type: Dict[str, Dict[int, Note]]

def new_note_request(room:str) -> int:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    campaign_id = db.lookup_campaign(campaign)
    assert campaign_id is not None
    with noteslock:
        if campaign not in NOTES:
            NOTES[campaign] = load_the_notes(campaign_id)
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
                )
    return result

def get_notes_for_room(room:str) -> List[Note]:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    campaign_id = db.lookup_campaign(campaign)
    assert campaign_id is not None
    with noteslock:
        if campaign not in NOTES:
            NOTES[campaign] = load_the_notes(campaign_id)
        notes = NOTES[campaign]
        return list(notes.values())

def get_note(room:str, note_id:int) -> Optional[Note]:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    with noteslock:
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
    with noteslock:
        note['title'] = title
    noteid = note['id']
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    campaign_id = db.lookup_campaign(campaign)
    assert campaign_id is not None
    queue_save(campaign, campaign_id, noteid)
    # db.save_note(campaign_id, note['title'], note['body'], note['flags'], note['id'])

def note_update_body(room:str, note_id:int, body:str) -> None:
    note = get_note(room, note_id)
    if note is None:
        return
    with noteslock:
        note['body'] = body
    noteid = note['id']
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    campaign_id = db.lookup_campaign(campaign)
    assert campaign_id is not None
    queue_save(campaign, campaign_id, noteid)
    # db.save_note(campaign_id, note['title'], note['body'], note['flags'], note['id'])

def note_delete(room:str, note_id:int) -> None:
    note = get_note(room, note_id)
    if note is None:
        return
    with noteslock:
        note['flags'] |= NOTEFLAGS.DELETED
    noteid = note['id']
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    campaign_id = db.lookup_campaign(campaign)
    assert campaign_id is not None
    queue_save(campaign, campaign_id, noteid)

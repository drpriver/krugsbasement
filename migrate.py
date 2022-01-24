import WebDnD.db as db
import json
import os

def loadit(*args):
    with open(os.path.join('BadDb', *args)) as fp:
        return json.load(fp)
def exists(*args):
    return os.path.isfile(os.path.join('BadDb', *args))

app = loadit('app.json')
campaigns = loadit('campaigns.json')
chats = {'':loadit('chat.json')}
maps = {'':loadit('canvas.json')}
tables = {}
notes = {}
assoc = [
    ('canvas.json', maps),
    ('chat.json', chats),
    ('notes.json', notes),
    ('tables.json', tables),
]
for campaign in campaigns:
    for frag, d in assoc:
        if exists('campaigns', campaign, frag):
            d[campaign] = loadit('campaigns', campaign, frag)

db.store_app_kv('session_id', app)
for campaign in [''] + campaigns:
    id = db.lookup_campaign(campaign)
    if id is None:
        id = db.create_campaign(campaign)
    if campaign in maps:
        db.save_maps(id, maps[campaign])
    if campaign in notes:
        db.save_notes(id, notes[campaign])
    if campaign in chats:
        db.save_chat(id, chats[campaign])
    if campaign in tables:
        db.save_rolltable(id, tables[campaign])

print(len(db.get_chat(db.lookup_campaign('horror_on_the_moors'))))
# print(*db.get_chat(db.lookup_campaign('horror_on_the_moors')), sep='\n')

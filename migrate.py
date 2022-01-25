import WebDnD.db as db
from WebDnD.messages import CANVASTYPE
import json
import os

def loadit(*args):
    with open(os.path.join('BadDb', *args)) as fp:
        return json.load(fp)
def exists(*args):
    return os.path.isfile(os.path.join('BadDb', *args))

def arrayify(objects):
    result = []
    def get(*args):
        try:
            obj.extend([o[a] for a in args])
        except Exception as e:
            print('------->', e)
    for o in objects:
        t = o['type']
        obj = [o['type'], o['id'], o['base_x'], o['base_y'], o['flags']]
        if t == CANVASTYPE.FREEHAND_LINE:
            get('color', 'points', 'thickness')
        elif t == CANVASTYPE.GRID_LINE:
            get('color', 'points')
        elif t == CANVASTYPE.RECT:
            get('color', 'width', 'height')
        elif t == CANVASTYPE.FILLED_RECT:
            get('color', 'color2', 'width', 'height')
        elif t == CANVASTYPE.GRID_RECT:
            get('color', 'width', 'height')
        elif t == CANVASTYPE.ELLIPSE:
            get('color', 'color2', 'width', 'height', 'variant')
        elif t == CANVASTYPE.IMAGE:
            get('width', 'height', 'url')
        elif t == CANVASTYPE.TEXT:
            get('text', 'size')
            alignment = o.get('alignment', 1)
            obj.append(alignment)
        elif t == CANVASTYPE.EZ_TOKEN:
            get('text', 'color', 'width',  'height', 'statusflags')
        elif t == CANVASTYPE.IMG_TOKEN:
            get('url', 'width', 'height', 'statusflags')
        elif t == CANVASTYPE.DOOR:
            get('doortype', 'color', 'width', 'orientation')
        elif t == CANVASTYPE.STAIRS:
            get('width', 'height', 'rotation')
        elif t == CANVASTYPE.MEASURE:
            continue
        elif t == CANVASTYPE.FIXTURE:
            get('width', 'height', 'ftype')
        elif t == CANVASTYPE.FILLED_TILE:
            get('color')
            size = o.get('size', 1)
            obj.append(size)
        elif t == CANVASTYPE.TERRAIN_TILE:
            get('terrain_id')
        elif t == CANVASTYPE.ICON_TILE:
            get('terrainicon_id')
        else:
            raise AssertionError
        result.append(obj)
    return result # type: ignore


def load_canvas(data):
    objid = 1
    for d in data:
        if 'map_name' not in d:
            d['map_name'] = 'Untitled'
        if d['objects'] and isinstance(d['objects'][0], dict):
            d['objects'] = arrayify(d['objects'])
        d['objects'] = [o for o in d['objects'] if o[0] != CANVASTYPE.MEASURE]
        for o in d['objects']:
            o[1] = objid
            objid += 1
            if o[0] == CANVASTYPE.TEXT:
                if len(o) != 9:
                    o.append(-1)
    return data

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

for campaign in [''] + campaigns:
    id = db.lookup_campaign(campaign)
    if id is None:
        id = db.create_campaign(campaign)
    db.store_campaign_kv(id, 'session_id', app)
    if campaign in maps:
        for map in load_canvas(maps[campaign]):
            if 'grid_type' not in map:
                map['grid_type'] = 0
            db.save_map(id, **map)
    if campaign in notes:
        for note in notes[campaign]:
            db.save_note(id, note['title'], note['body'], note['flags'], note['id'])
    if campaign in chats:
        for chat in chats[campaign]:
            db.save_chat_msg(id, chat[0], chat[1], chat[2])
    if campaign in tables:
        db.save_rolltable(id, tables[campaign])

# print(len(db.get_chat(db.lookup_campaign('horror_on_the_moors'))))
# print(*db.get_chat(db.lookup_campaign('horror_on_the_moors')), sep='\n')

from flask import Flask, jsonify, request, Response, send_from_directory, session, abort
from flask_socketio import SocketIO, emit, join_room
from .logs import logging
from . import chat
from . import canvas
from . import notes
from .persist import Persister
from. import appconfig
import os
import logging

from typing import List, Dict, Optional, Set, Union

app = Flask('WebDnd')
# app.config['SECRET_KEY'] = 'secret!'
if appconfig.DEV:
    socketio = SocketIO(app, logger=False)
else:
    socketio = SocketIO(app, logger=False, cors_allowed_origins="https://krugsbasement.com")

@socketio.on('chat-input')
def chat_input(data:Dict[str, str]) -> None:
    room = get_room(request)
    if not data:
        return
    responses = chat.handle_input(room, data['text'], data['chatname'])
    if responses:
        emit('chat-msg', responses, broadcast=True, to=room)

def save_session_id(unused) -> int:
    return session_id

session_id = Persister(0, 'BadDb/app.json', save_func=save_session_id).obj

sid_to_room = {} # type: Dict[str, str]
def get_room(req) -> str:
    return sid_to_room[req.sid]
def record_room(req, room:str) -> None:
    sid_to_room[req.sid] = room
ALLOWED_CAMPAIGNS:Set[str] = set()
ALLOWED_CAMPAIGNS = Persister(ALLOWED_CAMPAIGNS, 'BadDb/campaigns.json', save_func=list, load_func=set).obj # type: ignore

def get_token_paths():
    with open('token-list.txt', 'r') as fp:
        tokens = [l.strip() for l in fp if l.strip()]
    return tokens

TOKEN_PATH_LIST = get_token_paths()

@socketio.on('connect')
def handle_connection() -> None:
    global session_id
    session_id += 1
    emit('session-id', session_id)
    emit('token-paths', TOKEN_PATH_LIST)

@socketio.on('join')
def join(room:str) -> None:
    record_room(request, room)
    logging.info("Someone joining room: '%s'", room);
    join_room(room)
    path = 'BadDb' + room
    os.makedirs(path, exist_ok=True)
    chat.create_chat(room)
    canvas.create_maps(room)
    notes.create_notes_for_room(room)

@socketio.on('post-join')
def post_join():
    room = get_room(request)
    emit('canvas-clear')
    emit('chat-clear')
    emit('chat-create', chat.get_history(room))
    emit('canvas-initialize-maps', canvas.get_state(room))
    emit('notes-initialize', notes.get_notes_for_room(room))

@socketio.on('canvas-create-objects')
def handle_canvas_create(data:dict) -> None:
    room = get_room(request)
    response = canvas.handle_create(room, data)
    if response:
        emit('canvas-create-objects', response, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-delete')
def handle_canvas_delete(data:dict) -> None:
    room = get_room(request)
    response = canvas.handle_delete(room, data)
    if response:
        emit('canvas-delete', response, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-update')
def handle_canvas_update(data:dict) -> None:
    room = get_room(request)
    response = canvas.handle_update(room, data)
    if response:
        emit('canvas-update', response, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-gather')
def canvas_gather(where:Dict[str, int]) -> None:
    room = get_room(request)
    try:
        where = {'x':int(where['x']), 'y':int(where['y']), 'map_id':where['map_id']}
    except:
        pass
    else:
        emit('canvas-gather', where, broadcast=True, to=room)

@socketio.on('canvas-create-map')
def canvas_create_map(data:int) -> None:
    room = get_room(request)
    canvas.create_map(room, data)
    emit('canvas-create-map', data, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-ping')
def canvas_ping(data) -> None:
    room = get_room(request)
    emit('canvas-ping', data, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-name-map')
def canvas_name_map(data) -> None:
    room = get_room(request)
    canvas.name_map(room, **data)
    emit('canvas-name-map', data, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-new-map-request')
def new_map_request(data) -> None:
    map_name:str = data['name']
    grid_type: int = data['grid_type']
    room = get_room(request)
    new_map_id = canvas.new_map_request(room, map_name, grid_type)
    emit('canvas-create-map', new_map_id, broadcast=True, include_self=True, to=room)
    emit('canvas-name-map', {'map_id':new_map_id, 'map_name':map_name}, broadcast=True, include_self=True, to=room)
    emit('canvas-grid-type', {'map_id':new_map_id, 'grid_type':grid_type}, broadcast=True, include_self=True, to=room)

@socketio.on('canvas-grid-type')
def change_grid_type(data) -> None:
    map_id = data['map_id']
    gt = data['grid_type']
    room = get_room(request)
    canvas.change_grid_type(room, map_id, gt)
    emit('canvas-grid-type', {'map_id':map_id, 'grid_type':gt}, broadcast=True, include_self=True, to=room)

@socketio.on('canvas-grid-numbered')
def change_grid_numbered(data) -> None:
    map_id = data['map_id']
    numbered = data['numbered']
    room = get_room(request)
    canvas.set_numbered(room, map_id, numbered)
    emit('canvas-grid-numbered', {'map_id':map_id, 'numbered':numbered}, broadcast=True, include_self=True, to=room)


@socketio.on('canvas-delete-map-request')
def delete_map_request(map_id:int) -> None:
    room = get_room(request)
    was_deleted = canvas.delete_map(room, map_id)
    if was_deleted:
        emit('canvas-delete-map', map_id, broadcast=True, include_self=True, to=room)

@socketio.on('new-note-request')
def new_note_request() -> int:
    room = get_room(request)
    note_id = notes.new_note_request(room)
    logging.info('new note: %d', note_id)
    emit('new-note', note_id, broadcast=True, include_self=False, to=room)
    return note_id

@socketio.on('note-update-title')
def note_update_title(data) -> None:
    room = get_room(request)
    notes.note_update_title(room, data['note_id'], data['title'])
    emit('note-update-title', data, broadcast=True, include_self=False, to=room)

@socketio.on('note-update-body')
def note_update_body(data) -> None:
    room = get_room(request)
    notes.note_update_body(room, data['note_id'], data['body'])
    emit('note-update-body', data, broadcast=True, include_self=False, to=room)

@socketio.on('delete-note-request')
def not_delete(note_id:int) -> None:
    room = get_room(request)
    notes.note_delete(room, note_id)
    emit('note-delete', note_id, broadcast=True, include_self=True, to=room)
try:
    SCREEN: Optional[str] = open('screen.html').read()
except:
    SCREEN = None
def get_html() -> str:
    if appconfig.DEV or SCREEN is None:
        import pydndc
        try:
            html, _ = pydndc.htmlgen(open('screen.dnd').read())
        except:
            return ''
    else:
        html = SCREEN
    return html

@app.route('/')
def index() -> str:
    return get_html()
@app.route('/campaigns/<campaign>')
def get_campaign(campaign:str) -> str:
    if campaign not in ALLOWED_CAMPAIGNS:
        abort(404)
    return get_html()

if appconfig.DEV:
    @app.route('/imgs/<img>')
    def get_img(img:str):
        return send_from_directory('imgs', img)
    @app.route('/tokens/<token>')
    def get_token(token:str):
        return send_from_directory('tokens', token)
    @app.route('/icons/<icon>')
    def get_icon(icon:str):
        return send_from_directory('icons', icon)
    @app.route('/tiles/<tile>')
    def get_tile(tile:str):
        return send_from_directory('tiles', tile)
    @app.route('/favicon.ico')
    def get_favicon():
        return send_from_directory('.', 'favicon.ico')

@app.route('/state', methods=['GET'])
@app.route('/campaigns/<campaign>/state', methods=['GET', 'POST', 'DELETE'])
def app_state(campaign:str='/') -> str:
    logging.info('request: %s', request)
    logging.info('campaign: %s',  campaign)
    query = f'/campaigns/{campaign}' if campaign != '/' else '/'
    if request.method == 'GET':
        args = request.args
        state = {
            'chat':chat.get_history(query),
            'canvas': canvas.get_state(query),
            'app':{'session_id':session_id},
            }
        if 'which' in args:
            try:
                substate = state[args['which']]
                return jsonify(substate)
            except:
                abort(404)
        return jsonify(state)
    elif request.method == 'POST':
        abort(404)
        # data should be in request.json?
    else:
        abort(404)

if __name__ == '__main__':
    if appconfig.DEV:
        socketio.run(app, host="0.0.0.0")
    else:
        socketio.run(app)

from flask import Flask, jsonify, request, Response, send_from_directory, session, abort
from flask_socketio import SocketIO, emit, join_room
from . import chat
from . import canvas
from .persist import Persister
from. import appconfig
import random

from typing import List, Dict, Optional, Set

app = Flask('WebDnd')
# app.config['SECRET_KEY'] = 'secret!'
if appconfig.DEV:
    socketio = SocketIO(app, logger=True)
else:
    socketio = SocketIO(app, logger=True, cors_allowed_origins="https://krugsbasement.com")

@socketio.on('chat-input')
def chat_input(data:Dict[str, str]) -> None:
    if not data:
        return
    responses = chat.handle_input(data['text'], data['chatname'])
    if responses:
        emit('chat-msg', responses, broadcast=True)

def save_session_id(unused) -> int:
    return session_id

session_id = Persister(0, 'BadDb/app.json', save_func=save_session_id).obj

sid_to_room = {}
ALLOWED_CAMPAIGNS:Set[str] = set()
ALLOWED_CAMPAIGNS = Persister(ALLOWED_CAMPAIGNS, 'BadDB/campaigns.json', save_func=list, load_func=set).obj # type: ignore
@socketio.on('connect')
def handle_connection() -> None:
    global session_id
    session_id += 1
    emit('session-id', session_id)

@socketio.on('join')
def join(room:str) -> None:
    sid_to_room[request.sid] = room  # type: ignore
    join_room(room)
    chat.create_chat(room)
    canvas.create_maps(room)
    emit('canvas-clear')
    emit('chat-clear')
    emit('chat-create', chat.get_history(room))
    emit('canvas-initialize-maps', canvas.get_state(room))

@socketio.on('canvas-create-objects')
def handle_canvas_create(data:dict) -> None:
    room = sid_to_room[request.sid]  # type: ignore
    response = canvas.handle_create(room, data)
    if response:
        emit('canvas-create-objects', response, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-delete')
def handle_canvas_delete(data:dict) -> None:
    room = sid_to_room[request.sid]  # type: ignore
    response = canvas.handle_delete(room, data)
    if response:
        emit('canvas-delete', response, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-update')
def handle_canvas_update(data:dict) -> None:
    room = sid_to_room[request.sid]  # type: ignore
    response = canvas.handle_update(room, data)
    if response:
        emit('canvas-update', response, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-gather')
def canvas_gather(where:Dict[str, int]) -> None:
    room = sid_to_room[request.sid]  # type: ignore
    try:
        where = {'x':int(where['x']), 'y':int(where['y']), 'map_id':where['map_id']}
    except:
        pass
    else:
        emit('canvas-gather', where, broadcast=True, to=room)

@socketio.on('canvas-create-map')
def canvas_create_map(data:int) -> None:
    room = sid_to_room[request.sid]  # type: ignore
    canvas.create_map(room, data)
    emit('canvas-create-map', data, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-ping')
def canvas_ping(data) -> None:
    room = sid_to_room[request.sid]  # type: ignore
    emit('canvas-ping', data, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-name-map')
def canvas_name_map(data) -> None:
    room = sid_to_room[request.sid]  # type: ignore
    canvas.name_map(room, **data)
    emit('canvas-name-map', data, broadcast=True, include_self=False, to=room)

@socketio.on('canvas-new-map-request')
def new_map_request(map_name:str) -> None:
    room = sid_to_room[request.sid]  # type: ignore
    new_map_id = canvas.new_map_request(room, map_name)
    emit('canvas-create-map', new_map_id, broadcast=True, include_self=True, to=room)
    emit('canvas-name-map', {'map_id':new_map_id, 'map_name':map_name}, broadcast=True, include_self=True, to=room)

@socketio.on('canvas-delete-map-request')
def delete_map_request(map_id:int) -> None:
    room = sid_to_room[request.sid]  # type: ignore
    was_deleted = canvas.delete_map(room, map_id)
    if was_deleted:
        emit('canvas-delete-map', map_id, broadcast=True, include_self=True, to=room)

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

@app.route('/state', methods=['GET', 'POST', 'DELETE'])
def app_state():
    if request.method == 'GET':
        args = request.args
        state = {'chat':chat.get_history(), 'canvas':canvas.get_state('/'), 'app':{'session_id':session_id}}
        if 'which' in args:
            try:
                state = state[args['which']]
            except:
                return jsonify({})
        return jsonify(state)
    else:
        return ''

if __name__ == '__main__':
    if appconfig.DEV:
        socketio.run(app, host="0.0.0.0")
    else:
        socketio.run(app)

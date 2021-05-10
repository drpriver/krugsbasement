from flask import Flask, jsonify, request, Response, send_from_directory
from flask_socketio import SocketIO, emit
from . import chat
from . import canvas
from .persist import Persister
from. import appconfig
import random

from typing import List, Dict

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

@socketio.on('connect')
def handle_connection() -> None:
    global session_id
    session_id += 1
    emit('session-id', session_id)
    emit('canvas-clear')
    emit('chat-clear')
    emit('chat-create', chat.get_history())
    emit('canvas-initialize-maps', canvas.get_state())

@socketio.on('canvas-create-objects')
def handle_canvas_create(data:dict) -> None:
    response = canvas.handle_create(data)
    if response:
        emit('canvas-create-objects', response, broadcast=True, include_self=False)

@socketio.on('canvas-delete')
def handle_canvas_delete(data:dict) -> None:
    response = canvas.handle_delete(data)
    if response:
        emit('canvas-delete', response, broadcast=True, include_self=False)

@socketio.on('canvas-update')
def handle_canvas_update(data:dict) -> None:
    response = canvas.handle_update(data)
    if response:
        emit('canvas-update', response, broadcast=True, include_self=False)

@socketio.on('canvas-gather')
def canvas_gather(where:Dict[str, int]) -> None:
    try:
        where = {'x':int(where['x']), 'y':int(where['y']), 'map_id':where['map_id']}
    except:
        pass
    else:
        emit('canvas-gather', where, broadcast=True)

@socketio.on('canvas-create-map')
def canvas_create_map(data:int) -> None:
    canvas.create_map(data)
    emit('canvas-create-map', data, broadcast=True, include_self=False)

@socketio.on('canvas-ping')
def canvas_ping(data) -> None:
    emit('canvas-ping', data, broadcast=True, include_self=False)

@socketio.on('canvas-name-map')
def canvas_ping(data) -> None:
    canvas.name_map(**data)
    emit('canvas-name-map', data, broadcast=True, include_self=False)

@socketio.on('canvas-new-map-request')
def new_map_request(map_name:str) -> None:
    new_map_id = canvas.new_map_request(map_name)
    emit('canvas-create-map', new_map_id, broadcast=True, include_self=True)
    emit('canvas-name-map', {'map_id':new_map_id, 'map_name':map_name}, broadcast=True, include_self=True)

@socketio.on('canvas-delete-map-request')
def delete_map_request(map_id:int) -> None:
    was_deleted = canvas.delete_map(map_id)
    if was_deleted:
        emit('canvas-delete-map', map_id, broadcast=True, include_self=True)

try:
    SCREEN = open('screen.html').read()
except:
    SCREEN = None
@app.route('/')
def index() -> str:
    if appconfig.DEV or SCREEN is None:
        import pydndc
        try:
            html, _ = pydndc.htmlgen(open('screen.dnd').read())
        except:
            return ''
    else:
        html = SCREEN
    return html

@app.route('/state', methods=['GET', 'POST', 'DELETE'])
def app_state():
    if request.method == 'GET':
        args = request.args
        state = {'chat':chat.get_history(), 'canvas':canvas.get_state(), 'app':{'session_id':session_id}}
        if 'which' in args:
            try:
                state = state[args['which']]
            except:
                return jsonify({})
        return jsonify(state)
    elif request.method == 'DELETE':
        return '' # disable this functionality for now
        args = request.args
        if 'which' in args:
            which = args['which']
            if which == 'canvas':
                socketio.emit('canvas-clear', broadcast=True)
                canvas.clear()
                return ''
            if which == 'chat':
                socketio.emit('chat-clear', broadcast=True)
                chat.clear()
                return ''
        socketio.emit('canvas-clear', broadcast=True)
        socketio.emit('chat-clear', broadcast=True)
        canvas.clear()
        chat.clear()
        return ''
    elif request.method == 'POST':
        return '' # disable this functionality for now
        newstate = request.get_json()
        args = request.args
        if 'which' in args:
            which = args['which']
            if which == 'canvas':
                canvas.set_state(newstate)
                socketio.emit('canvas-clear', broadcast=True)
                socketio.emit('canvas-create-objects', newstate['canvas'])
                return ''
            if which == 'chat':
                chat.set_state(newstate)
                socketio.emit('chat-clear', broadcast=True)
                socketio.emit('chat-create', newstate['chat'])
                return ''
        chat.set_state(newstate['chat'])
        canvas.set_state(newstate['canvas'])
        socketio.emit('canvas-clear', broadcast=True)
        socketio.emit('chat-clear', broadcast=True)
        socketio.emit('canvas-create-objects', newstate['canvas'])
        socketio.emit('chat-create', newstate['chat'])
        return ''

if __name__ == '__main__':
    if appconfig.DEV:
        socketio.run(app, host="0.0.0.0")
    else:
        socketio.run(app)

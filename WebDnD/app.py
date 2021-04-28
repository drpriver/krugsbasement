from flask import Flask, jsonify, request, Response, send_from_directory
from flask_socketio import SocketIO, emit
from . import chat
from . import canvas
from .persist import Persister
import random

import pydndc
from typing import List, Dict

app = Flask('WebDnd')
# app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, logger=True)

@socketio.on('chat-input')
def chat_input(data:str) -> None:
    if not data:
        return
    responses = chat.handle_input(data)
    if responses:
        emit('chat-msg', responses, broadcast=True)

def save_session_id(unused) -> int:
    return session_id

session_id = Persister(0, 'BadDb/app.json', save_func=save_session_id).obj

@socketio.on('connect')
def handle_connection() -> None:
    emit('chat-create', chat.get_history())
    emit('canvas-create', canvas.get_objects())
    global session_id
    session_id += 1
    emit('session-id', session_id)

@socketio.on('canvas-create')
def handle_canvas_create(data:dict) -> None:
    responses = canvas.handle_create(data)
    if responses:
        emit('canvas-create', responses, broadcast=True)

@socketio.on('canvas-delete')
def handle_canvas_delete(data:List[int]) -> None:
    responses = canvas.handle_delete(data)
    if responses:
        emit('canvas-delete', responses, broadcast=True)

@socketio.on('canvas-update')
def handle_canvas_update(data:List[dict]) -> None:
    responses = canvas.handle_update(data)
    if responses:
        emit('canvas-update', responses, broadcast=True)

@socketio.on('canvas-gather')
def canvas_gather(where:Dict[str, int]) -> None:
    try:
        where = {'x':int(where['x']), 'y':int(where['y'])}
    except:
        pass
    else:
        emit('canvas-gather', where, broadcast=True)

def error_reporter(message_type:int, filename:str, line:int, col:int, message:str):
    print(f'{line+1}:{col+1}: {message}')

@app.route('/')
def index() -> str:
    try:
        html, _ = pydndc.htmlgen(open('screen.dnd').read(), error_reporter=error_reporter)
    except:
        return ''
    else:
        return html
@app.route('/imgs/<path:filename>')
def imgs(filename):
    return send_from_directory('./imgs', filename)

@app.route('/state', methods=['GET', 'POST'])
def get_app_state():
    if request.method == 'GET':
        state = {'chat':chat.get_history(), 'canvas':canvas.get_live_objects(), 'app':{'session_id':session_id}}
        return jsonify(state)
    else:
        newstate = request.get_json()
        print(f'{newstate=}')
        return {}

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0")

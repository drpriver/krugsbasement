from flask import Flask
from flask_socketio import SocketIO, send, emit
import WebDnD.chat
import WebDnD.canvas
import random
import pickle

import pydndc

app = Flask('WebDnd')
# app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)


@socketio.on('chat-input')
def chat_input(data:str):
    if not data:
        return
    responses = WebDnD.chat.handle_input(data)
    if responses:
        emit('chat-msg', responses, broadcast=True)

session_id = 0
try:
    with open('BadDb/session_id.pickle', 'rb') as fp:
        session_id = pickle.load(fp)
except Exception as e:
    print(e)
    pass
import atexit
import os
def save_session_id():
    try:
        with open('BadDb/session_id.pickle_', 'wb') as fp:
            pickle.dump(session_id, fp)
        os.rename('BadDb/session_id.pickle_', 'BadDb/session_id.pickle')
    except Exception as e:
        print(e)
atexit.register(save_session_id)
@socketio.on('connect')
def handle_connection():
    emit('chat-msg', WebDnD.chat.get_history())
    emit('canvas-create', WebDnD.canvas.get_live_objects())
    global session_id
    session_id += 1
    emit('session-id', session_id)

@socketio.on('canvas-create')
def handle_canvas_create(data):
    assert data
    responses = WebDnD.canvas.handle_create(data)
    if responses:
        emit('canvas-create', responses, broadcast=True)

@socketio.on('canvas-delete')
def handle_canvas_delete(data):
    responses = WebDnD.canvas.handle_delete(data)
    if responses:
        emit('canvas-delete', responses, broadcast=True)

@socketio.on('canvas-update')
def handle_canvas_udpate(data):
    responses = WebDnD.canvas.handle_update(data)
    if responses:
        emit('canvas-update', responses, broadcast=True)
@socketio.on('canvas-gather')
def canvas_gather(where):
    emit('canvas-gather', where, broadcast=True)

@app.route('/')
def index():
    html, _ = pydndc.htmlgen(open('screen.dnd').read())
    return html

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0")


from flask import Flask
from flask_socketio import SocketIO, send, emit
import WebDnD.chat
import WebDnD.canvas

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
@socketio.on('connect')
def handle_connection():
    emit('chat-msg', WebDnD.chat.get_history())
    emit('canvas-create', WebDnD.canvas.get_live_objects())
    global session_id
    session_id += 1
    emit('session-id', session_id)

@socketio.on('canvas-create')
def handle_canvas_create(data):
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

@app.route('/')
def index():
    html, _ = pydndc.htmlgen(open('screen.dnd').read())
    return html

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0")


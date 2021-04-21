from flask import Flask
from flask_socketio import SocketIO, send, emit
import WebDnD.chat

import pydndc

app = Flask('WebDnd')
# app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)


def report_dndc_error(error_type:int, filename:str, row:int, col:int, message:str) -> None:
    import sys
    print(f'{error_type=}', f'{filename=}', f'{row=}', f'{col=}', f'{message=}', file=sys.stderr)

@socketio.on('my event')
def handle_message(data):
    print('received message: ', data)

@socketio.on('chat-input')
def chat_input(data:str):
    if not data:
        return
    responses = WebDnD.chat.handle_input(data)
    emit('chat-msg', responses, broadcast=True)

@socketio.on('connect')
def handle_connection():
    emit('chat-msg', WebDnD.chat.get_history())

@socketio.on('canvas-object')
def handle_canvas_object(data):
    emit('canvas-object-publish', data, broadcast=True, include_self=True)

canvas_obj_id = 0
@socketio.on('get-canv-obj-id')
def get_canv_obj_id():
    global canvas_obj_id
    canvas_obj_id += 1
    return canvas_obj_id

@app.route('/')
def index():
    html, _ = pydndc.htmlgen(open('screen.dnd').read(), error_reporter=report_dndc_error)
    return html

if __name__ == '__main__':
    socketio.run(app, host="0.0.0.0")


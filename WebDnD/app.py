from flask import Flask, jsonify, request, Response, send_from_directory, session, abort
from flask_socketio import SocketIO, emit, join_room
from .logs import logging
from . import chat
from . import canvas
from . import notes
from .persist import Persister, RepeatTimer
from. import appconfig
import os
import logging
from .messages import FromClient, ToClient, ChatCommandMessage, CreateObjectMessage, CanvasUpdateMessage, CanvasDeleteMessage, NameMapMessage, NewMapRequest, CanvasGridTypeMsg, CanvasGridNumberedMsg, RollTable, NoteUpdateBody, NoteUpdateTitle, GatherMessage
from .validator import validate, register_list

from typing import List, Dict, Optional, Set, Union

app = Flask('WebDnd')
# app.config['SECRET_KEY'] = 'secret!'
if appconfig.DEV:
    socketio = SocketIO(app, logger=False)
else:
    socketio = SocketIO(app, logger=False, cors_allowed_origins="https://krugsbasement.com")

@socketio.on(FromClient.CHAT_STRUCTURED_INPUT)
def chat_structured_input(data:ChatCommandMessage):
    data = validate('ChatCommandMessage', data)
    room = get_room(request)
    responses = chat.handle_structured_input(room, data['chatname'], data['commands'], test=False)
    if responses:
        emit(ToClient.CHAT_STRUCTURED_MSG, responses, broadcast=True, to=room)

@socketio.on(FromClient.CHAT_TEST_STRUCTURED_INPUT)
def chat_test_structured_input(data:ChatCommandMessage):
    data = validate('ChatCommandMessage', data)
    room = get_room(request)
    if not data:
        return
    responses = chat.handle_structured_input(room, data['chatname'], data['commands'], test=True)
    return responses



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

@socketio.on(FromClient.CONNECT)
def handle_connection() -> None:
    global session_id
    session_id += 1
    emit(ToClient.SESSION_ID, session_id)
    emit(ToClient.TOKEN_PATHS, TOKEN_PATH_LIST)

@socketio.on(FromClient.JOIN)
def join(room:str) -> None:
    record_room(request, room)
    logging.info("Someone joining room: '%s'", room);
    join_room(room)
    path = 'BadDb' + room
    os.makedirs(path, exist_ok=True)
    chat.create_chat(room)
    canvas.create_maps(room)
    notes.create_notes_for_room(room)

@socketio.on(FromClient.POST_JOIN)
def post_join():
    room = get_room(request)
    emit(ToClient.CHAT_CLEAR)
    emit(ToClient.CHAT_CREATE, chat.get_history(room))
    emit(ToClient.CANVAS_INITIALIZE_MAPS, canvas.get_state(room))
    emit(ToClient.NOTES_INITIALIZE, notes.get_notes_for_room(room))

@socketio.on(FromClient.CANVAS_CREATE_OBJECTS)
def handle_canvas_create(data:CreateObjectMessage) -> None:
    data = validate('CreateObjectMessage', data)
    room = get_room(request)
    response = canvas.handle_create(room, data)
    if response:
        emit(ToClient.CANVAS_CREATE_OBJECTS, response, broadcast=True, include_self=False, to=room)

@socketio.on(FromClient.CANVAS_DELETE)
def handle_canvas_delete(data:CanvasDeleteMessage) -> None:
    data = validate('CanvasDeleteMessage', data)
    room = get_room(request)
    response = canvas.handle_delete(room, data)
    if response:
        emit(ToClient.CANVAS_DELETE, response, broadcast=True, include_self=False, to=room) # type: ignore

@socketio.on(FromClient.CANVAS_UPDATE)
def handle_canvas_update(data:CanvasUpdateMessage) -> None:
    data = validate('CanvasUpdateMessage', data)
    room = get_room(request)
    response = canvas.handle_update(room, data)
    if response:
        emit(ToClient.CANVAS_UPDATE, response, broadcast=True, include_self=False, to=room) # type: ignore

@socketio.on(FromClient.CANVAS_GATHER)
def canvas_gather(where:GatherMessage) -> None:
    where = validate('GatherMessage', where)
    room = get_room(request)
    emit(ToClient.CANVAS_GATHER, where, broadcast=True, to=room)

@socketio.on(FromClient.CANVAS_BATTLE)
def canvas_battle(where:GatherMessage) -> None:
    where = validate('GatherMessage', where)
    room = get_room(request)
    emit(ToClient.CANVAS_BATTLE, where, broadcast=True, to=room)

@socketio.on(FromClient.CANVAS_DUNGEON_MODE)
def canvas_dungeon_mode() -> None:
    room = get_room(request)
    emit(ToClient.CANVAS_DUNGEON_MODE, broadcast=True, to=room)


@socketio.on(FromClient.CANVAS_CREATE_MAP)
def canvas_create_map(data:int) -> None:
    assert isinstance(data, int)
    room = get_room(request)
    canvas.create_map(room, data)
    emit(ToClient.CANVAS_CREATE_MAP, data, broadcast=True, include_self=False, to=room)

@socketio.on(FromClient.CANVAS_PING)
def canvas_ping(data) -> None:
    room = get_room(request)
    emit(ToClient.CANVAS_PING, data, broadcast=True, include_self=False, to=room)

@socketio.on(FromClient.CANVAS_NAME_MAP)
def canvas_name_map(data:NameMapMessage) -> None:
    data = validate('NameMapMessage', data)
    room = get_room(request)
    canvas.name_map(room, **data)
    emit(ToClient.CANVAS_NAME_MAP, data, broadcast=True, include_self=False, to=room) # type: ignore

@socketio.on(FromClient.CANVAS_NEW_MAP_REQUEST)
def new_map_request(data:NewMapRequest) -> None:
    data = validate('NewMapRequest', data)
    map_name:str = data['name']
    grid_type = data['grid_type']
    room = get_room(request)
    new_map_id = canvas.new_map_request(room, map_name, grid_type)
    logging.info('new map: %d for room "%s", with name: "%s"', new_map_id, room, map_name)
    emit(ToClient.CANVAS_CREATE_MAP, new_map_id, broadcast=True, include_self=True, to=room)
    emit(ToClient.CANVAS_NAME_MAP, {'map_id':new_map_id, 'map_name':map_name}, broadcast=True, include_self=True, to=room)
    emit(ToClient.CANVAS_GRID_TYPE, {'map_id':new_map_id, 'grid_type':grid_type}, broadcast=True, include_self=True, to=room)

@socketio.on(FromClient.CANVAS_GRID_TYPE)
def change_grid_type(data:CanvasGridTypeMsg) -> None:
    data = validate('CanvasGridTypeMsg', data)
    map_id = data['map_id']
    gt = data['grid_type']
    room = get_room(request)
    logging.info('Changing grid type to %s for map %s in room %s', gt, map_id, room)
    canvas.change_grid_type(room, map_id, gt)
    emit(ToClient.CANVAS_GRID_TYPE, {'map_id':map_id, 'grid_type':gt}, broadcast=True, include_self=True, to=room)

@socketio.on(FromClient.CANVAS_GRID_NUMBERED)
def change_grid_numbered(data:CanvasGridNumberedMsg) -> None:
    data = validate('CanvaGridNumberedMsg', data)
    map_id = data['map_id']
    numbered = data['numbered']
    room = get_room(request)
    canvas.set_numbered(room, map_id, numbered)
    emit(ToClient.CANVAS_GRID_NUMBERED, {'map_id':map_id, 'numbered':numbered}, broadcast=True, include_self=True, to=room)


@socketio.on(FromClient.CANVAS_DELETE_MAP_REQUEST)
def delete_map_request(map_id:int) -> None:
    assert isinstance(map_id, int)
    room = get_room(request)
    logging.info('delete map: %d for room "%s"', map_id, room)
    was_deleted = canvas.delete_map(room, map_id)
    if was_deleted:
        emit(ToClient.CANVAS_DELETE_MAP, map_id, broadcast=True, include_self=True, to=room)

@socketio.on(FromClient.GET_NOTE)
def note_get(note_id: int):
    assert isinstance(note_id, int)
    room = get_room(request)
    return notes.get_note(room, note_id)

@socketio.on(FromClient.NEW_NOTE_REQUEST)
def new_note_request() -> int:
    room = get_room(request)
    note_id = notes.new_note_request(room)
    logging.info('new note: %d for room "%s"', note_id, room)
    emit(ToClient.NEW_NOTE, note_id, broadcast=True, include_self=False, to=room)
    return note_id

@socketio.on(FromClient.NOTE_UPDATE_TITLE)
def note_update_title(data:NoteUpdateTitle) -> None:
    data = validate('NoteUpdateTitle', data)
    room = get_room(request)
    notes.note_update_title(room, data['note_id'], data['title'])
    # logging.info('Updating note title. Note: %s. Room: %s. Title: %s', data['note_id'], room, data['title'])
    emit(ToClient.NOTE_UPDATE_TITLE, data, broadcast=True, include_self=False, to=room) # type: ignore
    # emit(ToClient.NOTE_DIRTY, data['note_id'], broadcast=True, include_self=False, to=room)

@socketio.on(FromClient.NOTE_UPDATE_BODY)
def note_update_body(data:NoteUpdateBody) -> None:
    data = validate('NoteUpdateBody', data)
    room = get_room(request)
    # logging.info('Updating note body. Note: %s. Room: %s', data['note_id'], room)
    notes.note_update_body(room, data['note_id'], data['body'])
    # emit('note-update-body', data, broadcast=True, include_self=False, to=room)
    emit(ToClient.NOTE_DIRTY, data['note_id'], broadcast=True, include_self=False, to=room)

@socketio.on(FromClient.DELETE_NOTE_REQUEST)
def note_delete(note_id:int) -> None:
    assert isinstance(note_id, int)
    room = get_room(request)
    logging.info('delete note: %d for room "%s"', note_id, room)
    notes.note_delete(room, note_id)
    emit(ToClient.NOTE_DELETE, note_id, broadcast=True, include_self=True, to=room)

@socketio.on(FromClient.RETRIEVE_ROLL_TABLES)
def retrieve_roll_tables() -> list:
    room = get_room(request)
    logging.info('retrieving roll tables for room "%s"', room)
    return chat.get_roll_tables(room)
register_list('[RollTable]', 'RollTable')
@socketio.on(FromClient.UPDATE_ROLL_TABLES)
def update_roll_tables(tables:List[RollTable]) -> None:
    tables = validate('[RollTable]', tables)
    room = get_room(request)
    logging.info('Setting roll tables for room "%s"', room)
    chat.update_roll_tables(room, tables)

try:
    SCREEN: Optional[str] = open('screen.html').read()
except:
    SCREEN = None
def get_html() -> str:
    if appconfig.DEV or SCREEN is None:
        import pydndc
        try:
            html, _ = pydndc.htmlgen(open('screen.dnd').read(), flags=pydndc.STRIP_WHITESPACE)
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
    @app.route('/wasm/<wasm>')
    def get_wasm(wasm:str):
        logging.info('wasm: %s', wasm)
        return send_from_directory('wasm', wasm)
    @app.route('/favicon.ico')
    def get_favicon():
        return send_from_directory('.', 'favicon.ico')
    @socketio.on(FromClient.DEBUG)
    def log_debug(msg:str) -> None:
        room = get_room(request)
        logging.info('room: %s - %s', room, msg)

if False:
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
                'notes':notes.get_notes_for_room(query),
                'tables': chat.get_roll_tables(query),
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
            return ''
            # data should be in request.json?
        else:
            abort(404)
            return ''

def log_connections() -> None:
    server = socketio.server
    manager = server.manager
    if '/' not in manager.rooms:
        logging.info('No users are connected')
        return
    nsids = len(manager.rooms['/'][None])
    logging.info('Active connections: %s', nsids)
RepeatTimer(600, log_connections).start()

if __name__ == '__main__':
    if appconfig.DEV:
        socketio.run(app, host="0.0.0.0")
    else:
        socketio.run(app)

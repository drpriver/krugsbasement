import os
import logging
from typing import List, Dict, Optional, Set, Union

from flask import Flask, jsonify, request, Response, send_from_directory, session, abort
import flask
from flask_socketio import SocketIO, emit, join_room
from flask_login import LoginManager, current_user, login_user, logout_user, login_required
from werkzeug.urls import url_parse, url_encode

import appconfig
from .logs import logging
from . import chat
from . import canvas
from . import notes
from .persist import Persister, RepeatTimer, AppKVPersister
from .messages import FromClient, ToClient, ChatCommandMessage, CreateObjectMessage, CanvasUpdateMessage, CanvasDeleteMessage, NameMapMessage, NewMapRequest, CanvasGridTypeMsg, CanvasGridNumberedMsg, RollTable, NoteUpdateBody, NoteUpdateTitle, GatherMessage, PingMessage, ChatPlainMsg, Msg
from .validator import validate, register_list
from . import db
from .users import User
from .forms import LoginForm, RegisterForm, CampaignForm

import pydndc
import time
import json

app = Flask('WebDnd')
app.config['SECRET_KEY'] = appconfig.SECRET_KEY or 'dev'
app.config['REMEMBER_COOKIE_SAMESITE'] = 'Strict'
app.config['REMEMBER_COOKIE_SECURE'] = not appconfig.DEV
app.config['SESSION_COOKIE_SECURE'] = not appconfig.DEV
app.config['SESSION_COOKIE_SAMESITE'] = 'Strict'
if appconfig.DEV:
    socketio = SocketIO(app, logger=False)
else:
    socketio = SocketIO(app, logger=False, cors_allowed_origins="https://krugsbasement.com")

login = LoginManager(app)
login.login_view = 'login'

@login.user_loader
def load_user(id:str) -> User:
    return User.lookup_by_id(int(id))

def r(f:str) -> str:
    p = os.path.join(appconfig.STATICDIR, f)
    if appconfig.DEV:
        os.system('make ' + p)
    with open(p) as fp:
        return fp.read()

REGISTER_d = r('register.dnd')
LOGIN_d    = r('login.dnd')
HOME_d     = r('home.dnd')
ip_ban_list = {}
ip_bad_attempts = {}

def bad_attempt() -> None:
    ip = request.environ.get('REMOTE_ADDR')
    now = time.time()
    badtimes = [
        b for b in ip_bad_attempts.get(ip, []) 
        if now - b < 60*5
    ]
    badtimes.append(now)
    ip_bad_attempts[ip] = badtimes
    if len(badtimes) >= 2:
        ip_ban_list[ip] = now
        logging.info('Banning ip %r', ip)
    else:
        logging.info('Bad access attempt by %r: %d attempts', ip, len(badtimes))


@app.before_request
def block_method():
    ip = request.remote_addr
    # logging.info('ip: %r', ip)
    if ip in ip_ban_list:
        badtime = ip_ban_list[ip]
        if time.time() - badtime > 60*60:
            del ip_ban_list[ip]
            return
        ip_ban_list[ip] += 30
        flask.abort(404)

@app.route('/register', methods=['GET', 'POST'])
def register() -> object:
    global REGISTER_d
    if current_user.is_authenticated:
        return flask.redirect('/home')
    form = RegisterForm()
    if form.validate_on_submit():
        if form.magic.data != 'blackberry':
            bad_attempt()
            flask.flash('Invalid Magic Code')
            return flask.redirect(request.path)
        user = User.create(form.username.data, form.password.data, form.email.data)
        if user is None:
            flask.flash('Invalid username or password')
            return flask.redirect(request.path)
        logging.info('register user: %r', user)
        for campid in db.get_campaigns().values():
            db.join_campaign(user.userid, campid)
        login_user(user, remember=form.remember_me.data)
        next_page = request.args.get('next')
        if not next_page or url_parse(next_page).netloc != '':
            return flask.redirect('/home')
        return flask.redirect(next_page)
    if appconfig.DEV:
        os.system('make Generated/register.dnd')
        REGISTER_d = r('register.dnd')
    t0 = time.time()
    next_page = request.args.get('next')
    jsargs = form.dictify()
    jsargs['messages'] = flask.get_flashed_messages()
    jsargs['next_page'] = url_encode({'next':next_page}) if next_page else ''
    html = pydndc.htmlgen(REGISTER_d, jsargs=jsargs, error_reporter = lambda x, y, z, q, w: logging.error('%r:%r:%r:%r:%r', x, y, z, q, w))[0]
    t1 = time.time()
    logging.info('register rendering %s took: %.3fµs', 'pydndc', (t1-t0)*1000*1000)
    return html

@app.route('/login', methods=['GET', 'POST'])
def login() -> object:
    global LOGIN_d
    if current_user.is_authenticated:
        next_page = request.args.get('next')
        if not next_page or url_parse(next_page).netloc != '':
            return flask.redirect('/home')
        return flask.redirect(next_page)
    form = LoginForm()
    if form.validate_on_submit():
        user = User.lookup_by_name(form.username.data)
        if user is None or not user.check_password(form.password.data):
            bad_attempt()
            flask.flash('Invalid username or password')
            return flask.redirect('/login')
        login_user(user, remember=form.remember_me.data)
        logging.info('logged in user: %r', user)
        next_page = request.args.get('next')
        if not next_page or url_parse(next_page).netloc != '':
            return flask.redirect('/home')
        return flask.redirect(next_page)
    if appconfig.DEV:
        os.system('make Generated/login.dnd')
        LOGIN_d = r('login.dnd')
    t0 = time.time()
    next_page = request.args.get('next')
    jsargs = form.dictify()
    jsargs['messages'] = flask.get_flashed_messages()
    jsargs['next_page'] = url_encode({'next':next_page}) if next_page else ''
    html = pydndc.htmlgen(LOGIN_d, jsargs=jsargs, error_reporter = lambda x, y, z, q, w: logging.error('%r:%r:%r:%r:%r', x, y, z, q, w))[0]
    t1 = time.time()
    logging.info('login rendering %s took: %.3fµs', 'pydndc', (t1-t0)*1000*1000)
    return html

@app.route('/logout')
def logout():
    logout_user()
    return flask.redirect('/login')


@app.route('/campaigns')
def campa():
    return flask.redirect('/home')

@app.route('/settings', methods=['GET'])
def get_settings():
    if not current_user.is_authenticated:
        return flask.jsonify({})
    settings = db.get_global_settings(current_user.userid)
    logging.debug('Get settings for %r: %r', current_user.userid, settings)
    return flask.jsonify(settings)

@app.route('/settings', methods=['POST'])
def post_settings():
    if not current_user.is_authenticated:
        return {}
    logging.debug('Settings for %r: %r', current_user.userid, request.json)
    settings = request.json
    for k, v in settings.items():
        db.store_global_settings(current_user.userid, k, v)
    return {}

@app.route('/home')
@login_required
def home():
    campaigns = []
    if current_user.is_authenticated:
        campaigns =  db.get_users_campaigns(current_user.userid)
    global HOME_d
    if appconfig.DEV:
        HOME_d = r('home.dnd')
    name = current_user.name if current_user.is_authenticated else 'Guest User'
    t0 = time.time()
    jsargs = dict(
            name = name,
            campaigns = [c[1] for c in campaigns],
            )
    html = pydndc.htmlgen(HOME_d, jsargs=jsargs)[0]
    t1 = time.time()
    logging.info('Took %.3fµs to render dnd', (t1-t0)*1000*1000)
    return html

if appconfig.DEV:
    @app.route('/createcampaign', methods=['POST'])
    @login_required
    def createcampaign():
        form = CampaignForm()
        if form.validate_on_submit():
            campid = db.create_campaign(form.campaignname.data, current_user.userid)
        else:
            return flask.jsonify(form.errors)

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

session_id = AppKVPersister('session_id', 0).obj
logging.info('session_id: %r', session_id.value)

sid_to_room = {} # type: Dict[str, str]
def get_room(req) -> str:
    return sid_to_room[req.sid]
def record_room(req, room:str) -> None:
    sid_to_room[req.sid] = room

ALLOWED_CAMPAIGNS = db.get_campaigns()

def get_token_paths():
    with open(os.path.join(appconfig.STATICDIR, 'token-list.txt'), 'r') as fp:
        tokens = [l.strip() for l in fp if l.strip()]
    return tokens

TOKEN_PATH_LIST = get_token_paths()

@socketio.on('connect')
def handle_connection() -> None:
    session_id.value += 1
    emit(ToClient.SESSION_ID, session_id.value)
    emit(ToClient.TOKEN_PATHS, TOKEN_PATH_LIST)

@socketio.on(FromClient.JOIN)
def join(room:str) -> None:
    record_room(request, room)
    logging.info("Someone joining room: %r", room);
    join_room(room)
    # chat.create_chat(room)
    canvas.create_maps(room)
    # notes.create_notes_for_room(room)

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
    emit(ToClient.CANVAS_GATHER, where, broadcast=True, to=room) # type: ignore

@socketio.on(FromClient.CANVAS_BATTLE)
def canvas_battle(where:GatherMessage) -> None:
    where = validate('GatherMessage', where)
    room = get_room(request)
    emit(ToClient.CANVAS_BATTLE, where, broadcast=True, to=room) # type: ignore

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
def canvas_ping(data:dict) -> None:
    data = validate('PingMessage', data)
    room = get_room(request)
    emit(ToClient.CANVAS_PING, data, broadcast=True, include_self=True, to=room) # type: ignore

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
    flags = data['flags']
    room = get_room(request)
    new_map_id = canvas.new_map_request(room, map_name, grid_type, flags)
    logging.info('new map: %r for room %r, with name: %r', new_map_id, room, map_name)
    emit(ToClient.CANVAS_CREATE_MAP, new_map_id, broadcast=True, include_self=True, to=room)
    emit(ToClient.CANVAS_NAME_MAP, {'map_id':new_map_id, 'map_name':map_name}, broadcast=True, include_self=True, to=room)
    emit(ToClient.CANVAS_GRID_TYPE, {'map_id':new_map_id, 'grid_type':grid_type}, broadcast=True, include_self=True, to=room)
    emit(ToClient.CANVAS_GRID_NUMBERED, {'map_id':new_map_id, 'numbered':flags}, broadcast=True, include_self=True, to=room)

@socketio.on(FromClient.CANVAS_GRID_TYPE)
def change_grid_type(data:CanvasGridTypeMsg) -> None:
    data = validate('CanvasGridTypeMsg', data)
    map_id = data['map_id']
    gt = data['grid_type']
    room = get_room(request)
    logging.info('Changing grid type to %r for map %r in room %r', gt, map_id, room)
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
    logging.info('delete map: %r for room %r', map_id, room)
    was_deleted = canvas.delete_map(room, map_id)
    if was_deleted:
        emit(ToClient.CANVAS_DELETE_MAP, map_id, broadcast=True, include_self=True, to=room)

@socketio.on(FromClient.GET_NOTE)
def note_get(note_id: int):
    assert isinstance(note_id, int)
    room = get_room(request)
    note = notes.get_note(room, note_id)
    if note is not None:
        emit(ToClient.GOT_NOTE, note)
    # return notes.get_note(room, note_id)

@socketio.on(FromClient.NEW_NOTE_REQUEST)
def new_note_request() -> None:
    room = get_room(request)
    note_id = notes.new_note_request(room)
    logging.info('new note: %r for room %r', note_id, room)
    emit(ToClient.NEW_NOTE, note_id, broadcast=True, include_self=False, to=room)
    emit(ToClient.NEW_NOTE_RESPONSE, note_id)
    # return note_id

@socketio.on(FromClient.NOTE_UPDATE_TITLE)
def note_update_title(data:NoteUpdateTitle) -> None:
    data = validate('NoteUpdateTitle', data)
    room = get_room(request)
    notes.note_update_title(room, data['note_id'], data['title'])
    # logging.info('Updating note title. Note: %r. Room: %r. Title: %r', data['note_id'], room, data['title'])
    emit(ToClient.NOTE_UPDATE_TITLE, data, broadcast=True, include_self=False, to=room) # type: ignore
    # emit(ToClient.NOTE_DIRTY, data['note_id'], broadcast=True, include_self=False, to=room)

@socketio.on(FromClient.NOTE_UPDATE_BODY)
def note_update_body(data:NoteUpdateBody) -> None:
    data = validate('NoteUpdateBody', data)
    room = get_room(request)
    # logging.info('Updating note body. Note: %r. Room: %r', data['note_id'], room)
    notes.note_update_body(room, data['note_id'], data['body'])
    emit(ToClient.NOTE_DIRTY, data['note_id'], broadcast=True, include_self=False, to=room)

@socketio.on(FromClient.DELETE_NOTE_REQUEST)
def note_delete(note_id:int) -> None:
    assert isinstance(note_id, int)
    room = get_room(request)
    logging.info('delete note: %r for room %r', note_id, room)
    notes.note_delete(room, note_id)
    emit(ToClient.NOTE_DELETE, note_id, broadcast=True, include_self=True, to=room)

@socketio.on(FromClient.RETRIEVE_ROLL_TABLES)
def retrieve_roll_tables() -> None:
    room = get_room(request)
    logging.info('retrieving roll tables for room %r', room)
    emit(ToClient.ROLL_TABLES, chat.get_roll_tables(room))

register_list('[RollTable]', 'RollTable')
@socketio.on(FromClient.UPDATE_ROLL_TABLES)
def update_roll_tables(tables:List[RollTable]) -> None:
    tables = validate('[RollTable]', tables)
    room = get_room(request)
    logging.info('Setting roll tables for room %r', room)
    # logging.info('%r', tables);
    chat.update_roll_tables(room, tables)

@socketio.on(FromClient.UPLOAD_ROLL_TABLE)
def upload_table(table:RollTable) -> None:
    table = validate('RollTable', table)
    room = get_room(request)
    response = chat.upload_roll_table(room, table)
    if response:
        emit(ToClient.NEW_ROLL_TABLE, response, broadcast=False, to=room) # type: ignore

htmlpath = os.path.join(appconfig.STATICDIR, 'dungeon.html')
# logging.info('htmlpath: %r', htmlpath)

try:
    SCREEN: Optional[str] = open(htmlpath).read()
except:
    SCREEN = None
def get_html() -> str:
    if appconfig.DEV:
        return open(htmlpath).read()
    else:
        assert SCREEN
        return SCREEN

@app.route('/')
def index() -> str:
    return get_html()

@app.route('/campaigns/<campaign>')
@login_required
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
        logging.info('wasm: %r', wasm)
        return send_from_directory('wasm', wasm)
    @app.route('/favicon.ico')
    def get_favicon():
        return send_from_directory('.', 'favicon.ico')
    @socketio.on(FromClient.DEBUG)
    def log_debug(msg:str) -> None:
        room = get_room(request)
        logging.info('room: %r - %r', room, msg)
        msg: ChatPlainMsg = (Msg.PLAIN, '', str(msg), )
        emit(ToClient.CHAT_STRUCTURED_MSG, [msg])



if False:
    @app.route('/state', methods=['GET'])
    @app.route('/campaigns/<campaign>/state', methods=['GET', 'POST', 'DELETE'])
    def app_state(campaign:str='/') -> str:
        logging.info('request: %r', request)
        logging.info('campaign: %r',  campaign)
        query = f'/campaigns/{campaign}' if campaign != '/' else '/'
        if request.method == 'GET':
            args = request.args
            state = {
                'chat':chat.get_history(query),
                'canvas': canvas.get_state(query),
                'app':{'session_id':session_id.value},
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
rt = RepeatTimer(600, log_connections)
rt.start()

if __name__ == '__main__':
    if appconfig.DEV:
        socketio.run(app, host="0.0.0.0")
    else:
        socketio.run(app)

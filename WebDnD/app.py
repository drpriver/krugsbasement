import os
import logging
from typing import List, Dict, Optional, Set, Union, Any

from flask import Flask, jsonify, request, Response, send_from_directory, session, abort
import flask
from flask_socketio import SocketIO, emit, join_room, disconnect
from flask_login import LoginManager, current_user, login_user, logout_user, login_required
from werkzeug.urls import url_parse, url_encode
import markupsafe

import appconfig
from .logs import logging
from . import chat
from . import canvas
from . import notes
from .persist import Persister, RepeatTimer, AppKVPersister
from .messages import FromClient, ToClient, ChatCommandMessage, CreateObjectMessage, CanvasUpdateMessage, CanvasDeleteMessage, NameMapMessage, NewMapRequest, CanvasGridTypeMsg, CanvasGridNumberedMsg, RollTable, NoteUpdateBody, NoteUpdateTitle, GatherMessage, PingMessage, ChatPlainMsg, Msg, LocalSetting, RollTables, ChatDirectCommandMessage
from .validator import validate, register_list
from . import db
from .users import User
from .forms import LoginForm, RegisterForm, CampaignForm
from . import settings

import pydndc
import time
import json
if appconfig.DEV:
    dlog = logging.info
else:
    def dlog(*args): # type: ignore
        return


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
login.login_view = 'login_page'

@login.user_loader
def load_user(id:str) -> Optional[User]:
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
SCREEN     = r('dungeon.html')
ip_ban_list = {} # type: Dict[str, float]
ip_bad_attempts = {} # type: Dict[str, List[float]]
FCACHE = pydndc.FileCache()
FCACHE.store('login.css', r('login.css'))
FCACHE.store('darkmode.js', r('darkmode.js'))

def bad_attempt() -> None:
    ip = request.environ.get('REMOTE_ADDR')
    if ip is None:
        return
    now = time.time()
    badtimes = [
        b for b in ip_bad_attempts.get(ip, [])
        if now - b < 60*5
    ]
    badtimes.append(now)
    ip_bad_attempts[ip] = badtimes
    if len(badtimes) >= 5:
        ip_ban_list[ip] = now
        logging.info('Banning ip %r', ip)
    else:
        logging.info('Bad access attempt by %r: %d attempts', ip, len(badtimes))


@app.before_request
def block_method() -> None:
    ip = request.remote_addr
    # logging.info('ip: %r', ip)
    if ip in ip_ban_list:
        badtime = ip_ban_list[ip]
        if time.time() - badtime > 60*60:
            del ip_ban_list[ip]
            return
        ip_ban_list[ip] += 30
        flask.abort(404)

def pydndclog(kind, filename, line, col, mes) -> None: # type: ignore
    logging.warning('%r:%d:%d: %r', filename, line+1, col, mes)

@app.route('/register', methods=['GET', 'POST'])
def register() -> object:
    global REGISTER_d
    if current_user.is_authenticated:
        return flask.redirect('/home')
    form = RegisterForm()
    if form.validate_on_submit():
        if form.magic.data != 'balsamic':
            bad_attempt()
            flask.flash('Invalid Magic Code')
            return flask.redirect(request.path)
        user = User.create(form.username.data, form.password.data, form.email.data)
        if user is None:
            flask.flash('Invalid username or password')
            return flask.redirect(request.path)
        logging.info('register user: %r', user)
        login_user(user, remember=form.remember_me.data)
        if appconfig.DEV:
            for c in db.get_campaigns().values():
                db.join_campaign(user.userid, c)
        next_page = request.args.get('next')
        if not next_page or url_parse(next_page).netloc != '':
            return flask.redirect('/home')
        return flask.redirect(next_page)
    if appconfig.DEV:
        REGISTER_d = r('register.dnd')
    t0 = time.time()
    next_page = request.args.get('next')
    jsargs = form.dictify()
    jsargs['messages'] = flask.get_flashed_messages()
    jsargs['next_page'] = url_encode({'next':next_page}) if next_page else ''
    html = pydndc.htmlgen(REGISTER_d, jsargs=jsargs, error_reporter=pydndclog, file_cache=FCACHE)[0]
    t1 = time.time()
    logging.debug('register rendering %s took: %.3fµs', 'pydndc', (t1-t0)*1000*1000)
    return html

@app.route('/login', methods=['GET', 'POST'])
def login_page() -> object:
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
    html = pydndc.htmlgen(LOGIN_d, jsargs=jsargs, error_reporter = pydndclog, file_cache=FCACHE)[0]
    t1 = time.time()
    logging.debug('login rendering %s took: %.3fµs', 'pydndc', (t1-t0)*1000*1000)
    return html

@app.route('/logout')
def logout() -> object:
    logout_user()
    return flask.redirect('/login')


@app.route('/campaigns', methods=['GET', 'POST'])
@login_required
def campa() -> object:
    if request.method == 'GET':
        return flask.redirect('/home')
    try:
        body = request.json
        action = body['action']
        if action == 'createmagic':
            uid = current_user.userid
            cid = body['campaign']
            cid = int(cid)
            if not db.user_owns_campaign(uid, cid):
                return abort(400)
            magic = db.make_invite_link(cid)
            return flask.jsonify({'magic': magic})
        if action == 'revokemagic':
            uid = current_user.userid
            cid = body['campaign']
            cid = int(cid)
            if not db.user_owns_campaign(uid, cid):
                return abort(400)
            magic = body['magic']
            magic = int(magic)
            db.revoke_invite_link(cid, magic)
            return flask.jsonify({})
    except Exception as e:
        logging.info('Bad request: %r', e)
    return abort(400)


@app.route('/settings', methods=['GET'])
def get_settings() -> object:
    if not current_user.is_authenticated:
        return flask.jsonify({})
    return flask.jsonify(settings.get_global(current_user.userid))

@app.route('/settings', methods=['POST'])
def post_settings() -> object:
    if not current_user.is_authenticated:
        return {}
    dlog('Settings for %r: %r', current_user.userid, request.json)
    for k, v in request.json.items():
        settings.set_global(current_user.userid, k, v)
    return {}

@socketio.on(FromClient.STORE_LOCAL_SETTING)
def store_campaign_setting(data: LocalSetting) -> None:
    if not current_user.is_authenticated:
        return
    data = validate('LocalSetting', data)
    campaign = get_campaign(request)
    userid = current_user.userid
    if campaign is None:
        return
    logging.info('sid: %r storing campaign setting for %r: %r', request.sid, current_user, data[:2])
    settings.set_local(userid, campaign, *data)
    if data[0] == 'chat' and data[1] == 'name':
        emit(ToClient.USER_RENAME, [userid, json.loads(data[2])], to=str(campaign), broadcast=True)

@app.route('/home', methods=['GET','POST'])
@login_required
def home() -> object:
    form = CampaignForm()
    if form.validate_on_submit():
        campaignid = db.create_campaign(form.campaignname.data, current_user.userid)
        db.join_campaign(current_user.userid, campaignid)
        magic = db.make_invite_link(campaignid)
        logging.info('campaignid: %r, magic:%r', campaignid, magic)
        return flask.redirect('/home')
    campaigns = []
    ownedcampaigns = []
    if current_user.is_authenticated:
        campaigns =  db.get_users_campaigns(current_user.userid)
        ownedcampaigns = db.get_owned_campaigns(current_user.userid)
        # javascript can't handle large integers, so convert to string
        ownedcampaigns = [(a, b, str(c) if c is not None else '') for a, b, c in ownedcampaigns]
    global HOME_d
    if appconfig.DEV:
        HOME_d = r('home.dnd')
    name = current_user.name if current_user.is_authenticated else 'Guest User'
    t0 = time.time()
    jsargs = dict(
            name = name,
            campaigns = campaigns,
            ownedcampaigns = ownedcampaigns,
            form=form.dictify(),
            )
    html = pydndc.htmlgen(HOME_d, jsargs=jsargs, error_reporter=pydndclog, file_cache=FCACHE)[0]
    t1 = time.time()
    # logging.info('Took %.3fµs to render dnd', (t1-t0)*1000*1000)
    return html


@socketio.on(FromClient.CHAT_STRUCTURED_INPUT)
def chat_structured_input(data:ChatCommandMessage)->None:
    data = validate('ChatCommandMessage', data)
    campaign = get_campaign(request)
    responses = chat.handle_structured_input(current_user.userid, campaign, data['chatname'], data['commands'], private=False)
    if responses:
        emit(ToClient.CHAT_STRUCTURED_MSG, responses, broadcast=True, to=str(campaign))

@socketio.on(FromClient.CHAT_TEST_STRUCTURED_INPUT)
def chat_test_structured_input(data:ChatCommandMessage)->None:
    data = validate('ChatCommandMessage', data)
    campaign = get_campaign(request)
    if not data:
        return
    responses = chat.handle_structured_input(current_user.userid, campaign, data['chatname'], data['commands'], private=True)
    emit(ToClient.CHAT_TEST_STRUCTURED_RESPONSE, responses, to=str(campaign))

@socketio.on(FromClient.CHAT_PRIVATE_INPUT)
def chat_private_input(data:ChatCommandMessage)->None:
    data = validate('ChatCommandMessage', data)
    campaign = get_campaign(request)
    if not data:
        return
    responses = chat.handle_structured_input(current_user.userid, campaign, data['chatname'], data['commands'], private=True)
    emit(ToClient.CHAT_PRIVATE_STRUCTURED_MSG, responses, to=str(campaign))

@socketio.on(FromClient.CHAT_DM)
def chat_dm(data:ChatDirectCommandMessage) -> None:
    data = validate('ChatDirectCommandMessage', data)
    dlog('chat_dm: %s', data);
    campaign = get_campaign(request)
    if not data:
        return
    responses = chat.handle_structured_input(current_user.userid, campaign, data['chatname'], data['commands'], private=True)
    if not responses: return
    msg = {'users':[current_user.userid, data['to']], 'msgs':responses}
    # dlog('msg: %s', msg)
    sids = sorted(set(get_sids_of_user_for_campaign(campaign, current_user.userid) + get_sids_of_user_for_campaign(campaign, data['to'])))
    dlog('sids: %s', sids)
    for sid in sids:
        emit(ToClient.CHAT_DIRECT_MSG, msg, to=sid)

def get_sids_of_user_for_campaign(campaign:int, userid:int) -> List[str]:
    result = []
    for sid in user_id_to_sids.get(userid, []):
        if sid_to_campaign.get(sid) == campaign:
            result.append(sid)
    return result

session_id = AppKVPersister('session_id', 0).obj
logging.info('session_id: %r', session_id.value)

sid_to_campaign = {} # type: Dict[str, int]
user_id_to_sids = {} # type: Dict[int, List[str]]
def get_campaign(req:Any) -> int:
    return sid_to_campaign[req.sid]

def record_campaign(req:Any, campaign:int) -> None:
    sid_to_campaign[req.sid] = campaign
    if current_user.is_authenticated:
        if current_user.userid not in user_id_to_sids:
            user_id_to_sids[current_user.userid] = []
        user_id_to_sids[current_user.userid].append(req.sid)

def get_token_paths()->List[str]:
    with open(os.path.join(appconfig.STATICDIR, 'token-list.txt'), 'r') as fp:
        tokens = [l.strip() for l in fp if l.strip()]
    return tokens

TOKEN_PATH_LIST = get_token_paths()

@socketio.on('connect')
def handle_connection() -> None:
    session_id.value += 1
    emit(ToClient.SESSION_ID, session_id.value)
    emit(ToClient.TOKEN_PATHS, TOKEN_PATH_LIST)

@socketio.on('disconnect')
def handle_disconnect() -> None:
    if request.sid in sid_to_campaign:
        del sid_to_campaign[request.sid]
    if current_user.is_authenticated:
        id = current_user.userid
        try:
            user_id_to_sids[id].remove(request.sid)
            if not user_id_to_sids[id]:
                del user_id_to_sids[id]
        except Exception:
            pass

LEGACY_CAMPAIGNS = {'':1, 'candyland':2, 'horror_on_the_moors':3, 'test':3, 'greenskins1':4}

@socketio.on(FromClient.JOIN)
def join(room:str) -> None:
    campaign  = room.split('/')[-1] if '/' in room else ''
    try:
        campaignid = int(campaign)
    except ValueError:
        campaignid  = LEGACY_CAMPAIGNS[campaign]
    may_access = False
    if campaignid == 1:
        may_access = True
    elif current_user.is_anonymous:
        may_access = False
    elif db.user_may_access_campaign(current_user.userid, campaignid):
        may_access = True
    if not may_access:
        return disconnect()
    record_campaign(request, campaignid)
    logging.info("Someone joining room (campaignid): %r, %r", room, campaignid);
    join_room(str(campaignid))
    # chat.create_chat(room)
    canvas.create_maps(campaignid)
    # notes.create_notes_for_room(room)

@socketio.on(FromClient.POST_JOIN)
def post_join() -> None:
    campaign = get_campaign(request)
    emit(ToClient.CHAT_CLEAR)
    emit(ToClient.CHAT_CREATE, chat.get_history(campaign))
    emit(ToClient.CANVAS_INITIALIZE_MAPS, canvas.get_state(campaign))
    emit(ToClient.NOTES_INITIALIZE, notes.get_notes_for_room(campaign))
    userids = db.get_users_in_campaign(campaign)
    userlist = []
    for uid in userids:
        chatname = settings.get_local_ckvd(uid, campaign, 'chat', 'name', 'anon')
        dlog('chatname for uid (%s): %r', uid, chatname)
        userlist.append((uid, chatname))
    emit(ToClient.USER_LIST, userlist)

@socketio.on(FromClient.CANVAS_CREATE_OBJECTS)
def handle_canvas_create(data:CreateObjectMessage) -> None:
    data = validate('CreateObjectMessage', data)
    campaign = get_campaign(request)
    response = canvas.handle_create(campaign, data)
    if response:
        emit(ToClient.CANVAS_CREATE_OBJECTS, response, broadcast=True, include_self=False, to=str(campaign))

@socketio.on(FromClient.CANVAS_DELETE)
def handle_canvas_delete(data:CanvasDeleteMessage) -> None:
    data = validate('CanvasDeleteMessage', data)
    campaign = get_campaign(request)
    response = canvas.handle_delete(campaign, data)
    if response:
        emit(ToClient.CANVAS_DELETE, response, broadcast=True, include_self=False, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_UPDATE)
def handle_canvas_update(data:CanvasUpdateMessage) -> None:
    data = validate('CanvasUpdateMessage', data)
    campaign = get_campaign(request)
    response = canvas.handle_update(campaign, data)
    if response:
        emit(ToClient.CANVAS_UPDATE, response, broadcast=True, include_self=False, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_GATHER)
def canvas_gather(where:GatherMessage) -> None:
    where = validate('GatherMessage', where)
    campaign = get_campaign(request)
    emit(ToClient.CANVAS_GATHER, where, broadcast=True, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_BATTLE)
def canvas_battle(where:GatherMessage) -> None:
    where = validate('GatherMessage', where)
    campaign = get_campaign(request)
    emit(ToClient.CANVAS_BATTLE, where, broadcast=True, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_DUNGEON_MODE)
def canvas_dungeon_mode() -> None:
    campaign = get_campaign(request)
    emit(ToClient.CANVAS_DUNGEON_MODE, broadcast=True, to=str(campaign))


@socketio.on(FromClient.CANVAS_CREATE_MAP)
def canvas_create_map(data:int) -> None:
    assert isinstance(data, int)
    campaign = get_campaign(request)
    canvas.create_map(campaign, data)
    emit(ToClient.CANVAS_CREATE_MAP, data, broadcast=True, include_self=False, to=str(campaign))

@socketio.on(FromClient.CANVAS_PING)
def canvas_ping(data:dict) -> None:
    data = validate('PingMessage', data)
    campaign = get_campaign(request)
    emit(ToClient.CANVAS_PING, data, broadcast=True, include_self=True, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_NAME_MAP)
def canvas_name_map(data:NameMapMessage) -> None:
    data = validate('NameMapMessage', data)
    campaign = get_campaign(request)
    canvas.name_map(campaign, **data)
    emit(ToClient.CANVAS_NAME_MAP, data, broadcast=True, include_self=False, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_NEW_MAP_REQUEST)
def new_map_request(data:NewMapRequest) -> None:
    data = validate('NewMapRequest', data)
    map_name:str = data['name']
    grid_type = data['grid_type']
    flags = data['flags']
    campaign = get_campaign(request)
    new_map_id = canvas.new_map_request(campaign, map_name, grid_type, flags)
    logging.info('new map: %r for campaign %r, with name: %r', new_map_id, campaign, map_name)
    emit(ToClient.CANVAS_CREATE_MAP, new_map_id, broadcast=True, include_self=True, to=str(campaign))
    emit(ToClient.CANVAS_NAME_MAP, {'map_id':new_map_id, 'map_name':map_name}, broadcast=True, include_self=True, to=str(campaign))
    emit(ToClient.CANVAS_GRID_TYPE, {'map_id':new_map_id, 'grid_type':grid_type}, broadcast=True, include_self=True, to=str(campaign))
    emit(ToClient.CANVAS_GRID_NUMBERED, {'map_id':new_map_id, 'numbered':flags}, broadcast=True, include_self=True, to=str(campaign))

@socketio.on(FromClient.CANVAS_GRID_TYPE)
def change_grid_type(data:CanvasGridTypeMsg) -> None:
    data = validate('CanvasGridTypeMsg', data)
    map_id = data['map_id']
    gt = data['grid_type']
    campaign = get_campaign(request)
    logging.info('Changing grid type to %r for map %r in campaign %r', gt, map_id, campaign)
    canvas.change_grid_type(campaign, map_id, gt)
    emit(ToClient.CANVAS_GRID_TYPE, {'map_id':map_id, 'grid_type':gt}, broadcast=True, include_self=True, to=str(campaign))

@socketio.on(FromClient.CANVAS_GRID_NUMBERED)
def change_grid_numbered(data:CanvasGridNumberedMsg) -> None:
    data = validate('CanvaGridNumberedMsg', data)
    map_id = data['map_id']
    numbered = data['numbered']
    campaign = get_campaign(request)
    canvas.set_numbered(campaign, map_id, numbered)
    emit(ToClient.CANVAS_GRID_NUMBERED, {'map_id':map_id, 'numbered':numbered}, broadcast=True, include_self=True, to=str(campaign))


@socketio.on(FromClient.CANVAS_DELETE_MAP_REQUEST)
def delete_map_request(map_id:int) -> None:
    assert isinstance(map_id, int)
    campaign = get_campaign(request)
    logging.info('delete map: %r for campaign %r', map_id, campaign)
    was_deleted = canvas.delete_map(campaign, map_id)
    if was_deleted:
        emit(ToClient.CANVAS_DELETE_MAP, map_id, broadcast=True, include_self=True, to=str(campaign))

@socketio.on(FromClient.GET_NOTE)
def note_get(note_id: int) -> None:
    assert isinstance(note_id, int)
    campaign = get_campaign(request)
    note = notes.get_note(campaign, note_id)
    if note is not None:
        emit(ToClient.GOT_NOTE, note)
    # return notes.get_note(campaign, note_id)

@socketio.on(FromClient.NEW_NOTE_REQUEST)
def new_note_request() -> None:
    campaign = get_campaign(request)
    note_id = notes.new_note_request(campaign)
    logging.info('new note: %r for campaign %r', note_id, campaign)
    emit(ToClient.NEW_NOTE, note_id, broadcast=True, include_self=False, to=str(campaign))
    emit(ToClient.NEW_NOTE_RESPONSE, note_id)
    # return note_id

@socketio.on(FromClient.NOTE_UPDATE_TITLE)
def note_update_title(data:NoteUpdateTitle) -> None:
    data = validate('NoteUpdateTitle', data)
    campaign = get_campaign(request)
    notes.note_update_title(campaign, data['note_id'], data['title'])
    dlog('Updating note title. Note: %r. Room: %r. Title: %r', data['note_id'], campaign, data['title'])
    emit(ToClient.NOTE_UPDATE_TITLE, data, broadcast=True, include_self=False, to=str(campaign)) # type: ignore
    # emit(ToClient.NOTE_DIRTY, data['note_id'], broadcast=True, include_self=False, to=str(campaign))

@socketio.on(FromClient.NOTE_UPDATE_BODY)
def note_update_body(data:NoteUpdateBody) -> None:
    data = validate('NoteUpdateBody', data)
    campaign = get_campaign(request)
    dlog('Updating note body. Note: %r. Room: %r', data['note_id'], campaign)
    notes.note_update_body(campaign, data['note_id'], data['body'])
    emit(ToClient.NOTE_DIRTY, data['note_id'], broadcast=True, include_self=False, to=str(campaign))

@socketio.on(FromClient.DELETE_NOTE_REQUEST)
def note_delete(note_id:int) -> None:
    assert isinstance(note_id, int)
    campaign = get_campaign(request)
    logging.info('delete note: %r for campaign %r', note_id, campaign)
    notes.note_delete(campaign, note_id)
    emit(ToClient.NOTE_DELETE, note_id, broadcast=True, include_self=True, to=str(campaign))

@socketio.on(FromClient.RETRIEVE_ROLL_TABLES)
def retrieve_roll_tables() -> None:
    campaign = get_campaign(request)
    logging.info('retrieving roll tables for campaign %r', campaign)
    tables = chat.get_both_tables(current_user.userid, campaign)
    tables = list(tables)
    dlog('tables: %r', tables)
    emit(ToClient.ROLL_TABLES, tables)

@socketio.on(FromClient.UPDATE_ROLL_TABLES)
def update_roll_tables(tables:RollTables) -> None:
    tables = validate('RollTables', tables)
    campaign = get_campaign(request)
    logging.info('Setting roll tables for campaign %r', campaign)
    # logging.info('%r', tables);
    chat.update_roll_tables(current_user.userid, campaign, tables)

def get_html(info:db.CampaignInfo) -> str:
    global SCREEN
    if appconfig.DEV:
        SCREEN = r('dungeon.html')
    vals = {
        'userid':0,
        'darkmode': 0,
        'chat': {'name':'anon'},
        'macros':{
            'macros':[],
            'variables':[],
            'used_variables':[],
        }
    }
    def update_vals(orig:dict, to_update:dict) -> None:
        for k in orig:
            if k not in to_update:
                continue
            if isinstance(orig[k], dict):
                update_vals(orig[k], to_update[k])
            else:
                orig[k] = to_update[k]
    if current_user.is_authenticated:
        update_vals(vals, settings.get_global(current_user.userid))
        update_vals(vals, settings.get_local(current_user.userid, info.id))
        vals['userid'] = current_user.userid
        dlog('get settings: %r', vals)
    result = SCREEN
    title = info.name.replace('-', ' ').replace('_', ' ').title()
    title = markupsafe.escape(title)
    if title:
        result = result.replace('<title>David20</title>', f'<title>David20 - {title}</title>', 1)
    result = result.replace('"let SETTINGS = SETTINGS";', 'let SETTINGS = ' +json.dumps(vals)+';', 1)
    return result

@app.route('/')
def index() -> str:
    info = db.campaign_info(1)
    assert info
    return get_html(info)

@app.route('/campaigns/<campaign>')
@login_required
def get_campaign_request(campaign:str) -> str:
    # logging.info('campaign: %r', campaign)
    campaign_id: Optional[int]
    try:
        campaign_id = int(campaign)
    except ValueError:
        # TODO: do a redirect instead once peoples macros and stuff are on
        # the server.
        campaign_id = LEGACY_CAMPAIGNS.get(campaign)
        if campaign_id is not None:
            return flask.redirect(f'/campaigns/{campaign_id}')
    # logging.info('campaign_id: %r', campaign_id)
    if campaign_id is None:
        return abort(404)
    info = db.campaign_info(campaign_id)
    # logging.info('info: %r', info)
    if info is None:
        return abort(404)
    magic = request.args.get('magic')
    # logging.info('magic: %r', magic)
    if magic is not None:
        logging.info('magic: %r', magic)
        try:
            magic = int(magic)
        except ValueError:
            pass
        else:
            if db.check_invite_link(campaign_id, magic):
                try:
                    db.join_campaign(current_user.userid, campaign_id)
                except Exception as e:
                    logging.info('Probably already joined campaign: %r', e)
            else:
                logging.info('bad magic value for %r: %r', campaign_id, magic)
    if not db.user_may_access_campaign(current_user.userid, campaign_id):
        return abort(404)
    # logging.info('campaign: %r, campaign_id: %r', campaign, campaign_id)
    return get_html(info)

if appconfig.DEV:
    @app.route('/imgs/<img>')
    def get_img(img:str) -> object:
        return send_from_directory('imgs', img)
    @app.route('/tokens/<token>')
    def get_token(token:str) -> object:
        return send_from_directory('tokens', token)
    @app.route('/icons/<icon>')
    def get_icon(icon:str) -> object:
        return send_from_directory('icons', icon)
    @app.route('/tiles/<tile>')
    def get_tile(tile:str) -> object:
        return send_from_directory('tiles', tile)
    @app.route('/wasm/<wasm>')
    def get_wasm(wasm:str) -> object:
        logging.info('wasm: %r', wasm)
        return send_from_directory('wasm', wasm)
    @app.route('/favicon.ico')
    def get_favicon() -> object:
        return send_from_directory('.', 'favicon.ico')
    @socketio.on(FromClient.DEBUG)
    def log_debug(msg:str) -> None:
        campaign = get_campaign(request)
        logging.info('campaign: %r - %r', campaign, msg)
        msg: ChatPlainMsg = (Msg.PLAIN, '', str(msg), )
        emit(ToClient.CHAT_STRUCTURED_MSG, [msg])

_last_log_num = 0
def log_connections() -> None:
    server = socketio.server
    manager = server.manager
    global _last_log_num
    if '/' not in manager.rooms:
        if _last_log_num == 0:
            return
        _last_log_num = 0
        logging.info('No users are connected')
        return
    nsids = len(manager.rooms['/'][None])
    if nsids == _last_log_num:
        return
    _last_log_num = nsids
    logging.info('Active connections: %s', nsids)
rt = RepeatTimer(600, log_connections)
rt.start()

def alive() -> None:
    logging.info('Alive...')
rt2 = RepeatTimer(6000, alive)
rt2.start()

if __name__ == '__main__':
    if appconfig.DEV:
        socketio.run(app, host="0.0.0.0")
    else:
        socketio.run(app)

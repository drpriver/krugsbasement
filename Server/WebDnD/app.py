#
# Copyright © 2021-2023, David Priver
#

from __future__ import annotations
import os
import logging
from typing import List, Dict, Optional, Set, Union, NamedTuple, Tuple, Any

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
from . import sheets
from .persist import Persister, RepeatTimer, AppKVPersister
from .messages import FromClient, ToClient, ChatCommandMessage, CreateObjectsMessage, CanvasUpdateMessage, CanvasDeleteMessage, NameMapMessage, NewMapRequest, CanvasGridTypeMsg, CanvasGridNumberedMsg, RollTable, NoteUpdateBody, NoteUpdateTitle, GatherMessage, PingMessage, ChatPlainMsg, Msg, LocalSetting, RollTables, ChatDirectCommandMessage, ChatDirectResponse, RollTableNames, Api, CanvasColorMsg, UiMode, SpreadSheetMsg, SpreadSheetMsgType, SpreadSheetInitialize, NewNoteMsg, CanvasParentMsg, NoteParentMsg
from .validator import register_list, validated, validate
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
    p = '/'.join([appconfig.STATICDIR, f])
    if appconfig.DEV:
        os.system('make ' + p)
    with open(p, encoding='utf-8') as fp:
        return fp.read()

SCREEN = r('dungeon.html')
ip_ban_list = {} # type: Dict[str, float]
ip_bad_attempts = {} # type: Dict[str, List[float]]
FCACHE = pydndc.FileCache()
FCACHE.store('login.css', r('login.css'))
FCACHE.store('darkmode.js', r('darkmode.js'))

class PageTemplate:
    def __init__(self, filename:str, node_ids: Tuple[str, ...], ctx:pydndc.Context, handles:List[int]) -> None:
        self.filename = filename
        self.node_ids = node_ids
        self.ctx = ctx
        self.handles = handles

    def clone(self) -> Tuple[pydndc.Context, List[pydndc.Node]]:
        if appconfig.DEV:
            self = self.setup(self.filename, self.node_ids)
        ctx = self.ctx.pseudo_clone()
        return ctx, [ctx.node_from_int(h) for h in self.handles]

    @classmethod
    def setup(cls, filename:str, node_ids:Tuple[str, ...]) -> 'PageTemplate':
        text = r(filename)
        ctx = pydndc.Context(filecache=FCACHE)
        ctx.logger = pydndc.stderr_logger
        ctx.root.parse(text)
        ctx.resolve_imports()
        ctx.resolve_links()
        handles = [ctx.node_by_id(node_id).handle for node_id in node_ids] # type: ignore
        return cls(filename, node_ids, ctx, handles)

HOMETEMPLATE     = PageTemplate.setup('home.dnd',     ('Campaigns', 'Your Campaigns', 'welcome', 'Create a Campaign'))
REGISTERTEMPLATE = PageTemplate.setup('register.dnd', ('username-errors', 'email-errors', 'password-errors', 'password2-errors', 'hidden'))
LOGINTEMPLATE    = PageTemplate.setup('login.dnd',    ('username-errors', 'password-errors', 'hidden'))


def bad_attempt() -> None:
    ip = request.environ.get('HTTP_X_REAL_IP')
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
    ip = request.environ.get('HTTP_X_REAL_IP')
    # ip = request.remote_addr
    logging.info('ip: %r', ip)
    if ip in ip_ban_list:
        badtime = ip_ban_list[ip]
        if time.time() - badtime > 60*60:
            del ip_ban_list[ip]
            return
        ip_ban_list[ip] += 30
        flask.abort(404)

def pydndclog(kind:int, filename:str, line:int, col:int, mes:str) -> None:
    logging.warning('%r:%d:%d: %r', filename, line+1, col, mes)

def add_errors(node:pydndc.Node, error_list:Optional[Union[List[str], List[Tuple[str,str]]]]) -> None:
    if not error_list: return
    raw = node.make_child(pydndc.NodeType.RAW)
    raw.append_child('<ul class="error">')
    for mess in error_list:
        raw.append_child(f'<li class="error">{mess}</li>')
    raw.append_child('</ul>')

@app.route('/register', methods=['GET', 'POST'])
def register() -> Any:
    t0 = time.time()
    if current_user.is_authenticated:
        return flask.redirect('/home')
    form = RegisterForm()
    if form.validate_on_submit():
        # TODO: move invitation codes to the db
        if not appconfig.INVITE_CODE or form.magic.data != appconfig.INVITE_CODE:
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
    next_page = request.args.get('next')
    ctx, nodes = REGISTERTEMPLATE.clone()
    username_errors, email_errors, password_errors, password2_errors, hidden = nodes

    next_page = ('?'+url_encode({'next':next_page})) if next_page else ''
    ctx.add_link('login', f'/login{next_page}')
    messages = flask.get_flashed_messages()
    add_errors(username_errors, messages)
    add_errors(username_errors, form.username.errors)
    add_errors(email_errors, form.email.errors)
    add_errors(password_errors, form.password.errors)
    add_errors(password2_errors, form.password2.errors)
    hidden.append_child(form.hidden_tag())
    html = ctx.render()
    t1 = time.time()
    dlog('register rendering %r took: %.3fµs', 'pydndc', (t1-t0)*1000*1000)
    return html

@app.route('/login', methods=['GET', 'POST'])
def login_page() -> Any:
    t0 = time.time()
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
    ctx, nodes = LOGINTEMPLATE.clone()
    username_errors, password_errors, hidden = nodes
    next_page = request.args.get('next')
    if next_page:
        next_page = '?' + url_encode({'next':next_page})
    else:
        next_page = ''
    ctx.add_link('register', f'/register{next_page}')
    add_errors(username_errors, flask.get_flashed_messages())
    add_errors(username_errors, form.username.errors)
    add_errors(password_errors, form.password.errors)
    hidden.append_child(form.hidden_tag())
    html = ctx.render()
    t1 = time.time()
    dlog('login rendering %r took: %.3fµs', 'pydndc', (t1-t0)*1000*1000)
    return html


@app.route('/logout')
def logout() -> Any:
    logout_user()
    return flask.redirect('/login')


@app.route('/campaigns', methods=['GET', 'POST'])
@login_required
def campa() -> Any:
    if request.method == 'GET':
        return flask.redirect('/home')
    try:
        body: Any = request.json
        action = body['action']
        if action == 'createmagic':
            uid = current_user.userid
            cid = body['campaign']
            cid = int(cid)
            if not db.user_owns_campaign(uid, cid):
                return abort(400)
            logging.info('Creating magic link for %r', cid)
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
            logging.info('Revoking magic link for %r', cid)
            db.revoke_invite_link(cid, magic)
            return flask.jsonify({})
    except Exception as e:
        logging.info('Bad request: %r', e)
    return abort(400)


@app.route('/settings', methods=['GET'])
def get_settings() -> Any:
    if not current_user.is_authenticated:
        return flask.jsonify({})
    return flask.jsonify(settings.get_global(current_user.userid))

@app.route('/settings', methods=['POST'])
def post_settings() -> Any:
    if not current_user.is_authenticated:
        return {}
    dlog('Settings for %r: %r', current_user.userid, request.json)
    json: Any = request.json
    for k, v in json.items():
        settings.set_global(current_user.userid, k, v)
    return {}

@socketio.on(FromClient.STORE_LOCAL_SETTING)
@validated
def store_campaign_setting(data: LocalSetting) -> None:
    campaign = get_campaign(request)
    userid = current_user.userid
    if campaign is None:
        return
    logging.info('sid: %r storing campaign setting for %r: %r', request.sid, current_user, data[:2]) # type: ignore
    settings.set_local(userid, campaign, *data)
    if data[0] == 'chat' and data[1] == 'name':
        emit(ToClient.USER_RENAME, [userid, json.loads(data[2])], to=str(campaign), broadcast=True) # type: ignore


@app.route('/home', methods=['GET','POST'])
@login_required
def home() -> Any:
    t0 = time.time()
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
        campaigns = [(a, markupsafe.escape(b)) for a, b in db.get_users_campaigns(current_user.userid)]
        ownedcampaigns = db.get_owned_campaigns(current_user.userid)
        # javascript can't handle large integers, so convert to string
        ownedcampaigns = [(a, markupsafe.escape(b), str(c) if c is not None else '') for a, b, c in ownedcampaigns]
    name = current_user.name if current_user.is_authenticated else 'Guest User'
    ctx, nodes = HOMETEMPLATE.clone()
    camp, your_campaigns, welcome, create = nodes
    if campaigns:
        camp.parse('Go to a Campaign:')
        raw: pydndc.Node = camp.make_child(pydndc.NodeType.RAW)
        raw.append_child('<ul>')
        for id, campaign in campaigns:
            if not campaign: continue
            raw.append_child(f'<li><a href="/campaigns/{id}">{campaign}</a></li>')
        raw.append_child('</ul>')
    else:
        camp.append_child("You have not joined any campaigns yet")
    if ownedcampaigns:
        raw = your_campaigns.make_child(pydndc.NodeType.RAW)
        raw.append_child('<table><tbody>')
        for id, campaign, magic in ownedcampaigns: # type: ignore
            if magic:
                raw.append_child('<tr>'
                        f'<td><a href="/campaigns/{id}">{campaign}</a></td>'
                        f'<td><button onclick="getmagic(\'{id}\', \'{magic}\')">Copy Magic Link to Clipboard</button></td>'
                        f'<td><button onclick="revokemagic(\'{id}\', \'{magic}\')">Revoke Magic Link</button></td>'
                        '</tr>')
            else:
                raw.append_child('<tr>'
                    f'<td><a href="/campaigns/{id}">{campaign}</a></td>'
                    f'<td><button onclick="createmagic(\'{id}\')">Create Magic Link</button></td>'
                    '</tr>')
        raw.append_child('</table>')

    else:
        your_campaigns.hide = True
    welcome.parse(f'Welcome {name}, this is your home.')
    create.children[0].children[1].header = form.hidden_tag()
    html = ctx.render()
    tend = time.time()
    logging.info('Took %.3fµs to render dnd', (tend-t0)*1000*1000)
    return html


@socketio.on(FromClient.CHAT_STRUCTURED_INPUT)
@validated
def chat_structured_input(data:ChatCommandMessage)->None:
    assert current_user.is_authenticated
    campaign = get_campaign(request)
    responses = chat.handle_structured_input(current_user.userid, campaign, data['chatname'], data['commands'], private=False)
    if responses:
        emit(ToClient.CHAT_STRUCTURED_MSG, responses, broadcast=True, to=str(campaign))

@socketio.on(FromClient.CHAT_TEST_STRUCTURED_INPUT)
@validated
def chat_test_structured_input(data:ChatCommandMessage)->None:
    assert current_user.is_authenticated
    campaign = get_campaign(request)
    if not data:
        return
    responses = chat.handle_structured_input(current_user.userid, campaign, data['chatname'], data['commands'], private=True)
    emit(ToClient.CHAT_TEST_STRUCTURED_RESPONSE, responses, to=str(campaign))

@socketio.on(FromClient.CHAT_DM)
@validated
def chat_dm(data:ChatDirectCommandMessage) -> None:
    assert current_user.is_authenticated
    dlog('chat_dm: %r', data);
    campaign = get_campaign(request)
    if not data:
        return
    responses = chat.handle_structured_input(current_user.userid, campaign, data['chatname'], data['commands'], private=False, to=data['to'])
    if not responses: return
    msg: ChatDirectResponse = {'users':[current_user.userid, data['to']], 'msgs':responses}
    # dlog('msg: %r', msg)
    sids = sorted(set(get_sids_of_user_for_campaign(campaign, current_user.userid) + get_sids_of_user_for_campaign(campaign, data['to'])))
    dlog('sids: %r', sids)
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
def get_campaign(req:'flask.Request') -> int:
    return sid_to_campaign[req.sid] # type: ignore

def record_campaign(req:'flask.Request', campaign:int) -> None:
    sid_to_campaign[req.sid] = campaign # type: ignore
    if current_user.is_authenticated:
        if current_user.userid not in user_id_to_sids:
            user_id_to_sids[current_user.userid] = []
        user_id_to_sids[current_user.userid].append(req.sid) # type: ignore


@socketio.on('connect')
def handle_connection() -> None:
    session_id.value += 1
    emit(ToClient.API_VERSION, Api.VERSION)
    emit(ToClient.SESSION_ID, session_id.value)

@socketio.on('disconnect')
def handle_disconnect() -> None:
    if request.sid in sid_to_campaign: # type: ignore
        del sid_to_campaign[request.sid] # type: ignore
    if current_user.is_authenticated:
        id = current_user.userid
        try:
            user_id_to_sids[id].remove(request.sid) # type: ignore
            if not user_id_to_sids[id]:
                del user_id_to_sids[id]
        except Exception:
            pass

@socketio.on(FromClient.JOIN)
@validated
def join(room:str) -> None:
    parts = room.split('/')
    try:
        if len(parts) >= 1 and parts[-1].isnumeric():
            campaignid = int(parts[-1])
        elif len(parts) >= 2 and parts[-2].isnumeric():
            campaignid = int(parts[-2])
        else:
            return disconnect()
    except ValueError:
        return disconnect()

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
    logging.info("%r joining room (campaignid): %r, %r", current_user, room, campaignid);
    join_room(str(campaignid))
    # chat.create_chat(room)
    canvas.create_maps(campaignid)
    # notes.create_notes_for_room(room)

@socketio.on(FromClient.POST_JOIN)
# @validated # XXX: somehow we can get a 0 here, which is not a valid ui mode.
def post_join(mode:UiMode) -> None:
    mode = mode or 1
    mode = validate('UiMode', mode)
    campaign = get_campaign(request)
    if mode == UiMode.NORMAL:
        emit(ToClient.CANVAS_INITIALIZE_MAPS, canvas.get_state(campaign))
    if mode == UiMode.NORMAL or mode == UiMode.CHAT:
        emit(ToClient.CHAT_CLEAR)
        emit(ToClient.CHAT_CREATE, chat.get_history(campaign))
        emit(ToClient.CHAT_PRIVATE_CREATE, chat.get_private_history(current_user.userid, campaign))
    if mode == UiMode.NORMAL or mode == UiMode.NOTES:
        emit(ToClient.NOTES_INITIALIZE, notes.get_notes_for_room(campaign))
    if mode == UiMode.NORMAL or mode == UiMode.CHAT:
        userids = db.get_users_in_campaign(campaign)
        userlist = []
        for uid in userids:
            chatname = settings.get_local_ckvd(uid, campaign, 'chat', 'name', 'anon')
            dlog('chatname for uid (%r): %r', uid, chatname)
            userlist.append((uid, chatname))
        emit(ToClient.USER_LIST, userlist)
    if mode == UiMode.NORMAL:
        msg:SpreadSheetInitialize = [SpreadSheetMsgType.INITIALIZE, sheets.get_spreadsheets(campaign)] # type: ignore
        emit(ToClient.SPREADSHEET, msg)

@socketio.on(FromClient.CANVAS_CREATE_OBJECTS)
@validated
def handle_canvas_create(data:List[CreateObjectsMessage]) -> None:
    dlog('data: %r', data)
    campaign = get_campaign(request)
    response = canvas.handle_create(campaign, data)
    if response:
        emit(ToClient.CANVAS_CREATE_OBJECTS, response, broadcast=True, include_self=False, to=str(campaign))

@socketio.on(FromClient.CANVAS_DELETE)
@validated
def handle_canvas_delete(data:CanvasDeleteMessage) -> None:
    campaign = get_campaign(request)
    response = canvas.handle_delete(campaign, data)
    if response:
        emit(ToClient.CANVAS_DELETE, response, broadcast=True, include_self=False, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_UPDATE)
@validated
def handle_canvas_update(data:CanvasUpdateMessage) -> None:
    campaign = get_campaign(request)
    response = canvas.handle_update(campaign, data)
    if response:
        emit(ToClient.CANVAS_UPDATE, response, broadcast=True, include_self=False, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_GATHER)
@validated
def canvas_gather(where:GatherMessage) -> None:
    campaign = get_campaign(request)
    emit(ToClient.CANVAS_GATHER, where, broadcast=True, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_BATTLE)
@validated
def canvas_battle(where:GatherMessage) -> None:
    campaign = get_campaign(request)
    emit(ToClient.CANVAS_BATTLE, where, broadcast=True, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_DUNGEON_MODE)
def canvas_dungeon_mode() -> None:
    campaign = get_campaign(request)
    emit(ToClient.CANVAS_DUNGEON_MODE, broadcast=True, to=str(campaign))


@socketio.on(FromClient.CANVAS_CREATE_MAP)
@validated
def canvas_create_map(data:int) -> None:
    campaign = get_campaign(request)
    canvas.create_map(campaign, data)
    emit(ToClient.CANVAS_CREATE_MAP, data, broadcast=True, include_self=False, to=str(campaign))

@socketio.on(FromClient.CANVAS_PING)
@validated
def canvas_ping(data:PingMessage) -> None:
    campaign = get_campaign(request)
    emit(ToClient.CANVAS_PING, data, broadcast=True, include_self=True, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_NAME_MAP)
@validated
def canvas_name_map(data:NameMapMessage) -> None:
    campaign = get_campaign(request)
    canvas.name_map(campaign, **data)
    emit(ToClient.CANVAS_NAME_MAP, data, broadcast=True, include_self=False, to=str(campaign)) # type: ignore

@socketio.on(FromClient.CANVAS_NEW_MAP_REQUEST)
@validated
def new_map_request(data:NewMapRequest) -> None:
    map_name:str = data['name']
    grid_type = data['grid_type']
    flags = data['flags']
    grid_color = data['grid_color']
    bg_color = data['bg_color']
    parent = data['parent']
    dlog('data: %r', data)
    campaign = get_campaign(request)
    new_map_id = canvas.new_map_request(campaign, map_name, grid_type, flags, grid_color, parent)
    logging.info('new map: %r for campaign %r, with name: %r', new_map_id, campaign, map_name)
    emit(ToClient.CANVAS_CREATE_MAP, new_map_id, broadcast=True, include_self=True, to=str(campaign))
    emit(ToClient.CANVAS_NAME_MAP, {'map_id':new_map_id, 'map_name':map_name}, broadcast=True, include_self=True, to=str(campaign))
    emit(ToClient.CANVAS_GRID_TYPE, {'map_id':new_map_id, 'grid_type':grid_type}, broadcast=True, include_self=True, to=str(campaign))
    emit(ToClient.CANVAS_GRID_NUMBERED, {'map_id':new_map_id, 'numbered':flags}, broadcast=True, include_self=True, to=str(campaign))
    emit(ToClient.CANVAS_GRID_COLOR, {'map_id':new_map_id, 'color':grid_color}, broadcast=True, include_self=True, to=str(campaign))
    emit(ToClient.CANVAS_BG_COLOR, {'map_id':new_map_id, 'color':bg_color}, broadcast=True, include_self=True, to=str(campaign))
    emit(ToClient.CANVAS_PARENT, {'map_id':new_map_id, 'parent':parent}, broadcast=True, include_self=True, to=str(campaign))

@socketio.on(FromClient.CANVAS_GRID_TYPE)
@validated
def change_grid_type(data:CanvasGridTypeMsg) -> None:
    map_id = data['map_id']
    gt = data['grid_type']
    campaign = get_campaign(request)
    logging.info('Changing grid type to %r for map %r in campaign %r', gt, map_id, campaign)
    canvas.change_grid_type(campaign, map_id, gt)
    emit(ToClient.CANVAS_GRID_TYPE, {'map_id':map_id, 'grid_type':gt}, broadcast=True, include_self=True, to=str(campaign))

@socketio.on(FromClient.CANVAS_GRID_COLOR)
@validated
def change_grid_color(data:CanvasColorMsg) -> None:
    map_id = data['map_id']
    grid_color = data['color']
    campaign = get_campaign(request)
    logging.info('Changing grid color to %r for map %r in campaign %r', grid_color, map_id, campaign)
    canvas.change_grid_color(campaign, map_id, grid_color)
    emit(ToClient.CANVAS_GRID_COLOR, {'map_id':map_id, 'color':grid_color}, broadcast=True, include_self=True, to=str(campaign))

@socketio.on(FromClient.CANVAS_BG_COLOR)
@validated
def change_bg_color(data:CanvasColorMsg) -> None:
    map_id = data['map_id']
    bg_color = data['color']
    campaign = get_campaign(request)
    dlog('Changing bg color to %r for map %r in campaign %r', bg_color, map_id, campaign)
    canvas.change_bg_color(campaign, map_id, bg_color)
    emit(ToClient.CANVAS_BG_COLOR, {'map_id':map_id, 'color':bg_color}, broadcast=True, include_self=True, to=str(campaign))

@socketio.on(FromClient.CANVAS_PARENT)
@validated
def change_parent(data:CanvasParentMsg) -> None:
    map_id = data['map_id']
    parent = data['parent']
    campaign = get_campaign(request)
    dlog('Changing parent to %r for map %r in campaign %r', parent, map_id, campaign)
    canvas.set_parent(campaign, map_id, parent)
    emit(ToClient.CANVAS_PARENT, data, broadcast=True, include_self=True, to=str(campaign))


# FIXME: wrong name, sets flags, not numbered
@socketio.on(FromClient.CANVAS_GRID_NUMBERED)
@validated
def change_grid_flags(data:CanvasGridNumberedMsg) -> None:
    map_id = data['map_id']
    flags = data['numbered']
    campaign = get_campaign(request)
    canvas.set_flags(campaign, map_id, flags)
    emit(ToClient.CANVAS_GRID_NUMBERED, {'map_id':map_id, 'numbered':flags}, broadcast=True, include_self=True, to=str(campaign))


@socketio.on(FromClient.CANVAS_DELETE_MAP_REQUEST)
@validated
def delete_map_request(map_id:int) -> None:
    campaign = get_campaign(request)
    logging.info('delete map: %r for campaign %r', map_id, campaign)
    was_deleted = canvas.delete_map(campaign, map_id)
    if was_deleted:
        emit(ToClient.CANVAS_DELETE_MAP, map_id, broadcast=True, include_self=True, to=str(campaign))

@socketio.on(FromClient.GET_NOTE)
@validated
def note_get(note_id: int) -> None:
    campaign = get_campaign(request)
    note = notes.get_note(campaign, note_id)
    if note is not None:
        emit(ToClient.GOT_NOTE, note)
    # return notes.get_note(campaign, note_id)

@socketio.on(FromClient.NOTE_SHOW)
@validated
def show_note(note_id:int) -> None:
    dlog('wtf %r', note_id)
    campaign = get_campaign(request)
    emit(ToClient.NOTE_SHOW, note_id, broadcast=True, include_self=True, to=str(campaign))


@socketio.on(FromClient.NEW_NOTE_REQUEST)
@validated
def new_note_request(parent:int) -> None:
    campaign = get_campaign(request)
    note_id = notes.new_note_request(campaign, parent)
    msg:NewNoteMsg = {'note_id':note_id, 'parent':parent}
    logging.info('new note: %r for campaign %r', msg, campaign)
    emit(ToClient.NEW_NOTE, msg, broadcast=True, include_self=False, to=str(campaign))
    emit(ToClient.NEW_NOTE_RESPONSE, msg)
    # return note_id

@socketio.on(FromClient.NOTE_UPDATE_TITLE)
@validated
def note_update_title(data:NoteUpdateTitle) -> None:
    campaign = get_campaign(request)
    notes.note_update_title(campaign, data['note_id'], data['title'])
    dlog('Updating note title. Note: %r. Room: %r. Title: %r', data['note_id'], campaign, data['title'])
    emit(ToClient.NOTE_UPDATE_TITLE, data, broadcast=True, include_self=False, to=str(campaign)) # type: ignore
    # emit(ToClient.NOTE_DIRTY, data['note_id'], broadcast=True, include_self=False, to=str(campaign))

@socketio.on(FromClient.NOTE_PARENT)
@validated
def note_update_parent(data:NoteParentMsg) -> None:
    campaign = get_campaign(request)
    notes.note_update_parent(campaign, data['note_id'], data['parent'])
    dlog('Updating note parent. Note: %r. Room: %r. parent: %r', data['note_id'], campaign, data['parent'])
    emit(ToClient.NOTE_PARENT, data, broadcast=True, include_self=False, to=str(campaign)) # type: ignore

@socketio.on(FromClient.NOTE_UPDATE_BODY)
@validated
def note_update_body(data:NoteUpdateBody) -> None:
    campaign = get_campaign(request)
    dlog('Updating note body. Note: %r. Room: %r', data['note_id'], campaign)
    notes.note_update_body(campaign, data['note_id'], data['body'])
    emit(ToClient.NOTE_DIRTY, data['note_id'], broadcast=True, include_self=False, to=str(campaign))

@socketio.on(FromClient.DELETE_NOTE_REQUEST)
@validated
def note_delete(note_id:int) -> None:
    campaign = get_campaign(request)
    logging.info('delete note: %r for campaign %r', note_id, campaign)
    notes.note_delete(campaign, note_id)
    emit(ToClient.NOTE_DELETE, note_id, broadcast=True, include_self=True, to=str(campaign))

@socketio.on(FromClient.RETRIEVE_ROLL_TABLES)
def retrieve_roll_tables() -> None:
    campaign = get_campaign(request)
    logging.info('retrieving roll tables for campaign %r', campaign)
    tables = chat.get_both_tables(current_user.userid, campaign)
    dlog('tables: %r', tables)
    emit(ToClient.ROLL_TABLES, tables)

@socketio.on(FromClient.GET_ROLL_TABLE_NAMES)
def get_roll_table_names() -> None:
    campaign = get_campaign(request)
    dlog('Getting roll table names for campaign %r', campaign)
    sh, pr = chat.get_both_tables(current_user.userid, campaign)
    names: RollTableNames = {'shared':[], 'private':[]}
    for t in sh:
        names['shared'].append(t['name'])
    for p in pr:
        names['private'].append(p['name'])
    emit(ToClient.ROLL_TABLE_NAMES, names)

@socketio.on(FromClient.UPDATE_ROLL_TABLES)
@validated
def update_roll_tables(tables:RollTables) -> None:
    campaign = get_campaign(request)
    logging.info('Setting roll tables for campaign %r', campaign)
    # logging.info('%r', tables);
    chat.update_roll_tables(current_user.userid, campaign, tables)

@socketio.on(FromClient.SPREADSHEET)
@validated
def spreadsheet(msg:SpreadSheetMsg) -> None:
    campaign = get_campaign(request)
    dlog("msg: %r", msg);
    response = sheets.handle(campaign, msg)
    if response is not None:
        emit(ToClient.SPREADSHEET, response, broadcast=True, include_self=True, to=str(campaign))

def get_html(info:db.CampaignInfo, mode:UiMode) -> str:
    global SCREEN
    if appconfig.DEV:
        SCREEN = r('dungeon.html')
    vals = {
        'userid':0,
        'darkmode': 0,
        'demo': 0,
        'chat': {'name':'anon'},
        'macros':{
            'macros':[],
            'variables':[],
            'characters':[],
        },
        'uimode': int(mode),
    }
    def update_vals(orig:dict, to_update:dict) -> None:
        for k in orig:
            if k not in to_update:
                continue
            if isinstance(orig[k], dict):
                update_vals(orig[k], to_update[k])
            else:
                orig[k] = to_update[k]
    assert current_user.is_authenticated
    update_vals(vals, settings.get_global(current_user.userid))
    update_vals(vals, settings.get_local(current_user.userid, info.id))
    vals['userid'] = current_user.userid
    dlog('get settings: %r', vals)
    result = SCREEN
    title = info.name.replace('-', ' ').replace('_', ' ').title()
    title = markupsafe.escape(title)
    if title:
        result = result.replace('<title></title>', f'<title>{title}</title>', 1)
    result = result.replace('"let SETTINGS = SETTINGS";', 'let SETTINGS = ' +json.dumps(vals)+';', 1)
    return result

@app.route('/')
def index() -> Any:
    return flask.redirect('/home')

# These legacy links need to be supported so that old urls
# will continue working.
LEGACY_CAMPAIGNS = {'horror_on_the_moors':3, 'greenskins1':5}

@app.route('/campaigns/<campaign>/<mode_s>')
@app.route('/campaigns/<campaign>')
@login_required
def get_campaign_request(campaign:str, mode_s:str='full') -> Any:
    if len(campaign) > 10: return abort(404)
    mode = {
        'full': UiMode.NORMAL,
        'chat': UiMode.CHAT,
        'notes': UiMode.NOTES,
        'macros': UiMode.MACROS,
    }.get(mode_s)
    if mode is None:
        return abort(404)
    # logging.info('campaign: %r', campaign)
    campaign_id: Optional[int]
    try:
        campaign_id = int(campaign)
    except ValueError:
        campaign_id = LEGACY_CAMPAIGNS.get(campaign)
        if campaign_id is not None:
            dest = f'/campaigns/{campaign_id}/{mode_s}' if mode_s != 'full' else f'/campaigns/{campaign_id}'
            return flask.redirect(dest)
    # logging.info('campaign_id: %r', campaign_id)
    if campaign_id is None:
        return abort(404)
    info = db.campaign_info(campaign_id)
    # logging.info('info: %r', info)
    if info is None:
        return abort(404)
    magicstr = request.args.get('magic')
    # logging.info('magic: %r', magicstr)
    if magicstr is not None and len(magicstr) < 25:
        logging.info('magic: %r', magicstr)
        try:
            magic = int(magicstr)
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
    resp = flask.Response(get_html(info, mode))
    # maybe the reverse-proxy should add these?
    resp.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    resp.headers['Cross-Origin-Embedder-Policy']= 'require-corp'
    return resp
    # return get_html(info, mode)
if appconfig.DEV:
    @app.route('/demos/dungeon.html')
    def get_demo() -> str:
        return r('demo.html')

    @app.route('/tiles/<tile>')
    def get_tile(tile:str) -> Any:
        return send_from_directory('Generated', tile)

    @app.route('/wasm/<wasm>')
    def get_wasm(wasm:str) -> Any:
        return send_from_directory('wasm', wasm)

    @app.route('/favicon.ico')
    def get_favicon() -> Any:
        return send_from_directory('Generated', 'favicon.ico')

    @app.route('/docs/<doc>')
    def get_doc(doc:str) -> Any:
        return r(doc)

    @app.route('/js/socket.io.js')
    def get_socket_io() -> Any:
        return send_from_directory('WebClient', 'socket.io.js')

    @app.route('/js/client.js')
    def get_client() -> Any:
        return Response(r('client.js'), mimetype='application/javascript')

    @app.route('/js/client.min.js')
    def get_clientmin() -> Any:
        return Response(r('client.min.js'), mimetype='application/javascript')

    @app.route('/js/dungeon.css')
    def get_css() -> Any:
        return Response(r('dungeon.css'), mimetype='text/css')

    @socketio.on(FromClient.DEBUG)
    def log_debug(msg:str) -> None:
        campaign = get_campaign(request)
        logging.info('campaign: %r - %r', campaign, msg)
        msg: ChatPlainMsg = (Msg.PLAIN, '', str(msg), )
        emit(ToClient.CHAT_STRUCTURED_MSG, [msg])

    @app.route('/kill')
    def kill() -> Any:
        raise SystemExit(0)
else:
    @socketio.on(FromClient.DEBUG)
    def log_debug(msg:str) -> None:
        return

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
    logging.info('Active connections: %r', nsids)
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

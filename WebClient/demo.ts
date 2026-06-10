//
// Copyright © 2021-2026, David Priver <david@davidpriver.com>
//

"use strict";

let cbs: Map<ToClient, any> = new Map();
function do_on(type: ToClient, cb:any):void{
    cbs.set(type, cb);
}

let map_ids = 1;
let note_ids = 1;

let rolltables: Array<any> = [[],[]];

function shuffle(array:Array<any>):void{
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function randint(min:number, max:number):number{
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roll_dice(die:UnrolledDiceExpr):RolledExpr{
    switch(die[0]){
        case DieExprTypes.NUMBER:
            return die;
        case DieExprTypes.DICE:{
            let vals = [];
            for(let i = 0; i < die[1]; i++){
                let hi = die[2];
                if(hi < 1)
                    vals.push(0);
                else
                    vals.push(randint(1, die[2]));
            }
            return [...die, vals];
        }
        case DieExprTypes.GROUP:
            return [DieExprTypes.GROUP, roll_dice(die[1])];
        case DieExprTypes.Unary:
            return [DieExprTypes.Unary, die[1], roll_dice(die[2])];
        case DieExprTypes.Binary:
            return [die[0], die[1], roll_dice(die[2]), roll_dice(die[3])];
        case DieExprTypes.NGROUP:{
            let values = [];
            for(let i = 0; i < die[1]; i++){
                values.push(roll_dice(die[2]));
            }
            return [DieExprTypes.NGROUP, values];
        }
    }
}

function interpret_chat_input(chatname:string, commands:Array<Command>):Array<any>{
    let responses: Array<any> = [];
    let styleflags: StyleFlags = 0;
    let color = '';
    function echo(user:string, text:string):void{
        responses.push([Msg.ECHOABLE_TEXT, user, text]);
    }
    function plain(user:string, text:string):void{
        responses.push([Msg.PLAIN, user, text]);
    }
    function dieroll(dice:RolledExpr):void{
        responses.push([Msg.DICEROLL, '', dice]);
    }
    function styled(user:string, text:string):void{
        responses.push([Msg.STYLED_TEXT, user, [text, styleflags, color]]);
    }
    function parse_style(line:string):void{
        const toks = line.toLowerCase().split(/\s/);
        for(let i = 0; i < toks.length; i++){
            const tok = toks[i];
            switch(tok){
                case 'bold':
                    styleflags ^= StyleFlags.BOLD;
                    break;
                case 'italic':
                    styleflags ^= StyleFlags.ITALIC;
                    break;
                case 'anon':
                    styleflags ^= StyleFlags.ANON;
                    break;
                case 'underline':
                case 'underlined':
                    styleflags ^= StyleFlags.UNDERLINE;
                    break;
                case 'box':
                case 'boxed':
                    styleflags ^= StyleFlags.BOXED;
                    break;
                case 'reset':
                    styleflags = StyleFlags.NONE;
                    break;
                case 'big':
                    styleflags ^= StyleFlags.BIG;
                    break;
                case 'color':
                case 'colour':
                {
                    let peek = i+1<toks.length? toks[i+1] : '';
                    for (let t of ['bold', 'italic', 'anon', 'underline', 'underlined', 'box', 'boxed', 'reset', 'color', 'colour', 'big']){
                        if(t == peek){
                            peek = '';
                            break;
                        }
                    }
                    color = peek;
                    if(peek){
                        styleflags |= StyleFlags.COLORED;
                        i++;
                    }
                    else {
                        styleflags &= ~StyleFlags.COLORED;
                    }
                }break;
            }
        }
    }
    /*
    function error(e:string):void{
        responses.push([Msg.ERROR, '', e])
    }
    */
    let apparent_user = chatname;
    for(let command of commands){
        let cc = command[0];
        if(cc != ChatCommand.NAME && cc != ChatCommand.STYLE){
            let line = command[1];
            if(cc != ChatCommand.SAY)
                echo(apparent_user, line);
            else if(styleflags)
                styled(apparent_user, line);
            else
                plain(apparent_user, line);
        }
        switch(command[0]){
            case ChatCommand.STYLE:
                parse_style(command[1]);
                break;
            case ChatCommand.ROLL:
                dieroll(roll_dice(command[2]));
                break;
            case ChatCommand.SAY:
                break;
            case ChatCommand.NAME:
                apparent_user = command[1];
                break;
            case ChatCommand.SHUFFLE:
                shuffle(command[2]);
                plain('', command[2].join(' '));
                break;
            case ChatCommand.CHOOSE:
                if(command[2].length)
                    plain('', shuffle_array(command[2])[0]);
                break;
            case ChatCommand.TABLE:
                break;
            case ChatCommand.MYTABLE:
                break;
            default:
                break;
        }
    }
    return responses;
}

function shuffle_array<T>(arr:Array<T>):Array<T>{
    if(arr.length < 2){
        return arr;
    }
    for(let i = 0; i < arr.length; i++){
        let j = randint(0, arr.length-i-1)+i;
        let tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }
    return arr;
}

let buffered: Array<any> = [];
function invoke_cb(type:ToClient, arg?:any):void{
    // console.log('invoke_cb', type, arg);
    let new_buffered = [];
    for(let [t, a] of buffered){
        let cb = cbs.get(t);
        if(!cb)
            new_buffered.push([t, a]);
        else{
            // console.log('was buffered', t, a)
            cb(a)
        }
    }
    let cb = cbs.get(type);
    if(!cb){
        // console.log('buffered', type, arg);
        new_buffered.push([type, arg]);
    }
    else {
        // console.log('invoked', type, arg);
        cb(arg);
    }
    buffered = new_buffered;
    // console.log('new_buffered.length', new_buffered.length);
}

function do_emit(type:FromClient, arg?:any, cb?:any):void{
    // console.log('do_emit', type, arg, cb);
    switch(type){
        case FromClient.STORE_LOCAL_SETTING:{
            if(arg[0] == 'chat' && arg[1] == 'name')
                invoke_cb(ToClient.USER_RENAME, [SETTINGS.userid, JSON.parse(arg[2])]);
        }break;
        case FromClient.CHAT_STRUCTURED_INPUT:{
            let responses = interpret_chat_input((arg as ChatCommandMessage).chatname, (arg as ChatCommandMessage).commands);
            if(responses.length)
                invoke_cb(ToClient.CHAT_STRUCTURED_MSG, responses);
        }break;
        case FromClient.CHAT_TEST_STRUCTURED_INPUT:{
            let responses = interpret_chat_input((arg as ChatCommandMessage).chatname, (arg as ChatCommandMessage).commands);
            if(responses.length)
                invoke_cb(ToClient.CHAT_TEST_STRUCTURED_RESPONSE, responses);
        }break;
        case FromClient.CHAT_DM:{
            if(!arg) break;
            let responses = interpret_chat_input((arg as ChatDirectCommandMessage).chatname, (arg as ChatDirectCommandMessage).commands);
            let msg = {users:[1, (arg as ChatDirectCommandMessage).to], msgs:responses};
            invoke_cb(ToClient.CHAT_DIRECT_MSG, msg);
        }break;
        case FromClient.JOIN:
            invoke_cb(ToClient.SESSION_ID, 0);
            break;
        case FromClient.POST_JOIN:
            // we need the other DOM listeners to fire first.
            setTimeout(() => {
                invoke_cb(ToClient.CANVAS_INITIALIZE_MAPS, []);
                invoke_cb(ToClient.CHAT_CLEAR, );
                invoke_cb(ToClient.CHAT_CREATE, []);
                invoke_cb(ToClient.CHAT_PRIVATE_CREATE, []);
                invoke_cb(ToClient.NOTES_INITIALIZE, []);
                invoke_cb(ToClient.USER_LIST, [[SETTINGS.userid, SETTINGS.chat.name]]);
            }, 0);
            break;
        case FromClient.CANVAS_CREATE_OBJECTS:
            break;
        case FromClient.CANVAS_DELETE:
            break;
        case FromClient.CANVAS_UPDATE:
            break;
        case FromClient.CANVAS_GATHER:
            invoke_cb(ToClient.CANVAS_GATHER, arg);
            break;
        case FromClient.CANVAS_BATTLE:
            invoke_cb(ToClient.CANVAS_BATTLE, arg);
            break;
        case FromClient.CANVAS_DUNGEON_MODE:
            invoke_cb(ToClient.CANVAS_DUNGEON_MODE, );
            break;
        case FromClient.CANVAS_CREATE_MAP:
            break;
        case FromClient.CANVAS_PING:
            invoke_cb(ToClient.CANVAS_PING, arg);
            break;
        case FromClient.CANVAS_NAME_MAP:
            break;
        case FromClient.CANVAS_NEW_MAP_REQUEST:{
            let new_map_id = map_ids++;
            invoke_cb(ToClient.CANVAS_CREATE_MAP, new_map_id);
            invoke_cb(ToClient.CANVAS_NAME_MAP, {'map_id':new_map_id, 'map_name':(arg as NewMapRequest).name});
            invoke_cb(ToClient.CANVAS_GRID_TYPE, {'map_id':new_map_id, 'grid_type':(arg as NewMapRequest).grid_type});
            invoke_cb(ToClient.CANVAS_GRID_NUMBERED, {'map_id':new_map_id, 'numbered':(arg as NewMapRequest).flags});
            invoke_cb(ToClient.CANVAS_GRID_COLOR, {'map_id':new_map_id, 'color':(arg as NewMapRequest).grid_color});
            invoke_cb(ToClient.CANVAS_BG_COLOR, {'map_id':new_map_id, 'color':(arg as NewMapRequest).bg_color});
        }break;
        case FromClient.CANVAS_GRID_TYPE:
            invoke_cb(ToClient.CANVAS_GRID_TYPE, arg);
            break;
        case FromClient.CANVAS_GRID_COLOR:
            invoke_cb(ToClient.CANVAS_GRID_COLOR, arg);
            break;
        case FromClient.CANVAS_BG_COLOR:
            invoke_cb(ToClient.CANVAS_BG_COLOR, arg);
            break;
        case FromClient.CANVAS_GRID_NUMBERED:
            invoke_cb(ToClient.CANVAS_GRID_NUMBERED, arg);
            break;
        case FromClient.CANVAS_DELETE_MAP_REQUEST:
            invoke_cb(ToClient.CANVAS_DELETE_MAP, arg);
            break;
        case FromClient.GET_NOTE: // ???
            break;
        case FromClient.NEW_NOTE_REQUEST:
            invoke_cb(ToClient.NEW_NOTE_RESPONSE, note_ids++);
            break;
        case FromClient.NOTE_UPDATE_TITLE:
            break;
        case FromClient.NOTE_UPDATE_BODY:
            break;
        case FromClient.DELETE_NOTE_REQUEST:
            invoke_cb(ToClient.NOTE_DELETE, arg);
            break;
        case FromClient.RETRIEVE_ROLL_TABLES:
            invoke_cb(ToClient.ROLL_TABLES, rolltables);
            break;
        case FromClient.GET_ROLL_TABLE_NAMES:{
            let o :{shared:any, private:any} = {shared:[], private:[]};
            for(let sh of rolltables[0])
                o.shared.push(sh.name);
            for(let sh of rolltables[1])
                o.private.push(sh.name);
            invoke_cb(ToClient.ROLL_TABLE_NAMES, o);
        }break;
        case FromClient.UPDATE_ROLL_TABLES:
            rolltables = arg;
            break;
        case FromClient.SPREADSHEET:{
            if(arg[0] == SpreadSheetMsgType.NEW_SHEET){
                arg[1].id = _spreadsheetid++;
                if(!arg[1].column_names.length){
                    for(let i = 0; i < 3; i++)
                        arg[1].column_names.push('');
                    for(let i = 0; i < 3*4; i++)
                        arg[1].cells.push(['','', 0]);
                }
            }
            invoke_cb(ToClient.SPREADSHEET, arg);
        }break;
        case FromClient.NOTE_SHOW:{
            invoke_cb(ToClient.NOTE_SHOW, arg);
        }break;
        case FromClient.CALENDAR:{
            invoke_cb(ToClient.CALENDAR, arg);
        }break;
        case FromClient.CLOCK:{
            if(arg.type == ClockMsgType.NEW)
                arg.id = ++_clockid;
            if(arg.type == ClockMsgType.EVENT_NEW)
                arg.id = ++_clockeventid;
            invoke_cb(ToClient.CLOCK, arg);
        }break;
    }
}
let _spreadsheetid = 0;
let _clockid = 0;
let _clockeventid = 0;

let SOCKET = {
    emit: do_emit,
    on: do_on,
    emitBuffered: function():void{
    },
    connected: false,
};
type Settings = {
    userid: number;
    darkmode: DarkMode;
    chat:{name: string;};
    demo: boolean;
    hidechat: boolean;
    macros:{
        macros: Array<Macro>;
        variables: Array<Variable>;
        characters: Array<Character>;
    };
    uimode: UiMode;
}
let SETTINGS:Settings = {
    userid: 1,
    darkmode: 0,
    chat: {name:'anon'},
    demo: true,
    hidechat: false,
    macros: {
        variables: [],
        macros: [],
        characters: [],
    },
    uimode: UiMode.NORMAL,
};

document.addEventListener('DOMContentLoaded', function():void{
    // @ts-ignore
    cbs.get('connect')();
});

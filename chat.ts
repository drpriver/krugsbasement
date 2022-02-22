const THISPAGE = window.location.pathname;

function setchatname(name:string){
    if(name) name = name.trim();
    if(!name) name = 'anon';
    sync_local(StorageCategory.CHAT, 'name', name);
}
// @ts-ignore

function add_chat_msgs(log:HTMLElement, msgs:Array<ChatMsg>, label_target?:(_:string)=>void){
    for(let i = 0; i < msgs.length; i++){
        const msg = msgs[i];
        const entry = elem_with_parent(log, 'div');
        const type_ = msg[0];
        const user_ = msg[1];
        switch(type_){
            case Msg.PLAIN:{
                const data = msg[2];
                if(user_){
                    const user = elem_with_text('b', user_+': ');
                    entry.appendChild(user);
                }
                const text = document.createTextNode(data);
                entry.appendChild(text);
            }break;
            case Msg.ECHOABLE_TEXT:{
                if(user_){
                    const user = elem_with_text('b', user_+': ');
                    entry.appendChild(user);
                }
                const data = msg[2];
                const span = elem_with_text('span', data);
                entry.appendChild(span);
                span.style.cursor = 'pointer';
                let msg_data = data;
                span.addEventListener('click', function(e){
                    e.stopPropagation();
                    e.preventDefault();
                    if(label_target)
                        label_target(msg_data);
                });
            }break;
            case Msg.ERROR:{
                const data = msg[2];
                const error = elem_with_text('span', data);
                error.classList.add('chat-error');
                entry.appendChild(error);
            }break;
            case Msg.DICEROLL:{
                const data = msg[2];
                entry.classList.add('dice-roll-msg');
                const r = data;
                const formatted = format_new_die_roll_result(r);
                entry.innerHTML += formatted;
            }break;
        }
    }
}

ONRECV(ToClient.CHAT_STRUCTURED_MSG, function(msgs:Array<ChatMsg>){
    const log = by_id('chat-history');
    add_chat_msgs(log, msgs, preprocess_and_send_chat);
    log.scrollTo({behavior:'smooth', top:log.scrollHeight});
});

ONRECV(ToClient.CHAT_CREATE, function(msgs:Array<ChatMsg>){
    const log = by_id('chat-history');
    add_chat_msgs(log, msgs, preprocess_and_send_chat);
    log.scrollTop = log.scrollHeight;
});

function clear_chat(){
    const log = by_id('chat-history');
    log.innerHTML = '';
}

ONRECV(ToClient.CHAT_CLEAR, function(){
    clear_chat();
});

function resize_chat(){
    const hist = by_id('chat-history');
    hist.scrollTo({top:hist.scrollHeight});
}

const enum RECENT_DIEROLLS {
    MAX = 4,
}

const DIEROLL_HISTORY:Array<string> = [];
document.addEventListener('DOMContentLoaded', function(){
    let pastrolls = get_local(StorageCategory.MACROS, 'dieroll-history');
    if(!pastrolls) pastrolls = [];
    else pastrolls = JSON.parse(pastrolls);
    const log = by_id('dice-history');
    for(let dieroll of pastrolls){
        add_dice_history_command(log, dieroll);
    }
});


function add_dice_history_command(log:HTMLDivElement, text:string):number {
    for(let prev of DIEROLL_HISTORY){
        if(prev == text) return 0;
    }
    DIEROLL_HISTORY.push(text);
    const entry = elem_with_parent(log, 'div');
    entry.style.width = '100%';
    entry.style.display = 'flex';
    const span = elem_with_text('span', text);
    span.style.cursor = 'pointer';
    entry.appendChild(span);
    span.addEventListener('click', function(e){
        e.stopPropagation();
        e.preventDefault();
        preprocess_and_send_chat(text);
    });
    span.addEventListener('contextmenu', function(e){
        e.stopPropagation();
        e.preventDefault();
        by_id('chatinput').value = text;
    });
    const button = elem_with_parent(entry, 'button');
    button.textContent = 'X';
    button.style.marginLeft = 'auto';
    button.addEventListener('click', function(){
        entry.remove();
        const index = DIEROLL_HISTORY.indexOf(text);
        if(index !== -1){
            DIEROLL_HISTORY.splice(index, 1)
            store_local(StorageCategory.MACROS, 'dieroll-history', JSON.stringify(DIEROLL_HISTORY));
        }
    });
    while(log.children.length > RECENT_DIEROLLS.MAX){
        log.children[0].remove()
        DIEROLL_HISTORY.shift();
    }
    return 1;
}

function add_dice_history_commands(commands: Array<Command>){
    const log = by_id('dice-history');
    let added = 0;
    for(let command of commands){
        if(command[0] != ChatCommand.ROLL)
            continue;
        // hack...
        let original = command[1];
        original = original.replace(/^\//, '');
        original = original.replace(/^roll/,'')
        original = original.replace(/^r/,'')
        original = original.replace(/\s/g, '');
        added += add_dice_history_command(log, original);
    }
    if(added){
        log.scrollTo({top:log.scrollHeight});
        store_local(StorageCategory.MACROS, 'dieroll-history', JSON.stringify(DIEROLL_HISTORY));
    }
}

function preprocess_and_send_chat(text:string){
    let commands = preprocess_command(text, EvaluateFlags.NONE);
    let to_send: ChatCommandMessage = {chatname:SETTINGS.chat.name, commands:commands};
    add_dice_history_commands(commands);
    EMIT(FromClient.CHAT_STRUCTURED_INPUT, to_send);
}
function preprocess_and_send_chat_private(text:string){
    let commands = preprocess_command(text, EvaluateFlags.NONE);
    let to_send: ChatCommandMessage = {chatname:SETTINGS.chat.name, commands:commands};
    EMIT(FromClient.CHAT_PRIVATE_INPUT, to_send);
}

function preprocess_and_send_chat_with_usings(text:string){
    let commands = preprocess_command(text, EvaluateFlags.USE_USINGS);
    let to_send: ChatCommandMessage = {chatname:SETTINGS.chat.name, commands:commands};
    add_dice_history_commands(commands);
    EMIT(FromClient.CHAT_STRUCTURED_INPUT, to_send);
}

let chat_options_init = false;
function chat_options_dialog(){
    let dialog = get_dialog('options');
    if(!dialog) return;
    const is_dev = SETTINGS.chat.name == 'dev';
    const pan_tool = by_id('pan-tool');
    dialog.f.chatname.value = SETTINGS.chat.name;
    dialog.f.dev.style.display = is_dev?'block':'none';
    dialog.f.fps.checked = SHOW_FPS;
    if(!chat_options_init){
        chat_options_init = true;
        dialog.f.fullscreen.addEventListener('click', function(){
            // @ts-ignore
            if(!document.fullscreenElement && ! document.webkitFullscreenElement) {
                if(document.documentElement.requestFullscreen)
                    document.documentElement.requestFullscreen();
                // @ts-ignore
                else if(document.documentElement.webkitRequestFullscreen)
                    // @ts-ignore
                    document.documentElement.webkitRequestFullscreen();
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
                // @ts-ignore
                else if(document.webkitExitFullscreen){
                    // @ts-ignore
                    document.webkitExitFullscreen();
                }
            }
        });
        dialog.f.system.name = 'darkmode';
        dialog.f.dark.name = 'darkmode';
        dialog.f.light.name = 'darkmode';
        dialog.f.system.checked = false;
        dialog.f.dark.checked = false;
        dialog.f.light.checked = false;
        dialog.f.hidepan.checked = pan_tool.style.display == 'none';
        dialog.f.hidepan.addEventListener('change', function(){
            change_pan_visibility(!dialog.f.hidepan.checked);
        });
        dialog.f.showzoom.checked = SHOW_ZOOMERS;
        dialog.f.showzoom.addEventListener('change', function(){
            set_zoomers(dialog.f.showzoom.checked);
        });
        switch(SETTINGS.darkmode){
            case DarkMode.SYSTEM: dialog.f.system.checked = true; break;
            case DarkMode.DARK:   dialog.f.dark.checked   = true; break;
            case DarkMode.LIGHT:  dialog.f.light.checked  = true; break;
        }
        dialog.f.system.onchange = function(){change_dark_mode(DarkMode.SYSTEM, 1);};
        dialog.f.dark.onchange   = function(){change_dark_mode(DarkMode.DARK, 1);};
        dialog.f.light.onchange  = function(){change_dark_mode(DarkMode.LIGHT, 1);};
    }
    dialog.show_handler = function(){
        dialog.f.chatname.focus();
    }
    dialog.ok_handler = function(){
        if(is_dev){
            const show_fps = dialog.f.fps;
            SHOW_FPS = show_fps.checked;
            request_render();
        }
        if(SETTINGS.chat.name != dialog.f.chatname.value.trim()){
            setchatname(dialog.f.chatname.value);
            sync_local(StorageCategory.CHAT, 'name', dialog.f.chatname.value);
        }
    }
    dialog.show();
}

document.addEventListener('DOMContentLoaded', function(){
    resize_chat();

    by_id('chat-options').addEventListener('click', chat_options_dialog);

    window.addEventListener('resize', resize_chat);
    const ta = by_id('chatinput');
    setup_chat(ta, preprocess_and_send_chat_with_usings);
});

function preprocess_command(value:string, flags:EvaluateFlags):Array<Command> {
    let result = [];
    value = value.replace(/[“”]/g,'"');
    value = value.replace(/[‘’]/g,"'");
    try {
        let evaled = evaluate(value, flags);
        for(let e of evaled){
            result.push(e);
        }
    }catch(e){
        alert(""+e);
        console.log(e);
    }
    return result;
}

const enum EvaluateFlags {
    NONE = 0,
    USE_USINGS = 1 << 0,
}
function evaluate(text:string, flags:EvaluateFlags):Array<Command>{
    let ns = get_script_variables();
    let vars: Map<string, number|string>;
    if(ns.has('global'))
        vars = ns.get('global')!;
    else
        vars = new Map();
    if(flags & EvaluateFlags.USE_USINGS){
        for(let g of Array.from(USED_VARIABLE_GROUPS).sort()){
            let more = ns.get(g.toLowerCase());
            if(!more) continue;
            for(let k of more.keys()){
                if(vars.has(k)){
                    const conflictingroups = [];
                    for(let g2 of Array.from(USED_VARIABLE_GROUPS).sort()){
                        let more2 = ns.get(g2.toLowerCase());
                        if(!more2) continue;
                        if(more2.has(k))
                            conflictingroups.push(g2);
                    }
                    const gs = conflictingroups.join("', '");
                    const errmess: Array<ChatErrorMsg> = [
                        [
                            Msg.ERROR,
                            '',
                            `Duplicate variable: '${k}'.`
                        ],
                        [
                            Msg.ERROR,
                            '',
                            `This error was detected for groups: '${gs}'.`
                        ],
                        [
                            Msg.ERROR,
                            '',
                            'Uncheck one of these groups to resolve this error.',
                        ]
                    ];
                    const log = by_id('chat-history');
                    add_chat_msgs(log, errmess, preprocess_and_send_chat);
                    log.scrollTo({behavior:'smooth', top:log.scrollHeight});
                    return [];
                }
            }
            vars = new Map([...vars, ...more]);
        }
    }
    return evaluate_script(text, vars, ns);
}
function format_new_die_roll_result(roll_result:RolledExpr):string{
    let [total, text] = format_new_die_roll(roll_result, false);
    total = rounddown(total);
    return text + `<br> = <span class="dice-total">${total}</span>`;
}

function rounddown(a:number):number{
    return Math.trunc(a) | 0;
}
const enum MINUS {m = '\u2212'};
function format_new_die_roll(roll_result:RolledExpr, tight:boolean):[number, string]{
    switch(roll_result[0]){
        case DieExprTypes.NUMBER:
            return [roll_result[1], `<span class="dice-constant">${roll_result[1]}</span>`];
        case DieExprTypes.DICE:{
            let text = tight && roll_result[1] > 1 ?'( ':'';
            let max = roll_result[2];
            let first = true;
            let total = 0;
            for(let v of roll_result[3]){
                if(first)
                    first = false;
                else
                    text += ' + ';
                total += v;
                text += '[';
                if(v == max){
                    text += '<span class="dice-roll dice-roll-max">';
                }
                else if(v == 1){
                    text += '<span class="dice-roll dice-roll-min">';
                }
                else {
                    text += '<span class="dice-roll">';
                }
                text += `${v}</span>]`;
            }
            if(tight && roll_result[1] > 1) text += ' )';
            return [total, text];
        }
        case DieExprTypes.GROUP:{
            let [total, text] = format_new_die_roll(roll_result[1], false);
            return [total, '( ' + text + ' )'];
        }
        case DieExprTypes.UNARY:{
            let [total, text] = format_new_die_roll(roll_result[2], true);
            switch(roll_result[1]){
                case UNARY.PLUS:
                    text = '+' + text;
                    return [total, text];
                case UNARY.NEG:
                    text = MINUS.m + text;
                    return [-total, text];
                case UNARY.NOT:
                    text = '!' + text;
                    return [+!total, text];
            }
        }
        case DieExprTypes.BINARY:{
            let op = roll_result[1];
            let [ltotal, ltext] = format_new_die_roll(roll_result[2], op == BINARY.MUL || op == BINARY.DIV);
            let [rtotal, rtext] = format_new_die_roll(roll_result[3], op == BINARY.MUL || op == BINARY.DIV);
            let result: [number, string];
            switch(op){
                case BINARY.ADD:
                    result = [rounddown(ltotal)+rounddown(rtotal), `${ltext} + ${rtext}`];
                    break;
                case BINARY.SUB:
                    result = [rounddown(ltotal)-rounddown(rtotal), `${ltext} ${MINUS.m} ${rtext}`];
                    break;
                case BINARY.MUL:
                    result = [ltotal*rtotal, `${ltext} &times; ${rtext}`];
                    break;
                case BINARY.DIV:
                    result = [rtotal?ltotal/rtotal:0, `${ltext} &divide; ${rtext}`];
                    break;
                case BINARY.EQ:
                    result = [+(rounddown(ltotal)==rounddown(rtotal)), `${ltext} ＝ ${rtext}`];
                    break;
                case BINARY.NE:
                    result = [+(rounddown(ltotal)!=rounddown(rtotal)), `${ltext} &ne; ${rtext}`];
                    break;
                case BINARY.GT:
                    result = [+(rounddown(ltotal) > rounddown(rtotal)), `${ltext} &gt; ${rtext}`];
                    break;
                case BINARY.GE:
                    result = [+(rounddown(ltotal) >= rounddown(rtotal)), `${ltext} &geq; ${rtext}`];
                    break;
                case BINARY.LT:
                    result = [+(rounddown(ltotal) < rounddown(rtotal)), `${ltext} &lt; ${rtext}`];
                    break;
                case BINARY.LE:
                    result = [+(rounddown(ltotal) <= rounddown(rtotal)), `${ltext} &leq; ${rtext}`];
                    break;
            }
            return result;
        }
    }
}

function err_dialog(html:string){
    const errpop = elem('section', null, 'hover');
    html += `
        <div class="hover-button-container">
            <button type="button" class="errpop-ok">Ok</button>
        </div>
        `;
    errpop.innerHTML = html;
    document.body.appendChild(errpop);
    const oks = errpop.getElementsByClassName('errpop-ok');
    oks[0]!.addEventListener('click', function(){
        errpop.remove();
    });
}

document.addEventListener('DOMContentLoaded',function(){
    let tablewindow = get_window('rolltable');
    let tbody = by_id('rolltable-body');
    let listview = make_list_view<number>(by_id('rolltable-group-list'), ListViewFlags.USER_RENAMABLE|ListViewFlags.USER_DELETABLE);
    let tableview = make_table_view<number>(tbody);
    let sharedtables: Array<RollTable> = [];
    let privtables: Array<RollTable> = [];
    let rolltables: Array<RollTable> = [];
    let current_table: RollTable | undefined;
    let rowid = 0;
    let newtableid = -1;
    tablewindow.hide_handler = function(){
        submit_tables();
    };
    let sh_tab = by_id('rolltable-shared');
    let pr_tab = by_id('rolltable-private');
    function switch_to(tbs:Array<RollTable>){
        if(tbs === sharedtables){
            sh_tab.classList.add('active-tab');
            pr_tab.classList.remove('active-tab');
        }
        else {
            pr_tab.classList.add('active-tab');
            sh_tab.classList.remove('active-tab');
        }
        if(rolltables === tbs)
            return;
        rolltables = tbs;
        setup_listview();
    }

    sh_tab.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        switch_to(sharedtables);
    });

    pr_tab.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        switch_to(privtables);
    });

    function setup_listview(){
        listview.clear();
        for(let rt of rolltables){
            listview.add_item(rt.name, rt.id);
        }
        if(!rolltables.length){
            listview.make_active(undefined);
        }
        else
            listview.make_active(rolltables[0].id);
    }

    ONRECV(ToClient.ROLL_TABLES, function(tables:RollTables){
        sharedtables = tables[0];
        privtables = tables[1];
        switch_to(sharedtables);
    });
    tablewindow.show_handler = function(){
        sharedtables = [];
        rolltables = [];
        privtables = [];
        current_table = undefined;
        rowid = 0;
        newtableid = -1;
        listview.clear();
        tableview.clear();
        EMIT(FromClient.RETRIEVE_ROLL_TABLES);
    };
    listview.activate_handler = function(id:number | undefined){
        let parenttable = tableview.tbody.parentNode! as HTMLTableElement;
        if(id === undefined){
            tableview.clear();
            parenttable.style.visibility = 'hidden';
            current_table = undefined;
            return;
        }
        for(let rt of rolltables){
            if(rt.id == id){
                current_table = rt;
                parenttable.style.visibility = 'initial';
                show_table(rt);
                return;
            }
        }
        tableview.clear();
        parenttable.style.visibility = 'hidden';
    }
    listview.user_rename_handler = function(id:number, name:string){
        for(let rt of rolltables){
            if(rt.id == id){
                rt.name = name;
                return;
            }
        }
    };
    listview.user_remove_handler = function(id:number){
        for(let i = 0; i < rolltables.length; i++){
            if(rolltables[i].id == id){
                rolltables.splice(i, 1);
                return;
            }
        }
    }
    function show_table(table:RollTable){
        tableview.clear();
        let length = table.entries.length;
        let row: HTMLTableRowElement | undefined = undefined;
        for(let i = 0; i < length; i++){
            const entry = table.entries[i];
            let id = rowid++;
            row = make_row(id, entry, table.entries);
            tableview.add_row(row, id);
        }
        if(row)
            (row.children[2].children[0] as any).focus();
    }
    function make_row(key:number, entry:RollTableEntry, entries:Array<RollTableEntry>):HTMLTableRowElement{
        let weight = entry.weight;
        let text = entry.value;
        let is_table = !!(entry.flags & ROLLTABLEFLAGS.IS_TABLE);
        const tr = elem('tr');
        function append(el:HTMLElement){
            const td = elem_with_parent(tr, 'td');
            td.appendChild(el);
        }

        const ud = elem('div', null, 'up-down');
        const up = elem_parent_text(ud, 'button', '▲', null, 'up');
        const down = elem_parent_text(ud, 'button', '▼', null, 'down');
        up.addEventListener('click', function(){
            for(let i = 0; i < entries.length; i++){
                if(entries[i] === entry){
                    if(i != 0){
                        let tmp = entries[i-1];
                        entries[i-1] = entries[i];
                        entries[i] = tmp;
                    }
                    break;
                }
            }
            tableview.move_row_by(key, -1);
        });
        down.addEventListener('click', function(){
            for(let i = 0; i < entries.length; i++){
                if(entries[i] == entry){
                    if(i != entries.length-1){
                        let tmp = entries[i+1];
                        entries[i+1] = entries[i];
                        entries[i] = tmp;
                    }
                    break;
                }
            }
            tableview.move_row_by(key, +1);
        });
        append(ud);

        const weightinp = elem('input');
        weightinp.value = ''+weight;
        weightinp.type = 'number';
        weightinp.addEventListener('change', function(){
            let w = +weightinp.value;
            if(!w) w = 1;
            entry.weight = w;
        });
        append(weightinp);

        const valinp = elem('input');
        valinp.type = 'text';
        valinp.value = text;
        valinp.addEventListener('change', function(){
            let v = valinp.value;
            if(!v) v = 'Untitled';
            entry.value = v;
        });
        valinp.addEventListener('keydown', function(e){
            if(e.key == 'Enter') {
                add_row();
                return;
            }
        });
        append(valinp);

        const tablecheck = elem('input');
        tablecheck.type = 'checkbox';
        tablecheck.checked = is_table;
        tablecheck.addEventListener('change', function(){
            if(tablecheck.checked)
                entry.flags |= ROLLTABLEFLAGS.IS_TABLE;
            else
                entry.flags &= ~ROLLTABLEFLAGS.IS_TABLE;
        });
        append(tablecheck);

        const del = elem_with_text('button', 'Delete');
        append(del);
        del.addEventListener('click', function(){
            tableview.remove_row(key);
            for(let i = 0; i < entries.length; i++){
                if(entries[i] === entry){// comparing for identity here. js sucks
                    entries.splice(i, 1);
                    if(entries.length == 0)
                        add_row();
                    return;
                }
            }
        });
        return tr;
    }
    function add_row(){
        if(current_table === undefined) return;
        const entry: RollTableEntry = {
            weight: 1,
            value: '',
            flags: 0,
        };
        let id = rowid++;
        const row = make_row(id, entry, current_table.entries);
        current_table.entries.push(entry);
        tableview.add_row(row, id);
        (row.children[2].children[0] as any).focus();
    }
    by_id('rolltable-add-table').addEventListener('click', function(){
        let dialog = get_dialog('simple-text');
        if(!dialog) return;
        dialog.title.textContent = 'Table Name';
        dialog.f.text.value = '';
        dialog.ok_handler = function(){
            let text = dialog.f.text.value.trim();
            if(!text) return;
            let id = --newtableid;
            const table = {
                name:text,
                id: id, // sending <0 to the server means the server should assign a new id
                entries: [{weight:1, value:"", flags:0}]
            };
            rolltables.push(table);
            listview.add_item(table.name, table.id);
            listview.make_active(table.id);
        };
        dialog.show_handler = function(){
            dialog.f.text.focus();
        };
        dialog.show();
    });

    function submit_tables(){
        EMIT(FromClient.UPDATE_ROLL_TABLES, [sharedtables, privtables]);
    }
    by_id('tables-button').addEventListener('click', tablewindow.show);
    /*
    ONRECV(ToClient.NEW_ROLL_TABLE, function(rts:RollTables){
        if(rts[0]){
            let rt = rts[0][0];
            sharedtables.push(rt)
            if(rolltables === sharedtables){
                listview.add_item(rt.name, rt.id);
                listview.make_active(rt.id);
            }
        }
        else{
            let rt = rts[1][0];
            privtables.push(rt);
            if(rolltables === privtables){
                listview.add_item(rt.name, rt.id);
                listview.make_active(rt.id);
            }
        }
    });
    */
});

document.addEventListener('DOMContentLoaded', function(){
    let USERS: Map<number, string> = new Map();
    let privateroll = get_window('privateroll');
    let targets = by_id('privateroll-targets');
    let lv = make_list_view<number>(targets, ListViewFlags.NONE);
    by_id('privateroll-button').addEventListener('click', function(){
        privateroll.show();
    });
    privateroll.outer.style.width = '30em';
    privateroll.outer.style.height = '400px';
    let log = by_id('privateroll-history');
    let chats: Map<number, Array<ChatMsg>> = new Map();
    let histories: Map<number, Array<string>> = new Map();
    function preproc_func(text:string){
        let commands = preprocess_command(text, EvaluateFlags.NONE);
        let to_send: ChatDirectCommandMessage = {chatname:SETTINGS.chat.name, to:lv.active?lv.active:SETTINGS.userid, commands:commands};
        EMIT(FromClient.CHAT_DM, to_send);
    }
    lv.activate_handler = function(k:number|undefined){
        if(k === undefined) return;
        log.innerHTML = '';
        let msgs = chats.get(k);
        if(k !== SETTINGS.userid){
            let name = USERS.get(k);
            if(!name) name = "anon";
            lv.rename(name, k);
        }
        if(msgs){
            add_chat_msgs(log, msgs, preproc_func);
            log.scrollTo({behavior:'smooth', top:log.scrollHeight});
        }
        let h = histories.get(k);
        hist.set_history(h?h:[]);
        chat.focus();
    };
    ONRECV(ToClient.CHAT_DIRECT_MSG, function(msg:ChatDirectResponse){
        let from = msg.users[0];
        let to   = msg.users[1];
        let user = (from == SETTINGS.userid)? to : from;
        if(msg.msgs){
            let prev = chats.get(user);
            if(prev !== undefined){
                for(let m of msg.msgs)
                    prev.push(m);
            }
        }
        if(lv.active !== user){
            if(user !== SETTINGS.userid){
                let name = USERS.get(user);
                if(!name) name = "anon";
                lv.rename(`${name}\u00A0(*)`, user);
            }
            return;
        }
        add_chat_msgs(log, msg.msgs, preproc_func);
        log.scrollTo({behavior:'smooth', top:log.scrollHeight});
    });
    let chat = by_id('privateroll-input');
    privateroll.show_handler = function(){
        chat.focus();
    };
    let hist = setup_chat(chat, preproc_func);
    ONRECV(ToClient.USER_LIST, function(users:Array<UserListItem>){
        lv.clear();
        log.innerHTML = '';
        for(let [uid, _] of users){
            if(!chats.has(uid))
                chats.set(uid, []);
            histories.set(uid, []);
        }
        for(let [uid, chatname] of users){
            lv.add_item(uid == SETTINGS.userid?`${chatname} (Me)` : chatname, uid);
            USERS.set(uid, chatname);
        }
        lv.make_active(users[0][0]);
    });
    ONRECV(ToClient.USER_RENAME, function(user:UserListItem){
        let [uid, chatname] = user;
        if(!chats.has(uid)){
            chats.set(uid, []);
            histories.set(uid, []);
            lv.add_item(chatname, uid);
        }
        USERS.set(uid, chatname);
        lv.rename(uid == SETTINGS.userid?`${chatname} (Me) `: chatname, uid);
    });
    ONRECV(ToClient.CHAT_PRIVATE_CREATE, function(data:Array<ChatHistory>){
        for(let [uid, msgs] of data){
            chats.set(uid, msgs);
        }
        if(lv.active !== undefined)
            lv.activate_handler!(lv.active);
    });
});

type TableView<K> = {
    // thead: HTMLTableSectionElement;
    tbody: HTMLTableSectionElement;
    add_row:(row:HTMLTableRowElement, key:K)=>void;
    clear:()=>void;
    remove_row:(key:K) =>void;
    get_row:(key:K) => HTMLTableRowElement|null;
    move_row_by:(key:K, dy:number)=>void;
    rows: Array<[K, HTMLTableRowElement]>;
}

function make_table_view<K>(tbody:HTMLTableSectionElement): TableView<K>{
    let result: TableView<K> = {
        tbody: tbody,
        add_row: function(row:HTMLTableRowElement, key:K){
            result.tbody.appendChild(row);
            result.rows.push([key, row]);
        },
        clear: function(){
            for(let [_, row] of result.rows){
                row.remove();
            }
            result.rows = [];
        },
        remove_row:function(key:K){
            for(let i = 0; i < result.rows.length; i++){
                let [k, row] = result.rows[i];
                if(k === key){
                    row.remove();
                    result.rows.splice(i, 1);
                    return;
                }
            }
        },
        get_row:function(key:K){
            for(let [k, row] of result.rows){
                if(k === key){
                    return row;
                }
            }
            return null;
        },
        move_row_by:function(key:K, dy:number){
            if(dy !== -1 && dy !== 1) throw new Error("unimplemented");
            let length = result.rows.length;
            for(let i = 0; i < length; i++){
                let [k, row] = result.rows[i];
                if(k === key){
                    // this code seems janky as fuck?
                    if(dy == -1 && i == 0) return;
                    if(dy == +1 && i == length-1) return;
                    if(dy == -1 && row.previousElementSibling){
                        let tmp = result.rows[i];
                        result.rows[i] = result.rows[i-1];
                        result.rows[i-1] = tmp;
                        result.tbody.insertBefore(row, row.previousElementSibling);
                    }
                    else if(dy == 1 && row.nextElementSibling){
                        let tmp = result.rows[i];
                        result.rows[i] = result.rows[i+1];
                        result.rows[i+1] = tmp;
                        result.tbody.insertBefore(row, row.nextElementSibling.nextElementSibling);
                    }
                    return;
                }
            }
        },
        rows: [],
    };
    return result;
}

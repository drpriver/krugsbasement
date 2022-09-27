//
// Copyright © 2021-2022, David Priver
//

const THISPAGE = window.location.pathname;

function setchatname(name:string){
    if(name) name = name.trim();
    if(!name) name = 'anon';
    sync_local(StorageCategory.CHAT, 'name', name);
}
// @ts-ignore

function add_chat_msgs(log:HTMLElement, msgs:Array<ChatMsg>, label_target?:(_:string, _:number, _:number)=>void){
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
                        label_target(msg_data, -1, -1);
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
        preprocess_and_send_chat(text, -1, -1);
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

function preprocess_and_send_chat(text:string, character_id:number, macro_id:number){
    let commands = preprocess_command(text, character_id, macro_id);
    let to_send: ChatCommandMessage = {chatname:SETTINGS.chat.name, commands:commands};
    add_dice_history_commands(commands);
    EMIT(FromClient.CHAT_STRUCTURED_INPUT, to_send);
}

let options_init = false;
function options_dialog(){
    let dialog = get_dialog('options');
    if(!dialog) return;
    const is_dev = SETTINGS.chat.name == 'dev';
    const pan_tool = by_id('pan-tool');
    dialog.f.chatname.value = SETTINGS.chat.name;
    dialog.f.dev.style.display = is_dev?'block':'none';
    dialog.f.fps.checked = SHOW_FPS;
    dialog.f['export-map'].addEventListener('click', function(){
        let data = export_maps();
        let a = document.createElement('a');
        a.download = 'maps.json'
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'text/plain'}));
        a.click();
    });
    dialog.f.screenshot.addEventListener('click', function(){
        screenshot_canvas(get_active_view());
    });
    if (SETTINGS.demo){
        dialog.f['import-map'].addEventListener('click', function(){
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.onchange = function(){
                const files = inp.files;
                if(!files) return;
                if(!files.length) return;
                const file = files[0];
                const fr = new FileReader();
                fr.onload = function(){
                    if(!fr.result) return;
                    // @ts-ignore
                    const new_data = JSON.parse(fr.result);
                    initialize_maps(new_data);
                    // Fix up our localid to avoid collisions.
                    let highest = 0;
                    for(let map of MAPS.values()){
                        for(let o of map.canvas_obj_array){
                            let local = o.id & 0xfffff;
                            if(local > highest) highest = local;
                        }
                    }
                    localid = highest;
                    dialog.hide();
                };
                fr.readAsText(file);
            };
            inp.click();
        });
    }
    else{
        dialog.f['import-map'].style.display = 'none';
    }
    if(!options_init){
        options_init = true;
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
        dialog.f.hidechat.checked = !!SETTINGS.hidechat;
        dialog.f.hidechat.addEventListener('change', function(){
            set_chat_vis(dialog.f.hidechat.checked);
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
        if(!IS_TOUCH) dialog.f.chatname.focus();
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

    by_id('options-button').addEventListener('click', options_dialog);

    window.addEventListener('resize', resize_chat);
    const ta = by_id('chatinput');
    setup_chat(ta, preprocess_and_send_chat);
});

function preprocess_command(value:string, character_id:number, macro_id:number):Array<Command> {
    let result = [];
    value = value.replace(/[“”]/g,'"');
    value = value.replace(/[‘’]/g,"'");
    try {
        let evaled = evaluate(value, character_id, macro_id);
        for(let e of evaled){
            result.push(e);
        }
    }catch(e){
        const log = by_id('chat-history');
        const errmess: ChatErrorMsg = [Msg.ERROR, '', ""+e];
        add_chat_msgs(log, [errmess], undefined);
        log.scrollTo({behavior:'smooth', top:log.scrollHeight});
        return [];
    }
    if(result.length > 25){
        const log = by_id('chat-history');
        const errmess: ChatErrorMsg = [Msg.ERROR, '', "Your command results in too much output. Do less."];
        add_chat_msgs(log, [errmess], undefined);
        log.scrollTo({behavior:'smooth', top:log.scrollHeight});
        return [];
    }
    return result;
}

function evaluate(text:string, character_id:number, macro_id:number):Array<Command>{
    let [ns, vars] = get_script_variables(character_id, macro_id);
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
        case DieExprTypes.Unary:{
            let [total, text] = format_new_die_roll(roll_result[2], true);
            switch(roll_result[1]){
                case Unary.PLUS:
                    text = '+' + text;
                    return [total, text];
                case Unary.NEG:
                    text = MINUS.m + text;
                    return [-total, text];
                case Unary.NOT:
                    text = '!' + text;
                    return [+!total, text];
            }
        }
        case DieExprTypes.Binary:{
            let op = roll_result[1];
            let [ltotal, ltext] = format_new_die_roll(roll_result[2], op == Binary.MUL || op == Binary.DIV);
            let [rtotal, rtext] = format_new_die_roll(roll_result[3], op == Binary.MUL || op == Binary.DIV);
            let result: [number, string];
            switch(op){
                case Binary.ADD:
                    result = [rounddown(ltotal)+rounddown(rtotal), `${ltext} + ${rtext}`];
                    break;
                case Binary.SUB:
                    result = [rounddown(ltotal)-rounddown(rtotal), `${ltext} ${MINUS.m} ${rtext}`];
                    break;
                case Binary.MUL:
                    result = [ltotal*rtotal, `${ltext} &times; ${rtext}`];
                    break;
                case Binary.DIV:
                    result = [rtotal?ltotal/rtotal:0, `${ltext} &divide; ${rtext}`];
                    break;
                case Binary.EQ:
                    result = [+(rounddown(ltotal)==rounddown(rtotal)), `${ltext} ＝ ${rtext}`];
                    break;
                case Binary.NE:
                    result = [+(rounddown(ltotal)!=rounddown(rtotal)), `${ltext} &ne; ${rtext}`];
                    break;
                case Binary.GT:
                    result = [+(rounddown(ltotal) > rounddown(rtotal)), `${ltext} &gt; ${rtext}`];
                    break;
                case Binary.GE:
                    result = [+(rounddown(ltotal) >= rounddown(rtotal)), `${ltext} &geq; ${rtext}`];
                    break;
                case Binary.LT:
                    result = [+(rounddown(ltotal) < rounddown(rtotal)), `${ltext} &lt; ${rtext}`];
                    break;
                case Binary.LE:
                    result = [+(rounddown(ltotal) <= rounddown(rtotal)), `${ltext} &leq; ${rtext}`];
                    break;
            }
            return result;
        }
    }
}

let ROLLTABLES: {shared:Array<RollTable>, private:Array<RollTable>} = {
    shared: [],
    private: []
};

// TAG handleROLL_TABLES
ONRECV(ToClient.ROLL_TABLES, function(tables:RollTables){
    ROLLTABLES.shared = tables[0];
    ROLLTABLES.private = tables[1];
    signal_for(ListenEvent.ROLLTABLES_RECEIVED);
    signal_for(ListenEvent.ROLLTABLES_RENAMED);
});
// TAG handleROLL_TABLE_NAMES
ONRECV(ToClient.ROLL_TABLE_NAMES, function(data:RollTableNames){
    // hack;
    let old_shared = ROLLTABLES.shared;
    let old_priv = ROLLTABLES.private;
    ROLLTABLES.shared = [];
    ROLLTABLES.private = [];
    for(let s of data.shared)
        ROLLTABLES.shared.push({name:s, id:0, entries:[]});
    for(let s of data.private)
        ROLLTABLES.private.push({name:s, id:0, entries:[]});
    signal_for(ListenEvent.ROLLTABLES_RENAMED);
    ROLLTABLES.shared = old_shared;
    ROLLTABLES.private = old_priv;
});

// TAG rolltables_window
document.addEventListener('DOMContentLoaded',function(){
    let tablewindow = get_window('rolltable');
    let tbody = by_id('rolltable-body');
    let listview = make_list_view<number>(by_id('rolltable-group-list'), ListViewFlags.USER_RENAMABLE|ListViewFlags.USER_DELETABLE);
    let tableview = make_table_view<number>(tbody);
    let current_tables: Array<RollTable> = [];
    let current_table: RollTable | undefined;
    let rowid = 0;
    let newtableid = -1;
    tablewindow.hide_handler = function(){
        submit_tables();
    };
    let sh_tab = by_id('rolltable-shared');
    let pr_tab = by_id('rolltable-private');
    function switch_to(tbs:Array<RollTable>){
        if(tbs === ROLLTABLES.shared){
            sh_tab.classList.add('active-tab');
            pr_tab.classList.remove('active-tab');
        }
        else {
            pr_tab.classList.add('active-tab');
            sh_tab.classList.remove('active-tab');
        }
        if(current_tables === tbs)
            return;
        current_tables = tbs;
        setup_listview();
    }

    sh_tab.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        switch_to(ROLLTABLES.shared);
    });

    pr_tab.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        switch_to(ROLLTABLES.private);
    });

    function setup_listview(){
        listview.clear();
        for(let rt of current_tables){
            listview.add_item(rt.name, rt.id);
        }
        if(!current_tables.length){
            listview.make_active(undefined);
        }
        else
            listview.make_active(current_tables[0].id);
    }

    listen_for(ListenEvent.ROLLTABLES_RECEIVED, function(){
        switch_to(ROLLTABLES.shared);
    });
    tablewindow.show_handler = function(){
        current_tables = [];
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
        for(let rt of current_tables){
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
        for(let rt of current_tables){
            if(rt.id == id){
                rt.name = name;
                return;
            }
        }
    };
    listview.user_remove_handler = function(id:number){
        for(let i = 0; i < current_tables.length; i++){
            if(current_tables[i].id == id){
                current_tables.splice(i, 1);
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
        if(row && !IS_TOUCH)
            (row.children[2].children[0] as any).focus();
    }
    function make_row(key:number, entry:RollTableEntry, entries:Array<RollTableEntry>):HTMLTableRowElement{
        let weight = entry.weight;
        let text = entry.value;
        let is_table = !!(entry.flags & RollTableFlags.IS_TABLE);
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
        valinp.addEventListener('paste', function(e:ClipboardEvent){
            e.stopPropagation();
            e.preventDefault();
            let data = e.clipboardData!.getData('text');
            take_paste(data);
            del.click();
        });
        append(valinp);

        const tablecheck = elem('input');
        tablecheck.type = 'checkbox';
        tablecheck.checked = is_table;
        tablecheck.addEventListener('change', function(){
            if(tablecheck.checked)
                entry.flags |= RollTableFlags.IS_TABLE;
            else
                entry.flags &= ~RollTableFlags.IS_TABLE;
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
        if(!IS_TOUCH)(row.children[2].children[0] as any).focus();
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
                id: id, // sending < 0 to the server means the server should assign a new id
                entries: [{weight:1, value:"", flags:0}]
            };
            current_tables.push(table);
            listview.add_item(table.name, table.id);
            listview.make_active(table.id);
        };
        dialog.show_handler = function(){
            if(!IS_TOUCH)dialog.f.text.focus();
        };
        dialog.show();
    });

    function submit_tables(){
        EMIT(FromClient.UPDATE_ROLL_TABLES, [ROLLTABLES.shared, ROLLTABLES.private]);
        signal_for(ListenEvent.ROLLTABLES_RENAMED);
    }
    function take_paste(text:string){
        if(current_table == undefined) return;
        let lines = text.split(/\n/);
        for(let line of lines){
            let split = line.split(/\t/);
            let value = '';
            let weight = 1;
            let flags = RollTableFlags.NONE;
            if(split.length > 1){
                value = split[1];
                if(split.length > 2){
                    let t = split[2].toLowerCase();
                    if(t  == 'true' || t == 't' || t == 'x' || t == '1' || t == 'yes')
                        flags = RollTableFlags.IS_TABLE;
                }
            }
            else
                value = split[0];
            let entry = {weight:weight, value:value, flags:flags};
            let id = rowid++;
            let row = make_row(id, entry, current_table.entries);
            current_table.entries.push(entry);
            tableview.add_row(row, id);
        }
    }
    by_id('rolltable-paste').addEventListener('click', function(){
        let prom = navigator.clipboard.readText();
        prom.then(take_paste);
    });
    by_id('tables-button').addEventListener('click', tablewindow.show);
});

// TAG chat
document.addEventListener('DOMContentLoaded', function(){
    let USERS: Map<number, string> = new Map();
    let privateroll = get_window('privateroll');
    let targets = by_id('privateroll-targets');
    let lv = make_list_view<number>(targets, ListViewFlags.NONE);
    let shtbs = by_id('privateroll-tables-shared');
    let prtbs = by_id('privateroll-tables-private');
    by_id('privateroll-button').addEventListener('click', function(){
        privateroll.show();
    });
    privateroll.outer.style.width = '30em';
    privateroll.outer.style.height = '400px';
    let log = by_id('privateroll-history');
    let chats: Map<number, Array<ChatMsg>> = new Map();
    let histories: Map<number, Array<string>> = new Map();
    // NOTE: for now this is the only producer/consumer of notifications, so
    // all the logic is localized here. If I come up with another reasonable
    // use case for notifications, I should move it out and come up with an
    // interface for it that allows removing several notifications at once (not
    // just your notification).
    let notifications: Array<HTMLElement> = [];

    function preproc_func(text:string, _:number, __:number){
        let commands = preprocess_command(text, -1, -1);
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
            log.scrollTo({top:log.scrollHeight});
        }
        let h = histories.get(k);
        hist.set_history(h?h:[]);
        if(!IS_TOUCH)chat.focus();
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
        if(lv.active !== user || privateroll.hidden){
            if(user !== SETTINGS.userid){
                let name = USERS.get(user);
                if(!name) name = "anon";
                lv.rename(`(*)\u00A0${name}`, user);
            }
            if(privateroll.hidden){
                let noti = by_id('notifications');
                let name = USERS.get(user);
                if(!name) name = "anon";
                let text = `${name} has messaged you.`;
                let should_add = true;
                for(let e of notifications){
                    if(e.firstChild!.textContent == text){
                        should_add = false;
                        break;
                    }
                }
                if(should_add){
                    let d = elem_with_parent(noti, 'div');
                    let i_el = elem_parent_text(d, 'i', text);
                    i_el.onclick = function(){
                        lv.make_active(user);
                        privateroll.show();
                    }
                    i_el.style.cursor = 'pointer';
                    notifications.push(d);
                }
            }
            return;
        }
        add_chat_msgs(log, msg.msgs, preproc_func);
        log.scrollTo({behavior:'smooth', top:log.scrollHeight});
    });
    let chat = by_id('privateroll-input');
    let hist = setup_chat(chat, preproc_func);
    privateroll.show_handler = function(){
        EMIT(FromClient.GET_ROLL_TABLE_NAMES);
        for(let e of notifications)
            e.remove()
        notifications = [];
        setup_macros();
        lv.make_active(lv.active);
        if(!IS_TOUCH)chat.focus();
    };
    let macs = by_id('privateroll-macros');
    make_tab_view(
        [
            by_id('privateroll-macros-tab'),
            by_id('privateroll-tables-tab'),
            by_id('privateroll-mytables-tab'),
        ],
        [
            macs,
            shtbs,
            prtbs,
        ]
    );
    listen_for(ListenEvent.ROLLTABLES_RENAMED, function(){
        shtbs.innerHTML = '';
        prtbs.innerHTML = '';
        for(let tb of ROLLTABLES.shared){
            let name = tb.name;
            let b = elem_parent_text(shtbs, 'button', name);
            b.addEventListener('click', function(){
                preproc_func(`table ${name}`, -1, -1);
            });
        }
        for(let tb of ROLLTABLES.private){
            let name = tb.name;
            let b = elem_parent_text(prtbs, 'button', name);
            b.addEventListener('click', function(){
                preproc_func(`mytable ${name}`, -1, -1);
            });
        }
    });
    function setup_macros(){
        macs.innerHTML = '';
        for(let ch of CHARACTERS.values()){
            for(let mid of ch.macros){
                let m = MACROS.get(mid)!;
                let b = elem_parent_text(macs, 'button', m.name);
                b.style.width = '100%';
                b.onclick = function(){preproc_func(m.body, ch.id, m.id)};
            }
        }
    }
    listen_for(ListenEvent.MACROS_RENAMED, setup_macros);
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

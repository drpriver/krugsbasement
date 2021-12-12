
const THISPAGE = window.location.pathname;

let CHATNAME = (function(){
    let name = get_local(StorageCategory.CHAT, 'name');
    // legacy
    if(!name)
        name = localStorage.getItem(`${THISPAGE}/chatname`);
    // also legacy
    if(!name)
        name = localStorage.getItem('chatname');
    // default name
    if(!name)
        name = 'anon';
    store_local(StorageCategory.CHAT, 'name', name);
    return name;
})();
function setchatname(name:string){
    if(name) name = name.trim();
    if(!name) name = 'anon';
    CHATNAME = name;
    store_local(StorageCategory.CHAT,'name', name);
}

function add_chat_msgs(log:HTMLElement, msgs:Array<ChatMsg>){
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
                    preprocess_and_send_chat(msg_data);
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

SOCKET.on(ToClient.CHAT_STRUCTURED_MSG, function(msgs:Array<ChatMsg>){
    const log = by_id('chat-history');
    add_chat_msgs(log, msgs);
    log.scrollTo({behavior:'smooth', top:log.scrollHeight});
});

SOCKET.on(ToClient.CHAT_CREATE, function(msgs:Array<ChatMsg>){
    const log = by_id('chat-history');
    add_chat_msgs(log, msgs);
    log.scrollTop = log.scrollHeight;
});

function clear_chat(){
    const log = by_id('chat-history');
    log.innerHTML = '';
}

SOCKET.on(ToClient.CHAT_CLEAR, function(){
    clear_chat();
});

function resize_chat(){
    const hist = by_id('chat-history');
    hist.scrollTo({top:hist.scrollHeight});
}

function preprocess_and_send_chat(text:string){
    let commands = preprocess_command(text, EvaluateFlags.NONE);
    let to_send: ChatCommandMessage = {chatname:CHATNAME, commands:commands};
    SOCKET.emit(FromClient.CHAT_STRUCTURED_INPUT, to_send);
}

function preprocess_and_send_chat_with_usings(text:string){
    let commands = preprocess_command(text, EvaluateFlags.USE_USINGS);
    let to_send: ChatCommandMessage = {chatname:CHATNAME, commands:commands};
    SOCKET.emit(FromClient.CHAT_STRUCTURED_INPUT, to_send);
}

function export_settings(e:MouseEvent){
    e.stopPropagation();
    e.preventDefault();
    const macros = MACROS;
    const settings = {macros:macros, chatname:CHATNAME};
    const s = JSON.stringify(settings, null, 1);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s], {type:'text/plain'}));
    a.download = "krugsbasementsettings.json";
    a.click();
}

function import_settings(finish:()=>void){
    const inp = document.createElement('input');
    inp.type = 'file';
    function show_err(err:any){
        err_dialog(
            `
            <div style="max-width:600px; margin:auto; padding:2em;">
            <h1>Unable to Load Settings</h1>
            <p> There was a problem loading the settings. Good luck!
            <br>
            <code>
            ${err}
            </code>
            </div>
            `);
    }
    function handlefiles(){
        const files = inp.files;
        if(!files)
            return;
        if(!files.length)
            return;
        const file = files[0];
        const fr = new FileReader();
        fr.addEventListener('load', function(){
            try {
                if(!fr.result)
                    return;
                const new_settings = JSON.parse(fr.result as string);
                // look before you leap
                if(new_settings.chatname && typeof new_settings.chatname !== 'string'){
                show_err('Non string chatname.');
                    return;
                }
                if(new_settings.macros){
                    // TODO: validate macros
                }

                if(new_settings.macros){
                    clear_macro_buttons();
                    MACROS.length = 0;
                    add_macros_and_buttons(new_settings.macros);
                }
                if(new_settings.chatname){
                    setchatname(new_settings.chatname);
                }
                finish();
            }
            catch(err) {
                finish();
                show_err(err);
                return;
            }

        });
        fr.readAsText(file);
    }
    inp.addEventListener('change', handlefiles, false);
    inp.click();
}

let chat_options_init = false;
function chat_options_dialog(){
    let dialog = get_dialog('options');
    if(!dialog) return;
    const is_dev = CHATNAME == 'dev';
    const pan_tool = by_id('pan-tool');
    dialog.f.chatname.value = CHATNAME;
    dialog.f.dev.style.display = is_dev?'block':'none';
    dialog.f.fps.checked = SHOW_FPS;
    if(!chat_options_init){
        chat_options_init = true;
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
        switch(current_dark_mode){
            case DarkMode.SYSTEM: dialog.f.system.checked = true; break;
            case DarkMode.DARK:   dialog.f.dark.checked   = true; break;
            case DarkMode.LIGHT:  dialog.f.light.checked  = true; break;
        }
        dialog.f.system.onchange = function(){change_dark_mode(DarkMode.SYSTEM);};
        dialog.f.dark.onchange   = function(){change_dark_mode(DarkMode.DARK);};
        dialog.f.light.onchange  = function(){change_dark_mode(DarkMode.LIGHT);};
        dialog.f.export.addEventListener('click', export_settings);
        dialog.f.import.addEventListener('click', function(){
            import_settings(dialog.hide);
        });
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
        setchatname(dialog.f.chatname.value);
    }
    dialog.show();
}

document.addEventListener('DOMContentLoaded', function(){
    resize_chat();

    by_id('tables-button').addEventListener('click', tables_button_dialog);
    by_id('tables2-button').addEventListener('click', tables2_button_dialog);
    by_id('chat-options').addEventListener('click', chat_options_dialog);

    window.addEventListener('resize', resize_chat);
    const ta = by_id('chatinput');
    const history: Array<string> = [];
    let history_index = 0;
    let current_text = "";
    ta.addEventListener('keydown', function(e){
        e.stopPropagation();
        let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
        if(modified) return;
        switch(e.key){
            case 'Enter':{
                e.stopPropagation();
                e.preventDefault();
                const value = ta.value;
                if(value.length){
                    ta.value = "";
                    preprocess_and_send_chat_with_usings(value);
                    if(!(history.length && value == history[history.length-1])){
                        history.push(value);
                    }
                    history_index = history.length;
                    current_text = "";
                }
            }break;
            case 'ArrowUp':{
                e.stopPropagation();
                e.preventDefault();
                if(history_index > 0 && history_index <= history.length){
                    if(history_index == history.length){
                        current_text = ta.value;
                    }
                    history_index--;
                    ta.value = history[history_index];
                }
            }break;
            case 'ArrowDown':{
                e.stopPropagation();
                e.preventDefault();
                if(history_index >= 0 && history_index < history.length){
                    history_index++;
                    if(history_index == history.length)
                        ta.value = current_text;
                    else
                        ta.value = history[history_index];
                }
            }break;
            case 'Escape':{
                ta.blur();
            }break;
        }
    });
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
                    err_dialog(`
                    <div style="max-width: 30em; margin:auto; padding: 1em;">
                    <h2>Error when processing commands</h2>
                    <p>A duplicate variable has been encountered:</p>
                    <p style="text-align:center;"><code>${k}</code></p>
                    <p>This is due to having multiple groups checked, where more than one group has the same variable defined. This error was detected for group <code>${g}</code>. Uncheck one of your groups to resolve this error.</p>
                    </div>
                    `);
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

function tables_button_dialog(){
    if(hover_is_open)
        return;
    SOCKET.emit(FromClient.RETRIEVE_ROLL_TABLES, function(rolltables:Array<RollTable>){
        if(hover_is_open)
            return;
        hover_is_open = true;
        const hoverpop = elem('section', null, 'hover');
        function remove_hoverpop(){
            document.body.removeChild(hoverpop);
            hover_is_open = false;
        }
        hoverpop.appendChild(elem_with_text('h2', 'Tables'));
        const tabcontainer = elem('div', 'hover-tab-container', 'hover-tab-container');
        hoverpop.appendChild(tabcontainer);
        const tabs_el = elem('div', 'hover-tabs');
        const new_table_button = elem_with_text('div', '\u0020+\u0020', 'new-table', 'hover-tab');
        new_table_button.addEventListener('click', function(){
            const table = {
                name: "Untitled",
                id: -1, // sending -1 to the server means the server should assign a new id
                entries: [{weight:1, value:"", flags:0}]
            };
            add_table(table);
        });
        tabs_el.appendChild(new_table_button);
        const tabs_contents_el = elem('div', 'hover-tab-contents');
        tabcontainer.appendChild(tabs_el);
        tabcontainer.appendChild(tabs_contents_el);

        const container = elem('div', null, 'hover-button-container');
        const import_ = elem_with_text('button', 'Import Table');
        import_.addEventListener('click', function(){
            const inp = document.createElement('input');
            inp.type = 'file';
            function show_err(err:any){
                err_dialog(
                    `
                    <div style="max-width:600px; margin:auto; padding2em;">
                    <h1> Unable to Import Table</h1>
                    <p>There was a problem loading the table. Oh well.</p>
                    <br>
                    <code>
                    ${err}
                    </code>
                    </div>
                    `);
            }
            function handlefiles(){
                const files = inp.files;
                if(!files)
                    return;
                if(!files.length)
                    return;
                const file = files[0];
                const fr = new FileReader();
                fr.addEventListener('load', function(){
                    try {
                        if(!fr.result)
                            return;
                        const new_table = JSON.parse(fr.result as string);
                        // look before you leap
                        if(new_table.name && typeof new_table.name !== 'string'){
                        show_err('Non string table name.');
                            return;
                        }
                        if(new_table.entries){
                            // TODO: validate macros
                        }

                        if(new_table.entries){
                            new_table.id = -1;
                            add_table(new_table);
                        }
                    }
                    catch(err) {
                        show_err(err);
                        return;
                    }
                });
                fr.readAsText(file);
            }
            inp.addEventListener('change', handlefiles, false);
            inp.click();
        });
        const ok = elem_with_text('button', 'Ok');
        ok.addEventListener('click', function(){
            submit_tables();
            remove_hoverpop();
        });
        ok.id = 'hoverpop-ok';
        const cancel = elem_with_text('button', 'Cancel');
        cancel.addEventListener('click', function(){
            remove_hoverpop();
        });
        cancel.id = 'hoverpop-cancel';
        container.appendChild(import_);
        container.appendChild(ok);
        container.appendChild(cancel);
        hoverpop.appendChild(container);
        type Table = {
            id: number;
            body: HTMLTableSectionElement;
            table: HTMLTableElement;
            t: HTMLDivElement;
            tablename:HTMLInputElement;
            toptab: HTMLDivElement;
        };
        const tabs:Array<HTMLDivElement> = [];
        const tables: Array<Table> = [];
        function add_table(table:RollTable){
            const tab = elem_with_text('div', table.name, null, 'hover-tab');
            tab.addEventListener('click', function(){
                for(let tablegroup of tables){
                    tablegroup.t.style.display = 'none';
                    tablegroup.toptab.classList.remove('active');
                }
                t.style.display = 'initial';
                tab.classList.add('active');
            });
            const t = elem('div', null, 'rolltable');
            t.style.display = 'none';
            t.appendChild(elem_with_text('b', 'Table Name:'));
            const tablename = elem_with_parent(t, 'input');
            tablename.type = 'text'
            tablename.value = table.name;
            tablename.addEventListener('input', function(){
                tab.innerText = tablename.value;
            });
            const table_el = elem_with_parent(t, 'table');
            {
                const thead = elem_with_parent(table_el, 'thead');
                const tr = elem_with_parent(thead, 'tr');
                for(let n of ["", "Weight", "Value", "Table?", ""]){
                    tr.appendChild(elem_with_text('th', n));
                }
            }
            const tbody = elem_with_parent(table_el, 'tbody');
            function append_row_element(tr:HTMLTableRowElement, el:HTMLElement){
                const td = elem_with_parent(tr, 'td');
                td.appendChild(el);
            }
            function delete_row(e:MouseEvent){
                e.preventDefault();
                e.stopPropagation();
                const row = ((e.currentTarget as HTMLElement).parentNode!.parentNode! as HTMLElement);
                const parent = row.parentNode!;
                row.remove();
                if(parent.children.length == 0){
                    add_row(1, "", false);
                }
            }
            function move_up(e:MouseEvent){
                e.preventDefault();
                e.stopPropagation();
                const row = ((e.currentTarget as HTMLElement).parentNode!.parentNode!.parentNode! as HTMLElement);
                const parent = row.parentNode!;
                if(row.previousSibling)
                    parent.insertBefore(row, row.previousSibling);
            }
            function move_down(e:MouseEvent){
                e.preventDefault();
                e.stopPropagation();
                const row = ((e.currentTarget as HTMLElement).parentNode!.parentNode!.parentNode! as HTMLElement);
                const parent = row.parentNode!;
                let next = row.nextSibling;
                if(next)
                    next = next.nextSibling;
                parent.insertBefore(row, next);
            }
            function add_row(weight:number, value:string, is_table:boolean){
                const tr = elem_with_parent(tbody, 'tr');

                const ud = elem('div', null, 'up-down');
                const up = elem_with_text('button', '▲', null, 'up');
                const down = elem_with_text('button', '▼', null, 'down');
                ud.appendChild(up);
                up.addEventListener('click', move_up);
                ud.appendChild(down);
                down.addEventListener('click', move_down);
                append_row_element(tr, ud);

                const weightinp = document.createElement('input');
                weightinp.value = ""+weight;
                weightinp.type = 'number';
                append_row_element(tr, weightinp);

                const valinp = document.createElement('input');
                valinp.type = 'text';
                valinp.value = value;
                append_row_element(tr, valinp);

                const tablecheck = document.createElement('input');
                tablecheck.type = 'checkbox';
                tablecheck.checked = is_table;
                append_row_element(tr, tablecheck);

                const delbutton = elem_with_text('button', 'Delete');
                append_row_element(tr,delbutton);
                delbutton.addEventListener('click', delete_row);
            }

            for(let i = 0; i < table.entries.length;i++){
                const entry = table.entries[i];
                add_row(entry.weight, entry.value, !!(entry.flags & ROLLTABLEFLAGS.IS_TABLE));
            }
            const d = elem('div', null, 'hover-button-container');
            const export_table = elem_with_text('button', 'Export Table');
            d.appendChild(export_table);
            d.addEventListener('click', function(){
                const name = tablename.value;
                const entries = [];
                for(let row of tbody.children){
                    const w = row.children[1].children[0] as HTMLInputElement;
                    const v = row.children[2].children[0] as HTMLInputElement;
                    const is_table = (row.children[3].children[0] as HTMLInputElement).checked;
                    entries.push({weight:+w.value, value:v.value, flags:is_table?ROLLTABLEFLAGS.IS_TABLE : ROLLTABLEFLAGS.NONE});
                }
                const out = {name:name, entries:entries};
                const s = JSON.stringify(out);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([s], {type:'text/plain'}));
                a.download = `${name}.json`
                a.click();
            });
            const addrowbutton = elem_with_text('button', 'Add Row');
            addrowbutton.addEventListener('click', function(){
                add_row(1, "", false);
            });
            d.appendChild(addrowbutton);
            t.appendChild(d);
            tabs_contents_el.appendChild(t);
            tabs_el.insertBefore(tab, new_table_button);
            tabs.push(tab);
            tables.push({body:tbody, id:table.id, table:table_el, t:t, tablename:tablename, toptab:tab});
        }
        for(let rt of rolltables)
            add_table(rt);
        if(!tables.length)
            add_table({
                name: "Untitled",
                id: -1, // sending -1 to the server means the server should assign a new id
                entries: [{weight:1, value:"", flags:0}]
            });
        tables[0].t.style.display = 'initial';
        tabs[0].classList.add('active');
        function submit_tables(){
            const outtables: Array<RollTable> = [];
            for(let tableelems of tables){
                const name = tableelems.tablename.value;
                const id = tableelems.id;
                const entries: Array<RollTableEntry> = [];

                for(let row of tableelems.body.children){
                    const w = row.children[1].children[0] as HTMLInputElement;
                    const v = row.children[2].children[0] as HTMLInputElement;
                    const is_table = (row.children[3].children[0] as HTMLInputElement).checked;
                    entries.push({weight:+w.value, value:v.value, flags:is_table?ROLLTABLEFLAGS.IS_TABLE : ROLLTABLEFLAGS.NONE});
                }
                outtables.push({name:name, id:id, entries:entries});
            }
            SOCKET.emit(FromClient.UPDATE_ROLL_TABLES, outtables);
        }
        document.body.appendChild(hoverpop);
    });
}

function tables2_button_dialog(){
    let tablewindow = get_window('rolltable');
    tablewindow.show();
}

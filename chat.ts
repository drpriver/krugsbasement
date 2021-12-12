
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

type SavedMacro = {
    group: string;
    name: string;
    body: string;
    id: number;
};
type Macro = {
    groupid: number;
    name: string;
    body: string;
    id: number;
};
let macrogroupid = 0;
const MACROGROUPIDS: Map<number, string> = new Map();
function macro_group_id(g: string): number{
    for(let [k, v] of MACROGROUPIDS.entries()){
        if(v == g) return k;
    }
    let id = ++macrogroupid;
    MACROGROUPIDS.set(id, g);
    return id;
}

let macro_id = 0;
const MACROS: Array<Macro> = (function(){
    let saved:Array<SavedMacro> = get_local(StorageCategory.MACROS, 'macros');
    if(!saved){
        // legacy macros
        let macros_string = localStorage.getItem(`${THISPAGE}/MACROS`);
        if(!macros_string){
            // for backwards compat with unnamespaced macro storage.
            // Delete this in a few weeks when we've all played.
            macros_string = localStorage.getItem('MACROS');
        }
        let macros = [];
        if(macros_string)
            macros = JSON.parse(macros_string);
        // handle old macros
        saved = [];
        if(!Array.isArray(macros)){
            for(let [key, value] of Object.entries(macros)){
                if(typeof key !== "string")
                    continue;
                if(typeof value !== "string")
                    continue
                saved.push({name:key, body:value, group:"", id:0});
            }
        }
        else {
            for(let m of macros){
                if(!m.name)
                    continue;
                if(!m.body)
                    continue;
                saved.push({name:m.name, body:m.body, group:m.group?m.group:"", id:0});
            }
        }
        store_local(StorageCategory.MACROS, 'macros', saved);
    }
    for(let i = 0; i < saved.length; i++){
        saved[i].id = i;
    }
    macro_id = saved.length;
    let result: Array<Macro> = [];
    for(let sm of saved){
        result.push({
            groupid: macro_group_id(sm.group),
            name: sm.name,
            body: sm.body,
            id: sm.id,
        });
    }
    return result;
}());
const MACROGROUPS: Map<string, HTMLDivElement> = new Map();
document.addEventListener('DOMContentLoaded', function(){
    for(let i = 0; i < MACROS.length; i++){
        const m = MACROS[i];
        add_macro_button(m.name, MACROGROUPIDS.get(m.groupid)!, i);
    }
});

function save_macros(){
    let to_save: Array<SavedMacro> = [];
    for(let m of MACROS){
        to_save.push({
            group: MACROGROUPIDS.get(m.groupid)!,
            name: m.name,
            body: m.body,
            id: m.id,
        });
    }
    store_local(StorageCategory.MACROS, 'macros', to_save);
}

function add_macro(m:Macro){
    MACROS.push(m);
    save_macros();
}
function add_macros(macros:Array<Macro>){
    for(let m of macros)
        MACROS.push(m);
    save_macros();
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

function macro_by_id(id:number):Macro{
    for(let m of MACROS){
        if(m.id == id) return m;
    }
    throw new Error();
}


document.addEventListener('DOMContentLoaded', function(){
    let win = get_window('macros');
    const button = by_id('macros-button');
    button.addEventListener('click', function(){
        win.show();
    });
    let col1 = by_id('macros-group-list');
    let col2 = by_id('macros-list');
    let dualview = make_dual_list_view<number, number>(col1, col2);
    for(let macro of MACROS){
        let gn = MACROGROUPIDS.get(macro.groupid);
        dualview.add_item1(gn?gn:"General", macro.groupid);
        dualview.add_item2(macro.name, macro.groupid, macro.id);
    }
    const macro_area       = by_id('macro-view-edit');
    const editor_container = by_id('macro-editor');
    const macro_title_area = by_id('macro-view-title');
    const del_macro_button = by_id('delete-macro');
    const new_macro        = by_id('new-macro');
    const new_category     = by_id('new-macro-group');
    const log              = by_id('macro-test-log');
    const test_button = by_id('test-macro');
    const use_button = by_id('use-macro');
    let m: Macro | undefined;
    function delete_macro(ma:Macro){
        const index = MACROS.indexOf(ma);
        MACROS.splice(index, 1);
        m = undefined;
        dualview.remove2(ma.groupid, ma.id);
        save_macros();
    }
    dualview.activate2_handler = function(groupid:number, id:number){
        m = macro_by_id(id);
        (log as any).replaceChildren();
        editor_container.style.visibility = 'visible';
        macro_area.value = m.body;
        macro_title_area.value = m.name;
    };
    dualview.activate1_handler = function(groupid: number){
        m = undefined;
        editor_container.style.visibility = 'hidden';
        macro_area.value = ''
        macro_title_area.value = '';
    };
    new_macro.addEventListener('click', function(){
        let new_macro: Macro;
        if(m){
            new_macro = {
                groupid: m.groupid,
                id: macro_id++,
                name: 'Untitled',
                body: '',
            };
        }
        else if(dualview.active1 !== undefined){
            new_macro = {
                groupid: dualview.active1,
                id: macro_id++,
                name: 'Untitled',
                body: '',
            };
        }
        else {
            return;
        }
        add_macro(new_macro);
        dualview.add_item2(new_macro.name, new_macro.groupid, new_macro.id);
        dualview.make_active2(new_macro.groupid, new_macro.id);
    });
    new_category.addEventListener('click', function(){
        let dialog = get_dialog('simple-text');
        if(!dialog) return;
        dialog.title.textContent = 'Category Name';
        dialog.ok_handler = function(){
            let text = dialog.f.text.value.trim();
            if(!text) return;
            let beforeid = macrogroupid;
            let id = macro_group_id(text);
            if(id == beforeid) return;
            dualview.add_item1(text, id);
            dualview.make_active1(id);
        };
        dialog.show_handler = function(){
            dialog.f.text.focus();
        };
        dialog.show();
    });
    test_button.addEventListener('click', function(){
        if(!m) return;
        let commands = evaluate(m.body, EvaluateFlags.NONE);
        (log as any).replaceChildren();
        if(commands.length){
            let to_send: ChatCommandMessage = {chatname:CHATNAME, commands:commands};
            SOCKET.emit(FromClient.CHAT_TEST_STRUCTURED_INPUT, to_send, function(response:Array<ChatMsg>){
                add_chat_msgs(log, response);
            });
        }
    });
    use_button.addEventListener('click', function(){
        if(!m) return;
        preprocess_and_send_chat(m.body);
    });
    del_macro_button.addEventListener('click', function(){
        let dialog = get_dialog('macro-deletion');
        if(!dialog) return;
        if(!m) return;
        dialog.f.checkbox.checked = false;
        dialog.ok_handler = function(){
            const should_delete = dialog.f.checkbox.checked;
            if(should_delete && m)
                delete_macro(m);
        };
        dialog.show();
    });
    macro_area.addEventListener('input', function(){
        if(!m) return;
        m.body = macro_area.value;
        save_macros();
    });
    macro_title_area.addEventListener('input', function(){
        if(!m) return;
        m.name = macro_title_area.value;
        dualview.rename2(m.name, m.groupid, m.id);
        save_macros();
    });
    if(MACROS.length)
        dualview.make_active2(MACROS[0].groupid, MACROS[0].id);

});

function add_macro_button(name:string, group:string, macro_index:number){
    const macro_button = elem_with_text('button', name, null, 'macro-button');
    macro_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        let macro = MACROS[macro_index];
        if(!macro) return;
        preprocess_and_send_chat(macro.body);
    });
    let macrogroup = MACROGROUPS.get(group);
    if(!macrogroup){
        const macro_tabs = by_id('macro-tabs');
        const macro_buttons = by_id('macro-buttons');
        const tab = elem_with_text('div', group?group:"General");
        tab.classList.add('macro-group-title');
        macro_tabs.appendChild(tab);
        const is_first = macro_tabs.children.length == 1;
        if(is_first){
            tab.classList.add('active');
        }
        macrogroup = elem('div', null, 'macro-group');
        if(!is_first)
            macrogroup.style.display = 'none';
        macro_buttons.appendChild(macrogroup);
        MACROGROUPS.set(group, macrogroup);
        tab.addEventListener('click', function(e:MouseEvent){
            e.stopPropagation();
            e.preventDefault();
            for(let el of macro_tabs.children){
                if(tab.isSameNode(el)){
                    el.classList.add('active');
                }
                else {
                    el.classList.remove('active');
                }
            }
            for(let mg of MACROGROUPS.values()){
                mg.style.display = 'none';
            }
            macrogroup!.style.display = 'grid';
        });
    }
    macrogroup.appendChild(macro_button);
}
function clear_macro_buttons(){
    const macro_buttons = Array.from(document.getElementsByClassName('macro-button'));
    for(let mb of macro_buttons){
        mb.remove();
    }
    const macros_tabs = Array.from(by_id('macro-tabs').children);
    for(let m of macros_tabs)
        m.remove();
    const macros_buttons = Array.from(by_id('macro-buttons').children);
    for(let m of macros_buttons)
        m.remove();
    MACROGROUPS.clear();
}

function add_macro_and_button(m:Macro){
    add_macro(m);
    add_macro_button(m.name, MACROGROUPIDS.get(m.groupid)!, MACROS.length-1);
}
function add_macros_and_buttons(macros:Array<Macro>){
    let start = MACROS.length;
    add_macros(macros);
    for(let m of macros){
        add_macro_button(m.name, MACROGROUPIDS.get(m.groupid)!, start++);
    }
}
function do_macro_buttons(){
    clear_macro_buttons();
    let i = 0;
    for(let m of MACROS)
        add_macro_button(m.name, MACROGROUPIDS.get(m.groupid)!, i++);
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
    const tables_button = by_id('tables-button');
    tables_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        tables_button_dialog();
    });
    const options_button = by_id('chat-options');
    options_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        chat_options_dialog();
    });

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
    function remove_errpop(){
        document.body.removeChild(errpop);
    }
    const oks = document.getElementsByClassName('errpop-ok');
    if(oks.length){
        oks[oks.length-1].addEventListener('click', function(){
            remove_errpop();
        });
    }
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

document.addEventListener('DOMContentLoaded', function(){
    const container = by_id('tool-container');
    const handle = by_id('tool-container-handle');
    setup_movable_window(container, handle, WINDOWFLAGS.REMEMBER_POSITION);
    setup_zsorted_window(container);
    ensure_window_is_completely_on_screen(container);
});

const enum ScriptVariableType {
    NUMBER = 0,
    BOOLEAN = 1,
    STRING  = 2,
}
const enum ScriptVariableFlags {
    NONE = 0,
    // actually means it rarely changes
    UI = 1 << 0,
    DELETED = 1 << 1,
}

type ScriptVariable = {
    group: string;
    name: string;
    type: ScriptVariableType;
    value: number | string;
    id: number; // gets reset on load time, this is just for across rename consistency.
    flags: ScriptVariableFlags;
}
let current_script_variable_id = 0;
const SCRIPTVARIABLES: Array<ScriptVariable> = (function(){
    const result:Array<ScriptVariable> = [];
    let variables: Array<ScriptVariable>|undefined = get_local(StorageCategory.MACROS, 'variables');
    if(variables === undefined){
        return result;
    }
    for(let sv of variables){
        if(sv.flags & ScriptVariableFlags.DELETED)
            continue;
        sv.id = current_script_variable_id++;
        result.push(sv);
    }
    return result;
})();
let save_variables_in_flight = false;
function actually_save_the_variables(){
    save_variables_in_flight = false;
    const to_save = [];
    for(let sv of SCRIPTVARIABLES){
        if(sv.flags & ScriptVariableFlags.DELETED)
            continue;
        to_save.push(sv);
    }
    store_local(StorageCategory.MACROS,'variables', to_save);
}
// window.addEventListener('beforeunload', actually_save_the_variables, false);
function save_variables(){
    if(save_variables_in_flight) return;
    save_variables_in_flight = true;
    setTimeout(actually_save_the_variables, 1000);
}

function get_script_variables():Map<string, Map<string, number|string>>{
    let result = new Map();
    for(let sv of SCRIPTVARIABLES){
        if(sv.flags & ScriptVariableFlags.DELETED)
            continue;
        let group = sv.group.toLowerCase();
        let m;
        if(!result.has(group)){
            m = new Map();
            result.set(group, m);
        }
        else
            m = result.get(group);
        m.set(sv.name.toLowerCase(), sv.value);
    }
    return result;
}

document.addEventListener('DOMContentLoaded', function(){
    const var_button = by_id('variables-button');
    let variables = get_window('variables');
    const floater = get_window('float-variables');
    const var_groups = by_id('variables-group-list');
    const var_table  = by_id('variables-table');
    const var_group_name = by_id('variable-group-name');
    var_group_name.addEventListener('input', function(){
        let new_group = var_group_name.value;
        for(let sv of SCRIPTVARIABLES){
            if(sv.group == active_group)
                sv.group = new_group;
        }
        active_group = new_group;
        setup();
    });
    const var_add_group = by_id('variables-add-category');
    var_add_group.addEventListener('click', function(){
        active_group = 'Untitled';
        setup();
    })
    const var_add_var = by_id('variable-add-variable');
    var_add_var.addEventListener('click', function(){
        let sv = {
            group: active_group,
            name: '',
            type: ScriptVariableType.NUMBER,
            id: current_script_variable_id++,
            flags: ScriptVariableFlags.NONE,
            value: 0,
        };
        SCRIPTVARIABLES.push(sv);
        add_table_row(sv);
    });
    let active_group = 'Global';
    var_button.addEventListener('click', function(){
        if(!variables.hidden) return;
        variables.show();
        setup();
    });
    let floater_was_visible = false;;
    variables.hide_handler = function(){
        if(floater_was_visible)
            floater.show();
        actually_save_the_variables();
    };
    variables.show_handler = function(){
        floater_was_visible = !floater.hidden;
        floater.hide();
    };
    function add_table_row(sv:ScriptVariable){
        let row = elem_with_parent(var_table, 'div', null, 'variables-row');
        row.classList.add('variable-table-row');
        let d = elem_with_parent(row, 'div');
        let select = elem_with_parent(d, 'select', null, null);
        let numopt = elem('option');
        numopt.innerText = "Number";
        numopt.value = "" + ScriptVariableType.NUMBER;
        select.options.add(numopt);
        let boolopt = elem('option');
        boolopt.innerText = "Boolean";
        boolopt.value = ""+ScriptVariableType.BOOLEAN;
        select.options.add(boolopt);
        let stropt = elem('option');
        stropt.innerText = "Expression";
        stropt.value = ""+ScriptVariableType.STRING;
        select.options.add(stropt);
        select.addEventListener('input', function(){
            save_variables();
            sv.type = +select.value as ScriptVariableType;
            switch(+select.value as ScriptVariableType){
                case ScriptVariableType.NUMBER:
                    inpb.style.display = 'none';
                    inpn.style.display = 'initial';
                    inps.style.display = 'none';
                    break;
                case ScriptVariableType.BOOLEAN:
                    inpb.style.display = 'initial';
                    inpn.style.display = 'none';
                    inps.style.display = 'none';
                    break;
                case ScriptVariableType.STRING:
                    inpb.style.display = 'none';
                    inpn.style.display = 'none';
                    inps.style.display = 'initial';
                    break;
            }
            select.blur();
        });
        d = elem_with_parent(row, 'div');
        let name = elem_with_parent(d, 'input', null, null);
        name.value = sv.name;
        name.addEventListener('input', function(){
            sv.name = name.value.replace(/\s/g, '_');
            save_variables();
        });
        d = elem_with_parent(row, 'div');
        let inpn = elem_with_parent(d, 'input', null, null);
        inpn.type = "number";
        inpn.value = ""+sv.value;
        inpn.addEventListener('input', function(){
            sv.value = +inpn.value;
            inpb.checked = !!inpn.value;
            inps.value = ""+inpn.value;
            save_variables();
        });
        let inpb = elem_with_parent(d, 'input', null, null);
        inpb.type = "checkbox";
        inpb.checked = !!sv.value;
        inpb.addEventListener('change', function(){
            sv.value = +inpb.checked;
            inpn.value = ""+(+inpb.checked);
            inps.value = ""+(+inpb.checked);
            save_variables();
        });
        let inps = elem_with_parent(d, 'input', null, null);
        inps.value = ""+sv.value;
        inps.addEventListener('input', function(){
            sv.value = inps.value;
            inpn.value = ""+(+inps.value);
            inpb.checked = !!(+inps.value);
            save_variables();
        });
        switch(sv.type){
            case ScriptVariableType.NUMBER:{
                inpb.style.display='none';
                inps.style.display='none';
                select.selectedIndex = 0;
            }break;
            case ScriptVariableType.BOOLEAN:{
                inpn.style.display='none';
                inps.style.display='none';
                select.selectedIndex = 1;
            }break;
            case ScriptVariableType.STRING:{
                inpb.style.display='none';
                inpn.style.display='none';
                select.selectedIndex = 2;
            }break;
        }
        d = elem_with_parent(row, 'div');
        let uicheck = elem_with_parent(d, 'input');
        uicheck.type = "checkbox";
        uicheck.checked = !!(sv.flags & ScriptVariableFlags.UI);
        uicheck.addEventListener('change', function(){
            if(uicheck.checked){
                sv.flags |= ScriptVariableFlags.UI;
            }
            else {
                sv.flags &= ~ScriptVariableFlags.UI;
            }
            save_variables();
        });
        d = elem_with_parent(row, 'div');
        let delbutton = elem_with_parent(d, 'button');
        delbutton.innerText = '✘';
        delbutton.addEventListener('click', function(){
            sv.flags |= ScriptVariableFlags.DELETED;
            row.remove();
            save_variables();
        });
    }
    function group_click(group:string){
        return function(){
            active_group = group;
            setup();
        };
    }
    function setup(){
        for(let gd of Array.from(var_groups.getElementsByTagName('div')))
            gd.remove();

        let groups_: Set<string> = new Set();
        for(let sv of SCRIPTVARIABLES){
            if(sv.flags & ScriptVariableFlags.DELETED)
                continue;
            groups_.add(sv.group);
        }
        let groups = Array.from(groups_);
        groups.sort();
        if(!groups_.has(active_group)){
            const d = document.createElement('div');
            d.innerText = active_group;
            d.classList.add('active');
            d.addEventListener('click', group_click(active_group));
            var_groups.appendChild(d);
        }
        for(let g of groups){
            const d = document.createElement('div');
            d.innerText = g;
            if(g == active_group)
                d.classList.add('active');
            d.addEventListener('click', group_click(g));
            var_groups.appendChild(d);
        }
        for(let vr of Array.from(var_table.getElementsByClassName('variables-row'))){
            if(vr.id == 'variables-table-header')
                continue
            vr.remove();
        }
        for(let sv of SCRIPTVARIABLES.sort((a, b) => strcmp(a.name, b.name))){
            if(sv.flags & ScriptVariableFlags.DELETED)
                continue;
            if(sv.group != active_group) continue;
            add_table_row(sv);
        }
        if(var_group_name.value != active_group)
            var_group_name.value = active_group;
    }
    function strcmp(a:string, b:string){
        if(a < b) return -1;
        if(a > b) return 1;
        return 0;
    }
    const float_container = by_id('float-variables-container');
    floater.show_handler = function(){
        SCRIPTVARIABLES.sort((a, b) =>{
            if(a.group == b.group) return 0;
            if(a.group == 'Global') return -1;
            if(b.group == 'Global') return 1;
            return strcmp(a.group, b.group)
        });
        (float_container as any).replaceChildren();
        let has_any = false;
        let last_group = '';
        let n = 0;
        let holder:HTMLDivElement|null = null;;
        let new_used_groups:Set<string> = new Set();
        const group_checkboxes:Map<string, HTMLInputElement> = new Map();
        for(let sv of SCRIPTVARIABLES){
            if(sv.flags & ScriptVariableFlags.DELETED)
                continue;
            has_any = true;
            if(sv.group != last_group){
                let d = elem_with_parent(float_container, 'div');
                const h = elem_with_parent(d, 'h3');
                h.style.margin = '0';
                h.style.display = 'inline';
                const l = elem_with_parent(h, 'label');
                l.textContent = sv.group;
                if(sv.group != 'Global'){
                    let gid = `use-group-for-${sv.group}`;
                    l.htmlFor = gid;
                    const inp = elem_with_parent(d, 'input');
                    group_checkboxes.set(sv.group, inp);
                    inp.type = 'checkbox';
                    inp.id = gid;
                    if(USED_VARIABLE_GROUPS.has(sv.group)){
                        inp.checked = true;
                        new_used_groups.add(sv.group);
                    }
                    inp.addEventListener('change', function(){
                        if(inp.checked){
                            add_to_used_variable_group_consistently(sv.group);
                            for(let [k, v] of group_checkboxes.entries()){
                                if(USED_VARIABLE_GROUPS.has(k))
                                    v.checked = true;
                                else
                                    v.checked = false;
                            }
                        }
                        else
                            USED_VARIABLE_GROUPS.delete(sv.group);
                        store_local(StorageCategory.MACROS, 'used-variables', Array.from(USED_VARIABLE_GROUPS));
                    });
                }
                last_group = sv.group;
                holder = elem_with_parent(float_container, 'div');
                holder.style.display = 'table';
            }
            if(!(sv.flags & ScriptVariableFlags.UI))
                continue;
            const row = elem_with_parent(holder!, 'div');
            row.style.display = 'table-row';
            const name = elem_with_parent(row, 'label');
            name.textContent = sv.name;
            name.style.width = '4em';
            name.style.display = 'table-cell';
            let id = 'float-var-id-'+n++;
            name.htmlFor = id;
            const inpwrap = elem_with_parent(row, 'div');
            inpwrap.style.width = '4em';
            inpwrap.style.display = 'table-cell';
            const inp = elem_with_parent(inpwrap, 'input');
            inp.style.width = '4em';
            inp.id = id;
            switch(sv.type){
                case ScriptVariableType.BOOLEAN:
                    inp.type = 'checkbox';
                    inp.checked = !!sv.value;
                    inp.addEventListener('change', function(){
                        sv.value = +inp.checked;
                        save_variables();
                    });
                break;
                case ScriptVariableType.NUMBER:
                    inp.type = 'number';
                    inp.value = ""+sv.value;
                    inp.addEventListener('input', function(){
                        sv.value = +inp.value;
                        save_variables();
                    });
                break;
                case ScriptVariableType.STRING:
                    inp.value = ""+sv.value;
                    inp.addEventListener('input', function(){
                        sv.value = inp.value;
                        save_variables();
                    });
                break;
            }
        }
        if(!has_any){
        }
        USED_VARIABLE_GROUPS = new_used_groups;
        store_local(StorageCategory.MACROS, 'used-variables', Array.from(USED_VARIABLE_GROUPS));
    };
    floater.hide_handler = function(){
    };
    const quickvar_button = by_id('quickvar-button');
    quickvar_button.addEventListener('click', function(){
        if(variables.hidden)
            floater.show();
    });
});

let USED_VARIABLE_GROUPS: Set<string> = (function():Set<string>{
    let result = get_local(StorageCategory.MACROS, 'used-variables');
    if(result === undefined) return new Set();
    return new Set(result as Array<string>);
})();

function add_to_used_variable_group_consistently(group:string){
    let vars = get_script_variables();
    let these_vars = vars.get(group.toLowerCase());
    if(!these_vars || these_vars.size == 0){
        USED_VARIABLE_GROUPS.add(group);
        return;
    }
    for(let g of USED_VARIABLE_GROUPS){
        let v = vars.get(g.toLowerCase());
        if(!v || v.size == 0)
            continue;
        for(let k of these_vars.keys()){
            if(v.has(k.toLowerCase())){
                USED_VARIABLE_GROUPS.delete(g);
                break;
            }
        }
    }
    USED_VARIABLE_GROUPS.add(group);
}

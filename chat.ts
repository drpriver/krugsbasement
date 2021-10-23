const enum MSG {
    PLAIN = 0,
    DICEROLL = 1,
    ERROR = 2,
}
const enum ROLLTYPE {
    DICE = 0,
    PRODUCT = 1,
    SUM = 2,
}
type DieRoll = {
    type: ROLLTYPE; // always .DICE
    base: number;
    negative: boolean;
    values: Array<number>;
}
type GroupRoll = {
    type: ROLLTYPE; // either .PRODUCT or 
    values: Array<DieRoll | GroupRoll>
}
type Roll = GroupRoll | DieRoll;
type RollMsg = {
    roll: Roll;
    total: number;
};
type ChatMsg = {
    type: MSG;
    user: string;
    data: string | RollMsg;
}

const THISPAGE = window.location.pathname;

let chatname = localStorage.getItem(`${THISPAGE}/chatname`);
// This is for backwards compatibility. Remove this code path in the future
// once things have been successfully saved.
if(!chatname){
    chatname = localStorage.getItem('chatname');
    if(chatname)
        localStorage.setItem(`${THISPAGE}/chatname`, chatname);
}
if(!chatname)
    chatname = "anon";
function setchatname(name:string){
    if(name)
        name = name.trim();
    if(!name)
        name = 'anon';
    chatname = name;
    localStorage.setItem(`${THISPAGE}/chatname`, name);
}

function add_chat_msgs(log:HTMLElement, msgs:Array<ChatMsg>){
    for(let i = 0; i < msgs.length; i++){
        const msg = msgs[i];
        const entry = elem_with_parent(log, 'div');
        switch(msg.type){
            case MSG.PLAIN:{
                if(msg.user){
                    const user = elem_with_text('b', msg.user+': ');
                    entry.appendChild(user);
                }
                const text = document.createTextNode(msg.data as string);
                entry.appendChild(text);
            }break;
            case MSG.DICEROLL:{
                entry.classList.add('dice-roll-msg');
                const r = msg.data as RollMsg;
                const formatted = format_die_roll_result(r);
                entry.innerHTML += formatted;
            }break;
            case MSG.ERROR:{
                const error = elem_with_text('span', msg.data as string);
                error.classList.add('chat-error');
                entry.appendChild(error);
            }break;
        }
    }
}

SOCKET.on('chat-msg', function(msgs:Array<ChatMsg>){
    const log = document.getElementById('chat-history')!;
    add_chat_msgs(log, msgs);
    log.scrollTo({behavior:'smooth', top:log.scrollHeight});
});

SOCKET.on('chat-create', function(msgs:Array<ChatMsg>){
    const log = document.getElementById('chat-history')!;
    add_chat_msgs(log, msgs);
    log.scrollTop = log.scrollHeight;
});

function clear_chat(){
    const log = document.getElementById('chat-history')!;
    log.innerHTML = '';
}
SOCKET.on('chat-clear', function(){
    clear_chat();
});

function resize_chat(){
    const hist = document.getElementById('chat-history')!;
    hist.scrollTo({top:hist.scrollHeight});
}

type Macro = {
    group: string;
    name: string;
    body: string;
};
const MACROS: Array<Macro> = (function(){
    let macros_string = localStorage.getItem(`${THISPAGE}/MACROS`);
    if(!macros_string){
        // for backwards compat with unnamespaced macro storage.
        // Delete this in a few weeks when we've all played.
        macros_string = localStorage.getItem('MACROS');
        if(macros_string)
            localStorage.setItem(`${THISPAGE}/MACROS`, macros_string);
    }
    if(!macros_string)
        return []
    const macros = JSON.parse(macros_string);
    // handle old macros
    const result: Array<Macro> = [];
    if(!Array.isArray(macros)){
        for(let [key, value] of Object.entries(macros)){
            if(typeof key !== "string")
                continue;
            if(typeof value !== "string")
                continue
            result.push({name:key, body:value, group:""});
        }
    }
    else {
        for(let m of macros){
            if(!m.name)
                continue;
            if(!m.body)
                continue;
            result.push({name:m.name, body:m.body, group:m.group?m.group:""});
        }
    }
    return result;
}());
const MACROGROUPS: Map<string, HTMLDivElement> = new Map();
document.addEventListener('DOMContentLoaded', function(){
    for(let i = 0; i < MACROS.length; i++){
        const m = MACROS[i];
        add_macro_button(m.name, m.group, i);
    }
});
function add_macro(m:Macro){
    MACROS.push(m);
    localStorage.setItem(`${THISPAGE}/MACROS`, JSON.stringify(MACROS));
}
function add_macros(macros:Array<Macro>){
    for(let m of macros){
        MACROS.push(m);
    }
    localStorage.setItem(`${THISPAGE}/MACROS`, JSON.stringify(MACROS));
}

function add_macro_button(name:string, group:string, macro_index:number){
    const macro_button = elem_with_text('button', name, null, 'macro-button');
    macro_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        let macro = MACROS[macro_index];
        if(!macro)
            return;
        let text = macro.body;
        SOCKET.emit('chat-input', {chatname:chatname, text:text});
    });
    // const macros = document.getElementById('macros')!;
    let macrogroup = MACROGROUPS.get(group);
    if(!macrogroup){
        const macro_tabs = document.getElementById('macro-tabs') as HTMLDivElement;
        const macro_buttons = document.getElementById('macro-buttons') as HTMLDivElement;
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
    const macros_tabs = Array.from(document.getElementById('macro-tabs')!.children);
    for(let m of macros_tabs)
        m.remove();
    const macros_buttons = Array.from(document.getElementById('macro-buttons')!.children);
    for(let m of macros_buttons)
        m.remove();
    MACROGROUPS.clear();
}

function add_macro_and_button(m:Macro){
    add_macro(m);
    add_macro_button(m.name, m.group, MACROS.length-1);
}
function add_macros_and_buttons(macros:Array<Macro>){
    let start = MACROS.length;
    add_macros(macros);
    for(let m of macros){
        add_macro_button(m.name, m.group, start++);
    }
}

function export_settings(e:MouseEvent){
    e.stopPropagation();
    e.preventDefault();
    const macros = MACROS;
    const settings = {macros:macros, chatname:chatname};
    const s = JSON.stringify(settings);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s], {type:'text/plain'}));
    a.download = "krugsbasementsettings.json";
    a.click();

}
function import_settings(e:MouseEvent, remove_hoverpop:()=>void){
    e.stopPropagation();
    e.preventDefault();
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
                    const name = document.getElementById('hover-chatname');
                    if(name){
                        (name as HTMLInputElement).value = new_settings.chatname;
                    }
                }
            remove_hoverpop();
            }
            catch(err) {
                remove_hoverpop();
                show_err(err);
                return;
            }

        });
        fr.readAsText(file);
    }
    inp.addEventListener('change', handlefiles, false);
    inp.click();
}
function macros_dialog(){
    if(hover_is_open)
        return;
    hover_is_open = true;
    const hoverpop = elem('section', null, 'hover');
    type TabStuff = {
        tab: HTMLDivElement;
        table: HTMLTableElement;
        tbody: HTMLTableSectionElement;
    };
    function delete_macro(e:MouseEvent){
        e.preventDefault();
        e.stopPropagation();
        const row = ((e.currentTarget as HTMLElement).parentNode!.parentNode! as HTMLElement);
        const parent = row.parentNode!;
        row.remove();
        if(parent.children.length == 0){
            add_row(current_group, "", "");
        }
    }
    function move_macro_up(e:MouseEvent){
        e.preventDefault();
        e.stopPropagation();
        const row = ((e.currentTarget as HTMLElement).parentNode!.parentNode!.parentNode! as HTMLElement);
        const parent = row.parentNode!;
        if(row.previousSibling)
            parent.insertBefore(row, row.previousSibling);
    }
    function move_macro_down(e:MouseEvent){
        e.preventDefault();
        e.stopPropagation();
        const row = ((e.currentTarget as HTMLElement).parentNode!.parentNode!.parentNode! as HTMLElement);
        const parent = row.parentNode!;
        let next = row.nextSibling;
        if(next)
            next = next.nextSibling;
        parent.insertBefore(row, next);
    }
    const mapping: Map<string, TabStuff> = new Map();
    const groups: Array<string> = [];
    function add_row(group:string, name:string, body:string){
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div class="up-down"><button class="up">▲</button><button class="down">▼</button></div>
            <td><input type="text" value="${name}">
            <td><textarea rows="3" cols="40">${body}</textarea>
            <td><button class="delete-macro-button">Delete</button>
        `;
        const button = tr.getElementsByClassName('delete-macro-button')[0] as HTMLButtonElement;
        button.addEventListener('click', delete_macro);
        const up = tr.getElementsByClassName('up')[0] as HTMLButtonElement;
        up.addEventListener('click', move_macro_up);
        const down = tr.getElementsByClassName('down')[0] as HTMLButtonElement;
        down.addEventListener('click', move_macro_down);
        const ts = mapping.get(group)!;
        ts.tbody.appendChild(tr);
    }
    function make_tab_stuff(group:string):void{
        const name = group? group : "General";
        const tab = elem_with_text('div', name, null, 'hover-tab');
        groups.push(group);
        const table = elem('table', null, 'hover-tab-table');
        table.innerHTML = `
            <thead><tr>
                <th>
                <th>Name
                <th>Macro
                <th>
            </tr></thead>
        `;
        const tbody = document.createElement('tbody');
        table.appendChild(tbody);
        const t: TabStuff = {
            tab:tab,
            table:table,
            tbody:tbody,
        };
        mapping.set(group, t);
    }
    for(let m of MACROS){
        if(!mapping.has(m.group))
            make_tab_stuff(m.group);
        add_row(m.group, m.name?m.name:"", m.body?m.body:"");
    }
    if(!mapping.has("")){
        groups.push("");
        make_tab_stuff("");
        add_row("", "", "");
    }

    let html = `
        <h2>Macros</h2>
        <div id="hover-tab-container" class="hover-tab-container">
        </div>
        <div class="hover-button-container">
            <button id="hover-add-macro">+ Add Macro</button>
            <button id="export-settings">Export</button>
            <button id="import-settings">Import</button>
        </div>
        <div class="hover-button-container">
            <button type="button" id="hoverpop-ok">Ok</button>
            <button type="button" id="hoverpop-cancel">Cancel</button>
        </div>
    `;
    hoverpop.innerHTML = html;
    const tabcontainer = hoverpop.getElementsByClassName('hover-tab-container')[0] as HTMLDivElement;
    const tabs = elem('div', 'hover-tabs');
    const tabcontents = elem('div', 'hover-tab-contents');
    tabcontainer.appendChild(tabs);
    tabcontainer.appendChild(tabcontents);
    let current_group = groups[0];
    // cut-n-paste: very similar code is in the new tab below.
    for(let i = 0; i < groups.length; i++){
        let group = groups[i];
        const t = mapping.get(group)!;
        if(group != current_group){
            t.table.style.display = 'none';
        }
        else {
            t.tab.classList.add('active');
        }
        tabs.appendChild(t.tab);
        tabcontents.appendChild(t.table);
        t.tab.addEventListener('click', function(){
            for(let ts of mapping.values()){
                ts.tab.classList.remove('active');
                ts.table.style.display = 'none';
            }
            t.tab.classList.add('active');
            t.table.style.display = 'initial';
            current_group = group;
        });
    }
    const new_tab = elem_with_parent(tabs, 'div');
    const new_tab_text = elem_with_parent(new_tab, 'input', 'new-tab-input');
    new_tab_text.size = 8;
    const new_tab_button = elem_with_text('span', '+');
    new_tab_text.type = 'text';
    new_tab.appendChild(new_tab_button);
    new_tab.addEventListener('click', function(e:MouseEvent){
        e.preventDefault();
        e.stopPropagation();
        const value = new_tab_text.value.trim();
        if(!value)
            return;
        if(mapping.has(value))
            return;
        groups.push(value);
        make_tab_stuff(value)
        add_row(value, "", "");
        current_group = value;
        const t = mapping.get(value)!;
        tabs.insertBefore(t.tab, new_tab);
        tabcontents.appendChild(t.table);
        // this is copy-paste-y from above
        t.tab.addEventListener('click', function(){
            for(let ts of mapping.values()){
                ts.tab.classList.remove('active');
                ts.table.style.display = 'none';
            }
            t.tab.classList.add('active');
            t.table.style.display = 'initial';
            current_group = value;
        });
        for(let i = 0; i < groups.length; i++){
            let group = groups[i];
            const t = mapping.get(group)!;
            if(group != current_group){
                t.tab.classList.remove('active');
                t.table.style.display = 'none';
            }
            else {
                t.tab.classList.add('active');
                t.table.style.display = 'initial';
            }
        }
    });
    for(let button of hoverpop.getElementsByClassName('delete-macro-button')){
        (button as HTMLElement).addEventListener('click', delete_macro);
    }
    document.body.appendChild(hoverpop);

    document.getElementById('hover-add-macro')!.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        add_row(current_group, "", "");
    });
    function remove_hoverpop(){
        document.body.removeChild(hoverpop);
        hover_is_open = false;
    }
    document.getElementById('export-settings')!.addEventListener('click', export_settings);
    document.getElementById('import-settings')!.addEventListener('click', function(e:MouseEvent){import_settings(e, remove_hoverpop);});
    const ok = document.getElementById('hoverpop-ok')!;
    function submit(){
        const macros: Array<Macro> = [];
        for(let [group, ts] of mapping.entries()){
            const trs = ts.tbody.getElementsByTagName('tr');
            for(let i = 0; i < trs.length; i++){
                let tr = trs[i];
                const name = (tr.children[1].children[0] as HTMLInputElement).value;
                const body = (tr.children[2].children[0] as HTMLTextAreaElement).value;
                if(!name || !body)
                    continue;
                macros.push({name:name, group:group, body:body});
            }
        }
        clear_macro_buttons();
        MACROS.length = 0;
        add_macros_and_buttons(macros);
        remove_hoverpop();
    }
    ok.addEventListener('click', function(){
        submit();
    });
    const cancel = document.getElementById('hoverpop-cancel')!;
    cancel.addEventListener('click', function(){
        remove_hoverpop();
    });
}
function chat_options_dialog(){
    if(hover_is_open)
        return;
    hover_is_open = true;
    const hoverpop = elem('section', null, 'hover');
    const is_dev = chatname == 'dev';
    const pan_tool = document.getElementById('pan-tool')!;
    let html = `
    <h2>Options</h2>
    <table class="input-container">
        <tr>
            <td><label for="hover-chatname">Chat Name:</label>
            <td><input type="text" id="hover-chatname" value="${chatname}">
        </tr>
    </table>
    </div>
    <div class="hover-button-container">
        <label for="hide-pan">Hide Pan Tool</label>
        <input type="checkbox" name="hide-pan" id="hide-pan" ${pan_tool.style.display == 'none'?'checked':''}>
        <br>
        <span style="font-weight:bold">Dark Mode:</span>
        <input type="radio" id="dark-mode-auto" name="dark-mode" value="auto" ${current_dark_mode == DarkMode.SYSTEM?'checked':''}>
        <label for="dark-mode-auto">System</label>
        <input type="radio" id="dark-mode-dark" name="dark-mode" value="dark"${current_dark_mode==DarkMode.DARK?'checked':''}>
        <label for="dark-mode-dark">Dark</label>
        <input type="radio" id="dark-mode-light" name="dark-mode" value="light"${current_dark_mode==DarkMode.LIGHT?'checked':''}>
        <label for="dark-mode-light">Light</label>
        <br>
        <span>(might need reload)</span>
        <br>
        <button id="export-settings">Export</button>
        <button id="import-settings">Import</button>
    </div>
    <div class="hover-button-container">
        <button type="button" id="hoverpop-ok">Ok</button>
        <button type="button" id="hoverpop-cancel">Cancel</button>
    </div>
    `;
    if(is_dev){
        html += `
        <table>
            <tr>
                <td><input type="checkbox" name="show-fps" id="show-fps" ${SHOW_FPS?'checked':''}>
                <label for="show-fps">Show FPS</label>
            </tr>
        </table>
        `;
    }
    hoverpop.innerHTML = html;
    document.body.appendChild(hoverpop);
    {
    const dark_auto = document.getElementById('dark-mode-auto') as HTMLInputElement;
    dark_auto.addEventListener('change', function(){change_dark_mode(DarkMode.SYSTEM);});
    const dark_light = document.getElementById('dark-mode-light') as HTMLInputElement;
    dark_light.addEventListener('change', function(){change_dark_mode(DarkMode.LIGHT);});
    const dark_dark = document.getElementById('dark-mode-dark') as HTMLInputElement;
    dark_dark.addEventListener('change', function(){change_dark_mode(DarkMode.DARK);});
    }

    function remove_hoverpop(){
        document.body.removeChild(hoverpop);
        hover_is_open = false;
    }
    document.getElementById('export-settings')!.addEventListener('click', export_settings);
    document.getElementById('import-settings')!.addEventListener('click', function(e:MouseEvent){import_settings(e, remove_hoverpop);});
    const ok = document.getElementById('hoverpop-ok')!;
    function submit(){
        if(is_dev){
            const show_fps = document.getElementById('show-fps')! as HTMLInputElement;
            SHOW_FPS = show_fps.checked;
            request_render();
        }
        const chatname_el = document.getElementById('hover-chatname')! as HTMLInputElement;
        setchatname(chatname_el.value);
        const hide_pan = document.getElementById('hide-pan')! as HTMLInputElement;
        change_pan_visibility(!hide_pan.checked);
        remove_hoverpop();
    }
    ok.addEventListener('click', function(){
        submit();
    });
    const cancel = document.getElementById('hoverpop-cancel')!;
    cancel.addEventListener('click', function(){
        remove_hoverpop();
    });
    const text_inputs = hoverpop.getElementsByTagName('input');
    let did_focus = false;
    for(let i = 0; i < text_inputs.length; i++){
        const text_input = text_inputs[i];
        if(text_input.type == 'text' || text_input.type == 'url'){
            if(!did_focus){
                text_input.focus();
                did_focus = true;
            }
            text_input.addEventListener('keydown', function(e){
                let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
                if(!modified && e.key == "Enter"){
                    e.preventDefault();
                    e.stopPropagation();
                    ok.click();
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', function(){
    resize_chat();
    const tables_button = document.getElementById('tables-button')!;
    tables_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        tables_button_dialog();
    });
    const options_button = document.getElementById('chat-options')!;
    options_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        chat_options_dialog();
    });
    const macros_button = document.getElementById('macros-button')!;
    macros_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        macros_dialog();
    });
    window.addEventListener('resize', resize_chat);
    const ta = document.getElementById('chatinput')! as HTMLInputElement;
    const history: Array<string> = [];
    let history_index = 0;
    let current_text = "";
    ta.addEventListener('keydown', function(e){
        e.stopPropagation();
        let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
        if(!modified && e.key == "Enter"){
            e.stopPropagation();
            e.preventDefault();
            const value = ta.value;
            if(value.length){
                ta.value = "";
                if(maybe_handle_command(value)){
                }
                else {
                    SOCKET.emit('chat-input', {chatname:chatname, text:value});
                }
                if(!(history.length && value == history[history.length-1])){
                    history.push(value);
                }
                history_index = history.length;
                current_text = "";
            }
        }
        else if(!modified && e.key == "ArrowUp"){
            e.stopPropagation();
            e.preventDefault();
            if(history_index > 0 && history_index <= history.length){
                if(history_index == history.length){
                    current_text = ta.value;
                }
                history_index--;
                ta.value = history[history_index];
            }
        }
        else if(!modified && e.key == "ArrowDown"){
            e.stopPropagation();
            e.preventDefault();
            if(history_index >= 0 && history_index < history.length){
                history_index++;
                if(history_index == history.length){
                    ta.value = current_text;
                }
                else{
                    ta.value = history[history_index];
                }
            }
        }
    });
});


function maybe_handle_command(value:string):boolean{
    let splitted = value.split(" ");
    let split = [];
    for(let s of splitted){
        if(!s)
            continue;
        split.push(s);
    }
    if(split.length){
        if(split[0] === "/get-state"){
            if(split.length > 1){
                get_state(split[1]);
            }
            else{
                get_state('');
            }
            return true;
        }
        if(split[0] == '/clear'){
            clear_chat();
            return true;
        }
        if(split[0] == '/upload'){
            upload();
            return true;
        }
    }
    return false;
}

function format_die_roll_result(roll_result:RollMsg):string{
    return format_roll(roll_result.roll) +  ` <br> = <span class="dice-total">${roll_result.total}</span>`;
}
function format_roll(roll: Roll):string{
    let result = '';
    switch(roll.type){
        case ROLLTYPE.DICE:{
            const r = roll as DieRoll;
            result += format_dice_roll(r);
        }break;
        case ROLLTYPE.PRODUCT:{
            const r = roll as GroupRoll;
            const values = r.values;
            const length = values.length;
            for(let i = 0; i < length; i++){
                if(i != 0)
                    result += ' * ';
                const v = values[i];
                switch(v.type){
                    case ROLLTYPE.DICE:{
                        const d = v as DieRoll;
                        if(d.values.length > 1){
                            result += '('+format_roll(v) + ')';
                        }
                        else {
                            result += format_roll(v);
                        }
                    }break;
                    case ROLLTYPE.SUM:{
                        result += '('+format_roll(v)+')';
                    }break;
                    case ROLLTYPE.PRODUCT:{
                        // no parens
                        result += format_roll(v);
                    }break;
                }
            }
        }break;
        case ROLLTYPE.SUM:{
            const r = roll as GroupRoll;
            const values = r.values;
            const length = values.length;
            for(let i = 0; i < length; i++){
                const v = values[i];
                if(i != 0){
                    switch(v.type){
                        case ROLLTYPE.DICE:{
                            const d = v as DieRoll;
                            if(!d.negative){
                                result += ' + ';
                            }
                        }break;
                        default:{
                            result += ' + ';
                        }
                    }
                }
                result += format_roll(values[i]);
            }
        }break;
    }
    return result;
}

function format_dice_roll(roll:DieRoll){
    let result = '';
    const MINUS = '\u2212';
    function write_die(roll:DieRoll){
        if(roll.base == 1){
            if(roll.values[0] < 0){
                result += ' ' + MINUS;
            }
            result += '<span class="dice-constant">' + Math.abs(roll.values[0]) + '</span>';
            return;
        }
        const length = roll.values.length;
        for(let j = 0; j < length; ++j){
            const v = roll.values[j] | 0;
            if(roll.negative){
                result += ' ' + MINUS;
            }
            else if(j == 0){
            }
            else {
                result += ' +';
            }
            result += '[';
            if(v == roll.base){
                result += '<span class="dice-roll dice-roll-max">';
            }
            else if(v == 1){
                result += '<span class="dice-roll dice-roll-min">';
            }
            else {
                result += '<span class="dice-roll">';
            }
            result += v;
            result += '</span>';
            result += ']';
        }
    }
    write_die(roll);
    return result;
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


const enum ROLLTABLEFLAGS { 
    NONE = 0,
    IS_TABLE = 1 << 0,
}
type RollTableEntry = {
    weight: number;
    value: string;
    flags: ROLLTABLEFLAGS;
}
type RollTable = {
    name: string;
    id: number;
    entries: Array<RollTableEntry>;
}

function tables_button_dialog(){
    if(hover_is_open)
        return;
    SOCKET.emit('retrieve-roll-tables', function(rolltables:Array<RollTable>){
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
                weightinp.type = 'numeric';
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
            SOCKET.emit('update-roll-tables',outtables);
        }
        document.body.appendChild(hoverpop);
    });
}

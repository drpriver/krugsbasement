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

let CHATNAME = localStorage.getItem(`${THISPAGE}/chatname`);
// This is for backwards compatibility. Remove this code path in the future
// once things have been successfully saved.
if(!CHATNAME){
    CHATNAME = localStorage.getItem('chatname');
    if(CHATNAME)
        localStorage.setItem(`${THISPAGE}/chatname`, CHATNAME);
}
if(!CHATNAME)
    CHATNAME = "anon";
function setchatname(name:string){
    if(name)
        name = name.trim();
    if(!name)
        name = 'anon';
    CHATNAME = name;
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

SOCKET.on(ToClient.CHAT_MSG, function(msgs:Array<ChatMsg>){
    const log = document.getElementById('chat-history')!;
    add_chat_msgs(log, msgs);
    log.scrollTo({behavior:'smooth', top:log.scrollHeight});
});

SOCKET.on(ToClient.CHAT_CREATE, function(msgs:Array<ChatMsg>){
    const log = document.getElementById('chat-history')!;
    add_chat_msgs(log, msgs);
    log.scrollTop = log.scrollHeight;
});

function clear_chat(){
    const log = document.getElementById('chat-history')!;
    log.innerHTML = '';
}
SOCKET.on(ToClient.CHAT_CLEAR, function(){
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
    id: number;
};
let macro_id = 0;
let macro_group_id = 0;
const MACRO_GROUPS: Map<string, number> = new Map();
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
    MACRO_GROUPS.set("", 0);
    macro_group_id++;
    if(!Array.isArray(macros)){
        for(let [key, value] of Object.entries(macros)){
            if(typeof key !== "string")
                continue;
            if(typeof value !== "string")
                continue
            result.push({name:key, body:value, group:"", id:macro_id});
            macro_id++;
        }
    }
    else {
        for(let m of macros){
            if(!m.name)
                continue;
            if(!m.body)
                continue;
            result.push({name:m.name, body:m.body, group:m.group?m.group:"", id:macro_id});
            macro_id++;
            if(m.group && !MACRO_GROUPS.has(m.group)){
                MACRO_GROUPS.set(m.group, macro_group_id);
                macro_group_id++;
            }
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

function save_macros(){
    localStorage.setItem(`${THISPAGE}/MACROS`, JSON.stringify(MACROS));
}
window.addEventListener("beforeunload", function(){
    save_macros();
}, false);

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
    text = preprocess_command(text);
    SOCKET.emit(FromClient.CHAT_INPUT, {chatname:CHATNAME, text:text});
}

document.addEventListener('DOMContentLoaded', function(){
    let current_macro: Macro | null = null;
    let displayed_group = "";
    function delete_macro(m:Macro){
        const index = MACROS.indexOf(m);
        MACROS.splice(index, 1);
        save_macros();
        if(MACROS.length){
            current_macro = MACROS[0];
            displayed_group = current_macro.group;
        }
        update_list();
        make_active(current_macro);
    }
    const button: HTMLButtonElement = get_by_id('macros-button');
    const label: HTMLSpanElement = get_by_id('macro-category-label');
    let macros_is_open = false;
    button.addEventListener('click', function(){
        if(macros_is_open) return;
        make_top();
        macros_is_open = true;
        macros_window.style.display = 'grid';
        label.style.height = '' + new_macro.clientHeight + 'px';
        if(MACROS.length){
            current_macro = MACROS[0];
            displayed_group = current_macro.group;
        }
        update_list();
        make_active(current_macro);
    });
    const macros_window: HTMLDivElement = get_by_id('macros-window');
    const editor_container: HTMLDivElement      = get_by_id('macro-editor');
    const move_handle     : HTMLDivElement      = get_by_id('macros-window-handle');
    const macro_area      : HTMLTextAreaElement = get_by_id('macro-view-edit');
    const macro_group_area: HTMLTextAreaElement = get_by_id('macro-view-group');
    const macro_title_area: HTMLTextAreaElement = get_by_id('macro-view-title');
    const del_macro_button: HTMLButtonElement   = get_by_id('delete-macro');
    const new_macro       : HTMLButtonElement   = get_by_id('new-macro');
    const log             : HTMLDivElement      = get_by_id('macro-test-log');
    new_macro.addEventListener('click', function(){
        let new_macro: Macro;
        if(current_macro){
            new_macro = {
                group: current_macro.group,
                id: macro_id++,
                name: 'Untitled',
                body: '',
            };
        }
        else {
            new_macro = {
                group: "",
                id: macro_id++,
                name: 'Untitled',
                body: '',
            };
        }
        current_macro = new_macro;
        displayed_group = current_macro.group;
        add_macro(new_macro);
        update_list();
        make_active(new_macro);
    });
    const test_button: HTMLButtonElement = get_by_id('test-macro');
    test_button.addEventListener('click', function(){
        if(!current_macro) return;
        let lines = evaluate(current_macro.body);
        (log as any).replaceChildren();
        SOCKET.emit(FromClient.CHAT_TEST_INPUT, {chatname:CHATNAME, text:lines.join('\n')}, function(response:Array<ChatMsg>){
            add_chat_msgs(log, response);
        });
    });
    const use_button: HTMLButtonElement = get_by_id('use-macro');
    use_button.addEventListener('click', function(){
        if(!current_macro) return;
        preprocess_and_send_chat(current_macro.body);
    });

    const macros_list: HTMLDivElement = get_by_id('macros-list');
    const macros_group_list: HTMLDivElement = get_by_id('macros-group-list');
    del_macro_button.addEventListener('click', function(){
        make_ok_dialog(`
            <h2>Delete Macro</h2>
            <table class = "input-container">
            <tr>
              <td><label for="hover-delete-macro">Delete Macro</label>
              <td><input name="hover-delete-macro" type="checkbox" id="hover-delete-macro">
            </tr>
            </table>`,
            function (e:HTMLElement){
                const delete_checkbox: HTMLInputElement = get_by_id('hover-delete-macro');
                const should_delete = delete_checkbox.checked;
                if(should_delete && current_macro !== null){
                    delete_macro(current_macro);
                }
            });
    });
    const macro_close = get_by_id('macros-close');
    setup_window_size(macros_window);
    let make_top = setup_zsorted_window(macros_window);
    setup_movable_window(macros_window, move_handle);
    setup_closable_window(macros_window, macro_close, function(){
        save_macros();
        macros_is_open = false;
        do_macro_buttons();
    });
    function make_active(m:Macro | null){
        (log as any).replaceChildren();
        let mid;
        let groupid;
        if(!m){
            editor_container.style.display = 'none';
            mid = -1;
            groupid = -1;
        }
        else {
            editor_container.style.display = 'block';
            mid = m.id;
            groupid = MACRO_GROUPS.get(m.group) as number;
        }
        for(let ml of macros_list.getElementsByTagName('div')){
            ml.classList.remove('active');
            // @ts-ignore
            if(+ml.dataset.id==mid)
                ml.classList.add('active');
        }
        for(let gl of macros_group_list.getElementsByTagName('div')){
            gl.classList.remove('active');
            // @ts-ignore
            if(+gl.dataset.id==groupid){
                gl.classList.add('active');
            }
        }
        if(m){
            macro_area.value = m.body;
            macro_title_area.value = m.name;
            macro_group_area.value = m.group;
        }
    }
    function update_list(){
        for(let ml of Array.from(macros_list.getElementsByTagName('div'))){
            ml.parentNode!.removeChild(ml);
        }
        for(let ml of Array.from(macros_group_list.getElementsByTagName('div'))){
            ml.parentNode!.removeChild(ml);
        }
        function make_click_handler(group:string){
            return function(){
                if(displayed_group == group){
                    return;
                }
                for(let m of Array.from(MACROS).sort((a, b) => { return (a.group < b.group)?-1:(a.group>b.group)?1:0})){
                    if(m.group == group){
                        current_macro = m;
                        displayed_group = m.group;
                        update_list();
                        make_active(m);
                        return;
                    }
                }
            };
        }
        for(let [group, id] of MACRO_GROUPS.entries()){
            let has_it = false;
            for(let m of MACROS){
                if(m.group == group){
                    has_it = true;
                    break;
                }
            }
            if(!has_it) continue;
            const d = document.createElement('div');
            d.dataset.id = ""+id;
            d.innerText = group.length?group:"General";
            d.addEventListener('click', make_click_handler(group));
            macros_group_list.appendChild(d);
        }
        function make_mclick_handler(m:Macro){
            return function(){
                current_macro = m;
                make_active(m);
            };
        }
        for(let m of MACROS.sort((a, b) => {
            if(a.group < b.group)
                return -1;
            if(a.group > b.group)
                return 1;
            if(a.name < b.name)
                return -1;
            if(a.name > b.name)
                return 1;
            if(a.id < b.id)
                return -1;
            if(a.id > b.id)
                return 1;
            return 0;
        })){
            if(m.group !== displayed_group)
                continue;
            const d = document.createElement('div');
            d.dataset.id = ""+m.id;
            d.innerText = m.name;
            d.addEventListener('click', make_mclick_handler(m));
            macros_list.appendChild(d);
        }

    }
    macro_area.addEventListener('input', function(){
        if(!current_macro) return;
        current_macro.body = macro_area.value;
    });
    macro_title_area.addEventListener('input', function(){
        if(!current_macro) return;
        current_macro.name = macro_title_area.value;
        update_list();
        make_active(current_macro);
    });
    macro_group_area.addEventListener('input', function(){
        console.log('input');
        if(!current_macro) return;
        let new_value = macro_group_area.value;
        if(new_value != current_macro.group){
            current_macro.group = new_value;
            if(!MACRO_GROUPS.has(new_value))
                MACRO_GROUPS.set(new_value, macro_group_id++);
            displayed_group = new_value;
            update_list();
            make_active(current_macro);
        }
    });
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
function do_macro_buttons(){
    clear_macro_buttons();
    let i = 0;
    for(let m of MACROS)
        add_macro_button(m.name, m.group, i++);
}

function export_settings(e:MouseEvent){
    e.stopPropagation();
    e.preventDefault();
    const macros = MACROS;
    const settings = {macros:macros, chatname:CHATNAME};
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
function chat_options_dialog(){
    if(hover_is_open)
        return;
    hover_is_open = true;
    const hoverpop = elem('section', null, 'hover');
    const is_dev = CHATNAME == 'dev';
    const pan_tool = document.getElementById('pan-tool')!;
    let html = `
    <h2>Options</h2>
    <table class="input-container">
        <tr>
            <td><label for="hover-chatname">Chat Name:</label>
            <td><input type="text" id="hover-chatname" value="${CHATNAME}">
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
    // const macros_button = document.getElementById('macros-button')!;
    // macros_button.addEventListener('click', function(e:MouseEvent){
        // e.stopPropagation();
        // e.preventDefault();
        // macros_dialog();
    // });
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
                preprocess_and_send_chat(value);
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

function preprocess_command(value:string):string {
    let result = [];
    value = value.replace(/[“”]/g,'"');
    value = value.replace(/[‘’]/g,"'");
    try {
        let evaled = evaluate(value);
        for(let e of evaled){
            result.push(e);
        }
    }catch(e){
        alert(""+e);
        console.log(e);
    }
    return result.join('\n');
}

function evaluate(text:string):any{
    let vars: Map<string, number> = new Map();
    vars.set('rapid', 1);
    let yowa = new Map();
    yowa.set('dex', 2);
    yowa.set('bab', 3);
    let ns = new Map();
    ns.set('yowa', yowa);
    return evaluate_script(text, vars, ns);
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
            SOCKET.emit(FromClient.UPDATE_ROLL_TABLES,outtables);
        }
        document.body.appendChild(hoverpop);
    });
}

document.addEventListener('DOMContentLoaded', function(){
    const container: HTMLDivElement = get_by_id('tool-container');
    const handle: HTMLDivElement = get_by_id('tool-container-handle');
    setup_movable_window(container, handle);
    setup_zsorted_window(container);
});

document.addEventListener('DOMContentLoaded', function(){
    const var_button: HTMLButtonElement = get_by_id('variables-button');
    const var_window:HTMLDivElement = get_by_id('variables-window');
    const var_handle:HTMLDivElement = get_by_id('variables-handle');
    const make_top = setup_zsorted_window(var_window);
    setup_movable_window(var_window, var_handle);
    let variables_is_open = false;
    var_button.addEventListener('click', function(){
        if(variables_is_open) return;
        variables_is_open = true;
        make_top();
    });
});

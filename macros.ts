//
// Copyright © 2021-2022, David Priver
//

// TODO: only the macro panel listens for MACROS_RENAMED
// Maybe this listen_for/signal_for thing is actually a bad idea
const get_script_variables:(character_id:number, macro_id:number)=>[Map<string, Map<string, string>>, Map<string, string>] = (function(){
const CHARACTERS: Map<number, Character> = new Map();
let charactercounter = 0;
const MACROS: Map<number, Macro> = new Map();
let macrocounter = 0;
const VARIABLES: Map<number, Variable> = new Map();
let variablecounter = 0;
let active_character = 0;
let macro_panel_idx = 0;

function get_script_variables(character_id:number, macro_id:number):[Map<string, Map<string, string>>, Map<string, string>]{
    let namespaces:Map<string, Map<string, string>> = new Map();
    let vars:Map<string, string> = new Map();
    // This is kind of hacky.
    if(character_id == -1)
        character_id = active_character;
    for(let ch of CHARACTERS.values()){
        let ns = new Map();
        for(let vid of ch[3]){
            let v = VARIABLES.get(vid)!;
            let value = v[3];
            if(v[2] == ScriptVariableType.ABILITY_SCORE)
                value = ""+ability_score_to_modifier(+value);
            ns.set(v[1].toLowerCase(), value);
        }
        namespaces.set(ch[1].toLowerCase(), ns);
    }
    // First, globals
    for(let key of ['global', 'globals']){
        let ns = namespaces.get(key)!;
        if(ns === undefined)
            continue;
        for(let[k, v] of ns.entries())
            vars.set(k, v);
    }
    // Then, the current character
    if(character_id > 0){
        let ch = CHARACTERS.get(character_id)!;
        for(let vid of ch[3]){
            let v = VARIABLES.get(vid)!;
            let value = v[3];
            if(v[2] == ScriptVariableType.ABILITY_SCORE)
                value = ""+ability_score_to_modifier(+value);
            vars.set(v[1].toLowerCase(), value);
        }
    }
    // Then, the macro's variables
    if(macro_id > 0){
        let mac = MACROS.get(macro_id)!;
        for(let vid of mac[3]){
            let v = VARIABLES.get(vid)!;
            let value = v[3];
            if(v[2] == ScriptVariableType.ABILITY_SCORE)
                value = ""+ability_score_to_modifier(+value);
            vars.set(v[1].toLowerCase(), value);
        }
    }
    return [namespaces, vars];
}


const VARINPUTS:Map<number, Map<string, HTMLInputElement>> = new Map();

function alloc_macro():Macro{
    let id = ++macrocounter;
    let result:Macro = [id, "Untitled", "", []];
    MACROS.set(id, result);
    return result;
}

function del_macro(id:number){
    let m = MACROS.get(id)!;
    MACROS.delete(id);
    for(let c of CHARACTERS.values()){
        let idx = c[2].indexOf(id);
        if(idx > -1){
            c[2].splice(idx, 1);
        }
    }
    for(let v of m[3])
        del_variable(v);
}

function alloc_variable():Variable {
    let id = ++variablecounter;
    let result:Variable = [id, "", ScriptVariableType.NUMBER, "0", 0];
    VARIABLES.set(id, result);
    return result;
}

function del_variable(id:number){
    VARIABLES.delete(id);
    for(let c of CHARACTERS.values()){
        let idx = c[3].indexOf(id);
        if(idx > -1){
            c[3].splice(idx, 1);
        }
    }
    for(let m of MACROS.values()){
        let idx = m[3].indexOf(id);
        if(idx > -1){
            m[3].splice(idx, 1);
        }
    }
    if(VARINPUTS.has(id))
        VARINPUTS.delete(id);
}

function alloc_character():Character{
    let id = ++charactercounter;
    let result: Character = [id, "", [], []];
    CHARACTERS.set(id, result);
    return result;
}

function del_character(id:number){
    let c = CHARACTERS.get(id)!;
    CHARACTERS.delete(id);
    for(let v of c[3])
        del_variable(v);
    for(let m of c[2])
        del_macro(m);
}

function save_macros(){
    let to_save: Array<Macro> = Array.from(MACROS.values());
    sync_local(StorageCategory.MACROS, 'macros', to_save);
}
function save_characters(){
    let to_save: Array<Character> = Array.from(CHARACTERS.values());
    sync_local(StorageCategory.MACROS, 'characters', to_save);
}
function save_variables(){
    let to_save: Array<Variable> = Array.from(VARIABLES.values());
    sync_local(StorageCategory.MACROS, 'variables', to_save);
}

function save_mcv_and_signal(){
    save_macros();
    save_characters();
    save_variables();
    signal_for(ListenEvent.MACROS_RENAMED);
}

function reg_var_input(vid:number, name:string, inp:HTMLInputElement){
    if(!VARINPUTS.has(vid))
        VARINPUTS.set(vid, new Map());
    VARINPUTS.get(vid)!.set(name, inp);
}

function update_var_value(vid:number, val:string){
    if(!val.length) return;
    if(VARINPUTS.has(vid)){
        let vs = VARINPUTS.get(vid)!;
        for(let v of vs.values()){
            if(v.type == 'checkbox')
                v.checked = val == "1";
            v.value = val;
        }
    }
    VARIABLES.get(vid)![3] = val;
    save_variables();
}


(function(){
    for(let m of SETTINGS.macros.macros){
        MACROS.set(m[0], m);
        if(m[0] > macrocounter) macrocounter = m[0];
    }
    for(let v of SETTINGS.macros.variables){
        VARIABLES.set(v[0], v);
        if(v[0] > variablecounter) variablecounter = v[0];
    }
    let first = true;
    for(let c of SETTINGS.macros.characters){
        if(first) active_character = c[0];
        first = false;
        CHARACTERS.set(c[0], c);
        if(c[0] > charactercounter) charactercounter = c[0];
    }
}());


function setup_macro_panel(){
    const pt = by_id('macro-panel-tabs');
    // @ts-ignore
    pt.replaceChildren();
    const pb = by_id('macro-panel-body');
    // @ts-ignore
    pb.replaceChildren();
    if(MACROS.size)
        by_id('macro-panel').style.display = 'grid';
    else {
        by_id('macro-panel').style.display = 'none';
        return;
    }
    let tabs = [];
    let views = [];
    function make_var(parent:HTMLElement, v:Variable){
        const l = elem_with_parent(parent, 'label');
        l.classList.add('panel-variable');
        elem_parent_text(l, 'span', v[1]+' ');
        const inp = elem_with_parent(l, 'input');
        switch(v[2]){
            case ScriptVariableType.NUMBER:
                inp.type = 'number';
                inp.value = v[3];
                break;
            case ScriptVariableType.ABILITY_SCORE:
                inp.type = 'number';
                inp.value = v[3];
                break;
            case ScriptVariableType.BOOLEAN:
                inp.type = 'checkbox';
                inp.checked = v[3]=="1";
                break;
            case ScriptVariableType.STRING:
                inp.type = 'text';
                inp.value = v[3];
                break;
        }
        reg_var_input(v[0], 'macro-panel', inp);
        inp.addEventListener('input', function(){
            if(v[2] == ScriptVariableType.BOOLEAN)
                update_var_value(v[0], inp.checked?"1":"0");
            else
                update_var_value(v[0], inp.value);
        });
    }
    for(let [id, ch] of CHARACTERS.entries()){
        let name = ch[1];
        if(name.toLowerCase() == 'global' || name.toLowerCase() == 'globals')
            continue;
        let d = elem_parent_text(pt, 'div', name, null, 'macro-group-title')
        tabs.push(d);
        let macro_group = elem_with_parent(pb, 'div',null, 'macro-panel-container');
        let macrodiv = elem_with_parent(macro_group, 'div', null, 'macro-panel-macros');
        let vardiv = elem_with_parent(macro_group, 'div', null, 'macro-panel-vars');
        for(let mid of ch[2]){
            let m = MACROS.get(mid)!;
            const mbdiv = elem_with_parent(macrodiv, 'div', null, 'mb-div');
            const macro_button = elem_parent_text(mbdiv, 'button', m[1], null, 'macro-button');
            for(let vid of m[3]){
                const v = VARIABLES.get(vid)!;
                if(!v[4]) continue;
                make_var(mbdiv, v);
            }
            macro_button.addEventListener('click', function(e:MouseEvent){
                e.stopPropagation();
                preprocess_and_send_chat(m[2], id, mid);
            });
        }
        for(let vid of ch[3]){
            let v = VARIABLES.get(vid)!;
            if(!v[4]) continue;
            make_var(vardiv, v);
        }
        views.push(macro_group);

    }
    function do_active_character(){
        let i = 0;
        for(let id of CHARACTERS.keys()){
            if(i == macro_panel_idx){
                active_character = id;
                break;
            }
            i++;
        }
    }
    let tv = make_tab_view(tabs, views, 'grid');
    tv.on_change_handler = function(old_idx:number, new_idx:number){
        macro_panel_idx = new_idx;
        do_active_character();
    };
    do_active_character();
    tv.change_tab(macro_panel_idx);
}
document.addEventListener('DOMContentLoaded', function(){
    listen_for(ListenEvent.MACROS_RENAMED, setup_macro_panel);
    setup_macro_panel();
});
signal_for(ListenEvent.MACROS_RENAMED);

document.addEventListener('DOMContentLoaded', function(){
    let win = get_window('macros');
    const button = by_id('macros-button');
    win.hide_handler = function(){
        signal_for(ListenEvent.MACROS_RENAMED);
    };
    win.show_handler = function(){
        if(!IS_TOUCH) new_category.focus();
    };
    button.addEventListener('click', function(){
        win.show();
    });
    let col1 = by_id('macros-group-list');
    let col2 = by_id('macros-list');
    let dualview = make_dual_list_view<number, number>(col1, col2, ListViewFlags.USER_RENAMABLE|ListViewFlags.USER_DELETABLE, ListViewFlags.USER_RENAMABLE|ListViewFlags.USER_DELETABLE);
    for(let ch of CHARACTERS.values()){
        let name = ch[1];
        dualview.add_item1(name, ch[0]);
        for(let mid of ch[2]){
            let macro = MACROS.get(mid)!;
            dualview.add_item2(macro[1], ch[0], mid);
        }
    }
    const macro_area       = by_id('macro-view-edit');
    const editor_container = by_id('macro-editor');
    const macro_title_area = by_id('macro-view-title');
    const new_macro        = by_id('new-macro');
    const new_category     = by_id('new-macro-group');
    const log              = by_id('macro-test-log');
    const test_button      = by_id('test-macro');
    const use_button       = by_id('use-macro');
    const local_var_button = by_id('new-local-var');
    const locals           = by_id('local-vars');
    const var_list         = by_id('macro-var-list');
    const new_var_button   = by_id('new-variable');
    let m: Macro | undefined;
    dualview.user_remove_handler1 = function(ch:number){
        del_character(ch);
        // XXX: wrong signal
        save_mcv_and_signal();
    };
    dualview.user_remove_handler2 = function(ch:number, mid:number){
        del_macro(mid);
        if(m !== undefined && m[0] == mid)
            m = undefined;
        save_mcv_and_signal();
    };
    function add_var(parent:HTMLElement, v:Variable){
        let di = elem_with_parent(parent, 'div', null, 'variable');
        let eye = elem_parent_text(di, 'label', 'ui');
        let eyec = elem_with_parent(eye, 'input');
        let l = elem_with_parent(di, 'label');
        l.classList.add('variable')
        elem_parent_text(l, 'span', v[1]+' ');
        eyec.type = 'checkbox';
        let inp = elem_with_parent(l, 'input');
        let x = elem_parent_text(l, 'button', '×');
        x.addEventListener('click', function(){
            di.remove();
            del_variable(v[0]);
            save_variables();
        });
        inp.spellcheck = false;
        switch(v[2]){
            case ScriptVariableType.NUMBER:
                inp.type = 'number';
                inp.value = v[3];
                break;
            case ScriptVariableType.ABILITY_SCORE:
                inp.type = 'number';
                inp.value = v[3];
                break;
            case ScriptVariableType.BOOLEAN:
                inp.type = 'checkbox';
                inp.checked = v[3]=="1";
                break;
            case ScriptVariableType.STRING:
                inp.type = 'text';
                inp.value = v[3];
                break;
        }
        reg_var_input(v[0], 'editor', inp);
        inp.addEventListener('input', function(){
            if(inp.type == 'checkbox')
                update_var_value(v[0], inp.checked?"1":"0");
            else
                update_var_value(v[0], inp.value);
        });
        eyec.checked = !!v[4];
        eyec.addEventListener('change', function(){
            v[4] = eyec.checked?1:0;
            save_variables();
            // XXX: wrong signal
            signal_for(ListenEvent.MACROS_RENAMED);
        });

    }
    dualview.user_rename_handler1 = function(groupid:number, newname:string){
        CHARACTERS.get(groupid)![1] = newname;
        save_characters();
        // XXX: wrong signal
        signal_for(ListenEvent.MACROS_RENAMED);
    };
    dualview.user_rename_handler2 = function(k:number, k2:number, text:string){
        let m = MACROS.get(k2);
        if(m === undefined) return;
        m[1] = text;
        save_macros();
        // XXX: wrong signal
        signal_for(ListenEvent.MACROS_RENAMED);
        if(k2 == dualview.active2.get(dualview.active1!))
            macro_title_area.innerText = text;
    };
    dualview.activate2_handler = function(groupid:number, id:number){
        m = MACROS.get(id)!;
        // @ts-ignore
        log.replaceChildren();
        // @ts-ignore
        locals.replaceChildren();
        locals.appendChild(local_var_button);
        editor_container.style.visibility = 'visible';
        macro_area.value = m[2];
        macro_title_area.innerText = m[1];
        for(let vid of m[3])
            add_var(locals, VARIABLES.get(vid)!);

        // @ts-ignore
        var_list.replaceChildren();
        var_list.appendChild(new_var_button);
        let ch = CHARACTERS.get(groupid);
        if(ch===undefined) return;
        for(let vid of ch[3])
            add_var(var_list, VARIABLES.get(vid)!);
    };
    dualview.activate1_handler = function(groupid: number){
        m = undefined;
        editor_container.style.visibility = 'hidden';
        macro_area.value = ''
        macro_title_area.innerText = '';

        // @ts-ignore
        var_list.replaceChildren();
        var_list.appendChild(new_var_button);
        let ch = CHARACTERS.get(groupid);
        if(ch===undefined) return;
        for(let vid of ch[3])
            add_var(var_list, VARIABLES.get(vid)!);
    };
    new_macro.addEventListener('click', function(){
        if(dualview.active1 === undefined)
            return;
        let new_macro = alloc_macro();
        CHARACTERS.get(dualview.active1!)![2].push(new_macro[0]);
        save_mcv_and_signal();
        dualview.add_item2(new_macro[1], dualview.active1, new_macro[0]);
        dualview.make_active2(dualview.active1, new_macro[0]);
    });
    new_category.addEventListener('click', function(){
        let dialog = get_dialog('simple-text');
        if(!dialog) return;
        dialog.title.textContent = 'Group Name';
        dialog.f.text.value = '';
        dialog.ok_handler = function(){
            let text = dialog.f.text.value.trim();
            if(!text) return;
            let c = alloc_character();
            c[1] = text;
            dualview.add_item1(text, c[0]);
            dualview.make_active1(c[0]);
            save_mcv_and_signal();
        };
        dialog.show_handler = function(){
            if(!IS_TOUCH)dialog.f.text.focus();
        };
        dialog.show();
    });
    ONRECV(ToClient.CHAT_TEST_STRUCTURED_RESPONSE, function(response:Array<ChatMsg>){
        // @ts-ignore
        log.replaceChildren();
        add_chat_msgs(log, response, undefined);
    });
    test_button.addEventListener('click', function(){
        if(!m) return;
        let commands;
        try{
            commands = evaluate(m[2], dualview.active1!, m[0]);
        }catch(e){
            const log = by_id('macro-test-log');
            const errmess: ChatErrorMsg = [Msg.ERROR, '', ""+e];
            add_chat_msgs(log, [errmess], undefined);
            log.scrollTo({behavior:'smooth', top:log.scrollHeight});
            return;
        }
        if(commands.length > 25){
            const log = by_id('macro-test-log');
            const errmess: ChatErrorMsg = [Msg.ERROR, '', "Your command results in too much output. Do less."];
            add_chat_msgs(log, [errmess], undefined);
            log.scrollTo({behavior:'smooth', top:log.scrollHeight});
            return;
        }
        if(commands.length){
            let to_send: ChatCommandMessage = {chatname:SETTINGS.chat.name, commands:commands};
            EMIT(FromClient.CHAT_TEST_STRUCTURED_INPUT, to_send);
        }
    });
    use_button.addEventListener('click', function(){
        if(!m) return;
        preprocess_and_send_chat(m[2], dualview.active1!, m[0]);
    });
    macro_area.addEventListener('input', function(){
        if(!m) return;
        m[2] = macro_area.value;
        save_macros();
    });
    local_var_button.addEventListener('click', function(){
        let dialog = get_dialog('make-variable');
        if(!dialog) return;
        dialog.f.name.value = '';
        dialog.show_handler = function(){
            if(!IS_TOUCH) dialog.f.name.focus();
        };
        dialog.ok_handler = function(){
            let name = dialog.f.name.value.trim();
            if(!name) return;
            if(!m) return;
            let v = alloc_variable();
            v[1] = name;
            v[2] = +dialog.f.type.value;
            if(v[2] == ScriptVariableType.BOOLEAN)
                v[3] = '0';
            m[3].push(v[0]);
            save_mcv_and_signal();
            add_var(locals, v);
        };
        dialog.show();
    });
    new_var_button.addEventListener('click', function(){
        let dialog = get_dialog('make-variable');
        if(!dialog) return;
        dialog.f.name.value = '';
        dialog.show_handler = function(){
            if(!IS_TOUCH) dialog.f.name.focus();
        };
        dialog.ok_handler = function(){
            let name = dialog.f.name.value.trim();
            if(!name) return;
            if(dualview.active1 === undefined) return;
            let v = alloc_variable();
            v[1] = name;
            v[2] = +dialog.f.type.value;
            if(v[2] == ScriptVariableType.BOOLEAN)
                v[3] = '0';
            let ch = CHARACTERS.get(dualview.active1!)!;
            ch[3].push(v[0]);
            save_variables();
            save_characters();
            add_var(var_list, v);
        };
        dialog.show();
    });
    let c = CHARACTERS.get(active_character);
    if(c !== undefined){
        if(c[2])
            dualview.make_active2(c[0], c[2][0]);
        else
            dualview.make_active1(c[0]);
    }
    else
        dualview.make_active1(active_character);
});

function ability_score_to_modifier(score:number){
    return Math.floor((score-10)/2);
}

return get_script_variables;
}());

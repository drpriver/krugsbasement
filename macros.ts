//
// Copyright © 2021-2022, David Priver
//

const enum ScriptVariableType {
    NUMBER = 0,
    BOOLEAN = 1,
    STRING  = 2,
}

type Variable = {
    id: number;
    name: string;
    type: ScriptVariableType;
    value: string;
}

type Macro = {
    id: number;
    name: string;
    body: string
    variables: Array<number>;
}

type Character = {
    id: number;
    name: string;
    macros: Array<number>;
    variables: Array<number>;
}

let CHARACTERS: Map<number, Character> = new Map();
let charactercounter = 0;
let MACROS: Map<number, Macro> = new Map();
let macrocounter = 0;
let VARIABLES: Map<number, Variable> = new Map();
let variablecounter = 0;
let active_character = 0;

function alloc_macro():Macro{
    let id = ++macrocounter;
    let result:Macro = {
        id:id,
        name: "Untitled",
        body: "",
        variables: [],
    };
    MACROS.set(id, result);
    return result;
}

function del_macro(id:number){
    let m = MACROS.get(id)!;
    MACROS.delete(id);
    for(let c of CHARACTERS.values()){
        let idx = c.macros.indexOf(id);
        if(idx > -1){
            c.macros.splice(idx, 1);
        }
    }
    for(let v of m.variables)
        del_variable(v);
}

function alloc_variable():Variable {
    let id = ++variablecounter;
    let result:Variable = {
        id:id,
        name: "",
        value: "",
        type: ScriptVariableType.NUMBER,
    };
    VARIABLES.set(id, result);
    return result;
}

function del_variable(id:number){
    VARIABLES.delete(id);
    for(let c of CHARACTERS.values()){
        let idx = c.variables.indexOf(id);
        if(idx > -1){
            c.variables.splice(idx, 1);
        }
    }
    for(let m of MACROS.values()){
        let idx = m.variables.indexOf(id);
        if(idx > -1){
            m.variables.splice(idx, 1);
        }
    }
}

function alloc_character():Character{
    let id = ++charactercounter;
    let result: Character = {
        id:id,
        name: "",
        macros: [],
        variables: [],
    };
    CHARACTERS.set(id, result);
    return result;
}

function del_character(id:number){
    let c = CHARACTERS.get(id)!;
    CHARACTERS.delete(id);
    for(let v of c.variables)
        del_variable(v);
    for(let m of c.macros)
        del_macro(m);
}
(function(){
    for(let m of SETTINGS.macros.macros){
        MACROS.set(m.id, m);
        if(m.id > macrocounter) macrocounter = m.id;
    }
    for(let v of SETTINGS.macros.variables){
        VARIABLES.set(v.id, v);
        if(v.id > variablecounter) variablecounter = v.id;
    }
    let first = true;
    for(let c of SETTINGS.macros.characters){
        if(first) active_character = c.id;
        first = false;
        CHARACTERS.set(c.id, c);
        if(c.id > charactercounter) charactercounter = c.id;
    }
}());

function setup_macros(){
    for(let child of Array.from(by_id('macro-tabs').children))
        child.remove()
    for(let child of Array.from(by_id('macro-buttons').children))
        child.remove()
    let tabs = [];
    let views = [];
    let macro_tab_el = by_id('macro-tabs');
    let macro_buttons_el = by_id('macro-buttons');
    let idx = 0;
    let setidx = 0;
    for(let [id, ch] of CHARACTERS.entries()){
        if(id == active_character)
            setidx = idx;
        idx++;
        let name = ch.name;
        let d = elem_parent_text(macro_tab_el, 'div', name, null, 'macro-group-title')
        tabs.push(d);

        let macro_group = elem_with_parent(macro_buttons_el, 'div', null, 'macro-group');
        for(let mid of ch.macros){
            let m = MACROS.get(mid)!;
            const macro_button = elem_parent_text(macro_group, 'button', m.name, null, 'macro-button');
            macro_button.addEventListener('click', function(e:MouseEvent){
                e.stopPropagation();
                // FIXME: we need to push the character's variables
                // and the macro's variables into scope.
                preprocess_and_send_chat(m.body, id, mid);
            });
        }
        views.push(macro_group);
    }
    let tv = make_tab_view(tabs, views, 'grid');
    tv.change_tab(setidx);
}
document.addEventListener('DOMContentLoaded', function(){
    setup_macros();
    listen_for(ListenEvent.MACROS_RENAMED, setup_macros);
});
signal_for(ListenEvent.MACROS_RENAMED);

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
    let dualview = make_dual_list_view<number, number>(col1, col2, ListViewFlags.USER_RENAMABLE|ListViewFlags.USER_MOVABLE, ListViewFlags.USER_MOVABLE);
    for(let ch of CHARACTERS.values()){
        let name = ch.name;
        dualview.add_item1(name, ch.id);
        for(let mid of ch.macros){
            let macro = MACROS.get(mid)!;
            dualview.add_item2(macro.name, ch.id, mid);
        }
    }
    const macro_area       = by_id('macro-view-edit');
    const editor_container = by_id('macro-editor');
    const macro_title_area = by_id('macro-view-title');
    const del_macro_button = by_id('delete-macro');
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
    function delete_macro(ma:Macro){
        del_macro(ma.id);
        m = undefined;
        dualview.remove2(dualview.active1!, ma.id);
        save_mcv_and_signal();
    }
    function add_var(parent:HTMLElement, v:Variable){
        let l = elem_with_parent(parent, 'label');
        l.classList.add('variable')
        elem_parent_text(l, 'span', v.name+': ');
        let inp = elem_with_parent(l, 'input');
        let x = elem_parent_text(l, 'button', '×');
        x.addEventListener('click', function(){
            l.remove();
            del_variable(v.id);
            save_variables();
        });
        inp.spellcheck = false;
        switch(v.type){
            case ScriptVariableType.NUMBER:
                inp.type = 'number';
                break;
            case ScriptVariableType.BOOLEAN:
                inp.type = 'checkbox';
                break;
            case ScriptVariableType.STRING:
                inp.type = 'text';
                break;
        }
        inp.value = v.value;
        inp.addEventListener('change', function(){
            if(inp.type == 'checkbox')
                v.value = inp.checked?"1":"0";
            else
                v.value = inp.value;
            save_variables();
        });
    }
    dualview.user_rename_handler1 = function(groupid:number, newname:string){
        CHARACTERS.get(groupid)!.name = newname;
        save_characters();
        // XXX: wrong signal
        signal_for(ListenEvent.MACROS_RENAMED);
    };
    dualview.move_handler1 = function(groupid:number, old_idx:number, offset:number){
        // move_item_by(MACROGROUPID_ORDER, old_idx, offset);
        // save_macros();
    };
    dualview.move_handler2 = function(groupid: number, id:number, old_idx:number, offset:number){
        let ch = CHARACTERS.get(groupid)!;
        let macros = ch.macros;
        let idx = macros.indexOf(id);
        if(idx == -1) return;
        move_item_by(macros, idx, offset);
        save_macros();
        // XXX: wrong signal
        signal_for(ListenEvent.MACROS_RENAMED);
    };
    dualview.activate2_handler = function(groupid:number, id:number){
        console.log({groupid});
        console.log({active:dualview.active1});
        m = MACROS.get(id)!;
        (log as any).replaceChildren();
        (locals as any).replaceChildren();
        locals.appendChild(local_var_button);
        editor_container.style.visibility = 'visible';
        macro_area.value = m.body;
        macro_title_area.value = m.name;
        for(let vid of m.variables)
            add_var(locals, VARIABLES.get(vid)!);

        (var_list as any).replaceChildren();
        var_list.appendChild(new_var_button);
        let ch = CHARACTERS.get(groupid);
        if(ch===undefined) return;
        for(let vid of ch.variables)
            add_var(var_list, VARIABLES.get(vid)!);
    };
    dualview.activate1_handler = function(groupid: number){
        m = undefined;
        editor_container.style.visibility = 'hidden';
        macro_area.value = ''
        macro_title_area.value = '';

        (var_list as any).replaceChildren();
        var_list.appendChild(new_var_button);
        let ch = CHARACTERS.get(groupid);
        if(ch===undefined) return;
        for(let vid of ch.variables)
            add_var(var_list, VARIABLES.get(vid)!);
    };
    new_macro.addEventListener('click', function(){
        if(dualview.active1 === undefined)
            return;
        let new_macro = alloc_macro();
        CHARACTERS.get(dualview.active1!)!.macros.push(new_macro.id);
        save_mcv_and_signal();
        dualview.add_item2(new_macro.name, dualview.active1, new_macro.id);
        dualview.make_active2(dualview.active1, new_macro.id);
    });
    new_category.addEventListener('click', function(){
        let dialog = get_dialog('simple-text');
        if(!dialog) return;
        dialog.title.textContent = 'Character Name';
        dialog.f.text.value = '';
        dialog.ok_handler = function(){
            let text = dialog.f.text.value.trim();
            if(!text) return;
            let c = alloc_character();
            c.name = text;
            dualview.add_item1(text, c.id);
            dualview.make_active1(c.id);
            save_mcv_and_signal();
        };
        dialog.show_handler = function(){
            if(!IS_TOUCH)dialog.f.text.focus();
        };
        dialog.show();
    });
    ONRECV(ToClient.CHAT_TEST_STRUCTURED_RESPONSE, function(response:Array<ChatMsg>){
        (log as any).replaceChildren();
        add_chat_msgs(log, response, undefined);
    });
    test_button.addEventListener('click', function(){
        if(!m) return;
        try{
            let commands = evaluate(m.body, dualview.active1!, m.id);
            if(commands.length){
                let to_send: ChatCommandMessage = {chatname:SETTINGS.chat.name, commands:commands};
                EMIT(FromClient.CHAT_TEST_STRUCTURED_INPUT, to_send);
            }
        }catch(e){
            const log = by_id('macro-test-log');
            const errmess: ChatErrorMsg = [Msg.ERROR, '', ""+e];
            add_chat_msgs(log, [errmess], undefined);
            log.scrollTo({behavior:'smooth', top:log.scrollHeight});
        }
    });
    use_button.addEventListener('click', function(){
        if(!m) return;
        preprocess_and_send_chat(m.body, dualview.active1!, m.id);
    });
    del_macro_button.addEventListener('click', function(){
        if(!m) return;
        let dialog = get_dialog('macro-deletion');
        if(!dialog) return;
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
        dualview.rename2(m.name, dualview.active1!, m.id);
        save_macros();
        signal_for(ListenEvent.MACROS_RENAMED);
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
            v.name = name;
            v.type = +dialog.f.type.value;
            m.variables.push(v.id);
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
            v.name = name;
            v.type = +dialog.f.type.value;
            let ch = CHARACTERS.get(dualview.active1!)!;
            ch.variables.push(v.id);
            save_variables();
            save_characters();
            add_var(var_list, v);
        };
        dialog.show();
    });
    let c = CHARACTERS.get(active_character);
    if(c !== undefined){
        if(c.macros)
            dualview.make_active2(c.id, c.macros[0]);
        else
            dualview.make_active1(c.id);
    }
    else
        dualview.make_active1(active_character);
});

function get_script_variables(character_id:number, macro_id:number):[Map<string, Map<string, string>>, Map<string, string>]{
    let namespaces:Map<string, Map<string, string>> = new Map();
    let vars:Map<string, string> = new Map();
    for(let ch of CHARACTERS.values()){
        let ns = new Map();
        for(let vid of ch.variables){
            let v = VARIABLES.get(vid)!;
            ns.set(v.name, v.value);
        }
        namespaces.set(ch.name, ns);
    }
    // First, globals
    for(let key of ['global', 'globals']){
        let ns = namespaces.get(key)!;
        if(ns === undefined)
            continue;
        for(let[k, v] of ns.entries())
            vars.set(k, v);
    }
    if(character_id > 0){
        let ch = CHARACTERS.get(character_id)!;
        for(let vid of ch.variables){
            let v = VARIABLES.get(vid)!;
            vars.set(v.name, v.value);
        }
    }
    if(macro_id > 0){
        let mac = MACROS.get(macro_id)!;
        for(let vid of mac.variables){
            let v = VARIABLES.get(vid)!;
            vars.set(v.name, v.value);
        }
    }
    return [namespaces, vars];
}

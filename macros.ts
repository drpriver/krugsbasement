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
function macro_by_id(id:number):Macro{
    for(let m of MACROS){
        if(m.id == id) return m;
    }
    throw new Error();
}

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

document.addEventListener('DOMContentLoaded', function(){
    for(let i = 0; i < MACROS.length; i++){
        const m = MACROS[i];
        add_macro_button(m.name, MACROGROUPIDS.get(m.groupid)!, i);
    }
});

document.addEventListener('DOMContentLoaded', function(){
    let win = get_window('macros');
    const button = by_id('macros-button');
    win.hide_handler = function(){
        do_macro_buttons();
    };
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
            EMIT(FromClient.CHAT_TEST_STRUCTURED_INPUT, to_send, function(response:Array<ChatMsg>){
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

// Variables
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
    groupid: number;
    flags: ScriptVariableFlags;
}
let current_script_variable_id = 0;
let scriptgroups: Array<string> = [];
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
        sv.groupid = scriptgroups.indexOf(sv.group);
        if(sv.groupid == -1){
            sv.groupid = scriptgroups.length;
            scriptgroups.push(sv.group);
        }
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
    let listview = make_list_view<number>(var_groups, ListViewFlags.USER_RENAMABLE|ListViewFlags.USER_DELETABLE);
    listview.activate_handler = function(groupid:number|undefined){
        if(groupid === undefined){
            groupid = 0;
            listview.active = 0;
        }
        actually_save_the_variables();
        active_group = scriptgroups[groupid];
        setup();
    };
    listview.user_rename_handler = function(groupid:number, name:string){
        scriptgroups[groupid] = name;
        for(let sv of SCRIPTVARIABLES){
            if(sv.groupid == groupid){
                sv.group = name;
            }
        }
        actually_save_the_variables();
    };
    listview.user_remove_handler = function(groupid:number){
        for(let sv of SCRIPTVARIABLES){
            if(sv.groupid == groupid){
                sv.flags |= ScriptVariableFlags.DELETED;
            }
        }
        actually_save_the_variables();
        setup();
    };
    const var_table = by_id('variables-table');
    const var_add_group = by_id('variables-add-category');
    var_add_group.addEventListener('click', function(){
        let dialog = get_dialog('simple-text');
        if(!dialog) return;
        dialog.title.textContent = 'Category Name';
        dialog.f.text.value = '';
        dialog.show_handler = function(){
            dialog.f.text.focus();
        };
        dialog.ok_handler = function(){
            let text = dialog.f.text.value.trim();
            if(!text) return;
            scriptgroups.push(text);
            listview.add_item(text, scriptgroups.length-1);
            listview.make_active(scriptgroups.length-1);
        };
        dialog.show();
    });
    const var_add_var = by_id('variable-add-variable');
    var_add_var.addEventListener('click', function(){
        let sv = {
            group: active_group,
            groupid: scriptgroups.indexOf(active_group),
            name: '',
            type: ScriptVariableType.NUMBER,
            id: current_script_variable_id++,
            flags: ScriptVariableFlags.NONE,
            value: 0,
        };
        SCRIPTVARIABLES.push(sv);
        add_table_row(sv);
    });
    if(!scriptgroups.length)
        scriptgroups.push('Global');
    let active_group = scriptgroups[0];
    for(let i = 0; i < scriptgroups.length; i++){
        listview.add_item(scriptgroups[i], i);
    }
    var_button.addEventListener('click', function(){
        variables.show();
        if(!variables.hidden) return;
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
    function setup(){
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
        // if(var_group_name.value != active_group)
            // var_group_name.value = active_group;
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
    listview.make_active(0);
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

//
// Copyright © 2021-2023, David Priver
//

(function(){
let macro_panel_idx = 0;
function setup_macro_panel(){
    const l = by_id('left-macros-list');
    const pt = by_id('macro-panel-tabs');
    // @ts-ignore
    pt.replaceChildren();
    const pb = by_id('macro-panel-body');
    // @ts-ignore
    pb.replaceChildren();
    if(MACROS.size)
        by_id('macro-panel').classList.add('has-macros');
    else {
        by_id('macro-panel').classList.remove('has-macros');
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
        elem_parent_text(l, 'li', name);
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
                set_active_char(id);
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
        let commands:Array<Command> = [];
        let error = evaluate(m[2], dualview.active1!, m[0], commands);
        if(error.length){
            const log = by_id('macro-test-log');
            const errmess: ChatErrorMsg = [Msg.ERROR, '', error];
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
    let c = CHARACTERS.get(get_active_char());
    if(c !== undefined){
        if(c[2])
            dualview.make_active2(c[0], c[2][0]);
        else
            dualview.make_active1(c[0]);
    }
    else
        dualview.make_active1(get_active_char());
    if(SETTINGS.uimode == UiMode.MACROS){
        win.make_fullscreen();
        win.show();
        use_button.style.display = 'none';
        by_id('mac-link').style.display = 'none';
    }
    else {
        by_id('mac-link').href = window.location.pathname + '/macros';
    }
});


}());

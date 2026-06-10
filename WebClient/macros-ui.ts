//
// Copyright © 2021-2025, David Priver
//

(function():void{

type MacroWindow = {
    cid: number;
    id: number
    win: Win;
    editor: HTMLTextAreaElement;
    log: HTMLDivElement;
};

type VariablesWindow = {
    cid: number;
    win: Win;
};

const MACRO_WINDOWS: Map<number, MacroWindow> = new Map();
let active_macro_window = -1; // XXX: structured response doesn't include to what
ONRECV(ToClient.CHAT_TEST_STRUCTURED_RESPONSE, function(response:Array<ChatMsg>):void{
    const w = MACRO_WINDOWS.get(active_macro_window);
    if(!w) return;
    w.log.replaceChildren();
    add_chat_msgs(w.log, response, undefined);
});
const VARIABLES_WINDOWS: Map<number, VariablesWindow> = new Map();

function make_macro_window(cid:number, id:number):MacroWindow {
    const openid = `/macros/open/${cid}-${id}`;
    const ident = (cid << 16) | id;
    const macro = MACROS.get(id);
    const wid = `macrow-${cid}-${id}`;
    let win: Win;
    {
        const w = elem('div', wid, 'window');
        w.classList.add('macro-only-window');
        const wh = elem_with_parent(w, 'div', null, 'window-handle');
        const x = elem_parent_text(wh, 'span', '×', null, 'window-closer');
        const t = elem_parent_text(wh, 'span', macro?macro[1]:'', null, 'window-title');
        const m = elem_parent_text(wh, 'span', '_', null, 'window-minimizer');
        win = normal_window(w, wh, x, m, t, NormalWindow.LOCAL, openid);
    }
    const buttons = elem_with_parent(win.win, 'div', null, 'macro-win-buttons');
    const vars = elem_with_parent(win.win, 'div', null, 'macro-vars');
    const addvar = elem_parent_text(buttons, 'button', '+');
    const test = elem_parent_text(buttons, 'button', 'Test');
    const use = elem_parent_text(buttons, 'button', 'Use');

    const editor = elem_with_parent(win.win, 'textarea');
    monospace_textarea(editor, null);
    editor.style.fontFamily = 'ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace';
    editor.spellcheck = false;
    editor.rows = 8;
    editor.oninput = function():void{
        const m = MACROS.get(id);
        if(!m) return;
        m[2] = editor.value;
        save_macros(); // XXX wtf why so broad
    };
    if(macro) editor.value = macro[2];
    const log = elem_with_parent(win.win, 'div', null, 'macro-log');
    win.wh_ctxmenu_handler = function(menu:CtxMenu):void{
        menu.item('Rename', function(e:MouseEvent):void{
            e.stopPropagation();
            e.preventDefault();
            edit_element_inline(win.t, EditElementFlags.SELECT, function(s:string):void{
                const m = MACROS.get(id);
                if(!m) return;
                m[1] = s;
                save_mcv_and_signal();
            });
            remove_ctx_menu();
        });
        menu.separator();
        menu.item('Delete', function():void{
            const dialog = get_dialog('simple-delete');
            if(!dialog) return;
            dialog.title.textContent = 'Delete Macro'
            dialog.f.delete.checked = false;
            dialog.ok_handler = function():void{
                if(!dialog.f.delete.checked) return;
                result.win.close();
                del_macro(id);
                save_mcv_and_signal();
            };
            dialog.show();
        });
    };
    use.onclick = function():void{
        const m = MACROS.get(id);
        if(!m) return;
        preprocess_and_send_chat(m[2], cid, m[0]);
    };
    test.onclick = async function():Promise<void>{
        const m = MACROS.get(id);
        if(!m) return;
        let commands:Array<Command> = [];
        let error = await evaluate(m[2], cid, m[0], commands);
        if(error.length){
            const errmess: ChatErrorMsg = [Msg.ERROR, '', error];
            add_chat_msgs(log, [errmess], undefined);
            log.scrollTo({behavior:'smooth', top:log.scrollHeight});
            return;
        }
        if(commands.length){
            let to_send: ChatCommandMessage = {chatname:SETTINGS.chat.name, commands:commands};
            active_macro_window = ident; // XXX: structured response doesn't include to what
            EMIT(FromClient.CHAT_TEST_STRUCTURED_INPUT, to_send);
        }
    };
    addvar.onclick = function():void{
        const dialog = get_dialog('make-variable');
        if(!dialog) return;
        dialog.f.name.value = '';
        dialog.f.values.value = '';
        dialog.f.values.rows = 10;
        dialog.f['value-row'].style.display = dialog.f.type.value == '4'?'table-row':'none';
        dialog.f.type.onchange = function(){
          if(dialog.f.type.value == '4'){
            dialog.f['value-row'].style.display = 'table-row';
          }
          else
            dialog.f['value-row'].style.display = 'none';
        };
        dialog.show_handler = function():void{
            if(!IS_TOUCH) dialog.f.name.focus();
        };
        dialog.ok_handler = function():void{
            let name = dialog.f.name.value.trim();
            if(!name) return;
            const m = MACROS.get(id);
            if(!m) return;
            let lines: Array<string> = [];
            let type = +dialog.f.type.value;
            if(type == ScriptVariableType.CHOICE){
              lines = dialog.f.values.value.trim().split('\n').map(x => x.trim()).filter(x=>x);
              if(!lines.length) return;
            }
            let v = alloc_variable();
            v[1] = name;
            v[2] = type;
            if(v[2] == ScriptVariableType.BOOLEAN)
                v[3] = '0';
            m[3].push(v[0]);
            v[5] = lines;
            if(v[2] == ScriptVariableType.CHOICE)
                v[3] = lines[0];
            save_mcv_and_signal();
            refresh();
        };
        dialog.show();
    };
    win.close_handler = function():void{
        win.win.remove();
        MACRO_WINDOWS.delete(ident);
    };
    win.show_handler = function():void{
        refresh();
        if(!IS_TOUCH) editor.focus();
    }
    function refresh():void{
        const macro = MACROS.get(id);
        if(!macro) return;
        win.t.textContent = macro[1];
        editor.value = macro[2];
        log.replaceChildren();
        vars.replaceChildren();
        if(macro){
            for(const vid of macro[3]){
                const v = VARIABLES.get(vid);
                if(!v) continue;
                const l = elem_with_parent(vars, 'label');
                const t = elem_parent_text(l, 'span', v[1]+' ');
                const uil = elem_parent_text(vars, 'label', 'UI');
                const uiinp = elem_with_parent(uil, 'input');
                uiinp.type = 'checkbox';
                uiinp.checked = !!(v[4] & VariableUI.SHOW_IN_PANEL);
                t.oncontextmenu = function(e:MouseEvent):void{
                    const menu = ctx_menu(e);
                    menu.item('Rename', function(e:MouseEvent):void{
                        e.stopPropagation();
                        e.preventDefault();
                        edit_element_inline(t, EditElementFlags.SELECT, function(s:string):void{
                            v[1] = s.trim();
                            save_mcv_and_signal();
                        });
                        remove_ctx_menu();
                    });
                    menu.item('Delete', function():void{
                        del_variable(vid);
                        l.remove();
                        uil.remove();
                    });
                    menu.install();
                }
                let inp = elem_with_parent(l, 'input');
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
                case ScriptVariableType.CHOICE:
                    inp.remove();
                    inp = elem_with_parent(l, 'select') as any;
                    for(let choice of v[5]){
                        let o = elem_with_parent(inp, 'option');
                        o.text = choice;
                        o.value = choice;
                    }
                    (inp as any as HTMLSelectElement).value = v[3];
                    break;
                }
                inp.oninput = function():void{
                    if(v[2] == ScriptVariableType.BOOLEAN)
                        update_var_value(v[0], inp.checked?"1":"0");
                    else
                        update_var_value(v[0], inp.value);
                }
                uiinp.oninput = function():void{
                    if(uiinp.checked)
                        v[4] |= VariableUI.SHOW_IN_PANEL;
                    else
                        v[4] &= ~VariableUI.SHOW_IN_PANEL;
                    save_mcv_and_signal();
                };
            }
        }
    }
    const result: MacroWindow = {
        cid, id, win, editor, log
    };
    refresh();
    return result;
}

function make_vars_window(cid:number):VariablesWindow {
    const char = CHARACTERS.get(cid);
    const wid = `macrov-${cid}`;
    let win: Win;
    {
        const w = elem('div', wid, 'window');
        w.classList.add('vars-only-window');
        const wh = elem_with_parent(w, 'div', null, 'window-handle');
        const x = elem_parent_text(wh, 'span', '×', null, 'window-closer');
        const t = elem_parent_text(wh, 'span', char?char[1]:'', null, 'window-title');
        const m = elem_parent_text(wh, 'span', '_', null, 'window-minimizer');
        win = normal_window(w, wh, x, m, t, NormalWindow.LOCAL, null);
    }
    const vars = elem_with_parent(win.win, 'div', null, 'macro-vars');
    const addvar = elem_parent_text(win.win, 'button', '+');
    addvar.onclick = function():void{
        const dialog = get_dialog('make-variable');
        if(!dialog) return;
        dialog.f.name.value = '';
        dialog.f.values.value = '';
        dialog.f.values.rows = 10;
        dialog.f['value-row'].style.display = dialog.f.type.value == '4'?'table-row':'none';
        dialog.f.type.onchange = function(){
          if(dialog.f.type.value == '4'){
            dialog.f['value-row'].style.display = 'table-row';
          }
          else
            dialog.f['value-row'].style.display = 'none';
        };
        dialog.show_handler = function():void{
            if(!IS_TOUCH) dialog.f.name.focus();
        };
        dialog.ok_handler = function():void{
            let name = dialog.f.name.value.trim();
            if(!name) return;
            const char = CHARACTERS.get(cid);
            if(!char) return;
            let lines: Array<string> = [];
            let type = +dialog.f.type.value;
            if(type == ScriptVariableType.CHOICE){
              lines = dialog.f.values.value.trim().split('\n').map(x => x.trim()).filter(x=>x);
              if(!lines.length) return;
            }
            let v = alloc_variable();
            v[1] = name;
            v[2] = +dialog.f.type.value;
            if(v[2] == ScriptVariableType.BOOLEAN)
                v[3] = '0';
            char[3].push(v[0]);
            v[5] = lines;
            if(v[2] == ScriptVariableType.CHOICE)
                v[3] = lines[0];
            save_mcv_and_signal();
            refresh();
        };
        dialog.show();
    };
    win.close_handler = function():void{
        win.win.remove();
        VARIABLES_WINDOWS.delete(cid);
    };
    win.show_handler = function():void{
        refresh();
    };
    function refresh():void{
        const char = CHARACTERS.get(cid);
        if(!char) return;
        win.t.textContent = `${char[1]} - Variables`;
        vars.replaceChildren();
        if(char){
            for(const vid of char[3]){
                const v = VARIABLES.get(vid);
                if(!v) continue;
                const l = elem_with_parent(vars, 'label');
                const t = elem_parent_text(l, 'span', v[1]+' ');
                const uil = elem_parent_text(vars, 'label', 'UI');
                const uiinp = elem_with_parent(uil, 'input');
                uiinp.type = 'checkbox';
                uiinp.checked = !!(v[4] & VariableUI.SHOW_IN_PANEL);
                t.oncontextmenu = function(e:MouseEvent):void{
                    const menu = ctx_menu(e);
                    menu.item('Rename', function(e:MouseEvent):void{
                        e.stopPropagation();
                        e.preventDefault();
                        edit_element_inline(t, EditElementFlags.SELECT, function(s:string):void{
                            v[1] = s.trim();
                            save_mcv_and_signal();
                        });
                        remove_ctx_menu();
                    });
                    menu.item('Delete', function():void{
                        del_variable(vid);
                        l.remove();
                        uil.remove();
                    });
                    menu.canceller();
                    menu.install();
                }
                let inp = elem_with_parent(l, 'input');
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
                case ScriptVariableType.CHOICE:
                    inp.remove();
                    inp = elem_with_parent(l, 'select') as any;
                    for(let choice of v[5]){
                        let o = elem_with_parent(inp, 'option');
                        o.text = choice;
                        o.value = choice;
                    }
                    (inp as any as HTMLSelectElement).value = v[3];
                    break;
                }
                inp.oninput = function():void{
                    if(v[2] == ScriptVariableType.BOOLEAN)
                        update_var_value(v[0], inp.checked?"1":"0");
                    else
                        update_var_value(v[0], inp.value);
                }
                uiinp.oninput = function():void{
                    if(uiinp.checked)
                        v[4] |= VariableUI.SHOW_IN_PANEL;
                    else
                        v[4] &= ~VariableUI.SHOW_IN_PANEL;
                    save_mcv_and_signal();
                };
            }
        }
    }
    const result: VariablesWindow = { cid, win };
    refresh();
    return result;
}

function get_macro_window(cid:number, id:number):MacroWindow {
    const ident = (cid << 16) | id;
    let m = MACRO_WINDOWS.get(ident);
    if(m) return m;
    m = make_macro_window(cid, id);
    MACRO_WINDOWS.set(ident, m);
    return m;
}

function get_vars_window(cid:number):VariablesWindow{
    let c = VARIABLES_WINDOWS.get(cid);
    if(c) return c;
    c = make_vars_window(cid);
    VARIABLES_WINDOWS.set(cid, c);
    return c;
}
function add_macro_dialog(cid:number):void{
    const dialog = get_dialog('simple-text');
    if(!dialog) return;
    dialog.clear_handlers();
    dialog.title.textContent = 'Macro Name';
    dialog.f.text.value = '';
    dialog.show_handler = function():void{
        if(!IS_TOUCH) dialog.f.text.focus();
    };
    dialog.ok_handler = function():void{
        const text = dialog.f.text.value.trim();
        if(!text) return;
        const m = alloc_macro();
        m[1] = text;
        const c = CHARACTERS.get(cid);
        if(c) c[2].push(m[0]);
        save_mcv_and_signal();
        setup_macro_panel();
        const w = get_macro_window(cid, m[0]);
        w.win.show();
        if(!IS_TOUCH) setTimeout(()=>{w.editor.focus()}, 0);
    };
    dialog.show();
}

function setup_macro_left():void{
    const button = by_id('new-macro-group-button');
    button.onclick = function():void{
        const dialog = get_dialog('simple-text');
        if(!dialog) return;
        dialog.title.textContent = 'Macro Group Name';
        dialog.f.text.value = '';
        if(!IS_TOUCH) dialog.show_handler = function():void{
            dialog.f.text.focus();
        };
        dialog.ok_handler = function():void{
            const text = dialog.f.text.value.trim();
            if(!text) return;
            const c = alloc_character();
            c[1] = text;
            save_mcv_and_signal();
            setup_macro_panel();
        };
        dialog.show();
    };
    const list = by_id('left-macro-group-list');
    list.replaceChildren();
    list.oncontextmenu = function(e:Event):void{
        e.stopPropagation();
        e.preventDefault();
    };
    for(const [cid, ch] of CHARACTERS.entries()){
        const name = ch[1];
        const li = elem_with_parent(list, 'li', null, 'macro-li');
        const namespan = elem_parent_text(li, 'span', name);
        namespan.oncontextmenu = function(e:MouseEvent):void{
            const menu = ctx_menu(e);
            menu.item('Rename', function(e:MouseEvent):void{
                e.stopPropagation();
                e.preventDefault();
                edit_element_inline(namespan, EditElementFlags.SELECT, function(s:string):void{
                    const c = CHARACTERS.get(cid);
                    if(!c) return;
                    c[1] = s;
                    save_mcv_and_signal();
                });
                remove_ctx_menu();
            });
            menu.item('Add Macro', function():void{
                add_macro_dialog(cid);
            });
            menu.separator();
            menu.item('Delete', function():void{
                const dialog = get_dialog('simple-delete');
                if(!dialog) return;
                dialog.title.textContent = 'Delete Macro Group';
                dialog.f.delete.checked = false;
                dialog.ok_handler = function():void{
                    if(!dialog.f.delete.checked)
                        return;
                    const c = CHARACTERS.get(cid);
                    if(!c) return;
                    for(const mid of c[2]){
                        const ident = (cid << 16) | mid;
                        const w = MACRO_WINDOWS.get(ident);
                        if(w) w.win.close();
                    }
                    const vw = VARIABLES_WINDOWS.get(cid);
                    if(vw) vw.win.close();
                    del_character(cid);
                    save_mcv_and_signal();
                };
                dialog.show();
            });
            menu.separator();
            menu.canceller();
            menu.install();
        };
        li.onclick = function(e:MouseEvent):void{
            e.stopPropagation();
            nested.classList.toggle('hidden');
            li.classList.toggle('closed');
        };
        const am = elem_parent_text(li, 'button', '+');
        const nested = elem_with_parent(li, 'ul', null, 'child');
        const vars = elem_parent_text(nested, 'li', `Variables…`);
        vars.onclick = function(e:MouseEvent):void{
            e.stopPropagation();
            get_vars_window(cid).win.show();
        };
        vars.oncontextmenu = function(e:Event):void{
            e.stopPropagation();
            e.preventDefault();
        };
        am.title = 'Add Macro';
        am.onclick = function(e:MouseEvent):void{
            e.stopPropagation();
            add_macro_dialog(cid);
        };
        am.oncontextmenu = function(e:Event):void{
            e.stopPropagation();
            e.preventDefault();
        };
        for(const mid of ch[2]){
            const m = MACROS.get(mid);
            if(!m) continue;
            const mli = elem_parent_text(nested, 'li', m[1]);
            mli.oncontextmenu = function(e:MouseEvent):void{
                const menu = ctx_menu(e);
                menu.item('Rename', function(e:MouseEvent):void{
                    e.stopPropagation();
                    e.preventDefault();
                    edit_element_inline(mli, EditElementFlags.SELECT, function(s:string):void{
                        m[1] = s;
                        save_mcv_and_signal();
                    });
                    remove_ctx_menu();
                });
                menu.item('Edit', function():void{
                    get_macro_window(cid, mid).win.show();
                });
                menu.separator();
                menu.item('Delete', function():void{
                    const dialog = get_dialog('simple-delete');
                    if(!dialog) return;
                    dialog.title.textContent = 'Delete Macro';
                    dialog.f.delete.checked = false;
                    dialog.ok_handler = function():void{
                        if(!dialog.f.delete.checked) return;
                        del_macro(mid);
                        const ident = (cid << 16) | mid;
                        const w = MACRO_WINDOWS.get(ident);
                        if(w) w.win.close();
                        save_mcv_and_signal();
                    };
                    dialog.show();
                });
                menu.separator();
                menu.canceller();
                menu.install();
            };
            mli.onclick = function(e:MouseEvent):void{
                e.stopPropagation();
                get_macro_window(cid, mid).win.show();
            };
            const openid = `/macros/open/${cid}-${mid}`;
            reopen_window(()=>get_macro_window(cid, mid).win, NormalWindow.LOCAL, openid);
        }
    }

}

let macro_panel_idx = 0;
function setup_macro_panel():void{
    setup_macro_left();
    const pt = by_id('macro-panel-tabs');
    pt.replaceChildren();
    const pb = by_id('macro-panel-body');
    pb.oncontextmenu = function(e:MouseEvent):void{
        const menu = ctx_menu(e);
        menu.item('Add Macro', function():void{
            add_macro_dialog(get_active_char());
        });
        menu.canceller();
        menu.install();
    };
    pb.replaceChildren();
    if(MACROS.size)
        by_id('macro-panel').classList.add('has-macros');
    else {
        by_id('macro-panel').classList.remove('has-macros');
        return;
    }
    let tabs = [];
    let views = [];
    function make_var(parent:HTMLElement, v:Variable):void{
        const l = elem_with_parent(parent, 'label');
        l.classList.add('panel-variable');
        elem_parent_text(l, 'span', v[1]+' ');
        let inp = elem_with_parent(l, 'input');
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
            case ScriptVariableType.CHOICE:
                inp.remove();
                inp = elem_with_parent(l, 'select') as any;
                for(let choice of v[5]){
                    let o = elem_with_parent(inp, 'option');
                    o.text = choice;
                    o.value = choice;
                }
                (inp as any as HTMLSelectElement).value = v[3];
                break;
        }
        reg_var_input(v[0], 'macro-panel', inp);
        inp.addEventListener('input', function():void{
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
                if(!(v[4] & VariableUI.SHOW_IN_PANEL)) continue;
                make_var(mbdiv, v);
            }
            macro_button.onclick = function(e:MouseEvent):void{
                e.stopPropagation();
                preprocess_and_send_chat(m[2], id, mid);
            };
        }
        for(let vid of ch[3]){
            let v = VARIABLES.get(vid)!;
            if(!(v[4] & VariableUI.SHOW_IN_PANEL)) continue;
            make_var(vardiv, v);
        }
        views.push(macro_group);

    }
    function do_active_character():void{
        let i = 0;
        for(let id of CHARACTERS.keys()){
            if(i == macro_panel_idx){
                set_active_char(id);
                break;
            }
            i++;
        }
    }
    {
      let active = get_active_char();
      let i = 0;
      for(let id of CHARACTERS.keys()){
          if(id == active){
            macro_panel_idx = i;
            break;
          }
          i++;
      }
    }
    let tv = make_tab_view(tabs, views, 'grid');
    tv.on_change_handler = function(old_idx:number, new_idx:number):void{
        macro_panel_idx = new_idx;
        do_active_character();
    };
    do_active_character();
    tv.change_tab(macro_panel_idx);
}
document.addEventListener('DOMContentLoaded', function():void{
    listen_for(ListenEvent.MACROS_RENAMED, setup_macro_panel);
    setup_macro_panel();
});

}());

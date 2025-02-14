//
// Copyright © 2025-2025, David Priver
//

const statblocks: Map<number, StatBlock> = new Map();

function use_sb_macro(block:StatBlock, macro: StatMacro):void{
    let vars: Map<string, string> = new Map();
    for(let content of block[2]){
        if(content[0] == StatItemType.TABLE)
            for(let row of content[1])
                vars.set(row[0].toLowerCase(), row[1]);
        else if(content[0] == StatItemType.VARIABLE)
            vars.set(content[1].toLowerCase(), content[3]);
    }
    for(let v of macro[3])
        vars.set(v[1].toLowerCase(), v[3]);
    preprocess_and_send_chat3(macro[2], vars);
}

let STATS_TV: TreeView;
let _sbw: Win;

function sb_populate(container:HTMLDivElement, block:StatBlock):void{
    let locked = true;
    const lock_label = elem_parent_text(container, 'label', 'Locked');
    const lock = elem_with_parent(lock_label, 'input');
    lock.type = 'checkbox';
    lock.checked = true;
    lock.onchange = function(){ locked = lock.checked; };
    const pop = elem_parent_text(container, 'button', 'Window');
    pop.onclick = function(e):void{
        e.stopPropagation();
        const w = create_statblock_window(structuredClone(block));
        w.show();
        w.win.win.style.left = (e.clientX-w.win.win.clientWidth/2)+'px';
        w.win.win.style.top = (e.clientY)+'px';
        ensure_window_is_completely_on_screen(w.win.win);
    }
    const lightpop = elem_parent_text(container, 'button', 'Window w/o MD');
    lightpop.onclick = function(e):void{
        e.stopPropagation();
        let b = structuredClone(block);
        let contents = [];
        for(let c of b[2]){
            if(c[0] == StatItemType.MD) continue;
            contents.push(c);
        }
        b[2] = contents;
        const w = create_statblock_window(b);
        w.show();
        w.win.win.style.left = (e.clientX-w.win.win.clientWidth/2)+'px';
        w.win.win.style.top = (e.clientY)+'px';
        ensure_window_is_completely_on_screen(w.win.win);
    }
    const contents: Array<StatItem> = block[2];
    function edit_onclick(element: HTMLElement, onfinish:(txt:string)=>void):void{
        element.onclick = function(e):void{
            if(locked) return;
            if(IS_MAC && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) return;
            e.stopPropagation();
            e.preventDefault();
            edit_element_inline(element, EditElementFlags.NONE, onfinish);
        };
    }

    function add_table_row(tr: HTMLTableRowElement, st:StatTable, row: StatTableItem):void{
        const key = elem_parent_text(tr, 'td', row[0]);
        const value = elem_parent_text(tr, 'td', row[1]);
        edit_onclick(key, (txt:string)=>{row[0] = txt;});
        edit_onclick(value, (txt:string)=>{ row[1] = txt; });
        tr.oncontextmenu = function(e):void{
            const menu = ctx_menu(e);
            menu.item('Add Row Above', function():void{
                const idx = st[1].indexOf(row);
                if(idx < 0) return;
                const new_tr = elem('tr');
                const new_row:StatTableItem = ['Untitled', ''];
                st[1].splice(idx, 0, new_row);
                add_table_row(new_tr, st, new_row);
                tr.insertAdjacentElement('beforebegin', new_tr);
            }, locked);
            menu.item('Add Row Below', function():void{
                const idx = st[1].indexOf(row);
                if(idx < 0) return;
                const new_tr = elem('tr');
                const new_row:StatTableItem = ['Untitled', ''];
                st[1].splice(idx, 0, new_row);
                add_table_row(new_tr, st, new_row);
                tr.insertAdjacentElement('afterend', new_tr);
            }, locked);
            menu.separator();
            menu.item('Delete', function(){
                const idx = st[1].indexOf(row);
                if(idx < 0) return;
                tr.remove();
                st[1].splice(idx, 1);
            }, locked);
            menu.separator();
            menu.canceller();
            menu.install();
        };
    }
    function add_macro(container: HTMLDivElement, macro: StatMacro):void{
        const b = elem_parent_text(container, 'button', macro[1]);
        b.onclick = function(e){
            if(IS_MAC && e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) return;
            e.stopPropagation(); e.preventDefault();
            use_sb_macro(block, macro);
        };
        b.style.gridColumn = '0 / 1';
        b.oncontextmenu = function(e){
            const menu = ctx_menu(e);
            menu.item('Add Macro', function(){
              const macro: StatMacro = [ StatItemType.MACRO, 'New Macro', 'roll d20', [] ];
              contents.push(macro);
              add_macro(container, macro);
            }, locked);
            menu.separator();
            menu.item('Rename', function(){ edit_element_inline(b,  EditElementFlags.NONE, (txt:string)=>{ macro[1] = txt; }); }, locked);
            menu.item('Edit', function(){
                const d = get_dialog('simple-text');
                if(!d) return;
                d.clear_handlers();
                d.title.textContent = macro[1];
                d.f.text.value = macro[2];
                d.show_handler = function():void{
                    if(!IS_TOUCH) setTimeout(()=>d.f.text.focus(),0);
                };
                d.ok_handler = function():void{
                    const txt = d.f.text.value.trim();
                    if(!txt) return;
                    macro[2] = txt;
                };
                d.show();
            }, locked);
            menu.separator();
            menu.item('Delete', function(){ b.remove(); variable_container.remove(); }, locked);
            menu.canceller();
            menu.install();
        }
        let variable_container = elem_with_parent(container, 'div', null, 'sb-variable-container');
        for(const v of macro[3]) add_variable(variable_container, v);
    }
    function add_md(container: HTMLElement, md:StatMd):void{
        const div = elem_with_parent(container, 'div', null, 'sb-md-container');
        md_to_html(md[1], (h:string)=>{ div.innerHTML = h; });
        div.onclick = function(e):void{
            if(locked) return;
            const diag = get_dialog('md-text');
            if(!diag) return;
            e.stopPropagation();
            e.preventDefault();
            monospace_textarea(diag.f.textarea, null);
            diag.clear_handlers();
            diag.f.textarea.value = md[1];
            if(diag.windowhandle.children.length < 2)
                elem_with_parent(diag.windowhandle, 'span', null, 'window-title');
            diag.windowhandle.children[1].textContent = block[1];
            diag.show_handler = function(){
                // XXX this is retarded
                diag.window.style.display = 'grid';
                diag.f.textarea.focus();
            };
            diag.ok_handler = function(){
                md[1] = diag.f.textarea.value.trim();
                md_to_html(md[1], (h:string)=>{ div.innerHTML = h; });
            };
            diag.show();
        };
    }
    let macro_container:null|HTMLDivElement = null;
    let table_container:null|HTMLDivElement = null;
    let variable_container:null|HTMLDivElement = null;
    function add_variable(container: HTMLDivElement, v: StatVariable):void{
        const label = elem_parent_text(container, 'label', v[1]);
        switch(v[2]){
            case ScriptVariableType.BOOLEAN:{
                const input = elem_with_parent(label, 'input');
                input.type = 'checkbox';
                input.checked = v[3] === '1';
                input.onchange = function(){ v[3] = input.checked ? '1' : '0'; };
            }break;
            case ScriptVariableType.NUMBER:
            case ScriptVariableType.ABILITY_SCORE:{
                const input = elem_with_parent(label, 'input');
                input.type = 'number';
                input.value = v[3];
                input.onchange = function(){ v[3] = input.value; };
            }break;
            case ScriptVariableType.STRING:{
                const input = elem_with_parent(label, 'input');
                input.type = 'text';
                input.value = v[3];
                input.onchange = function(){ v[3] = input.value; };
            }break;
            case ScriptVariableType.CHOICE:{
                const select = elem_with_parent(label, 'select');
                for(const choice of v[4]){
                    const option = elem_with_parent(select, 'option');
                    option.value = choice;
                    option.textContent = choice;
                }
                label.onclick = function(e){ e.stopPropagation(); e.preventDefault(); select.focus(); };
                select.onchange = function(){ v[3] = select.value; };
            }break;
        }
    }
    for(const item of contents){
        switch(item[0]){
            case StatItemType.TABLE:{
                macro_container = null;
                variable_container = null;
                if(!table_container) table_container = elem_with_parent(container, 'div', null, 'sb-table-container');
                const table = elem_with_parent(table_container, 'table');
                for(const row of item[1]) add_table_row(elem_with_parent(table, 'tr'), item, row);
            } break;
            case StatItemType.MD:{
                macro_container = null;
                table_container = null;
                variable_container = null;
                add_md(container, item);
            } break;
            case StatItemType.MACRO:{
                if(!macro_container) macro_container = elem_with_parent(container, 'div', null, 'sb-macro-container');
                table_container = null
                variable_container = null;
                add_macro(macro_container, item);
            } break;
            case StatItemType.IMG:{
                macro_container = null;
                table_container = null;
                variable_container = null;
                const img = elem_with_parent(container, 'img');
                img.crossOrigin = 'anonymous';
                img.src = item[1];
            } break;
            case StatItemType.VARIABLE:{
                macro_container = null;
                table_container = null;
                if(!variable_container) variable_container = elem_with_parent(container, 'div', null, 'sb-variable-container');
                add_variable(variable_container, item);
            } break;
        }
    }
}

function get_sbw(): Win{
    if(!_sbw){
        by_id('sbw-window').style.width = '70ch';
        _sbw = get_window('sbw');
        const sb_el = by_id('sbw-sb');
        const tv_el = by_id('sbw-tv');
        const filt = by_id('sbw-filter');
        const list = by_id('sbw-filter-list');
        filt.oninput = function(){
            list.replaceChildren();
            const txt = filt.value.trim().toLowerCase();
            if(!txt) return;
            const matches:Array<[number, string, number]> = [];
            for(const sb of statblocks.values()){
                const name = sb[1].toLowerCase();;
                if(name.startsWith(txt)){
                    matches.push([sb[0], sb[1], 2]);
                }
                else if(name.split(' ').some(x => x.startsWith(txt))){
                    matches.push([sb[0], sb[1], 1]);
                }
                else if(name.includes(txt)){
                    matches.push([sb[0], sb[1], 0]);
                }
            }
            matches.sort(function(a:[number, string, number], b:[number, string, number]):number{
                if(a[2] > b[2]) return -1;
                if(a[2] < b[2]) return 1;
                return a[1].localeCompare(b[1]);
            });
            for(const m of matches){
                const id = m[0];
                const li = elem_parent_text(list, 'li', m[1]);
                li.tabIndex = 0;
                li.onclick = function(e:MouseEvent):void{
                    e.stopPropagation();
                    e.preventDefault();
                    show_sb(id, e);
                };
                li.onkeydown = function(e:KeyboardEvent):void{
                    if(e.key == 'Enter' || e.key == ' '){
                        show_sb(id, e as any);
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                    if(e.key == 'ArrowUp' || e.key == 'k'){
                        if(li.previousElementSibling && li.previousElementSibling.tagName == 'LI'){
                            (li.previousElementSibling as any).focus();
                        }
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                    if(e.key == 'ArrowDown' || e.key == 'j'){
                        if(li.nextElementSibling && li.nextElementSibling.tagName == 'LI'){
                            (li.nextElementSibling as any).focus();
                        }
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                };
            }
        }
        filt.onkeydown = function(e):void{
            if(e.key == 'Escape'){
                filt.value = '';
                list.replaceChildren();
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            if(e.key == 'Enter'){
                e.stopPropagation();
                e.preventDefault();
                if(list.children.length)
                    (list.children[0] as HTMLElement).onclick!(e as any);
                return;
            }
        }


        STATS_TV = make_tree_view(tv_el, 'statblock');
        let current_id = 0;
        function show_sb(id:number, e?:MouseEvent):void {
            if(e && e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey){
                const w = create_statblock_window(statblocks.get(id)!);
                w.show();
                w.win.win.style.left = (e.clientX-w.win.win.clientWidth/2)+'px';
                w.win.win.style.top = (e.clientY)+'px';
                ensure_window_is_completely_on_screen(w.win.win);
                return;
            }
            current_id = id;
            const sb = statblocks.get(id);
            if(!sb) return;
            sb_el.replaceChildren();
            elem_parent_text(sb_el, 'h2', sb[1]);
            sb_populate(sb_el, sb);
        };
        sb_el.oncontextmenu = function(e){
            const menu = ctx_menu(e);
            menu.item('Clone into Window', function(){
                let block = statblocks.get(current_id);
                if(!block) return;
                create_statblock_window(block).show();
            }, !statblocks.size);
            menu.item('Clone w/o md', function(){
                let block = statblocks.get(current_id);
                if(!block) return;
                let b = structuredClone(block);
                let contents = [];
                for(let c of b[2]){
                    if(c[0] == StatItemType.MD) continue;
                    contents.push(c);
                }
                b[2] = contents;
                create_statblock_window(b).show();
            }, !statblocks.size);
            menu.separator();
            menu.canceller();
            menu.install();
        };
        STATS_TV.on_click = show_sb;
        for(let sb of statblocks.values()){
            const [id, name, _, __] = sb;
            STATS_TV.add_item(name, id, null);
        }
        for(let key of statblocks.keys()){
            show_sb(key);
            break;
        }
        if(!statblocks.size){
            const inp = elem_with_parent(sb_el, 'input');
            inp.type = 'file';
            inp.accept = '.json';
            sb_file_upload(inp);
        }
        _sbw.wh_ctxmenu_handler = function(menu:CtxMenu):void{
            menu.item('Upload', function(){ (sb_el.firstChild as any).click(); });
        }
    }
    return _sbw;
}

function sb_file_upload(inp:HTMLInputElement):void{
    inp.onchange = function(){
        const filelist = inp.files;
        if(!filelist || filelist.length != 1)
            return;
        const file = filelist[0];
        file.text().then(s=>{
            const data = JSON.parse(s);
            if(!Array.isArray(data)) return;
            let i = 0;
            for(let sb of statblocks.values())
                if(sb[0] > i) i = sb[0];
            for(let sb of data){
                sb = v_StatBlock(sb);
                if(!sb) continue;
                sb[0] = ++i;
                statblocks.set(sb[0], sb);
                STATS_TV.add_item(sb[1], sb[0], null);
                // @ts-ignore
                if(sb[0] == 1) STATS_TV.on_click!(1, undefined);
            }
        });
    };
}
document.addEventListener('DOMContentLoaded', function():void{
    reopen_window(get_sbw, NormalWindow.GLOBAL, 'sbw/open');
    by_id('statblock-button').onclick = ()=>{ get_sbw().show(); };
});


type StatBlockWindow = {
    win: Win;
    content: HTMLElement;
    show: ()=>void;
};

function create_statblock_window(block: StatBlock):StatBlockWindow{
    block = structuredClone(block);
    let win: Win;
    {
        const w = elem('div', null, 'window');
        const wh = elem_with_parent(w, 'div', null, 'window-handle');
        const x = elem_parent_text(wh, 'span', '×', null, 'window-closer');
        const t = elem_parent_text(wh, 'span', block[1], null, 'window-title');
        const m = elem_parent_text(wh, 'span', '_', null, 'window-minimizer');
        win = normal_window(w, wh, x, m, t, 0, null);
    }
    const content = elem_with_parent(win.win, 'div', null, 'statblock-content');
    sb_populate(content, block);

    win.wh_ctxmenu_handler = function(menu:CtxMenu):void {
        menu.item('Rename', function(){
            edit_element_inline(win.t, EditElementFlags.NONE, (txt:string)=>{ block[1] = txt; });
        });
        menu.item('Duplicate', function(e:MouseEvent):void {
            const w = create_statblock_window(block);
            w.show();
            w.win.win.style.left = (e.clientX-win.win.clientWidth/2)+'px';
            w.win.win.style.top = e.clientY+'px';
            ensure_window_is_completely_on_screen(win.win);
        });
    };

    const result: StatBlockWindow = {
        win: win,
        content: content,
        show: win.show,
    };
    return result;
}

document.addEventListener('dragover', function(e:DragEvent):void{
    if(!e.dataTransfer!.types.includes(STATS_TV.mime)) return;
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
});
document.addEventListener('dragenter', function(e:DragEvent):void{
    if(!e.dataTransfer!.types.includes(STATS_TV.mime)) return;
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
});
document.addEventListener('dragleave', function(e:DragEvent):void{
    if(!e.dataTransfer!.types.includes(STATS_TV.mime)) return;
});
document.addEventListener('drop', function(e:DragEvent):void{
    if(!e.dataTransfer!.types.includes(STATS_TV.mime)) return;
    e.stopPropagation();
    e.preventDefault();
    const data = +e.dataTransfer!.getData(STATS_TV.mime);
    const block = statblocks.get(data);
    if(!block) return;
    let w = create_statblock_window(block);
    w.show();
    w.win.win.style.left = (e.clientX-w.win.win.clientWidth/2)+'px';
    w.win.win.style.top = (e.clientY-w.win.win.clientHeight/2)+'px';
    ensure_window_is_completely_on_screen(w.win.win);
});

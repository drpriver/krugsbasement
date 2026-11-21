//
// Copyright © 2026, David Priver <david@davidpriver.com>
//

type CampaignSearchItem = {
    id: number;
    name: string;
    parent: string;
    open: ()=>void;
    context_menu: (e:MouseEvent, name:HTMLElement)=>void;
    tree?: TreeView;
    find_content?: (pattern:RegExp)=>CampaignContentMatch|null;
};

type CampaignContentMatch = {snippet:string, open:()=>void};

function search_tree_items(tree:TreeView, find_content:(id:number, pattern:RegExp)=>CampaignContentMatch|null): Array<CampaignSearchItem>{
    const entries: Array<CampaignSearchItem> = [];
    for(const [id, item] of tree._items){
        const path:string[] = [];
        let parent = item.parent;
        while(parent !== null){
            const ancestor = tree._items.get(parent);
            if(!ancestor) break;
            path.push(ancestor.sp.textContent || '');
            parent = ancestor.parent;
        }
        entries.push({
            id,
            name: item.sp.textContent || '',
            parent: path.reverse().join(' › '),
            tree,
            context_menu: (e, name)=>{
                if(tree._items.has(id)) tree.on_ctxmenu?.(id, e, name);
            },
            open: ()=>tree._items.get(id)?.el.click(),
            find_content: pattern=>find_content(id, pattern),
        });
    }
    return entries;
}

function search_macro_items(): Array<CampaignSearchItem>{
    const macros: Array<CampaignSearchItem> = [];
    for(const [cid, character] of CHARACTERS){
        for(const mid of character[2]){
            const macro = MACROS.get(mid);
            if(macro){
                macros.push({id:mid, name:macro[1], parent:character[1], open:()=>open_macro_editor(cid, mid),
                    context_menu:(e, name)=>macro_context_menu(cid, mid, e, name),
                    find_content:pattern=>{
                        const snippet = content_excerpt(macro[2], pattern);
                        return snippet ? {snippet, open:()=>open_macro_editor(cid, mid, pattern)} : null;
                    },
                });
            }
        }
    }
    return macros;
}

function search_clock_items():CampaignSearchItem[]{
    const items:CampaignSearchItem[] = [];
    for(const clock of clocks.values()){
        if(clock.hidinguser && clock.hidinguser !== SETTINGS.userid) continue;
        items.push({id:clock.id, name:clock.name, parent:'', context_menu:(e, name)=>{
            const current = clocks.get(clock.id);
            if(current && (!current.hidinguser || current.hidinguser === SETTINGS.userid))
                clock_tv.on_ctxmenu?.(clock.id, e, name);
        }, open:()=>{
            const current = clocks.get(clock.id);
            if(!current || (current.hidinguser && current.hidinguser !== SETTINGS.userid)) return;
            const w = get_or_create_clock_window(current.id);
            w?.win.show();
            w?.win.win.focus();
        }});
    }
    return items;
}

function find_sheet_content(id:number, pattern:RegExp):CampaignContentMatch|null{
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return null;
    function result(snippet:string, cell:HTMLElement):CampaignContentMatch{
        return {snippet, open:()=>{
            const current = SPREADSHEETS.get(id);
            if(!current) return;
            current.win.show();
            if(current.grid.contains(cell)){
                cell.focus();
                cell.scrollIntoView({block:'nearest', inline:'nearest'});
            }
        }};
    }
    for(const [c, name] of sheet.column_names.entries()){
        const match = content_excerpt(name, pattern);
        if(match) return result('Column · ' + match, sheet.headers[c]);
    }
    for(let r = 0; r < sheet.cell_sources.length; r++){
        const row = sheet.cell_sources[r];
        for(let c = 0; c < row.length; c++){
            const display = sheet.cell_displays[r][c];
            const match = content_excerpt(row[c], pattern) || content_excerpt(sheet.cell_extras[r][c][0], pattern)
                || (display !== row[c] && content_excerpt(display, pattern));
            if(match){
                const address = c < 26 ? String.fromCharCode(65+c) + (r+1) : 'R' + (r+1) + 'C' + (c+1);
                return result(address + ' · ' + match, sheet.cell_elems[r][c]);
            }
        }
    }
    return null;
}

function content_excerpt(text:string, pattern:RegExp):string{
    if(!text) return '';
    const match = pattern.exec(text);
    if(!match) return '';
    const start = Math.max(0, match.index - 30);
    const end = Math.min(text.length, match.index + Math.min(match[0].length, 80) + 45);
    return (start ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim()
        + (end < text.length ? '…' : '');
}

function campaign_match_score(name:string, query:string, pattern:RegExp|null):number{
    if(!query) return 0;
    let at:number, length:number;
    if(pattern){
        const match = pattern.exec(name);
        if(!match) return Infinity;
        at = match.index;
        length = match[0].length;
    }
    else{
        name = name.toLowerCase();
        at = name.indexOf(query);
        if(at < 0) return Infinity;
        length = query.length;
    }
    if(at === 0) return length === name.length ? 0 : 1;
    return 2 + at / (name.length + 1);
}

document.addEventListener('DOMContentLoaded', function():void{
    const win = get_window('omni-search');
    win.win.setAttribute('role', 'dialog');
    win.win.setAttribute('aria-labelledby', win.t.id);
    const input = by_id('omni-search-input');
    const results = by_id('omni-search-results');
    const filters = by_id('omni-search-filters');
    const keep_open = by_id('omni-search-keep-open');
    keep_open.checked = get_global_default(StorageCategory.UI, 'omni-search/keep-open', false);
    keep_open.onchange = ()=>store_global(StorageCategory.UI, 'omni-search/keep-open', keep_open.checked);
    const contents = by_id('omni-search-contents');
    contents.checked = get_global_default(StorageCategory.UI, 'omni-search/contents', false);
    contents.onchange = ()=>{
        store_global(StorageCategory.UI, 'omni-search/contents', contents.checked);
        render();
    };
    const regex = by_id('omni-search-regex');
    regex.checked = get_global_default(StorageCategory.UI, 'omni-search/regex', false);
    regex.onchange = ()=>{
        store_global(StorageCategory.UI, 'omni-search/regex', regex.checked);
        render();
    };
    let waiting_for_notes = false;
    function find_note_content(id:number, pattern:RegExp):CampaignContentMatch|null{
        const note = NOTES.get(id);
        if(!note || note.flags & NOTEFLAGS.DELETED) return null;
        const editor = NOTE_WINDOWS.get(id);
        if(!editor?.is_editing){
            refresh_stale_note(note);
            if(note.request_pending){
                waiting_for_notes = true;
                return null;
            }
        }
        const snippet = content_excerpt(editor?.is_editing ? editor.editor.value : note.body, pattern);
        return snippet ? {snippet, open:()=>{
            if(!NOTE_TV._items.has(id)) return;
            const w = get_note_window(id);
            w.win.show();
            w.reveal_match(pattern);
        }} : null;
    }
    const sources:Array<[string, ()=>Array<CampaignSearchItem>]> = [
        ['Maps', ()=>search_tree_items(CANV_TV, find_map_content)],
        ['Notes', ()=>search_tree_items(NOTE_TV, find_note_content)],
        ['Sheets', ()=>search_tree_items(SHEET_TV, find_sheet_content)],
        ['Macros', search_macro_items],
        ['Clocks', search_clock_items],
    ];
    const categories = sources.map(([name, items])=>{
        const key = 'omni-search/' + name;
        const label = elem_with_parent(filters, 'label');
        const checkbox = elem_with_parent(label, 'input');
        checkbox.type = 'checkbox';
        checkbox.checked = get_global_default(StorageCategory.UI, key, true);
        label.append(' ' + name);
        label.onclick = e=>{
            if(e.shiftKey){
                // A direct checkbox click has already toggled it. A label click hasn't.
                const was_checked = e.target === checkbox ? !checkbox.checked : checkbox.checked;
                if(e.target !== checkbox){
                    e.preventDefault();
                    checkbox.focus();
                }
                toggle_solo(checkbox, was_checked);
                return;
            }
            if(e.target !== checkbox) return;
            store_global(StorageCategory.UI, key, checkbox.checked);
            render();
        };
        return {name, key, checkbox, items};
    });
    function toggle_solo(checkbox:HTMLInputElement, was_checked:boolean):void{
        const was_solo = was_checked && categories.every(c=>c.checkbox === checkbox || !c.checkbox.checked);
        for(const category of categories){
            category.checkbox.checked = was_solo || category.checkbox === checkbox;
            store_global(StorageCategory.UI, category.key, category.checkbox.checked);
        }
        render();
    }
    const shortcuts = new Map<string, ()=>void>();
    function bind_shortcut(checkbox:HTMLInputElement, key:string, code:string):void{
        shortcuts.set(code, ()=>checkbox.click());
        checkbox.setAttribute('aria-keyshortcuts', 'Alt+' + key);
        const hint = elem_parent_text(checkbox.labels![0], 'kbd', (IS_MAC ? '⌥' : 'Alt+') + key);
        hint.setAttribute('aria-hidden', 'true');
    }
    categories.forEach(({checkbox}, index)=>{
        const digit = String(index + 1);
        bind_shortcut(checkbox, digit, 'Digit' + digit);
        shortcuts.set('Shift+Digit' + digit, ()=>toggle_solo(checkbox, checkbox.checked));
        checkbox.setAttribute('aria-keyshortcuts', 'Alt+' + digit + ' Shift+Alt+' + digit);
    });
    bind_shortcut(contents, 'C', 'KeyC');
    bind_shortcut(regex, 'R', 'KeyR');
    bind_shortcut(keep_open, 'K', 'KeyK');
    const trigger = by_id('omni-search-button');
    const shortcut = IS_MAC ? '⌘K' : 'Ctrl+K';
    trigger.title = 'Search campaign (' + shortcut + ')';
    trigger.setAttribute('aria-keyshortcuts', IS_MAC ? 'Meta+K' : 'Control+K');
    const rows:{el:HTMLElement, open:()=>void}[] = [];
    let active = -1;
    let navigating = false;
    let return_focus:HTMLElement|null = null;

    function select(index:number):void{
        if(active >= 0) rows[active].el.setAttribute('aria-selected', 'false');
        active = index;
        if(active < 0){
            input.removeAttribute('aria-activedescendant');
            return;
        }
        const row = rows[active].el;
        row.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', row.id);
        if(navigating) row.scrollIntoView({block:'nearest'});
    }

    function open_result(index:number, invert_keep_open:boolean):void{
        const result = rows[index];
        if(!result) return;
        const stay_open = keep_open.checked !== invert_keep_open;
        if(!stay_open) win.close();
        result.open();
        if(stay_open){
            select(index);
            win.make_top();
            input.focus();
        }
    }

    function render():void{
        const query = regex.checked ? input.value : input.value.trim();
        const empty = by_id('omni-search-empty');
        active = -1;
        navigating = false;
        rows.length = 0;
        results.replaceChildren();
        input.removeAttribute('aria-activedescendant');
        waiting_for_notes = false;
        let pattern:RegExp|null = null;
        if(regex.checked && query){
            try{
                pattern = new RegExp(query, 'iu');
            }
            catch{
                input.setAttribute('aria-invalid', 'true');
                empty.textContent = 'Invalid regular expression';
                empty.hidden = false;
                return;
            }
        }
        input.removeAttribute('aria-invalid');
        const name_query = pattern ? query : query.toLowerCase();
        const content_pattern = contents.checked && query
            ? pattern || new RegExp(query.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&'), 'iu')
            : null;
        const enabled = categories.filter(category=>category.checkbox.checked);
        const groups = enabled.map(({name, items})=>{
            const matches = [];
            for(const item of items()){
                const score = campaign_match_score(item.name, name_query, pattern);
                const hit = content_pattern && score === Infinity ? item.find_content?.(content_pattern) : null;
                if(hit || Number.isFinite(score))
                    matches.push({item, score:hit ? 3 : score, hit});
            }
            matches.sort((a,b)=>a.score - b.score || a.item.name.localeCompare(b.item.name)
                || a.item.parent.localeCompare(b.item.parent));
            return {name, matches};
        }).filter(group=>group.matches.length);
        groups.sort((a,b)=>a.matches[0].score - b.matches[0].score);

        for(const group of groups){
            const section = elem_with_parent(results, 'section');
            section.setAttribute('role', 'group');
            section.setAttribute('aria-label', group.name);
            elem_parent_text(section, 'h3', group.name);
            for(const {item, hit} of group.matches){
                const row = elem_with_parent(section, 'div', 'omni-result-' + rows.length);
                row.dataset.key = JSON.stringify([group.name, item.id, item.parent]);
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', 'false');
                const title = elem_with_parent(row, 'span');
                const name = elem_parent_text(title, 'span', item.name);
                if(hit) elem_parent_text(title, 'small', hit.snippet, null, 'search-excerpt');
                if(item.parent) elem_parent_text(row, 'small', item.parent);
                const index = rows.length;
                row.onclick = e=>{
                    if(IS_MAC && e.ctrlKey) return;
                    open_result(index, e.shiftKey);
                };
                row.oncontextmenu = e=>item.context_menu(e, name);
                item.tree?.bind_item_drag(row, item.id);
                rows.push({el:row, open:hit ? hit.open : item.open});
            }
        }
        empty.textContent = waiting_for_notes ? 'Updating notes…' : enabled.length ? 'No matches' : 'Select a category to search.';
        empty.hidden = !!rows.length && !waiting_for_notes;
        results.scrollTop = 0;
        select(rows.length ? 0 : -1);
    }

    function show():void{
        const previous = document.activeElement;
        if(previous instanceof HTMLElement && !win.win.contains(previous))
            return_focus = previous;
        remove_ctx_menu();
        if(win.state === WinState.OPEN) refresh_results();
        win.show();
        input.focus();
    }

    trigger.onclick = show;
    win.show_handler = render;
    win.restore_handler = ()=>{
        render();
        input.focus();
    };
    win.close_handler = ()=>{
        input.value = '';
        if(document.activeElement === document.body || win.win.contains(document.activeElement))
            return_focus?.focus();
        return_focus = null;
    };
    input.oninput = render;
    function refresh_results():void{
        if(win.state !== WinState.OPEN) return;
        const key = navigating ? rows[active]?.el.dataset.key : undefined;
        render();
        if(key){
            const index = rows.findIndex(row=>row.el.dataset.key === key);
            if(index >= 0){
                navigating = true;
                select(index);
            }
        }
    }
    // A drop on a result or a drag out to the sidebar can change the displayed paths.
    let refresh_frame = 0;
    function schedule_refresh():void{
        if(refresh_frame) return;
        refresh_frame = requestAnimationFrame(()=>{
            refresh_frame = 0;
            if(!results.querySelector('.dragging, .editing')) refresh_results();
        });
    }
    results.addEventListener('drop', schedule_refresh, true);
    results.addEventListener('dragend', schedule_refresh);
    results.addEventListener('focusout', e=>{
        if(e.target instanceof HTMLInputElement) schedule_refresh();
    });
    listen_for(ListenEvent.NOTE_BODY_CHANGED, ()=>{
        if(win.state !== WinState.OPEN || !contents.checked || !input.value
            || !categories.some(c=>c.name === 'Notes' && c.checkbox.checked)) return;
        schedule_refresh();
    });
    window.addEventListener('keydown', function(e):void{
        if(!(IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)
            || e.key.toLowerCase() !== 'k' || e.shiftKey || e.altKey || e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        const was_open = win.state === WinState.OPEN;
        show();
        if(was_open){
            navigating = false;
            input.select();
        }
    }, true);
    win.win.onkeydown = function(e):void{
        e.stopPropagation();
        if(e.altKey && !e.ctrlKey && !e.metaKey && !e.isComposing){
            // Option can produce a symbol or a dead key on macOS.
            const code = !IS_MAC && e.code.startsWith('Key') ? 'Key' + e.key.toUpperCase() : e.code;
            const activate = shortcuts.get(e.shiftKey ? 'Shift+' + code : code);
            if(activate){
                e.preventDefault();
                if(!e.repeat){
                    activate();
                    input.focus();
                }
                return;
            }
        }
        if(e.key === 'Escape' && !e.isComposing){
            e.preventDefault();
            win.close();
            return;
        }
        if(e.target !== input || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
        if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
            e.preventDefault();
            if(!rows.length) return;
            navigating = true;
            const step = e.key === 'ArrowDown' ? 1 : -1;
            select((active + step + rows.length) % rows.length);
        }
        else if(e.key === 'Enter' || (e.key === ' ' && navigating)){
            e.preventDefault();
            open_result(active, e.key === 'Enter' && e.shiftKey);
        }
    };
});

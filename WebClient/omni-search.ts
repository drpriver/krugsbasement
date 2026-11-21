//
// Copyright © 2026, David Priver <david@davidpriver.com>
//

type CampaignSearchItem = {
    id: number;
    name: string;
    parent: string;
    open: ()=>void;
};

function search_tree_items(tree:TreeView): Array<CampaignSearchItem>{
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
            open: ()=>tree._items.get(id)?.el.click(),
        });
    }
    return entries;
}

function search_macro_items(): Array<CampaignSearchItem>{
    const macros: Array<CampaignSearchItem> = [];
    for(const [cid, character] of CHARACTERS){
        for(const mid of character[2]){
            const macro = MACROS.get(mid);
            if(macro)
                macros.push({id:mid, name:macro[1], parent:character[1], open:()=>open_macro_editor(cid, mid)});
        }
    }
    return macros;
}

function find_sheet_content(id:number, excerpt:(text:string)=>string):string{
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return '';
    for(const name of sheet.column_names){
        const match = excerpt(name);
        if(match) return 'Column · ' + match;
    }
    for(let r = 0; r < sheet.cell_sources.length; r++){
        const row = sheet.cell_sources[r];
        for(let c = 0; c < row.length; c++){
            const display = sheet.cell_displays[r][c];
            const match = excerpt(row[c]) || excerpt(sheet.cell_extras[r][c][0])
                || (display !== row[c] && excerpt(display));
            if(match){
                const address = c < 26 ? String.fromCharCode(65+c) + (r+1) : 'R' + (r+1) + 'C' + (c+1);
                return address + ' · ' + match;
            }
        }
    }
    return '';
}

function content_excerpt(pattern:RegExp):(text:string)=>string{
    return text=>{
        if(!text) return '';
        const match = pattern.exec(text);
        if(!match) return '';
        const start = Math.max(0, match.index - 30);
        const end = Math.min(text.length, match.index + Math.min(match[0].length, 80) + 45);
        return (start ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim()
            + (end < text.length ? '…' : '');
    };
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
    function find_note_content(id:number, excerpt:(text:string)=>string):string{
        const note = NOTES.get(id);
        if(!note || note.flags & NOTEFLAGS.DELETED) return '';
        const editor = NOTE_WINDOWS.get(id);
        if(editor?.is_editing) return excerpt(editor.editor.value);
        refresh_stale_note(note);
        if(note.request_pending){
            waiting_for_notes = true;
            return '';
        }
        return excerpt(note.body);
    }
    const sources:Array<[string, ()=>Array<CampaignSearchItem>, (id:number, excerpt:(text:string)=>string)=>string]> = [
        ['Maps', ()=>search_tree_items(CANV_TV), find_map_content],
        ['Notes', ()=>search_tree_items(NOTE_TV), find_note_content],
        ['Sheets', ()=>search_tree_items(SHEET_TV), find_sheet_content],
        ['Macros', search_macro_items, (id, excerpt)=>excerpt(MACROS.get(id)![2])],
    ];
    const categories = sources.map(([name, items, find_content])=>{
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
        return {name, key, checkbox, items, find_content};
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
    const rows:HTMLElement[] = [];
    let active = -1;
    let navigating = false;
    let return_focus:HTMLElement|null = null;

    function select(index:number):void{
        if(active >= 0) rows[active].setAttribute('aria-selected', 'false');
        active = index;
        if(active < 0){
            input.removeAttribute('aria-activedescendant');
            return;
        }
        const row = rows[active];
        row.setAttribute('aria-selected', 'true');
        input.setAttribute('aria-activedescendant', row.id);
        if(navigating) row.scrollIntoView({block:'nearest'});
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
        const excerpt = contents.checked && query
            ? content_excerpt(pattern || new RegExp(query.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&'), 'iu'))
            : null;
        const enabled = categories.filter(category=>category.checkbox.checked);
        const groups = enabled.map(({name, items, find_content})=>{
            const matches = [];
            for(const item of items()){
                const score = campaign_match_score(item.name, name_query, pattern);
                const snippet = excerpt && score === Infinity ? find_content(item.id, excerpt) : '';
                if(snippet || Number.isFinite(score))
                    matches.push({item, score:snippet ? 3 : score, snippet});
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
            for(const {item, snippet} of group.matches){
                const row = elem_with_parent(section, 'div', 'omni-result-' + rows.length);
                row.dataset.key = JSON.stringify([group.name, item.id, item.parent]);
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', 'false');
                const title = elem_parent_text(row, 'span', item.name);
                if(snippet) elem_parent_text(title, 'small', snippet, null, 'search-excerpt');
                if(item.parent) elem_parent_text(row, 'small', item.parent);
                const index = rows.length;
                row.onclick = ()=>{
                    if(!keep_open.checked) win.close();
                    item.open();
                    if(keep_open.checked){
                        select(index);
                        win.make_top();
                        input.focus();
                    }
                };
                rows.push(row);
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
        const key = navigating ? rows[active]?.dataset.key : undefined;
        render();
        if(key){
            const index = rows.findIndex(row=>row.dataset.key === key);
            if(index >= 0){
                navigating = true;
                select(index);
            }
        }
    }
    let note_frame = 0;
    listen_for(ListenEvent.NOTE_BODY_CHANGED, ()=>{
        if(note_frame || win.state !== WinState.OPEN || !contents.checked || !input.value
            || !categories.some(c=>c.find_content === find_note_content && c.checkbox.checked)) return;
        note_frame = requestAnimationFrame(()=>{
            note_frame = 0;
            if(contents.checked) refresh_results();
        });
    });
    window.addEventListener('keydown', function(e):void{
        if(!(IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey)
            || e.key.toLowerCase() !== 'k' || e.shiftKey || e.altKey || e.isComposing) return;
        e.preventDefault();
        e.stopPropagation();
        show();
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
            rows[active]?.click();
        }
    };
});

//
// Copyright © 2021-2025, David Priver
//

// TAG rolltables_window
document.addEventListener('DOMContentLoaded',function():void{
    const tablewindow = get_window('rolltable');
    tablewindow.win.style.minHeight = '300px';
    const tbody = by_id('rolltable-table-container');
    const listview = make_list_view<number>(by_id('rolltable-group-list'), ListViewFlags.USER_RENAMABLE|ListViewFlags.USER_DELETABLE);
    const tableview = make_table_view<number>(tbody, 3);
    for(let i = 0; i < 3; i++){
        tableview.rows[0][1][i].textContent = ['Weight', 'Value', 'Table?'][i];
        tableview.rows[0][1][i].classList.add('header');
    }
    let current_tables: Array<RollTable> = [];
    let current_table: RollTable | undefined;
    let rowid = 0;
    let newtableid = -1;
    tablewindow.close_handler = function():void{
        submit_tables();
    };
    const sh_tab = by_id('rolltable-shared');
    const pr_tab = by_id('rolltable-private');
    function switch_to(tbs:Array<RollTable>):void{
        if(tbs === ROLLTABLES.shared){
            sh_tab.classList.add('active-tab');
            pr_tab.classList.remove('active-tab');
        }
        else {
            pr_tab.classList.add('active-tab');
            sh_tab.classList.remove('active-tab');
        }
        if(current_tables === tbs)
            return;
        current_tables = tbs;
        setup_listview();
    }

    sh_tab.onclick = function(e:MouseEvent):void{
        e.stopPropagation();
        e.preventDefault();
        switch_to(ROLLTABLES.shared);
    };

    pr_tab.onclick = function(e:MouseEvent):void{
        e.stopPropagation();
        e.preventDefault();
        switch_to(ROLLTABLES.private);
    };

    function setup_listview():void{
        listview.clear();
        for(let rt of current_tables){
            listview.add_item(rt.name, rt.id);
        }
        if(!current_tables.length){
            listview.make_active(undefined);
        }
        else
            listview.make_active(current_tables[0].id);
    }

    listen_for(ListenEvent.ROLLTABLES_RECEIVED, function():void{
        switch_to(ROLLTABLES.shared);
    });
    tablewindow.show_handler = function():void{
        current_tables = [];
        current_table = undefined;
        rowid = 0;
        newtableid = -1;
        listview.clear();
        tableview.clear();
        EMIT(FromClient.RETRIEVE_ROLL_TABLES);
    };
    listview.activate_handler = function(id:number | undefined):void{
        if(id === undefined){
            tableview.clear();
            current_table = undefined;
            return;
        }
        for(let rt of current_tables){
            if(rt.id == id){
                current_table = rt;
                show_table(rt);
                return;
            }
        }
        tableview.clear();
    }
    listview.user_rename_handler = function(id:number, name:string):void{
        for(let rt of current_tables){
            if(rt.id == id){
                rt.name = name;
                return;
            }
        }
    };
    listview.user_remove_handler = function(id:number):void{
        for(let i = 0; i < current_tables.length; i++){
            if(current_tables[i].id == id){
                current_tables.splice(i, 1);
                return;
            }
        }
    }
    function install_row(row:Array<HTMLDivElement>, id:number, table:RollTable, entry:RollTableEntry):void{
        for(const el of row){
            el.oncontextmenu = function(e:MouseEvent):void{
                const menu = ctx_menu(e);
                menu.item('Insert Below', function():void{
                    const new_id = add_row();
                    if(new_id == -1) return;
                    tableview.move_after(new_id, id);
                    const row = tableview.get_row(id);
                    if(!row) return;
                    const col_idx = row.indexOf(el);
                    if(col_idx == -1) return;
                    tableview.get_row(new_id)![col_idx].focus();
                    return;
                });
                menu.item('Move Up', function():void{
                    tableview.move_row_by(id, -1);
                });
                menu.item('Move Down', function():void{
                    tableview.move_row_by(id, +1);
                });
                menu.item('Delete', function():void{
                    tableview.remove_row(id);
                    for(let i = 0; i < table.entries.length; i++){
                        if(table.entries[i] === entry){
                            table.entries.splice(i, 1);
                            if(table.entries.length == 0)
                                add_row();
                            return;
                        }
                    }
                });
                menu.separator();
                menu.canceller();
                menu.install();
            };
        }
        function onkeydown(e:KeyboardEvent):void{
            if(e.altKey) return;
            const cell = e.target as HTMLDivElement;
            const is_check = cell === row[2];
            switch(e.key){
                case 'ArrowLeft': {
                    e.stopPropagation();
                    e.preventDefault();
                    if(e.ctrlKey && e.shiftKey && !e.altKey)
                        return;
                    const row = tableview.get_row(id);
                    if(!row) return;
                    let col_idx = row.indexOf(cell);
                    if(col_idx == -1) return;
                    col_idx--;
                    if(col_idx < 0) return;
                    row[col_idx].focus();
                } return;
                case 'ArrowRight': {
                    e.stopPropagation();
                    e.preventDefault();
                    if(e.ctrlKey && e.shiftKey && !e.altKey)
                        return;
                    const row = tableview.get_row(id);
                    if(!row) return;
                    let col_idx = row.indexOf(cell);
                    if(col_idx == -1) return;
                    col_idx++;
                    if(col_idx >= row.length) return;
                    row[col_idx].focus();
                } return;
                case 'ArrowUp': {
                    e.stopPropagation();
                    e.preventDefault();
                    if(e.ctrlKey && e.shiftKey && !e.altKey){
                        tableview.move_row_by(id, -1);
                        cell.focus();
                        return;
                    }
                    const row = tableview.get_row(id);
                    if(!row) return;
                    const col_idx = row.indexOf(cell);
                    if(col_idx == -1) return;
                    const target = tableview.get_row_off(id, -1);
                    if(!target) return;
                    target[col_idx].focus();
                } return;
                case 'ArrowDown': {
                    e.stopPropagation();
                    e.preventDefault();
                    if(e.ctrlKey && e.shiftKey && !e.altKey){
                        tableview.move_row_by(id, +1);
                        cell.focus();
                        return;
                    }
                    const row = tableview.get_row(id);
                    if(!row) return;
                    const col_idx = row.indexOf(cell);
                    if(col_idx == -1) return;
                    const target = tableview.get_row_off(id, +1);
                    if(!target) return;
                    target[col_idx].focus();
                } return;
                case 'Escape':
                    e.stopPropagation();
                    e.preventDefault();
                    remove_ctx_menu();
                    return;
                case 'Delete':{
                    e.stopPropagation();
                    e.preventDefault();
                    const row = tableview.get_row(id);
                    if(!row) return;
                    let before = 1;
                    for(before = 1; before < tableview.rows.length; before++){
                        if(row === tableview.rows[before][1]){
                            break;
                        }
                    }
                    if(before < 1) before = 1;
                    if(before >= tableview.rows.length-1)
                        before = tableview.rows.length-2;
                    if(!e.shiftKey && e.ctrlKey && !e.altKey){
                        tableview.remove_row(id);
                        const idx = table.entries.indexOf(entry);
                        if(idx !== -1)
                            table.entries.splice(idx, 1);
                        if(!table.entries.length)
                            add_row();
                        tableview.rows[before][1][row.indexOf(cell)].focus();
                        return;
                    }
                    if(row && cell === row[2]){
                        cell.textContent = '';
                        entry.value = '';
                        return;
                    }
                }return;
                case 'Shift':
                    return;
                case 'Enter':
                    e.stopPropagation();
                    e.preventDefault();
                    if(is_check){
                        (cell.children[0] as any).click();
                        return;
                    }
                    if(e.ctrlKey){
                        const new_id = add_row();
                        if(new_id == -1) return;
                        tableview.move_after(new_id, id);
                        const row = tableview.get_row(id);
                        if(!row) return;
                        const col_idx = row.indexOf(cell);
                        if(col_idx == -1) return;
                        tableview.get_row(new_id)![col_idx].focus();
                        return;
                    }
                    const row = tableview.get_row(id);
                    if(!row) return;
                    const col_idx = row.indexOf(cell);
                    if(col_idx == -1) return;
                    const target = tableview.get_row_off(id, +1);
                    if(!target) return;
                    target[col_idx].focus();
                    return;
                // @ts-ignore
                case ' ':
                    if(is_check){
                        e.stopPropagation();
                        e.preventDefault();
                        (cell.children[0] as any).click();
                        return;
                    }
                    // fall-through
                default:
                    if(IS_MAC){
                        if(e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey){
                            if(e.key == 'n'){
                                e.stopPropagation();
                                e.preventDefault();
                                const row = tableview.get_row(id);
                                if(!row) return;
                                const col_idx = row.indexOf(cell);
                                if(col_idx == -1) return;
                                const target = tableview.get_row_off(id, +1);
                                if(!target) return;
                                target[col_idx].focus();
                                return;
                            }
                            if(e.key == 'p'){
                                e.stopPropagation();
                                e.preventDefault();
                                const row = tableview.get_row(id);
                                if(!row) return;
                                const col_idx = row.indexOf(cell);
                                if(col_idx == -1) return;
                                const target = tableview.get_row_off(id, -1);
                                if(!target) return;
                                target[col_idx].focus();
                                return;
                            }
                            if(e.key == 'b'){
                                e.stopPropagation();
                                e.preventDefault();
                                const row = tableview.get_row(id);
                                if(!row) return;
                                let col_idx = row.indexOf(cell);
                                if(col_idx == -1) return;
                                col_idx--;
                                if(col_idx < 0) return;
                                row[col_idx].focus();
                                return;
                            }
                            if(e.key == 'f'){
                                e.stopPropagation();
                                e.preventDefault();
                                const row = tableview.get_row(id);
                                if(!row) return;
                                let col_idx = row.indexOf(cell);
                                if(col_idx == -1) return;
                                col_idx++;
                                if(col_idx >= row.length) return;
                                row[col_idx].focus();
                                return;
                            }
                            if(is_check) return;
                            if(e.key == 'h'){
                                edit_cell(cell);
                                break;
                            }
                        }
                    }
                    if(is_check) return;
                    if(e.metaKey || e.altKey || e.ctrlKey) return;
                    edit_cell(cell);
                    return;
            }
        };
        function edit_cell(cell:HTMLDivElement):void{
            return edit_element_inline(cell, EditElementFlags.REFOCUS, function(s:string):void{
                const row = tableview.get_row(id);
                if(!row) return;
                if(row[0] === cell){
                    entry.weight = +s;
                    cell.textContent = ''+entry.weight;
                }
                else {
                    entry.value = s;
                }
            });
        }
        for(const r of row){
            r.tabIndex = -1;
            r.onkeydown = onkeydown;
        }
        row[0].textContent = ''+entry.weight;
        row[1].textContent = entry.value;
        row[0].onmousedown = function(e:MouseEvent):void{
            e.stopPropagation();
            e.preventDefault();
            remove_ctx_menu();
            row[0].focus();
        };
        row[1].onmousedown = function(e:MouseEvent):void{
            e.stopPropagation();
            e.preventDefault();
            remove_ctx_menu();
            row[1].focus();
        };
        row[1].onpaste = function(e:ClipboardEvent):void{
            e.stopPropagation();
            e.preventDefault();
            const data = e.clipboardData!.getData('text');
            take_paste(data);
        };
        row[2].onmousedown = function(e:MouseEvent):void{
            e.stopPropagation();
            e.preventDefault();
            remove_ctx_menu();
            row[2].focus();
        };

        const check = elem_with_parent(elem_with_parent(row[2], 'label'), 'input');
        check.type = 'checkbox';
        check.checked = entry.flags & RollTableFlags.IS_TABLE?true:false;
        check.onchange = function():void{
            if(check.checked)
                entry.flags |= RollTableFlags.IS_TABLE;
            else
                entry.flags &= ~RollTableFlags.IS_TABLE;
        };
    }

    function show_table(table:RollTable):void{
        tableview.clear();
        const length = table.entries.length;
        const entries = table.entries;
        let row: Array<HTMLDivElement> | undefined = undefined;
        for(let i = 0; i < length; i++){
            const entry = entries[i];
            let id = rowid++;
            row = tableview.add_row(id);
            install_row(row, id, table, entry);
        }
        if(!IS_TOUCH && tableview.rows.length > 1)
            tableview.rows[1][1][1].focus();
    }
    function add_row():number{
        if(current_table === undefined) return -1;
        const entry: RollTableEntry = {
            weight: 1,
            value: '',
            flags: 0,
        };
        const id = rowid++;
        const row = tableview.add_row(id);
        current_table.entries.push(entry);
        install_row(row, id, current_table, entry);
        if(!IS_TOUCH) row[1].focus();
        return id;
    }
    by_id('rolltable-add-table').onclick = function():void{
        let dialog = get_dialog('simple-text');
        if(!dialog) return;
        dialog.clear_handlers();
        dialog.title.textContent = 'Table Name';
        dialog.f.text.value = '';
        dialog.ok_handler = function():void{
            let text = dialog.f.text.value.trim();
            if(!text) return;
            let id = --newtableid;
            const table = {
                name:text,
                id: id, // sending < 0 to the server means the server should assign a new id
                entries: [{weight:1, value:"", flags:0}]
            };
            current_tables.push(table);
            listview.add_item(table.name, table.id);
            listview.make_active(table.id);
        };
        dialog.show_handler = function():void{
            if(!IS_TOUCH)dialog.f.text.focus();
        };
        dialog.show();
    };

    function submit_tables():void{
        EMIT(FromClient.UPDATE_ROLL_TABLES, [ROLLTABLES.shared, ROLLTABLES.private]);
        signal_for(ListenEvent.ROLLTABLES_RENAMED);
    }
    function take_paste(text:string):void{
        if(current_table == undefined) return;
        const lines = text.split(/\n/);
        for(const line of lines){
            let split = line.split(/\t/);
            let value = '';
            let weight = 1;
            let flags = RollTableFlags.NONE;
            if(split.length > 1){
                value = split[1];
                if(split.length > 2){
                    let t = split[2].toLowerCase();
                    if(t  == 'true' || t == 't' || t == 'x' || t == '1' || t == 'yes')
                        flags = RollTableFlags.IS_TABLE;
                }
            }
            else
                value = split[0];
            let entry = {weight:weight, value:value, flags:flags};
            let id = rowid++;
            const row = tableview.add_row(id);
            current_table.entries.push(entry);
            install_row(row, id, current_table, entry);
        }
    }
    by_id('rolltable-paste').onclick = function():void{
        navigator.clipboard.readText().then(take_paste);
    };
    by_id('rolltable-roll').onclick = function():void{
        if(!current_table) return;
        submit_tables();
        const cmd = current_tables === ROLLTABLES.shared? 'table':'mytable'
        preprocess_and_send_chat(`${cmd} ${current_table.name}`, -1, -1);
    };
    by_id('tables-button').onclick = tablewindow.show;
});

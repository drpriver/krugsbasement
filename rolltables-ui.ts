//
// Copyright © 2021-2022, David Priver
//

// TAG rolltables_window
document.addEventListener('DOMContentLoaded',function(){
    let tablewindow = get_window('rolltable');
    let tbody = by_id('rolltable-body');
    let listview = make_list_view<number>(by_id('rolltable-group-list'), ListViewFlags.USER_RENAMABLE|ListViewFlags.USER_DELETABLE);
    let tableview = make_table_view<number>(tbody);
    let current_tables: Array<RollTable> = [];
    let current_table: RollTable | undefined;
    let rowid = 0;
    let newtableid = -1;
    tablewindow.hide_handler = function(){
        submit_tables();
    };
    let sh_tab = by_id('rolltable-shared');
    let pr_tab = by_id('rolltable-private');
    function switch_to(tbs:Array<RollTable>){
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

    sh_tab.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        switch_to(ROLLTABLES.shared);
    });

    pr_tab.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        switch_to(ROLLTABLES.private);
    });

    function setup_listview(){
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

    listen_for(ListenEvent.ROLLTABLES_RECEIVED, function(){
        switch_to(ROLLTABLES.shared);
    });
    tablewindow.show_handler = function(){
        current_tables = [];
        current_table = undefined;
        rowid = 0;
        newtableid = -1;
        listview.clear();
        tableview.clear();
        EMIT(FromClient.RETRIEVE_ROLL_TABLES);
    };
    listview.activate_handler = function(id:number | undefined){
        let parenttable = tableview.tbody.parentNode! as HTMLTableElement;
        if(id === undefined){
            tableview.clear();
            parenttable.style.visibility = 'hidden';
            current_table = undefined;
            return;
        }
        for(let rt of current_tables){
            if(rt.id == id){
                current_table = rt;
                parenttable.style.visibility = 'initial';
                show_table(rt);
                return;
            }
        }
        tableview.clear();
        parenttable.style.visibility = 'hidden';
    }
    listview.user_rename_handler = function(id:number, name:string){
        for(let rt of current_tables){
            if(rt.id == id){
                rt.name = name;
                return;
            }
        }
    };
    listview.user_remove_handler = function(id:number){
        for(let i = 0; i < current_tables.length; i++){
            if(current_tables[i].id == id){
                current_tables.splice(i, 1);
                return;
            }
        }
    }
    function show_table(table:RollTable){
        tableview.clear();
        let length = table.entries.length;
        let row: HTMLTableRowElement | undefined = undefined;
        for(let i = 0; i < length; i++){
            const entry = table.entries[i];
            let id = rowid++;
            row = make_row(id, entry, table.entries);
            tableview.add_row(row, id);
        }
        if(row && !IS_TOUCH)
            (row.children[2].children[0] as any).focus();
    }
    function make_row(key:number, entry:RollTableEntry, entries:Array<RollTableEntry>):HTMLTableRowElement{
        let weight = entry.weight;
        let text = entry.value;
        let is_table = !!(entry.flags & RollTableFlags.IS_TABLE);
        const tr = elem('tr');
        function append(el:HTMLElement){
            const td = elem_with_parent(tr, 'td');
            td.appendChild(el);
        }

        const ud = elem('div', null, 'up-down');
        const up = elem_parent_text(ud, 'button', '▲', null, 'up');
        const down = elem_parent_text(ud, 'button', '▼', null, 'down');
        up.addEventListener('click', function(){
            for(let i = 0; i < entries.length; i++){
                if(entries[i] === entry){
                    if(i != 0){
                        let tmp = entries[i-1];
                        entries[i-1] = entries[i];
                        entries[i] = tmp;
                    }
                    break;
                }
            }
            tableview.move_row_by(key, -1);
        });
        down.addEventListener('click', function(){
            for(let i = 0; i < entries.length; i++){
                if(entries[i] == entry){
                    if(i != entries.length-1){
                        let tmp = entries[i+1];
                        entries[i+1] = entries[i];
                        entries[i] = tmp;
                    }
                    break;
                }
            }
            tableview.move_row_by(key, +1);
        });
        append(ud);

        const weightinp = elem('input');
        weightinp.value = ''+weight;
        weightinp.type = 'number';
        weightinp.addEventListener('change', function(){
            let w = +weightinp.value;
            if(!w) w = 1;
            entry.weight = w;
        });
        append(weightinp);

        const valinp = elem('input');
        valinp.type = 'text';
        valinp.value = text;
        valinp.addEventListener('change', function(){
            let v = valinp.value;
            if(!v) v = 'Untitled';
            entry.value = v;
        });
        valinp.addEventListener('keydown', function(e){
            if(e.key == 'Enter') {
                add_row();
                return;
            }
        });
        valinp.addEventListener('paste', function(e:ClipboardEvent){
            e.stopPropagation();
            e.preventDefault();
            let data = e.clipboardData!.getData('text');
            take_paste(data);
            del.click();
        });
        append(valinp);

        const tablecheck = elem('input');
        tablecheck.type = 'checkbox';
        tablecheck.checked = is_table;
        tablecheck.addEventListener('change', function(){
            if(tablecheck.checked)
                entry.flags |= RollTableFlags.IS_TABLE;
            else
                entry.flags &= ~RollTableFlags.IS_TABLE;
        });
        append(tablecheck);

        const del = elem_with_text('button', 'Delete');
        append(del);
        del.addEventListener('click', function(){
            tableview.remove_row(key);
            for(let i = 0; i < entries.length; i++){
                if(entries[i] === entry){// comparing for identity here. js sucks
                    entries.splice(i, 1);
                    if(entries.length == 0)
                        add_row();
                    return;
                }
            }
        });
        return tr;
    }
    function add_row(){
        if(current_table === undefined) return;
        const entry: RollTableEntry = {
            weight: 1,
            value: '',
            flags: 0,
        };
        let id = rowid++;
        const row = make_row(id, entry, current_table.entries);
        current_table.entries.push(entry);
        tableview.add_row(row, id);
        if(!IS_TOUCH)(row.children[2].children[0] as any).focus();
    }
    by_id('rolltable-add-table').addEventListener('click', function(){
        let dialog = get_dialog('simple-text');
        if(!dialog) return;
        dialog.title.textContent = 'Table Name';
        dialog.f.text.value = '';
        dialog.ok_handler = function(){
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
        dialog.show_handler = function(){
            if(!IS_TOUCH)dialog.f.text.focus();
        };
        dialog.show();
    });

    function submit_tables(){
        EMIT(FromClient.UPDATE_ROLL_TABLES, [ROLLTABLES.shared, ROLLTABLES.private]);
        signal_for(ListenEvent.ROLLTABLES_RENAMED);
    }
    function take_paste(text:string){
        if(current_table == undefined) return;
        let lines = text.split(/\n/);
        for(let line of lines){
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
            let row = make_row(id, entry, current_table.entries);
            current_table.entries.push(entry);
            tableview.add_row(row, id);
        }
    }
    by_id('rolltable-paste').addEventListener('click', function(){
        let prom = navigator.clipboard.readText();
        prom.then(take_paste);
    });
    by_id('tables-button').addEventListener('click', tablewindow.show);
});

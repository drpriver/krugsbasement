//
// Copyright © 2021-2023, David Priver
//

// TODO: global context menu registry.
// TODO: reusable edit element component
// TODO: formulas
//       These should be calculated client side. Might need to optimize or write
//       the implementation in wasm.
//
type SpreadSheet = {
    id: number;
    w:HTMLDivElement;
    show:() => void;
    hide:() => void;
    make_top:() => void;
    set_title:(_:string) => void;
    set_flags:(_:SpreadSheetFlags) => void;

    // For whence:
    //   -1 means at end.
    //    0 means at start.
    add_row1:(whence:number) => void;
    add_row2:(whence:number, values:Array<string>) => void;
    move_row:(from:number, to:number) => void;
    del_row:(whence:number) => void;
    add_column1:(whence:number) => void;
    add_column2:(whence:number, column_name:string) => void;
    add_column3:(whence:number, column_name:string, values:Array<string>) => void;
    move_column:(from:number, to:number) => void;
    rename_column:(whence:number, column_name:string) => void;
    del_column:(whence:number) => void;

    edit_cell:(row_idx:number, col_idx:number, val:string) => void;

    sort:(col_idx:number, dir:number) => void;
    apply_sort:(sorted:Array<number>) => void;

    flags: SpreadSheetFlags;
    cells: Array<Array<HTMLDivElement>>;
    column_names: Array<string>;
    headers: Array<HTMLDivElement>;
    number_els: Array<HTMLDivElement>;
    header_number_el: HTMLDivElement;
}

function make_spreadsheet(id:number, flags: SpreadSheetFlags, name:string):SpreadSheet {
    const winid = `spreadsheet-window-${id}`;
    const openid = `${winid}/open`
    // idk should assert here or something if winid already exists
    const w = elem_with_parent(document.body, 'div', winid, 'tracker-grid');
    const wh = elem_with_parent(w, 'div', null, 'window-handle');
    wh.oncontextmenu = function(e:MouseEvent){
        do_removes();
        e.stopPropagation();
        e.preventDefault();
        const menu = elem('section', null, 'menu');
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.style.zIndex = ''+(w.style.zIndex + 1);
        function remove(e?:MouseEvent){
            menu.remove();
            if(e){
                e.stopPropagation();
                e.preventDefault();
            }
            const idx = removes.indexOf(remove);
            if(idx != -1) removes.splice(idx, 1);
        }
        removes.push(remove);
        elem_parent_text(menu, 'section', 'Rename', null, 'menuitem').onclick = function(e:MouseEvent){
            remove(e);
            // TODO: reusable edit elem
            const cell = t;
            const w = '' + (cell.getBoundingClientRect().width-2) + 'px';
            const h = '' + (cell.getBoundingClientRect().height-2) + 'px';
            let oldtxt = cell.textContent;
            if(!oldtxt) oldtxt = '';
            // cell.classList.add('editing');
            cell.textContent = '';
            const inp = elem_with_parent(cell, 'input');
            inp.style.width = w;
            inp.style.height = h;
            inp.value = oldtxt;
            inp.onkeydown = function(e){
                e.stopPropagation();
                switch(e.key){
                    case 'Escape':
                    case 'Enter':{
                        e.preventDefault();
                        inp.blur();
                    }return;
                }
            };
            inp.onblur = function(){
                const v = inp.value.trim();
                cell.textContent = v;
                if(oldtxt != v){
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.NAME, result.id, v]);
                }
                // cell.classList.remove('editing');
                inp.remove();
            };
            inp.focus();
        };
        elem_parent_text(menu, 'section', 'Show Other People', null, 'menuitem').onclick = function(e){
            remove(e);
            EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.SHOW, result.id]);
        };
        elem_with_parent(menu, 'section', null, 'menuseparator');
        elem_parent_text(menu, 'section', 'Toggle Numbers', null, 'menuitem').onclick = function(e:MouseEvent){
            remove(e);
            EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.FLAG, result.id, result.flags ^ SpreadSheetFlags.NUMBERED]);
        };
        const flagstuff: Array<[SpreadSheetFlags, string]> = [
            [SpreadSheetFlags.CAN_ADD_ROW, 'Adding Rows'],
            [SpreadSheetFlags.CAN_ADD_COL, 'Adding Columns'],
            [SpreadSheetFlags.CAN_MOVE_ROWS, 'Moving Rows'],
            [SpreadSheetFlags.CAN_MOVE_COLUMNS, 'Moving Columns'],
            [SpreadSheetFlags.CAN_DEL_ROW, 'Deleting Rows'],
            [SpreadSheetFlags.CAN_DEL_COL, 'Deleting Columns'],
            [SpreadSheetFlags.CAN_SORT_COLS, 'Sorting'],
        ];
        for(const [flag, mess] of flagstuff){
            elem_parent_text(menu, 'section', (result.flags & flag ? 'Disable ' : 'Enable ')+mess, null, 'menuitem').onclick = function(e:MouseEvent){
                remove(e);
                if(result.flags & flag){
                    if((e.target as HTMLSelectElement).textContent![0] == 'E') return;
                }
                else {
                    if((e.target as HTMLSelectElement).textContent![0] == 'D') return;
                }
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.FLAG, result.id, result.flags ^ flag]);
            };
        }
        elem_with_parent(menu, 'section', null, 'menuseparator');
        elem_parent_text(menu, 'section', 'Delete Spreadsheet', null, 'menuitem').onclick = function(e){
            remove(e);
            const diag = get_dialog('simple-delete');
            if(!diag) return;
            diag.f.delete.checked = false;
            diag.ok_handler = function(){
                if(diag.f.delete.checked)
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE, result.id]);
            };
            diag.show();
        };
        elem_with_parent(menu, 'section', null, 'menuseparator');
        elem_parent_text(menu, 'section', 'Cancel', null, 'menuitem').onclick = remove;
        document.body.appendChild(menu);
    }
    const x = elem_parent_text(wh, 'span', '×', null, 'window-closer');
    const t = elem_parent_text(wh, 'span', '', null, 'window-title');

    setup_movable_window(w, wh, WINDOWFLAGS.REMEMBER_POSITION|WINDOWFLAGS.LOCAL_REMEMBER);
    const result = {
        id,
        w:w,
        show: function(){
            store_local(StorageCategory.WINDOW, openid, '1');
            w.style.display = 'grid';
            result.make_top();
        },
        hide: function(){ w.style.display = 'none'; },
        cells: [],
        flags,
        column_names:[], // initialize with one blank column
        headers:[],
        number_els: [],
    } as any as SpreadSheet;
    function gtr(){
        const n = 2 + result.cells.length;
        return `repeat(${n}, max-content)`;
    }
    function gtc(){
        let n = result.headers.length;
        n += (result.flags & SpreadSheetFlags.NUMBERED)?1:0;
        return `repeat(${n}, max-content)`;
    }
    const removes:Array<()=>void> = [];
    function do_removes(){for(const r of Array.from(removes)) r();}
    function hdropdown(e:MouseEvent){
        do_removes();
        e.stopPropagation();
        e.preventDefault();
        const menu = elem('section', null, 'menu');
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.style.zIndex = ''+(w.style.zIndex + 1);
        const h = e.target as HTMLDivElement;
        const col_idx = result.headers.indexOf(h);
        if(col_idx == -1) return;
        function remove(e?:MouseEvent){
            menu.remove();
            if(e){
                e.stopPropagation();
                e.preventDefault();
            }
            const idx = removes.indexOf(remove);
            if(idx != -1) removes.splice(idx, 1);
        }
        removes.push(remove);
        if(result.flags & SpreadSheetFlags.CAN_SORT_COLS){
            elem_parent_text(menu, 'section', 'Sort Ascending', null, 'menuitem').onclick = function(e:MouseEvent){
                remove(e);
                result.sort(col_idx, +1);
            };
            elem_parent_text(menu, 'section', 'Sort Descending', null, 'menuitem').onclick = function(e:MouseEvent){
                remove(e);
                result.sort(col_idx, -1);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_ADD_COL){
            elem_parent_text(menu, 'section', 'Insert Column Left', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, col_idx]);
                remove(e);
            };
            elem_parent_text(menu, 'section', 'Insert Column Right', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, col_idx+1]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_DEL_COL){
            elem_parent_text(menu, 'section', 'Delete Column', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE_COL, result.id, col_idx]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_MOVE_COLUMNS){
            elem_parent_text(menu, 'section', 'Move Column Left', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx-1]);
                remove(e);
            };
            elem_parent_text(menu, 'section', 'Move Column Right', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx+1]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_ADD_ROW){
            elem_parent_text(menu, 'section', 'Insert Row Top', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, 0]);
                remove(e);
            };
            elem_parent_text(menu, 'section', 'Insert Row Bottom', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, -1]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        elem_parent_text(menu, 'section', 'Cancel', null, 'menuitem').onclick = remove;
        document.body.appendChild(menu);
    }
    function rdropdown(e:MouseEvent){
        do_removes();
        e.stopPropagation();
        e.preventDefault();
        const row_idx = (+((e.target as HTMLDivElement).textContent as string))-1;
        if(row_idx == -1) return;
        const menu = elem('section', null, 'menu');
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.style.zIndex = ''+(w.style.zIndex + 1);
        function remove(e?:MouseEvent){
            menu.remove();
            if(e){
                e.stopPropagation();
                e.preventDefault();
            }
            const idx = removes.indexOf(remove);
            if(idx != -1) removes.splice(idx, 1);
        }
        removes.push(remove);
        if(result.flags & SpreadSheetFlags.CAN_ADD_ROW){
            elem_parent_text(menu, 'section', 'Insert Row Above', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, row_idx]);
                remove(e);
            };
            elem_parent_text(menu, 'section', 'Insert Row Below', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, row_idx+1]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_MOVE_ROWS){
            elem_parent_text(menu, 'section', 'Move Row Up', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx-1]);
                remove(e);
            };
            elem_parent_text(menu, 'section', 'Move Row Down', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx+1]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_DEL_ROW){
            elem_parent_text(menu, 'section', 'Delete Row', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE_ROW, result.id, row_idx]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        elem_parent_text(menu, 'section', 'Cancel', null, 'menuitem').onclick = remove;
        document.body.appendChild(menu);
    }
    function celldropdown(e:MouseEvent){
        do_removes();
        e.stopPropagation();
        e.preventDefault();
        const menu = elem('section', null, 'menu');
        menu.style.left = e.clientX + 'px';
        menu.style.top = e.clientY + 'px';
        menu.style.zIndex = ''+(w.style.zIndex + 1);
        const cell = e.target as HTMLDivElement;
        let [row_idx, col_idx] = idx_of(cell);
        if(row_idx == -1) [row_idx, col_idx] = idx_of(cell.parentElement as HTMLDivElement);
        if(row_idx == -1) return;
        function remove(e?:MouseEvent){
            menu.remove();
            if(e){
                e.stopPropagation();
                e.preventDefault();
            }
            const idx = removes.indexOf(remove);
            if(idx != -1) removes.splice(idx, 1);
        }
        removes.push(remove);
        if(result.flags & SpreadSheetFlags.CAN_ADD_ROW){
            elem_parent_text(menu, 'section', 'Insert Row Above', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, row_idx]);
                remove(e);
            };
            elem_parent_text(menu, 'section', 'Insert Row Below', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, row_idx+1]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_DEL_ROW){
            elem_parent_text(menu, 'section', 'Delete Row', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE_ROW, result.id, row_idx]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_MOVE_ROWS){
            elem_parent_text(menu, 'section', 'Move Row Up', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx-1]);
                remove(e);
            };
            elem_parent_text(menu, 'section', 'Move Row Down', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx+1]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_ADD_COL){
            elem_parent_text(menu, 'section', 'Insert Column Left', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, col_idx]);
                remove(e);
            };
            elem_parent_text(menu, 'section', 'Insert Column Right', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, col_idx+1]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_DEL_COL){
            elem_parent_text(menu, 'section', 'Delete Column', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE_COL, result.id, col_idx]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        if(result.flags & SpreadSheetFlags.CAN_MOVE_COLUMNS){
            elem_parent_text(menu, 'section', 'Move Column Left', null, 'menuitem').onclick = function(e:MouseEvent){ EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx-1]);
                remove(e);
            };
            elem_parent_text(menu, 'section', 'Move Column Right', null, 'menuitem').onclick = function(e:MouseEvent){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx+1]);
                remove(e);
            };
            elem_with_parent(menu, 'section', null, 'menuseparator');
        }
        elem_parent_text(menu, 'section', 'Cancel', null, 'menuitem').onclick = remove;
        document.body.appendChild(menu);
    }
    result.header_number_el = elem_with_parent(w, 'div', null, 'tracker-numbered');
    if(!(result.flags & SpreadSheetFlags.NUMBERED))
        result.header_number_el.style.display = 'none';
    result.header_number_el.onclick = do_removes;
    function idx_of(cell:HTMLDivElement):[number, number]{
        for(let row_idx = 0; row_idx < result.cells.length; row_idx++){
            const row = result.cells[row_idx];
            for(let col_idx = 0; col_idx < row.length; col_idx++){
                if(row[col_idx] === cell) return [row_idx, col_idx];
            }
        }
        return [-1, -1];
    }
    function on_cell_keydown(e:KeyboardEvent){
        if(e.altKey) return;
        const cell = e.target as HTMLDivElement;
        let [row_idx, col_idx] = idx_of(cell);
        switch(e.key){
            case 'ArrowLeft': {
                if(col_idx == -1) return;
                col_idx--;
                if(col_idx < 0) return;
                result.cells[row_idx][col_idx].focus();
            } return;
            case 'ArrowRight': {
                if(col_idx == -1) return;
                col_idx++;
                if(col_idx >= result.cells[row_idx].length) return;
                result.cells[row_idx][col_idx].focus();
            } return;
            case 'ArrowUp': {
                if(row_idx == -1) return;
                row_idx--;
                if(row_idx < 0)
                    result.headers[col_idx].focus();
                else
                    result.cells[row_idx][col_idx].focus();
            } return;
            case 'ArrowDown': {
                if(row_idx == -1) return;
                row_idx++;
                if(row_idx >= result.cells.length) return;
                result.cells[row_idx][col_idx].focus();
            } return;
            case 'Escape':
                e.stopPropagation();
                e.preventDefault();
                return;
            case 'Delete':
                e.stopPropagation();
                e.preventDefault();
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.EDIT_CELL, result.id, row_idx, col_idx, '']);
                return;
            case 'Shift':
                return;
            default:
                if(e.metaKey || e.altKey) return;
                edit_cell(cell);
                break;
        }
    }
    function edit_cell(cell:HTMLDivElement){
        const w = '' + (cell.getBoundingClientRect().width-2) + 'px';
        const h = '' + (cell.getBoundingClientRect().height-2) + 'px';
        let oldtxt = cell.textContent;
        if(!oldtxt) oldtxt = '';
        cell.classList.add('editing');
        cell.textContent = '';
        const inp = elem_with_parent(cell, 'input');
        inp.style.width = w;
        inp.style.height = h;
        inp.value = oldtxt;
        inp.onkeydown = function(e){
            let [row_idx, col_idx] = idx_of(cell);
            e.stopPropagation();
            switch(e.key){
                case 'Escape':{
                    e.preventDefault();
                    inp.blur();
                    cell.focus();
                }return;
                case 'Enter': {
                    e.preventDefault();
                    if(e.shiftKey){
                        if(col_idx == result.headers.length-1){
                            if(result.flags & SpreadSheetFlags.CAN_ADD_COL)
                                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, result.headers.length]);
                            return;
                        }
                        col_idx++;
                    }
                    else {
                        if(row_idx == result.cells.length-1){
                            if(result.flags & SpreadSheetFlags.CAN_ADD_ROW)
                                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, result.cells.length]);
                            return;
                        }
                        row_idx++;
                    }
                    inp.blur();
                    result.cells[row_idx][col_idx].focus();
                } return;
            }
        };
        inp.onblur = function(){
            const v = inp.value.trim();
            cell.textContent = v;
            if(oldtxt != v){
                const [row_idx, col_idx] = idx_of(cell);
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.EDIT_CELL, result.id, row_idx, col_idx, v]);
            }
            cell.classList.remove('editing');
            // if(!cell.textContent) cell.textContent = '\u00a0';
            inp.remove();
        };
        inp.focus();
    }
    function on_cell_click(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        do_removes();
        const cell = e.target as HTMLDivElement;
        edit_cell(cell);
    }
    function editable_cell(cell:HTMLDivElement){
        cell.tabIndex = -1;
        cell.ondblclick = on_cell_click;
        cell.onclick = function(e:MouseEvent){do_removes();(e.target as HTMLDivElement).focus();}
        cell.onkeydown = on_cell_keydown;
        cell.oncontextmenu = celldropdown;
    }
    function find_prev_elem(row_idx:number, col_idx: number):HTMLElement{
        if(col_idx == 0){
            return result.number_els[row_idx];
        }
        const row = result.cells[row_idx];
        return row[col_idx-1];
    }
    function add_cell(s:string, row_idx:number, col_idx:number){
        let cell = elem_with_text('div', s, null, 'tracker-cell');
        editable_cell(cell);
        if(row_idx < 0) row_idx += result.cells.length;
        if(col_idx < 0) col_idx += result.cells[row_idx].length+1;
        result.cells[row_idx].splice(col_idx, 0, cell);
        const prev = find_prev_elem(row_idx, col_idx);
        prev.insertAdjacentElement('afterend', cell);
    }
    result.make_top = setup_zsorted_window(w);
    result.add_row1 = function(whence:number){
        result.add_row2(whence, []);
    };
    result.add_row2 = function(whence:number, values:Array<string>){
        if(!(result.flags & SpreadSheetFlags.CAN_ADD_ROW)) return;
        if(whence < 0)
            whence += result.cells.length + 1;
        const num_el = elem('div', null, 'tracker-numbered');
        if(!(result.flags & SpreadSheetFlags.NUMBERED))
            num_el.style.display = 'none';
        num_el.oncontextmenu = rdropdown;
        num_el.onclick = do_removes;
        if(whence < result.number_els.length)
            result.number_els[whence].insertAdjacentElement('beforebegin', num_el);
        else
            result.w.appendChild(num_el);
        result.number_els.splice(whence, 0, num_el);
        result.cells.splice(whence, 0, []);
        for(let i = 0; i < result.column_names.length; i++){
            let s = i < values.length? values[i] : '';
            add_cell(s, whence, -1);
        }
        if(result.flags & SpreadSheetFlags.NUMBERED)
            for(let i = 0; i < result.number_els.length; i++)
                result.number_els[i].textContent = ''+(i+1);
        w.style.gridTemplateRows = gtr();
    };
    result.add_column1 = function(whence:number){
        result.add_column3(whence, '', []);
    };
    result.add_column2 = function(whence:number, name:string){
        result.add_column3(whence, name, []);
    };
    function edit_header(cell:HTMLDivElement){
        const w = '' + (cell.getBoundingClientRect().width-2) + 'px';
        const h = '' + (cell.getBoundingClientRect().height-2) + 'px';
        let oldtxt = cell.textContent;
        if(!oldtxt) oldtxt = '';
        cell.classList.add('editing');
        cell.textContent = '';
        const inp = elem_with_parent(cell, 'input');
        inp.style.width = w;
        inp.style.height = h;
        inp.value = oldtxt;
        inp.onkeydown = function(e){
            e.stopPropagation();
            switch(e.key){
                case 'Escape':{
                    e.preventDefault();
                    inp.blur();
                    cell.focus();
                }return;
                case 'Enter': {
                    e.preventDefault();
                    inp.blur();
                    cell.focus();
                } return;
            }
        };
        inp.onblur = function(){
            const v = inp.value.trim();
            if(v != cell.textContent){
                cell.textContent = v;
                const col_idx = result.headers.indexOf(cell);
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.RENAME_COL, result.id, col_idx, v]);
            }
            cell.classList.remove('editing');
            inp.remove();
        };
        inp.focus();
    }
    result.add_column3 = function(whence:number, name:string, values:Array<string>){
        if(!(result.flags & SpreadSheetFlags.CAN_ADD_COL)) return;
        if(whence == -1) whence += result.column_names.length + 1;
        result.column_names.splice(whence, 0, name);
        const h = elem_with_text('div', name, null, 'tracker-head');
        h.onclick = function(e){do_removes(); const cell = e.target as HTMLDivElement; cell.focus();};
        h.tabIndex = -1;
        h.ondblclick = function(e:MouseEvent){
            e.stopPropagation();
            e.preventDefault();
            const cell = e.target as HTMLDivElement;
            edit_header(cell);
        };
        h.oncontextmenu = hdropdown;
        h.onkeydown = function(e:KeyboardEvent){
            const cell = e.target as HTMLDivElement;
            const idx = result.headers.indexOf(cell);
            if(idx == -1) return;
            switch(e.key){
                case 'ArrowLeft':
                    if(idx > 0) result.headers[idx-1].focus();
                    break;
                case 'ArrowRight':
                    if(idx + 1 < result.headers.length) result.headers[idx+1].focus();
                    break;
                case 'ArrowDown':
                    result.cells[0][idx].focus();
                    break;
                case 'Escape':
                case 'Shift':
                case 'ArrowUp':
                    break
                default:
                    if(e.metaKey || e.altKey) return;
                    edit_header(cell);
                    return;
            }
            e.stopPropagation();
            e.preventDefault();
        };
        result.headers.splice(whence, 0, h);
        if(whence == 0)
            result.header_number_el.insertAdjacentElement('afterend', h);
        else
            result.headers[whence-1].insertAdjacentElement('afterend', h);
        for(let row_idx = 0; row_idx < result.cells.length; row_idx++){
            add_cell('', row_idx, whence);
        }
        w.style.gridTemplateColumns = gtc();
    };
    result.set_title = function(title:string){
        t.textContent = title;
        for(const o of by_id('current-spreadsheet').options){
            if(o.value == ''+result.id){
                o.textContent = title;
                break;
            }
        }
    };
    const comparator = Intl.Collator(undefined, {numeric:true});
    result.sort = function(col_idx:number, direction: number){
        const sorted = [];
        for(let i = 0; i < result.cells.length; i++){
            sorted.push(i);
        }
        function rowcmp (a:Array<HTMLDivElement>, b:Array<HTMLDivElement>){
            let as = a[col_idx].textContent;
            if(!as) as = '';
            as = as.trim();
            let bs = b[col_idx].textContent;
            if(!bs) bs = '';
            bs = bs.trim();
            if(!as.length) return !bs.length?0:1;
            if(!bs.length) return -1;
            return direction * comparator.compare(as, bs);
        }
        function cmp(a:number, b:number){
            return rowcmp(result.cells[a], result.cells[b]);
        }
        sorted.sort(cmp);
        let did_sort = false;
        for(let i = 0; i < sorted.length; i++){
            if(sorted[i] == i) continue;
            did_sort = true;
            break;
        }
        if(!did_sort) return;
        EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.SORT, result.id, sorted]);
    };
    result.apply_sort = function(sorted:Array<number>){
        const cells = [];
        for(let idx of sorted)
            cells.push(result.cells[idx]);
        result.cells = cells;
        for(let row of result.cells){
            for(let col of row){
                col.remove();
            }
        }
        for(let i = 0; i < result.cells.length; i++){
            const row = result.cells[i];
            const num_el = result.number_els[i];
            for(let j = row.length; j--;){
                const col = row[j];
                num_el.insertAdjacentElement('afterend', col);
            }
        }
    };
    result.del_column = function(whence:number){
        if(!(result.flags & SpreadSheetFlags.CAN_DEL_COL)) return;
        if(whence < 0) whence += result.headers.length;
        if(whence >= result.headers.length) return;
        result.headers[whence].remove();
        result.headers.splice(whence, 1);
        result.column_names.splice(whence, 1);
        for(let row of result.cells){
            row[whence].remove();
            row.splice(whence, 1);
        }
        w.style.gridTemplateColumns = gtc();
    }
    result.del_row = function(whence:number){
        if(!(result.flags & SpreadSheetFlags.CAN_DEL_ROW)) return;
        if(whence < 0) whence += result.cells.length;
        if(whence >= result.cells.length) return;
        for(let cell of result.cells[whence])
            cell.remove();
        result.cells.splice(whence, 1);
        result.number_els[whence].remove();
        result.number_els.splice(whence, 1);
        if(result.flags & SpreadSheetFlags.NUMBERED)
            for(let i = 0; i < result.number_els.length; i++){
                result.number_els[i].textContent = ''+(i+1);
            }
        w.style.gridTemplateRows = gtr();
    }
    result.move_row = function(from:number, to:number){
        if(!(result.flags & SpreadSheetFlags.CAN_MOVE_ROWS)) return;
        if(from < 0 || from >= result.cells.length) return;
        if(to < 0 || to >= result.cells.length) return;
        if(from == to) return;
        const frow = result.cells[from];
        const trow = result.cells[to];
        for(const cell of frow) cell.remove();
        for(const cell of trow) cell.remove();
        const fnum = result.number_els[from];
        const tnum = result.number_els[to];
        for(let i = frow.length; i--;) tnum.insertAdjacentElement('afterend', frow[i]);
        for(let i = trow.length; i--;) fnum.insertAdjacentElement('afterend', trow[i]);
        result.cells[from] = trow;
        result.cells[to] = frow;
    };
    result.move_column = function(from:number, to:number){
        if(!(result.flags & SpreadSheetFlags.CAN_MOVE_COLUMNS)) return;
        if(from == to) return;
        if(to < from){
            const tmp = to;
            to = from;
            from = tmp;
        }
        if(from < 0 || from >= result.headers.length) return;
        if(to < 0 || to >= result.headers.length) return;
        {
            const fh = result.headers[from];
            const th = result.headers[to];
            fh.remove();
            th.remove();
            result.headers[from] = th;
            result.headers[to] = fh;
            if(from == 0) result.header_number_el.insertAdjacentElement('afterend', th);
            else result.headers[from-1].insertAdjacentElement('afterend', th);
            result.headers[to-1].insertAdjacentElement('afterend', fh);
        }
        for(let i = 0; i < result.cells.length; i++){
            const row = result.cells[i];
            const fc = row[from];
            const tc = row[to];
            fc.remove();
            tc.remove();
            row[from] = tc;
            row[to] = fc;
            if(from == 0) result.number_els[i].insertAdjacentElement('afterend', tc);
            else row[from-1].insertAdjacentElement('afterend', tc);
            row[to-1].insertAdjacentElement('afterend', fc);
        }
    };
    result.rename_column = function(whence:number, name:string){
        if(whence < 0 || whence >= result.headers.length) return;
        result.headers[whence].textContent = name;
    };
    result.edit_cell = function(row_idx:number, col_idx:number, val:string){
        if(row_idx < 0 || row_idx >= result.cells.length) return;
        const row = result.cells[row_idx];
        if(col_idx < 0 || col_idx >= row.length) return;
        if(row[col_idx].textContent == val) return;
        row[col_idx].textContent = val;
    };
    result.set_flags = function(flags:SpreadSheetFlags){
        let was_numbered = !!(result.flags & SpreadSheetFlags.NUMBERED);
        let will_be_numbered = !!(flags & SpreadSheetFlags.NUMBERED);
        result.flags = flags;
        if(was_numbered && !will_be_numbered){
            result.header_number_el.style.display = 'none';
            for(const nel of result.number_els)
                nel.style.display = 'none';
            w.style.gridTemplateColumns = gtc();
        }
        else if(!was_numbered && will_be_numbered){
            result.header_number_el.style.display = 'block';
            for(let i = 0; i < result.number_els.length; i++){
                const nel = result.number_els[i];
                nel.style.display = 'block';
                nel.textContent = ''+(i+1);
            }
            w.style.gridTemplateColumns = gtc();
        }
    };
    setup_closable_window(w, x, function(){
        store_local(StorageCategory.WINDOW, openid, '');
    });
    w.style.gridTemplateRows = gtr();
    w.style.gridTemplateColumns = gtc();
    t.textContent = name;
    if(!get_local(StorageCategory.WINDOW, openid)) result.hide();
    else result.show();
    return result;
}
const SPREADSHEETS:Map<number, SpreadSheet> = new Map();

function spreadsheet_from_data(data:SpreadSheetData){
    // Use ALL to enable all behaviors and then set the real flags below. This
    // allows the imperative adding of the needed columns.
    let ss = make_spreadsheet(data.id, SpreadSheetFlags.ALL, data.name);
    for(const col of data.column_names)
        ss.add_column2(-1, col);
    for(let i = 0; i < data.cells.length; i+= data.column_names.length)
        ss.add_row2(-1, data.cells.slice(i, i+data.column_names.length));
    SPREADSHEETS.set(data.id, ss);
    const opt = elem_parent_text(by_id('current-spreadsheet'), 'option', data.name, null, null);
    opt.value = ''+data.id;
    by_id('current-spreadsheet').selectedIndex = -1;
    ss.set_flags(data.flags);
}
document.addEventListener('DOMContentLoaded', function(){
    by_id('current-spreadsheet').oninput = function(e:Event){
        const s = e.target as HTMLSelectElement;
        e.stopPropagation();
        e.preventDefault();
        const ss = SPREADSHEETS.get(+s.value);
        if(ss) ss.show();
        s.selectedIndex = -1;
        s.blur()
    };
    const b = by_id('new-tracker-button');
    b.onclick = function(){
        let diag = get_dialog('tracker');
        if(!diag) return;
        diag.ok_handler = function(){
            let name = diag.f.name.value;
            if(!name) return;
            let flags = SpreadSheetFlags.ALL;
            if(!diag.f.numbered.checked) flags &= ~SpreadSheetFlags.NUMBERED;
            EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.NEW_SHEET, {id:0, name, flags, column_names:[], cells:[]}]);
        };
        diag.show_handler = function(){
            diag.f.name.value = '';
            diag.f.numbered.checked = true;
            diag.f.name.focus();
        }
        diag.show();
    };
});

ONRECV(ToClient.SPREADSHEET, function(arg:SpreadSheetMsg){
    // console.log(arg);
    switch(arg[0]){
        case SpreadSheetMsgType.DELETE_ROW:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.del_row(arg[2]);
        }break;
        case SpreadSheetMsgType.DELETE_COL:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.del_column(arg[2]);
        }break;
        case SpreadSheetMsgType.RENAME_COL:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.rename_column(arg[2], arg[3]);
        }break;
        case SpreadSheetMsgType.EDIT_CELL:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.edit_cell(arg[2], arg[3], arg[4]);
        }break;
        case SpreadSheetMsgType.MOVE_COL:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.move_column(arg[2], arg[3]);
        }break;
        case SpreadSheetMsgType.MOVE_ROW:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.move_row(arg[2], arg[3]);
        }break;
        case SpreadSheetMsgType.ADD_ROW:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.add_row1(arg[2]);
        }break;
        case SpreadSheetMsgType.ADD_COL:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.add_column1(arg[2]);
        }break;
        case SpreadSheetMsgType.NEW_SHEET:
            spreadsheet_from_data(arg[1]);
            SPREADSHEETS.get(arg[1].id)!.show();
            break;
        case SpreadSheetMsgType.SORT:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.apply_sort(arg[2]);
        }break;
        case SpreadSheetMsgType.INITIALIZE:
            for(let ss of SPREADSHEETS.values()) ss.w.remove();
            SPREADSHEETS.clear();
            (by_id('current-spreadsheet') as any).replaceChildren();
            for(const d of arg[1]) spreadsheet_from_data(d);
            break;
        case SpreadSheetMsgType.SHOW:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.show();
        }break;
        case SpreadSheetMsgType.NAME:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.set_title(arg[2]);
        }break;
        case SpreadSheetMsgType.FLAG:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.set_flags(arg[2]);
        }break;
        case SpreadSheetMsgType.DELETE:{
            const id = arg[1];
            let ss = SPREADSHEETS.get(id);
            if(!ss) break;
            // Should there be a delete method on the spreadsheet instead of
            // doing it inline here?
            ss.w.remove();
            SPREADSHEETS.delete(id);
            for(const o of by_id('current-spreadsheet').options){
                if(o.value == ''+id){
                    o.remove();
                    break;
                }
            }
        }break;

    }
});

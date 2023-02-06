//
// Copyright © 2023, David Priver
//

let SHEET_TV: TreeView;
document.addEventListener('DOMContentLoaded', function():void{
    SHEET_TV = make_tree_view(by_id('sheets-list'), 'sheets');
    SHEET_TV.on_click = function(id:number):void{
        const ss = SPREADSHEETS.get(id);
        if(ss) ss.show();
    };
    SHEET_TV.on_ctxmenu = function(id:number, e:MouseEvent):void{
        const menu = ctx_menu(e);
        const ss = SPREADSHEETS.get(id);
        if(!ss) return;
        if(ss.hidden)
            menu.item('Show', ss.show);
        else
            menu.item('Hide', ss.hide);
        menu.item('Rename', function(e:MouseEvent):void{
            e.stopPropagation();
            e.preventDefault();
            const sp = SHEET_TV.get_sp(id);
            if(!sp) return;
            user_edit_element(sp, 0, function(txt:string):void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.NAME, id, txt]);
            });
            remove_ctx_menu();
        });
        menu.item('Add Child Sheet', function():void{
            do_new_sheet_dialog(id);
        });
        menu.separator();
        if(!SHEET_TV.has_children(id))
            menu.item('Delete', function():void{
                const diag = get_dialog('simple-delete');
                if(!diag) return;
                diag.f.delete.checked = false;
                diag.ok_handler = function():void{
                    if(diag.f.delete.checked){
                        EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE, id]);
                        SHEET_TV.remove(id);
                    }
                };
                diag.show();
            });
        else
            menu.disabled('Delete');
        menu.separator();
        menu.item('Cancel');
        menu.install();
    };
});

type SpreadSheet = {
    id: number;
    parent: number;
    w:HTMLDivElement;
    hidden: boolean;
    _dirty: boolean;
    name: string;
    show:() => void;
    hide:() => void;
    make_top:() => void;
    set_title:(_:string) => void;
    set_flags:(_:SpreadSheetFlags) => void;
    mark_dirty:() => void;

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
    set_display:(row_idx:number, col_idx:number, val:string) => void;

    sort:(col_idx:number, dir:number) => void;
    apply_sort:(sorted:Array<number>) => void;

    flags: SpreadSheetFlags;
    cell_elems: Array<Array<HTMLDivElement>>;
    cell_sources: Array<Array<string>>;
    cell_displays: Array<Array<string>>;
    column_names: Array<string>;
    headers: Array<HTMLDivElement>;
    number_els: Array<HTMLDivElement>;
    header_number_el: HTMLDivElement;
    sheet_deps: Array<number>;
    to_tsv:()=>string;
}

function sheet_cell_text(id:number, row:number, col:number):string{
    const sheet = SPREADSHEETS.get(id);
    // Underlying library assumes the SheetHandle is always valid and
    // you are supposed to return the empty string for out of bounds
    // accesses to simulate infinite sheet.
    if(!sheet) return "="; // This will turn into a syntax error.
    if(row < 0 || row >= sheet.cell_sources.length) return "";
    const r = sheet.cell_sources[row];
    if(col < 0 || col >= r.length) return "";
    return r[col];
}

function sheet_col_height(id:number, col:number):number{
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return 0;
    return sheet.cell_sources.length;
}
function sheet_row_width(id:number, row:number):number{
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return 0;
    if(!sheet.cell_sources.length) return 0;
    return sheet.cell_sources[0].length;
}
const NumFormatter = new Intl.NumberFormat('en', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
    trailingZeroDisplay: "stripIfInteger",
} as any);
function sheet_display_number(id:number, row:number, col:number, val:number):void{
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return;
    const sval = NumFormatter.format(val);
    // const sval = Number.isInteger(val)?""+val:val.toFixed(2);
    sheet.set_display(row, col, sval);
}
function sheet_display_string(id:number, row:number, col:number, sval:string):void{
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return;
    sheet.set_display(row, col, sval);
}
function sheet_display_error(id:number, row:number, col:number):void{
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return;
    sheet.set_display(row, col, "#ERROR");
}
function sheet_name_to_col_idx(id:number, s:string):number{
    if(s.length == 1) {
        const result = s.toLowerCase().charCodeAt(0) - 97;
        // console.log({s, result});
        return result;
    }
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return -1;
    const idx = sheet.column_names.indexOf(s);
    if(idx !== -1) {
        // console.log({s, idx});
        return idx;
    }
    for(let idx = 0; idx < sheet.column_names.length; idx++){
        if(sheet.column_names[idx].toLowerCase().trim() == s){
            // console.log({s, idx});
            return idx;
        }
    }
    // console.log({s, 'result':-1});
    return -1;
}

function sheet_next_cell(id:number, i:number, prev_row:number, prev_col:number):[number, number]{
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return [-1, -1];
    if(prev_row == -1 && prev_col == -1)
        return sheet.cell_sources.length && sheet.cell_sources[0].length? [0,0]:[-1,-1];
    prev_col++;
    while(prev_col >= sheet.cell_sources[prev_row].length){
        prev_row++;
        prev_col = 0;
        if(prev_row == sheet.cell_sources.length)
            return [-1, -1];
    }
    return [prev_row, prev_col];
}

function sheet_dims(id:number):[number,number]{
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return [0, 0];
    if(!sheet.cell_sources.length) return [0, 0];
    return [sheet.cell_sources.length, sheet.cell_sources[0].length];
}
function sheet_name_to_sheet(s:string):number {
    // TODO: maintain a back map
    for(const sheet of SPREADSHEETS.values()){
        if(sheet.name == s){
            // console.log({s, id:sheet.id});
            return sheet.id;
        }
        if(sheet.name.toLowerCase() == s.toLowerCase()){
            // console.log({s, id:sheet.id});
            return sheet.id;
        }
    }
    // console.log({s, id:0});
    return 0;
}

let sheet_evaluate_formulas: ((id:number)=>Array<number>);
let sheet_eval_string: ((id:number, s:string)=>number|string);
let sheet_wasm_load_in_flight = false;
function spread_eval_string(s:string):number|string|null{
    if(!sheet_eval_string){
        load_sheet_wasm();
        return null;
    }
    const result = sheet_eval_string(-1, s);
    if(result === "error")
        return null;
    return result;
}

function load_sheet_wasm():void{
    if(sheet_wasm_load_in_flight) return;
    sheet_wasm_load_in_flight = true;
    drspread(
        '/wasm/drspread.wasm',
        sheet_cell_text,
        sheet_col_height,
        sheet_row_width,
        sheet_display_number,
        sheet_display_string,
        sheet_display_error,
        sheet_name_to_col_idx,
        sheet_next_cell,
        sheet_dims,
        sheet_name_to_sheet,
    ).then(({evaluate_formulas, evaluate_string})=>{
        sheet_evaluate_formulas = evaluate_formulas;
        sheet_eval_string = evaluate_string;
        for(const sheet of SPREADSHEETS.values()){
            if(sheet.hidden) continue;
            if(!sheet._dirty) continue;
            recalc(sheet.id);
        }
    });
}

function recalc(id:number):void{
    if(!sheet_evaluate_formulas) {
        load_sheet_wasm();
        return;
    }
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return;
    if(sheet.hidden) return;
    if(!sheet._dirty) return;
    // const now = window.performance.now();
    // for(let i = 0; i < 100000; i++)
    sheet.sheet_deps = sheet_evaluate_formulas(id);
    // const after = window.performance.now();
    // console.log({id, 'name':sheet.name});
    // console.log({id, deps:sheet.sheet_deps.join(',')});
    // console.log({id, duration:after-now});
    sheet._dirty = false;
}

let spreadsheet_fake_clipboard = "";

function make_spreadsheet(id:number, parent:number, flags: SpreadSheetFlags, name:string):SpreadSheet {
    const winid = `spreadsheet-window-${id}`;
    const openid = `${winid}/open`
    // idk should assert here or something if winid already exists
    const w = elem_with_parent(document.body, 'div', winid, 'tracker-grid');
    const wh = elem_with_parent(w, 'div', null, 'window-handle');
    wh.oncontextmenu = function(e:MouseEvent):void{
        const menu = ctx_menu(e);
        menu.item('Rename',function(e:MouseEvent):void{
            e.stopPropagation();
            e.preventDefault();
            user_edit_element(t, 0, function(v:string):void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.NAME, result.id, v]);
            });
            remove_ctx_menu();
        });
        menu.item('Refresh', function():void{
            result._dirty = true;
            recalc(id);
        });
        menu.item('Show Other People', function():void{
            EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.SHOW, result.id]);
        });
        menu.separator();
        menu.item('Toggle Number', function():void{
            EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.FLAG, result.id, result.flags ^ SpreadSheetFlags.NUMBERED]);
        });
        {
            const txt = (result.flags & SpreadSheetFlags.LOCKED_FORMULAS)?'Unlock Formulas' : 'Lock Formulas';
            menu.item(txt, function(e:MouseEvent):void{
                if(result.flags & SpreadSheetFlags.LOCKED_FORMULAS){
                    if(txt[0] == 'L') return;
                }
                else {
                    if(txt[0] == 'U') return;
                }
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.FLAG, result.id, result.flags ^ SpreadSheetFlags.LOCKED_FORMULAS]);
            });

        }
        menu.item('Configure', function():void{
            const diag = get_dialog('sheet-config');
            if(!diag) return;
            diag.f.editcells.checked = !!(result.flags & SpreadSheetFlags.CAN_EDIT_CELLS);
            diag.f.addrows.checked = !!(result.flags & SpreadSheetFlags.CAN_ADD_ROW);
            diag.f.addcols.checked = !!(result.flags & SpreadSheetFlags.CAN_ADD_COL);
            diag.f.moverows.checked = !!(result.flags & SpreadSheetFlags.CAN_MOVE_ROWS);
            diag.f.movecols.checked = !!(result.flags & SpreadSheetFlags.CAN_MOVE_COLUMNS);
            diag.f.delrows.checked = !!(result.flags & SpreadSheetFlags.CAN_DEL_ROW);
            diag.f.delcols.checked = !!(result.flags & SpreadSheetFlags.CAN_DEL_COL);
            diag.f.sort.checked = !!(result.flags & SpreadSheetFlags.CAN_SORT_COLS);
            diag.ok_handler = function():void{
                // grab the other flags
                const enum Other {flags =
                    ~(SpreadSheetFlags.NONE
                    | SpreadSheetFlags.CAN_ADD_ROW
                    | SpreadSheetFlags.CAN_ADD_COL
                    | SpreadSheetFlags.CAN_MOVE_ROWS
                    | SpreadSheetFlags.CAN_MOVE_COLUMNS
                    | SpreadSheetFlags.CAN_DEL_ROW
                    | SpreadSheetFlags.CAN_DEL_COL
                    | SpreadSheetFlags.CAN_SORT_COLS
                    | SpreadSheetFlags.CAN_EDIT_CELLS
                     )
                }
                let flags = result.flags & Other.flags;
                if(diag.f.editcells.checked) flags |= SpreadSheetFlags.CAN_EDIT_CELLS;
                if(diag.f.addrows.checked)   flags |= SpreadSheetFlags.CAN_ADD_ROW;
                if(diag.f.addcols.checked)   flags |= SpreadSheetFlags.CAN_ADD_COL;
                if(diag.f.moverows.checked)  flags |= SpreadSheetFlags.CAN_MOVE_ROWS;
                if(diag.f.movecols.checked)  flags |= SpreadSheetFlags.CAN_MOVE_COLUMNS;
                if(diag.f.delrows.checked)   flags |= SpreadSheetFlags.CAN_DEL_ROW;
                if(diag.f.delcols.checked)   flags |= SpreadSheetFlags.CAN_DEL_COL;
                if(diag.f.sort.checked)      flags |= SpreadSheetFlags.CAN_SORT_COLS;
                if(flags != result.flags)
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.FLAG, result.id, flags]);
            };
            diag.show();
        });
        menu.separator();
        menu.item('Download', function():void{
            const s = result.to_tsv();
            const a = elem('a');
            a.download = result.name+'.tsv';
            a.href = URL.createObjectURL(new Blob([s], {type:'text/tab-separated-values'}));
            a.click();
        });
        menu.separator();
        if(!SHEET_TV.has_children(result.id))
        menu.item('Delete Spreadsheet', function():void{
            const diag = get_dialog('simple-delete');
            if(!diag) return;
            diag.f.delete.checked = false;
            diag.ok_handler = function():void{
                if(diag.f.delete.checked)
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE, result.id]);
            };
            diag.show();
        });
        else 
            menu.disabled('Delete Spreadsheet');
        menu.separator();
        menu.item('Cancel');
        menu.install();
    }
    const x = elem_parent_text(wh, 'span', '×', null, 'window-closer');
    const t = elem_parent_text(wh, 'span', '', null, 'window-title');

    setup_movable_window(w, wh, WINDOWFLAGS.REMEMBER_POSITION|WINDOWFLAGS.LOCAL_REMEMBER);
    const result = {
        id,
        parent,
        w:w,
        _dirty: false,
        hidden: true,
        name,
        show: function():void{
            result.hidden = false;
            recalc(id);
            result.make_top();
            store_local(StorageCategory.WINDOW, openid, '1');
            w.style.display = 'grid';
        },
        hide: function():void{
            w.style.display = 'none';
            result.hidden = true;
        },
        cell_elems: [],
        cell_sources: [],
        cell_displays: [],
        flags,
        column_names:[],
        headers:[],
        number_els: [],
        sheet_deps: [],
        to_tsv:function():string{
            const length = result.cell_sources.length;
            let s = result.column_names.join('\t') + '\n';
            for(let i = 0; i < length; i++){
                const row = result.cell_sources[i];
                s += row.join('\t')+'\n';
            }
            return s;
        },
    } as any as SpreadSheet;
    function recalc_me():void{
        if(result._dirty) return;
        result.mark_dirty();
        if(result.hidden) return;
        setTimeout(()=>{recalc(result.id);}, 10);
    }
    function gtr():string{
        const n = 2 + result.cell_elems.length;
        return `repeat(${n}, max-content)`;
    }
    function gtc():string{
        let n = result.headers.length;
        n += (result.flags & SpreadSheetFlags.NUMBERED)?1:0;
        return `repeat(${n}, max-content)`;
    }
    function hdropdown(e:MouseEvent):void{
        const menu = ctx_menu(e);
        const h = e.target as HTMLDivElement;
        const col_idx = result.headers.indexOf(h);
        if(col_idx == -1) return;
        if(result.flags & SpreadSheetFlags.CAN_SORT_COLS){
            menu.item('Sort Ascending', function():void{
                result.sort(col_idx, +1);
            });
            menu.item('Sort Descending', function():void{
                result.sort(col_idx, -1);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_ADD_COL){
            menu.item('Insert Column Left', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, col_idx]);
            });
            menu.item('Insert Column Right',function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, col_idx+1]);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_DEL_COL){
            menu.item('Delete Column', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE_COL, result.id, col_idx]);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_MOVE_COLUMNS){
            menu.item('Move Column Left', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx-1]);
            });
            menu.item('Move Column Right', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx+1]);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_ADD_ROW){
            menu.item('Insert Row Top', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, 0]);
            });
            menu.item('Insert Row Bottom', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, -1]);
            });
            menu.separator();
        }
        menu.item('Cancel');
        menu.install();
    }
    function rdropdown(e:MouseEvent):void{
        const row_idx = (+((e.target as HTMLDivElement).textContent as string))-1;
        if(row_idx == -1) return;
        const menu = ctx_menu(e);
        if(result.flags & SpreadSheetFlags.CAN_ADD_ROW){
            menu.item('Insert Row Above', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, row_idx]);
            });
            menu.item('Insert Row Below', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, row_idx+1]);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_MOVE_ROWS){
            menu.item('Move Row Up', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx-1]);
            });
            menu.item('Move Row Down', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx+1]);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_DEL_ROW){
            menu.item('Delete Row', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE_ROW, result.id, row_idx]);
            });
            menu.separator();
        }
        menu.item('Cancel');
        menu.install();
    }
    function celldropdown(e:MouseEvent):void{
        const cell = e.target as HTMLDivElement;
        let [row_idx, col_idx] = idx_of(cell);
        if(row_idx == -1) [row_idx, col_idx] = idx_of(cell.parentElement as HTMLDivElement);
        if(row_idx == -1) return;
        const menu = ctx_menu(e);
        if(result.flags & SpreadSheetFlags.CAN_ADD_ROW){
            menu.item('Insert Row Above', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, row_idx]);
            });
            menu.item('Insert Row Below', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, row_idx+1]);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_DEL_ROW){
            menu.item('Delete Row', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE_ROW, result.id, row_idx]);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_MOVE_ROWS){
            menu.item('Move Row Up', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx-1]);
            });
            menu.item('Move Row Down', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx+1]);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_ADD_COL){
            menu.item('Insert Column Left', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, col_idx]);
            });
            menu.item('Insert Column Right', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, col_idx+1]);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_DEL_COL){
            menu.item('Delete Column', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.DELETE_COL, result.id, col_idx]);
            });
            menu.separator();
        }
        if(result.flags & SpreadSheetFlags.CAN_MOVE_COLUMNS){
            menu.item('Move Column Left', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx-1]);
            });
            menu.item('Move Column Right', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx+1]);
            });
            menu.separator();
        }
        menu.item('Cancel');
        menu.install();
    }
    result.header_number_el = elem_with_parent(w, 'div', null, 'tracker-numbered');
    if(!(result.flags & SpreadSheetFlags.NUMBERED))
        result.header_number_el.style.display = 'none';
    function idx_of(cell:HTMLDivElement):[number, number]{
        for(let row_idx = 0; row_idx < result.cell_elems.length; row_idx++){
            const row = result.cell_elems[row_idx];
            for(let col_idx = 0; col_idx < row.length; col_idx++){
                if(row[col_idx] === cell) return [row_idx, col_idx];
            }
        }
        return [-1, -1];
    }
    function on_cell_keydown(e:KeyboardEvent):void{
        if(e.altKey) return;
        const cell = e.target as HTMLDivElement;
        let [row_idx, col_idx] = idx_of(cell);
        switch(e.key){
            case 'ArrowLeft': {
                if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                    e.stopPropagation();
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx-1]);
                    // result.move_column(col_idx, col_idx-1);
                    // cell.focus();
                    return;
                }
                if(col_idx == -1) return;
                col_idx--;
                if(col_idx < 0) return;
                result.cell_elems[row_idx][col_idx].focus();
            } return;
            case 'ArrowRight': {
                if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                    e.stopPropagation();
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx+1]);
                    // result.move_column(col_idx, col_idx+1);
                    // cell.focus();
                    return;
                }
                if(col_idx == -1) return;
                col_idx++;
                if(col_idx >= result.cell_elems[row_idx].length) return;
                result.cell_elems[row_idx][col_idx].focus();
            } return;
            case 'ArrowUp': {
                if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                    e.stopPropagation();
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx-1]);
                    // result.move_row(row_idx, row_idx-1);
                    // cell.focus();
                    return;
                }
                if(row_idx == -1) return;
                row_idx--;
                if(row_idx < 0)
                    result.headers[col_idx].focus();
                else
                    result.cell_elems[row_idx][col_idx].focus();
            } return;
            case 'ArrowDown': {
                if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                    e.stopPropagation();
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx+1]);
                    // result.move_row(row_idx, row_idx+1);
                    // cell.focus();
                    return;
                }
                if(row_idx == -1) return;
                row_idx++;
                if(row_idx >= result.cell_elems.length) return;
                result.cell_elems[row_idx][col_idx].focus();
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
            case 'Enter':
                e.stopPropagation();
                e.preventDefault();
                if(e.ctrlKey){
                    if(e.shiftKey)
                        EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, col_idx+1]);
                    else
                        EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, row_idx+1]);
                    return;
                }
                if(row_idx == -1) return;
                row_idx++;
                if(row_idx >= result.cell_elems.length) return;
                result.cell_elems[row_idx][col_idx].focus();
                break;
            default:
                if(IS_MAC){
                    if(e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey){
                        if(e.key == 'n'){
                            e.stopPropagation();
                            e.preventDefault();
                            if(row_idx == -1) return;
                            row_idx++;
                            if(row_idx >= result.cell_elems.length) return;
                            result.cell_elems[row_idx][col_idx].focus();
                            return;
                        }
                        if(e.key == 'p'){
                            e.stopPropagation();
                            e.preventDefault();
                            if(row_idx == -1) return;
                            row_idx--;
                            if(row_idx < 0)
                                result.headers[col_idx].focus();
                            else
                                result.cell_elems[row_idx][col_idx].focus();
                            return;
                        }
                        if(e.key == 'b'){
                            e.stopPropagation();
                            e.preventDefault();
                            if(col_idx == -1) return;
                            col_idx--;
                            if(col_idx < 0) return;
                            result.cell_elems[row_idx][col_idx].focus();
                            return;
                        }
                        if(e.key == 'f'){
                            e.stopPropagation();
                            e.preventDefault();
                            if(col_idx == -1) return;
                            col_idx++;
                            if(col_idx >= result.cell_elems[row_idx].length) return;
                            result.cell_elems[row_idx][col_idx].focus();
                            return;
                        }
                        if(e.key == 'h'){
                            edit_cell(cell, '');
                            break;
                        }
                    }
                }
                if(e.metaKey || e.altKey || e.ctrlKey) return;
                edit_cell(cell, e.key);
                break;
        }
    }
    function edit_cell(cell:HTMLDivElement, key:string):void{
        if(!(result.flags & SpreadSheetFlags.CAN_EDIT_CELLS))
            return;
        const [row_idx, col_idx] = idx_of(cell);
        if(row_idx == -1 || col_idx == -1) return;
        const bcr = cell.getBoundingClientRect();
        const w = '' + (bcr.width-2) + 'px';
        const h = '' + (bcr.height-2) + 'px';
        const oldtxt = result.cell_sources[row_idx][col_idx];
        if(oldtxt && oldtxt[0] == '=' && (result.flags & SpreadSheetFlags.LOCKED_FORMULAS))
            return;
        // let oldtxt = cell.textContent;
        // if(!oldtxt) oldtxt = '';
        cell.classList.add('editing');
        cell.textContent = '';
        const inp = elem_with_parent(cell, 'input');
        let abs = false;
        if((oldtxt && oldtxt[0] == '=') || key == '='){
            abs = true;
            if(oldtxt && oldtxt[0] == '=')
                inp.value = oldtxt;
            else
                inp.value = '';
        }
        else {
            inp.style.width = w;
            inp.value = '';
        }
        function make_absolute():void{
            if(inp.classList.contains('abs-edit'))
                return;
            inp.remove();
            inp.classList.add('abs-edit');
            document.body.appendChild(inp);
            inp.style.top = bcr.top + 'px';
            inp.style.left = bcr.left + 'px';
            inp.style.width = '';
            const r = inp.getBoundingClientRect();
            if(r.right >= window.innerWidth)
                inp.style.width = (window.innerWidth - bcr.left) + 'px';
            inp.focus();
        }
        if(abs) make_absolute();
        inp.style.height = h;
        inp.spellcheck = false;
        let canceled = false;
        inp.onkeydown = function(e):void{
            let [row_idx, col_idx] = idx_of(cell);
            e.stopPropagation();
            switch(e.key){
                case 'Escape':{
                    e.preventDefault();
                    canceled = true;
                    inp.blur();
                    cell.focus();
                }return;
                case 'Enter': {
                    e.preventDefault();
                    if(e.shiftKey){
                        if(col_idx != result.headers.length-1){
                            col_idx++;
                        }
                    }
                    else {
                        if(row_idx != result.cell_elems.length-1){
                            row_idx++;
                        }
                    }
                    inp.blur();
                    result.cell_elems[row_idx][col_idx].focus();
                } return;
                case '=':
                    if(!inp.value.length){
                        make_absolute();
                    }
                    break;
            }
        };
        inp.onblur = function():void{
            cell.textContent = result.cell_displays[row_idx][col_idx];
            cell.classList.remove('editing');
            inp.remove();
            if(canceled)
                return;
            const v = inp.value.trim();
            if(oldtxt != v){
                const [row_idx, col_idx] = idx_of(cell);
                cell.textContent = v;
                result.cell_displays[row_idx][col_idx] = v; // so that recalc will replace it.
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.EDIT_CELL, result.id, row_idx, col_idx, v]);
            }
        };
        inp.focus();
    }
    function on_cell_click(e:MouseEvent):void{
        e.stopPropagation();
        e.preventDefault();
        remove_ctx_menu();
        const cell = e.target as HTMLDivElement;
        edit_cell(cell, '');
    }
    function on_copy():void{
        const [row_idx, col_idx] = idx_of(document.activeElement as HTMLDivElement);
        if(row_idx == -1) return;
        const s = result.cell_sources[row_idx][col_idx];
        navigator.clipboard.writeText(s);
        if(!navigator.clipboard.readText)
            spreadsheet_fake_clipboard = s;
    }
    function on_paste():void{
        const [row_idx, col_idx] = idx_of(document.activeElement as HTMLDivElement);
        if(row_idx == -1) return;
        if(!navigator.clipboard.readText) {
            EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.EDIT_CELL, result.id, row_idx, col_idx, spreadsheet_fake_clipboard]);
            return;
        }
        navigator.clipboard.readText().then((s)=>{
            EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.EDIT_CELL, result.id, row_idx, col_idx, s]);
        });
    }
    function editable_cell(cell:HTMLDivElement):void{
        cell.tabIndex = -1;
        cell.ondblclick = on_cell_click;
        cell.onmousedown = function(e:MouseEvent):void{
            remove_ctx_menu();
            const a = document.activeElement;
            if(a){
                if(a.tagName == 'INPUT'){
                    const v = (a as HTMLInputElement).value;
                    if(v && v[0] == '=' && v[v.length-1] != ']' && a.parentElement! !== cell){
                        const [row_idx, col_idx] = idx_of(cell);
                        if(a.parentElement!.parentElement !== result.w){
                            (a as HTMLInputElement).value += `[${result.name}, ${result.column_names[col_idx]}, ${row_idx+1}]`;
                        }
                        else {
                            (a as HTMLInputElement).value += `[${result.column_names[col_idx]}, ${row_idx+1}]`;
                        }
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                }
            }
            (e.target as HTMLDivElement).focus();
        }
        cell.onkeydown = on_cell_keydown;
        cell.oncontextmenu = celldropdown;
        cell.oncopy = on_copy;
        cell.onpaste = on_paste;
    }
    function find_prev_elem(row_idx:number, col_idx: number):HTMLElement{
        if(col_idx == 0){
            return result.number_els[row_idx];
        }
        const row = result.cell_elems[row_idx];
        return row[col_idx-1];
    }
    function add_cell(s:string, row_idx:number, col_idx:number):void{
        let cell = elem_with_text('div', s, null, 'tracker-cell');
        editable_cell(cell);
        if(row_idx < 0) row_idx += result.cell_elems.length;
        if(col_idx < 0) col_idx += result.cell_elems[row_idx].length+1;
        result.cell_elems[row_idx].splice(col_idx, 0, cell);
        result.cell_sources[row_idx].splice(col_idx, 0, s);
        result.cell_displays[row_idx].splice(col_idx, 0, s);
        const prev = find_prev_elem(row_idx, col_idx);
        prev.insertAdjacentElement('afterend', cell);
    }
    result.make_top = setup_zsorted_window(w);
    result.add_row1 = function(whence:number):void{
        result.add_row2(whence, []);
    };
    result.add_row2 = function(whence:number, values:Array<string>):void{
        if(!(result.flags & SpreadSheetFlags.CAN_ADD_ROW)) return;
        if(whence < 0)
            whence += result.cell_elems.length + 1;
        const num_el = elem('div', null, 'tracker-numbered');
        if(!(result.flags & SpreadSheetFlags.NUMBERED))
            num_el.style.display = 'none';
        num_el.oncontextmenu = rdropdown;
        if(whence < result.number_els.length)
            result.number_els[whence].insertAdjacentElement('beforebegin', num_el);
        else
            result.w.appendChild(num_el);
        result.number_els.splice(whence, 0, num_el);
        result.cell_elems.splice(whence, 0, []);
        result.cell_sources.splice(whence, 0, []);
        result.cell_displays.splice(whence, 0, []);
        for(let i = 0; i < result.column_names.length; i++){
            let s = i < values.length? values[i] : '';
            add_cell(s, whence, -1);
        }
        if(result.flags & SpreadSheetFlags.NUMBERED)
            for(let i = 0; i < result.number_els.length; i++)
                result.number_els[i].textContent = ''+(i+1);
        w.style.gridTemplateRows = gtr();
        // NOTE: assume adding rows at the end can't trigger a recalc
        if(whence != result.cell_sources.length-1)
            recalc_me();
    };
    result.add_column1 = function(whence:number):void{
        result.add_column3(whence, '', []);
    };
    result.add_column2 = function(whence:number, name:string):void{
        result.add_column3(whence, name, []);
    };
    function edit_header(cell:HTMLDivElement):void{
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
        let canceled = false;
        inp.onkeydown = function(e):void{
            e.stopPropagation();
            switch(e.key){
                case 'Escape':{
                    e.preventDefault();
                    canceled = true;
                    inp.blur();
                    cell.focus();
                }return;
                case 'Enter': {
                    e.preventDefault();
                    inp.blur();
                    const col_idx = result.headers.indexOf(cell);
                    if(result.cell_elems.length && col_idx < result.cell_elems[0].length)
                        result.cell_elems[0][col_idx].focus();
                    else
                        cell.focus();
                } return;
            }
        };
        inp.onblur = function():void{
            cell.classList.remove('editing');
            inp.remove();
            if(canceled){
                cell.textContent = oldtxt;
                return;
            }
            const v = inp.value.trim();
            if(v != cell.textContent){
                cell.textContent = v;
                const col_idx = result.headers.indexOf(cell);
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.RENAME_COL, result.id, col_idx, v]);
            }
        };
        inp.focus();
    }
    result.add_column3 = function(whence:number, name:string, values:Array<string>):void{
        if(!(result.flags & SpreadSheetFlags.CAN_ADD_COL)) return;
        if(whence == -1) whence += result.column_names.length + 1;
        result.column_names.splice(whence, 0, name);
        const h = elem_with_text('div', name, null, 'tracker-head');
        // h.onclick = function(e):void{const cell = e.target as HTMLDivElement; cell.focus();};
        h.onmousedown = function(e:MouseEvent):void{
            remove_ctx_menu();
            const a = document.activeElement;
            if(a){
                if(a.tagName == 'INPUT'){
                    const v = (a as HTMLInputElement).value;
                    if(v && v[0] == '=' && v[v.length-1] != ']'){
                        const col_idx = result.headers.indexOf(h);
                        if(a.parentElement!.parentElement !== result.w){
                            (a as HTMLInputElement).value += `[${result.name}, ${result.column_names[col_idx]}]`;
                        }
                        else {
                            (a as HTMLInputElement).value += `[${result.column_names[col_idx]}]`;
                        }
                        e.stopPropagation();
                        e.preventDefault();
                        return;
                    }
                }
            }
            (e.target as HTMLDivElement).focus();
        };
        h.tabIndex = -1;
        h.ondblclick = function(e:MouseEvent):void{
            e.stopPropagation();
            e.preventDefault();
            const cell = e.target as HTMLDivElement;
            edit_header(cell);
        };
        h.oncontextmenu = hdropdown;
        h.onkeydown = function(e:KeyboardEvent):void{
            const cell = e.target as HTMLDivElement;
            const idx = result.headers.indexOf(cell);
            if(idx == -1) return;
            switch(e.key){
                case 'ArrowLeft':
                    if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                        EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, idx, idx-1]);
                        // result.move_column(idx, idx-1);
                        // cell.focus();
                        break;
                    }
                    if(idx > 0) result.headers[idx-1].focus();
                    break;
                case 'ArrowRight':
                    if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                        EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, idx, idx+1]);
                        // result.move_column(idx, idx+1);
                        // cell.focus();
                        break;
                    }
                    if(idx + 1 < result.headers.length) result.headers[idx+1].focus();
                    break;
                case 'Enter':
                case 'ArrowDown':
                    if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                        break;
                    }
                    result.cell_elems[0][idx].focus();
                    break;
                case 'Escape':
                case 'Shift':
                case 'ArrowUp':
                    break
                default:
                    if(IS_MAC){
                        if(e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey){
                            if(e.key == 'n'){
                                result.cell_elems[0][idx].focus();
                                break;
                            }
                            if(e.key == 'p'){
                                break;
                            }
                            if(e.key == 'b'){
                                if(idx > 0) result.headers[idx-1].focus();
                                break;
                            }
                            if(e.key == 'f'){
                                if(idx + 1 < result.headers.length) result.headers[idx+1].focus();
                                break;
                            }
                            if(e.key == 'h'){
                                edit_header(cell);
                                return;
                            }
                        }
                    }
                    if(e.metaKey || e.altKey || e.ctrlKey) return;
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
        for(let row_idx = 0; row_idx < result.cell_elems.length; row_idx++){
            add_cell('', row_idx, whence);
        }
        w.style.gridTemplateColumns = gtc();
        // NOTE: assume adding columns at the end can't trigger a recalc
        if(whence != result.column_names.length-1)
            recalc_me();
    };
    result.set_title = function(title:string):void{
        result.name = title;
        t.textContent = title;
        SHEET_TV.rename(id, title);
    };
    const comparator = Intl.Collator(undefined, {numeric:true});
    result.sort = function(col_idx:number, direction: number):void{
        const sorted = [];
        for(let i = 0; i < result.cell_elems.length; i++){
            sorted.push(i);
        }
        function rowcmp (a:Array<string>, b:Array<string>):number{
            const as = a[col_idx].trim();
            const bs = b[col_idx].trim();
            if(!as.length) return !bs.length?0:1;
            if(!bs.length) return -1;
            return direction * comparator.compare(as, bs);
        }
        function cmp(a:number, b:number):number{
            return rowcmp(result.cell_displays[a], result.cell_displays[b]);
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
    result.apply_sort = function(sorted:Array<number>):void{
        const cell_elems = [];
        const cell_displays = [];
        const cell_sources = [];
        for(let idx of sorted){
            cell_elems.push(result.cell_elems[idx]);
            cell_displays.push(result.cell_displays[idx]);
            cell_sources.push(result.cell_sources[idx]);
        }
        result.cell_elems = cell_elems;
        result.cell_sources = cell_sources;
        result.cell_displays = cell_displays;
        for(let row of result.cell_elems){
            for(let col of row){
                col.remove();
            }
        }
        for(let i = 0; i < result.cell_elems.length; i++){
            const row = result.cell_elems[i];
            const num_el = result.number_els[i];
            for(let j = row.length; j--;){
                const col = row[j];
                num_el.insertAdjacentElement('afterend', col);
            }
        }
        recalc_me();
    };
    result.del_column = function(whence:number):void{
        if(!(result.flags & SpreadSheetFlags.CAN_DEL_COL)) return;
        if(whence < 0) whence += result.headers.length;
        if(whence >= result.headers.length) return;
        result.headers[whence].remove();
        result.headers.splice(whence, 1);
        result.column_names.splice(whence, 1);
        for(let i = 0; i < result.cell_elems.length; i++){
            const row = result.cell_elems[i];
            row[whence].remove();
            row.splice(whence, 1);
            result.cell_displays[i].splice(whence, 1);
            result.cell_sources[i].splice(whence, 1);
        }
        w.style.gridTemplateColumns = gtc();
        recalc_me();
    }
    result.del_row = function(whence:number):void{
        if(!(result.flags & SpreadSheetFlags.CAN_DEL_ROW)) return;
        if(whence < 0) whence += result.cell_elems.length;
        if(whence >= result.cell_elems.length) return;
        for(let cell of result.cell_elems[whence])
            cell.remove();
        result.cell_elems.splice(whence, 1);
        result.cell_sources.splice(whence, 1);
        result.cell_displays.splice(whence, 1);
        result.number_els[whence].remove();
        result.number_els.splice(whence, 1);
        if(result.flags & SpreadSheetFlags.NUMBERED)
            for(let i = 0; i < result.number_els.length; i++){
                result.number_els[i].textContent = ''+(i+1);
            }
        w.style.gridTemplateRows = gtr();
        recalc_me();
    }
    result.move_row = function(from:number, to:number):void{
        if(!(result.flags & SpreadSheetFlags.CAN_MOVE_ROWS)) return;
        if(from < 0 || from >= result.cell_elems.length) return;
        if(to < 0 || to >= result.cell_elems.length) return;
        if(from == to) return;
        const frow = result.cell_elems[from];
        const trow = result.cell_elems[to];
        for(const cell of frow) cell.remove();
        for(const cell of trow) cell.remove();
        const fnum = result.number_els[from];
        const tnum = result.number_els[to];
        tnum.after(...frow);
        fnum.after(...trow);
        result.cell_elems[from] = trow;
        result.cell_elems[to] = frow;
        {
            const tmp = result.cell_displays[from];
            result.cell_displays[from] = result.cell_displays[to];
            result.cell_displays[to] = tmp;
        }
        {
            const tmp = result.cell_sources[from];
            result.cell_sources[from] = result.cell_sources[to];
            result.cell_sources[to] = tmp;
        }
        recalc_me();
    };
    result.move_column = function(from:number, to:number):void{
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
            const fs = result.column_names[from];
            const ts = result.column_names[to];
            fh.remove();
            th.remove();
            result.headers[from] = th;
            result.headers[to] = fh;
            result.column_names[from] = ts;
            result.column_names[to] = fs;
            if(from == 0) result.header_number_el.insertAdjacentElement('afterend', th);
            else result.headers[from-1].insertAdjacentElement('afterend', th);
            result.headers[to-1].insertAdjacentElement('afterend', fh);
        }
        for(let i = 0; i < result.cell_elems.length; i++){
            {
                const row = result.cell_elems[i];
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
            {
                const row = result.cell_sources[i];
                const fc = row[from];
                const tc = row[to];
                row[from] = tc;
                row[to] = fc;
            }
            {
                const row = result.cell_displays[i];
                const fc = row[from];
                const tc = row[to];
                row[from] = tc;
                row[to] = fc;
            }
        }
        recalc_me();
    };
    result.rename_column = function(whence:number, name:string):void{
        if(whence < 0 || whence >= result.headers.length) return;
        result.column_names[whence] = name;
        result.headers[whence].textContent = name;
        recalc_me();
    };
    result.edit_cell = function(row_idx:number, col_idx:number, val:string):void{
        if(row_idx < 0 || row_idx >= result.cell_elems.length) return;
        const row = result.cell_sources[row_idx];
        if(col_idx < 0 || col_idx >= row.length) return;
        if(row[col_idx] == val) return;
        // if(row[col_idx].textContent == val) return;
        // row[col_idx].textContent = val;
        row[col_idx] = val;
        recalc_me();
    };
    result.set_display = function(row_idx:number, col_idx:number, val:string):void {
        const r = result.cell_displays[row_idx];
        const old = r[col_idx];
        if(val == old) return;
        result.cell_elems[row_idx][col_idx].textContent = val;
        r[col_idx] = val;
    }
    result.set_flags = function(flags:SpreadSheetFlags):void{
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
    result.mark_dirty = function():void{
        if(result._dirty) return;
        result._dirty = true;
        // XXX this is dumb.
        for(const ss of SPREADSHEETS.values()){
            if(ss.sheet_deps.indexOf(result.id)!=-1){
                ss._dirty = true;
                setTimeout(()=>{recalc(ss.id);}, 10);
            }
        }
    };
    setup_closable_window(w, x, function():void{
        store_local(StorageCategory.WINDOW, openid, '');
        result.hidden = true;
    });
    w.style.gridTemplateRows = gtr();
    w.style.gridTemplateColumns = gtc();
    t.textContent = name;
    if(!get_local(StorageCategory.WINDOW, openid)) result.hide();
    else result.show();
    return result;
}
const SPREADSHEETS:Map<number, SpreadSheet> = new Map();

function spreadsheet_from_data(data:SpreadSheetData):SpreadSheet{
    // Use ALL to enable all behaviors and then set the real flags below. This
    // allows the imperative adding of the needed columns.
    const ss = make_spreadsheet(data.id, data.parent, SpreadSheetFlags.ALL, data.name);
    for(const col of data.column_names)
        ss.add_column2(-1, col);
    for(let i = 0; i < data.cells.length; i+= data.column_names.length)
        ss.add_row2(-1, data.cells.slice(i, i+data.column_names.length));
    SPREADSHEETS.set(data.id, ss);
    ss.set_flags(data.flags);
    const id = ss.id;
    SHEET_TV.add_item(data.name, id, data.parent?data.parent:null);
    return ss;
}

function do_new_sheet_dialog(parent:number):void{
    const diag = get_dialog('tracker');
    if(!diag) return;
    diag.f.file.value = '';
    diag.f.file.accept='.tsv';
    let tsv = '';
    diag.f.file.onchange = function():void{
        const filelist = diag.f.file.files;
        if(!filelist || filelist.length != 1)
            return;
        const file = filelist[0];
        if(!diag.f.name.value)
            diag.f.name.value = file.name.slice(0, file.name.length-4);
        file.text().then(s=>tsv=s);
    };
    diag.ok_handler = function():void{
        let name = diag.f.name.value;
        if(!name) return;
        let flags = SpreadSheetFlags.ALL;
        if(!diag.f.numbered.checked) flags &= ~SpreadSheetFlags.NUMBERED;
        if(tsv){
            const data = data_from_tsv(tsv);
            if(data){
                data.name = name;
                data.flags = flags;
                data.parent = parent;
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.NEW_SHEET, data]);
                return;
            }
        }
        EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.NEW_SHEET, {id:0, name, flags, column_names:[], cells:[], parent:parent}]);
    };
    diag.show_handler = function():void{
        diag.f.name.value = '';
        diag.f.numbered.checked = true;
        diag.f.name.focus();
        setTimeout(()=>diag.f.name.focus(), 0);
    }
    diag.show();
}

// TAG newtrackerbutton
document.addEventListener('DOMContentLoaded', function():void{
    const b = by_id('new-sheet-button');
    b.onclick = function():void{
        do_new_sheet_dialog(0);
        const diag = get_dialog('tracker');
        if(!diag) return;
        diag.f.file.value = '';
        diag.f.file.accept='.tsv';
        let tsv = '';
        diag.f.file.onchange = function():void{
            const filelist = diag.f.file.files;
            if(!filelist || filelist.length != 1)
                return;
            const file = filelist[0];
            if(!diag.f.name.value)
                diag.f.name.value = file.name.slice(0, file.name.length-4);
            file.text().then(s=>tsv=s);
        };
        diag.ok_handler = function():void{
            let name = diag.f.name.value;
            if(!name) return;
            let flags = SpreadSheetFlags.ALL;
            if(!diag.f.numbered.checked) flags &= ~SpreadSheetFlags.NUMBERED;
            if(tsv){
                const data = data_from_tsv(tsv);
                if(data){
                    data.name = name;
                    data.flags = flags;
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.NEW_SHEET, data]);
                    return;
                }
            }
            EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.NEW_SHEET, {id:0, name, flags, column_names:[], cells:[], parent:0}]);
        };
        diag.show_handler = function():void{
            diag.f.name.value = '';
            diag.f.numbered.checked = true;
            diag.f.name.focus();
        }
        diag.show();
    };
});

// TAG ToClientSPREADSHEET
ONRECV(ToClient.SPREADSHEET, function(arg:SpreadSheetMsg):void{
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
            const ae = document.activeElement;
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.move_column(arg[2], arg[3]);
            // @ts-ignore
            if(ae && ae.focus) ae.focus();
        }break;
        case SpreadSheetMsgType.MOVE_ROW:{
            const ae = document.activeElement;
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.move_row(arg[2], arg[3]);
            // @ts-ignore
            if(ae && ae.focus) ae.focus();
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
            const ss = spreadsheet_from_data(arg[1]);
            ss.mark_dirty();
            ss.show();
            break;
        case SpreadSheetMsgType.SORT:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.apply_sort(arg[2]);
        }break;
        case SpreadSheetMsgType.INITIALIZE:
            for(const ss of SPREADSHEETS.values()) ss.w.remove();
            SPREADSHEETS.clear();
            SHEET_TV.clear();
            for(const d of arg[1]) spreadsheet_from_data(d);
            for(const ss of SPREADSHEETS.values()){
                ss._dirty = true;
                if(ss.hidden) continue;
                recalc(ss.id);
            }
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
            SHEET_TV.remove(id);
        }break;
    }
});

function data_from_tsv(s:string):SpreadSheetData|null{
    if(s && s[s.length-1] == '\n') s = s.slice(0, s.length-1);
    const lines = s.split(/\n/);
    if(!lines.length) return null;
    const headers = lines[0].split(/\t/);
    for(let i = 0; i < headers.length; i++){
        headers[i] = headers[i].trim();
    }
    const rows = [];
    let n = headers.length;

    for(const line of lines.slice(1)){
        const parts = line.split(/\t/);
        for(let i = 0; i < parts.length; i++){
            parts[i] = parts[i].trim();
        }
        if(parts.length < n){
            for(let i = parts.length; i < n; i++)
                parts.push('');
        }
        if(parts.length > n){
            n = parts.length;
            for(let i = headers.length; i < n; i++)
                headers.push('');
            for(let i = 0; i < rows.length; i++){
                const row = rows[i];
                for(let j = row.length; j < n; j++)
                    row.push('');
            }
        }
        rows.push(parts);
    }
    const cells = [];
    for(const row of rows){
        for(const c of row)
            cells.push(c);
    }
    const result: SpreadSheetData = {
        id: -1,
        name: 'Untitled',
        flags: SpreadSheetFlags.ALL,
        column_names: headers,
        cells: cells,
        parent: 0,
    };
    return result;
}

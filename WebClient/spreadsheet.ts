//
// Copyright © 2023, David Priver
//

let SHEET_TV: TreeView;
let SHEET_CTX: DrSpreadCtx;
let DRSP_EXPORTS: DrSpreadExports;
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
    SHEET_TV.on_drop = function(dropped:number, onto:number|null):void{
        if(onto === null) onto = 0;
        EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.PARENT, dropped, onto]);
    };
});

type SpreadSheet = {
    xxx_timing: HTMLSpanElement;
    // selection stuff;
    r0: number;
    c0: number;
    r1: number;
    c1: number;
    _old_r0: number;
    _old_c0: number;
    _old_r1: number;
    _old_c1: number;
    // func io stuff
    func_nargs: number;
    func_outx: number;
    func_outy: number;
    _func_els: Array<HTMLElement>;
    id: number;
    parent: number;
    w:HTMLDivElement;
    hidden: boolean;
    _dirty: boolean;
    _wasmed: boolean;
    _down: boolean;
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
    set_func_io: (nargs:number, outx:number, outy:number) => void;

    edit_cell:(row_idx:number, col_idx:number, val:string) => void;
    edit_cells:(row_idx:Array<number>, col_idx:Array<number>, val:Array<string>) => void;

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
    to_tsv:()=>string;
}

function setup_sheet_for_wasm(sheet:SpreadSheet):void{
    if(!SHEET_CTX) return;
    if(sheet._wasmed) return;
    sheet._wasmed = true;
    SHEET_CTX.make_sheet(sheet.id, sheet.name);
    if(sheet.flags & SpreadSheetFlags.IS_FUNCTION){
        SHEET_CTX.set_flag(sheet.id, DrspSheetFlags.IS_FUNCTION, 1);
        const rows = [];
        const cols = [];
        for(let col = 0; col < sheet.func_nargs; col++){
            rows.push(0);
            cols.push(col);
        }
        SHEET_CTX.set_func_params(sheet.id, rows, cols);
        SHEET_CTX.set_func_output(sheet.id, sheet.func_outy, sheet.func_outx);
    }
    else {
        SHEET_CTX.set_sheet_alias(sheet.id, fully_qualified_sheet_name(sheet));
    }
    for(let r = 0; r < sheet.cell_sources.length; r++){
        const row = sheet.cell_sources[r];
        for(let c = 0; c < row.length; c++){
            const s = row[c];
            if(!s.length) continue;
            SHEET_CTX.set_str(sheet.id, r, c, s);
            if(s[0] == '=') sheet.set_display(r, c, '');
        }
    }
    for(let c = 0; c < sheet.column_names.length; c++){
        SHEET_CTX.set_col_name(sheet.id, c, sheet.column_names[c]);
    }
}

function sheet_dewasm(sheet:SpreadSheet):void{
    if(!sheet._wasmed) return;
    sheet._wasmed = false;
    if(!SHEET_CTX) return;
    const e = SHEET_CTX.del_sheet(sheet.id);
    void e;
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
    // console.log({row, col, sval});
    sheet.set_display(row, col, sval);
}
function sheet_display_error(id:number, row:number, col:number):void{
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return;
    sheet.set_display(row, col, "#ERROR");
}

function fully_qualified_sheet_name(s:SpreadSheet):string{
    const parts = [s.name];
    // bounded loop to avoid DOS if somehow a sheet is its own parent.
    for(let i = 0; i < 50; i++){
        if(!s.parent) break;
        s = SPREADSHEETS.get(s.parent)!;
        if(!s) break;
        parts.push(s.name);
    }
    return parts.reverse().join('/');
}

let sheet_wasm_load_in_flight = false;
function spread_eval_string(s:string):number|string|null{
    if(!SHEET_CTX){
        load_sheet_wasm();
        return null;
    }
    const result = SHEET_CTX.evaluate_string(0, s);
    if(result === "error")
        return null;
    return result;
}

function load_sheet_wasm():void{
    if(sheet_wasm_load_in_flight) return;
    sheet_wasm_load_in_flight = true;
    drspread(
        '/wasm/drspread.wasm?v=6',
        sheet_display_number,
        sheet_display_string,
        sheet_display_error,
    ).then(({make_ctx, exports})=>{
        SHEET_CTX = make_ctx();
        DRSP_EXPORTS = exports;
        for(const sheet of SPREADSHEETS.values()){
            setup_sheet_for_wasm(sheet);
        }
        for(const sheet of SPREADSHEETS.values()){
            if(sheet.hidden) continue;
            if(!sheet._dirty) continue;
            recalc(sheet.id);
        }
    })
    .catch((reason)=>{
        console.log(reason);
        sheet_wasm_load_in_flight = false;
    });
}

function recalc(id:number):void{
    if(!SHEET_CTX){
        load_sheet_wasm();
        return;
    }
    const sheet = SPREADSHEETS.get(id);
    if(!sheet) return;
    // We can have cross-sheet deps, so make sure they
    // have all pushed their stuff into wasm.
    for(const sheet of SPREADSHEETS.values())
        setup_sheet_for_wasm(sheet);
    setup_sheet_for_wasm(sheet);
    if(sheet.hidden) return;
    if(!sheet._dirty) return;
    const now = window.performance.now();
    const enum N { N = 1};
    // const enum N { N = 10000};
    for(let i = 0; i < N.N; i++)
        SHEET_CTX.evaluate_formulas();
    const after = window.performance.now();
    // @ts-ignore
    let b: number = DRSP_EXPORTS.bytes_used();
    if(SETTINGS.DEV)
        sheet.xxx_timing.textContent = `${(after-now).toFixed(2)}ms ${Intl.NumberFormat('en-us', {style:'unit', unit:'kilobyte'}).format(b/1024)}`;
    else
        sheet.xxx_timing.textContent = '';
    // console.log({id, 'name':sheet.name});
    // console.log({id, duration:after-now});
    sheet._dirty = false;
}

let spreadsheet_fake_clipboard = "";

function make_spreadsheet(id:number, parent:number, flags: SpreadSheetFlags, name:string):SpreadSheet {
    const winid = `spreadsheet-window-${id}`;
    const openid = `${winid}/open`
    // idk should assert here or something if winid already exists
    const w = elem_with_parent(document.body, 'div', winid, 'tracker-grid');
    if(IS_WINDOWS){
        // Windows scrollbars are atrocious
        w.classList.add('noscrollbar');
    }
    const wh = elem_with_parent(w, 'div', null, 'window-handle');
    const xxx_timing = elem_with_parent(wh, 'span');
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
        if(result.flags & SpreadSheetFlags.IS_FUNCTION){
            if(result.func_nargs != 4){
                menu.item('Add Input', function():void{
                    if(result.func_nargs >= 4) return;
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.FUNCTION_IO, result.id, result.func_nargs+1, result.func_outx, result.func_outy]);
                });
            }
            if(result.func_nargs > 0){
                menu.item('Remove Input', function():void{
                    if(result.func_nargs <= 0) return;
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.FUNCTION_IO, result.id, result.func_nargs-1, result.func_outx, result.func_outy]);
                });
            }
            menu.separator();
        }
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
        menu.item('Configure…', function():void{
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
        xxx_timing,
        func_nargs: 0,
        func_outx: -1, func_outy: -1,
        _func_els: [],
        id,
        parent,
        w:w,
        _dirty: false,
        _wasmed: false,
        _down: false,
        r0: -1, r1: -1, c0: -1, c1: -1,
        _old_r0: -1, _old_r1: -1, _old_c0: -1, _old_c1: -1,
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
        setTimeout(()=>{recalc(result.id);}, 0);
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
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, result.cell_sources.length]);
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
    function do_func_io():void{
        for(const el of result._func_els){
            el.classList.remove('parameter');
            el.classList.remove('output');
        }
        result._func_els.length = 0;
        if(result.flags & SpreadSheetFlags.IS_FUNCTION){
            if(result.cell_elems.length){
                const row1 = result.cell_elems[0];
                for(let col = 0; col < result.func_nargs && col < row1.length; col++){
                    row1[col].classList.add('parameter');
                    result._func_els.push(row1[col]);
                }
            }
        }
        if(result.flags & SpreadSheetFlags.IS_FUNCTION){
            if(result.func_outy != -1 && result.func_outy < result.cell_elems.length){
                const row = result.cell_elems[result.func_outy];
                if(result.func_outx != -1 && result.func_outx < row.length){
                    const cell = row[result.func_outx];
                    cell.classList.add('output');
                    result._func_els.push(cell);
                }
            }
        }
    }
    function celldropdown(e:MouseEvent):void{
        const cell = e.target as HTMLDivElement;
        let [row_idx, col_idx] = idx_of(cell);
        if(row_idx == -1) [row_idx, col_idx] = idx_of(cell.parentElement as HTMLDivElement);
        if(row_idx == -1) return;
        const menu = ctx_menu(e);
        if(result._wasmed && (result.flags & SpreadSheetFlags.IS_FUNCTION)){
            menu.item('Make Output', function():void{
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.FUNCTION_IO, result.id, result.func_nargs, col_idx, row_idx]);
            });
            menu.separator();
        }
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
        function do_left():void{
            if(e.shiftKey){
                if(result.c1 == -1){
                    result.r1 = result.r0;
                    result.c1 = result.c0;
                }
                if(result.c1 > 0) result.c1--;
                update_range();
                return;
            }
            if(col_idx == -1) return;
            col_idx--;
            if(col_idx < 0) return;
            result.cell_elems[row_idx][col_idx].focus();
        }
        function do_right():void{
            if(e.shiftKey){
                if(result.c1 == -1){
                    result.r1 = result.r0;
                    result.c1 = result.c0;
                }
                if(result.c1 +1 < result.cell_elems[row_idx].length) result.c1++;
                update_range();
                return;
            }
            if(col_idx == -1) return;
            col_idx++;
            if(col_idx >= result.cell_elems[row_idx].length) return;
            result.cell_elems[row_idx][col_idx].focus();
        }
        function do_up():void{
            if(e.shiftKey){
                if(result.r1 == -1){
                    result.r1 = result.r0;
                    result.c1 = result.c0;
                }
                if(result.r1 != 0) result.r1--;
                update_range();
                return;
            }
            if(row_idx == -1) return;
            row_idx--;
            if(row_idx < 0)
                result.headers[col_idx].focus();
            else{
                result.cell_elems[row_idx][col_idx].focus();
            }
        }
        function do_down():void{
            if(e.shiftKey){
                if(result.r1 == -1){
                    result.r1 = result.r0;
                    result.c1 = result.c0;
                }
                if(result.r1 +1 < result.cell_elems.length) result.r1++;
                update_range();
                return;
            }
            if(row_idx == -1) return;
            row_idx++;
            if(row_idx >= result.cell_elems.length) return;
            result.cell_elems[row_idx][col_idx].focus();
        }
        switch(e.key){
            case 'ArrowLeft': {
                if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                    e.stopPropagation();
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx-1]);
                    return;
                }
                do_left();
            } return;
            case 'ArrowRight': {
                if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                    e.stopPropagation();
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_COL, result.id, col_idx, col_idx+1]);
                    return;
                }
                do_right();
            } return;
            case 'ArrowUp': {
                if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                    e.stopPropagation();
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx-1]);
                    return;
                }
                do_up();
            } return;
            case 'ArrowDown': {
                if(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey){
                    e.stopPropagation();
                    EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.MOVE_ROW, result.id, row_idx, row_idx+1]);
                    return;
                }
                do_down();
            } return;
            case 'Escape':
                result.r1 = -1;
                result.c1 = -1;
                update_range();
                e.stopPropagation();
                e.preventDefault();
                return;
            case 'Delete':
                e.stopPropagation();
                e.preventDefault();
                do_delete();
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
                do_down();
                // if(row_idx == -1) return;
                // row_idx++;
                // if(row_idx >= result.cell_elems.length) return;
                // result.cell_elems[row_idx][col_idx].focus();
                break;
            default:
                if(IS_MAC){
                    if(e.ctrlKey && !e.altKey && !e.metaKey){
                        if(e.key == 'n' || e.key == 'N'){
                            e.stopPropagation();
                            e.preventDefault();
                            do_down();
                            return;
                        }
                        if(e.key == 'p' || e.key == 'P'){
                            e.stopPropagation();
                            e.preventDefault();
                            do_up();
                            return;
                        }
                        if(e.key == 'b' || e.key == 'B'){
                            e.stopPropagation();
                            e.preventDefault();
                            do_left();
                            return;
                        }
                        if(e.key == 'f' || e.key == 'F'){
                            e.stopPropagation();
                            e.preventDefault();
                            do_right();
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
    function edit_cell(cell:HTMLDivElement, key:string, from_click?:boolean):void{
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
        inp.dataset.sheetId = ''+result.id;
        inp.type = 'text';
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        inp.autocapitalize = 'off';
        let abs = false;
        if((oldtxt && oldtxt[0] == '=') || key == '='){
            abs = true;
            if(oldtxt && oldtxt[0] == '=')
                inp.value = oldtxt;
            else
                inp.value = '';
        }
        else if(from_click){
            inp.style.width = w;
            inp.value = oldtxt;
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
                // cell.textContent = v;
                // result.cell_displays[row_idx][col_idx] = v;
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
        edit_cell(cell, '', true);
    }
    function do_copy():void{
        let s = "";
        let r0 = result.r0;
        let r1 = result.r1;
        let c0 = result.c0;
        let c1 = result.c1;
        if(r1 < r0){
            const t = r1;
            r1 = r0;
            r0 = t;
        }
        if(c1 < c0){
            const t = c1;
            c1 = c0;
            c0 = t;
        }
        for(let r = r0; r <= r1; r++){
            for(let c = c0; c <= c1; c++){
                s += result.cell_sources[r][c];
                if(c != c1)
                    s += '\t';
            }
            if(r != r1)
                s += '\n';
        }
        navigator.clipboard.writeText(s);
        if(!navigator.clipboard.readText)
            spreadsheet_fake_clipboard = s;
    }
    function do_delete():void{
        const rows = [];
        const cols = [];
        const vals = [];
        let r0 = result.r0;
        let r1 = result.r1;
        let c0 = result.c0;
        let c1 = result.c1;
        if(r1 < r0){
            const t = r1;
            r1 = r0;
            r0 = t;
        }
        if(c1 < c0){
            const t = c1;
            c1 = c0;
            c0 = t;
        }
        for(let r = r0; r <= r1; r++){
            for(let c = c0; c <= c1; c++){
                cols.push(c);
                rows.push(r);
                vals.push('');
            }
        }
        EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.EDIT_CELLS, result.id, rows, cols, vals]);
    }
    function on_copy():void{
        do_copy();
    }
    function on_cut():void{
        do_copy();
        do_delete();
    }
    function paste_stuff(row_idx:number, col_idx:number, s:string):[Array<number>, Array<number>, Array<string>]{
        if(s.length && s[s.length-1] == '\n')
            s = s.slice(0, s.length-1);
        const lines = s.split(/\n/);
        const r = [];
        const c = [];
        const v = [];
        for(let i = 0; i < lines.length; i++){
            const line = lines[i];
            const cells = line.split(/\t/);
            for(let j = 0; j < cells.length; j++){
                const cell = cells[j];
                r.push(row_idx+i);
                c.push(col_idx+j);
                v.push(cell);
            }
        }
        return [r, c, v];
    }
    function check_bounds(r:Array<number>, c:Array<number>):void{
        for(let i = 0; i < r.length;){
            const ri = r[i];
            i++;
            while(i < r.length && r[i] == ri){
                i++;
            }
            if(ri >= result.cell_sources.length){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_ROW, result.id, result.cell_sources.length]);
            }
        }
        const ct = Array.from(c).sort();
        for(let i = 0; i < ct.length;){
            const ci = ct[i];
            i++;
            while(i < ct.length && ct[i] == ci){
                i++;
            }
            if(ci >= result.column_names.length){
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.ADD_COL, result.id, result.column_names.length]);
            }
        }
    }
    function on_paste():void{
        const [row_idx, col_idx] = idx_of(document.activeElement as HTMLDivElement);
        if(row_idx == -1) return;
        if(!navigator.clipboard.readText) {
            const [r, c, v] = paste_stuff(row_idx, col_idx, spreadsheet_fake_clipboard);
            check_bounds(r, c);
            EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.EDIT_CELLS, result.id, r, c, v]);
            return;
        }
        navigator.clipboard.readText().then((s)=>{
            const [r, c, v] = paste_stuff(row_idx, col_idx, s);
            check_bounds(r, c);
            EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.EDIT_CELLS, result.id, r, c, v]);
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
                    const sid = ((a as HTMLInputElement).dataset.sheetId! as any)|0;
                    if(v){
                        const last = v[v.length-1];
                        const want_insert = v[0] == '=' && (last == '(' || last == '=' || last == ',' || last == '+' || last == '*' || last == '-' || last == '/');
                        if(want_insert){
                            const [row_idx, col_idx] = idx_of(cell);
                            let col_name = result.column_names[col_idx];
                            if(!col_name && col_idx < 26)
                                col_name = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[col_idx];
                            if(sid != result.id){
                                const sheet_name = fully_qualified_sheet_name(result);
                                (a as HTMLInputElement).value += `[${sheet_name}, ${col_name}, ${row_idx+1}]`;
                            }
                            else {
                                (a as HTMLInputElement).value += `${col_name}${row_idx+1}`;
                            }
                            e.stopPropagation();
                            e.preventDefault();
                            return;
                        }
                    }
                }
            }
            if(e.shiftKey){
                const [row_idx, col_idx] = idx_of(cell);
                result.r1 = row_idx;
                result.c1 = col_idx;
                update_range();
                e.preventDefault();
                return;
            }
            (e.target as HTMLDivElement).focus();
            result._down = true;
        }
        cell.onmousemove = function(e:MouseEvent):void{
            if(!result._down) return;
            const [row_idx, col_idx] = idx_of(cell);
            if(row_idx != result.r1 || col_idx != result.c1){
                result.r1 = row_idx;
                result.c1 = col_idx;
                update_range();
            }
        };
        cell.onmouseup = function(e:MouseEvent):void{
            result._down = false;
        }
        cell.onkeydown = on_cell_keydown;
        cell.oncontextmenu = celldropdown;
        cell.oncopy = on_copy;
        cell.onpaste = on_paste;
        cell.oncut = on_cut;
        cell.onblur = function(){
            // result.r0 = -1;
            // result.c0 = -1;
            result.r1 = -1;
            result.c1 = -1;
            update_range();
        };
        cell.onfocus = function():void{
            const [row_idx, col_idx] = idx_of(cell);
            result.r0 = row_idx;
            result.c0 = col_idx;
            result.r1 = row_idx;
            result.c1 = col_idx;
            update_range();
        }
    }
    function update_range():void{
        if(result._old_r0 == result.r0 && result._old_r1 == result.r1 && result._old_c0 == result.c0 && result._old_c1 == result.c1)
            return;
        really_update_range();
    }
    function really_update_range():void{
        result._old_r0 = result.r0;
        result._old_c0 = result.c0;
        result._old_r1 = result.r1;
        result._old_c1 = result.c1;
        let r0 = result.r0;
        let r1 = result.r1;
        if(r0 > r1){
            const t = r0;
            r0 = r1;
            r1 = t;
        }
        let c0 = result.c0;
        let c1 = result.c1;
        if(c0 > c1){
            const t = c0;
            c0 = c1;
            c1 = t;
        }
        // console.log({r0, r1, c0, c1});
        const can_add_range = (r0 != r1 || c0 != c1) && r0 != -1 && r1 != -1 && c0 != -1 && c1 != -1;
        // console.log({can_add_range});

        for(let r = 0; r < result.cell_elems.length; r++){
            const row = result.cell_elems[r];
            for(let c = 0; c < row.length; c++){
                const cell = row[c];
                cell.classList.remove('range');
                if(!can_add_range) continue;
                if(r >= r0 && r <= r1 && c >= c0 && c <= c1)
                    cell.classList.add('range');
            }
        }
    }
    function find_prev_elem(row_idx:number, col_idx: number):HTMLElement{
        if(col_idx == 0){
            return result.number_els[row_idx];
        }
        const row = result.cell_elems[row_idx];
        return row[col_idx-1];
    }
    function add_cell(s:string, row_idx:number, col_idx:number):void{
        const disp_txt = s && s[0] == '='?'':s;
        let cell = elem_with_text('div', disp_txt, null, 'tracker-cell');
        editable_cell(cell);
        if(row_idx < 0) row_idx += result.cell_elems.length;
        if(col_idx < 0) col_idx += result.cell_elems[row_idx].length+1;
        result.cell_elems[row_idx].splice(col_idx, 0, cell);
        result.cell_sources[row_idx].splice(col_idx, 0, s);
        result.cell_displays[row_idx].splice(col_idx, 0, disp_txt);
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
        if(result.flags & SpreadSheetFlags.IS_FUNCTION)
            do_func_io();
        // NOTE: assume adding rows at the end can't trigger a recalc
        if(whence != result.cell_sources.length-1){
            sheet_dewasm(result);
            recalc_me();
        }
        really_update_range();
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
        const col_idx = result.headers.indexOf(cell);
        if(col_idx == -1) return;
        let oldtxt = result.column_names[col_idx];
        if(!oldtxt) oldtxt = '';
        cell.classList.add('editing');
        cell.textContent = '';
        const inp = elem_with_parent(cell, 'input');
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        inp.autocapitalize = 'off';
        inp.type = 'text';
        inp.style.width = w;
        inp.style.height = h;
        inp.value = oldtxt;
        let canceled = false;
        inp.onkeydown = function(e:KeyboardEvent):void{
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
                cell.textContent = oldtxt?oldtxt:String.fromCharCode(65+col_idx);
                return;
            }
            const v = inp.value.trim();
            if(v != oldtxt){
                cell.textContent = v?v:String.fromCharCode(65+col_idx);;
                // const col_idx = result.headers.indexOf(cell);
                EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.RENAME_COL, result.id, col_idx, v]);
            }
            else
                cell.textContent = oldtxt?oldtxt:String.fromCharCode(65+col_idx);
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
                            if(e.key == 'n' || e.key == 'N'){
                                result.cell_elems[0][idx].focus();
                                break;
                            }
                            if(e.key == 'p' || e.key == 'P'){
                                break;
                            }
                            if(e.key == 'b' || e.key == 'B'){
                                if(idx > 0) result.headers[idx-1].focus();
                                break;
                            }
                            if(e.key == 'f' || e.key == 'F'){
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
        for(let i = 0; i < result.column_names.length; i++){
            if(!result.column_names[i]){
                result.headers[i].textContent = String.fromCharCode(65+i);
            }
        }
        if(result.flags & SpreadSheetFlags.IS_FUNCTION)
            do_func_io();
        // NOTE: assume adding columns at the end can't trigger a recalc
        if(whence != result.column_names.length-1 || (result.flags & SpreadSheetFlags.IS_FUNCTION)){
            sheet_dewasm(result);
            recalc_me();
        }
        really_update_range();
    };
    result.set_title = function(title:string):void{
        result.name = title;
        t.textContent = (result.flags & SpreadSheetFlags.IS_FUNCTION)?`Func — ${title}` : title;
        SHEET_TV.rename(id, title);
        if(result._wasmed){
            SHEET_CTX.make_sheet(result.id, result.name);
            if(!(result.flags & SpreadSheetFlags.IS_FUNCTION))
                SHEET_CTX.set_sheet_alias(result.id, fully_qualified_sheet_name(result));
        }
        recalc_me(); // changing a name can trigger recalc
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
        if(result.flags & SpreadSheetFlags.IS_FUNCTION)
            do_func_io();
        sheet_dewasm(result);
        recalc_me();
        really_update_range();
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
        for(let i = 0; i < result.column_names.length; i++){
            if(!result.column_names[i]){
                result.headers[i].textContent = String.fromCharCode(65+i);
            }
        }
        if(result.flags & SpreadSheetFlags.IS_FUNCTION)
            do_func_io();
        sheet_dewasm(result);
        recalc_me();
        really_update_range();
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
        if(result.flags & SpreadSheetFlags.IS_FUNCTION)
            do_func_io();
        sheet_dewasm(result);
        recalc_me();
        really_update_range();
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
        if(result.flags & SpreadSheetFlags.IS_FUNCTION)
            do_func_io();
        sheet_dewasm(result);
        recalc_me();
        really_update_range();
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
        for(let i = 0; i < result.column_names.length; i++){
            if(!result.column_names[i]){
                result.headers[i].textContent = String.fromCharCode(65+i);
            }
        }
        if(result.flags & SpreadSheetFlags.IS_FUNCTION)
            do_func_io();
        sheet_dewasm(result);
        recalc_me();
        really_update_range();
    };
    result.rename_column = function(whence:number, name:string):void{
        if(whence < 0 || whence >= result.headers.length) return;
        result.column_names[whence] = name;
        result.headers[whence].textContent = name;
        if(result._wasmed){
            SHEET_CTX.set_col_name(result.id, whence, name);
        }
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
        if(result._wasmed){
            SHEET_CTX.set_str(result.id, row_idx, col_idx, val);
        }
        recalc_me();
    };
    result.edit_cells = function(row_idxes:Array<number>, col_idxes:Array<number>, vals:Array<string>):void{
        if(row_idxes.length != col_idxes.length) return;
        if(row_idxes.length != vals.length) return;
        const length = row_idxes.length;
        for(let i = 0; i < length; i++){
            const row_idx = row_idxes[i];
            const col_idx = col_idxes[i];
            if(row_idx < 0 || row_idx >= result.cell_elems.length) return;
            const row = result.cell_sources[row_idx];
            if(col_idx < 0 || col_idx >= row.length) return;
        }
        for(let i = 0; i < length; i++){
            const row_idx = row_idxes[i];
            const col_idx = col_idxes[i];
            const val = vals[i];
            const row = result.cell_sources[row_idx];
            if(row[col_idx] == val) continue;
            row[col_idx] = val;
            if(result._wasmed)
                SHEET_CTX.set_str(result.id, row_idx, col_idx, val);
        }
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
    };

    result.set_func_io = function(nargs:number, outx:number, outy:number):void{
        result.func_nargs = nargs;
        result.func_outx = outx;
        result.func_outy = outy;
        do_func_io();
        sheet_dewasm(result);
        recalc_me();
    };
    setup_closable_window(w, x, function():void{
        store_local(StorageCategory.WINDOW, openid, '');
        result.hidden = true;
    });
    w.style.gridTemplateRows = gtr();
    w.style.gridTemplateColumns = gtc();
    t.textContent = (result.flags & SpreadSheetFlags.IS_FUNCTION)?`Function — ${name}` : name;
    if(!get_local(StorageCategory.WINDOW, openid)) result.hide();
    else result.show();
    return result;
}
const SPREADSHEETS:Map<number, SpreadSheet> = new Map();

function spreadsheet_from_data(data:SpreadSheetData):SpreadSheet{
    // Use ALL to enable all behaviors and then set the real flags below. This
    // allows the imperative adding of the needed columns.
    //
    // HOWEVER: we need to include the is function flag
    const ss = make_spreadsheet(data.id, data.parent, SpreadSheetFlags.ALL | (data.flags & SpreadSheetFlags.IS_FUNCTION), data.name);
    for(const col of data.column_names)
        ss.add_column2(-1, col);
    for(let i = 0; i < data.cells.length; i+= data.column_names.length)
        ss.add_row2(-1, data.cells.slice(i, i+data.column_names.length));
    SPREADSHEETS.set(data.id, ss);
    ss.set_flags(data.flags);
    if(data.flags & SpreadSheetFlags.IS_FUNCTION)
        ss.set_func_io(data.n_args, data.outx, data.outy);
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
        if(!diag.f.numbered.checked)
            flags &= ~SpreadSheetFlags.NUMBERED;
        if(diag.f['function'].checked)
            flags |= SpreadSheetFlags.IS_FUNCTION;
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
        EMIT(FromClient.SPREADSHEET, [SpreadSheetMsgType.NEW_SHEET, {id:0, name, flags, column_names:[], cells:[], parent:parent, n_args:1, outx:0, outy:3}]);
    };
    diag.show_handler = function():void{
        diag.f.name.value = '';
        diag.f.numbered.checked = true;
        diag.f.name.focus();
        diag.f['function'].checked = false;
        setTimeout(()=>diag.f.name.focus(), 0);
    }
    diag.show();
}

// TAG newtrackerbutton
document.addEventListener('DOMContentLoaded', function():void{
    const b = by_id('new-sheet-button');
    b.onclick = function():void{
        do_new_sheet_dialog(0);
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
        case SpreadSheetMsgType.EDIT_CELLS:{
            let ss = SPREADSHEETS.get(arg[1]);
            if(!ss) break;
            ss.edit_cells(arg[2], arg[3], arg[4]);
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
            SHEET_TV.add_item(ss.name, ss.id, ss.parent?ss.parent:null);
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
                SHEET_TV.add_item_(ss.name, ss.id, null);
                if(ss.hidden) continue;
                recalc(ss.id);
            }
            for(const ss of SPREADSHEETS.values()){
                if(ss.parent){
                    SHEET_TV.change_parent_(ss.id, ss.parent);
                }
            }
            SHEET_TV.rebuild();
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
            // XXX: There might be a bug where sheets that should
            //      depend on the new name won't get recalced.
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
            sheet_dewasm(ss);
            SPREADSHEETS.delete(id);
            SHEET_TV.remove(id);
        }break;
        case SpreadSheetMsgType.PARENT:{
            SHEET_TV.change_parent(arg[1], arg[2]);
        }break;
        case SpreadSheetMsgType.FUNCTION_IO:{
            const id = arg[1];
            let ss = SPREADSHEETS.get(id);
            if(!ss) break;
            ss.set_func_io(arg[2], arg[3], arg[4]);
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
        n_args: 0,
        outx: -1,
        outy: -1,
    };
    return result;
}

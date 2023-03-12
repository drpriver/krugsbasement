//
// Copyright © 2023, David Priver
//
const enum DrspResultKind {
    NULL   = 0, // Empty Cell
    NUMBER = 1,
    STRING = 2,
}
type DrSpreadCtx = {
    evaluate_formulas: (sheet:number) => Array<number>;
    evaluate_string: (sheet:number, s:string) => number | string;
    set_str:(sheet:number, row:number, col:number, s:string) => void;
    make_sheet:(sheet:number, name:string) => void;
    set_sheet_alias:(sheet:number, name:string) => void;
    set_col_name:(sheet:number, idx: number, name:string) => void;
    del_sheet:(sheet:number) => void;
};
type DrSpreadExports = {
    memory: WebAssembly.Memory;
    strlen: (p:number) => number;
    drsp_create_ctx: () => number;
    drsp_destroy_ctx: (ctx:number) => number;
    drsp_evaluate_formulas: (ctx:number, sheet:number, handles: number, nhandles:number) => number;
    drsp_evaluate_string: (ctx:number, sheet:number, ptext:number, txtlen:number, result:number, caller_row:number, caller_col:number) => number;
    drsp_set_cell_str:(ctx:number, sheet:number, row:number, col:number, ptxt:number, txtlen:number) => number;
    drsp_set_sheet_name:(ctx:number, sheet:number, ptxt:number, txtlen:number) => number;
    drsp_set_sheet_alias:(ctx:number, sheet:number, ptxt:number, txtlen:number) => number;
    drsp_set_col_name:(ctx:number, sheet:number, idx:number, ptxt:number, txtlen:number) => number;
    drsp_del_sheet:(ctx:number, sheet:number) => number;
    reset_memory: () => void;
    wasm_str_buff: {value:number};
    wasm_deps_buff: {value:number};
    wasm_result: {value:number};
};
function drspread(
    wasm_path:string,
    sheet_set_display_number:(id:number, row:number, col:number, val:number)=>void,
    sheet_set_display_string_:(id:number, row:number, col:number, s:string)=>void,
    sheet_set_display_error:(id:number, row:number, col:number)=>void,
):Promise<{
    make_ctx: () => DrSpreadCtx;
    exports: DrSpreadExports;
}>
{

let winst: WebAssembly.Instance;
// let exports: WebAssembly.Exports;
let exports: DrSpreadExports;
let mem: Uint8Array;
let memview: DataView;
const decoder = new TextDecoder();
const encoder = new TextEncoder();
function wasm_string_to_js(p:number, len:number):string{
    const sub = mem.subarray(p, p+len);
    const text = decoder.decode(sub);
    return text;
}
/*
function write4(p:number, val:number):void{
    memview.setInt32(p, val, true);
}
*/

/*
function js_string_to_wasm(s:string):number{
    const encoded = encoder.encode(s);
    const p = exports.malloc(encoded.length+4);
    write4(p, encoded.length);
    mem.set(encoded, p+4);
    return p;
}
*/
function read4(p:number):number{
    return memview.getInt32(p, true);
}
function readdouble(p:number):number{
    const d = memview.getFloat64(p, true);
    return d;
}
const imports = {
    env:{
        logline:function(p:number, l:number):void{
            const len = exports.strlen(p);
            const s = wasm_string_to_js(p, len);
            console.trace(`${s}: ${l}`);
        },
        logsz:function(sz:number):void{
            console.trace(sz);
        },
        // bizarrely, Math.round doesn't round correctly
        round: (num:number):number => {
            return Math.sign(num) * Math.round(Math.abs(num))
        },
        abort:():void =>{
            throw new Error();
        },
        pow: Math.pow,
        sheet_set_display_number,
        sheet_set_display_string:function(id:number, row:number, col:number, p:number, len:number):void{
            const s = wasm_string_to_js(p, len);
            sheet_set_display_string_(id, row, col, s);
        },
        sheet_set_display_error,
    },
};

return fetch(wasm_path)
    .then(response => response.arrayBuffer())
    .then(bytes => WebAssembly.instantiate(bytes, imports))
    .then(x=>{
        winst = x.instance;
        exports = winst.exports as any;
        const m = exports.memory;
        m.grow(1024);
        mem = new Uint8Array(m.buffer);
        memview = new DataView(mem.buffer);
        function create_ctx():DrSpreadCtx{
            const result = {
                id: exports.drsp_create_ctx() as number,
                evaluate_formulas: (sheet:number):Array<number> =>{
                    const ctx = result.id;
                    const enum _ {NHANDLES=1024}
                    const handles = exports.wasm_deps_buff.value;
                    exports.drsp_evaluate_formulas(ctx, sheet, handles, _.NHANDLES);
                    const deps = [];
                    for(let i = 0; i < _.NHANDLES; i++){
                        const hnd = read4(handles+i*4);
                        if(!hnd) break;
                        if(hnd == sheet) continue;
                        deps.push(hnd);
                    }
                    return deps;
                },
                evaluate_string: (sheet:number, s:string):number|string => {
                    const ctx = result.id;
                    const encoded = encoder.encode(s);
                    mem.set(encoded, exports.wasm_str_buff.value);
                    const err = exports.drsp_evaluate_string(ctx, sheet, exports.wasm_str_buff.value, encoded.length, exports.wasm_result.value, -1, -1);
                    if(err) return "error";
                    const kind = read4(exports.wasm_result.value);
                    let v: string|number = "error";
                    switch(kind){
                        case DrspResultKind.NULL:   v = ""; break;
                        case DrspResultKind.NUMBER: v = readdouble(exports.wasm_result.value+8); break;
                        case DrspResultKind.STRING: v =  wasm_string_to_js(read4(exports.wasm_result.value+12), read4(exports.wasm_result.value+8)); break;
                        default: break;
                    }
                    return v;
                },
                set_str: (sheet:number, row:number, col:number, s:string):void => {
                    const ctx = result.id;
                    const encoded = encoder.encode(s);
                    mem.set(encoded, exports.wasm_str_buff.value);
                    exports.drsp_set_cell_str(ctx, sheet, row, col, exports.wasm_str_buff.value, encoded.length);
                },
                make_sheet: (sheet:number, name:string):void => {
                    const ctx = result.id;
                    const encoded = encoder.encode(name);
                    mem.set(encoded, exports.wasm_str_buff.value);
                    exports.drsp_set_sheet_name(ctx, sheet, exports.wasm_str_buff.value, encoded.length);
                },
                set_sheet_alias: (sheet:number, name:string):void=>{
                    const ctx = result.id;
                    const encoded = encoder.encode(name);
                    mem.set(encoded, exports.wasm_str_buff.value);
                    exports.drsp_set_sheet_alias(ctx, sheet, exports.wasm_str_buff.value, encoded.length);
                },
                set_col_name: (sheet:number, idx:number, name:string):void => {
                    const ctx = result.id;
                    const encoded = encoder.encode(name);
                    mem.set(encoded, exports.wasm_str_buff.value);
                    exports.drsp_set_col_name(ctx, sheet, idx, exports.wasm_str_buff.value, encoded.length);
                },
                del_sheet: (sheet:number):void=>{
                    exports.drsp_del_sheet(result.id, sheet);
                },
            };
            return result;
        }
        return {exports, make_ctx:create_ctx};
    });
}

let _md_is_init = false;
const _md_queue: Array<[string, (_:string)=>void]> = [];
const _md_to_html: (text:string, cb:(_:string)=>void)=>void = (function(){
    let wasm_instance: WebAssembly.Instance;
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let memory: Uint8Array;
    function marshall_string(s:string): number{
        let encoded = encoder.encode(s)
        let p = (wasm_instance.exports.malloc as any)(encoded.length+5);
        let lengthp = memory.subarray(p, p+4);
        lengthp[0] = (encoded.length >> 0) & 255;
        lengthp[1] = (encoded.length >> 8) & 255;
        lengthp[2] = (encoded.length >> 16) & 255;
        lengthp[3] = (encoded.length >> 24) & 255;
        let sub = memory.subarray(p+4, p+4+encoded.length);
        sub.set(encoded);
        memory[p+4+encoded.length] = 0;
        return p;
    }
    function wasm_string_to_js(pstring:number):string{
        let sub = memory.subarray(pstring, pstring+4);
        let length = sub[0]| (sub[1]<<8) | (sub[2]<<16) | (sub[3]<<24);
        let textmem = memory.subarray(pstring+4, pstring+4+length);
        let text = decoder.decode(textmem);
        return text;
    }
    function do_it(text:string, cb:(_:string)=>void):void{
        (wasm_instance.exports as any).reset_memory();
        const marshalled = marshall_string(text);
        const result = (wasm_instance.exports as any).make_html(marshalled);
        if(result){
            const jsresult = wasm_string_to_js(result);
            cb(jsresult);
        }
        else {
            cb("<div>Error</div>");
        }
    }
    let imports = {
      env: {
          abort: function():void{
            throw new WebAssembly.RuntimeError;
          }
      }
    };
    fetch('/wasm/drmd.wasm').then(response=> response.arrayBuffer())
    .then(bytes=> WebAssembly.instantiate(bytes, imports))
    .then(x => {
        wasm_instance = x.instance;
        (wasm_instance.exports.memory as any).grow(1024);
        memory = new Uint8Array((wasm_instance.exports.memory as any).buffer);
        _md_is_init = true;
        for(let q of _md_queue)
            do_it(q[0], q[1]);
        _md_queue.length = 0;
    });
    return do_it;
})();
function md_to_html(text:string, cb:(_:string)=>void):void{
    if(!_md_is_init){
        _md_queue.push([text, cb]);
        return;
    }
    _md_to_html(text, cb);
}

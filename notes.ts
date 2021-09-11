enum NOTEFLAGS {
    NONE = 0,
    DELETED = 1 << 0,
}
type Note = {
    title: string;
    body: string;
    flags: NOTEFLAGS;
    id: number;
}
const NOTES: Map<number, Note> = new Map();
// We need this so we can update the option's text when the note's title changes.

const make_dnd_html = (function(){
    let wasm_instance: WebAssembly.Instance;
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let memory: Uint8Array;
    function marshall_string(s:string): number{
        let encoded = encoder.encode(s)
        let p = (wasm_instance.exports.malloc as any)(encoded.length+1);
        let lengthp = memory.subarray(p, p+4);
        lengthp[0] = (encoded.length >> 0) & 255;
        lengthp[1] = (encoded.length >> 8) & 255;
        lengthp[2] = (encoded.length >> 16) & 255;
        lengthp[3] = (encoded.length >> 24) & 255;
        let sub = memory.subarray(p+4, p+4+encoded.length);
        memory[p+4+encoded.length] = 0;
        sub.set(encoded);
        return p;
    }
    function wasm_string_to_js(pstring:number):string{
        let sub = memory.subarray(pstring, pstring+4);
        let length = sub[0]| (sub[1]<<8) | (sub[2]<<16) | (sub[3]<<24);
        let textmem = memory.subarray(pstring+4, pstring+4+length);
        let text = decoder.decode(textmem);
        return text;
    }
    let errors: Array<string> = [];
    let imports = {
      env: {
          logi32: function(i:number) {
              errors.push(""+i);
          },
          log_string: function(p:number, len:number){
              let sub = memory.subarray(p, p+len);
              errors.push(decoder.decode(sub));
          },
          abort: function(){
            throw new WebAssembly.RuntimeError;
          }
      }
    };
    let init = false;
    function initialize(text:string, cb:(_:string, __:Array<string>)=>void){
        init = true;
        fetch('/wasm/dndc.wasm').then(response=> response.arrayBuffer())
        .then(bytes=> WebAssembly.instantiate(bytes, imports))
        .then(x => {
            wasm_instance = x.instance;
            (wasm_instance.exports.memory as any).grow(1024);
            memory = new Uint8Array((wasm_instance.exports.memory as any).buffer);
            do_it(text, cb);
        });
    }
    function make_dnd_html(text:string, cb:(_:string, __:Array<string>)=>void):void{
        if(!init){
            initialize(text, cb);
        }
        else {
            do_it(text, cb);
        }
    }
    function do_it(text:string, cb:(_:string, __:Array<string>)=>void){
        errors = [];
        if(!text.length){
            cb(" ", []);
            return;
        }
        (wasm_instance.exports as any).reset_memory();
        const marshalled = marshall_string(text);
        let result = (wasm_instance.exports as any).make_html(marshalled);
        if(result){
            const jsresult = wasm_string_to_js(result);
            return cb(jsresult, errors);
        }
        else {
            return cb("", errors);
        }
    }
    return make_dnd_html;
})();

document.addEventListener('DOMContentLoaded', function(){
    const button = document.getElementById('notes-window-button') as HTMLButtonElement;
    const notes_window = document.getElementById('notes-window') as HTMLDivElement;
    let dragging = false;
    let x = 0;
    let y = 0;
    let xorg = 0;
    let yorg = 0;
    const move_handle = document.getElementById('notes-window-handle') as HTMLDivElement;
    move_handle.addEventListener('pointerdown', function(e:PointerEvent){
        if(e.target !== move_handle)
            return;
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        let r = notes_window.getBoundingClientRect();
        notes_window.style.top = r.top + 'px';
        notes_window.style.left = r.left + 'px';
        x = e.screenX;
        y = e.screenY;
        xorg = r.left;
        yorg = r.top;
        window.addEventListener('pointermove', pointermove);
        window.addEventListener('pointerleave', endmove);
        window.addEventListener('pointerup', endmove);
    });
    function endmove(e:PointerEvent){
        window.removeEventListener('pointermove', pointermove);
        window.removeEventListener('pointerleave', endmove);
        window.removeEventListener('pointerup', endmove);
        dragging = false;
    }
    function pointermove(e:PointerEvent){
        if(!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        let xdiff = e.screenX - x;
        let ydiff = e.screenY - y;
        notes_window.style.top = yorg + ydiff + 'px';
        notes_window.style.left = xorg + xdiff + 'px';
        let r = notes_window.getBoundingClientRect();
        xorg = r.left;
        yorg = r.top;
        x = e.screenX;
        y = e.screenY;
    }
    move_handle.addEventListener('dblclick', hide_note_view);
    function hide_note_view(e:MouseEvent){
        e.preventDefault();
        e.stopPropagation();
        notes_window.style.display='none';
        notes_is_open = false;
    }
    const notes_area = document.getElementById('note-view-edit') as HTMLTextAreaElement;
    const iframe = notes_window.getElementsByTagName('iframe')[0];
    const editor_log = document.getElementById('note-view-editor-log') as HTMLDivElement;
    let notes_is_open = false;
    const boilerplate = `
        ::css @inline
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
          }
          table, table * {
            border: 1px solid black;
            border-collapse: collapse;
            padding: 8px 8px;
          }
          blockquote {
            font-style: italic;
          }
          body {
            padding: 0px 2em;
          }`;
    let title = "Some Title";
    function update_iframe(){
        let s = boilerplate + '\n' + title + '::title\n' + notes_area.value;
        make_dnd_html(s, function(html:string, errors:Array<string>){
            while(editor_log.childNodes.length){
              editor_log.removeChild(editor_log.lastChild!);
            }
            for(let error of errors){
              const pp = document.createElement('pre');
              pp.innerHTML = error;
              editor_log.appendChild(pp);
            }
            if(html)
                iframe.srcdoc = html;
        });
    }
    update_iframe();
    notes_area.addEventListener('input', function(){
        update_iframe();
    });
    notes_area.addEventListener('keydown', function(e){
      if(e.key != 'Tab')
        return;
      e.preventDefault();
      let start = notes_area.selectionStart;
      let end = notes_area.selectionEnd;
      notes_area.value = notes_area.value.substring(0, start) + "  " + notes_area.value.substring(end);
      // restore cursor position
      notes_area.selectionStart = notes_area.selectionEnd = start+2;
    });
    button.addEventListener('click', function(){
        if(notes_is_open)
            return;
        notes_is_open = true;
        notes_window.style.display='grid';
        update_iframe();
    });
    const new_note = document.getElementById('new-note') as HTMLSpanElement;
    const notes_list = document.getElementById('notes-list') as HTMLDivElement;
    function add_note(id:number, note:Note){
        const d = document.createElement('div');
        d.dataset.id = ""+id;
        const s = document.createElement('span');
        s.innerText = note.title;
        const b1 = document.createElement('button');
        b1.innerText='✎';
        const b2 = document.createElement('button');
        b2.innerText='✘';
        d.appendChild(s);
        d.appendChild(b1);
        d.appendChild(b2);
        notes_list.appendChild(d);
        NOTES.set(id, note);
    }
    function delete_note_by_id(id:number){
        const note = NOTES.get(id);
        if(!note) return;
        for(let nl of notes_list.childNodes){
            if((nl as HTMLElement).dataset.id == ""+note.id){
                notes_list.removeChild(nl);
                break;
            }
        }
        note.flags |= NOTEFLAGS.DELETED;
    }
    SOCKET.on('note-delete', function(note_id:number){
        delete_note_by_id(note_id);
    });
    SOCKET.on('notes-initialize', function(notes:Array<Note>){
        let n = notes_list.childNodes.length;
        while(--n){
            notes_list.removeChild(notes_list.lastChild!);
        }
        NOTES.clear();
        for(let note of notes){
            add_note(note.id, note);
        }
    });
    SOCKET.on('new-note', function(note_id:number){
        add_note(note_id, {flags:0, title:'Untitled Note', body:'', id:note_id});
    });
    function set_note_by_id(id:number){
        let note = NOTES.get(id);
        if(!note) return;
        notes_area.value = note.body;
        title = note.title;
    }
    new_note.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        let id: number;
        SOCKET.emit('new-note-request', function(new_id:number){
            id = new_id;
            add_note(id, {id:id, title:"Unitled", body:"", flags:0});
            set_note_by_id(id);
        });
    });
});

enum NOTEFLAGS {
    NONE = 0,
    DELETED = 1 << 0,
}
type Note = {
    title: string;
    body: string;
    flags: NOTEFLAGS;
}
let CURRENT_NOTE_ID = -1;
const NOTES: Map<number, Note> = new Map();
// We need this so we can update the option's text when the note's title changes.
const NOTE_ID_TO_OPTION: Map<number, HTMLOptionElement> = new Map();

function add_note(id:number, note:Note){
    NOTES.set(id, note);
    const notes_selection = document.getElementById('current-note-name')! as HTMLSelectElement;
    add_note_option(notes_selection, note.title, id);
}
SOCKET.on('new-note', function(note_id:number){
    add_note(note_id, {flags:0, title:'Untitled Note', body:''});
});
function add_note_option(notes_selection:HTMLSelectElement, name:string, id:number){
    const option = document.createElement('option');
    option.innerText = name;
    option.value = `${id}`; // hack!
    notes_selection.options.add(option);
    NOTE_ID_TO_OPTION.set(id, option);
}
function hide_notes(){
    const right = document.getElementById('right-split')! as HTMLDivElement;
    (right as any).replaceChildren();
    right.style.display = 'none';
    resize_canvas();
    CURRENT_NOTE_ID = -1;
    const notes_selection = document.getElementById('current-note-name')! as HTMLSelectElement;
    if(notes_selection)
        notes_selection.selectedIndex = 0;
}
function update_note_title(note_id: number, title:string){
    const note = NOTES.get(note_id);
    if(note)
        note.title = title;
    const opt = NOTE_ID_TO_OPTION.get(note_id);
    if(opt){
        opt.innerText = title;
    }
}
function update_note_body(note_id:number, body:string){
    const note = NOTES.get(note_id);
    if(!note)
        return;
    note.body = body;
}
SOCKET.on('note-update-title', function(data:{note_id:number, title:string}){
    update_note_title(data.note_id, data.title);
    const notetitle = document.getElementById('note-input') as HTMLTextAreaElement | undefined;
    if(notetitle)
        notetitle.value = data.title;
});
SOCKET.on('note-update-body', function(data:{note_id:number, body:string}){
    update_note_body(data.note_id, data.body);
    if(CURRENT_NOTE_ID != data.note_id)
        return;
    const noteta = document.getElementById('note') as HTMLTextAreaElement | undefined;
    if(noteta)
        noteta.value = data.body;
});
function show_note_text(id:number, note:Note){
    const right = document.getElementById('right-split')! as HTMLDivElement;
    // Delete anything that's currently in there.
    (right as any).replaceChildren();
    const title = document.createElement('textarea');
    title.id = 'note-input';
    title.value = note.title;
    title.rows = 1;
    title.spellcheck = false;
    title.addEventListener('input', function(){
        update_note_title(id, title.value);
        SOCKET.emit('note-update-title', {note_id:id, title:title.value});
    });
    const noteta = document.createElement('textarea');
    noteta.id = 'note';
    noteta.value = note.body;
    noteta.style.width = '100%';
    noteta.spellcheck = false;
    let note_generation = 0;
    noteta.addEventListener('input', function(){
        let text = noteta.value;
        setTimeout(function(t:string, generation:number){
            if(note_generation > generation)
                return;
            update_note_body(id, text);
            SOCKET.emit('note-update-body', {note_id:id, body:text});
        }, 500, text, ++note_generation);
    });
    right.appendChild(title);
    right.appendChild(noteta);
    right.style.display = 'flex';
    resize_canvas();
    title.style.width = '100%';
}
function show_note_by_id(note_id:number){
    const note = NOTES.get(note_id);
    if(!note){
        hide_notes();
        return;
    }
    show_note_text(note_id, note);
    const notes_selection = document.getElementById('current-note-name')! as HTMLSelectElement;
    for(let i = 0; i < notes_selection.options.length; i++){
        if(+notes_selection.options[i].value == note_id){
            notes_selection.selectedIndex = i;
            break;
        }
    }
    CURRENT_NOTE_ID = note_id;
}
function delete_note_by_id(id:number){
    const note = NOTES.get(id);
    if(!note)
        return;
    note.flags |= NOTEFLAGS.DELETED;
    const notes_selection = document.getElementById('current-note-name')! as HTMLSelectElement;
    remove_note_option(notes_selection, id);
}
function remove_note_option(select:HTMLSelectElement, id:number){
    for(let i = 0; i < select.options.length; i++){
        if(+select.options[i].value == id){
            select.remove(i);
            break;
        }
    }
    if(CURRENT_NOTE_ID == id){
        hide_notes();
        select.selectedIndex = 0;
    }
    NOTE_ID_TO_OPTION.delete(id);
}
SOCKET.on('note-delete', function(note_id:number){
    delete_note_by_id(note_id);
});
SOCKET.on('notes-initialize', function(notes:Array<{id:number, flags:NOTEFLAGS, title:string, body:string}>){
    NOTES.clear();
    NOTE_ID_TO_OPTION.clear();

    for(let note of notes){
        const n = {flags:note.flags, title:note.title, body:note.body};
        NOTES.set(note.id, n);
    }
    if(document.readyState == 'complete' || document.readyState == 'interactive'){
        set_existing_notes();
    }
});
function set_existing_notes(){
    const notes_selection = document.getElementById('current-note-name')! as HTMLSelectElement;
    while(notes_selection.options.length > 1){
        notes_selection.remove(1);
    }
    // populate the initial notes
    for(let [id, note] of NOTES.entries()){
        add_note_option(notes_selection, note.title, id);
    }
}
document.addEventListener('DOMContentLoaded', function(){
    const new_note_button = document.getElementById('new-note-button')! as HTMLButtonElement;
    const edit_note_button = document.getElementById('edit-note-button')! as HTMLButtonElement;
    const delete_note_button = document.getElementById('delete-note-button')! as HTMLButtonElement;
    const notes_selection = document.getElementById('current-note-name')! as HTMLSelectElement;
    set_existing_notes();
    notes_selection.addEventListener('input', function(e:Event){
        e.stopPropagation();
        show_note_by_id(+notes_selection.value);
        notes_selection.blur();
    });
    new_note_button.addEventListener('click', function(){
        let id: number;
        SOCKET.emit('new-note-request', function(new_id:number){
            id = new_id;
            add_note(id, {title:"Untitled Note", body:"", flags:0});
            show_note_by_id(id);
            edit_note_button.click();
        });
    });
    delete_note_button.addEventListener('click', function(){

        const note = NOTES.get(CURRENT_NOTE_ID);
        if(!note) return;
        let html = `
        <h2>Delete Note</h2>
        <table class="input-container">
            <tr>
                <td><label for="hover-delete">Delete Note: ${note.title}</label>
                <td><input name="hover-delete" type="checkbox" id="hover-delete">
            </tr>
        </table>
        `;
        make_ok_dialog(html, function(unused:any){
            const delete_checkbox = document.getElementById('hover-delete')! as HTMLInputElement;
            const should_delete = delete_checkbox.checked;
            if(should_delete)
                SOCKET.emit('delete-note-request', CURRENT_NOTE_ID);
        });
    });
});

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
});

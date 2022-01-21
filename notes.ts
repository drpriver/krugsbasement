type Note_ = {
    title: string;
    body: string;
    flags: NOTEFLAGS;
    id: number;
    need_send: boolean;
    need_receive: boolean;
}
const NOTES: Map<number, Note_> = new Map();
// We need this so we can update the option's text when the note's title changes.

const make_dnd_html = (function(){
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
    const notes_window = get_window('notes');
    const notes_editor_container = by_id('note-view-editor-container');
    const notes_area = by_id('note-view-edit');
    const notes_title_area = by_id('note-view-title');
    const iframe = by_id('current-note-view');
    const editor_log = by_id('note-view-editor-log');
    const edit_notes_button = by_id('edit-notes-button');
    let listview = make_list_view<number>(by_id('notes-list'), 0);
    by_id('delete-note').addEventListener('click', function(){
        let dialog = get_dialog('note-deletion');
        if(!dialog) return;
        dialog.f.checkbox.checked = false;
        dialog.ok_handler = function(){
            if(!dialog.f.checkbox.checked)
                return;
            EMIT(FromClient.DELETE_NOTE_REQUEST, current_note_id);
        };
        dialog.show();
    });
    let is_editing = false;
    function stop_editing(){
        if(!is_editing) return;
        is_editing = false;
        edit_notes_button.innerText = 'Edit';
        notes_editor_container.style.display = 'none';
        sync_note();
    }
    function start_editing(){
        if(is_editing) return;
        is_editing = true;
        if(current_note_id == -1){
            EMIT(FromClient.NEW_NOTE_REQUEST);
        }
        edit_notes_button.innerText = 'Done';
        notes_editor_container.style.display = 'block';
    }
    edit_notes_button.addEventListener('click', function(){
        if(edit_notes_button.innerText == 'Edit')
            start_editing();
        else
            stop_editing();
    });
    notes_window.hide_handler = function(){
        stop_editing();
        sync_note();
    };

    // let notes_is_open = false;
    const boilerplate = (''
        +'::css @inline\n'
        +'  body {\n'
        +'    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;\n'
        +'  }\n'
        +'  table, table * {\n'
        +'    border: 1px solid black;\n'
        +'    border-collapse: collapse;\n'
        +'    padding: 8px 8px;\n'
        +'  }\n'
        +'  blockquote {\n'
        +'    font-style: italic;\n'
        +'  }\n'
        +'  body {\n'
        +'    padding: 0px 2em;\n'
        +'    max-width: 40em;\n'
        +'  }\n');
    let current_note_id = -1;
    function onget(n_:Note){
	const n: Note_ = n_ as Note_;
        n.need_receive = false;
        n.need_send = false;
        NOTES.set(n.id, n);
        if(n.id == current_note_id){
            notes_area.value = n.body;
            notes_title_area.value = n.title;
            listview.rename(n.title, n.id);
            update_iframe();
        }
    }
    ONRECV(ToClient.GOT_NOTE, onget);
    listview.activate_handler = function(id:number|undefined){
        sync_note();
        if(id === undefined){
            current_note_id = -1;
            notes_area.value = '';
            notes_title_area.value = '';
            update_iframe();
            return;
        }
        current_note_id = id;
        let note = NOTES.get(id);
        if(!note) {
            update_iframe();
            return;
        }
        if(note.need_receive){
            EMIT(FromClient.GET_NOTE, id);
        }
        else {
            notes_area.value = note.body;
            notes_title_area.value = note.title;
            update_iframe();
        }

    }
    if(DARKMODE){
        // Chromium-based browsers won't inherit
        // the colorScheme for empty iframes,
        // so set them here.
        // Firefox and Safari don't need this hack, but
        // it doesn't hurt.
        //
        // Do it before activation to avoid flicker.
        //
        // Will look weird if the user changes
        // colorscheme, but if they change colorscheme,
        // they will understand why something flickers.
        iframe.srcdoc = `<scr` + `ipt>
            document.documentElement.style.colorScheme = 'dark';
            </sc` + `ript>`;
    }
    function update_iframe(){
        let note = NOTES.get(current_note_id);
        if(!note){
            if(DARKMODE){
                // Chromium-based browsers won't inherit
                // the colorScheme for empty iframes,
                // so set them here.
                iframe.srcdoc = `<scr` + `ipt>
                    document.documentElement.style.colorScheme = 'dark';
                    </sc` + `ript>`;
            }
            else
                iframe.srcdoc = '';
            return;
        }
        let title = notes_title_area.value;
        let s = title + '::title\n' + notes_area.value + '\n' + boilerplate;
        make_dnd_html(s, function(html:string, errors:Array<string>){
            while(editor_log.childNodes.length){
              editor_log.removeChild(editor_log.lastChild!);
            }
            for(let error of errors){
              const pp = document.createElement('pre');
              pp.innerHTML = error;
              editor_log.appendChild(pp);
            }
            if(html){
                // This is unbelievably hacky, but for some reason
                // internal links aren't being recognized as internal,
                // so we need to do it ourselves.

                // breaking up the tags as a version of safari
                // interprets them as regex for some reason
                html += `<scr` + `ipt>
                document.addEventListener('DOMContentLoaded', function(){
                    const anchors = document.getElementsByTagName('a');
                    function add_interceptor(a){
                        a.onclick = function(e){
                            let href = a.href;
                            if(href.baseVal) href = href.baseVal;
                           let split = href.split('#');
                           if(split.length > 1){
                               let target = split[1];
                               let t = document.getElementById(target);
                               if(t){
                                   t.scrollIntoView();
                                   e.preventDefault();
                                   e.stopPropagation();
                                   return false;
                               }
                           }
                           a.setAttribute('target', '_blank');
                        };
                    }
                    for(let a of anchors){
                        add_interceptor(a);
                    }
                });
                </scr`+ `ipt>
                `;
                if(DARKMODE){
                    html += `<scr` + `ipt>
                    document.documentElement.style.colorScheme = 'dark';
                    </sc` + `ript>`;
                    html += `<sty` + `le>
                    @supports (-moz-appearance:none) {
                      body {
                        color: #eee;
                        background-color: #333;
                      }
                    }
                    </sty` + `le>`;
                }
                iframe.srcdoc = html;
            }
        });
    }
    notes_area.addEventListener('input', function(){
        let note = NOTES.get(current_note_id);
        if(!note) return;
        note.body = notes_area.value;
        note.need_send = true;
        update_iframe();
    });
    notes_title_area.addEventListener('input', function(){
        update_iframe();
        let note = NOTES.get(current_note_id);
        if(!note) return;
        note.title = notes_title_area.value;
        let msg:NoteUpdateTitle = {note_id:note.id, title:note.title};
        EMIT(FromClient.NOTE_UPDATE_TITLE, msg);
        listview.rename(note.title, note.id);
    });
    notes_area.addEventListener('keydown', function(e){
        if(e.key == 'Escape'){
            stop_editing();
            return;
        }
        if(e.key != 'Tab')
            return;
        e.preventDefault();
        let start = notes_area.selectionStart;
        let end = notes_area.selectionEnd;
        notes_area.value = notes_area.value.substring(0, start) + "  " + notes_area.value.substring(end);
        // restore cursor position
        notes_area.selectionStart = notes_area.selectionEnd = start+2;
    });
    notes_window.show_handler = function(){
        listview.make_active(current_note_id);
    }
    by_id('notes-window-button').addEventListener('click', function(){
        notes_window.show();
    });
    ONRECV(ToClient.NOTE_DIRTY, function(note_id:number){
        let note = NOTES.get(note_id);
        if(!note) return;
        note.need_receive = true;
        if(note_id == current_note_id){
            EMIT(FromClient.GET_NOTE, note_id);
        }
    });
    function sync_note(){
        let note = NOTES.get(current_note_id);
        if(!note) return;
        if(note.need_send){
            let msg: NoteUpdateBody = {note_id:note.id, body:note.body};
            EMIT(FromClient.NOTE_UPDATE_BODY, msg);
            note.need_send = false;
        }
    }
    function add_note(id:number, note:Note_){
        listview.add_item(note.title, note.id);
        NOTES.set(id, note);
    }
    ONRECV(ToClient.NOTE_DELETE, function(id:number){
        const note = NOTES.get(id);
        if(!note) return;
        listview.remove(id);
        note.flags |= NOTEFLAGS.DELETED;
    });
    ONRECV(ToClient.NOTES_INITIALIZE, function(notes:Array<Note>){
        listview.clear();
        NOTES.clear();
        for(let note of (notes as Array<Note_>)){
            note.need_receive = false;
            note.need_send = false;
            add_note(note.id, note);
        }
        if(notes.length)listview.make_active(notes[0].id);
    });
    ONRECV(ToClient.NEW_NOTE, function(note_id:number){
        add_note(note_id, {flags:0, title:'Untitled', body:'', id:note_id, need_send:false, need_receive:false});
    });
    ONRECV(ToClient.NEW_NOTE_RESPONSE, function(id:number){
        add_note(id, {id:id, title:'Untitled', body:'', flags:0, need_send:false,  need_receive:false});
        listview.make_active(id);
    });
    by_id('new-note').addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        stop_editing();
        EMIT(FromClient.NEW_NOTE_REQUEST);
    });
    ONRECV(ToClient.NOTE_UPDATE_TITLE, function(data:NoteUpdateTitle){
        let note = NOTES.get(data.note_id);
        if(!note) return;
        note.title = data.title;
        listview.rename(data.title, data.note_id);
        if(current_note_id == data.note_id)
            update_iframe();
    });
});

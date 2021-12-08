const enum NOTEFLAGS {
    NONE = 0,
    DELETED = 1 << 0,
}
type Note = {
    title: string;
    body: string;
    flags: NOTEFLAGS;
    id: number;
    need_send: boolean;
    need_receive: boolean;
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
    const button = by_id('notes-window-button');
    const notes_window = by_id('notes-window');

    const notes_editor_container = by_id('note-view-editor-container');
    const move_handle = by_id('notes-window-handle');
    const notes_area = by_id('note-view-edit');
    const notes_title_area = by_id('note-view-title');
    const iframe = notes_window.getElementsByTagName('iframe')[0];
    const editor_log = by_id('note-view-editor-log');
    const edit_notes_button = by_id('edit-notes-button');
    const del_note_button = by_id('delete-note');
    del_note_button.addEventListener('click', function(){
        make_ok_dialog(`
            <h2>Delete Note</h2>
            <table class = "input-container">
            <tr>
              <td><label for="hover-delete-note">Delete Note</label>
              <td><input name="hover-delete-note" type="checkbox" id="hover-delete-note">
            </tr>
            </table>`,
            function (e:HTMLElement){
                const delete_checkbox = by_id('hover-delete-note');
                const should_delete = delete_checkbox.checked;
                if(should_delete){
                    SOCKET.emit(FromClient.DELETE_NOTE_REQUEST, current_note_id);
                }
            });
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
            // this was copy-pasted from the new note button.
            SOCKET.emit(FromClient.NEW_NOTE_REQUEST, function(new_id:number){
                let id = new_id;
                add_note(id, {id:id, title:'Untitled', body:'', flags:0, need_send:false,  need_receive:false});
                set_note_by_id(id);
            });
        }
        edit_notes_button.innerText = 'Done';
        notes_editor_container.style.display = 'block';
    }
    edit_notes_button.addEventListener('click', function(){
        if(edit_notes_button.innerText == 'Edit'){
            start_editing();
        }
        else {
            stop_editing();
        }
    });

    setup_window_size(notes_window);
    let make_top = setup_zsorted_window(notes_window);
    setup_movable_window(notes_window, move_handle);
    const notes_close = by_id('notes-close');
    setup_closable_window(notes_window, notes_close, function(){
        stop_editing();
        sync_note();
        notes_is_open = false;
    });

    let notes_is_open = false;
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
    function make_active(id:number){
        current_note_id = id;
        for(let nl of notes_list.getElementsByTagName('div')){
            nl.classList.remove('active');
            // @ts-ignore
            if(+nl.dataset.id ==id)
                nl.classList.add('active');
        }
    }
    function update_iframe(){
        let note = NOTES.get(current_note_id);
        if(!note){
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
        update_iframe();
        let note = NOTES.get(current_note_id);
        if(!note) return;
        note.body = notes_area.value;
        note.need_send = true;
    });
    notes_title_area.addEventListener('input', function(){
        update_iframe();
        let note = NOTES.get(current_note_id);
        if(!note) return;
        note.title = notes_title_area.value;
        let msg:NoteUpdateTitle = {note_id:note.id, title:note.title};
        SOCKET.emit(FromClient.NOTE_UPDATE_TITLE, msg);
        set_nl(note.id, note.title);
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
    const new_note = by_id('new-note');
    const notes_list = by_id('notes-list');
    button.addEventListener('click', function(){
        if(notes_is_open)
            return;
        make_top();
        notes_is_open = true;
        notes_window.style.display='block';
        if(current_note_id == -1){
            for(let nl of notes_list.getElementsByTagName('div')){
                if(!nl.dataset) continue;
                // @ts-ignore
                set_note_by_id(+nl.dataset.id);
                break;
            }
        }
        ensure_window_is_completely_on_screen(notes_window);
    });
    function set_nl(id:number, title:string){
        for(let nl of notes_list.getElementsByTagName('div')){
            if(!nl.dataset) continue;
            // @ts-ignore
            if(nl.dataset.id == ""+id){
                nl.innerText = title;
                break;
            }
        }
    }
    SOCKET.on(ToClient.NOTE_DIRTY, function(note_id:number){
        let note = NOTES.get(note_id);
        if(!note) return;
        note.need_receive = true;
        if(note_id == current_note_id){
            SOCKET.emit(FromClient.GET_NOTE, note_id, function(n:Note){
                n.need_receive = false;
                n.need_send = false;
                NOTES.set(n.id, n);
                notes_area.value = n.body;
                notes_title_area.value = n.title;
                update_iframe();
                set_nl(n.id, n.title);
            });
        }
    });
    function sync_note(){
        let note = NOTES.get(current_note_id);
        if(!note) return;
        if(note.need_send){
            let msg: NoteUpdateBody = {note_id:note.id, body:note.body};
            SOCKET.emit(FromClient.NOTE_UPDATE_BODY, msg);
            note.need_send = false;
        }
    }
    function set_note_by_id(id:number){
        sync_note();
        if(id == -1){
            notes_area.value = '';
            notes_title_area.value =''
            make_active(id);
            update_iframe();
            return;
        }
        let note = NOTES.get(id);
        if(!note) return;
        if(note.need_receive){
            SOCKET.emit(FromClient.GET_NOTE, id, function(n:Note){
                n.need_receive = false;
                n.need_send = false;
                NOTES.set(id, n);
                notes_area.value = n.body;
                notes_title_area.value = n.title;
                set_nl(n.id, n.title);
                make_active(id);
                update_iframe();
            });
        }
        else {
            notes_area.value = note.body;
            notes_title_area.value = note.title;
            set_nl(note.id, note.title);
            make_active(id);
            update_iframe();
        }
    }
    function add_note(id:number, note:Note){
        const d = document.createElement('div');
        d.dataset.id = ""+id;
        d.innerText = note.title;
        d.addEventListener('click', function(){
            stop_editing();
            set_note_by_id(id);
        });
        notes_list.appendChild(d);
        NOTES.set(id, note);
    }
    function delete_note_by_id(id:number){
        const note = NOTES.get(id);
        if(!note) return;
        let divs = Array.from(notes_list.getElementsByTagName('div'));
        for(let i = 0; i < divs.length; i++){
            let nl = divs[i];
            if(!nl.dataset) continue;
            if(nl.dataset.id == ""+note.id){
                notes_list.removeChild(nl);
                if(current_note_id == id){
                    if(divs.length == 1){
                        set_note_by_id(-1);
                        break;
                    }
                    if(i == 0){
                        // @ts-ignore
                        set_note_by_id(+divs[i+1].dataset.id);
                        break;
                    }
                    // @ts-ignore
                    set_note_by_id(+divs[i-1].dataset.id);
                    break;
                }
                break;
            }
        }
        note.flags |= NOTEFLAGS.DELETED;
    }
    SOCKET.on(ToClient.NOTE_DELETE, function(note_id:number){
        delete_note_by_id(note_id);
    });
    SOCKET.on(ToClient.NOTES_INITIALIZE, function(notes:Array<Note>){
        const divs = Array.from(notes_list.getElementsByTagName('div'));
        for(let div of divs){
            notes_list.removeChild(div);
        }
        NOTES.clear();
        for(let note of notes){
            note.need_receive = false;
            note.need_send = false;
            add_note(note.id, note);
        }
    });
    SOCKET.on(ToClient.NEW_NOTE, function(note_id:number){
        add_note(note_id, {flags:0, title:'Untitled', body:'', id:note_id, need_send:false, need_receive:false});
    });
    new_note.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        let id: number;
        stop_editing();
        SOCKET.emit(FromClient.NEW_NOTE_REQUEST, function(new_id:number){
            id = new_id;
            add_note(id, {id:id, title:'Untitled', body:'', flags:0, need_send:false,  need_receive:false});
            set_note_by_id(id);
        });
    });
    SOCKET.on(ToClient.NOTE_UPDATE_TITLE, function(data:NoteUpdateTitle){
        let note = NOTES.get(data.note_id);
        if(!note) return;
        note.title = data.title;
        set_nl(data.note_id, data.title);
        update_iframe();
    });
    // Server currently never sends this message
    /*
    SOCKET.on(ToClient.NOTE_UPDATE_BODY, function(data:{note_id:number, body:string}){
        let note = NOTES.get(data.note_id);
        if(!note) return;
        note.body = data.body;
        update_iframe();
    });
    */
});

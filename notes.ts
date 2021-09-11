enum NOTEFLAGS {
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
    const notes_editor_container = document.getElementById('note-view-editor-container') as HTMLDivElement;
    const move_handle = document.getElementById('notes-window-handle') as HTMLDivElement;
    const notes_area = document.getElementById('note-view-edit') as HTMLTextAreaElement;
    const notes_title_area = document.getElementById('note-view-title') as HTMLTextAreaElement;
    const iframe = notes_window.getElementsByTagName('iframe')[0];
    const editor_log = document.getElementById('note-view-editor-log') as HTMLDivElement;
    const edit_notes_button = document.getElementById('edit-notes-button') as HTMLButtonElement;
    const del_note_button = document.getElementById('delete-note') as HTMLButtonElement;
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
                const delete_checkbox = document.getElementById('hover-delete-note')! as HTMLInputElement;
                const should_delete = delete_checkbox.checked;
                if(should_delete){
                    SOCKET.emit('delete-note-request', current_note_id);
                }
            })
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
    let dragging = false;
    let x = 0;
    let y = 0;
    let xorg = 0;
    let yorg = 0;
    move_handle.addEventListener('pointerdown', function(e:PointerEvent){
        if(e.target !== move_handle)
            return;
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        move_handle.style.cursor = 'grabbing';
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
        move_handle.style.cursor = 'grab';
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
    const notes_close = document.getElementById('notes-close') as HTMLElement;
    notes_close.addEventListener('click', hide_note_view);
    function hide_note_view(e:MouseEvent){
        e.preventDefault();
        e.stopPropagation();
        stop_editing();
        sync_note();
        notes_window.style.display='none';
        notes_is_open = false;
    }
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
            max-width: 40em;
          }`;
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
            if(html){
                // This is unbelievably hacky, but for some reason
                // internal links aren't being recognized as internal,
                // so we need to do it ourselves.

                // breaking up the tags as a version of safari
                // interprets them as regex for some reason
                html += `<scr` + `ipt>
                document.addEventListener('DOMContentLoaded', function(){
                    const anchors = document.getElementsByTagName('a');
                    for(let a of anchors){
                        a.onclick = function(e){
                           e.preventDefault();
                           e.stopPropagation();
                           let target = e.target.href.split('#')[1];
                           let t = document.getElementById(target);
                           if(t)
                               t.scrollIntoView();
                           return false;
                        };
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
        SOCKET.emit('note-update-title', {note_id:note.id, title:note.title});
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
    button.addEventListener('click', function(){
        if(notes_is_open)
            return;
        notes_is_open = true;
        notes_window.style.display='grid';
        update_iframe();
    });
    const new_note = document.getElementById('new-note') as HTMLButtonElement;
    const notes_list = document.getElementById('notes-list') as HTMLDivElement;
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
    SOCKET.on('note-dirty', function(note_id:number){
        let note = NOTES.get(note_id);
        if(!note) return;
        note.need_receive = true;
        if(note_id == current_note_id){
            SOCKET.emit('get-note', note_id, function(n:Note){
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
            SOCKET.emit('note-update-body', {note_id:note.id, body:note.body});
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
            SOCKET.emit('get-note', id, function(n:Note){
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
    SOCKET.on('note-delete', function(note_id:number){
        delete_note_by_id(note_id);
    });
    SOCKET.on('notes-initialize', function(notes:Array<Note>){
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
        if(notes.length){
            set_note_by_id(notes[0].id);
        }

    });
    SOCKET.on('new-note', function(note_id:number){
        add_note(note_id, {flags:0, title:'Untitled', body:'', id:note_id, need_send:false, need_receive:false});
    });
    new_note.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        let id: number;
        stop_editing();
        SOCKET.emit('new-note-request', function(new_id:number){
            id = new_id;
            add_note(id, {id:id, title:'Untitled', body:'', flags:0, need_send:false,  need_receive:false});
            set_note_by_id(id);
        });
    });
    SOCKET.on('note-update-title', function(data:{note_id:number, title:string}){
        let note = NOTES.get(data.note_id);
        if(!note) return;
        note.title = data.title;
        set_nl(data.note_id, data.title);
        update_iframe();
    });
    SOCKET.on('note-update-body', function(data:{note_id:number, body:string}){
        let note = NOTES.get(data.note_id);
        if(!note) return;
        note.body = data.body;
        update_iframe();
    });
});

//
// Copyright © 2021-2023, David Priver
//

// Don't bother trying to split notes into core vs. ui as they are their
// own self-contained thing.
(function():void{

let NOTE_TV : TreeView;
document.addEventListener('DOMContentLoaded', function():void{
    NOTE_TV = make_tree_view(by_id('notes-list'), 'notes');
    NOTE_TV.on_click = function(id:number):void{
        const note = NOTES.get(id);
        if(!note) return;
        const window = get_note_window(id);
        window.t.textContent = note.title;
        window.show();
    };
    NOTE_TV.on_ctxmenu = function(id:number, e:MouseEvent):void{
        const menu = ctx_menu(e);
        menu.item('Show Others', function():void{
            EMIT(FromClient.NOTE_SHOW, id);
        });
        menu.item('Add Child Note', function():void{
            EMIT(FromClient.NEW_NOTE_REQUEST, id);
        });
        menu.item('Rename', function(e:MouseEvent):void{
            e.stopPropagation();
            e.preventDefault();
            const sp = NOTE_TV.get_sp(id);
            if(!sp) return;
            user_edit_element(sp, 0, function(v:string):void{
                EMIT(FromClient.NOTE_UPDATE_TITLE, {note_id:id, title:v});
                const note = NOTES.get(id)!;
                note.title = v;
                const w = NOTE_WINDOWS.get(id)
                if(w) w.refresh();
            });
            remove_ctx_menu();
        });
        menu.separator();
        if(!NOTE_TV.has_children(id))
            menu.item('Delete', function():void{
                const dialog = get_dialog('note-deletion');
                if(!dialog) return;
                dialog.f.checkbox.checked = false;
                dialog.ok_handler = function():void{
                    if(!dialog.f.checkbox.checked)
                        return;
                    EMIT(FromClient.DELETE_NOTE_REQUEST, id);
                };
                dialog.show();
            });
        else
            menu.disabled('Delete');
        menu.separator();
        menu.item('Cancel');
        menu.install();
    };
    NOTE_TV.on_drop = function(id:number, parent:number|null):void{
        if(parent === null) parent = 0;
        EMIT(FromClient.NOTE_PARENT, {note_id:id, parent});
    };
});
type NoteWindow = {
    id: number;
    w: HTMLDivElement;
    t: HTMLSpanElement;
    make_top: ()=>void;
    edit_button: HTMLButtonElement;
    iframe: HTMLIFrameElement;
    ed_container: HTMLDivElement;
    editor: HTMLTextAreaElement;
    log: HTMLDivElement;
    show: () => void;
    refresh: () => void;
    is_editing: boolean;
};
const boilerplate = (''
    +'::css\n'
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
    +'  div.free > pre{\n'
    +'    font-style: italic;\n'
    +'    font-family: serif;\n'
    +'  }\n'
    +'  body {\n'
    +'    padding: 0px 2em;\n'
    +'    max-width: 40em;\n'
    +'  }\n');
function update_iframe(n:NoteWindow):void{
    let note = NOTES.get(n.id);
    if(!note){
        if(DARKMODE){
            // Chromium-based browsers won't inherit
            // the colorScheme for empty iframes,
            // so set them here.
            n.iframe.srcdoc = `<scr` + `ipt>
                document.documentElement.style.colorScheme = 'dark';
                </sc` + `ript>`;
        }
        else
            n.iframe.srcdoc = '';
        return;
    }
    let title = note.title;
    let s = title + '::title\n' + n.editor.value + '\n' + boilerplate;
    make_dnd_html(s, function(html:string, errors:Array<string>):void{
        n.log.replaceChildren();
        for(let error of errors){
          const pp = document.createElement('pre');
          pp.innerHTML = error;
          n.log.appendChild(pp);
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
                           }
                       }
                       e.preventDefault();
                       e.stopPropagation();
                       return false;
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
            n.iframe.srcdoc = html;
        }
    });
}

function make_note_window(id:number):NoteWindow{
    const w = elem('div', `notes-${id}`, 'window');
    w.classList.add('notes-window');
    const wh = elem_with_parent(w, 'div', null, 'window-handle');
    wh.oncontextmenu = function(e:MouseEvent):void{
        const menu = ctx_menu(e);
        menu.item('Show Others', function():void{
            EMIT(FromClient.NOTE_SHOW, id);
        });
        menu.item('Rename', function(e:MouseEvent):void{
            e.stopPropagation();
            e.preventDefault();
            user_edit_element(t, 0, function(v:string):void{
                EMIT(FromClient.NOTE_UPDATE_TITLE, {note_id:id, title:v});
                const note = NOTES.get(id)!;
                note.title = v;
                result.refresh();
                NOTE_TV.rename(id, v);
            });
            remove_ctx_menu();
        });
        menu.separator();
        menu.item('Delete', function():void{
            const dialog = get_dialog('note-deletion');
            if(!dialog) return;
            dialog.f.checkbox.checked = false;
            dialog.ok_handler = function():void{
                if(!dialog.f.checkbox.checked)
                    return;
                EMIT(FromClient.DELETE_NOTE_REQUEST, id);
            };
            dialog.show();
        });
        menu.separator();
        menu.item('Cancel');
        menu.install();
    }
    const x = elem_parent_text(wh, 'span', '×', null, 'window-closer');
    const t = elem_parent_text(wh, 'span', '', null, 'window-title');
    if(!IS_MOBILE)
        setup_movable_window(w, wh, WINDOWFLAGS.LOCAL_REMEMBER | WINDOWFLAGS.REMEMBER_POSITION);
    const make_top = setup_zsorted_window(w);
    const edit_button = elem_parent_text(w, 'button', 'Edit');
    const iframe = elem_with_parent(w, 'iframe');
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
    const ed_container = elem_with_parent(w, 'div', null, 'note-view-editor-container');
    ed_container.style.display = 'none';
    const editor = elem_with_parent(ed_container, 'textarea', null, 'note-view-edit');
    editor.spellcheck = false;
    editor.oninput = function():void{
        update_iframe(result);
        const note = NOTES.get(id);
        if(!note) return;
        note.body = editor.value;
        note.need_send = true;
    };
    editor.onkeydown = function(e):void{
        if(e.key == 'Escape'){
            stop_editing();
            return;
        }
        if(e.key != 'Tab')
            return;
        e.preventDefault();
        let start = editor.selectionStart;
        let end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + "  " + editor.value.substring(end);
        // restore cursor position
        editor.selectionStart = editor.selectionEnd = start+2;
    }
    const log = elem_with_parent(ed_container, 'div', null, 'note-view-editor-log');
    const result: NoteWindow = { id, w, t, make_top, edit_button, iframe, ed_container, editor, log, show:function():void{
        const note = NOTES.get(id);
        if(!note) return;
        if(note.need_receive) EMIT(FromClient.GET_NOTE, id);
        if(!w.parentNode) document.body.appendChild(w);
        w.style.display = 'grid';
        result.make_top();
        result.refresh();
    }, is_editing:false,
    refresh:function():void{
        const note = NOTES.get(id);
        if(!note) return;
        editor.value = note.body;
        t.textContent = note.title;
        if(w.parentNode) update_iframe(result);
    }};
    function sync_note():void{
        const note = NOTES.get(id);
        if(!note) return;
        if(note.need_send){
            const msg: NoteUpdateBody = {note_id:note.id, body:note.body};
            EMIT(FromClient.NOTE_UPDATE_BODY, msg);
            note.need_send = false;
        }
    }
    function stop_editing():void{
        if(!result.is_editing) return;
        result.is_editing = false;
        edit_button.textContent = 'Edit';
        ed_container.style.display = 'none';
        update_iframe(result);
        iframe.style.display = 'block';
        sync_note();

    }
    function start_editing():void{
        if(result.is_editing) return;
        result.is_editing = true;
        edit_button.textContent = 'Done';
        ed_container.style.display = 'grid';
        iframe.style.display = 'none';
    }
    edit_button.onclick = function(e:MouseEvent):void{
        e.stopPropagation();
        if(edit_button.textContent == 'Edit')
            start_editing();
        else
            stop_editing();
    }
    setup_closable_window(w, x, function():void{
        stop_editing();
        w.remove();
    });
    return result;
}
type Note_ = {
    title: string;
    body: string;
    flags: NOTEFLAGS;
    id: number;
    need_send: boolean;
    need_receive: boolean;
    parent: number;
}
const NOTES: Map<number, Note_> = new Map();
const NOTE_WINDOWS: Map<number, NoteWindow> = new Map();

function get_note_window(id:number):NoteWindow{
    let window = NOTE_WINDOWS.get(id);
    if(!window){
        window = make_note_window(id);
        NOTE_WINDOWS.set(id, window);
    }
    return window;
}

const make_dnd_html = (function():(text:string, cb:(_:string, __:Array<string>)=>void)=>void{
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
          log_string: function(p:number, len:number):void{
              let sub = memory.subarray(p, p+len);
              errors.push(decoder.decode(sub));
          },
          abort: function():void{
            throw new WebAssembly.RuntimeError;
          }
      }
    };
    let init = false;
    function initialize(text:string, cb:(_:string, __:Array<string>)=>void):void{
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
    function do_it(text:string, cb:(_:string, __:Array<string>)=>void):void{
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

document.addEventListener('DOMContentLoaded', function():void{
    function onget(n_:Note):void{
        const n: Note_ = n_ as Note_;
        n.need_receive = false;
        n.need_send = false;
        NOTES.set(n.id, n);
        const window = NOTE_WINDOWS.get(n.id);
        if(window && window.w.parentElement){
            window.refresh();
        }
        // TODO: rename li
    }
    ONRECV(ToClient.GOT_NOTE, onget);
    ONRECV(ToClient.NOTE_DIRTY, function(note_id:number):void{
        let note = NOTES.get(note_id);
        if(!note) return;
        note.need_receive = true;
        const window = NOTE_WINDOWS.get(note_id);
        if(!window) return;
        if(window.w.parentNode)
            EMIT(FromClient.GET_NOTE, note_id);
    });
    function add_note(id:number, note:Note_):void{
        NOTE_TV.add_item(note.title, id, note.parent?note.parent:null);
        NOTES.set(id, note);
    }
    ONRECV(ToClient.NOTE_DELETE, function(id:number):void{
        const note = NOTES.get(id);
        if(!note) return;
        note.flags |= NOTEFLAGS.DELETED;
        NOTE_TV.remove(id);
        const window = NOTE_WINDOWS.get(id);
        if(!window) return;
        window.w.remove();
        NOTE_WINDOWS.delete(id);
    });
    ONRECV(ToClient.NOTES_INITIALIZE, function(notes:Array<Note>):void{
        NOTE_TV.clear();
        NOTES.clear();
        for(const w of NOTE_WINDOWS.values())
            w.w.remove();
        NOTE_WINDOWS.clear();
        for(const note of (notes as Array<Note_>)){
            note.need_receive = false;
            note.need_send = false;
            add_note(note.id, note);
        }
    });
    ONRECV(ToClient.NEW_NOTE, function(msg:NewNoteMsg):void{
        const {note_id, parent} = msg;
        add_note(note_id, {flags:0, title:'Untitled', body:'', id:note_id, need_send:false, need_receive:false, parent});
    });
    ONRECV(ToClient.NEW_NOTE_RESPONSE, function(msg:NewNoteMsg):void{
        const {note_id, parent} = msg;
        add_note(note_id, {id:note_id, title:'Untitled', body:'', flags:0, need_send:false,  need_receive:false, parent});
        get_note_window(note_id).show();
    });
    by_id('new-note').addEventListener('click', function(e:MouseEvent):void{
        e.stopPropagation();
        e.preventDefault();
        EMIT(FromClient.NEW_NOTE_REQUEST, 0);
    });
    ONRECV(ToClient.NOTE_UPDATE_TITLE, function(data:NoteUpdateTitle):void{
        const note = NOTES.get(data.note_id);
        if(!note) return;
        note.title = data.title;
        const window = NOTE_WINDOWS.get(data.note_id);
        if(window) window.refresh();
        NOTE_TV.rename(data.note_id, data.title);
    });
    ONRECV(ToClient.NOTE_PARENT, function(data:NoteParentMsg):void{
        NOTE_TV.change_parent(data.note_id, data.parent?data.parent:null);
    });
    ONRECV(ToClient.NOTE_SHOW, function(noteid:number):void{
        const window = get_note_window(noteid);
        if(!window) return;
        window.show();
    });
});
}());

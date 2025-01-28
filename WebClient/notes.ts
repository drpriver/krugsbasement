//
// Copyright © 2021-2024, David Priver
//

// Don't bother trying to split notes into core vs. ui as they are their
// own self-contained thing.
// (function():void{

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
            edit_element_inline(sp, EditElementFlags.SELECT, function(v:string):void{
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
    content: HTMLDivElement;
    ed_container: HTMLDivElement;
    editor: HTMLTextAreaElement;
    show: () => void;
    refresh: () => void;
    is_editing: boolean;
};
function update_content(n:NoteWindow):void{
    let note = NOTES.get(n.id);
    if(!note){
        n.content.innerHTML = '';
        return;
    }
    const s = n.editor.value;
    md_to_html(s, function(html:string):void{
        if(html) n.content.innerHTML = html;
    });
}

function make_note_window(id:number):NoteWindow{
    const openid = `/notes/open/${id}`;
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
            edit_element_inline(t, EditElementFlags.SELECT, function(v:string):void{
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
    const content = elem_with_parent(w, 'div', null, 'note');
    const ed_container = elem_with_parent(w, 'div', null, 'note-view-editor-container');
    ed_container.style.display = 'none';
    const editor = elem_with_parent(ed_container, 'textarea', null, 'note-view-edit');
    editor.spellcheck = false;
    // editor.oninput = function():void{
        // update_content(result);
        // const note = NOTES.get(id);
        // if(!note) return;
        // note.body = editor.value;
        // note.need_send = true;
    // };
    monospace_textarea(editor, stop_editing);
    const result: NoteWindow = { id, w, t, make_top, edit_button, content, ed_container, editor, show:function():void{
        const note = NOTES.get(id);
        if(!note) return;
        if(note.need_receive) EMIT(FromClient.GET_NOTE, id);
        if(!w.parentNode) document.body.appendChild(w);
        w.style.display = 'grid';
        result.make_top();
        result.refresh();
        store_local(StorageCategory.WINDOW, openid, '1');
    }, is_editing:false,
    refresh:function():void{
        const note = NOTES.get(id);
        if(!note) return;
        editor.value = note.body;
        t.textContent = note.title;
        if(w.parentNode) update_content(result);
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
        const note = NOTES.get(id);
        if(!note) return;
        note.body = editor.value;
        note.need_send = true;
        result.is_editing = false;
        edit_button.textContent = 'Edit';
        ed_container.style.display = 'none';
        update_content(result);
        content.style.display = 'block';
        sync_note();

    }
    function start_editing():void{
        if(result.is_editing) return;
        result.is_editing = true;
        edit_button.textContent = 'Done';
        ed_container.style.display = 'grid';
        content.style.display = 'none';
        setTimeout(()=>editor.focus(), 0);
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
        store_local(StorageCategory.WINDOW, openid, '');
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
            const openid = `/notes/open/${note.id}`;
            if(get_local(StorageCategory.WINDOW, openid))
                get_note_window(note.id).show();

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
// }());

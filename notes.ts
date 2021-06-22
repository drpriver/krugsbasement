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
socket.on('new-note', function(note_id:number){
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
    edit_note_button_reset_name();
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
socket.on('note-update-title', function(data:{note_id:number, title:string}){
    update_note_title(data.note_id, data.title);
    const notetitle = document.getElementById('note-input') as HTMLTextAreaElement | undefined;
    if(notetitle)
        notetitle.value = data.title;
});
socket.on('note-update-body', function(data:{note_id:number, body:string}){
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
    title.classList.add('note-input');
    title.readOnly = true;
    title.spellcheck = false;
    title.addEventListener('input', function(){
        update_note_title(id, title.value);
        socket.emit('note-update-title', {note_id:id, title:title.value});
    });
    const noteta = document.createElement('textarea');
    noteta.id = 'note';
    noteta.classList.add('note');
    noteta.value = note.body;
    noteta.cols = 50;
    noteta.spellcheck = false;
    noteta.readOnly = true;
    noteta.addEventListener('input', function(){
        update_note_body(id, noteta.value);
        socket.emit('note-update-body', {note_id:id, body:noteta.value});
    });
    right.appendChild(title);
    right.appendChild(noteta);
    right.style.display = 'flex';
    edit_note_button_reset_name();
    resize_canvas();
    title.style.width = noteta.getBoundingClientRect().width + 'px';
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
function edit_note_button_reset_name(){
    const edit_note_button = document.getElementById('edit-note-button')! as HTMLButtonElement;
    edit_note_button.innerText = INITIAL_EDIT_NOTE_BUTTON_TEXT;
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
socket.on('note-delete', function(note_id:number){
    delete_note_by_id(note_id);
});
socket.on('notes-initialize', function(notes:Array<{id:number, flags:NOTEFLAGS, title:string, body:string}>){
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
let INITIAL_EDIT_NOTE_BUTTON_TEXT = "Edit Note";
document.addEventListener('DOMContentLoaded', function(){
    const new_note_button = document.getElementById('new-note-button')! as HTMLButtonElement;
    const edit_note_button = document.getElementById('edit-note-button')! as HTMLButtonElement;
    const delete_note_button = document.getElementById('delete-note-button')! as HTMLButtonElement;
    const hide_notes_button = document.getElementById('hide-notes-button')! as HTMLButtonElement;
    INITIAL_EDIT_NOTE_BUTTON_TEXT = edit_note_button.innerText;
    edit_note_button.addEventListener('click', function(){
        const note = document.getElementById('note') as HTMLTextAreaElement | undefined;
        if(!note)
            return;
        const title = document.getElementById('note-input')! as HTMLTextAreaElement;
        note.readOnly = !note.readOnly;
        title.readOnly = note.readOnly;
        if(!note.readOnly){
            note.focus();
            edit_note_button.innerText = 'Stop Editing Note';
        }
        else
            edit_note_button_reset_name();
    });
    const notes_selection = document.getElementById('current-note-name')! as HTMLSelectElement;
    set_existing_notes();
    notes_selection.addEventListener('input', function(e:Event){
        e.stopPropagation();
        show_note_by_id(+notes_selection.value);
        notes_selection.blur();
    });
    new_note_button.addEventListener('click', function(){
        let id: number;
        socket.emit('new-note-request', function(new_id:number){
            id = new_id;
            add_note(id, {title:"Untitled Note", body:"", flags:0});
            show_note_by_id(id);
            edit_note_button.click();
        });
    });
    delete_note_button.addEventListener('click', function(){
        socket.emit('delete-note-request', CURRENT_NOTE_ID);
    });
    hide_notes_button.addEventListener('click', function(){
        hide_notes();
    });
});

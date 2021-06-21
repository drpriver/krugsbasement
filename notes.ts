// Maybe this should be ints so that notes can be renamed without
// breaking anything that references it.
type Note = {
    title: string;
    body: string;
}
const NOTES: Map<number, Note> = new Map();
// We need this so we can update the option's text when the note's title changes.
const NOTE_ID_TO_OPTION: Map<number, HTMLOptionElement> = new Map();
function add_note(id:number, note:Note){
    NOTES.set(id, note);
    const notes_selection = document.getElementById('current-note-name')! as HTMLSelectElement;
    add_note_option(notes_selection, note.title, id);
}
function add_note_option(notes_selection:HTMLSelectElement, name:string, id:number){
    const option = document.createElement('option');
    option.innerText = name;
    option.value = `${id}`; // hack!
    notes_selection.options.add(option);
}
NOTES.set(1, {title:'Hello!', body:`This is some text.
Behold how texty it is.
So much text.
`});
function hide_notes(){
    edit_note_button_reset_name();
    const right = document.getElementById('right-split')! as HTMLDivElement;
    (right as any).replaceChildren();
    right.style.display = 'none';
    resize_canvas();
}
function show_note_text(id:number, note_:Note){
    const note_name = note_.title;
    const note_text = note_.body;
    const right = document.getElementById('right-split')! as HTMLDivElement;
    // Delete anything that's currently in there.
    (right as any).replaceChildren();
    const title = document.createElement('input');
    title.type = 'text';
    title.value = note_name;
    title.size = 80;
    title.classList.add('note-input');
    title.readOnly = true;
    title.spellcheck = false;
    const note = document.createElement('textarea');
    note.classList.add('note');
    note.value = note_text;
    note.cols = 80;
    note.spellcheck = false;
    note.readOnly = true;
    note.addEventListener('input', function(){
        NOTES.set(id, {title:note_name, body:note.value});
    });
    right.appendChild(title);
    right.appendChild(note);
    right.style.display = 'initial';
    edit_note_button_reset_name();
    resize_canvas();
}
function show_note_by_id(note_id:number){
    const note = NOTES.get(note_id);
    if(!note){
        //TODO
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
}
function edit_note_button_reset_name(){
    const edit_note_button = document.getElementById('edit-note-button')! as HTMLButtonElement;
    edit_note_button.innerText = INITIAL_EDIT_NOTE_BUTTON_TEXT;
}
let INITIAL_EDIT_NOTE_BUTTON_TEXT = "Edit Note";
document.addEventListener('DOMContentLoaded', function(){
    const new_note_button = document.getElementById('new-note-button')! as HTMLButtonElement;
    const edit_note_button = document.getElementById('edit-note-button')! as HTMLButtonElement;
    const delete_note_button = document.getElementById('delete-note-button')! as HTMLButtonElement;
    INITIAL_EDIT_NOTE_BUTTON_TEXT = edit_note_button.innerText;
    edit_note_button.addEventListener('click', function(){
        const notes = document.getElementsByClassName('note');
        if(notes.length != 1)
            return;
        const note = notes[0] as HTMLTextAreaElement;
        const title = document.getElementsByClassName('note-input')![0]! as HTMLInputElement;
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
    // populate the initial notes
    for(let [id, note] of NOTES.entries()){
        add_note_option(notes_selection, note.title, id);
    }
    notes_selection.addEventListener('input', function(e:Event){
        e.stopPropagation();
        show_note_by_id(+notes_selection.value);
        notes_selection.blur();
    });
    new_note_button.addEventListener('click', function(){
        let id = 3;
        add_note(id, {title:"Untitled Note", body:""});
        show_note_by_id(id);
        edit_note_button.click();
    });
    delete_note_button.addEventListener('click', function(){

    });
});

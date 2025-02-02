//
// Copyright © 2025-2025, David Priver
//

const enum EditElementFlags {
    NONE    = 0,
    // For elements that can be focused, focus that element
    // after editing is finished.
    REFOCUS = 1 << 0,
    // Force input to be a number.
    NUMBER  = 1 << 1,
    // Initially select the text when starting the edit.
    SELECT  = 1 << 2,
};


function edit_element_inline(cell:HTMLElement, flags:EditElementFlags, onfinish:(txt:string)=>void):void{
    const w = '' + (cell.getBoundingClientRect().width-2) + 'px';
    let hpx = cell.getBoundingClientRect().height-2;
    let h = '' + hpx + 'px';
    let oldtxt = cell.textContent;
    if(!oldtxt) oldtxt = '';
    cell.textContent = '';
    cell.classList.add('editing');
    const inp = elem_with_parent(cell, 'input');
    inp.style.width = w;
    inp.style.height = h;
    inp.value = oldtxt;
    let canceled = false;
    if(flags & EditElementFlags.SELECT)
        inp.onfocus = function(e):void{
            inp.select();
        };
    inp.onclick = function(e):void{
        e.stopPropagation();
    }
    inp.onkeydown = function(e):void{
        e.stopPropagation();
        switch(e.key){
            case ' ':
                // Workaround for bug in at least Safari where buttons activate
                // on space when input is focused, even though the event doesn't
                // propagate.
                if(cell.tagName == 'BUTTON'){
                    e.stopPropagation();
                    e.preventDefault();
                    // Insert a space without a keydown.
                    document.execCommand('insertText', false, ' ');
                }break;
            case 'Escape':
                remove_ctx_menu();
                canceled = true;
                e.preventDefault();
                inp.blur();
                return;
            case 'Enter':{
                e.preventDefault();
                inp.blur();
            }return;
        }
    };
    setTimeout(()=>{
    inp.onblur = function():void{
        let v = inp.value.trim();
        if(canceled)
            cell.textContent = oldtxt;
        else{
            if(flags & EditElementFlags.NUMBER){
                if(!v || Number.isNaN(+v))
                    v = oldtxt!;
            }
            cell.textContent = v;
            if(oldtxt != v)
                onfinish(v);
        }
        inp.remove();
        cell.classList.remove('editing');
        if(flags & EditElementFlags.REFOCUS)
            cell.focus();
    };}, 0);
    setTimeout(()=> inp.focus(), 0);
}


function md_edit_element(element: HTMLElement, mdtxt:string, onfinish:(newmdtxt:string)=>void):void{
    const w = '' + (element.getBoundingClientRect().width) + 'px';
    let hpx = element.getBoundingClientRect().height;
    let h = '' + hpx + 'px';
    element.textContent = '';
    element.classList.add('editing');
    const ta = elem_with_parent(element, 'textarea');
    ta.value = mdtxt;
    ta.onclick = function(e):void{
        e.stopPropagation();
    }
    ta.style.width = w;
    ta.style.height = h;
    monospace_textarea(ta, null);
    ta.onblur = function(){
        let txt = ta.value.trim();
        onfinish(txt);
        md_to_html(txt, function(s:string){ element.innerHTML = s; });
        ta.remove();
    };
    setTimeout(()=>ta.focus(), 0);
}

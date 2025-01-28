//
// Copyright © 2021-2025, David Priver
//

function elem_with_text<K extends keyof HTMLElementTagNameMap>(tag: K, content:string, id?:string|null, class_?:string|null): HTMLElementTagNameMap[K]{
    const el = document.createElement(tag);
    el.appendChild(document.createTextNode(content));
    if(id)
        el.id = id;
    if(class_)
        el.classList.add(class_);
    return el;
}

function elem<K extends keyof HTMLElementTagNameMap>(tag: K, id?:string|null, class_?:string|null): HTMLElementTagNameMap[K]{
    const el = document.createElement(tag);
    if(id)
        el.id = id;
    if(class_)
        el.classList.add(class_);
    return el;
}

function elem_with_parent<K extends keyof HTMLElementTagNameMap>(parent:HTMLElement, tag: K, id?:string|null, class_?:string|null): HTMLElementTagNameMap[K]{
    const el = document.createElement(tag);
    if(id)
        el.id = id;
    if(class_)
        el.classList.add(class_);
    parent.appendChild(el);
    return el;
}

function elem_parent_text<K extends keyof HTMLElementTagNameMap>(parent:HTMLElement, tag:K, text:string, id?:string|null, class_?:string|null):HTMLElementTagNameMap[K]{
    const el = document.createElement(tag);
    if(id) el.id = id;
    if(class_) el.classList.add(class_);
    el.appendChild(document.createTextNode(text));
    parent.appendChild(el);
    return el;
}

// FIXME: this infinitely grows, which is ok as zindex is limited to
// 2**32-1 or something like that, but is still kind of gross, you know?
let TOPPERMOST_Z = 3;
function setup_zsorted_window(win:HTMLDivElement):()=>void{
    win.addEventListener('pointerdown', function():void{
        make_top();
    });
    function make_top():void{
        let z = +win.style.zIndex;
        if(z < TOPPERMOST_Z){
            TOPPERMOST_Z++;
            win.style.zIndex = ""+TOPPERMOST_Z;
        }
    }
    return make_top;
}

const enum WINDOWFLAGS {
    NONE = 1 << 0,
    REMEMBER_POSITION = 1 << 1,
    LOCAL_REMEMBER = 1 << 2,
}
function setup_movable_window(win:HTMLDivElement, handle:HTMLDivElement, flags: WINDOWFLAGS):void{
    let dragging = false;
    let x = 0;
    let y = 0;
    let xorg = 0;
    let yorg = 0;

    // To prevent spamming the localStorage, uses this to debounce.
    let save_in_flight = false;
    let save_position = function(x:number, y:number):void{};
    if(flags &  WINDOWFLAGS.REMEMBER_POSITION){
        save_position = function (x:number, y:number):void{
            x = 100*x/window.innerWidth;
            y = 100*y/window.innerHeight;
            if(save_in_flight) return;
            save_in_flight = true;
            setTimeout(function():void{
                if(flags & WINDOWFLAGS.LOCAL_REMEMBER)
                    store_local(StorageCategory.WINDOW, win.id, [x+'%', y+'%']);
                else
                    store_global(StorageCategory.WINDOW, win.id, [x+'%', y+'%']);
                save_in_flight = false;
            }, 100);
        }
    }
    let old_pos;
    if(flags & WINDOWFLAGS.LOCAL_REMEMBER)
        old_pos = get_local(StorageCategory.WINDOW, win.id);
    else
        old_pos = get_global(StorageCategory.WINDOW, win.id);
    if(old_pos !== undefined){
        const [old_x, old_y] = old_pos;
        if(typeof old_x === 'string'){
            win.style.left = old_x;
            win.style.top = old_y;
        }
        else {
            win.style.top = 100*old_y/window.innerHeight + '%';
            win.style.left = 100*old_x/window.innerWidth + '%';
        }
        win.style.bottom = 'initial';
        win.style.right = 'initial';
    }
    handle.addEventListener('pointerdown', function(e:PointerEvent):void{
        if(e.target !== handle)
            return;
        handle.setPointerCapture(e.pointerId);
        dragging = true;
        handle.style.cursor = 'grabbing';
        let r = win.getBoundingClientRect();
        win.style.top = 100*r.top/window.innerHeight + '%';
        win.style.left = 100*r.left/window.innerWidth + '%';
        x = e.screenX;
        y = e.screenY;
        xorg = r.left;
        yorg = r.top;
        win.style.bottom = 'initial';
        win.style.right = 'initial';
        handle.addEventListener('pointermove', pointermove);
        handle.addEventListener('pointerup', endmove);
    });
    function endmove(e:PointerEvent):void{
        handle.removeEventListener('pointermove', pointermove);
        handle.removeEventListener('pointerup', endmove);
        handle.style.cursor = 'grab';
        dragging = false;
        let r = win.getBoundingClientRect();
        save_position(r.left, r.top);
    }
    function pointermove(e:PointerEvent):void{
        if(!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        let xdiff = e.screenX - x;
        let ydiff = e.screenY - y;
        let newy = yorg + ydiff;
        let newx = xorg + xdiff;
        let r = win.getBoundingClientRect();
        let xmarg = r.width;
        let ymarg = r.height;
        // let xmarg = IS_TOUCH?r.width:(r.width > 128? 128: r.width);
        // let ymarg = IS_TOUCH?r.height:(r.height > 128? 128: r.height);
        if(newx + xmarg > window.innerWidth)
            newx = window.innerWidth - xmarg;
        if(newy + ymarg > window.innerHeight)
            newy = window.innerHeight - ymarg;
        if(newy < 0) newy = 0;
        if(newx < 0) newx = 0;
        win.style.top = 100*newy/window.innerHeight + '%';
        win.style.left = 100*newx/window.innerWidth + '%';
        xorg += xdiff;
        yorg += ydiff;
        x = e.screenX;
        y = e.screenY;
    }
}
// I could have sworn that checking for "Windows" used to work?
// But now it seems things are reporting "Win32"?.
const IS_WINDOWS = window.navigator.platform.includes('Windows') || window.navigator.platform.includes('Win32');
const IS_MAC = window.navigator.platform.includes('Mac');

function setup_closable_window(win:HTMLElement, closer:HTMLElement, onclose:()=>void):void{
    if(IS_WINDOWS)
        closer.style.gridColumn = '3';
    else
        closer.style.gridColumn = '1';
    function hide_window(e:MouseEvent):void{
        e.preventDefault();
        e.stopPropagation();
        onclose();
        win.style.display='none';
    }
    closer.addEventListener('click', hide_window);
    closer.title = 'Close';
}

function setup_window_size(win:HTMLElement):void{
    if (window.innerWidth > 1200)
        win.style.width = '1000px';
    else if(window.innerWidth > 800)
        win.style.width = '800px';
    else
        win.style.width = '400px';
    if(window.innerHeight > 600)
        win.style.height = '600px';
    else
        win.style.height = '300px';
}

function ensure_window_is_completely_on_screen(win:HTMLElement):void{
    let r = win.getBoundingClientRect();
    let newx = r.left;
    let newy = r.top;
    let xmarg = r.width;
    let ymarg = r.height;
    if(newx + xmarg > window.innerWidth)
        newx = window.innerWidth - xmarg;
    if(newy + ymarg > window.innerHeight)
        newy = window.innerHeight - ymarg;
    if(newy < 0) newy = 0;
    if(newx < 0) newx = 0;
    win.style.top = 100*newy/window.innerHeight + '%';
    win.style.left = 100*newx/window.innerWidth + '%';
}

// This function is for when you need a dynamic element with a dynamic
// id, but you know the type of the element.
// If the name of the element is known at compiletime, use the generated
// `by_id` function instead. It knows about all of the ids in the document.
function get_by_id<T extends HTMLElement >(id:string):T{
    const result = document.getElementById(id) as T;
    return result;
}

// This gives a compile error if you pass anything to it, with the compile
// error revealing what the type of the argument is.
function reveal_type(x:never):void{
}

function center_element(el:HTMLElement):void{
    el.style.top = ''+(window.innerHeight - el.offsetHeight)/2 + 'px';
    el.style.left = ''+(window.innerWidth - el.offsetWidth)/2 + 'px';
}

function radio_to_value<T>(radios:Array<HTMLInputElement>, values:Array<T>):T{
    for(let i = 0; i < radios.length; i++){
        if(radios[i].checked) return values[i];
    }
    return values[0];
}


function link_input_value(value:string, inp1:HTMLInputElement, event1:'onchange' | 'oninput', inp2:HTMLInputElement, event2: 'onchange' | 'oninput', cb?:()=>void):void{
    inp1.value = value;
    inp2.value = value;
    inp1[event1] = function():void{
        inp2.value = inp1.value;
        if(cb) cb();
    };
    inp2[event2] = function():void{
        inp1.value = inp2.value;
        if(cb) cb();
    };
}

const enum UserEditElementFlags {
    NONE = 0,
    ALWAYS_REFOCUS = 1 << 0,
    MUST_BE_NUMBER = 1 << 1,
}

function user_edit_element(cell:HTMLElement, flags:UserEditElementFlags, onfinish:(txt:string)=>void):void{
    const w = '' + (cell.getBoundingClientRect().width-2) + 'px';
    const h = '' + (cell.getBoundingClientRect().height-2) + 'px';
    let oldtxt = cell.textContent;
    if(!oldtxt) oldtxt = '';
    cell.textContent = '';
    cell.classList.add('editing');
    const inp = elem_with_parent(cell, 'input');
    inp.style.width = w;
    inp.style.height = h;
    inp.value = oldtxt;
    let canceled = false;
    inp.onclick = function(e):void{
      e.stopPropagation();
    }
    inp.onkeydown = function(e):void{
        e.stopPropagation();
        switch(e.key){
            // @ts-ignore
            case 'Escape':
                remove_ctx_menu();
                canceled = true;
            // fall-through
            case 'Enter':{
                e.preventDefault();
                inp.blur();
            }return;
        }
    };
    inp.onblur = function():void{
        let v = inp.value.trim();
        if(canceled)
            cell.textContent = oldtxt;
        else{
            if(flags & UserEditElementFlags.MUST_BE_NUMBER){
                if(!v || Number.isNaN(+v))
                    v = oldtxt!;
            }
            cell.textContent = v;
            if(oldtxt != v)
                onfinish(v);
        }
        inp.remove();
        cell.classList.remove('editing');
        if(flags & UserEditElementFlags.ALWAYS_REFOCUS)
            cell.focus();
    };
    inp.focus();
}

function monospace_textarea(ta:HTMLTextAreaElement, blur:null|(()=>void)):void{
    ta.onkeydown = function(e):void{
        // NOTE: document.execCommand is deprecated,
        // but there is no alternative if you want to integrate
        // with the browser's undo stack.
        const ctrl = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
        const shift = e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey;
        const mod = e.ctrlKey || e.shiftKey || e.altKey || e.metaKey;
        if(e.key == 'Escape' && !mod){
            if(blur) blur()
            else ta.blur();
            return;
        }
        else if(e.key == 'Tab'){
          if(shift) {
            e.preventDefault();
            if(ta.selectionStart != ta.selectionEnd) return;
            let start = ta.selectionStart;
            if(start > 1){
              if(ta.value.substring(start-2, start) == '  '){
                document.execCommand('delete', false);
                document.execCommand('delete', false);
              }
            }
            return;
          }
          if(!mod) {
            e.preventDefault();
            document.execCommand('insertText', false, '  ');
            return;
          }
          return;
        }
        else if((e.key == 'Backspace' && !mod) || (ctrl && e.key == 'h')){
          if(ta.selectionStart != ta.selectionEnd) return;
          let start = ta.selectionStart;
          if(start > 1){
            if(ta.value.substring(start-2, start) == '  '){
              e.preventDefault();
              document.execCommand('delete', false);
              document.execCommand('delete', false);
              return;
            }
          }
        }
        else if(e.key == 'Enter' && !mod){
          if(ta.selectionStart != ta.selectionEnd) return;
          let indent = 0;
          let i = ta.selectionStart;
          let v = ta.value;
          while(i && v[i] != '\n') i--;
          if(i != ta.selectionStart) i++;
          while(v[i] == ' '){ i++; indent++;}
          if(!indent) return;
          document.execCommand('insertText', false, '\n' + ' '.repeat(indent));
          e.preventDefault();
          return;
        }
    };
}

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
    NONE = 0,
    // NOTE: both remembers are just stored in LocalStorage.
    // When we talk about local we mean scoped to a particular campaign.

    // Remember position (shared)
    REMEMBER_POSITION = 1 << 0,
    // Remember position for this campaign
    // Requires REMEMBER_POSITION
    LOCAL = 1 << 1,
    LOCAL_REMEMBER = LOCAL|REMEMBER_POSITION,
    GLOBAL_REMEMBER = REMEMBER_POSITION,
};



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
                if(flags & WINDOWFLAGS.LOCAL)
                    store_local(StorageCategory.WINDOW, win.id, [x+'%', y+'%']);
                else
                    store_global(StorageCategory.WINDOW, win.id, [x+'%', y+'%']);
                save_in_flight = false;
            }, 100);
        }
    }
    let old_pos;
    if(flags & WINDOWFLAGS.LOCAL)
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
const enum RESIZEFLAGS {
  NONE = 0,
  REMEMBER = 1 << 0,
  LOCAL = 1 << 1,
  GLOBAL_REMEMBER = REMEMBER,
  LOCAL_REMEMBER = REMEMBER | LOCAL,
};
function setup_resizable_window(win:HTMLDivElement, flags: RESIZEFLAGS):void{
    const storeid = `${win.id}/winsz`;
    win.style.resize = 'both';
    win.style.overflow = 'scroll';
    // space for resize handle
    if(IS_SAFARI) win.style.paddingBottom = '12px';
    let wants_store_dimensions = false;
    if(flags & RESIZEFLAGS.REMEMBER){
      const sz = (flags & RESIZEFLAGS.LOCAL)?get_local(StorageCategory.WINDOW, storeid): get_global(StorageCategory.WINDOW, storeid);
      if(sz){
        try {
          const [w, h] = sz;
          if(w>100 && w < window.innerWidth)
            win.style.width = ''+w+'px';
          if(h>100 && h < window.innerHeight)
            win.style.height = ''+h+'px';
        }
        catch(e){
        }
      }
      new ResizeObserver(function(){
        if(wants_store_dimensions) return;
        wants_store_dimensions = true;
        setTimeout(()=>{
          wants_store_dimensions = false;
          if(!win.offsetWidth || !win.offsetHeight) return;
          const sz = [win.offsetWidth, win.offsetHeight];
          if(flags & RESIZEFLAGS.LOCAL)
            store_local(StorageCategory.WINDOW, storeid, sz);
          else
            store_global(StorageCategory.WINDOW, storeid, sz);
        }, 500);
      }).observe(win);
    }
}
// I could have sworn that checking for "Windows" used to work?
// But now it seems things are reporting "Win32"?.
const IS_WINDOWS = window.navigator.platform.includes('Windows') || window.navigator.platform.includes('Win32');
const IS_MAC = window.navigator.platform.includes('Mac');

function setup_closable_window(win:HTMLElement, closer:HTMLElement, onclose:()=>void):void{
    if(IS_WINDOWS)
        closer.style.gridColumn = '5';
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
function setup_minimizable_window(win:HTMLElement, titlebar:HTMLElement, minimizer:HTMLElement, onmin:()=>void, onrestore:()=>void, make_top:(()=>void)|null, close:(()=>void)|null):[()=>void, ()=>void, ()=>void]{
    if(IS_WINDOWS)
        minimizer.style.gridColumn = '4';
    else
        minimizer.style.gridColumn = '2';

    let minimized = false;
    let restorer : HTMLElement|null = null;
    function remove():void{
        if(restorer) {restorer.remove(); restorer = null;}
    }
    function restore():void{
        if(!minimized) return;
        remove();
        minimized = false;
        win.classList.remove('minimized');
        if(make_top) make_top();
        onrestore();
    }
    function minimize():void{
        if(minimized) return;
        win.classList.add('minimized');
        minimized = true;
        restorer = elem_parent_text(by_id('minimized'), 'span', titlebar.textContent+' □');
        restorer.onclick = function(e:MouseEvent):void{
            e.preventDefault();
            e.stopPropagation();
            restore();
        }
        restorer.oncontextmenu = function(e:MouseEvent):void{
            const menu = ctx_menu(e);
            menu.item('Restore', restore);
            menu.item('Close', function(){
                if(close) close();
                remove();
            }, close == null);
            menu.separator();
            menu.canceller();
            menu.install();
        }
        onmin();
    }
    minimizer.onclick = function(e:MouseEvent):void{
        e.preventDefault();
        e.stopPropagation();
        minimize();
    };
    return [minimize, restore, remove];
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

const enum WinState {
    NONE,
    CLOSED,
    OPEN,
    MINIMIZED,
};
const enum NormalWindow {
    LOCAL = 0,
    GLOBAL = 1,
}
type Win = {
    win: HTMLDivElement;
    wh: HTMLSpanElement;
    x: HTMLSpanElement;
    m: HTMLSpanElement;
    t: HTMLSpanElement;

    state: WinState;

    close: ()=>void;
    show: ()=>void;
    minimize: ()=>void;
    restore: ()=>void;
    make_top: ()=>void;

    restore_handler?: ()=>void;
    minimize_handler?: ()=>void;
    show_handler?: ()=>void;
    close_handler?: ()=>void;
    wh_ctxmenu_handler?: (m:CtxMenu) => void;
}
function normal_window(win:HTMLDivElement, wh:HTMLDivElement, x:HTMLSpanElement, m:HTMLSpanElement, t:HTMLSpanElement, global_window:NormalWindow){
    x.title = 'Close';
    x.onclick = function(e:MouseEvent):void{
        e.stopPropagation();
        e.preventDefault();
        result.close();
    };
    m.title = 'Minimize';
    m.onclick = function(e:MouseEvent):void{
        e.stopPropagation();
        e.preventDefault();
        result.minimize();
    };
    if(IS_WINDOWS){
        m.style.gridColumn = '4';
        x.style.gridColumn = '5';
    }
    else {
        m.style.gridColumn = '2';
        x.style.gridColumn = '1';
    }
    const restorer = elem('span');
    restorer.onclick = function(e:MouseEvent):void{
        e.preventDefault();
        e.stopPropagation();
        result.restore();
    };
    restorer.oncontextmenu = function(e:MouseEvent):void{
        const menu = ctx_menu(e);
        menu.item('Restore', result.restore);
        menu.item('Close', result.close);
        menu.separator();
        menu.canceller();
        menu.install();
    };
    wh.oncontextmenu = function(e:MouseEvent):void{
        const menu = ctx_menu(e);
        if(result.wh_ctxmenu_handler) result.wh_ctxmenu_handler(menu);
        menu.item('Close', result.close);
        menu.item('Minimize', result.minimize);
        menu.separator();
        menu.canceller();
        menu.install();
    };
    wh.ondblclick = function(e:MouseEvent):void{
        e.stopPropagation();
        e.preventDefault();
        result.minimize();
    };
    const result: Win = {
        win, wh, x, m, t,
        close: function():void{
            if(result.state == WinState.CLOSED)
                return;
            if(result.state == WinState.MINIMIZED)
                restorer.remove();
            result.state = WinState.CLOSED;
            result.win.style.display = 'none';
            if(result.close_handler) result.close_handler();
        },
        show: function(): void{
            if(result.state == WinState.OPEN)
                return;
            if(result.state == WinState.MINIMIZED){
                result.restore();
                return;
            }
            if(result.state == WinState.NONE)
                document.body.append(result.win);
            result.state = WinState.OPEN;
            result.win.style.display = 'grid';
            result.make_top();
            ensure_window_is_completely_on_screen(result.win);
            if(result.show_handler) result.show_handler();
        },
        minimize: function(): void{
            if(result.state != WinState.OPEN) return;
            restorer.textContent = result.t.textContent +' □';
            by_id('minimized').append(restorer);
            result.win.style.display = 'none';
            result.state = WinState.MINIMIZED;
            if(result.minimize_handler) result.minimize_handler();
        },
        restore: function():void {
            if(result.state != WinState.MINIMIZED) return;
            restorer.remove();
            result.win.style.display = 'grid';
            result.state = WinState.OPEN;
            result.make_top();
            if(result.restore_handler) result.restore_handler();
        },
        make_top: function():void{ },
        state: WinState.NONE,
    };
    result.make_top = setup_zsorted_window(win);
    let wf = !win.id? WINDOWFLAGS.NONE: global_window?WINDOWFLAGS.GLOBAL_REMEMBER:WINDOWFLAGS.LOCAL_REMEMBER;
    let rf = !win.id?RESIZEFLAGS.NONE:global_window?RESIZEFLAGS.GLOBAL_REMEMBER:RESIZEFLAGS.LOCAL_REMEMBER;
    setup_movable_window(win, wh, wf);
    setup_resizable_window(win, rf);

    return result;
}

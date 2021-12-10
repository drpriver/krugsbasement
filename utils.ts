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

let hover_is_open = false;
function make_ok_dialog(html:string, on_ok:(_:HTMLElement)=>void){
    make_ok_dialog2(html, function(){}, on_ok);
}
function make_ok_dialog2(html:string, after_append:()=>void, on_ok:(_:HTMLElement)=>void){
    if(hover_is_open)
        return;
    hover_is_open = true;
    const hoverpop = document.createElement('section');
    hoverpop.classList.add('hover');
    html += `
        <div class="hover-button-container">
            <button type="button" id="hoverpop-ok">Ok</button>
            <button type="button" id="hoverpop-cancel">Cancel</button>
        </div>
        `;
    hoverpop.innerHTML = html;
    document.body.appendChild(hoverpop);
    after_append();
    function remove_hoverpop(){
        document.body.removeChild(hoverpop);
        hover_is_open = false;
    }
    const ok = by_id('hoverpop-ok')!;
    function submit(){
        on_ok(hoverpop);
        remove_hoverpop();
    }
    ok.addEventListener('click', function(){
        submit();
    });
    const cancel = by_id('hoverpop-cancel')!;
    cancel.addEventListener('click', function(){
        remove_hoverpop();
    });
    const text_inputs = hoverpop.getElementsByTagName('input');
    let did_focus = false;
    for(let i = 0; i < text_inputs.length; i++){
        const text_input = text_inputs[i];
        if(text_input.type == 'text' || text_input.type == 'url'){
            if(!did_focus){
                text_input.focus();
                did_focus = true;
            }
            text_input.addEventListener('keydown', function(e){
                let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
                if(!modified && e.key == "Enter"){
                    e.preventDefault();
                    e.stopPropagation();
                    ok.click();
                }
            });
        }
    }
    const text_areas = hoverpop.getElementsByTagName('textarea');
    for(let ta of text_areas){
        if(!did_focus){
            ta.focus();
            did_focus = true;
        }
    }
}


// FIXME: this infinitely grows, which is ok as zindex is limited to
// 2**32-1 or something like that, but is still kind of gross, you know?
let TOPPERMOST_Z = 3;
function setup_zsorted_window(win:HTMLDivElement):()=>void{
    win.addEventListener('pointerdown', function(){
        make_top();
    });
    function make_top(){
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
}
function setup_movable_window(win:HTMLDivElement, handle:HTMLDivElement, flags: WINDOWFLAGS){
    let dragging = false;
    let x = 0;
    let y = 0;
    let xorg = 0;
    let yorg = 0;
    let save_in_flight = false;
    let save_position = function(x:number, y:number){};
    if(flags &  WINDOWFLAGS.REMEMBER_POSITION){
        save_position = function (x:number, y:number){
            if(save_in_flight) return;
            save_in_flight = true;
            setTimeout(function(){
                store_global(StorageCategory.WINDOW, win.id, [x, y]);
                save_in_flight = false;
            }, 100);
        }
    }
    let old_pos = get_global(StorageCategory.WINDOW, win.id);
    if(old_pos !== undefined){
        const [old_x, old_y] = old_pos;
        win.style.top = old_y + 'px';
        win.style.left = old_x + 'px';
        win.style.bottom = 'initial';
        win.style.right = 'initial';
    }
    // win.style.border = '1px solid black';
    handle.addEventListener('pointerdown', function(e:PointerEvent){
        if(e.target !== handle)
            return;
        dragging = true;
        handle.style.cursor = 'grabbing';
        let r = win.getBoundingClientRect();
        win.style.top = r.top + 'px';
        win.style.left = r.left + 'px';
        x = e.screenX;
        y = e.screenY;
        xorg = r.left;
        yorg = r.top;
        win.style.bottom = 'initial';
        win.style.right = 'initial';
        window.addEventListener('pointermove', pointermove);
        window.addEventListener('pointerleave', endmove);
        window.addEventListener('pointerup', endmove);
    });
    function endmove(e:PointerEvent){
        window.removeEventListener('pointermove', pointermove);
        window.removeEventListener('pointerleave', endmove);
        window.removeEventListener('pointerup', endmove);
        handle.style.cursor = 'grab';
        dragging = false;
        let r = win.getBoundingClientRect();
        save_position(r.left, r.top);
    }
    function pointermove(e:PointerEvent){
        if(!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        let xdiff = e.screenX - x;
        let ydiff = e.screenY - y;
        let newy = yorg + ydiff;
        let newx = xorg + xdiff;
        let r = win.getBoundingClientRect();
        let xmarg = r.width > 128? 128: r.width;
        let ymarg = r.height > 128? 128: r.height;
        if(newx + xmarg > window.innerWidth)
            newx = window.innerWidth - xmarg;
        if(newy + ymarg > window.innerHeight)
            newy = window.innerHeight - ymarg;
        if(newy < 0) newy = 0;
        if(newx < 0) newx = 0;
        win.style.top = newy + 'px';
        win.style.left = newx + 'px';
        r = win.getBoundingClientRect();
        xorg = r.left;
        yorg = r.top;
        x = e.screenX;
        y = e.screenY;
    }
}

function setup_closable_window(win:HTMLElement, closer:HTMLElement, onclose:()=>void){
    if(window.navigator.platform.includes('Windows')){
        closer.style.marginLeft = 'auto';
    }
    closer.addEventListener('click', hide_window);
    function hide_window(e:MouseEvent){
        e.preventDefault();
        e.stopPropagation();
        onclose();
        win.style.display='none';
    }
}

function setup_window_size(win:HTMLElement){
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

function ensure_window_is_completely_on_screen(win:HTMLElement){
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
    win.style.top = newy + 'px';
    win.style.left = newx + 'px';
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
function reveal_type(x:never){
}

function center_element(el:HTMLElement){
    el.style.top = ''+(window.innerHeight - el.offsetHeight)/2 + 'px';
    el.style.left = ''+(window.innerWidth - el.offsetWidth)/2 + 'px';
}

function radio_to_value<T>(radios:Array<HTMLInputElement>, values:Array<T>):T{
    for(let i = 0; i < radios.length; i++){
        if(radios[i].checked) return values[i];
    }
    return values[0];
}

// This stuff should really be in dialogs.ts, but that file is generated.
// Maybe I could generate a dialogsdefs.ts or something and have dialogs.ts
// for these handwritten things? idk.
type Dialog<Key extends keyof DialogIdMap> = {
    // the fields
    f: DialogIdMap[Key];
    title: HTMLHeadingElement;
    close: HTMLSpanElement;
    ok: HTMLButtonElement;
    cancel: HTMLButtonElement;
    ok_handler?: ()=>void;
    cancel_handler?: ()=>void;
    show_handler?: ()=>void;
    hide_handler?: ()=>void;
    hidden: boolean;
    show: ()=>void;
    hide: ()=>void;
    clear_handlers: ()=>void;
    window: HTMLDivElement;
    windowhandle: HTMLDivElement;
    make_top: ()=>void;
}


let OPENDIALOG: Dialog<keyof DialogIdMap> | null;
function make_dialog<Key extends keyof DialogIdMap>(name:Key, fields: Array<string>):Dialog<Key>{
    // this is kind of a hack, but I don't know how to do imperative
    // initialization while satisfying ts.
    let result:Dialog<Key> = {
        window: get_by_id<HTMLDivElement>(name),
        windowhandle: get_by_id<HTMLDivElement>(name+'-window-handle'),
        close: get_by_id<HTMLSpanElement>(name+'-window-close'),
        hidden: true,
        ok: get_by_id<HTMLButtonElement>(name+'-ok'),
        cancel: get_by_id<HTMLButtonElement>(name+'-cancel'),
        title: get_by_id<HTMLHeadingElement>(name+'-title'),
        f: {},
    } as Dialog<Key>;
    let f: any = result.f as any;
    result.window.style.position = 'fixed';
    result.window.style.transform = 'none';
    setup_movable_window(result.window, result.windowhandle, WINDOWFLAGS.NONE);
    result.make_top = setup_zsorted_window(result.window);
    // The caller of this function should be generated, so this is safe,
    // despite being based on any.
    for(let field of fields){
        let key = name + '-' + field;
        let el = get_by_id(key) as any;
        if(!el) throw new Error();
        f[field] = el;
    }
    result.hide = function(){
        result.hidden = true;
        OPENDIALOG = null;
        result.window.style.display = 'none';
        if(result.hide_handler)
            result.hide_handler();
    };
    result.show = function(){
        if(!result.hidden) return;
        result.hidden = false;
        OPENDIALOG = result;
        result.window.style.display = 'initial';
        center_element(result.window);
        result.make_top();
        if(result.show_handler)
            result.show_handler();
        return;
    };
    result.ok.addEventListener('click', function(){
        if(result.ok_handler)
            result.ok_handler();
        result.hide();
    });
    function cancel(){
        if(result.cancel_handler)
            result.cancel_handler();
        result.hide();
    }
    result.cancel.addEventListener('click', cancel);
    result.close.addEventListener('click', cancel);
    result.clear_handlers = function(){
        result.ok_handler = undefined;
        result.cancel_handler = undefined;
        result.show_handler = undefined;
        result.hide_handler = undefined;
    };
    return result;
}

// So this really returns a Dialog or null, but ts doesn't properly propagate
// the non-nullness in closures. oh well.
function get_dialog<Key extends keyof DialogIdMap>(name:Key):Dialog<Key>{
    let dialog = get_or_make_dialog(name);
    // if(!dialog.hidden) return null as unknown as any;
    if(OPENDIALOG) OPENDIALOG.cancel.click();
    dialog.clear_handlers();
    return dialog;
}

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
            x = 100*x/window.innerWidth;
            y = 100*x/window.innerHeight;
            if(save_in_flight) return;
            save_in_flight = true;
            setTimeout(function(){
                store_global(StorageCategory.WINDOW, win.id, [x+'%', y+'%']);
                save_in_flight = false;
            }, 100);
        }
    }
    let old_pos = get_global(StorageCategory.WINDOW, win.id);
    if(old_pos !== undefined){
        const [old_x, old_y] = old_pos;
        if(typeof old_x === 'string'){
            win.style.top = old_x;
            win.style.left = old_y;
        }
        else {
            win.style.top = 100*old_y/window.innerHeight + '%';
            win.style.left = 100*old_x/window.innerWidth + '%';
        }
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
        win.style.top = 100*r.top/window.innerHeight + '%';
        win.style.left = 100*r.left/window.innerWidth + '%';
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
        win.style.top = 100*newy/window.innerHeight + '%';
        win.style.left = 100*newx/window.innerWidth + '%';
        r = win.getBoundingClientRect();
        xorg = r.left;
        yorg = r.top;
        x = e.screenX;
        y = e.screenY;
    }
}

function setup_closable_window(win:HTMLElement, closer:HTMLElement, onclose:()=>void){
    if(window.navigator.platform.includes('Windows'))
        closer.style.gridColumn = '3';
    else
        closer.style.gridColumn = '1';
    function hide_window(e:MouseEvent){
        e.preventDefault();
        e.stopPropagation();
        onclose();
        win.style.display='none';
    }
    closer.addEventListener('click', hide_window);
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

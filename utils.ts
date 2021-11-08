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
    hoverpop.innerHTML += "<script>alert('hello world')</sc"+"ript>";
    document.body.appendChild(hoverpop);
    after_append();
    function remove_hoverpop(){
        document.body.removeChild(hoverpop);
        hover_is_open = false;
    }
    const ok = document.getElementById('hoverpop-ok')!;
    function submit(){
        on_ok(hoverpop);
        remove_hoverpop();
    }
    ok.addEventListener('click', function(){
        submit();
    });
    const cancel = document.getElementById('hoverpop-cancel')!;
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


function setup_movable_window(win:HTMLDivElement, handle:HTMLDivElement){
    let dragging = false;
    let x = 0;
    let y = 0;
    let xorg = 0;
    let yorg = 0;
    handle.addEventListener('pointerdown', function(e:PointerEvent){
        if(e.target !== handle)
            return;
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        handle.style.cursor = 'grabbing';
        let r = win.getBoundingClientRect();
        win.style.top = r.top + 'px';
        win.style.left = r.left + 'px';
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
        handle.style.cursor = 'grab';
        dragging = false;
    }
    function pointermove(e:PointerEvent){
        if(!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        let xdiff = e.screenX - x;
        let ydiff = e.screenY - y;
        let newy = yorg + ydiff;
        let newx = xorg + xdiff;
        if(newy < 0) newy = 0;
        if(newx < 0) newx = 0;
        if(newx + 128 > window.innerWidth)
            newx = window.innerWidth - 128;
        if(newy + 128 > window.innerHeight)
            newy = window.innerHeight - 128;
        win.style.top = newy + 'px';
        win.style.left = newx + 'px';
        let r = win.getBoundingClientRect();
        xorg = r.left;
        yorg = r.top;
        x = e.screenX;
        y = e.screenY;
    }
}

function setup_closable_window(win:HTMLElement, closer:HTMLElement, onclose:()=>void){
    console.log('closer', closer);
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

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


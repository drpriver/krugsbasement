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

function elem_parent_text<K extends keyof HTMLElementTagNameMap>(parent:HTMLElement, tag:K, text:string, id?:string|null, class_?:string|null){
    const el = document.createElement(tag);
    if(id) el.id = id;
    if(class_) el.classList.add(class_);
    el.appendChild(document.createTextNode(text));
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
    const ok: HTMLButtonElement = get_by_id('hoverpop-ok')!;
    function submit(){
        on_ok(hoverpop);
        remove_hoverpop();
    }
    ok.addEventListener('click', function(){
        submit();
    });
    const cancel: HTMLButtonElement = get_by_id('hoverpop-cancel')!;
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

    // If we're dragging a window, we need to prevent pointer events from being
    // grabbed by the iframe.
    let iframes = Array.from(document.getElementsByTagName('iframe'));
    function iframe_disable(){
        for(let iframe of iframes)
            iframe.style.pointerEvents = 'none';
    }
    function iframe_enable(){
        for(let iframe of iframes)
            iframe.style.pointerEvents = 'auto';
    }

    // To prevent spamming the localStorage, uses this to debounce.
    let save_in_flight = false;
    let save_position = function(x:number, y:number){};
    if(flags &  WINDOWFLAGS.REMEMBER_POSITION){
        save_position = function (x:number, y:number){
            x = 100*x/window.innerWidth;
            y = 100*y/window.innerHeight;
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
    handle.addEventListener('pointerdown', function(e:PointerEvent){
        if(e.target !== handle)
            return;
        iframe_disable();
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
        iframe_enable();
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


type ListView<K> = {
    column: HTMLDivElement;
    items: Array<[any, HTMLDivElement]>;
    remove:(v:K) => void;
    add_item: (_:string, v:K)=>void;
    make_active:(v:K | undefined) => void;
    rename:(text:string, v:K)=>void;
    activate_handler?:(k:K|undefined)=>void;
    active?: K;
    clear: ()=>void;
    // this is called after removing via the user clicking the icon.
    user_remove_handler?:(k:K)=>void;
    // this is called after renaming via the user clicking the icon.
    user_rename_handler?:(k:K, text:string)=>void;
};

const enum ListViewFlags {
    NONE = 0,
    // Can be renamed via the list view itself, handler will be called
    USER_RENAMABLE = 1 << 0,
    USER_DELETABLE = 1 << 1,
}
function make_list_view<K>(listcontainer:HTMLDivElement, flags:ListViewFlags):ListView<K>{
    let result: ListView<K> = {
        active: undefined,
        column: listcontainer,
        items: [],
        clear:function(){
            for(let [_, el] of result.items)
                el.remove();
            result.active = undefined;
        },
        make_active: function(key:K | undefined){
            for(let [v, el] of result.items){
                el.classList.remove('active');
                if(v === key)
                    el.classList.add('active');
            }
            result.active = key;
            if(result.activate_handler)
                result.activate_handler(key);
        },
        add_item: function(text:string, key:K){
            const el = elem_with_text('div', text);
            let style = 'auto';
            if(flags & ListViewFlags.USER_RENAMABLE){
                style += ' 32px';
                const rename = elem_parent_text(el, 'button', '✎');
                rename.addEventListener('click', function(e:MouseEvent){
                    e.stopPropagation();
                    let dialog = get_dialog('simple-text');
                    if(!dialog) return;
                    let t = el.firstChild!.textContent;
                    if(!t) t = "";
                    dialog.title.innerText = 'Rename '+t;
                    dialog.f.text.value = t;
                    dialog.show_handler = function(){
                        dialog.f.text.focus();
                    };
                    dialog.ok_handler = function(){
                        let text = dialog.f.text.value.trim();
                        if(!text) return;
                        result.rename(text, key);
                        if(result.user_rename_handler)
                            result.user_rename_handler(key, text);
                    };
                    dialog.show();
                });
            }
            if(flags & ListViewFlags.USER_DELETABLE){
                style += ' 32px';
                const del = elem_parent_text(el, 'button', '✘');
                del.addEventListener('click', function(e:MouseEvent){
                    e.stopPropagation();
                    let dialog = get_dialog('simple-delete');
                    if(!dialog) return;
                    dialog.title.innerText = 'Delete '+el.firstChild!.textContent;
                    dialog.f.delete.checked = false;
                    dialog.ok_handler = function(){
                        if(!dialog.f.delete.checked) return;
                        result.remove(key);
                        if(result.user_remove_handler)
                            result.user_remove_handler(key);
                    };
                    dialog.show();
                });
            }
            el.style.gridTemplateColumns = style;
            el.addEventListener('click', function(e:MouseEvent){
                e.preventDefault();
                e.stopPropagation();
                result.make_active(key);
            });
            result.items.push([key, el]);
            result.column.appendChild(el);
        },
        remove: function(key:K){
            for(let i = 0; i < result.items.length; i++){
                let [v, el] = result.items[i]
                if(v === key){
                    el.remove();
                    result.items.splice(i, 1);
                    if(key == result.active){
                        if(i < result.items.length)
                            result.make_active(result.items[i][0]);
                        else if(i)
                            result.make_active(result.items[i-1][0]);
                        else
                            result.make_active(undefined);
                    }
                    return;
                }
            }
        },
        rename: function(text:string, key:K){
            for(let [v, el] of result.items){
                if(v === key){
                    el.firstChild!.textContent = text;
                    return;
                }
            }
        },
        activate_handler: undefined,
    };
    return result;
}

type DualListView<K1, K2> = {
    // K1 and K2 are things you use to uniquely identify
    // the entries in the lists. They need to give
    // sane results for '===' and when put in a Map.
    column1: HTMLDivElement;
    column2: HTMLDivElement;
    remove2:(k1:K1, k2:K2)=>void;
    // remove1: (k1:K1)=>void;
    // should there be a remove handler?
    items1: Array<[K1, HTMLDivElement]>;
    items2: Map<K1, Array<[K2, HTMLDivElement]> >;
    add_item1:(text:string, k1:K1) =>void;
    add_item2:(text:string, k1:K1, k2:K2) =>void;
    make_active1:(k1:K1) => void;
    make_active2:(k1:K1, k2:K2) => void;
    rename1:(text:string, k1:K1) => void;
    rename2:(text:string, k1:K1, k2:K2) => void;
    // Called when there are no elements at all.
    activate0_handler?:()=>void;
    // activate1_handler is only called if k2 is not found during
    // a call to make_active1
    activate1_handler?:(k1:K1)=>void;
    activate2_handler?:(k1:K1, k2:K2)=>void;
    active1: K1 | undefined;
    active2: Map<K1, K2>;
};

function make_dual_list_view<K1, K2>(col1:HTMLDivElement, col2:HTMLDivElement):DualListView<K1, K2> {
    let result:DualListView<K1,K2> = {
        column1: col1,
        column2: col2,
        items1: [],
        items2: new Map(),
        activate0_handler: undefined,
        activate1_handler: undefined,
        activate2_handler: undefined,
        active1: undefined,
        active2: new Map(),
        make_active1: function(k1:K1){
            for(let [k, el] of result.items1){
                el.classList.remove('active');
                if(k === k1)
                    el.classList.add('active');
            }
            let prev = result.active1;
            result.active1 = k1;
            if(prev !== undefined){
                let olditems = result.items2.get(prev);
                if(olditems !== undefined){
                    for(let [_, el] of olditems){
                        el.remove();
                    }
                }
            }
            let items = result.items2.get(result.active1);
            if(items !== undefined){
                for(let [_, el] of items){
                    result.column2.appendChild(el);
                }
            }
            let k2 = result.active2.get(k1);
            if(k2 !== undefined)
                result.make_active2(k1, k2);
            else if(result.activate1_handler)
                result.activate1_handler(k1);
        },
        make_active2: function(k1: K1, k2:K2){
            if(result.active1 !== k1){
                result.active2.set(k1, k2);
                result.make_active1(k1);
                return;
            }
            let items = result.items2.get(k1)!;
            for(let [k, el] of items){
                el.classList.remove('active');
                if(k === k2)
                    el.classList.add('active');
            }
            result.active2.set(k1, k2);
            if(result.activate2_handler)
                result.activate2_handler(k1, k2);
        },
        add_item1: function(text:string, k1:K1){
            for(let [k, el] of result.items1){
                if(k === k1){
                    el.firstChild!.textContent = text;
                    return;
                }
            }
            let item = elem_parent_text(result.column1, 'div', text);
            item.addEventListener('click', function(){
                result.make_active1(k1);
            });
            result.items1.push([k1, item]);
            result.items2.set(k1, []);
        },
        add_item2:function(text:string, k1:K1, k2:K2){
            let item = elem_with_text('div', text);
            item.addEventListener('click', function(){
                result.make_active2(k1, k2);
            });
            let items = result.items2.get(k1);
            if(items === undefined){
                items = [];
                result.items2.set(k1, items);
            }
            items.push([k2, item]);
            if(k1 === result.active1){
                result.column2.appendChild(item);
            }
        },
        rename1:function(text:string, k1:K1){
            for(let [k, el] of result.items1){
                if(k === k1){
                    el.firstChild!.textContent = text;
                    return;
                }
            }
        },
        rename2:function(text:string, k1:K1, k2:K2){
            let items = result.items2.get(k1);
            if(items === undefined) return;
            for(let [k, el] of items){
                if(k === k2){
                    el.firstChild!.textContent = text;
                    return;
                }
            }
        },
        remove2:function(k1:K1, k2:K2){
            let items = result.items2.get(k1);
            if(items === undefined) return;
            for(let i = 0; i < items.length; i++){
                let [k, el] = items[i];
                if(k === k2){
                    el.remove();
                    items.splice(i, 1);
                    if(k1 === result.active1){
                        if(k2 === result.active2.get(k1)){
                            if(i < items.length)
                                result.make_active2(k1, items[i][0]);
                            else if(i)
                                result.make_active2(k1, items[i-1][0]);
                            else{
                                result.active2.delete(k1);
                                result.make_active1(k1);
                            }
                        }
                    }
                    return;
                }
            }
        },


    };
    return result;
}

function setup_chat(chat:HTMLTextAreaElement, enter_func:(_:string)=>void){
    const history: Array<string> = [];
    let history_index = 0;
    let current_text = "";
    let set_text = "";
    chat.addEventListener('keydown', function(e){
        e.stopPropagation();
        let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
        if(modified) return;
        switch(e.key){
            case 'Enter':{
                e.preventDefault();
                const value = chat.value;
                if(value.length){
                    chat.value = "";
                    enter_func(value);
                    if(!(history.length && value == history[history.length-1])){
                        history.push(value);
                    }
                    history_index = history.length;
                    current_text = "";
                    set_text = "";
                }
            }break;
            case 'ArrowUp':{
                if(chat.value && chat.value != set_text) break;
                e.preventDefault();
                if(history_index > 0 && history_index <= history.length){
                    if(history_index == history.length){
                        current_text = chat.value;
                    }
                    history_index--;
                    chat.value = history[history_index];
                    set_text = chat.value;
                }
            }break;
            case 'ArrowDown':{
                if(chat.value && chat.value != set_text) break;
                e.preventDefault();
                if(history_index >= 0 && history_index < history.length){
                    history_index++;
                    if(history_index == history.length)
                        chat.value = current_text;
                    else
                        chat.value = history[history_index];
                    set_text = chat.value;
                }
            }break;
            case 'Escape':{
                chat.blur();
            }break;
        }
    });
}

type TabView = {
    active_tab_idx: number;
    tabs: Array<HTMLElement>;
    views: Array<HTMLElement>;
    on_change_handler?:(old_idx:number, new_idx:number)=>void;
    change_tab:(_:number) => void;
};

function make_tab_view(tabs:Array<HTMLElement>, views:Array<HTMLElement>):TabView {
    let tv: TabView = {
        active_tab_idx: 0,
        tabs: tabs,
        views: views,
        on_change_handler:undefined,
        change_tab:function(idx:number){
            if(idx >= tv.tabs.length) return;
            if(idx == tv.active_tab_idx) return;
            tv.tabs[tv.active_tab_idx].classList.remove('active-tab');
            tv.views[tv.active_tab_idx].style.display = 'none';
            if(tv.on_change_handler)
                tv.on_change_handler(tv.active_tab_idx, idx);
            tv.active_tab_idx = idx;
            tv.tabs[tv.active_tab_idx].classList.add('active-tab');
            tv.views[tv.active_tab_idx].style.display = 'initial';
        },
    };
    for(let i = 0; i < tabs.length; i++){
        tabs[i].addEventListener('click', function(e){
            e.stopPropagation();
            e.preventDefault();
            tv.change_tab(i);
        });
        views[i].style.display = 'none';
    }
    tv.change_tab(0);
    return tv;
}

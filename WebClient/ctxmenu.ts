//
// Copyright © 2023-2024, David Priver
//

let _ctxmenu_remover:undefined|(()=>void);

// Removes the current ctx menu and returns whether there was one active.
function did_remove_ctx_menu():boolean{
    if(_ctxmenu_remover){
        _ctxmenu_remover();
        _ctxmenu_remover = undefined;
        return true;
    }
    return false;
};
function remove_ctx_menu():void{
    did_remove_ctx_menu();
}

type CtxMenu = {
    menu: HTMLElement;
    separator:()=>void;
    canceller:() => void;
    item:(txt:string, cb?:(()=>void)|((e:MouseEvent)=>void), disabled?:boolean) => void;
    checkbox:(txt:string, b:boolean, cb:(b:boolean)=>void, el?:HTMLElement) => void;
    numbox:(txt:string, v:number, cb:(v:number)=>void, max?:number) => void;
    disabled:(txt:string)=>void;
    install:()=>void;
};

function ctx_menu(e:MouseEvent):CtxMenu{
    e.stopPropagation();
    e.preventDefault();
    const left = e.clientX;
    const top = e.clientY;
    const result: CtxMenu = {
        menu: elem('section', null, 'menu'),
        separator: function():void{
            elem_with_parent(result.menu, 'section', null, 'menuseparator');
        },
        disabled:function(txt:string):void{
            const d = elem_parent_text(result.menu, 'section', txt, null, 'menuitem');
            d.classList.add('disabled');
            d.onpointerdown = function(e):void{e.stopPropagation();};
        },
        item:function(txt:string, cb?:(()=>void)|((e:MouseEvent)=>void), disabled?:boolean):void{
            if(disabled){
                result.disabled(txt);
                return;
            }
            const d = elem_parent_text(result.menu, 'section', txt, null, 'menuitem');
            d.tabIndex = -1;
            d.onmouseover = function(){
                d.focus();
            }
            d.onkeydown = function(e:KeyboardEvent):void{
                if(e.key == 'Enter' || e.key == ' '){
                    e.preventDefault();
                    e.stopPropagation();
                    d.click();
                    return;
                }
                if(e.key == 'ArrowUp' || e.key == 'k'){
                    e.preventDefault();
                    e.stopPropagation();
                    let sib = d.previousElementSibling;
                    while(sib && (!sib.classList.contains('menuitem') || sib.classList.contains('disabled'))){
                        sib = sib.previousElementSibling;
                    }
                    if(sib) (sib as any).focus();
                    return;
                }
                if(e.key == 'ArrowDown' || e.key == 'Tab' || e.key == 'j'){
                    e.preventDefault();
                    e.stopPropagation();
                    let sib = d.nextElementSibling;
                    while(sib && (!sib.classList.contains('menuitem') || sib.classList.contains('disabled'))){
                        sib = sib.nextElementSibling;
                    }
                    if(sib) (sib as any).focus();
                    return;
                }
            };
            // the window.onpointerdown at the bottom will remove it.
            // d.addEventListener('pointerdown', remove_ctx_menu);
            if(cb) d.addEventListener('pointerdown', cb);
            d.addEventListener('click', function(e):void{
                if(cb) cb(e)
                remove_ctx_menu();
            });
        },
        checkbox:function(txt:string, b:boolean,  cb:(b:boolean)=>void, el?:HTMLElement):void{
            const l = elem_with_parent(result.menu, 'label', null, 'menuitem');
            l.tabIndex = -1;
            l.onmouseover = function(){
                l.focus();
            }
            l.onkeydown = function(e:KeyboardEvent):void{
                if(e.key == 'Enter' || e.key == ' '){
                    e.preventDefault();
                    e.stopPropagation();
                    l.click();
                    return;
                }
                // if(e.key == 'ArrowUp'){
                if(e.key == 'ArrowUp' || e.key == 'k'){
                    e.preventDefault();
                    e.stopPropagation();
                    let sib = l.previousElementSibling;
                    while(sib && (!sib.classList.contains('menuitem') || sib.classList.contains('disabled'))){
                        sib = sib.previousElementSibling;
                    }
                    if(sib) (sib as any).focus();
                    return;
                }
                // if(e.key == 'ArrowDown' || e.key == 'Tab'){
                if(e.key == 'ArrowDown' || e.key == 'Tab' || e.key == 'j'){
                    e.preventDefault();
                    e.stopPropagation();
                    let sib = l.nextElementSibling;
                    while(sib && (!sib.classList.contains('menuitem') || sib.classList.contains('disabled'))){
                        sib = sib.nextElementSibling;
                    }
                    if(sib) (sib as any).focus();
                    return;
                }
            };
            if(el) l.appendChild(el);
            l.append(txt);
            const inp = elem_with_parent(l, 'input');
            inp.type = 'checkbox';
            inp.checked = b;
            inp.onchange = function(e:Event){
                cb(inp.checked);
            };
            l.onpointerdown = function(e:MouseEvent){
                e.stopPropagation();
            }
        },
        numbox:function(txt:string, v:number,  cb:(v:number)=>void, max?:number):void{
            const l = elem_with_parent(result.menu, 'label', null, 'menuitem');
            l.tabIndex = -1;
            l.onmouseover = function(){
                l.focus();
            }
            l.onkeydown = function(e:KeyboardEvent):void{
                if(e.key == 'Backspace'){
                    inp.focus();
                    return;
                }
                if(e.key == 'Delete'){
                    inp.focus();
                    return;
                }
                if(e.key == '1' || e.key == '2'
                 || e.key == '3' || e.key == '4'
                 || e.key == '5' || e.key == '6'
                 || e.key == '7' || e.key == '8'
                 || e.key == '9' || e.key == '0'){
                     inp.focus();
                     // inp.value += e.key;
                     // e.preventDefault();
                     // e.stopPropagation();
                     return;
                 }
                if(e.key == 'Enter' || e.key == ' '){
                    e.preventDefault();
                    e.stopPropagation();
                    l.click();
                    return;
                }
                // if(e.key == 'ArrowUp'){
                if(e.key == 'ArrowUp' || e.key == 'k'){
                    e.preventDefault();
                    e.stopPropagation();
                    let sib = l.previousElementSibling;
                    while(sib && (!sib.classList.contains('menuitem') || sib.classList.contains('disabled'))){
                        sib = sib.previousElementSibling;
                    }
                    if(sib) (sib as any).focus();
                    return;
                }
                // if(e.key == 'ArrowDown' || e.key == 'Tab'){
                if(e.key == 'ArrowDown' || e.key == 'Tab' || e.key == 'j'){
                    e.preventDefault();
                    e.stopPropagation();
                    let sib = l.nextElementSibling;
                    while(sib && (!sib.classList.contains('menuitem') || sib.classList.contains('disabled'))){
                        sib = sib.nextElementSibling;
                    }
                    if(sib) (sib as any).focus();
                    return;
                }
            };
            l.append(txt);
            const inp = elem_with_parent(l, 'input');
            inp.type = 'number';
            inp.value = ""+v;
            inp.oninput = function(e:Event){
                cb(+inp.value);
            };
            inp.onkeydown = function(e:KeyboardEvent):void{
                if(e.key == 'Enter') {
                    cb(+inp.value);
                    remove_ctx_menu();
                }
            }
            if(max) l.append(`/ ${max}`);
            l.onpointerdown = function(e:MouseEvent){
                inp.focus();
                e.stopPropagation();
            }
        },
        canceller: function():void{
            result.item('Cancel');
        },
        install:function():void{
            remove_ctx_menu();
            _ctxmenu_remover = function():void{
                result.menu.remove();
            };
            result.menu.style.left = left + 'px';
            result.menu.style.top = top + 'px';
            result.menu.style.zIndex = ''+(TOPPERMOST_Z + 1);
            document.body.appendChild(result.menu);
            const r = result.menu.getBoundingClientRect();
            if(r.bottom > window.innerHeight){
                result.menu.style.top = 'initial';
                result.menu.style.bottom = '0px';
            }
            if(r.right > window.innerWidth){
                result.menu.style.left = 'initial';
                result.menu.style.right = '0px';
            }
            if(r.height > window.innerHeight){
                result.menu.style.columns = '2';
            }
        },
    };
    return result;
}
window.addEventListener('pointerdown', remove_ctx_menu);

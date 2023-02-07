//
// Copyright © 2023, David Priver
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
    item:(txt:string, cb?:(()=>void)|((e:MouseEvent)=>void)) => void;
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
        item:function(txt:string, cb?:(()=>void)|((e:MouseEvent)=>void)):void{
            const d = elem_parent_text(result.menu, 'section', txt, null, 'menuitem');
            d.tabIndex = -1;
            d.onkeydown = function(e:KeyboardEvent):void{
                if(e.key == 'Enter' || e.key == ' '){
                    e.preventDefault();
                    e.stopPropagation();
                    d.click();
                    return;
                }
                if(e.key == 'ArrowUp'){
                    e.preventDefault();
                    e.stopPropagation();
                    let sib = d.previousElementSibling;
                    while(sib && (!sib.classList.contains('menuitem') || sib.classList.contains('disabled'))){
                        sib = sib.previousElementSibling;
                    }
                    if(sib) (sib as any).focus();
                    return;
                }
                if(e.key == 'ArrowDown' || e.key == 'Tab'){
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
        },
    };
    return result;
}
window.addEventListener('pointerdown', remove_ctx_menu);

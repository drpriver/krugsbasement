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
function remove_ctx_menu(){
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
            d.onpointerdown = function(e){e.stopPropagation();};
        },
        item:function(txt:string, cb?:(()=>void)|((e:MouseEvent)=>void)){
            const d = elem_parent_text(result.menu, 'section', txt, null, 'menuitem');
            // the window.onpointerdown at the bottom will remove it.
            // d.addEventListener('pointerdown', remove_ctx_menu);
            if(cb) d.addEventListener('pointerdown', cb);
        },
        install:function(){
            remove_ctx_menu();
            _ctxmenu_remover = function(){
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

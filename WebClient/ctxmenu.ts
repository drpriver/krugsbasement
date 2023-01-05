let _ctxmenu_remover:undefined|(()=>void);

// Removes the current ctx menu and returns whether there was one active.
function remove_ctx_menu():boolean{
    if(_ctxmenu_remover){
        _ctxmenu_remover();
        _ctxmenu_remover = undefined;
        return true;
    }
    return false;

};

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
    const left = e.clientX + 'px';
    const top = e.clientY + 'px';
    const result: CtxMenu = {
        menu: elem('section', null, 'menu'),
        separator: function():void{
            elem_with_parent(result.menu, 'section', null, 'menuseparator');
        },
        disabled:function(txt:string):void{
            const d = elem_parent_text(result.menu, 'section', txt, null, 'menuitem');
            d.classList.add('disabled');
        },
        item:function(txt:string, cb?:(()=>void)|((e:MouseEvent)=>void)){
            const d = elem_parent_text(result.menu, 'section', txt, null, 'menuitem');
            d.addEventListener('click', remove_ctx_menu);
            if(cb) d.addEventListener('click', cb);
        },
        install:function(){
            remove_ctx_menu();
            _ctxmenu_remover = function(){
                result.menu.remove();
            };
            result.menu.style.left = left;
            result.menu.style.top = top;
            result.menu.style.zIndex = ''+(TOPPERMOST_Z + 1);
            document.body.appendChild(result.menu);
        },
    };
    return result;
}
window.addEventListener('pointerdown', remove_ctx_menu);

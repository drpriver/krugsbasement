//
// Copyright © 2025-2026, David Priver <david@davidpriver.com>
//

document.addEventListener('DOMContentLoaded', function():void{
    const b = by_id('scratch-button');
    b.onclick = function(e):void{
        e.stopPropagation();
        const w = scratchpad_window();
        spw_want_focus = true;
        w.show();
    }
    const openid = '/scratch/open/0';
    reopen_window(scratchpad_window, NormalWindow.LOCAL, openid);
});

let spw_want_focus = false;
let spw : Win | null = null;
function scratchpad_window():Win {
    if(spw) return spw;
    const openid = '/scratch/open/0';
    const wid = 'scratch-window-0';
    const storageid = 'scratch-0';
    let win: Win;
    {
        const w = elem('div', wid, 'window');
        w.classList.add('scratch-window');
        const wh = elem_with_parent(w, 'div', null, 'window-handle');
        const x = elem_parent_text(wh, 'span', '×', null, 'window-closer');
        const t = elem_parent_text(wh, 'span', 'Scratchpad', null, 'window-title');
        const m = elem_parent_text(wh, 'span', '_', null, 'window-minimizer');
        win = normal_window(w, wh, x, m, t, NormalWindow.LOCAL, openid);
    }
    const content = get_local_default(StorageCategory.UI, 'scratch-0', '');
    const ta = elem_with_parent(win.win, 'textarea');
    ta.value = content;
    ta.style.width = '100%';
    ta.style.fontFamily = 'ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace';
    ta.style.fontSize = '16px';
    ta.spellcheck = false;
    let wants_store = false;
    ta.oninput = function():void{
        if(wants_store) return;
        wants_store = true;
        setTimeout(()=>{
            wants_store = false;
            store_local(StorageCategory.UI, storageid, ta.value);
        }, 500)
    };
    monospace_textarea(ta, null);
    win.show_handler = function():void{
        if(spw_want_focus){
            setTimeout(()=>ta.focus(), 0);
            spw_want_focus = false;
        }
    };
    win.wh_ctxmenu_handler = function(menu:CtxMenu):void{
        menu.item('Clear', function():void{
            ta.value = '';
            store_local(StorageCategory.UI, storageid, '');
        });
    };

    spw = win;
    return win;
};

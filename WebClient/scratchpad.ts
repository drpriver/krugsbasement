//
// Copyright © 2025, David Priver
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
    if(get_local(StorageCategory.WINDOW, openid)){
        const w = scratchpad_window();
        w.show();
    }
});

type ScratchpadWindow = {
  show: () => void;
  close: () => void;
};
let spw_want_focus = false;
let spw : ScratchpadWindow | null = null;
function scratchpad_window():ScratchpadWindow {
    if(spw) return spw;
    const openid = '/scratch/open/0';
    const wid = 'scratch-window-0';
    const storageid = 'scratch-0';
    const w = elem('div', wid, 'window2');
    const wh = elem_with_parent(w, 'div', null, 'window-handle');
    const x = elem_parent_text(wh, 'span', '×', null, 'window-closer');
    const t = elem_parent_text(wh, 'span', 'Scratchpad', null, 'window-title');
    const content = get_local_default(StorageCategory.UI, 'scratch-0', '');
    const ta = elem_with_parent(w, 'textarea');
    w.style.minHeight = '40vh';
    w.style.minWidth = '40ch';
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
    setup_resizable_window(w, RESIZEFLAGS.LOCAL_REMEMBER);
    monospace_textarea(ta, null);
    setup_movable_window(w, wh, WINDOWFLAGS.LOCAL_REMEMBER);
    const make_top = setup_zsorted_window(w);
    setup_closable_window(w, x, function():void{
        store_local(StorageCategory.WINDOW, openid, '');
    });
    function show():void{
        if(!w.parentElement) document.body.appendChild(w);
        w.style.display = 'grid';
        make_top();
        store_local(StorageCategory.WINDOW, openid, '1');
        if(spw_want_focus){
            setTimeout(()=>ta.focus(), 0);
            spw_want_focus = false;
        }
    }
    wh.oncontextmenu = function(e:MouseEvent):void{
        const menu = ctx_menu(e);
        menu.item('Clear', function():void{
            ta.value = '';
            store_local(StorageCategory.UI, storageid, '');
        });
        menu.separator();
        menu.item('Close', function():void{x.click();});
        menu.canceller();
        menu.install();
    };

    const result = {
        w: w,
        wh: wh,
        title: t,
        ta: ta,
        show: show,
        close: function():void{
            w.style.display = 'none';
        },
    };
    spw = result;
    return result;
};

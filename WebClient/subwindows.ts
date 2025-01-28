//
// Copyright © 2021-2024, David Priver
//


// This is for independent windows.
// Independent windows have their position remembered across sessions, reopen
// in the same spot after closing them, and you can have more than one open at
// a time (only one dialog is allowed at a time).

// TODO: generate specific window types like for dialogs in a subwindowdefs.ts

// Windows are lazily instantiated/reloaded.
let WINDOWS: Map<keyof SubWindowIdMap, SubWindow> = new Map();
function get_window(name:keyof SubWindowIdMap): SubWindow {
    if(WINDOWS.has(name)) return WINDOWS.get(name) as SubWindow;
    let win = make_window(name);
    WINDOWS.set(name, win);
    return win;
}

type SubWindow = {
    outer: HTMLDivElement;
    close_x: HTMLSpanElement;
    handle: HTMLDivElement;
    // optional funcs that are called when showing/closing window.
    show_handler?: ()=>void;
    hide_handler?: ()=>void;
    make_top: ()=>void;
    show: ()=>void;
    hide: ()=>void;
    hidden: boolean;
    make_fullscreen:()=>void;
}
function make_window(name:keyof SubWindowIdMap): SubWindow {
    let outer = get_by_id<HTMLDivElement>(name+'-window');
    let handle = get_by_id<HTMLDivElement>(name+'-window-handle');
    let close_x = get_by_id<HTMLSpanElement>(name+'-close');
    let result: SubWindow = {
        outer:outer,
        close_x:close_x,
        handle:handle,
        show_handler:undefined,
        hide_handler:undefined,
        make_top: setup_zsorted_window(outer),
        show: function():void{
            result.make_top();
            if(!result.hidden) return;
            result.hidden = false;
            outer.style.display = 'block';
            ensure_window_is_completely_on_screen(outer);
            if(result.show_handler)
                result.show_handler();
        },
        hide: function():void{
            if(result.hidden) return;
            result.hidden = true;
            if(result.hide_handler)
                result.hide_handler();
            outer.style.display = 'none';
        },
        hidden: true,
        make_fullscreen: function():void{
            outer.classList.add('fullscreen-window');
            outer.style.top = '0px';
            outer.style.left = '0px';
            outer.style.right = '0px';
            outer.style.width = '100vw';
            outer.style.height = '100vh';
        },
    };
    setup_movable_window(outer, handle, WINDOWFLAGS.REMEMBER_POSITION);
    setup_closable_window(outer, close_x, result.hide);
    setup_resizable_window(outer, RESIZEFLAGS.GLOBAL_REMEMBER);
    // handle.addEventListener('dblclick', result.hide);
    return result;
}

//
// Copyright © 2021-2026, David Priver <david@davidpriver.com>
//


// This is for independent windows.
// Independent windows have their position remembered across sessions, reopen
// in the same spot after closing them, and you can have more than one open at
// a time (only one dialog is allowed at a time).

// Windows are lazily instantiated/reloaded.
let WINDOWS: Map<keyof SubWindowIdMap, Win> = new Map();
function get_window(name:keyof SubWindowIdMap): Win {
    if(WINDOWS.has(name)) return WINDOWS.get(name) as Win;
    let win = make_window(name);
    WINDOWS.set(name, win);
    return win;
}

function make_window(name:keyof SubWindowIdMap): Win {
    let win = get_by_id<HTMLDivElement>(name+'-window');
    let wh = get_by_id<HTMLDivElement>(name+'-window-handle');
    let x = get_by_id<HTMLSpanElement>(name+'-close');
    let t = get_by_id<HTMLSpanElement>(name+'-title');
    let m = get_by_id<HTMLSpanElement>(name+'-minimizer');
    return normal_window(win, wh, x, m, t, NormalWindow.GLOBAL, `${name}/open`);
}

//
// Copyright © 2021-2024, David Priver
//

// This file implements a listener abstraction where different pieces of code
// can listen (subscribe) to notifications about a change.  This is not
// comprehensive - new events will be added when there is more than one place
// that needs to be updated.
//
// This is only necessary as the DOM is a horrible ui abstraction, so you need
// to maintain a stateful tree of elements for your interface instead of just
// having an easy-to-understand immediate-mode style updating of the UI. Note
// that the shared canvas does not at all have this problem -- we just redraw
// it from scratch when something changes and it's not a big deal.

const enum ListenEvent {
    // Rolltables changed names.
    ROLLTABLES_RENAMED = 0,
    // Got new tables from the server. Renamed will also be sent afterwards.
    ROLLTABLES_RECEIVED = 1,
    // Macros changed names.
    MACROS_RENAMED = 2,
    // darkmode
    DARKMODE_CHANGED = 3,
    // Fixed sized elements need to be recomputed
    LAYOUT_CHANGED = 4,
}
const INTERNAL_LISTENERS: Array<Array<()=>void>> = [[], [], [], [], []];

function listen_for(e:ListenEvent, cb:()=>void):void{
    INTERNAL_LISTENERS[e].push(cb);
}

function signal_for(e:ListenEvent):void{
    for(let cb of INTERNAL_LISTENERS[e])
        cb();
}

//
// Copyright © 2021-2022, David Priver
//

declare let SOCKET: any;
//
// Misc notes
// ----------
// For some enums, we maintain a separate reversing mapping of enum value to string
// as we want the ability to change the strings without changing the code.


// idk where to put this
let SHOW_ZOOMERS = false;
function set_zoomers(show:boolean){
    by_id('zoomers').style.display = show?'block':'none';
    store_global(StorageCategory.SETTINGS, 'showzoomers', show);
    SHOW_ZOOMERS = show;
}
document.addEventListener('DOMContentLoaded', function(){
    // want boolean, not undefined or null
    let show = !!get_global(StorageCategory.SETTINGS, 'showzoomers');
    set_zoomers(show);
});

function set_chat_vis(show:boolean){
    SETTINGS.hidechat = show;
    if(SETTINGS.hidechat){
        by_id('chat').style.height = 'auto';
        by_id('notifications').style.display = 'none';
        by_id('chat-history').style.display = 'none';
        by_id('macro-panel').style.display = 'none';
        by_id('dice-history').style.display = 'none';
        by_id('chatinput').style.display = 'none';
    }
    else {
        by_id('chat').style.height = '100vh';
        by_id('notifications').style.display = 'grid';
        by_id('chat-history').style.display = 'initial';
        by_id('macro-panel').style.display = 'grid';
        by_id('dice-history').style.display = 'initial';
        by_id('chatinput').style.display = 'initial';
    }
    resize_canvas();
    store_local(StorageCategory.SETTINGS, 'hidechat', show);
}
document.addEventListener('DOMContentLoaded', function(){
    set_chat_vis(!!get_local(StorageCategory.SETTINGS, 'hidechat'));
});

SOCKET.on('connect', () => {
    clear_disconnected();
    EMIT(FromClient.JOIN, window.location.pathname);
    SOCKET.emitBuffered();
    // Flush the buffer here so that the post-join gives us
    // our own objects.
    EMIT(FromClient.POST_JOIN);
});
ONRECV(ToClient.API_VERSION, function(api_version:number){
    // Reloads the page if the version changes.
    // This is kind of meh, maybe only for DEV builds?
    // if(api_version != Api.VERSION) window.location.reload();
});
function clear_disconnected(){
    const d = by_id('disconnect')!;
    if(d) d.style.display = 'none';
}
function set_disconnected(){
    const d = by_id('disconnect')!;
    if(d) d.style.display = 'initial';
}
SOCKET.on('disconnect', function(reason:string){
    switch(reason){
        case 'io server disconnect':
        case 'io client disconnect':
            // I want to set a different message
            // in the future.
            set_disconnected();
            break;
        case 'ping timeout':
        case 'transport close':
        case 'transport error':
            set_disconnected();
            break;
    }
});
let session_id = 0;
let show_pan = (function(){
    let sp = get_global(StorageCategory.SETTINGS, 'showpan');
    if(sp === undefined) return true;
    return sp === '1';
})();
document.addEventListener('DOMContentLoaded', function(){
    const pan_tool = by_id('pan-tool');
    pan_tool.style.display = show_pan? 'initial': 'none';
});
function change_pan_visibility(visible:boolean){
    show_pan = visible;
    if(visible)
        store_global(StorageCategory.SETTINGS, 'showpan', '1');
    else
        store_global(StorageCategory.SETTINGS, 'showpan', '0');
    const pan_tool = by_id('pan-tool');
    pan_tool.style.display = visible? 'initial': 'none';
}
ONRECV(ToClient.SESSION_ID, function(resp:number){
    session_id = resp;
});

let IS_TOUCH = false;
document.addEventListener('DOMContentLoaded', function(){
    if(navigator.userAgent.includes('Mobile')){
        document.body.classList.add('mobile');
    }
    // Idk if this is right. The web is so bad, you can't directly
    // ask for what you want.
    if(window.matchMedia("(pointer: coarse)").matches) {
        IS_TOUCH = true;
        by_id('keyboardless-buttons').style.display = 'initial';
    }
});

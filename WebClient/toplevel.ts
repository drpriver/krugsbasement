//
// Copyright © 2021-2022, David Priver
//

(function(){
SOCKET.on('connect', () => {
    clear_disconnected();
    EMIT(FromClient.JOIN, window.location.pathname);
    SOCKET.emitBuffered();
    // Flush the buffer here so that the post-join gives us
    // our own objects.
    EMIT(FromClient.POST_JOIN, SETTINGS.uimode);
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
}());

let session_id = 0;
ONRECV(ToClient.SESSION_ID, function(resp:number){
    session_id = resp;
});

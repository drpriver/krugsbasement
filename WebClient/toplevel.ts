//
// Copyright © 2021-2023, David Priver
//

(function():void{
function onconnect():void{
    clear_disconnected();
    EMIT(FromClient.JOIN, window.location.pathname);
    // Spreadsheet relies on synchronization, so don't emit those.
    if(SOCKET.sendBuffer)
        SOCKET.sendBuffer = SOCKET.sendBuffer.filter(function(el:any):boolean{
            if(el.type != 2) return true;
            return el.data[0] != FromClient.SPREADSHEET;
        });
    // Flush the buffer here so that the post-join gives us
    // our own objects.
    SOCKET.emitBuffered();
    EMIT(FromClient.POST_JOIN, SETTINGS.uimode);
}
if(SOCKET.connected)
    onconnect();
SOCKET.on('connect', onconnect);
ONRECV(ToClient.API_VERSION, function(api_version:number):void{
    // Reloads the page if the version changes.
    // This is kind of meh, maybe only for DEV builds?
    // if(api_version != Api.VERSION) window.location.reload();
});
function clear_disconnected():void{
    const d = by_id('disconnect')!;
    if(d) d.style.display = 'none';
}
function set_disconnected():void{
    const d = by_id('disconnect')!;
    if(d) d.style.display = 'initial';
}
SOCKET.on('disconnect', function(reason:string):void{
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
ONRECV(ToClient.SESSION_ID, function(resp:number):void{
    session_id = resp;
});

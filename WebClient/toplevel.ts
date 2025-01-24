//
// Copyright © 2021-2025, David Priver
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
const IS_FIREFOX = window.navigator.userAgent.search('Firefox') !== -1;

let session_id = 1;
ONRECV(ToClient.SESSION_ID, function(resp:number):void{
    session_id = resp;
});
let HOMEPAGE = '';
// Idk where to put this
ONRECV(ToClient.METADATA, function(md:MetadataMsg){
    switch(md[0]){
        case MetadataType.HOMEPAGE:{
            const a = by_id('home-page');
            HOMEPAGE = md[1];
            a.href = md[1];
            a.textContent = 'Campaign Page';
            break;
        }
    }
});
document.addEventListener('DOMContentLoaded', function(){
    by_id('home-link').oncontextmenu = function(e:MouseEvent){
        const menu = ctx_menu(e);
        menu.item('Campaign Page…', function(){
            const diag = get_dialog('simple-text');
            if(!diag) return;
            diag.clear_handlers();
            diag.f.text.value = HOMEPAGE;
            diag.f.title.textContent = 'Campaign Page';
            diag.f.textlabel.textContent = 'URL:';
            diag.ok_handler = function(){
                EMIT(FromClient.METADATA, [MetadataType.HOMEPAGE, diag.f.text.value.trim()]);
            };
            diag.show();
        });
        menu.canceller();
        menu.install();
    };
});

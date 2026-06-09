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
const IS_SAFARI = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome');
// const IS_SAFARI = window.navigator.userAgent.search('Safari') !== -1;

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

interface ToggleEvent extends Event {
    readonly newState: "open"|"closed";
    readonly oldState: "open"|"closed";
}
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
    function ontoggle(e:ToggleEvent):void{
        const id = (e.target! as HTMLDetailsElement).id;
        const skey = `/details/state/${id}`;
        store_local(StorageCategory.UI, skey, e.newState);
    }
    for(const key of ['maps-details', 'sheets-details', 'notes-details', 'macros-details', 'clocks-details'] as const){
          const elem = by_id(key);
          const stored = get_local(StorageCategory.UI, `/details/state/${key}`);
          if(stored) elem.open = stored == 'open';
          // @ts-ignore
          setTimeout(()=> elem.ontoggle = ontoggle, 0);
    }
});

let render_funcs: Array<(ts:DOMHighResTimeStamp)=>void> = [];
// State variable so that we don't double render in a single frame.
// requestAnimationFrame calls stack, so to avoid double drawing, you
// need to keep track of this.
let animation_requested = false;
function do_render(ts:DOMHighResTimeStamp):void{
    animation_requested = false;
    let funcs = render_funcs.slice();
    render_funcs = [];
    for(let rf of funcs)
        rf(ts);
}
function request_render(rf: (ts:DOMHighResTimeStamp)=>void):void{
    if(SETTINGS.uimode != UiMode.NORMAL) return;
    if(render_funcs.includes(rf)) return;
    render_funcs.push(rf);
    if(animation_requested) return;
    animation_requested = true;
    requestAnimationFrame(do_render);
}

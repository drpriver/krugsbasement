declare let io: any;
let SHOW_FPS = false;
//
// Misc notes
// ----------
// For some enums, we maintain a separate reversing mapping of enum value to string
// as we want the ability to change the strings without changing the code.

const enum DarkMode {
    SYSTEM = 0,
    DARK = 1,
    LIGHT = 2,
}
function system_prefers_darkmode():boolean{
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}
let current_dark_mode:DarkMode = DarkMode.SYSTEM;
let DARKMODE = false;
function change_dark_mode(mode:DarkMode){
    switch(mode){
        case DarkMode.DARK:
            DARKMODE = true;
            (document.documentElement.style as any).colorScheme = 'dark';
            break;
        case DarkMode.LIGHT:
            DARKMODE = false;
            (document.documentElement.style as any).colorScheme = 'light';
            break;
        case DarkMode.SYSTEM:
        default:
            DARKMODE = system_prefers_darkmode();
            if(DARKMODE)
                (document.documentElement.style as any).colorScheme = 'dark';
            else
                (document.documentElement.style as any).colorScheme = 'light';
            break;
    }
    current_dark_mode = mode;
    store_global(StorageCategory.SETTINGS, 'darkmode', mode);
    if(document.readyState === "complete"){
        request_render();
        if(DARKMODE)
            document.body.classList.add('dark-mode');
        else
            document.body.classList.remove('dark-mode');
    }
    else {
        document.addEventListener('DOMContentLoaded',function(){
            if(DARKMODE)
                document.body.classList.add('dark-mode');
            else
                document.body.classList.remove('dark-mode');
        });
    }

}
(function(){
    let mode = get_global(StorageCategory.SETTINGS, 'darkmode');
    if(mode === undefined)
        mode = +(localStorage.getItem('darkmode') || 0);
    mode |= 0;
    if(mode < 0 || mode > 2)
        mode = 0;
    change_dark_mode(mode);
}());

let SOCKET = io({transports:["websocket"]});
SOCKET.on(ToClient.CONNECT, () => {
    clear_disconnected();
    SOCKET.emit(FromClient.JOIN, window.location.pathname)
    SOCKET.emitBuffered();
    // Flush the buffer here so that the post-join gives us
    // our own objects.
    SOCKET.emit(FromClient.POST_JOIN)
});
function clear_disconnected(){
    const d = document.getElementById('disconnect')!;
    if(d)
        d.style.display = 'none';
}
function set_disconnected(){
    const d = document.getElementById('disconnect')!;
    if(d)
        d.style.display = 'initial';
}
SOCKET.on(ToClient.DISCONNECT, function(reason:string){
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
    if(sp === undefined)
        sp = localStorage.getItem('showpan');
    if(sp == '1')
        return true;
    if(sp == '0')
        return false;
    return true;
})();
document.addEventListener('DOMContentLoaded', function(){
    const pan_tool = document.getElementById('pan-tool')!;
    pan_tool.style.display = show_pan? 'initial': 'none';
});
function change_pan_visibility(visible:boolean){
    show_pan = visible;
    if(visible)
        store_global(StorageCategory.SETTINGS, 'showpan', '1');
    else
        store_global(StorageCategory.SETTINGS, 'showpan', '0');
    const pan_tool = document.getElementById('pan-tool')!;
    pan_tool.style.display = visible? 'initial': 'none';
}
SOCKET.on(ToClient.SESSION_ID, function(resp:number){
    session_id = resp;
});

function get_state(which:string):void{
    const link = document.createElement('a');
    if(which){
        link.download = which + '.json';
        link.href = `${window.location.pathname}/state?which=${which}`;
    }
    else{
        link.download = 'state.json';
        link.href = `${window.location.pathname}/state`;
    }
    link.click();
}

function upload():void{
    const inp = document.createElement('input');
    inp.type = 'file';
    function handlefiles(){
        const files = inp.files;
        if(!files)
            return;
        if(!files.length)
            return;
        const file = files[0];
        fetch('/state', {
            method: 'POST',
            body: file,
        });
    }
    inp.addEventListener("change", handlefiles, false);
    inp.click();
}

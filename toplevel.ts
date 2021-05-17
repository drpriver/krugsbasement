declare let io: any;
let socket = io({transports:["websocket"]});
socket.on("connect", () => {
    clear_disconnected();
    socket.emit('join', window.location.pathname)
    socket.emitBuffered();
    // Flush the buffer here so that the post-join gives us
    // our own objects.
    socket.emit('post-join')
});
function clear_disconnected(){
    const d = document.getElementById('disconnect')!;
    d.style.display = 'none';
}
function set_disconnected(){
    const d = document.getElementById('disconnect')!;
    d.style.display = 'initial';
}
socket.on('disconnect', function(reason:string){
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
    const sp = localStorage.getItem('showpan');
    if(!sp){
        return false;
    }
    return true;
})();
document.addEventListener('DOMContentLoaded', function(){
    const pan_tool = document.getElementById('pan-tool')!;
    pan_tool.style.display = show_pan? 'initial': 'none';
});
function change_pan_visibility(visible:boolean){
    show_pan = visible;
    if(visible)
        localStorage.setItem('showpan', '1')
    else
        localStorage.removeItem('showpan')
    const pan_tool = document.getElementById('pan-tool')!;
    pan_tool.style.display = visible? 'initial': 'none';
}
socket.on('session-id', function(resp:number){
    session_id = resp;
});

function get(which:string):void{
    const link = document.createElement('a');
    if(which){
        link.download = which + '.json';
        link.href = '/state?which='+which;
    }
    else{
        link.download = 'state.json';
        link.href = '/state';
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

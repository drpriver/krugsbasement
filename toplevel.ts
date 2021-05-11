declare let io: any;
let socket = io({transports:["websocket"]});
socket.emit('join', window.location.pathname)
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

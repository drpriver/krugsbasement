declare let io: any;
let socket = io();
let session_id = 0;
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

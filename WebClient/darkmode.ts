//
// Copyright © 2023, David Priver
//

function system_prefers_darkmode():boolean{
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}

let DARKMODE = false;
function change_dark_mode(mode:DarkMode, postit:number):void{
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
    SETTINGS.darkmode = mode;
    if(document.readyState === "complete" || document.readyState === 'interactive'){
        signal_for(ListenEvent.DARKMODE_CHANGED);
        if(DARKMODE)
            document.body.classList.add('dark-mode');
        else
            document.body.classList.remove('dark-mode');
    }
    else {
        document.addEventListener('DOMContentLoaded',function():void{
            signal_for(ListenEvent.DARKMODE_CHANGED);
            if(DARKMODE)
                document.body.classList.add('dark-mode');
            else
                document.body.classList.remove('dark-mode');
        });
    }
    // This is weird to use fetch when I use websockets everywhere
    // else.
    if(postit && !SETTINGS.demo){
        fetch('/settings', {
            method: 'POST',
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({darkmode:mode})
        });
    }
}
change_dark_mode(SETTINGS.darkmode, 0);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e):void{
    change_dark_mode(SETTINGS.darkmode, 0);
});

// SYSTEM = 0
// DARK = 1
// LIGHT = 2
function system_prefers_darkmode(){
    return window.matchMedia('(prefers-color-scheme: dark)').matches
}
let current_dark_mode = localStorage.getItem('settings.darkmode') | 0;
function set_darkmode(mode){
    current_dark_mode = mode;
    let darkmode = false;
    switch(current_dark_mode){
        case 0:
            darkmode = system_prefers_darkmode();
            break;
        case 1:
            darkmode = true;
            break;
        case 2:
            darkmode = false;
            break;
    }
    if(darkmode){
        if(document.readyState === "complete" || document.readyState === 'interactive')
            document.body.classList.add('darkmode');
        document.documentElement.style.colorScheme = 'dark';
    }
    else {
        if(document.readyState === "complete" || document.readyState === 'interactive')
            document.body.classList.remove('darkmode');
        document.documentElement.style.colorScheme = 'light';
    }
}
set_darkmode(current_dark_mode);
document.addEventListener('DOMContentLoaded', function(){
    set_darkmode(current_dark_mode);
});

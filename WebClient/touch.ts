let IS_TOUCH = false;
document.addEventListener('DOMContentLoaded', function(){
    if(navigator.userAgent.includes('Mobile')){
        document.body.classList.add('mobile');
    }
    // Idk if this is right. The web is so bad, you can't directly
    // ask for what you want.
    if(window.matchMedia("(pointer: coarse)").matches) {
        IS_TOUCH = true;
        by_id('keyboardless-buttons').style.display = 'initial';
    }
});

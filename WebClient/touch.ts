//
// Copyright © 2021-2023, David Priver
//
let IS_TOUCH = false;
let IS_MOBILE = false;
const enum TOUCH {
    LONG_CLICK_WAIT = 300,
}
document.addEventListener('DOMContentLoaded', function():void{
    if(navigator.userAgent.includes('Mobile')){
        document.body.classList.add('mobile');
        IS_MOBILE = true;
        by_id('chatinput').rows = 1;
    }
    // Idk if this is right. The web is so bad, you can't directly
    // ask for what you want.
    if(window.matchMedia("(pointer: coarse)").matches) {
        IS_TOUCH = true;
        by_id('keyboardless-buttons').style.display = 'grid';
    }
});

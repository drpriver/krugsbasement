//
// Copyright © 2021-2022, David Priver
//

let show_pan = (function(){
    let sp = get_global(StorageCategory.SETTINGS, 'showpan');
    if(sp === undefined) return true;
    return sp === '1';
})();

(function(){
// idk where to put this
let SHOW_ZOOMERS = false;
function set_zoomers(show:boolean){
    by_id('zoomers').style.display = show?'block':'none';
    store_global(StorageCategory.SETTINGS, 'showzoomers', show);
    SHOW_ZOOMERS = show;
}
document.addEventListener('DOMContentLoaded', function(){
    // want boolean, not undefined or null
    let show = !!get_global(StorageCategory.SETTINGS, 'showzoomers');
    set_zoomers(show);
});

function setchatname(name:string){
    if(name) name = name.trim();
    if(!name) name = 'anon';
    sync_local(StorageCategory.CHAT, 'name', name);
}

function set_chat_vis(show:boolean){
    SETTINGS.hidechat = show;
    if(SETTINGS.hidechat){
        by_id('chat').style.height = 'auto';
        by_id('notifications').style.display = 'none';
        by_id('chat-history').style.display = 'none';
        by_id('macro-panel').style.display = 'none';
        by_id('dice-history').style.display = 'none';
        by_id('chatinput').style.display = 'none';
    }
    else {
        by_id('chat').style.height = '100vh';
        by_id('notifications').style.display = 'grid';
        by_id('chat-history').style.display = 'initial';
        by_id('macro-panel').style.display = 'grid';
        by_id('dice-history').style.display = 'initial';
        by_id('chatinput').style.display = 'initial';
    }
    signal_for(ListenEvent.LAYOUT_CHANGED);
    store_local(StorageCategory.SETTINGS, 'hidechat', show);
}
document.addEventListener('DOMContentLoaded', function(){
    set_chat_vis(!!get_local(StorageCategory.SETTINGS, 'hidechat'));
});

document.addEventListener('DOMContentLoaded', function(){
    const pan_tool = by_id('pan-tool');
    pan_tool.style.display = show_pan? 'initial': 'none';
});
function change_pan_visibility(visible:boolean){
    show_pan = visible;
    if(visible)
        store_global(StorageCategory.SETTINGS, 'showpan', '1');
    else
        store_global(StorageCategory.SETTINGS, 'showpan', '0');
    const pan_tool = by_id('pan-tool');
    pan_tool.style.display = visible? 'initial': 'none';
}


let options_init = false;
function options_dialog(){
    let dialog = get_dialog('options');
    if(!dialog) return;
    const is_dev = SETTINGS.chat.name == 'dev';
    const pan_tool = by_id('pan-tool');
    dialog.f.chatname.value = SETTINGS.chat.name;
    dialog.f.dev.style.display = is_dev?'block':'none';
    if(!options_init){
        options_init = true;
        dialog.f['export-map'].addEventListener('click', function(){
            // @ts-ignore
            let data = export_maps();
            let a = document.createElement('a');
            a.download = 'maps.json'
            a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'text/plain'}));
            a.click();
        });
        dialog.f.screenshot.addEventListener('click', function(){
            // @ts-ignore
            screenshot();
        });
        if (SETTINGS.demo){
            dialog.f['import-map'].addEventListener('click', function(){
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.onchange = function(){
                    const files = inp.files;
                    if(!files) return;
                    if(!files.length) return;
                    const file = files[0];
                    const fr = new FileReader();
                    fr.onload = function(){
                        if(!fr.result) return;
                        // @ts-ignore
                        const new_data = JSON.parse(fr.result);
                        // @ts-ignore
                        import_maps(new_data);
                        dialog.hide();
                    };
                    fr.readAsText(file);
                };
                inp.click();
            });
        }
        else{
            dialog.f['import-map'].style.display = 'none';
        }
        dialog.f.fullscreen.addEventListener('click', function(){
            // @ts-ignore
            if(!document.fullscreenElement && ! document.webkitFullscreenElement) {
                if(document.documentElement.requestFullscreen)
                    document.documentElement.requestFullscreen();
                // @ts-ignore
                else if(document.documentElement.webkitRequestFullscreen)
                    // @ts-ignore
                    document.documentElement.webkitRequestFullscreen();
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
                // @ts-ignore
                else if(document.webkitExitFullscreen){
                    // @ts-ignore
                    document.webkitExitFullscreen();
                }
            }
        });
        dialog.f.system.name = 'darkmode';
        dialog.f.dark.name = 'darkmode';
        dialog.f.light.name = 'darkmode';
        dialog.f.system.checked = false;
        dialog.f.dark.checked = false;
        dialog.f.light.checked = false;
        dialog.f.hidepan.checked = pan_tool.style.display == 'none';
        dialog.f.hidepan.addEventListener('change', function(){
            change_pan_visibility(!dialog.f.hidepan.checked);
        });
        dialog.f.showzoom.checked = SHOW_ZOOMERS;
        dialog.f.showzoom.addEventListener('change', function(){
            set_zoomers(dialog.f.showzoom.checked);
        });
        dialog.f.hidechat.checked = !!SETTINGS.hidechat;
        dialog.f.hidechat.addEventListener('change', function(){
            set_chat_vis(dialog.f.hidechat.checked);
        });
        switch(SETTINGS.darkmode){
            case DarkMode.SYSTEM: dialog.f.system.checked = true; break;
            case DarkMode.DARK:   dialog.f.dark.checked   = true; break;
            case DarkMode.LIGHT:  dialog.f.light.checked  = true; break;
        }
        dialog.f.system.onchange = function(){change_dark_mode(DarkMode.SYSTEM, 1);};
        dialog.f.dark.onchange   = function(){change_dark_mode(DarkMode.DARK, 1);};
        dialog.f.light.onchange  = function(){change_dark_mode(DarkMode.LIGHT, 1);};
    }
    dialog.show_handler = function(){
        if(!IS_TOUCH) dialog.f.chatname.focus();
    }
    dialog.ok_handler = function(){
        if(is_dev) debug_show_fps(dialog.f.fps.checked);
        if(SETTINGS.chat.name != dialog.f.chatname.value.trim()){
            setchatname(dialog.f.chatname.value);
            sync_local(StorageCategory.CHAT, 'name', dialog.f.chatname.value);
        }
    }
    dialog.show();
}

document.addEventListener('DOMContentLoaded', function(){
    by_id('options-button').addEventListener('click', options_dialog);
});
}());

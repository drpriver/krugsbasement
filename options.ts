//
// Copyright © 2021-2022, David Priver
//

(function(){
function setchatname(name:string){
    if(name) name = name.trim();
    if(!name) name = 'anon';
    sync_local(StorageCategory.CHAT, 'name', name);
}

let options_init = false;
function options_dialog(){
    let dialog = get_dialog('options');
    if(!dialog) return;
    const is_dev = SETTINGS.chat.name == 'dev';
    const pan_tool = by_id('pan-tool');
    dialog.f.chatname.value = SETTINGS.chat.name;
    dialog.f.dev.style.display = is_dev?'block':'none';
    dialog.f.fps.checked = showing_fps();
    dialog.f['export-map'].addEventListener('click', function(){
        let data = export_maps();
        let a = document.createElement('a');
        a.download = 'maps.json'
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'text/plain'}));
        a.click();
    });
    dialog.f.screenshot.addEventListener('click', function(){
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
    if(!options_init){
        options_init = true;
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

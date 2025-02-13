//
// Copyright © 2021-2024, David Priver
//

let show_pan = (function():boolean{
    let sp = get_global(StorageCategory.SETTINGS, 'showpan');
    if(sp === undefined) return true;
    return sp === '1';
})();

function set_chat_vis(show:boolean):void{
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
        by_id('chat').style.height = '';
        by_id('notifications').style.display = ''
        by_id('chat-history').style.display = ''
        by_id('macro-panel').style.display = ''
        by_id('dice-history').style.display = ''
        by_id('chatinput').style.display = ''
    }
    signal_for(ListenEvent.LAYOUT_CHANGED);
    store_local(StorageCategory.SETTINGS, 'hidechat', show);
}
function set_left_vis(show:boolean):void{
    SETTINGS.hideleft = show;
    if(SETTINGS.hideleft)
        by_id('left').style.display = 'none';
    else
        by_id('left').style.display = 'grid';
    signal_for(ListenEvent.LAYOUT_CHANGED);
    store_local(StorageCategory.SETTINGS, 'hideleft', show);
}
listen_for(ListenEvent.LAYOUT_CHANGED, function(){
    const m = by_id('minimized');
    let w = 80;
    if(by_id('left').style.display != 'none'){
        by_id('minimized').style.left = '';
        by_id('scale').style.left = '';
        w += 200;
    }
    else {
        by_id('minimized').style.left = '80px';
        by_id('scale').style.left = '0px';
    }
    if(by_id('chat').style.height == ''){
        w += 260;
    }
    m.style.width = `calc(100vw - ${w}px)`;
});
let tools_restorer: HTMLSpanElement | null;
function set_tools_vis(show:boolean):void{
    SETTINGS.hidetools = show;
    if(SETTINGS.hidetools){
        if(!tools_restorer){

            tools_restorer = elem_with_parent(by_id('minimized'), 'span');
            elem_parent_text(tools_restorer, 'span', 'Tools □');
            tools_restorer.onclick = function(e:MouseEvent):void{
                e.stopPropagation();
                e.preventDefault();
                set_tools_vis(false);
            };
            tools_restorer.oncontextmenu = function(e:MouseEvent):void{
                const menu = ctx_menu(e);
                menu.item('Restore', function(){set_tools_vis(false);});
                menu.separator();
                menu.canceller();
                menu.install();
            };
        }
        tools_restorer.style.display = 'inline';
        by_id('tool-container').style.display = 'none';
    }
    else{
        if(tools_restorer)
            tools_restorer.style.display = 'none';
        by_id('tool-container').style.display = 'flex';
    }
    signal_for(ListenEvent.LAYOUT_CHANGED);
    store_local(StorageCategory.SETTINGS, 'hidetools', show);
}

// idk where to put this
let SHOW_ZOOMERS = false;
function set_zoomers(show:boolean):void{
    by_id('zoomers').style.display = show?'grid':'none';
    store_global(StorageCategory.SETTINGS, 'showzoomers', show);
    SHOW_ZOOMERS = show;
}
document.addEventListener('DOMContentLoaded', function():void{
    // want boolean, not undefined or null
    let show = !!get_global(StorageCategory.SETTINGS, 'showzoomers');
    set_zoomers(show);
});

function setchatname(name:string):void{
    if(name) name = name.trim();
    if(!name) name = 'anon';
    sync_local(StorageCategory.CHAT, 'name', name);
}

document.addEventListener('DOMContentLoaded', function():void{
    set_chat_vis(!!get_local(StorageCategory.SETTINGS, 'hidechat'));
    set_left_vis(!!get_local(StorageCategory.SETTINGS, 'hideleft'));
    set_tools_vis(!!get_local(StorageCategory.SETTINGS, 'hidetools'));
    // XXX this doesn't go in this file.
    window.ondragend = function(e:DragEvent):void{
        e.preventDefault();
    };
    window.ondrop = function(e:DragEvent):void{
        e.preventDefault();
    };
    window.ondragover = function(e:DragEvent):void{
        e.dataTransfer!.effectAllowed = 'none';
        e.preventDefault();
    };
});

document.addEventListener('DOMContentLoaded', function():void{
    const pan_tool = by_id('pan-tool');
    pan_tool.style.display = show_pan? 'initial': 'none';
});
function change_pan_visibility(visible:boolean):void{
    show_pan = visible;
    if(visible)
        store_global(StorageCategory.SETTINGS, 'showpan', '1');
    else
        store_global(StorageCategory.SETTINGS, 'showpan', '0');
    const pan_tool = by_id('pan-tool');
    pan_tool.style.display = visible? 'initial': 'none';
}


let options_init = false;
function options_dialog():void{
    let dialog = get_dialog('options');
    if(!dialog) return;
    const pan_tool = by_id('pan-tool');
    dialog.f.chatname.value = SETTINGS.chat.name;
    dialog.f.dev.style.display = SETTINGS.DEV?'block':'none';
    if(!options_init){
        options_init = true;
        dialog.f['export-map'].addEventListener('click', function():void{
            // @ts-ignore
            let data = export_maps();
            let a = document.createElement('a');
            a.download = 'maps.json'
            a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], {type:'application/json'}));
            a.click();
        });
        dialog.f.screenshot.addEventListener('click', function():void{
            // @ts-ignore
            screenshot();
        });
        if (SETTINGS.demo){
            dialog.f['import-map'].addEventListener('click', function():void{
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.accept = 'application/json,.json';
                inp.onchange = function():void{
                    const files = inp.files;
                    if(!files) return;
                    if(!files.length) return;
                    const file = files[0];
                    const fr = new FileReader();
                    fr.onload = function():void{
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
        dialog.f.fullscreen.addEventListener('click', function():void{
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
        dialog.f.hidepan.addEventListener('change', function():void{
            change_pan_visibility(!dialog.f.hidepan.checked);
        });
        dialog.f.showzoom.checked = SHOW_ZOOMERS;
        dialog.f.showzoom.addEventListener('change', function():void{
            set_zoomers(dialog.f.showzoom.checked);
        });
        dialog.f.hidechat.checked = !!SETTINGS.hidechat;
        dialog.f.hidechat.addEventListener('change', function():void{
            set_chat_vis(dialog.f.hidechat.checked);
        });
        dialog.f.hideleft.checked = !!SETTINGS.hideleft;
        dialog.f.hideleft.addEventListener('change', function():void{
            set_left_vis(dialog.f.hideleft.checked);
        });
        dialog.f.hidetools.checked = !!SETTINGS.hidetools;
        dialog.f.hidetools.addEventListener('change', function():void{
            set_tools_vis(dialog.f.hidetools.checked);
        });
        switch(SETTINGS.darkmode){
            case DarkMode.SYSTEM: dialog.f.system.checked = true; break;
            case DarkMode.DARK:   dialog.f.dark.checked   = true; break;
            case DarkMode.LIGHT:  dialog.f.light.checked  = true; break;
        }
        dialog.f.system.onchange = function():void{change_dark_mode(DarkMode.SYSTEM, 1);};
        dialog.f.dark.onchange   = function():void{change_dark_mode(DarkMode.DARK, 1);};
        dialog.f.light.onchange  = function():void{change_dark_mode(DarkMode.LIGHT, 1);};
    }
    dialog.show_handler = function():void{
        if(!IS_TOUCH) dialog.f.chatname.focus();
    }
    dialog.ok_handler = function():void{
        if(SETTINGS.chat.name != dialog.f.chatname.value.trim()){
            setchatname(dialog.f.chatname.value);
            sync_local(StorageCategory.CHAT, 'name', dialog.f.chatname.value);
        }
    }
    dialog.show();
}

document.addEventListener('DOMContentLoaded', function():void{
    by_id('options-button').addEventListener('click', options_dialog);
});

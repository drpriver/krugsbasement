//
// Copyright © 2021-2026, David Priver <david@davidpriver.com>
//

type Dialog<Key extends keyof DialogIdMap> = {
    // the fields
    f: DialogIdMap[Key];
    title: HTMLHeadingElement;
    close: HTMLSpanElement;
    ok: HTMLButtonElement;
    cancel: HTMLButtonElement;
    ok_handler?: ()=>void;
    cancel_handler?: ()=>void;
    show_handler?: ()=>void;
    hide_handler?: ()=>void;
    hidden: boolean;
    show: ()=>void;
    hide: ()=>void;
    clear_handlers: ()=>void;
    window: HTMLDivElement;
    windowhandle: HTMLDivElement;
    make_top: ()=>void;
}


let OPENDIALOG: Dialog<keyof DialogIdMap> | null;
function make_dialog<Key extends keyof DialogIdMap>(name:Key, fields: Array<string>):Dialog<Key>{
    // this is kind of a hack, but I don't know how to do imperative
    // initialization while satisfying ts.
    const result:Dialog<Key> = {
        window: get_by_id<HTMLDivElement>(name),
        windowhandle: get_by_id<HTMLDivElement>(name+'-window-handle'),
        close: get_by_id<HTMLSpanElement>(name+'-window-close'),
        hidden: true,
        ok: get_by_id<HTMLButtonElement>(name+'-ok'),
        cancel: get_by_id<HTMLButtonElement>(name+'-cancel'),
        title: get_by_id<HTMLHeadingElement>(name+'-title'),
        f: {},
    } as Dialog<Key>;
    let f: any = result.f as any;
    result.window.style.position = 'fixed';
    result.window.style.transform = 'none';
    setup_movable_window(result.window, result.windowhandle, WINDOWFLAGS.NONE);
    result.make_top = setup_zsorted_window(result.window);
    // The caller of this function should be generated, so this is safe,
    // despite being based on any.
    for(let field of fields){
        let key = name + '-' + field;
        let el = get_by_id(key) as any;
        if(!el) throw new Error();
        if(el.tagName == 'TEXTAREA' || el.tagName == 'INPUT'){
            if(!(el.tagName == 'TEXTAREA' && name == 'make-variable'))
            el.addEventListener('keydown', function(e:KeyboardEvent):void{
                let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
                if(name == 'multiline-text' || name == 'md-text'){
                    if(e.key == 'Enter' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey){
                        e.preventDefault();
                        e.stopPropagation();
                        result.ok.click();
                        return;
                    }
                }
                if(modified) return;
                if(e.key == "Enter"){
                    if(name == 'multiline-text' || name == 'md-text')
                        return;
                    e.preventDefault();
                    e.stopPropagation();
                    result.ok.click();
                    return;
                }
                if(e.key == 'Escape'){
                    e.preventDefault();
                    e.stopPropagation();
                    el.blur();
                    return;
                }
            });
            if(el.tagName == 'TEXTAREA' && name == 'multiline-text'){
                el.rows = 20;
                el.cols = 40;
            }
        }
        f[field] = el;
    }
    result.hide = function():void{
        result.hidden = true;
        OPENDIALOG = null;
        result.window.style.display = 'none';
        if(result.hide_handler)
            result.hide_handler();
        if(document.activeElement){
            try{
                (document.activeElement as any).blur();
            }catch(e){
            }
        }
    };
    result.show = function():void{
        if(!result.hidden) return;
        result.hidden = false;
        OPENDIALOG = result;
        result.window.style.display = 'initial';
        center_element(result.window);
        result.make_top();
        if(result.show_handler)
            result.show_handler();
        return;
    };
    result.ok.addEventListener('click', function():void{
        if(result.ok_handler)
            result.ok_handler();
        result.hide();
    });
    function cancel():void{
        if(result.cancel_handler)
            result.cancel_handler();
        result.hide();
    }
    result.cancel.addEventListener('click', cancel);
    result.close.addEventListener('click', cancel);
    result.clear_handlers = function():void{
        result.ok_handler = undefined;
        result.cancel_handler = undefined;
        result.show_handler = undefined;
        result.hide_handler = undefined;
    };
    return result;
}

// So this really returns a Dialog or null, but ts doesn't properly propagate
// the non-nullness in closures. oh well.
function get_dialog<Key extends keyof DialogIdMap>(name:Key):Dialog<Key>{
    let dialog = get_or_make_dialog(name);
    // if(!dialog.hidden) return null as unknown as any;
    if(OPENDIALOG) OPENDIALOG.cancel.click();
    dialog.clear_handlers();
    if(name == 'simple-text'){
        (dialog as Dialog<'simple-text'>).f.textlabel.textContent = 'Text:';
        (dialog as Dialog<'simple-text'>).f.text.value = '';
    }
    return dialog;
}

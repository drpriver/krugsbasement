//
// Copyright © 2021-2023, David Priver
//

// local vs global refers to the website - whether it
// is for this page or for the entire site.


const enum StorageCategory {
    MACROS = 'macros',
    CHAT = 'chat',
    CANVAS = 'canvas',
    SETTINGS = 'settings',
    WINDOW = 'window',
}

const THISPAGE = window.location.pathname;
let local_sync_in_flight = false;
let local_needs_sync:Array<[string, string]> = [];

function sync_the_local_settings():void{
    let emitted:Map<string, Set<string>> = new Map();
    for (let [c, k] of local_needs_sync){
        // @ts-ignore
        if(emitted.has(c) && emitted.get(c).has(k))
            continue;
        if(!emitted.has(c))
            emitted.set(c, new Set());
        // @ts-ignore
        emitted.get(c).add(k);
        // @ts-ignore
        EMIT(FromClient.STORE_LOCAL_SETTING, [c, k, JSON.stringify(SETTINGS[c][k])]);
    }
    local_needs_sync = [];
    local_sync_in_flight = false;
}

function queue_sync_the_local_settings():void{
    if(local_sync_in_flight)
        return;
    local_sync_in_flight = true;
    if(SETTINGS.demo)
        sync_the_local_settings();
    else
        setTimeout(sync_the_local_settings, 1000);
}

function sync_local(category:StorageCategory, key:string, obj:any):void{
    // @ts-ignore
    SETTINGS[category][key] = obj;
    local_needs_sync.push([category, key]);
    queue_sync_the_local_settings();
}

function store_local(category:StorageCategory, key:string, obj:any):void{
    let value = JSON.stringify(obj);
    let k = `${THISPAGE}/${category}.${key}`;
    localStorage.setItem(k, value);
}

function get_local(category:StorageCategory, key:string):any | undefined {
    let k = `${THISPAGE}/${category}.${key}`;
    let value = localStorage.getItem(k);
    if(!value) return undefined;
    let result = JSON.parse(value);
    return result;
}

function store_global(category:StorageCategory, key:string, obj:any):void{
    let value = JSON.stringify(obj);
    let k = `${category}.${key}`;
    localStorage.setItem(k, value);
}

function get_global(category:StorageCategory, key:string):any | undefined {
    let k = `${category}.${key}`;
    let value = localStorage.getItem(k);
    if(!value) return undefined;
    return JSON.parse(value);
}

function get_global_default<T>(category:StorageCategory, key:string, def:T):T{
    let k = `${category}.${key}`;
    let value = localStorage.getItem(k);
    if(!value) return def;
    return JSON.parse(value);
}

// we just use local storage for now, but this
// indirection means I can swap out the storage for
// something better later.

// local vs global refers to the website - whether it 
// is for this page or for the entire site.


const enum StorageCategory {
    MACROS = 'macros',
    CHAT = 'chat',
}
function store_local(category:StorageCategory, key:string, obj:any){
    let value = JSON.stringify(obj);
    let k = `${THISPAGE}/${category}.${key}`;
    localStorage.setItem(k, value);
}

function get_local(category:StorageCategory, key:string):any | undefined {
    let k = `${THISPAGE}/${category}.${key}`;
    let value = localStorage.getItem(k);
    if(!value) return undefined;
    return JSON.parse(value);
}

function store_global(category:StorageCategory, key:string, obj:any){
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

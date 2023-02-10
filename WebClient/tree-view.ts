//
// Copyright © 2023, David Priver
//

type TreeItem = {
    el: HTMLElement;
    sp: HTMLSpanElement;
    children?: Map<number, TreeItem>;
    parent: number|null;
    closed: boolean;
}

type TreeView = {
    on_click?:(key:number) => void;
    on_ctxmenu?:(key:number, e:MouseEvent) => void;
    on_drop?:(dropped:number, onto:number|null) => void;
    add_item:(name:string, key:number, parent:number|null)=>void;
    // like add_item, but doesn't rebuild the tree.
    _add_item:(name:string, key:number, parent:number|null)=>void;
    change_parent:(key:number, parent:number|null)=>void;
    rename:(key:number, name:string)=>void;
    remove:(key:number) => void;
    get_sp:(key:number) => HTMLElement|null;
    clear:()=>void;
    has_children:(key:number)=>boolean;
    _container: HTMLElement
    _items: Map<number, TreeItem>;
    _collapse_item: (item:TreeItem)=>void;
    _expand_item: (item:TreeItem)=>void;
    // Could do this reactively or whatever, but that was just too
    // complicated.
    _rebuild:()=>void;
    mime: string;
}

function
make_tree_view(_container: HTMLElement, domain:string):TreeView{
    const mime = 'application/krug-'+domain;
    _container.ondragover = function(e:DragEvent):void{
        if(!e.dataTransfer!.types.includes(mime)) return;
        e.stopPropagation();
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        _container.classList.add('dragover');
    };
    _container.ondragleave = function(e:DragEvent):void{
        if(!e.dataTransfer!.types.includes(mime)) return;
        _container.classList.remove('dragover');
    };
    _container.ondragenter = function(e:DragEvent):void{
        if(!e.dataTransfer!.types.includes(mime)) return;
        e.dataTransfer!.dropEffect = 'move';
        _container.classList.add('dragover');
        e.stopPropagation();
        e.preventDefault();
    };
    _container.ondrop = function(e:DragEvent):void{
        if(!e.dataTransfer!.types.includes(mime)) return;
        e.stopPropagation();
        e.preventDefault();
        _container.classList.remove('dragover');
        const data = +e.dataTransfer!.getData(mime);
        result.change_parent(data, null);
        if(result.on_drop)
            result.on_drop(data, null);
    };
    const result: TreeView = {
        add_item:(name:string, key:number, parent:number|null):void=>{
            result._add_item(name, key, parent);
            result._rebuild();
        },
        _add_item:(name:string, key:number, parent:number|null):void=>{
            const el = elem('div', null, 'tree-item');
            el.draggable = true;
            const tog = elem_with_parent(el, 'span', null, 'toggle');
            // tog.textContent = '•';
            tog.textContent = '▶';
            const sp = elem_parent_text(el, 'span', name, null, 'name');
            let me = false;
            el.ondragstart = function(e:DragEvent):void{
                e.dataTransfer!.setData(mime, ''+key)
                e.dataTransfer!.effectAllowed = 'all';
                me = true;
                el.classList.add('dragging');
                e.stopPropagation();
            };
            el.ondragover = function(e:DragEvent):void{
                if(!e.dataTransfer!.types.includes(mime)) return;
                e.stopPropagation();
                e.preventDefault();
                if(me) return;
                e.dataTransfer!.dropEffect = 'move';
                el.classList.add('dragover');
            };
            el.ondragenter = function(e:DragEvent):void{
                if(!e.dataTransfer!.types.includes(mime)) return;
                e.preventDefault();
                e.stopPropagation();
                if(me) return;
                el.classList.add('dragover');
                e.dataTransfer!.dropEffect = 'move';
            };
            el.ondragleave = function(e:DragEvent):void{
                if(!e.dataTransfer!.types.includes(mime)) return;
                el.classList.remove('dragover');
            };
            el.ondragend = function(e:DragEvent):void{
                me = false;
                el.classList.remove('dragging');
            };
            el.ondrop = function(e:DragEvent):void{
                if(!e.dataTransfer!.types.includes(mime)) return;
                e.stopPropagation();
                e.preventDefault();
                el.classList.remove('dragover');
                if(me) return;
                const data = +e.dataTransfer!.getData(mime);
                if(data == key) return;
                if(result.on_drop)
                    result.on_drop(data as number, key);
                result.change_parent(data as number, key);
            };
            el.onclick = function(e:MouseEvent):void{
                // I don't know why this has to be here.
                // Other things don't suffer from this
                // onclick/oncontextmenu confusion from mac ctrl-clicks.
                if(IS_MAC && e.ctrlKey) return;
                e.stopPropagation();
                e.preventDefault();
                if(result.on_click) result.on_click(key);
            };
            tog.onclick = function(e:MouseEvent):void{
                e.stopPropagation();
                e.preventDefault();
                const item = result._items.get(key);
                if(!item) return;
                if(item.el.classList.contains('closed')){
                    result._expand_item(item);
                    tog.textContent = '▼';
                }
                else{
                    result._collapse_item(item);
                    tog.textContent = '▶';
                }
            };
            el.oncontextmenu = function(e:MouseEvent):void{
                if(result.on_ctxmenu) result.on_ctxmenu(key, e);
            };
            const item:TreeItem = {
                el,
                sp,
                parent,
                closed: true,
            };
            if(parent !== null && result._items.has(parent)){
                const pitem = result._items.get(parent)!;
                if(!pitem.children)
                    pitem.children = new Map();
                pitem.children.set(key, item);
            }
            result._items.set(key, item);
        },
        rename:(key:number, name:string):void=>{
            const item = result._items.get(key);
            if(!item) return;
            item.sp.textContent = name;
        },
        change_parent:(key:number, parent:number|null):void=>{
            if(key === parent) return;
            const item = result._items.get(key);
            if(!item) return;
            if(item.parent === parent) return;
            for(let p = parent; p !== null;){
                if(p === key) return;
                const it = result._items.get(p);
                if(!it) break;
                p = it.parent;
            }
            if(item.parent !== null && result._items.has(item.parent)){
                const pitem = result._items.get(item.parent)!;
                pitem.children!.delete(key);
            }
            item.parent = parent;
            if(parent !== null && result._items.has(parent)){
                const pitem = result._items.get(parent)!;
                if(!pitem.children)
                    pitem.children = new Map();
                pitem.children.set(key, item);
            }
            result._rebuild();
        },
        remove:(key:number):void=>{
            const item = result._items.get(key);
            if(!item) return;
            if(item.children && item.children.size) return;
            item.el.remove();
            result._items.delete(key);
            if(item.parent !== null && result._items.has(item.parent)){
                const pitem = result._items.get(item.parent)!;
                pitem.children!.delete(key);
                if(!pitem.children!.size)
                    pitem.el.classList.remove('parent');
                item.parent = null;
            }
        },
        clear:():void=>{
            result._container.replaceChildren();
            result._items.clear();
        },
        get_sp:(key:number):HTMLElement|null=>{
            const it = result._items.get(key);
            return it?it.sp:null;
        },
        has_children:(key:number):boolean=>{
            const it = result._items.get(key);
            return !!(it && it.children && it.children.size);
        },
        _collapse_item:(item:TreeItem):void=>{
            if(!item.children || !item.children.size) return;
            item.closed = true;
            result._rebuild();
        },
        _expand_item:(item:TreeItem):void=>{
            if(!item.children || !item.children.size) return;
            item.closed = false;
            result._rebuild();
        },
        _rebuild:():void=>{
            result._container.replaceChildren();
            const toplevel = [];
            for(const it of result._items.values()){
                if(it.parent !== null && result._items.has(it.parent))
                    continue;
                toplevel.push(it);
            }
            function addit(items:Array<TreeItem>, depth:number):void{
                for(const it of items){
                    result._container.append(it.el);
                    if(!it.children || !it.children.size){
                        it.el.classList.remove('parent');
                        it.el.style.marginLeft = `${depth}em`;
                    }
                    else {
                        it.el.classList.add('parent');
                        it.el.style.marginLeft = `${depth+1}em`;
                    }
                    if(it.closed){
                        it.el.classList.add('closed');
                        continue;
                    }
                    it.el.classList.remove('closed');
                    if(!it.children || !it.children.size)
                        continue;
                    const children = Array.from(it.children.values());
                    addit(children, depth+1);
                }
            }
            addit(toplevel, 0);
        },
        _container,
        _items: new Map(),
        mime,
    };
    return result;
}

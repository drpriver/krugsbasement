//
// Copyright © 2023, David Priver
//

type TreeItem<K> = {
    el: HTMLElement;
    sp: HTMLSpanElement;
    children?: Map<K, TreeItem<K>>;
    parent: K|null;
}

function ti_depth<K>(tv:TreeView<K>, ti:TreeItem<K>):number{
    let depth = 0;
    while(ti.parent !== null){
        depth++;
        ti = tv._items.get(ti.parent)!;
        if(!ti) break;
    }
    return depth;
}

type TreeView<K> = {
    on_click?:(key:K) => void;
    on_ctxmenu?:(key:K, e:MouseEvent) => void;
    add_item:(name:string, key:K, parent:K|null)=>void;
    change_parent:(key:K, parent:K|null)=>void;
    rename:(key:K, name:string)=>void;
    remove:(key:K) => void;
    get_sp:(key:K) => HTMLElement|null;
    clear:()=>void;
    has_children:(key:K)=>boolean;
    _container: HTMLElement
    _items: Map<K, TreeItem<K>>;
    _collapse_item: (item:TreeItem<K>)=>void;
    _expand_item: (item:TreeItem<K>)=>void;
    _hide_item: (item:TreeItem<K>)=>void;
    _show_item: (item:TreeItem<K>)=>void;
}

function
make_tree_view<K>(_container: HTMLElement):TreeView<K>{
    const result: TreeView<K> = {
        add_item:(name:string, key:K, parent:K|null):void=>{
            const el = elem('div', null, 'tree-item');
            const tog = elem_with_parent(el, 'span', null, 'toggle');
            // tog.textContent = '•';
            tog.textContent = '▶';
            const sp = elem_parent_text(el, 'span', name, null, 'name');
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
            const item:TreeItem<K> = {
                el,
                sp,
                parent,
            };
            if(parent !== null && result._items.has(parent)){
                const pitem = result._items.get(parent)!;
                pitem.el.after(el);
                if(!pitem.children)
                    pitem.children = new Map();
                pitem.children.set(key, item);
                pitem.el.classList.add('parent');
            }
            else {
                result._container.append(el);
            }
            const depth = ti_depth(result, item);
            el.style.marginLeft = `${depth+1}em`;
            result._items.set(key, item);
        },
        rename:(key:K, name:string):void=>{
            const item = result._items.get(key);
            if(!item) return;
            item.sp.textContent = name;
        },
        change_parent:(key:K, parent:K|null):void=>{
            const item = result._items.get(key);
            if(!item) return;
            if(item.parent === parent) return;
            item.el.remove();
            if(item.parent !== null && result._items.has(item.parent)){
                const pitem = result._items.get(item.parent)!;
                pitem.children!.delete(key);
                if(!pitem.children!.size)
                    pitem.el.classList.remove('parent');
            }
            item.parent = parent;
            const depth = ti_depth(result, item);
            item.el.style.marginLeft = `${depth+1}em`;
            if(parent === null || !result._items.has(parent)){
                result._container.append(item.el);
                return;
            }
            const pitem = result._items.get(parent)!;
            if(!pitem.children) pitem.children = new Map();
            pitem.children.set(key, item);
            pitem.el.after(item.el);
            pitem.el.classList.add('parent');
        },
        remove:(key:K):void=>{
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
            if(item.children){
                for(const it of item.children.keys())
                    result.remove(it);
            }
        },
        clear:():void=>{
            result._container.replaceChildren();
            result._items.clear();
        },
        get_sp:(key:K):HTMLElement|null=>{
            const it = result._items.get(key);
            return it?it.sp:null;
        },
        has_children:(key:K):boolean=>{
            const it = result._items.get(key);
            return !!(it && it.children && it.children.size);
        },
        // This logic is buggy in the presence of nested lists.
        _hide_item:(item:TreeItem<K>):void=>{
            item.el.classList.add('hidden');
            if(!item.children) return;
            for(const ch of item.children.values())
                result._hide_item(ch);
        },
        _show_item:(item:TreeItem<K>):void=>{
            item.el.classList.remove('hidden');
            if(!item.children) return;
            for(const ch of item.children.values())
                result._show_item(ch);
        },
        _collapse_item:(item:TreeItem<K>):void=>{
            if(!item.children || !item.children.size) return;
            item.el.classList.add('closed');
            for(const ch of item.children.values())
                result._hide_item(ch);
        },
        _expand_item:(item:TreeItem<K>):void=>{
            item.el.classList.remove('closed');
            if(!item.children || !item.children.size) return;
            for(const ch of item.children.values())
                result._show_item(ch);
        },
        _container,
        _items: new Map(),
    };
    return result;
}

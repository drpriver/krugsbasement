//
// Copyright © 2021-2024, David Priver
//
type ListView<K> = {
    column: HTMLDivElement;
    items: Array<[K, HTMLDivElement]>;
    remove:(v:K) => void;
    add_item: (_:string, v:K)=>void;
    make_active:(v:K | undefined) => void;
    rename:(text:string, v:K)=>void;
    activate_handler?:(k:K|undefined)=>void;
    active?: K;
    clear: ()=>void;
    // this is called after removing via the user clicking the icon.
    user_remove_handler?:(k:K)=>void;
    // this is called after renaming via the user clicking the icon.
    user_rename_handler?:(k:K, text:string)=>void;
    index_of:(k:K)=>number;
};

const enum ListViewFlags {
    NONE = 0,
    // Can be renamed via the list view itself, handler will be called
    USER_RENAMABLE = 1 << 0,
    USER_DELETABLE = 1 << 1,
    USER_MOVABLE   = 1 << 2, // unused apparently?
    FOCUSABLE      = 1 << 3,
    ALL = USER_RENAMABLE|USER_DELETABLE|USER_MOVABLE|FOCUSABLE
}
function make_list_view<K>(listcontainer:HTMLDivElement, flags:ListViewFlags):ListView<K>{
    let result: ListView<K> = {
        active: undefined,
        column: listcontainer,
        items: [],
        index_of: function(k:K):number{
            for(let i = 0; i < result.items.length; i++){
                if(result.items[i][0] === k)
                    return i;
            }
            return -1;
        },
        clear:function():void{
            for(let [_, el] of result.items)
                el.remove();
            result.active = undefined;
        },
        make_active: function(key:K | undefined):void{
            for(let [v, el] of result.items){
                el.classList.remove('active');
                if(v === key){
                    el.classList.add('active');
                    if(flags & ListViewFlags.FOCUSABLE){
                        if(document.activeElement !== el)
                            el.focus();
                    }
                }
            }
            result.active = key;
            if(result.activate_handler)
                result.activate_handler(key);
        },
        add_item: function(text:string, key:K):void{
            let el = document.createElement('div');
            el.oncontextmenu = function(e):void{
                const menu = ctx_menu(e);
                if(flags & ListViewFlags.USER_RENAMABLE){
                    menu.item('Rename', function():void{
                        user_edit_element(el.firstChild! as HTMLElement, 0, function(v:string):void{
                            result.rename(v, key);
                            if(result.user_rename_handler)
                                result.user_rename_handler(key, v);
                        });
                    });
                }
                if(flags & ListViewFlags.USER_DELETABLE){
                    menu.item('Delete', function():void{
                        const dialog = get_dialog('simple-delete');
                        if(!dialog) return;
                        dialog.title.innerText = 'Delete '+el.firstChild!.textContent;
                        dialog.f.delete.checked = false;
                        dialog.ok_handler = function():void{
                            if(!dialog.f.delete.checked) return;
                            result.remove(key);
                            if(result.user_remove_handler)
                                result.user_remove_handler(key);
                        };
                        dialog.show();
                    });
                }
                menu.item('Cancel');
                menu.install();
            };
            if(flags & ListViewFlags.FOCUSABLE){
                el.tabIndex = 0;
                el.onfocus = function():void{
                    result.make_active(key);
                };
                el.onkeydown = function(e:KeyboardEvent):void{
                    switch(e.key){
                        case 'ArrowDown':{
                            const i = result.index_of(key);
                            if(i+1 >= result.items.length)
                                return;
                            result.make_active(result.items[i+1][0]);
                        }break;
                        case 'ArrowUp':{
                            const i = result.index_of(key);
                            if(i-1 < 0)
                                return;
                            result.make_active(result.items[i-1][0]);
                        }break;
                    }
                };
            }
            elem_parent_text(el, 'span', text);
            let style = 'auto';
            el.style.gridTemplateColumns = style;
            el.addEventListener('click', function(e:MouseEvent):void{
                e.preventDefault();
                e.stopPropagation();
                result.make_active(key);
            });
            result.items.push([key, el]);
            result.column.appendChild(el);
        },
        remove: function(key:K):void{
            for(let i = 0; i < result.items.length; i++){
                let [v, el] = result.items[i]
                if(v === key){
                    el.remove();
                    result.items.splice(i, 1);
                    if(key == result.active){
                        if(i < result.items.length)
                            result.make_active(result.items[i][0]);
                        else if(i)
                            result.make_active(result.items[i-1][0]);
                        else
                            result.make_active(undefined);
                    }
                    return;
                }
            }
        },
        rename: function(text:string, key:K):void{
            for(let [v, el] of result.items){
                if(v === key){
                    el.firstChild!.textContent = text;
                    return;
                }
            }
        },
        activate_handler: undefined,
    };
    return result;
}

type DualListView<K1, K2> = {
    // K1 and K2 are things you use to uniquely identify
    // the entries in the lists. They need to give
    // sane results for '===' and when put in a Map.
    column1: HTMLDivElement;
    column2: HTMLDivElement;
    remove1: (k1:K1)=>void;
    remove2:(k1:K1, k2:K2)=>void;
    items1: Array<[K1, HTMLDivElement]>;
    items2: Map<K1, Array<[K2, HTMLDivElement]> >;
    add_item1:(text:string, k1:K1) =>void;
    add_item2:(text:string, k1:K1, k2:K2) =>void;
    make_active1:(k1:K1) => void;
    make_active2:(k1:K1, k2:K2) => void;
    rename1:(text:string, k1:K1) => void;
    rename2:(text:string, k1:K1, k2:K2) => void;
    // Called when there are no elements at all.
    activate0_handler?:()=>void;
    // activate1_handler is only called if k2 is not found during
    // a call to make_active1
    activate1_handler?:(k1:K1)=>void;
    activate2_handler?:(k1:K1, k2:K2)=>void;
    active1: K1 | undefined;
    active2: Map<K1, K2>;
    user_rename_handler1?:(k:K1, text:string)=>void;
    user_rename_handler2?:(k:K1, k2:K2, text:string)=>void;
    move_handler1?:(k1:K1, old_idx:number, offset:number)=>void;
    move_handler2?:(k1:K1, k2:K2, old_idx:number, offset:number) => void;
    move1:(k1:K1, offset:number) => void;
    move2:(k1:K1, k2:K2, offset:number) => void;
    user_remove_handler1?:(k:K1)=>void;
    user_remove_handler2?:(k1:K1, k2:K2)=>void;
};

function make_dual_list_view<K1, K2>(col1:HTMLDivElement, col2:HTMLDivElement, flags1:ListViewFlags, flags2:ListViewFlags):DualListView<K1, K2> {
    let result:DualListView<K1,K2> = {
        column1: col1,
        column2: col2,
        items1: [],
        items2: new Map(),
        activate0_handler: undefined,
        activate1_handler: undefined,
        activate2_handler: undefined,
        user_rename_handler1: undefined,
        user_rename_handler2: undefined,
        active1: undefined,
        active2: new Map(),
        move_handler1:undefined,
        move_handler2:undefined,
        user_remove_handler1:undefined,
        user_remove_handler2:undefined,
        make_active1: function(k1:K1):void{
            for(let [k, el] of result.items1){
                el.classList.remove('active');
                if(k === k1)
                    el.classList.add('active');
            }
            let prev = result.active1;
            result.active1 = k1;
            if(prev !== undefined){
                let olditems = result.items2.get(prev);
                if(olditems !== undefined){
                    for(let [_, el] of olditems){
                        el.remove();
                    }
                }
            }
            let items = result.items2.get(result.active1);
            if(items !== undefined){
                for(let [_, el] of items){
                    result.column2.appendChild(el);
                }
            }
            let k2 = result.active2.get(k1);
            if(k2 !== undefined)
                result.make_active2(k1, k2);
            else if(result.activate1_handler)
                result.activate1_handler(k1);
        },
        make_active2: function(k1: K1, k2:K2):void{
            if(result.active1 !== k1){
                result.active2.set(k1, k2);
                result.make_active1(k1);
                return;
            }
            let items = result.items2.get(k1)!;
            for(let [k, el] of items){
                el.classList.remove('active');
                if(k === k2)
                    el.classList.add('active');
            }
            result.active2.set(k1, k2);
            if(result.activate2_handler)
                result.activate2_handler(k1, k2);
        },
        add_item1: function(text:string, k1:K1):void{
            for(let [k, el] of result.items1){
                if(k === k1){
                    el.firstChild!.textContent = text;
                    return;
                }
            }
            let item = elem_with_parent(result.column1, 'div');
            item.oncontextmenu = function(e):void{
                const menu = ctx_menu(e);
                if(flags1 & ListViewFlags.USER_RENAMABLE){
                    menu.item('Rename', function():void{
                        user_edit_element(item.firstChild! as HTMLElement, 0, function(v:string):void{
                            result.rename1(v, k1);
                            if(result.user_rename_handler1)
                                result.user_rename_handler1(k1, v);
                        });
                    });
                }
                if(flags1 & ListViewFlags.USER_DELETABLE){
                    menu.item('Delete', function():void{
                        const dialog = get_dialog('simple-delete');
                        if(!dialog) return;
                        dialog.title.innerText = 'Delete '+item.firstChild!.textContent;
                        dialog.f.delete.checked = false;
                        dialog.ok_handler = function():void{
                            if(!dialog.f.delete.checked) return;
                            result.remove1(k1);
                            if(result.user_remove_handler1)
                                result.user_remove_handler1(k1);
                        };
                        dialog.show();
                    });
                }
                menu.item('Cancel');
                menu.install();
            };
            elem_parent_text(item, 'span', text);
            let style = 'auto';
            if(flags1 & ListViewFlags.USER_MOVABLE){
                style += ' 32px';
                const ud = elem('div', null, 'up-down');
                const up = elem_parent_text(ud, 'button', '▲', null, 'up');
                const down = elem_parent_text(ud, 'button', '▼', null, 'down');
                up.onclick = function(e:MouseEvent):void{
                    e.stopPropagation();
                    result.move1(k1, -1);
                };
                down.onclick = function(e:MouseEvent):void{
                    e.stopPropagation();
                    result.move1(k1, +1);
                }
                item.appendChild(ud);
            }
            item.style.gridTemplateColumns = style;
            item.addEventListener('click', function():void{
                result.make_active1(k1);
            });
            result.items1.push([k1, item]);
            result.items2.set(k1, []);
        },
        add_item2:function(text:string, k1:K1, k2:K2):void{
            let item = document.createElement('div');
            elem_parent_text(item, 'span', text);
            item.addEventListener('click', function():void{
                result.make_active2(k1, k2);
            });
            let style = 'auto';
            item.oncontextmenu = function(e):void{
                const menu = ctx_menu(e);
                if(flags2 & ListViewFlags.USER_RENAMABLE){
                    menu.item('Rename', function():void{
                        user_edit_element(item.firstChild! as HTMLElement, 0, function(v:string):void{
                            result.rename2(v, k1, k2);
                            if(result.user_rename_handler2)
                                result.user_rename_handler2(k1, k2, v);
                        });
                    });
                }
                if(flags2 & ListViewFlags.USER_DELETABLE){
                    menu.item('Delete', function():void{
                        const dialog = get_dialog('simple-delete');
                        if(!dialog) return;
                        dialog.title.innerText = 'Delete '+item.firstChild!.textContent;
                        dialog.f.delete.checked = false;
                        dialog.ok_handler = function():void{
                            if(!dialog.f.delete.checked) return;
                            result.remove2(k1, k2);
                            if(result.user_remove_handler2)
                                result.user_remove_handler2(k1, k2);
                        };
                        dialog.show();
                    });
                }
                menu.item('Cancel');
                menu.install();
            }
            if(flags2 & ListViewFlags.USER_MOVABLE){
                style += ' 32px';
                const ud = elem('div', null, 'up-down');
                const up = elem_parent_text(ud, 'button', '▲', null, 'up');
                const down = elem_parent_text(ud, 'button', '▼', null, 'down');
                up.onclick = function(e:MouseEvent):void{
                    e.stopPropagation();
                    result.move2(k1, k2, -1);
                };
                down.onclick = function(e:MouseEvent):void{
                    e.stopPropagation();
                    result.move2(k1, k2, +1);
                }
                item.appendChild(ud);
            }
            item.style.gridTemplateColumns = style;
            let items = result.items2.get(k1);
            if(items === undefined){
                items = [];
                result.items2.set(k1, items);
            }
            items.push([k2, item]);
            if(k1 === result.active1){
                result.column2.appendChild(item);
            }
        },
        rename1:function(text:string, k1:K1):void{
            for(let [k, el] of result.items1){
                if(k === k1){
                    el.firstChild!.textContent = text;
                    return;
                }
            }
        },
        rename2:function(text:string, k1:K1, k2:K2):void{
            let items = result.items2.get(k1);
            if(items === undefined) return;
            for(let [k, el] of items){
                if(k === k2){
                    el.firstChild!.textContent = text;
                    return;
                }
            }
        },
        remove1:function(k1:K1):void{
            let it2 = result.items2.get(k1);
            if(it2 !== undefined){
                for(let [_, el] of it2){
                    el.remove();
                }
            }
            result.items2.delete(k1);
            result.active2.delete(k1);
            for(let i = 0; i < result.items1.length; i++){
                let [k, el] = result.items1[i];
                if(k === k1){
                    el.remove();
                    result.items1.splice(i, 1);
                    if(k1 === result.active1){
                        if(!result.items1.length){
                            result.active1 = undefined;
                        }
                        else if(i == 0){
                            result.make_active1(result.items1[0][0]);
                        }
                        else
                            result.make_active1(result.items1[i-1][0]);
                    }
                    return;
                }
            }
        },
        remove2:function(k1:K1, k2:K2):void{
            let items = result.items2.get(k1);
            if(items === undefined) return;
            for(let i = 0; i < items.length; i++){
                let [k, el] = items[i];
                if(k === k2){
                    el.remove();
                    items.splice(i, 1);
                    if(k1 === result.active1){
                        if(k2 === result.active2.get(k1)){
                            if(i < items.length)
                                result.make_active2(k1, items[i][0]);
                            else if(i)
                                result.make_active2(k1, items[i-1][0]);
                            else{
                                result.active2.delete(k1);
                                result.make_active1(k1);
                            }
                        }
                    }
                    return;
                }
            }
        },
        move1:function(k1:K1, offset:number):void{
            let items = result.items1;
            let idx = -1;
            for(let i = 0; i < items.length; i++){
                if(items[i][0] == k1){
                    idx = i; break;
                }
            }
            if(idx < 0) return;
            if(idx + offset < 0)
                offset = -idx;
            if(idx + offset >= items.length)
                offset = items.length - offset -1;
            if(offset == 0)
                return;
            move_elem_by(items[idx][1], offset);
            move_item_by(items, idx, offset);
            if(result.move_handler1)
                result.move_handler1(k1, idx, offset);
        },
        move2:function(k1:K1, k2:K2, offset:number):void{
            let items = result.items2.get(k1)!;
            let idx = -1;
            for(let i = 0; i < items.length; i++){
                if(items[i][0] == k2){
                    idx = i; break;
                }
            }
            if(idx < 0) return;
            if(idx + offset < 0)
                offset = -idx;
            if(idx + offset >= items.length)
                offset = items.length - offset -1;
            if(offset == 0)
                return;
            move_elem_by(items[idx][1], offset);
            move_item_by(items, idx, offset);
            if(result.move_handler2)
                result.move_handler2(k1, k2, idx, offset);
        },
    };
    return result;
}

function move_item_by(arr:Array<any>, idx:number, off:number):void{
	let new_idx = idx + off;
	let item = arr[idx];
	arr.splice(idx, 1);
	arr.splice(new_idx, 0, item);
}
function move_elem_by(e:Node, off:number):void{
    let parent = e.parentNode!;
    let idx = -1;
    for(let i = 0; i < parent.childNodes.length; i++){
        if(parent.childNodes[i] === e){
            idx = i;
            break;
        }
    }
    if(idx < 0) return;
    let new_idx = idx + off;
    parent.removeChild(e);
    if(new_idx >= parent.childNodes.length){
        parent.appendChild(e); return;
    }
    let sib = parent.childNodes[new_idx];
    parent.insertBefore(e, sib);
}

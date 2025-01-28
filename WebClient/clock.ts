//
// Copyright © 2025, David Priver
//
type Clock = ClockData;


const clocks: Map<number, Clock> = new Map();
type ClockWindow = {
    w: HTMLElement;
    title: HTMLSpanElement;
    list_el: HTMLDivElement;
    value_el: HTMLDivElement;
    add_event_button: HTMLButtonElement;
    show: () => void;
    close: () => void;
};
const clock_windows: Map<number, ClockWindow> = new Map();
let clock_wants_show_new = false;
let clock_tv: TreeView;

function clock_rename_dialog(id: number):void{
    const c = clocks.get(id);
    if(!c) return;
    const d = get_dialog('simple-text');
    if(!d) return;
    d.clear_handlers();
    d.title.textContent = 'Clock Name';
    d.f.text.value = '';
    d.show_handler = function():void{
        if(!IS_TOUCH) setTimeout(()=>d.f.text.focus(),0);
    };
    d.ok_handler = function():void{
        const text = d.f.text.value.trim();
        if(!text) return;
        if(text == c.name) return;
        const msg: ClockEdit = {
          type:ClockMsgType.EDIT, 
          id:id, 
          name:text,
          value_name: c.value_name,
          value: c.value,
          flags: c.flags,
          hidinguser: c.hidinguser,
        };
        EMIT(FromClient.CLOCK, msg);
    };
    d.show();
}

function clock_apply(c: Clock): void{
  const w = get_clock_window(c.id);
  if(!w) return;
  w.list_el.replaceChildren();
  const events = c.events;
  events.sort(function(a: ClockEvent, b:ClockEvent):number{
      let aw = a.when;
      let bw = b.when; 
      if(aw == bw) return 0;
      if(c.flags & ClockFlags.DESCENDING)
          return aw < bw ? 1 : -1;
      return aw < bw? -1 : 1;
  });
  let separator = false;
  for(const ev of events){
      if(!separator){
          if(ev.when == c.value)
              separator = true;
          else {
              if(c.flags & ClockFlags.DESCENDING){
                  if(ev.when < c.value){
                    elem_with_parent(w.list_el, 'div', null, 'clock-event-sep');
                    separator = true;
                  }
              }
              else {
                  if(ev.when > c.value){
                    elem_with_parent(w.list_el, 'div', null, 'clock-event-sep');
                    separator = true;
                  }
              }
          }
      }
      clock_add_event(c, w.list_el, ev);
  }
  if(!separator && events.length) elem_with_parent(w.list_el, 'div', null, 'clock-event-sep');
}

function clock_add_event(c:Clock, list: HTMLDivElement, ev: ClockEvent):void{
    const id = c.id;
    const it = elem_with_parent(list, 'label', null, 'clock-event');
    const ev_id = ev.id;
    it.oncontextmenu = function(e:MouseEvent):void{
        const menu = ctx_menu(e);
        menu.checkbox('One-shot', ev.flags & ClockEventFlags.ONE_SHOT?true:false, function(b:boolean):void{
            let flags = ev.flags;
            if(b) flags |= ClockEventFlags.ONE_SHOT;
            else flags &= ~ClockEventFlags.ONE_SHOT;
            const ce : ClockEventEdit = {
                type:ClockMsgType.EVENT_EDIT, 
                clock_id:id, 
                id:ev.id,
                name: ev.name,
                when: ev.when,
                flags:flags,
            };
            EMIT(FromClient.CLOCK, ce);
        });
        menu.separator();
        menu.item('Delete', function(){
          const msg: ClockEventDelete = {
            type: ClockMsgType.EVENT_DELETE,
            clock_id: id,
            id: ev_id,
          };
          EMIT(FromClient.CLOCK, msg);
        });
        menu.separator();
        menu.canceller();
        menu.install();
    };
    it.dataset.id = ""+ev_id;
    const nm = elem_parent_text(it, 'span', ev.name)
    const wh = elem_parent_text(it, 'span', ""+ev.when)
    nm.onclick = function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        edit_element_inline(nm, EditElementFlags.SELECT, function(v:string):void{
            const ce : ClockEventEdit = {
                type:ClockMsgType.EVENT_EDIT, 
                clock_id:id, 
                id:ev.id,
                name:v,
                when: ev.when,
                flags: ev.flags,
            };
            EMIT(FromClient.CLOCK, ce);
        });
    };
    wh.onclick = function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        edit_element_inline(wh, EditElementFlags.NUMBER|EditElementFlags.SELECT, function(v:string):void{
            const t = +v;
            if(!Number.isNaN(t)){
                const ce : ClockEventEdit = {
                    type:ClockMsgType.EVENT_EDIT, 
                    clock_id: id, 
                    id: ev.id,
                    when: t,
                    name: ev.name,
                    flags: ev.flags,
                };
                EMIT(FromClient.CLOCK, ce);
            }
        });
    };
    if(c.flags & ClockFlags.DESCENDING){
        if(ev.when > c.value) it.classList.add('past');
    }
    else {
        if(ev.when < c.value) it.classList.add('past');
    }
    if(ev.when == c.value) it.classList.add('current');
    if(ev.flags & ClockEventFlags.ONE_SHOT) it.classList.add('one-shot');

}

function make_clock_window(id: number): ClockWindow{
    const openid = `/clocks/open/${id}`;
    const c = clocks.get(id)!;
    const wid = `clock-window-${id}`;
    const w = elem('div', wid, 'window2');
    w.tabIndex = 0;
    w.onclick = function(e:MouseEvent):void{
      e.stopPropagation();
      e.preventDefault();
      w.focus();
    }
    w.onkeydown = function(e:KeyboardEvent){
      switch(e.key){
        case 'ArrowDown':
        case 'ArrowRight':
        case 'n':
          e.stopPropagation();
          e.preventDefault();
          advance_b.click();
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
        case 'p':
          e.stopPropagation();
          e.preventDefault();
          prev_b.click();
          break;
      }
    }
    const wh = elem_with_parent(w, 'div', null, 'window-handle');
    const x = elem_parent_text(wh, 'span', '×', null, 'window-closer');
    const t = elem_parent_text(wh, 'span', c.name, null, 'window-title');
    const vtext = c.value_name?`${c.value_name}: ${c.value}`:`${c.value}`;
    const v = elem_parent_text(w, 'div', vtext, null, 'clock-value');
    v.onclick = function(e:MouseEvent):void{
      e.stopPropagation();
      e.preventDefault();
      edit_element_inline(
          v, 
          EditElementFlags.NUMBER|EditElementFlags.SELECT,
          function(s:string):void{
              const value = +s;
              if(Number.isNaN(value)) return;
              const ce: ClockEdit = {
                  type: ClockMsgType.EDIT,
                  id:id,
                  name: c.name,
                  value: value,
                  value_name: c.value_name,
                  flags: c.flags,
                  hidinguser: c.hidinguser,
              };
              EMIT(FromClient.CLOCK, ce);
          }
      );
    };
    const buttons = elem_with_parent(w, 'div', null, 'clock-adv-buttons');
    const prev_b = elem_parent_text(buttons, 'button', '←');
    const advance_b = elem_parent_text(buttons, 'button', '→');
    function emit_value(val:number):void{
      const msg: ClockEdit = {
        type: ClockMsgType.EDIT,
        id:id,
        name: c.name,
        value: val,
        value_name: c.value_name,
        flags: c.flags,
        hidinguser: c.hidinguser,
      };
      EMIT(FromClient.CLOCK, msg);
    }
    function advance(direction:number):void{
      if(direction > 0)
        for(let i = 0; i < c.events.length; i++){
          const ev = c.events[i];
          if(ev.flags & ClockEventFlags.ONE_SHOT && ev.when == c.value){
            const msg: ClockEventDelete = {
              type: ClockMsgType.EVENT_DELETE,
              clock_id: id,
              id: ev.id,
            };
            EMIT(FromClient.CLOCK, msg);
          }
        }
      if(c.flags & ClockFlags.DESCENDING)
        direction *= -1;
      if(!(c.flags & ClockFlags.ADVANCES_BY_EVENT))
        return emit_value(c.value+direction);
      const length = c.events.length;
      let di = (c.flags & ClockFlags.DESCENDING)?-direction:direction;
      let i = di < 0 ? length-1:0;
      for(;i >= 0 && i < length; i += di){
        const ev = c.events[i];
        if(direction < 0 && ev.when < c.value)
            return emit_value(ev.when);
        if(direction > 0 && ev.when > c.value)
            return emit_value(ev.when);
      }
      if(c.flags & ClockFlags.CYCLIC && length){
        i = di < 0 ? length-1:0;
        return emit_value(c.events[i].when);
      }
      return emit_value(c.value + direction);
    }
    prev_b.onclick = function(e:MouseEvent):void{
      e.stopPropagation();
      e.preventDefault();
      advance(-1);
    };
    advance_b.onclick = function(e:MouseEvent):void{
      e.stopPropagation();
      e.preventDefault();
      advance(1);
    };
    void prev_b; void advance_b;
    const list = elem_with_parent(w, 'div', null, 'clock-list');
    const add_event_button = elem_parent_text(w, 'button', '+');
    add_event_button.onclick = function():void{
        const diag = get_dialog('clock-event');
        if(!diag) return;
        diag.f.name.value = '';
        diag.f.value.value = '';
        diag.f.oneshot.checked = false;
        diag.show_handler = function(){
          setTimeout(() => diag.f.name.focus(), 0);
        };
        diag.ok_handler = function(){
          const name = diag.f.name.value.trim();
          if(!name) return;
          const value = +diag.f.value.value;
          if(Number.isNaN(value)) return;
          let flags = 0;
          if(diag.f.oneshot.checked)
            flags |= ClockEventFlags.ONE_SHOT;
          EMIT(FromClient.CLOCK, {type:ClockMsgType.EVENT_NEW, clock_id:id, name:name, when:value, flags:flags, id:0});
          setTimeout(() => add_event_button.focus(), 0);
        };
        diag.show();
    };
    setup_movable_window(w, wh, WINDOWFLAGS.LOCAL_REMEMBER);
    setup_resizable_window(w, RESIZEFLAGS.LOCAL_REMEMBER);
    const make_top = setup_zsorted_window(w);
    setup_closable_window(w, x, function():void{
      store_local(StorageCategory.WINDOW, openid, '');
    });
    function show():void{
        if(c.hidinguser && c.hidinguser != SETTINGS.userid)
          return;
        clock_apply(c);
        if(!w.parentElement) document.body.appendChild(w);
        w.style.display = 'grid';
        make_top();
        store_local(StorageCategory.WINDOW, openid, '1');
    }
    wh.oncontextmenu = function(e:MouseEvent):void{
        const menu = ctx_menu(e);
        menu.item('Show Others', function():void{
            EMIT(FromClient.CLOCK, {type:ClockMsgType.SHOW, id:id});
        });
        menu.item('Rename', function():void{
            clock_rename_dialog(id);
        });
        menu.separator();
        function f(name:string, flag: ClockFlags):void{
            menu.checkbox(name, c.flags & flag?true:false, function(b:boolean):void{
                let flags = c.flags;
                if(b) flags |= flag;
                else  flags &= ~flag;
                const msg: ClockEdit = {
                  type:ClockMsgType.EDIT, 
                  id:id, 
                  flags:flags,
                  name: c.name,
                  value_name: c.value_name,
                  value: c.value,
                  hidinguser: c.hidinguser,
                };
                EMIT(FromClient.CLOCK, msg);
                // remove_ctx_menu();
            });
        };
        f('Descending', ClockFlags.DESCENDING);
        f('Cyclic', ClockFlags.CYCLIC);
        f('Advances By Event', ClockFlags.ADVANCES_BY_EVENT);
        menu.checkbox('Hidden', c.hidinguser != 0, function(b:boolean):void{
            const msg: ClockEdit = {
              type:ClockMsgType.EDIT, 
              id:id, 
              flags: c.flags,
              name: c.name,
              value_name: c.value_name,
              value: c.value,
              hidinguser: b?SETTINGS.userid:0,
            };
            EMIT(FromClient.CLOCK, msg);
        });
        menu.separator();
        menu.item('Clear', function():void{
            EMIT(FromClient.CLOCK, {type:ClockMsgType.CLEAR, id:id});
        });
        menu.separator();
        menu.item('Close', function():void{x.click();});
        menu.canceller();
        menu.install();
    };

    const result = {
        w: w,
        wh: wh,
        title: t,
        list_el: list,
        value_el: v,
        add_event_button: add_event_button,
        show: show,
        close: function():void{
            w.style.display = 'none';
        },
    };
    return result;
}

function get_clock_window(id:number): ClockWindow|null{
    return clock_windows.get(id) || null;
}

function get_or_create_clock_window(id:number): ClockWindow|null{
    if(!clocks.has(id)) return null;
    if(clock_windows.has(id)) return clock_windows.get(id)!;
    const w = make_clock_window(id);
    clock_windows.set(id, w);
    return w;
}

function find_clock_event(c: Clock, event_id: number):ClockEvent|null{
    const events = c.events;
    const length = events.length;
    for(let i = 0; i < length; i++){
        const ce = events[i];
        if(ce.id == event_id){
            return ce;
        }
    }
    return null;
}

function find_clock_el(clock_id: number, event_id: number):HTMLDivElement|null{
    const w = get_clock_window(clock_id);
    if(!w) return null;
    let id = ""+event_id;
    for(let child of w.list_el.children){
        let ch = child as HTMLDivElement;
        if(ch.dataset.id == id) return ch;
    }
    return null;
}

ONRECV(ToClient.CLOCK, function(msg:ClockMsg):void{
    switch(msg.type){
        case ClockMsgType.INITIALIZE:
            clocks.clear();
            clock_tv.clear();
            for(let c of msg.clocks){
                clocks.set(c.id, c);
                if(!c.hidinguser || c.hidinguser == SETTINGS.userid)
                  clock_tv.add_item(c.name, c.id, null);
                clock_apply(c);
                const openid = `/clocks/open/${c.id}`;
                if(get_local(StorageCategory.WINDOW, openid)){
                  const w = get_or_create_clock_window(c.id);
                  if(w) w.show();
                }
            }
            break;
        case ClockMsgType.SHOW:{
            const w = get_or_create_clock_window(msg.id);
            if(w) w.show();
        }break;
        case ClockMsgType.NEW:{
            const c: Clock = {name:msg.name, flags:msg.flags, id:msg.id, value:msg.value, events:[], value_name:msg.value_name, hidinguser:msg.hidinguser}
            clocks.set(c.id, c);
            if(!c.hidinguser || c.hidinguser == SETTINGS.userid)
              clock_tv.add_item(c.name, c.id, null);
            if(clock_wants_show_new){
                clock_wants_show_new = false;
                const w = get_or_create_clock_window(c.id);
                if(w) {
                  w.show();
                  setTimeout(() => w.add_event_button.focus(), 0);
                }
            }
        }break;
        case ClockMsgType.EDIT:{
            const id = msg.id;
            const c = clocks.get(id);
            const w = get_clock_window(id);
            if(c){
                const old_name = c.name;
                const new_name = msg.name;
                if(old_name != new_name){
                    c.name = new_name;
                    if(w) w.title.textContent = new_name;
                    clock_tv.rename(id, new_name);
                }
                c.flags = msg.flags;
                c.value = msg.value;
                c.value_name = msg.value_name;
                if(c.hidinguser && !msg.hidinguser)
                  clock_tv.add_item(c.name, c.id, null);
                c.hidinguser = msg.hidinguser;
                if(w) w.value_el.textContent = c.value_name?`${c.value_name}: ${c.value}`:`${c.value}`;
                if(w && c.hidinguser && c.hidinguser != SETTINGS.userid){
                    w.close();
                    clock_tv.remove(id);
                }
                clock_apply(c);
            }
        }break;
        case ClockMsgType.DELETE:{
            const w = get_clock_window(msg.id);
            if(w) w.close();
            clock_windows.delete(msg.id);
            clock_tv.remove(msg.id);
            clocks.delete(msg.id);
        }break;
        case ClockMsgType.CLEAR:{
            const c = clocks.get(msg.id);
            if(c){
              c.events = [];
              clock_apply(c);
            }
        }break;
        case ClockMsgType.EVENT_NEW:{
            const id = msg.clock_id;
            const c = clocks.get(id);
            if(c){
                const ce: ClockEvent = {name:msg.name, when:msg.when, flags:msg.flags, id:msg.id};
                c.events.push(ce);
                clock_apply(c);
            }
        }break;
        case ClockMsgType.EVENT_EDIT:{
            const c = clocks.get(msg.clock_id);
            if(!c) break;
            const ev = find_clock_event(c, msg.id);
            if(ev){
                ev.name = msg.name;
                ev.when = msg.when;
                ev.flags = msg.flags;
                clock_apply(c);
            }
        }break;
        case ClockMsgType.EVENT_DELETE:{
            const c = clocks.get(msg.clock_id);
            if(c){
                const id = msg.id;
                const events = c.events;
                const length = events.length;
                for(let i = 0; i < length; i++){
                    const ce = events[i];
                    if(ce.id == id){
                        events.splice(i, 1);
                        break;
                    }
                }
                clock_apply(c);
            }
        }break;
    }
});
document.addEventListener('DOMContentLoaded', function():void{
    by_id('new-clock').onclick = function():void{
        const diag = get_dialog('clock');
        if(!diag) return;
        diag.f.name.value = '';
        diag.f.value_name.value = '';
        diag.f.value.value = '0';
        diag.f.descending.checked = false;
        diag.f.cyclic.checked = false;
        diag.f.by_event.checked = false;
        diag.f.hidden.checked = false;
        diag.show_handler = function(){
          diag.f.name.focus();
        };
        diag.ok_handler = function(){
          clock_wants_show_new = true;
          let name = diag.f.name.value;
          let flags = 0;
          if(diag.f.descending.checked) flags |= ClockFlags.DESCENDING;
          if(diag.f.cyclic.checked) flags |= ClockFlags.CYCLIC;
          if(diag.f.by_event.checked) flags |= ClockFlags.ADVANCES_BY_EVENT;
          let hidinguser = 0;
          if(diag.f.hidden.checked) hidinguser = SETTINGS.userid;
          if(!name) name = 'Untitled';
          const c: ClockNew = {
            type:ClockMsgType.NEW,
            name:name,
            flags:flags,
            id:1,
            value:+diag.f.value.value,
            value_name:diag.f.value_name.value,
            hidinguser: hidinguser,
          };
          EMIT(FromClient.CLOCK, c);
        }
        diag.show();
    };
    clock_tv = make_tree_view(by_id('clock-list'), 'clocks');
    clock_tv.on_click = function(id:number):void {
        const w = get_or_create_clock_window(id);
        if(w) {
          w.show();
          setTimeout(()=>w.w.focus(), 0);
        }
    };
    clock_tv.on_ctxmenu = function(id:number, e:MouseEvent):void{
        const menu = ctx_menu(e);
        menu.item('Show Others', function():void{
            EMIT(FromClient.CLOCK, {type:ClockMsgType.SHOW, id:id});
        });
        menu.item('Rename', function():void{
            clock_rename_dialog(id);
        });
        menu.separator();
        menu.item('Cancel');
        menu.install();
    };
});

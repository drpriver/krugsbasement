//
// Copyright © 2025-2025, David Priver
//

const statblocks: Map<number, StatBlock> = new Map();

function use_sb_macro(block:StatBlock, macro: StatMacro):void{
  let vars: Map<string, string> = new Map();
  for(let content of block[2]){
    if(content[0] == StatItemType.TABLE)
      for(let row of content[1])
        vars.set(row[0].toLowerCase(), row[1]);
    else if(content[0] == StatItemType.VARIABLE)
      vars.set(content[1].toLowerCase(), content[3]);
  }
  for(let v of macro[3]) vars.set(v[1].toLowerCase(), v[3]);
  preprocess_and_send_chat3(macro[2], vars);
}

let STATS_TV: TreeView;
let _sbw: SubWindow;
function get_sbw(){
  const openid = '/sbs/open/sbw';
  if(!_sbw){
    by_id('sbw-window').style.width = '70ch';
    _sbw = get_window('sbw');
    _sbw.show_handler = function():void{
      store_local(StorageCategory.WINDOW, openid, '1');
    };
    _sbw.hide_handler = function():void{
      store_local(StorageCategory.WINDOW, openid, '');
    };
    const sb_el = by_id('sbw-sb');
    const tv_el = by_id('sbw-tv');
    STATS_TV = make_tree_view(tv_el, 'statblock');
    let current_id = 0;
    function show_sb(id:number):void {
      current_id = id;
      const sb = statblocks.get(id);
      if(!sb) return;
      sb_el.replaceChildren();
      const [_, name, contents, __] = sb;
      elem_parent_text(sb_el, 'h2', name);
      function add_table_row(table: HTMLTableElement, row: StatTableItem){
          const tr = elem_with_parent(table, 'tr');
          const key = elem_parent_text(tr, 'td', row[0]);
          const value = elem_parent_text(tr, 'td', row[1]);
          edit_onclick(key, EditElementFlags.NONE, (txt:string)=>{ row[0] = txt; });
          edit_onclick(value, EditElementFlags.NONE, (txt:string)=>{ row[1] = txt; });
      }
      let macro_container:null|HTMLDivElement = null;
      let table_container:null|HTMLDivElement = null;
      for(const item of contents){
          switch(item[0]){
              case StatItemType.TABLE:{
                  macro_container = null;
                  if(!table_container) table_container = elem_with_parent(sb_el, 'div', null, 'sb-table-container');
                  const table = elem_with_parent(table_container, 'table');
                  for(const row of item[1]) add_table_row(table, row);
              } break;
              case StatItemType.MD:{
                  macro_container = null;
                  table_container = null;
                  const div = elem_with_parent(sb_el, 'div', null, 'sb-md-container');
                  md_to_html(item[1], (h:string)=>{ div.innerHTML = h; });
              } break;
              case StatItemType.MACRO:{
                  table_container = null;
                  if(!macro_container) {
                    elem_parent_text(sb_el, 'h2', 'Macros');
                    macro_container = elem_with_parent(sb_el, 'div', null, 'sb-macro-container');
                  }
                  const b = elem_parent_text(macro_container, 'button', item[1]);
                  const p = elem_parent_text(macro_container, 'pre', item[2]);
                  b.onclick = function(e){ e.stopPropagation(); e.preventDefault(); use_sb_macro(sb, item); };
                  edit_onclick(p, EditElementFlags.NONE, (txt:string)=>{ item[2] = txt; });
              } break;
              case StatItemType.IMG:{
                  table_container = null;
                  macro_container = null;
                  const img = elem_with_parent(sb_el, 'img');
                  img.crossOrigin = 'anonymous';
                  img.src = item[1];
              } break;
          }
      }
    };
    sb_el.oncontextmenu = function(e){
        const menu = ctx_menu(e);
        if(!statblocks.size)
          menu.disabled('Pop out');
        else
          menu.item('Pop out', function(){
            let block = statblocks.get(current_id);
            if(!block) return;
            create_statblock_window(block).show();
          });
        menu.separator();
        menu.canceller();
        menu.install();
    };
    STATS_TV.on_click = show_sb;
    for(let sb of statblocks.values()){
      const [id, name, _, __] = sb;
      STATS_TV.add_item(name, id, null);
    }
    for(let key of statblocks.keys()){
      show_sb(key);
      break;
    }
    if(!statblocks.size){
      const inp = elem_with_parent(sb_el, 'input');
      inp.type = 'file';
      inp.accept = '.json';
      sb_file_upload(inp);
    }
    _sbw.handle.oncontextmenu = function(e){
      const menu = ctx_menu(e);
      menu.item('Close', function(){
        _sbw.close_x.click();
      });
      menu.item('Upload', function(){
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json';
        sb_file_upload(inp);
        inp.click();
      });
      menu.separator();
      menu.canceller();
      menu.install();
    };
  }
  return _sbw;
}

function sb_file_upload(inp:HTMLInputElement):void{
  inp.onchange = function(){
    const filelist = inp.files;
    if(!filelist || filelist.length != 1)
        return;
    const file = filelist[0];
    file.text().then(s=>{
      const data = JSON.parse(s);
      if(Array.isArray(data)){
        let i = 0;
        for(let sb of statblocks.values()){
          if(sb[0] > i) i = sb[0];
        }
        for(let sb of data){
          sb = v_StatBlock(sb);
          if(sb){
            sb[0] = ++i;
            statblocks.set(sb[0], sb);
            STATS_TV.add_item(sb[1], sb[0], null);
            if(sb[0] == 1) STATS_TV.on_click!(1);
          }
        }
      }
    });
  };
}
document.addEventListener('DOMContentLoaded', function():void{
    const openid = '/sbs/open/sbw';
    if(get_local(StorageCategory.WINDOW, openid))
      get_sbw().show();
    by_id('statblock-button').onclick = ()=>{ get_sbw().show(); };
});


type StatBlockWindow = {
    w: HTMLElement;
    wh: HTMLElement;
    title: HTMLElement;
    content: HTMLElement;
    show: ()=>void;
};

function create_statblock_window(block: StatBlock):StatBlockWindow{
    block = structuredClone(block);
    let [_, name, contents, __] = block;

    const w = elem('div', null, 'window2');
    const wh = elem_with_parent(w, 'div', null, 'window-handle');
    const x = elem_parent_text(wh, 'span', '×', null, 'window-closer');
    const t = elem_parent_text(wh, 'span', name, null, 'window-title');
    const content = elem_with_parent(w, 'div', null, 'statblock-content');

    function add_table_row(table: HTMLTableElement, row: StatTableItem){
        const tr = elem_with_parent(table, 'tr');
        elem_parent_text(tr, 'td', row[0]);
        const value = elem_parent_text(tr, 'td', row[1]);
        edit_onclick(value, EditElementFlags.NONE, (txt:string)=>{ row[1] = txt; });
    }
    let macro_container:null|HTMLDivElement = null;
    let table_container:null|HTMLDivElement = null;
    let variable_container:null|HTMLDivElement = null;
    function add_variable(container: HTMLDivElement, v: StatVariable):void{
        const label = elem_parent_text(container, 'label', v[1]);
        switch(v[2]){
            case ScriptVariableType.BOOLEAN:{
                const input = elem_with_parent(label, 'input');
                input.type = 'checkbox';
                input.checked = v[3] === '1';
                input.onchange = function(){ v[3] = input.checked ? '1' : '0'; };
            }break;
            case ScriptVariableType.NUMBER:
            case ScriptVariableType.ABILITY_SCORE:{
                const input = elem_with_parent(label, 'input');
                input.type = 'number';
                input.value = v[3];
                input.onchange = function(){ v[3] = input.value; };
            }break;
            case ScriptVariableType.STRING:{
                const input = elem_with_parent(label, 'input');
                input.type = 'text';
                input.value = v[3];
                input.onchange = function(){ v[3] = input.value; };
            }break;
            case ScriptVariableType.CHOICE:{
                const select = elem_with_parent(label, 'select');
                for(const choice of v[4]){
                    const option = elem_with_parent(select, 'option');
                    option.value = choice;
                    option.textContent = choice;
                }
                label.onclick = function(e){ e.stopPropagation(); e.preventDefault(); select.focus(); };
                select.onchange = function(){ v[3] = select.value; };
            }break;
        }
    }
    for(const item of contents){
        switch(item[0]){
            case StatItemType.TABLE:{
                macro_container = null;
                variable_container = null;
                if(!table_container) table_container = elem_with_parent(content, 'div', null, 'sb-table-container');
                const table = elem_with_parent(table_container, 'table');
                for(const row of item[1]) add_table_row(table, row);
            } break;
            case StatItemType.MD:{
                macro_container = null;
                table_container = null;
                variable_container = null;
                const div = elem_with_parent(content, 'div', null, 'sb-md-container');
                md_to_html(item[1], (h:string)=>{ div.innerHTML = h; });
            } break;
            case StatItemType.MACRO:{
                if(!macro_container) macro_container = elem_with_parent(content, 'div', null, 'sb-macro-container');
                table_container = null
                const b = elem_parent_text(macro_container, 'button', item[1]);
                b.style.gridColumn = '0 / 1';
                variable_container = elem_with_parent(macro_container, 'div', null, 'sb-variable-container');
                b.onclick = function(e){ e.stopPropagation(); e.preventDefault(); use_sb_macro(block, item); };
                for(const v of item[3]) add_variable(variable_container, v);
                variable_container = null;
            } break;
            case StatItemType.IMG:{
                macro_container = null;
                table_container = null;
                variable_container = null;
                const img = elem_with_parent(content, 'img');
                img.crossOrigin = 'anonymous';
                img.src = item[1];
            } break;
            case StatItemType.VARIABLE:{
                macro_container = null;
                table_container = null;
                if(!variable_container) variable_container = elem_with_parent(content, 'div', null, 'sb-variable-container');
                add_variable(variable_container, item);
            } break;
        }
    }

    setup_movable_window(w, wh, WINDOWFLAGS.NONE);
    setup_resizable_window(w, RESIZEFLAGS.NONE);
    const make_top = setup_zsorted_window(w);
    setup_closable_window(w, x, function():void{ w.remove(); });

    function show():void{
        if(!w.parentElement) document.body.appendChild(w);
        w.style.display = 'grid';
        make_top();
    }

    wh.oncontextmenu = function(e:MouseEvent):void {
        e.preventDefault();
        const menu = ctx_menu(e);
        menu.item('Close', function():void {x.click();});
        menu.separator();
        menu.item('Rename', function(){
          edit_element_inline(t, EditElementFlags.NONE, (txt:string)=>{ block[1] = name = txt; });
        });
        menu.item('Duplicate', function(e:MouseEvent):void {
          const w = create_statblock_window(block);
          w.show();
          w.w.style.left = (e.clientX-w.w.clientWidth/2)+'px';
          w.w.style.top = e.clientY+'px';
          ensure_window_is_completely_on_screen(w.w);
        });
        menu.separator();
        menu.canceller();
        menu.install();
    };

    const result: StatBlockWindow = {
        w: w,
        wh: wh,
        title: t,
        content: content,
        show: show,
    };
    return result;
}

document.addEventListener('dragover', function(e:DragEvent):void{
    if(!e.dataTransfer!.types.includes(STATS_TV.mime)) return;
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
});
document.addEventListener('dragenter', function(e:DragEvent):void{
    if(!e.dataTransfer!.types.includes(STATS_TV.mime)) return;
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
});
document.addEventListener('dragleave', function(e:DragEvent):void{
    if(!e.dataTransfer!.types.includes(STATS_TV.mime)) return;
});
document.addEventListener('drop', function(e:DragEvent):void{
    if(!e.dataTransfer!.types.includes(STATS_TV.mime)) return;
    e.stopPropagation();
    e.preventDefault();
    const data = +e.dataTransfer!.getData(STATS_TV.mime);
    const block = statblocks.get(data);
    if(!block) return;
    let w = create_statblock_window(block);
    w.show();
    w.w.style.left = (e.clientX-w.w.clientWidth/2)+'px';
    w.w.style.top = (e.clientY-w.w.clientHeight/2)+'px';
    ensure_window_is_completely_on_screen(w.w);
    w.wh.click();
});

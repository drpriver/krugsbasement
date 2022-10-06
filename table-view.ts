//
// Copyright © 2021-2022, David Priver
//
type TableView<K> = {
    // thead: HTMLTableSectionElement;
    tbody: HTMLTableSectionElement;
    add_row:(row:HTMLTableRowElement, key:K)=>void;
    clear:()=>void;
    remove_row:(key:K) =>void;
    get_row:(key:K) => HTMLTableRowElement|null;
    move_row_by:(key:K, dy:number)=>void;
    rows: Array<[K, HTMLTableRowElement]>;
}

function make_table_view<K>(tbody:HTMLTableSectionElement): TableView<K>{
    let result: TableView<K> = {
        tbody: tbody,
        add_row: function(row:HTMLTableRowElement, key:K){
            result.tbody.appendChild(row);
            result.rows.push([key, row]);
        },
        clear: function(){
            for(let [_, row] of result.rows){
                row.remove();
            }
            result.rows = [];
        },
        remove_row:function(key:K){
            for(let i = 0; i < result.rows.length; i++){
                let [k, row] = result.rows[i];
                if(k === key){
                    row.remove();
                    result.rows.splice(i, 1);
                    return;
                }
            }
        },
        get_row:function(key:K){
            for(let [k, row] of result.rows){
                if(k === key){
                    return row;
                }
            }
            return null;
        },
        move_row_by:function(key:K, dy:number){
            if(dy !== -1 && dy !== 1) throw new Error("unimplemented");
            let length = result.rows.length;
            for(let i = 0; i < length; i++){
                let [k, row] = result.rows[i];
                if(k === key){
                    // this code seems janky as fuck?
                    if(dy == -1 && i == 0) return;
                    if(dy == +1 && i == length-1) return;
                    if(dy == -1 && row.previousElementSibling){
                        let tmp = result.rows[i];
                        result.rows[i] = result.rows[i-1];
                        result.rows[i-1] = tmp;
                        result.tbody.insertBefore(row, row.previousElementSibling);
                    }
                    else if(dy == 1 && row.nextElementSibling){
                        let tmp = result.rows[i];
                        result.rows[i] = result.rows[i+1];
                        result.rows[i+1] = tmp;
                        result.tbody.insertBefore(row, row.nextElementSibling.nextElementSibling);
                    }
                    return;
                }
            }
        },
        rows: [],
    };
    return result;
}

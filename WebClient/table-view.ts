//
// Copyright © 2021-2024, David Priver
//
type TableView<K> = {
    width: number;
    body: HTMLElement;
    head: Array<HTMLDivElement>;
    rows: Array<[K, Array<HTMLDivElement>]>;
    add_row:(key:K)=>Array<HTMLDivElement>;
    clear:()=>void;
    remove_row:(key:K) =>void;
    get_row:(key:K) => Array<HTMLDivElement>|null;
    get_row_off:(key:K, dy:number) => Array<HTMLDivElement>|null;
    move_row_by:(key:K, dy:number)=>void;
    move_after:(k1:K, k2:K) => void;
}

function make_table_view<K>(body:HTMLElement, width:number): TableView<K>{
    const result: TableView<K> = {
        width,
        body,
        head:[],
        rows:[],
        add_row: function(key:K):Array<HTMLDivElement>{
            const row = [];
            for(let i = 0; i < width; i++){
                row.push(elem_with_parent(body, 'div'));
            }
            result.rows.push([key, row]);
            result.body.style.gridTemplateRows = `repeat(${result.rows.length+1}, max-content)`;
            return row;
        },
        clear: function():void{
            for(const [_, row] of result.rows.slice(1)){
                for(const el of row)
                    el.remove();
            }
            result.rows = result.rows.slice(0, 1);
            result.body.style.gridTemplateRows = `repeat(${result.rows.length+1}, max-content)`;
        },
        remove_row:function(key:K):void{
            for(let i = 1; i < result.rows.length; i++){
                const [k, row] = result.rows[i];
                if(k === key){
                    for(const el of row)
                        el.remove();
                    result.rows.splice(i, 1);
                    result.body.style.gridTemplateRows = `repeat(${result.rows.length+1}, max-content)`;
                    return;
                }
            }
        },
        get_row:function(key:K):null|Array<HTMLDivElement>{
            for(const [k, row] of result.rows){
                if(k === key){
                    return row;
                }
            }
            return null;
        },
        get_row_off:function(key:K, dy:number):null|Array<HTMLDivElement>{
            for(let i = 1; i < result.rows.length; i++){
                const k = result.rows[i][0];
                if(k === key){
                    i += dy;
                    if(i < 1) return null;
                    if(i >= result.rows.length) return null;
                    return result.rows[i][1];
                }
            }
            return null;
        },
        // [null, a, b, c, d]
        // (a, -2)
        // dy -> 0
        // (b, -2)
        // dy -> -1
        // (c, -2)
        // dy -> -2
        // (d, -2)
        // dy -> -2
        //
        // (a, +2)
        // dy -> +2
        // (b, +2)
        // dy -> +2
        // (c, +2)
        // dy -> +1
        // (d, +2)
        // dy -> 0
        move_row_by:function(key:K, dy:number):void{
            const length = result.rows.length;
            for(let i = 1; i < length; i++){
                const [k, row] = result.rows[i];
                if(k !== key) continue;
                if(dy < 0 && dy < (1-i)) dy = 1-i;
                if(dy > 0 && dy > (length-1-i)) dy = length-1-i;
                if(!dy) return;
                result.rows.splice(i, 1);
                result.rows.splice(i+dy, 0, [k, row]);
                for(const el of row)
                    el.remove();
                const previous = result.rows[i+dy-1][1];
                const last = previous[previous.length-1];
                last.after(...row);
                return;
            }
        },
        move_after:function(k1:K, k2:K):void{
            let idx1:number|undefined;
            let idx2:number|undefined;
            const length = result.rows.length;
            for(let i = 1; i < length; i++){
                const k = result.rows[i][0];
                if(k === k1)
                    idx1 = i;
                if(k === k2)
                    idx2 = i;
                if(idx1 !== undefined && idx2 !== undefined){
                    const dy = idx2-idx1+1;
                    return result.move_row_by(k1, dy);
                }
            }
        },
    };
    // @ts-ignore
    result.head = result.add_row(null);
    return result;
}

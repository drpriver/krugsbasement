// bbox
// {
//   // These are relative to some base_x, base_y.
//   x0: float,
//   y0: float,
//   x1: float,
//   y1: float,
// }
//
// Note, for this function, make sure the bboxes have been adjusted
// to the same frame of reference.
function bbox_overlaps(bbox1, bbox2){
    x0 = Math.max(bbox1.x0, bbox2.x0);
    y0 = Math.max(bbox1.y0, bbox2.y0);
    x1 = Math.min(bbox1.x1, bbox2.x1);
    y1 = Math.min(bbox1.y1, bbox2.y1);
    return x0 <= x1 && y0 <= y1;
}
//
//  Canvas Obj Types
//  ================
//  freehand-line
//  grid-line
//  rectangle
//  grid-rectangle
//  ellipse
//  image
//  text
//
//  all objects start as
//  {
//    type: 'some-type',
//    id: 'foo-bar',
//    base_x: 3,
//    base_y: 99,
//    deleted: false,
//  }
//
//  and then the rest of the fields are different.
//  Essentially, they are tagged unions.
//
//  freehand-line
//  -------------
//  Freehand lines are a bag of sequenced points that are
//  interpolated together with quadratic curves.
//  The server can optimize the lines by removing redundant
//  points.
//  {
//    type: 'freehand-line',
//    id: 'foo-bar',
//    base_x: 3,
//    base_y: 99,
//    color: '#fff',
//    // points are just raw x,y pairs in a flat array.
//    points: [x,y, x,y, x,y],
//    path: a Path2d object,
//    bbox: bbox,
//  }
//
//  grid-line
//  ---------
//  A grid line are straight line-fragments whose points snap
//  to the corners of the grid.
//  Optimizing the points array is easy.
//  When moving this object, movements need to snap to the closest
//  grid point. When moving multiple objects, all of them need to snap
//  this way so that their relative positions are maintained.
//  {
//    type: 'grid-line',
//    id: 'foo-bar',
//    base_x: 0,
//    base_y: 256,
//    color: '#fff',
//    // points are just raw x,y pairs in a flat array.
//    points: [x,y, x,y, x,y],
//    path: a Path2d object,
//    bbox: bbox,
//  }
//
//  rectangle
//  ---------
//  An axis-aligned box.
//  base_x and base_y is the top-left corner of the box.
//  {
//    type: 'rectangle',
//    id: 'foo-bar',
//    base_x: 3,
//    base_y: 99,
//    color: '#fff',
//    width: 12,
//    height: 18,
//  }
//
//  grid-rectangle
//  ---------
//  An axis-aligned box, whose corners snap to the grid.
//  Same movement restrictions apply to this as apply to the
//  grid-line.
//  base_x and base_y is the top-left corner of the box.
//  {
//    type: 'grid-rectangle',
//    id: 'foo-bar',
//    base_x: 0,
//    base_y: 256,
//    color: '#fff',
//    width: 64,
//    height: 128,
//  }
//
//  ellipse
//  -------
//  base_x and base_y is the center of the ellipse.
//  We only allow axis-aligned ellipses.
//  {
//    type: 'ellipse',
//    id: 'foo-bar',
//    base_x: 3,
//    base_y: 99,
//    color: '#fff',
//    r_x: 12,
//    r_y: 18,
//  }
//
//  image
//  -----
//  {
//    type: 'image',
//    id: 'foo-bar',
//    base_x: 3,
//    base_y: 99,
//    width: 99,
//    height: 99,
//    url: "foo-bar",
//    img: Image(),
//  }
//
//  text
//  ----
//  {
//    type: 'text',
//    id: 'foo-bar',
//    base_x: 3,
//    base_y: 99,
//    text: "foozle",
//    bbox: bbox,
//  }
//
//  ez-token
//  --------
//  {
//    type: 'ez-token',
//    id: 'foo-bar',
//    base_x: 32,
//    base_y: 96,
//    text: "foozle",
//    color: "#fff",
//  }
//
//
// THIS NEEDS TO ALWAYS BE POWER OF 2
const REFERENCE_WIDTH = 64; // the size of a square at scale = 1.
let camera_x = -34;
let camera_y = 56;
let scale = 1;
let animation_requested = false;
let canvas = null;
let ctx = null;
function resize_canvas(){
    canvas = document.getElementsByTagName('canvas')[0];
    ctx = canvas.getContext('2d');
    const parent_rect = canvas.parentElement.getBoundingClientRect();
    const chat_rect = document.getElementById('chat').getBoundingClientRect();
    canvas.width = window.innerWidth - chat_rect.width;
    canvas.height = window.innerHeight-6;
    request_render();
    const hist = document.getElementById('chat-history');
    const ta = document.getElementById('chatinput');
    hist.style.height = window.innerHeight-12-100 + 'px';
    hist.scrollTo({top:hist.scrollHeight});
};
function make_freehand_line(id, base_x, base_y, color){
    const obj =  {
        type: 'freehand-line',
        id: id,
        base_x: base_x,
        base_y: base_y,
        deleted: false,
        points: [],
        color: color,
        path: null,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
    };
    return obj;
}
function add_freehand_line(id, base_x, base_y, color){
    const obj = make_freehand_line(id, base_x, base_y, color);
    add_canv_obj(obj);
}
function add_freehand_point(obj, x, y){
    x -= obj.base_x;
    y -= obj.base_y;
    const points = obj.points;
    points.push(x);
    points.push(y);
    if(x < obj.bbox.x0){
        obj.bbox.x0 = x;
    }
    if(x > obj.bbox.x1){
        obj.bbox.x1 = x;
    }
    if(y < obj.bbox.y0){
        obj.bbox.y0 = y;
    }
    if(y > obj.bbox.y1){
        obj.bbox.y1 = y;
    }
    freehand_recalculate_path(obj);
}
function freehand_recalculate_path(obj){
    const points = obj.points;
    const base_x = obj.base_x;
    const base_y = obj.base_y;
    let x0 = base_x;
    let y0 = base_y;
    const length = points.length;
    const path = new Path2D();
    path.moveTo(x0, y0);
    for(let i = 0; i < length; i+=2){
        const x1 = points[i] + base_x
        const y1 = points[i+1] + base_y;
        const xc = (x0+x1)/2;
        const yc = (y0+y1)/2;
        path.quadraticCurveTo(x0, y0, xc, yc);
        x0 = x1;
        y0 = y1;
    }
    if(length > 2){
        path.quadraticCurveTo(points[length-4]+base_x, points[length-3]+base_y, x0, y0);
    }
    obj.path = path;
}
function add_freehand_point_by_id(id, x, y){
    let obj = canvas_objs[id];
    console.assert(obj);
    console.assert(obj.type === 'freehand-line');
    add_freehand_point(obj, x, y);
}
function freehand_translate(obj, dx, dy){
    obj.base_x += dx;
    obj.base_y += dy;
    freehand_recalculate_path(obj);
}

function snap_to_grid(x){
    x = Math.round(x);
    const remainder = x & (REFERENCE_WIDTH-1);
    if(remainder < (REFERENCE_WIDTH>>1)){
        x -= remainder;
    }
    else{
        x += REFERENCE_WIDTH - remainder;
    }
    return x;
}
function make_gridline(id, base_x, base_y, color){
    base_x = snap_to_grid(base_x);
    base_y = snap_to_grid(base_y);
    const obj =  {
        type: 'grid-line',
        id: id,
        base_x: base_x,
        base_y: base_y,
        deleted: false,
        points: [],
        color: color,
        path: null,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
    };
    return obj;
}
function add_gridline(id, base_x, base_y, color){
    const obj = make_gridline(id, base_x, base_y, color);
    add_canv_obj(obj);
}
function add_gridline_point(obj, x, y){
    x = snap_to_grid(x);
    y = snap_to_grid(y);
    x -= obj.base_x;
    y -= obj.base_y;
    const points = obj.points;
    if(points.length){
        if(points[points.length-2] == x && points[points.length-1] == y){
            return;
        }
    }
    points.push(x);
    points.push(y);
    if(x < obj.bbox.x0){
        obj.bbox.x0 = x;
    }
    if(x > obj.bbox.x1){
        obj.bbox.x1 = x;
    }
    if(y < obj.bbox.y0){
        obj.bbox.y0 = y;
    }
    if(y > obj.bbox.y1){
        obj.bbox.y1 = y;
    }
    gridline_recalculate_path(obj);
}
function gridline_recalculate_path(obj){
    // this is the same as freehand??
    const points = obj.points;
    const base_x = obj.base_x;
    const base_y = obj.base_y;
    const length = points.length;
    const path = new Path2D();
    path.moveTo(base_x, base_y);
    for(let i = 0; i < length; i+=2){
        const x1 = points[i] + base_x
        const y1 = points[i+1] + base_y;
        path.lineTo(x1, y1);
    }
    obj.path = path;
}
function add_gridline_point_by_id(id, x, y){
    // this is the same as freehand
    let obj = canvas_objs[id];
    console.assert(obj);
    console.assert(obj.type === 'grid-line');
    add_gridline_point(obj, x, y);
}
function gridline_translate(obj, dx, dy){
    obj.base_x += dx;
    obj.base_y += dy;
    gridline_recalculate_path(obj);
}
function make_gridrect(id, base_x, base_y, color){
    base_x = snap_to_grid(base_x);
    base_y = snap_to_grid(base_y);
    const obj =  {
        type: 'grid-rectangle',
        id: id,
        base_x: base_x,
        base_y: base_y,
        deleted: false,
        color: color,
        width: 0,
        height: 0,
    };
    return obj;
}
function add_gridrect(id, base_x, base_y, color){
    const obj = make_gridrect(id, base_x, base_y, color);
    add_canv_obj(obj);
}
function change_gridrect(obj, x0, y0, x1, y1){
    x0 = snap_to_grid(x0);
    y0 = snap_to_grid(y0);
    x1 = snap_to_grid(x1);
    y1 = snap_to_grid(y1);
    if(x1 < x0){
        let temp = x1;
        x1 = x0;
        x0 = temp;
    }
    if(y1 < y0){
        let temp = y1;
        y1 = y0;
        y0 = temp;
    }
    obj.base_x = x0;
    obj.base_y = y0;
    obj.width = x1 - x0;
    obj.height = y1 - y0;
    request_render();
}
function change_gridrect_by_id(id, x0, y0, x1, y1){
    let obj = canvas_objs[id];
    console.assert(obj);
    console.assert(obj.type === 'grid-rectangle');
    change_gridrect(obj, x0, y0, x1, y1);
}
function gridrect_translate(obj, dx, dy){
    obj.base_x += dx;
    obj.base_y += dy;
}
function make_text(id, base_x, base_y, text){
    base_x = base_x - (base_x & (REFERENCE_WIDTH-1)) + REFERENCE_WIDTH/2;
    base_y = base_y - (base_y & (REFERENCE_WIDTH-1)) + REFERENCE_WIDTH/2;
    const obj =  {
        type: 'text',
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        deleted: false,
        text: text,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
    };
    return obj;
}
function add_text(id, base_x, base_y, text){
    const obj = make_text(id, base_x, base_y, text);
    add_canv_obj(obj);
}
function make_ez_token(id, base_x, base_y, text, color){
    base_x = base_x - (base_x & (REFERENCE_WIDTH-1)) + REFERENCE_WIDTH/2;
    base_y = base_y - (base_y & (REFERENCE_WIDTH-1)) + REFERENCE_WIDTH/2;

    const obj =  {
        type: 'ez-token',
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        deleted: false,
        text: text,
        color:color,
    };
    return obj;
}
function add_ez_token(id, base_x, base_y, text, color){
    const obj = make_ez_token(id, base_x, base_y, text, color);
    add_canv_obj(obj);
}
document.addEventListener('DOMContentLoaded', resize_canvas);
window.addEventListener('resize', resize_canvas);
const canvas_obj_array = [];
const canvas_objs = Object.create(null);
const selected = new Set();
const selection_area = {
    is_selecting: false,
    x0:0, y0:0,
    x1:0, y1:0,
};
function update_selection(x0, y0, x1, y1){
    if(x0 > x1){
        let temp = x0;
        x0 = x1;
        x1 = temp;
    }
    if(y0 > y1){
        let temp = y0;
        y0 = y1;
        y1 = temp;
    }
    selection_area.x0 = x0;
    selection_area.y0 = y0;
    selection_area.x1 = x1;
    selection_area.y1 = y1;
}
function point_in_rect(x, y, x0, y0, x1, y1){
    return (x >= x0) && (x <= x1) && (y >= y0) && (y <= y1);
}
function note_selections(){
    const before = performance.now();
    const length = canvas_obj_array.length;
    const x0 = selection_area.x0;
    const y0 = selection_area.y0;
    const x1 = selection_area.x1;
    const y1 = selection_area.y1;
    const selection_bbox = {x0:x0, y0:y0, x1:x1, y1:y1,};
    for(let i = 0; i < length; ++i){
        const obj = canvas_obj_array[i];
        if(obj.deleted)
            continue;
        switch(obj.type){
            case 'grid-line': // fall-through
            case 'freehand-line':{
                const line_bbox = {
                    x0:obj.bbox.x0 + obj.base_x,
                    y0:obj.bbox.y0 + obj.base_y,
                    x1:obj.bbox.x1 + obj.base_x,
                    y1:obj.bbox.y1 + obj.base_y,
                };
                if(!bbox_overlaps(line_bbox, selection_bbox)){
                    break;
                }
                if(point_in_rect(obj.base_x, obj.base_y, x0, y0, x1, y1)){
                    selected.add(obj.id);
                    break;
                }
                const points = obj.points;
                const length = points.length;
                for(let j = 0; j < length; j+=2){
                    const x = points[j] + obj.base_x;
                    const y = points[j+1] + obj.base_y;
                    if(point_in_rect(x, y, x0, y0, x1, y1)){
                        selected.add(obj.id);
                        break;
                    }
                }
            }break;
            case 'grid-rectangle':{
                const rect_bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+obj.width,
                    y1:obj.base_y+obj.height,
                };
                if(bbox_overlaps(rect_bbox, selection_bbox)){
                    selected.add(obj.id);
                    break;
                }
            }break;
            case 'ez-token':{
                const token_bbox = {
                    x0: obj.base_x - 28,
                    x1: obj.base_x + 28,
                    y0: obj.base_y - 28,
                    y1: obj.base_y + 28,
                };
                if(bbox_overlaps(token_bbox, selection_bbox)){
                    selected.add(obj.id);
                    break;
                }
            }break;
        }
    }
    const after = performance.now();
    // console.log('note_selections', after-before, 'ms');
}
function finalize_selection(){
    selected.clear();
    selection_area.is_selecting = false;
    note_selections();
    request_render();
}

function end_selecting(){
    selected.clear();
    selection_area.is_selecting = false;
    request_render();
}

function add_canv_obj(obj){
    canvas_objs[obj.id] = obj;
    canvas_obj_array.push(obj);
}

function request_render(){
    if(animation_requested){
        return;
    }
    animation_requested = true;
    // only call this from here to avoid double renders.
    requestAnimationFrame(render);
}
function render(){
    if(!ctx)
        return;
    if(selection_area.is_selecting){
        selected.clear();
        note_selections();
    }
    animation_requested = false;
    const width = canvas.width;
    const height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    let SCALE = scale;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = 'rgb(150, 150, 150)';
    let grid_base_x = camera_x & (REFERENCE_WIDTH-1);
    let grid_base_y = camera_y & (REFERENCE_WIDTH-1);
    let grid_max_x = width/SCALE;
    let grid_max_y = height/SCALE;
    for(let x = grid_base_x; x < grid_max_x; x+= REFERENCE_WIDTH){
        ctx.fillRect(x, 0, 1/SCALE, height/SCALE);
    }
    for(let y = grid_base_y; y < grid_max_y; y+= REFERENCE_WIDTH){
        ctx.fillRect(0, y, width/SCALE, 1/SCALE);
    }
    ctx.translate(camera_x, camera_y);
    let length = canvas_obj_array.length;
    // const SELECTED_COLOR = '#f012df';
    const SELECTED_COLOR = '#33ffdd';
    for(let i = 0; i < length; ++i){
        let obj = canvas_obj_array[i];
        if(obj.deleted)
            continue;
        const is_selected = selected.has(obj.id);
        switch(obj.type){
            case 'freehand-line':{
                // TODO: delete incomplete objects that are canceled.
                // Maybe we just leave them but don't broadcast them on
                // page load.
                if(obj.path){
                    if(is_selected){
                        ctx.lineWidth=8;
                        ctx.strokeStyle = SELECTED_COLOR;
                        ctx.stroke(obj.path);
                    }
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = obj.color;
                    ctx.stroke(obj.path);
                }
            }break;
            case 'grid-line':{
                // TODO: delete incomplete objects that are canceled.
                if(obj.path){
                    if(is_selected){
                        ctx.lineWidth=2*Math.max(3/scale, 6);
                        ctx.strokeStyle = SELECTED_COLOR;
                        ctx.stroke(obj.path);
                    }
                    ctx.lineWidth = Math.max(3/scale, 6);
                    ctx.strokeStyle = obj.color;
                    ctx.stroke(obj.path);
                }
            }break;
            case 'grid-rectangle':{
                if(obj.width && obj.height){
                    if(is_selected){
                        ctx.fillStyle = SELECTED_COLOR+'aa';
                        ctx.fillRect(obj.base_x-2, obj.base_y-2, obj.width+2, obj.height+2);
                    }
                    ctx.fillStyle = obj.color + 'aa';
                    ctx.fillRect(obj.base_x, obj.base_y, obj.width, obj.height);
                }
            }break;
            case 'text':{
                if(obj.text){
                    ctx.font = '18px sans';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = "center";
                    if(obj.bbox.x0 == obj.bbox.x1){
                        let metric = ctx.measureText(obj.text);
                        let width = metric.width;
                        let height = metric.fontBoundingBoxAscent + 2;
                        obj.bbox.x0 = -width/2;
                        obj.bbox.x1 = width/2;
                        obj.bbox.y0 = -height/2;
                        obj.bbox.y1 = -height/2;
                    }
                    if(is_selected){
                        let metric = ctx.measureText(obj.text);
                        let width = metric.width+4;
                        let height = metric.fontBoundingBoxAscent + 4;
                        ctx.fillStyle = SELECTED_COLOR+'aa';
                        ctx.fillRect(obj.base_x-width/2, obj.base_y-height/2, width, height);
                    }
                    ctx.fillStyle = '#000';
                    ctx.fillText(obj.text, obj.base_x, obj.base_y);
                }
            }break;
            case 'ez-token':{
                if(is_selected){
                    ctx.beginPath();
                    ctx.fillStyle = SELECTED_COLOR;
                    ctx.arc(obj.base_x, obj.base_y, 30, 0, 2*Math.PI);
                    ctx.fill();
                }
                ctx.beginPath();
                ctx.fillStyle = '#000';
                ctx.arc(obj.base_x, obj.base_y, 28, 0, 2*Math.PI);
                ctx.fill();
                ctx.beginPath();
                ctx.fillStyle = obj.color;
                ctx.arc(obj.base_x, obj.base_y, 24, 0, 2*Math.PI);
                ctx.fill();
                ctx.font = '24 sans';
                ctx.textBaseline = 'middle';
                ctx.textAlign = "center";
                ctx.fillStyle = '#000';
                ctx.fillText(obj.text, obj.base_x, obj.base_y);
            }break;
        }
    }
    if(selection_area.is_selecting){
        ctx.fillStyle = '#55555555';
        ctx.fillRect(selection_area.x0, selection_area.y0, selection_area.x1-selection_area.x0, selection_area.y1-selection_area.y0);
    }
    // request_render();
}
document.addEventListener('DOMContentLoaded', render);
let current_tool = "Pan";
let color_picker = null;
document.addEventListener('DOMContentLoaded', function(){
    const tools_div = document.getElementById('tools');
    const tools = tools_div.children;
    color_picker = document.getElementById('color-picker');

    for(let i = 0; i < tools.length-1; ++i){
        const tool = tools[i];
        if(tool.innerHTML.trim() === 'Pan'){
            tool.classList.toggle('selected');
        }
        tool.addEventListener('click', function(e){
            e.stopPropagation();
            e.preventDefault();
            current_tool = tool.innerHTML.trim();
            switch(current_tool){
                case 'Pan':
                case 'Select':
                    break;
                default:
                    end_selecting();
                    break;
            }
            for(let j = 0; j < tools.length-1; ++j){
                tools[j].classList.remove('selected');
            }
            tool.classList.toggle('selected');
        });
    }
});
document.addEventListener('DOMContentLoaded', function(){
    const canvas = document.getElementsByTagName('canvas')[0];
    canvas.addEventListener('wheel', function(e){
        e.stopPropagation();
        e.preventDefault();
        const oldscale = scale;
        let dy = e.deltaY;
        const dscale = 50;
        if(dy > dscale)
            dy = dscale;
        if(dy < -dscale)
            dy = -scale;
        scale *= 1 + (-dy/dscale);
        if(scale < 0.25)
            scale = 0.25;
        if(scale > 4)
            scale = 4;
        camera_x -= e.offsetX/oldscale;
        camera_x += e.offsetX/scale;
        camera_y -= e.offsetY/oldscale;
        camera_y += e.offsetY/scale;
        camera_x = Math.round(camera_x);
        camera_y = Math.round(camera_y);
        request_render();
    });
    window.addEventListener('keydown', function(e){
        switch(e.key){
            case 'ArrowLeft':{
                e.stopPropagation();
                e.preventDefault();
                camera_x += 256;
                request_render();
            }break;
            case 'ArrowRight':{
                e.stopPropagation();
                e.preventDefault();
                camera_x -= 256;
                request_render();
            }break;
            case 'ArrowUp':{
                e.stopPropagation();
                e.preventDefault();
                camera_y += 256;
                request_render();
            }break;
            case 'ArrowDown':{
                e.stopPropagation();
                e.preventDefault();
                camera_y -= 256;
                request_render();
            }break;
            case 'Backspace': // fall-through
            case 'Delete':{
                e.stopPropagation();
                e.preventDefault();
                for(let item of selected){
                    canvas_objs[item].deleted = true;
                }
                end_selecting();
            }break;
            default:
                break;
        }
    });
    let lineid = 0;
    let prev_tool = null;
    canvas.addEventListener('mousedown', function(e){
        e.stopPropagation();
        e.preventDefault();
        if(e.buttons === 4){
            prev_tool = current_tool;
            current_tool = 'Pan';
        }
        switch(current_tool){
            case 'Select':{
                let clicked_x = e.offsetX/scale - camera_x;
                let clicked_y = e.offsetY/scale - camera_y;
                selection_area.is_selecting = true;
                update_selection(clicked_x-5/scale, clicked_y-5/scale, clicked_x+5/scale, clicked_y+5/scale);
                request_render();
                function select(e){
                    e.stopPropagation();
                    e.preventDefault();
                    let select_x = e.offsetX/scale - camera_x;
                    let select_y = e.offsetY/scale - camera_y;
                    update_selection(clicked_x, clicked_y, select_x, select_y);
                    request_render();
                }
                canvas.addEventListener('mousemove', select);
                function finish_select(){
                    finalize_selection();
                    canvas.removeEventListener('mousemove', select);
                    window.removeEventListener('mouseup', finish_select);
                    canvas.removeEventListener('mouseleave', finish_select);
                }
                window.addEventListener('mouseup', finish_select);
                canvas.addEventListener('mouseleave', finish_select);
            }break;
            case 'Pan':{
                let clicked_x = e.offsetX/scale;
                let clicked_y = e.offsetY/scale;
                function pan(e){
                    e.stopPropagation();
                    e.preventDefault();
                    let pan_x = e.offsetX/scale;
                    let pan_y = e.offsetY/scale;
                    camera_x -= clicked_x - pan_x;
                    camera_y -= clicked_y - pan_y;
                    clicked_x = pan_x;
                    clicked_y = pan_y;
                    request_render();
                }
                canvas.addEventListener('mousemove', pan);
                function finish_pan(){
                    if(prev_tool){
                        current_tool = prev_tool;
                        prev_tool = null;
                    }
                    canvas.removeEventListener('mousemove', pan);
                    window.removeEventListener('mouseup', finish_pan);
                    canvas.removeEventListener('mouseleave', finish_pan);
                }
                window.addEventListener('mouseup', finish_pan);
                canvas.addEventListener('mouseleave', finish_pan);
            }break;
            case 'Line':{
                ++lineid;
                add_freehand_line(lineid, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y, color_picker.value);
                function add_point(e){
                    e.stopPropagation();
                    e.preventDefault();
                    add_freehand_point_by_id(lineid, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y);
                    request_render();
                }
                canvas.addEventListener('mousemove', add_point);
                function finish_point(){
                    canvas.removeEventListener('mousemove', add_point);
                    window.removeEventListener('mouseup', finish_point);
                    canvas.removeEventListener('mouseleave', finish_point);
                }
                window.addEventListener('mouseup', finish_point);
                canvas.addEventListener('mouseleave', finish_point);
            }break;
            case 'Wall':{
                ++lineid;
                add_gridline(lineid, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y, color_picker.value);
                function add_point(e){
                    e.stopPropagation();
                    e.preventDefault();
                    add_gridline_point_by_id(lineid, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y);
                    request_render();
                }
                canvas.addEventListener('mousemove', add_point);
                function finish_point(){
                    canvas.removeEventListener('mousemove', add_point);
                    window.removeEventListener('mouseup', finish_point);
                    canvas.removeEventListener('mouseleave', finish_point);
                }
                window.addEventListener('mouseup', finish_point);
                canvas.addEventListener('mouseleave', finish_point);
            }break;
            case 'Floor':{
                ++lineid;
                const x0 = e.offsetX/scale-camera_x;
                const y0 = e.offsetY/scale-camera_y;
                add_gridrect(lineid, x0, y0, color_picker.value);
                function add_point(e){
                    e.stopPropagation();
                    e.preventDefault();
                    change_gridrect_by_id(lineid, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y, x0, y0);
                    request_render();
                }
                canvas.addEventListener('mousemove', add_point);
                function finish_point(){
                    canvas.removeEventListener('mousemove', add_point);
                    window.removeEventListener('mouseup', finish_point);
                    canvas.removeEventListener('mouseleave', finish_point);
                }
                window.addEventListener('mouseup', finish_point);
                canvas.addEventListener('mouseleave', finish_point);
            }break;
            case 'Text':{
                const text = prompt("Enter Text:");
                if(!text.trim()){
                    break;
                }
                const x0 = e.offsetX/scale-camera_x;
                const y0 = e.offsetY/scale-camera_y;
                ++lineid;
                add_text(lineid, x0, y0, text);
                request_render();
            }break;
            case 'Ez-Token':{
                const text = prompt("Enter Token Name:");
                if(!text.trim()){
                    break;
                }
                const x0 = e.offsetX/scale-camera_x;
                const y0 = e.offsetY/scale-camera_y;
                ++lineid;
                add_ez_token(lineid, x0, y0, text, color_picker.value);
                request_render();
            }break;
            default:{
                console.log('unknown tool:', current_tool);
            }break;
        }
    });
});

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
//  filled-rectangle
//  grid-rectangle
//  ellipse - doesn't exist yet
//  image
//  text
//  ez-token
//  img-token
//  door
const FREEHAND_LINE = 1;
const GRID_LINE = 2;
const RECT = 3;
const GRID_RECT = 4;
const FILLED_RECT = 5;
// const ELLIPSE = 6;
const IMAGE = 7;
const TEXT = 8;
const EZ_TOKEN = 9;
const IMG_TOKEN = 10;
const DOOR = 11;
// flags
const FLAG_NONE = 0;
const FLAG_DELETED = 1;
const FLAG_ALL = FLAG_NONE | FLAG_DELETED;
//
//  all objects start as
//  {
//    type: TYPE_ENUM,
//    id: 10001,
//    base_x: 3,
//    base_y: 99,
//    flags: FLAG_NONE,
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
//    type: FREEHAND_LINE,
//    id: 10001,
//    base_x: 3,
//    base_y: 99,
//    flags: FLAG_NONE,
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
//    type: GRID_LINE,
//    id: 10001,
//    base_x: 0,
//    base_y: 256,
//    flags: FLAG_NONE,
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
//    type: RECT,
//    id: 10001,
//    base_x: 3,
//    base_y: 99,
//    flags: FLAG_NONE,
//    color: '#fff',
//    width: 12,
//    height: 18,
//  }
//  filled-rectangle
//  ---------
//  An axis-aligned box, but the center is filled with 'color2'
//  base_x and base_y is the top-left corner of the box.
//  {
//    type: FILLED_RECT,
//    id: 10001,
//    base_x: 3,
//    base_y: 99,
//    flags: FLAG_NONE,
//    color: '#fff',
//    color2: '#fff',
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
//    type: GRID_RECT,
//    id: 10001,
//    base_x: 0,
//    base_y: 256,
//    flags: FLAG_NONE,
//    color: '#fff',
//    width: 64,
//    height: 128,
//  }
//
//  ellipse - doesn't exist yet
//  -------
//  base_x and base_y is the center of the ellipse.
//  We only allow axis-aligned ellipses.
//  {
//    type: ELLIPSE,
//    id: 10001,
//    base_x: 3,
//    base_y: 99,
//    flags: FLAG_NONE,
//    color: '#fff',
//    r_x: 12,
//    r_y: 18,
//  }
//
//  image
//  -----
//  {
//    type: IMAGE,
//    id: 10001,
//    base_x: 3,
//    base_y: 99,
//    flags: FLAG_NONE,
//    width: 99,
//    height: 99,
//    url: "foo-bar",
//    img: Image(),
//  }
//
//  text
//  ----
//  {
//    type: TEXT,
//    id: 10001,
//    base_x: 3,
//    base_y: 99,
//    flags: FLAG_NONE,
//    text: "foozle",
//    size: 18,
//    bbox: bbox,
//  }
//
//  ez-token
//  --------
//  A token that just has a simple text label.
//  {
//    type: EZ_TOKEN,
//    id: 10001,
//    base_x: 32,
//    base_y: 96,
//    flags: FLAG_NONE,
//    text: "foozle",
//    color: "#fff",
//    width: 1, // in squares
//    height: 1, // in squares
//  }
//
//  img-token
//  --------
//  A token that has an image as its contents.
//  {
//    type: IMG_TOKEN,
//    id: 10001,
//    base_x: 32,
//    base_y: 96,
//    flags: FLAG_NONE,
//    url: "foozle.com/foo.png",
//    img: Image,
//    width: 1, // in squares
//    height: 1, // in squares
//  }
//
//  door
//  --------
//  A door.
//  {
//    type: DOOR,
//    id: 10001,
//    base_x: 32,
//    base_y: 96,
//    flags: FLAG_NONE,
//    doortype: DOOR_DOOR,
//    color: '#fff',
//    width: 1, // in squares
//    orientation: VERTICAL,
//  }


// Door subtypes
// ------------
// door: regular dungeon door (rectangle, white filling)
const DOOR_DOOR = 0;
const DOOR_DOUBLE = 1;
const DOOR_PORTCULLIS = 2;
const DOOR_SECRET = 3;
const DOOR_BRICKED_WALL = 4;
const DOOR_PORTAL = 5;
let current_door = DOOR_DOOR;

//
// wall state flags
let walls_snap_to_half_grid = false;

// orientations
const VERTICAL = 0;
const HORIZONTAL = 1;
const TOPLEFT_DOWNRIGHT = 2;
const TOPRIGHT_DOWNLEFT = 3;

//
// THIS NEEDS TO ALWAYS BE POWER OF 2.
// Also if it changes, lots of things will probably break.
const REFERENCE_WIDTH = 64; // the size of a square at scale = 1.
// These are in REFERENCE_WIDTH space.
// To go from screen space to grid space, divide by `scale` and subtract
// `camera_x`/`camera_y`.
// TODO: all this camera_N stuff is totally fucked.
// I should've added camera_x from the start, not subtract.
let camera_x = 0;
let camera_y = 0;
socket.on('canvas-gather', function(where){
    camera_x = where.x;
    camera_y = where.y;
    request_render();
});
let scale = 1;
const MIN_SCALE = 0.125;
const MAX_SCALE = 5;
function clamp_scale(scale){
    if(scale < MIN_SCALE)
        scale = MIN_SCALE;
    if(scale > MAX_SCALE)
        scale = MAX_SCALE;
    return scale;
}
function reset_zoom(){
    const center_x = canvas.width/2/scale - camera_x;
    const center_y = canvas.height/2/scale - camera_y;
    scale = 1;
    camera_x = canvas.width/2/scale - center_x;
    camera_y = canvas.height/2/scale - center_y;
    request_render();
}
function zoom_in(){
    const center_x = canvas.width/2/scale - camera_x;
    const center_y = canvas.height/2/scale - camera_y;
    scale *= 1.50;
    scale = clamp_scale(scale);
    camera_x = canvas.width/2/scale - center_x;
    camera_y = canvas.height/2/scale - center_y;
    request_render();
}
function zoom_out(){
    const center_x = canvas.width/2/scale - camera_x;
    const center_y = canvas.height/2/scale - camera_y;
    scale /= 1.50;
    scale = clamp_scale(scale);
    camera_x = canvas.width/2/scale - center_x;
    camera_y = canvas.height/2/scale - center_y;
    request_render();
}

// The main canvas and its context. These are set once the content loads.
let canvas = null;
let ctx = null;
//
function resize_canvas(){
    canvas = document.getElementsByTagName('canvas')[0];
    ctx = canvas.getContext('2d');
    const parent_rect = canvas.parentElement.getBoundingClientRect();
    const chat_rect = document.getElementById('chat').getBoundingClientRect();
    canvas.width = window.innerWidth - chat_rect.width;
    canvas.height = window.innerHeight-6;
    request_render();
}

//
// freehand-line stuff.
function make_freehand_line(id, base_x, base_y, color){
    base_x = Math.round(base_x);
    base_y = Math.round(base_y);
    const obj =  {
        type: FREEHAND_LINE,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: FLAG_NONE,
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
    x = Math.round(x);
    y = Math.round(y);
    const points = obj.points;
    if(points.length > 1){
        let diff = Math.abs(points[points.length-2] - x);
        diff += Math.abs(points[points.length-1] - y);
        if(diff < 2)
            return;
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
    freehand_recalculate_path(obj);
}
function freehand_recalculate_bbox(obj){
    const points = obj.points;
    const length = points.length;
    if(length > 1){
        obj.bbox.x0 = points[0];
        obj.bbox.y0 = points[1];
        obj.bbox.x1 = points[0];
        obj.bbox.y1 = points[1];
    }
    for(let i = 0; i < length; i+=2){
        let x = points[i];
        let y = points[i+1];
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
    }
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
        let diff = Math.abs(x1 - x0);
        diff += Math.abs(y1 - y0);
        x0 = x1;
        y0 = y1;
    }
    if(length > 2){
        path.quadraticCurveTo(points[length-4]+base_x, points[length-3]+base_y, x0, y0);
    }
    obj.path = path;
}
function add_freehand_point_by_id(id, x, y){
    let obj = canvas_objs.get(id);
    console.assert(obj);
    console.assert(obj.type === FREEHAND_LINE);
    add_freehand_point(obj, x, y);
}

// Rounds a single dimension to the grid.
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
function snap_to_half_grid(x){
    const SNAP = REFERENCE_WIDTH/2;
    x = Math.round(x);
    const remainder = x & (SNAP-1);
    if(remainder < (SNAP>>1)){
        x -= remainder;
    }
    else{
        x += SNAP - remainder;
    }
    return x;
}

function make_gridline(id, base_x, base_y, color){
    if(walls_snap_to_half_grid){
        base_x = snap_to_half_grid(base_x);
        base_y = snap_to_half_grid(base_y);
    }
    else{
        base_x = snap_to_grid(base_x);
        base_y = snap_to_grid(base_y);
    }
    const obj =  {
        type: GRID_LINE,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: FLAG_NONE,
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
    const points = obj.points;
    const last_x = points.length? points[points.length-2]+obj.base_x : obj.base_x;
    const last_y = points.length? points[points.length-1]+obj.base_y : obj.base_x;
    const dist = Math.abs(last_x - x) + Math.abs(last_y - y);
    if(walls_snap_to_half_grid){
        if(dist < 30)
            return;
        if(dist < 64){
            let xrem = Math.round(x) & ((REFERENCE_WIDTH>>1)-1);
            let yrem = Math.round(y) & ((REFERENCE_WIDTH>>1)-1);
            if((xrem > 8 && xrem < 24) || (yrem > 8 && yrem < 24)){
                return;
            }
        }
        x = snap_to_half_grid(x);
        y = snap_to_half_grid(y);
    }
    else {
        if(dist < 60)
            return;
        if(dist < 128){
            let xrem = Math.round(x) & (REFERENCE_WIDTH-1);
            let yrem = Math.round(y) & (REFERENCE_WIDTH-1);
            if((xrem > 16 && xrem < 48) || (yrem > 16 && yrem < 48)){
                return;
            }
        }
        x = snap_to_grid(x);
        y = snap_to_grid(y);
    }
    x -= obj.base_x;
    y -= obj.base_y;
    if(points.length > 1){
        const diff = Math.abs(points[points.length-2]-x) + Math.abs(points[points.length-1]-y);
        if(diff < 2)
            return;
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
function gridline_recalculate_bbox(obj){
    // this is the same as freehand??
    const points = obj.points;
    const length = points.length;
    if(length > 1){
        obj.bbox.x0 = points[0];
        obj.bbox.y0 = points[1];
        obj.bbox.x1 = points[0];
        obj.bbox.y1 = points[1];
    }
    for(let i = 0; i < length; i+=2){
        let x = points[i];
        let y = points[i+1];
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
    }
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
    let obj = canvas_objs.get(id);
    console.assert(obj);
    console.assert(obj.type === GRID_LINE);
    add_gridline_point(obj, x, y);
}
function make_gridrect(id, base_x, base_y, color){
    base_x = snap_to_grid(base_x);
    base_y = snap_to_grid(base_y);
    const obj =  {
        type: GRID_RECT,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: FLAG_NONE,
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
    let obj = canvas_objs.get(id);
    console.assert(obj);
    console.assert(obj.type === GRID_RECT);
    change_gridrect(obj, x0, y0, x1, y1);
}
function make_door(id, x, y, doortype, color, orientation){
    const obj = {
        type: DOOR,
        id: id,
        base_x: x,
        base_y: y,
        flags: FLAG_NONE,
        doortype: doortype,
        color: color,
        width: 1,
        orientation: orientation,
    };
    return obj;
}
function add_door(id, base_x, base_y, doortype, color, orientation){
    const obj = make_door(id, base_x, base_y, doortype, color, orientation);
    add_canv_obj(obj);
}
function make_rect(id, base_x, base_y, color){
    const obj =  {
        type: RECT,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: FLAG_NONE,
        color: color,
        width: 0,
        height: 0,
    };
    return obj;
}
function add_rect(id, base_x, base_y, color){
    const obj = make_rect(id, base_x, base_y, color);
    add_canv_obj(obj);
}
function change_rect(obj, x0, y0, x1, y1){
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
function change_rect_by_id(id, x0, y0, x1, y1){
    let obj = canvas_objs.get(id);
    console.assert(obj);
    console.assert(obj.type === RECT);
    change_rect(obj, x0, y0, x1, y1);
}
function make_filled_rect(id, base_x, base_y, color, color2){
    const obj =  {
        type: FILLED_RECT,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: FLAG_NONE,
        color: color,
        color2: color2,
        width: 0,
        height: 0,
    };
    return obj;
}
function add_filled_rect(id, base_x, base_y, color, color2){
    const obj = make_filled_rect(id, base_x, base_y, color, color2);
    add_canv_obj(obj);
}
function change_filled_rect(obj, x0, y0, x1, y1){
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
    obj.base_x = Math.round(x0);
    obj.base_y = Math.round(y0);
    obj.width = Math.round(x1 - x0);
    obj.height = Math.round(y1 - y0);
    request_render();
}
function change_filled_rect_by_id(id, x0, y0, x1, y1){
    let obj = canvas_objs.get(id);
    console.assert(obj);
    console.assert(obj.type === FILLED_RECT);
    change_rect(obj, x0, y0, x1, y1);
}
function make_text(id, base_x, base_y, text, size){
    base_x = base_x - (base_x & (REFERENCE_WIDTH-1)) + REFERENCE_WIDTH/2;
    base_y = base_y - (base_y & (REFERENCE_WIDTH-1)) + REFERENCE_WIDTH/2;
    const obj =  {
        type: TEXT,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: FLAG_NONE,
        text: text,
        size: size,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
    };
    return obj;
}
function add_text(id, base_x, base_y, text, size){
    const obj = make_text(id, base_x, base_y, text, size);
    add_canv_obj(obj);
}
function make_ez_token(id, base_x, base_y, text, color, width, height){
    base_x = base_x - (base_x & (REFERENCE_WIDTH-1));
    base_y = base_y - (base_y & (REFERENCE_WIDTH-1));
    const obj =  {
        type: EZ_TOKEN,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: FLAG_NONE,
        text: text,
        color:color,
        width: width,
        height: height,
    };
    return obj;
}
function add_ez_token(id, base_x, base_y, text, color, width, height){
    const obj = make_ez_token(id, base_x, base_y, text, color, width, height);
    add_canv_obj(obj);
}
function make_img_token(id, base_x, base_y, url){
    base_x = base_x - (base_x & (REFERENCE_WIDTH-1));
    base_y = base_y - (base_y & (REFERENCE_WIDTH-1));

    const obj =  {
        type: IMG_TOKEN,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: FLAG_NONE,
        url: url,
        img: null,
        width: 1, 
        height: 1,
    };
    const img = new Image(REFERENCE_WIDTH, REFERENCE_WIDTH);
    img.addEventListener('load', function(){
        obj.img = img;
        request_render();
    }, {once:true});
    img.src = url;
    return obj;
}
function add_img_token(id, base_x, base_y, url){
    const obj = make_img_token(id, base_x, base_y, url);
    add_canv_obj(obj);
}

function make_image(id, base_x, base_y, width, height, url){
    base_x = Math.round(base_x);
    base_y = Math.round(base_y);
    base_x = base_x - (base_x & (REFERENCE_WIDTH-1)) + 1;
    base_y = base_y - (base_y & (REFERENCE_WIDTH-1)) + 1;
    const obj =  {
        type: IMAGE,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: FLAG_NONE,
        width: width,
        height: height,
        url: url,
        img: null,
    };
    const img = width && height? new Image(width, height) : new Image();
    img.addEventListener('load', function(){
        obj.img = img;
        if(!width || !height){
            obj.width = img.width;
            obj.height = img.height;
        }
        request_render();
    }, {once:true});
    img.src = url;
    return obj;
}
function add_image(id, base_x, base_y, width, height, url){
    const obj = make_image(id, base_x, base_y, width, height, url);
    add_canv_obj(obj);
}
document.addEventListener('DOMContentLoaded', resize_canvas);
window.addEventListener('resize', resize_canvas);
const canvas_obj_array = [];
const canvas_objs = new Map();
function clear_canvas(){
    canvas_obj_array.length = 0;
    canvas_objs.clear();
    undo_stack.length = 0;
    undo_position = 0;
    clear_copy_buffer();
    selected.clear();
    request_render();
}
socket.on('canvas-clear', function(){
    clear_canvas();
});

let undo_stack = [];
let undo_position = 0;
const UNDO_EVENT_CREATE = 0;
const UNDO_EVENT_DELETE = 1;
const UNDO_EVENT_UPDATE = 2;
const UNDO_EVENT_MASS_CREATE = 3;
// undo event object layouts
// {
//  type: UNDO_EVENT_CREATE,
//  id: 123,
// }
// {
//  type: UNDO_EVENT_MASS_CREATE,
//  ids: [123],
// }
// {
//  type: UNDO_EVENT_DELETE,
//  ids: [123, 456, 789],
// }
// {
//  type: UNDO_EVENT_UPDATE,
//  id: 123,
//  before: {stripped...},
//  after: {stripped...},
// }
function push_undo_event(undo_event){
    undo_stack.length = undo_position;
    undo_stack.push(undo_event);
    const MAX_UNDO_STACK = 100;
    if(undo_stack.length > MAX_UNDO_STACK){
        const new_stack = [];
        // Is there a better way to slice arrays?
        for(let i = undo_stack.length-Math.floor(MAX_UNDO_STACK/2); i < undo_stack.length; i++){
            new_stack.push(undo_stack[i]);
        }
        undo_stack = new_stack;
    }
    undo_position = undo_stack.length;
}
function note_delete_by_ids_for_undo(deleted){
    const undo_event = {
        type: UNDO_EVENT_DELETE,
        ids: deleted,
    };
    push_undo_event(undo_event);
}
function note_create_by_id_for_undo(created_id){
    const undo_event = {
        type: UNDO_EVENT_CREATE,
        id: created_id,
    };
    push_undo_event(undo_event);
}
function note_updates_for_undo(before, after){
    const undo_event = {
        type: UNDO_EVENT_UPDATE,
        before: before,
        after: after,
    };
    push_undo_event(undo_event);
}
function note_mass_create_for_undo(created_ids){
    const undo_event = {
        type: UNDO_EVENT_MASS_CREATE,
        ids: created_ids,
    };
    push_undo_event(undo_event);
}
function do_one_undo(){
    if(!undo_position)
        return;
    undo_position--;
    const undo_event = undo_stack[undo_position];
    switch(undo_event.type){
        case UNDO_EVENT_CREATE:{
            const obj = canvas_objs.get(undo_event.id);
            obj.flags |= FLAG_DELETED;
            publish_delete_by_ids([obj.id]);
        }break;
        case UNDO_EVENT_DELETE:{
            const ids = undo_event.ids;
            const length = ids.length;
            const stripped = get_stripped_state_by_id(ids);
            for(let i = 0; i < length; i++){
                const obj = canvas_objs.get(ids[i]);
                obj.flags &= ~FLAG_DELETED;
                stripped[i].flags &= ~FLAG_DELETED;
            }
            // maybe there should be an undelete?
            publish_obj_updates(stripped);
        }break;
        case UNDO_EVENT_MASS_CREATE:{
            const ids = undo_event.ids;
            const length = ids.length;
            for(let i = 0; i < length; i++){
                const obj = canvas_objs.get(ids[i]);
                obj.flags |= FLAG_DELETED;
            }
            publish_delete_by_ids([ids]);
        }break;
        case UNDO_EVENT_UPDATE:{
            set_obj_states_from_stripped_objs(undo_event.before);
            publish_obj_updates(undo_event.before);
        }break;
    }
    request_render();
}
function do_one_redo(){
    if(undo_position == undo_stack.length)
        return;
    const undo_event = undo_stack[undo_position];
    switch(undo_event.type){
        case UNDO_EVENT_CREATE:{
            const obj = canvas_objs.get(undo_event.id);
            obj.flags &= ~FLAG_DELETED;
            const stripped = get_stripped_state_by_id([undo_event.id]);
            publish_obj_updates(stripped);
        }break;
        case UNDO_EVENT_DELETE:{
            const ids = undo_event.ids;
            const length = ids.length;
            for(let i = 0; i < length; i++){
                const obj = canvas_objs.get(ids[i]);
                obj.flags |= FLAG_DELETED; 
            }
            publish_delete_by_ids(undo_event.ids);
        }break;
        case UNDO_EVENT_MASS_CREATE:{
            const ids = undo_event.ids;
            const length = ids.length;
            for(let i = 0; i < length; i++){
                const obj = canvas_objs.get(ids[i]);
                obj.flags &= ~ FLAG_DELETED;
            }
            const stripped = get_stripped_state_by_id(undo_event.ids);
            publish_obj_updates(stripped);
        }break;
        case UNDO_EVENT_UPDATE:{
            set_obj_states_from_stripped_objs(undo_event.after);
            publish_obj_updates(undo_event.after);
        }break;
    }
    undo_position++;
    request_render();
}
function undo_is_impossible(){
    return !undo_position;
}
function redo_is_impossible(){
    return undo_position == undo_stack.length;
}
let localid = 0;
// Combines the session id with the local id to create a
// unique id for an object
function get_new_id(){
    ++localid;
    let id = (session_id << 20) + localid;
    return id;
}
const copied_objs = [];
function clear_copy_buffer(){
    copied_objs.length = 0;
}
function copy_selected_objs_to_copy_buffer(){
    for(let obj_id of selected){
        const obj = canvas_objs.get(obj_id);
        if(obj.flags & FLAG_DELETED)
            continue;
        const stripped = strip_obj(obj, STRIP_FLAGS_NONE);
        copied_objs.push(stripped);
    }
}

function cut_selected_objs_to_copy_buffer(){
    for(let obj_id of selected){
        const obj = canvas_objs.get(obj_id);
        if(obj.flags & FLAG_DELETED)
            continue;
        const stripped = strip_obj(obj, STRIP_FLAGS_NONE);
        copied_objs.push(stripped);
        obj.flags |= FLAG_DELETED;
    }
    publish_delete_by_ids(Array.from(selected));
    note_delete_by_ids_for_undo(Array.from(selected));
    selected.clear()
    request_render();
}
function paste_from_copy_buffer_at(x, y){
    x = snap_to_grid(x);
    y = snap_to_grid(y);
    const length = copied_objs.length;
    // Do a pre-pass to get the top left corner of the objects.
    let x0 = 0;
    let y0 = 0;
    if(length){
        x0 = copied_objs[0].base_x;
        y0 = copied_objs[0].base_y;
    }
    for(let i = 0; i < length; ++i){
        const stripped = copied_objs[i];
        if(stripped.base_x < x0)
            x0 = stripped.base_x;
        if(stripped.base_y < y0)
            y0 = stripped.base_y;
    }
    const dx = x - x0;
    const dy = y - y0;
    const new_ids = [];
    for(let i = 0; i < length; ++i){
        const stripped = copied_objs[i];
        // This is a lot of very similar code to the below function in
        // canvas-create, but there is a lot of weirdness over copying
        // objects in JS, so I am just grabbing attributes by hand.
        let id = get_new_id();
        const obj = {
            type: stripped.type,
            id: id,
            base_x: stripped.base_x + dx,
            base_y: stripped.base_y + dy,
            flags: FLAG_NONE,
        };
        switch(obj.type){
            case FREEHAND_LINE:
                obj.color = stripped.color;
                obj.points = Array.from(stripped.points);
                obj.path = null;
                obj.bbox = {x0:0, y0:0, x1:0, y1:0};
                freehand_recalculate_bbox(obj);
                freehand_recalculate_path(obj);
                break;
            case GRID_LINE:
                obj.color = stripped.color;
                obj.points = Array.from(stripped.points);
                obj.path = null;
                obj.bbox = {x0:0, x1:0, y0:0, y1:0};
                gridline_recalculate_bbox(obj);
                gridline_recalculate_path(obj);
                break;
            case RECT:
                obj.color = stripped.color;
                obj.width = stripped.width;
                obj.height = stripped.height;
                break;
            case FILLED_RECT:
                obj.color = stripped.color;
                obj.color2 = stripped.color2;
                obj.width = stripped.width;
                obj.height = stripped.height;
                break;
            case GRID_RECT:
                obj.color = stripped.color;
                obj.width = stripped.width;
                obj.height = stripped.height;
                break;
            case IMAGE:{
                obj.width = stripped.width;
                obj.height = stripped.height;
                obj.url = stripped.url;
                obj.img = null;
                const img = new Image(obj.width, obj.height);
                img.addEventListener('load', function(){
                    obj.img = img;
                    request_render();
                }, {once:true});
                img.src = obj.url;
            }break;
            case TEXT:
                obj.text = stripped.text;
                obj.bbox = {x0:0, x1:0, y0:0, y1:0};
                obj.size = stripped.size;
                break;
            case EZ_TOKEN:
                obj.text = stripped.text;
                obj.color = stripped.color;
                obj.width = stripped.width;
                obj.height = stripped.height;
                break;
            case IMG_TOKEN:{
                obj.url = stripped.url;
                obj.img = null;
                obj.width = stripped.width;
                obj.height = stripped.height;
                const img = new Image(obj.width, obj.height);
                img.addEventListener('load', function(){
                    obj.img = img;
                    request_render();
                }, {once:true});
                img.src = obj.url;
            }break;
            case DOOR:{
                obj.doortype = stripped.doortype;
                obj.color = stripped.color;
                obj.width = stripped.width;
                obj.orientation = stripped.orientation;
            }break;
        }
        add_canv_obj(obj);
        new_ids.push(id);
        publish_obj_by_id(obj.id);
    }
    note_mass_create_for_undo(new_ids);
    request_render();
}
socket.on('canvas-create', function(objs){
    const length = objs.length;
    for(let i = 0; i < length; ++i){
        const obj = objs[i];
        let origin = get_session_id_from_obj_id(obj.id);
        // if(origin == session_id){
            // continue;
        // }
        switch(obj.type){
            case FREEHAND_LINE:
                obj.bbox = {x0:0, x1:0, y0:0, y1:0};
                freehand_recalculate_bbox(obj);
                freehand_recalculate_path(obj);
                break;
            case GRID_LINE:
                obj.bbox = {x0:0, x1:0, y0:0, y1:0};
                gridline_recalculate_bbox(obj);
                gridline_recalculate_path(obj);
                break;
            case FILLED_RECT:
                break;
            case RECT:
                break;
            case GRID_RECT:
                break;
            case IMAGE:{
                obj.img = null;
                const img = new Image(obj.width, obj.height);
                img.addEventListener('load', function(){
                    obj.img = img;
                    request_render();
                }, {once:true});
                img.src = obj.url;
            }break;
            case TEXT:
                obj.bbox = {x0:0, x1:0, y0:0, y1:0};
                break;
            case EZ_TOKEN:
                break;
            case IMG_TOKEN:{
                obj.img = null;
                const img = new Image(obj.width, obj.height);
                img.addEventListener('load', function(){
                    obj.img = img;
                    request_render();
                }, {once:true});
                img.src = obj.url;
            }break;
            case DOOR:{
            }break;
        }
        const existing_obj = canvas_objs.get(obj.id);
        if(existing_obj){
            console.log('object already exists???', obj.id);
        }
        else {
            add_canv_obj(obj);
        }
    }
    request_render();
});
socket.on('canvas-delete', function(obj_ids){
    const length = obj_ids.length;
    for(let i = 0; i < length; i++){
        const id = obj_ids[i];
        const obj = canvas_objs.get(id);
        if(obj){
            obj.flags |= FLAG_DELETED;
        }
        else {
            console.log('Deleting unknown object??', id);
        }
    }
    request_render();
});


socket.on('canvas-update', function(obj_states){
    set_obj_states_from_stripped_objs(obj_states);
    request_render();
});
function set_obj_states_from_stripped_objs(obj_states){
    const length = obj_states.length;
    for(let i = 0; i < length; ++i){
        const state = obj_states[i];
        const obj = canvas_objs.get(state.id);
        if(!obj){
            console.log('Updating unknown object??', state.id);
            continue;
        }
        obj.base_x = state.base_x;
        obj.base_y = state.base_y;
        obj.flags = state.flags;
        switch(obj.type){
            case FREEHAND_LINE:
                obj.bbox = {x0:0, x1:0, y0:0, y1:0};
                obj.points = state.points;
                obj.color = state.color;
                freehand_recalculate_bbox(obj);
                freehand_recalculate_path(obj);
                break;
            case GRID_LINE:
                obj.bbox = {x0:0, x1:0, y0:0, y1:0};
                obj.points = state.points;
                obj.color = state.color;
                gridline_recalculate_bbox(obj);
                gridline_recalculate_path(obj);
                break;
            case FILLED_RECT:
                obj.width = state.width;
                obj.height = state.height;
                obj.color = state.color;
                obj.color2 = state.color2;
                break;
            case RECT:
                obj.width = state.width;
                obj.height = state.height;
                obj.color = state.color;
                break;
            case GRID_RECT:
                obj.width = state.width;
                obj.height = state.height;
                obj.color = state.color;
                break;
            case IMAGE:{
                const needs_new_image = (obj.width !== state.width) || (obj.height !== state.height) || (obj.url !== state.url);
                obj.width = state.width;
                obj.height = state.height;
                if(needs_new_image){
                    const img = new Image(obj.width, obj.height);
                    img.addEventListener('load', function(){
                        obj.img = img;
                        request_render();
                    }, {once:true});
                    img.src = obj.url;
                }
            }break;
            case TEXT:
                obj.bbox = {x0:0, x1:0, y0:0, y1:0};
                obj.text = state.text;
                break;
            case EZ_TOKEN:
                obj.color = state.color;
                obj.text = state.text;
                obj.width = state.width;
                obj.height = state.height;
                break;
            case IMG_TOKEN:{
                obj.width = state.width;
                obj.height = state.height;
                // idk
            }break;
            case DOOR:
                obj.color = state.color;
                obj.doortype = state.doortype;
                obj.width = state.width;
                obj.orientation = state.orientation;
                break;
        }
    }
}
const selected = new Set();
// These are a bit flags
// Select background things (walls, lines).
const SELECT_MAP = 1;
// can select token types
const SELECT_TOKEN = 2;
const SELECT_ANY = SELECT_MAP | SELECT_TOKEN;
const selection_area = {
    select_type: SELECT_ANY,
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
    // const before = performance.now();
    const length = canvas_obj_array.length;
    const x0 = selection_area.x0;
    const y0 = selection_area.y0;
    const x1 = selection_area.x1;
    const y1 = selection_area.y1;
    const selection_bbox = {x0:x0, y0:y0, x1:x1, y1:y1,};
    const selection_type = selection_area.select_type;
    for(let i = 0; i < length; ++i){
        const obj = canvas_obj_array[i];
        if(obj.flags & FLAG_DELETED)
            continue;
        switch(obj.type){
            case GRID_LINE: // fall-through
            case FREEHAND_LINE:{
                if(!(selection_type & SELECT_MAP))
                    break;
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
            case FILLED_RECT:
            case RECT: // fall-through
            case IMAGE: // fall-through
            case GRID_RECT:{
                if(!(selection_type & SELECT_MAP))
                    break;
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
            case IMG_TOKEN:// fall-through
            case EZ_TOKEN:{
                if(!(selection_type & SELECT_TOKEN))
                    break;
                const radius_x = obj.width*REFERENCE_WIDTH/2;
                const radius_y = obj.height*REFERENCE_WIDTH/2;
                const token_bbox = {
                    x0: obj.base_x,
                    x1: obj.base_x + 2*radius_x,
                    y0: obj.base_y,
                    y1: obj.base_y + 2*radius_y,
                };
                if(bbox_overlaps(token_bbox, selection_bbox)){
                    selected.add(obj.id);
                    break;
                }
            }break;
            case TEXT:{
                if(!(selection_type & SELECT_MAP))
                    break;
                const text_bbox = {
                    x0:obj.bbox.x0 + obj.base_x,
                    y0:obj.bbox.y0 + obj.base_y,
                    x1:obj.bbox.x1 + obj.base_x,
                    y1:obj.bbox.y1 + obj.base_y,
                };
                if(bbox_overlaps(text_bbox, selection_bbox)){
                    selected.add(obj.id);
                    break;
                }
            }
            case DOOR:{
                if(!(selection_type & SELECT_MAP))
                    break;
                const is_vertical = obj.orientation === VERTICAL;
                if(is_vertical){
                    // FIXME: I just hardcoded some random values.
                    const bbox = {
                        x0 : obj.base_x - 32,
                        x1 : obj.base_x + 32,
                        y0 : obj.base_y - 5,
                        y1 : obj.base_y +5,
                    };
                    if(bbox_overlaps(bbox, selection_bbox)){
                        selected.add(obj.id);
                        break;
                    }
                }
                else {
                    // FIXME: I just hardcoded some random values.
                    const bbox = {
                        x0 : obj.base_x - 5,
                        x1 : obj.base_x + 5,
                        y0 : obj.base_y - 32,
                        y1 : obj.base_y + 32,
                    };
                    if(bbox_overlaps(bbox, selection_bbox)){
                        selected.add(obj.id);
                        break;
                    }
                }
            }break;
        }
    }
    // const after = performance.now();
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
function change_select_mode(mode){
    selected.clear();
    selection_area.select_type = mode;
    note_selections();
    request_render();
}
function move_selected_objects(base_x, base_y, dx, dy){
    const selected_objs = [];
    let result = [base_x+dx, base_y+dy];
    let rigid = false;
    for(let item of selected){
        const obj = canvas_objs.get(item);
        if(obj.flags & FLAG_DELETED)
            continue;
        switch(obj.type){
            case GRID_RECT:
            case GRID_LINE:
            case IMAGE:
            case DOOR:
            case EZ_TOKEN:
            case IMG_TOKEN:
                rigid = true;
                break;
            default:
                break;
        }
        selected_objs.push(obj);
    }
    if(!selected_objs.length)
        return result;
    if(rigid){
        const aligned_old_x = snap_to_grid(base_x);
        const aligned_old_y = snap_to_grid(base_y);
        const aligned_new_x = snap_to_grid(base_x+dx);
        const aligned_new_y = snap_to_grid(base_y+dy);
        dx = aligned_new_x - aligned_old_x;
        dy = aligned_new_y - aligned_old_y;
        if(dx || dy){
            for(let i = 0; i < selected_objs.length; i++){
                const obj = selected_objs[i];
                obj.base_x += dx;
                obj.base_y += dy;
                switch(obj.type){
                    case FREEHAND_LINE:
                        freehand_recalculate_path(obj);
                        break;
                    case GRID_LINE:
                        gridline_recalculate_path(obj);
                        break;
                    case FILLED_RECT:
                    case RECT:
                    case GRID_RECT:
                        break;
                    case IMAGE:
                        break;
                    case TEXT:
                        break;
                    case EZ_TOKEN:
                        break;
                    case IMG_TOKEN:
                        break;
                    case DOOR:
                        break;
                    default:
                        console.log('unhandled obj type');
                        break;
                }
            }
        }
        result = [aligned_new_x, aligned_new_y];
    }
    else {
        for(let i = 0; i < selected_objs.length; i++){
            const obj = selected_objs[i];
            obj.base_x += dx;
            obj.base_y += dy;
            // FIXME: this sucks, we need to switch on type here
            // so that path objects can get updated.
            switch(obj.type){
                case FREEHAND_LINE:
                    freehand_recalculate_path(obj);
                    break;
                case GRID_LINE:
                    gridline_recalculate_path(obj);
                    break;
                case FILLED_RECT:
                case RECT:
                case GRID_RECT:
                    break;
                case IMAGE:
                    break;
                case TEXT:
                    break;
                case EZ_TOKEN:
                    break;
                case IMG_TOKEN:
                    break;
                case DOOR:
                    break;
                default:
                    console.log('unhandled obj type');
                    break;
            }
        }
    }
    request_render();
    return result;
}

function add_canv_obj(obj){
    canvas_objs.set(obj.id, obj);
    canvas_obj_array.push(obj);
}
const STRIP_FLAGS_NONE = 0;
const STRIP_INCLUDE_ID = 1;
function strip_obj(obj, include_flags){
    let stripped_obj = {
        type: obj.type,
        base_x: obj.base_x,
        base_y: obj.base_y,
        flags: obj.flags,
    };
    if(include_flags & STRIP_INCLUDE_ID){
        stripped_obj.id = obj.id;
    }
    switch(obj.type){
        case FREEHAND_LINE:
            stripped_obj.points = obj.points;
            stripped_obj.color = obj.color;
            break;
        case GRID_LINE:
            stripped_obj.points = obj.points;
            stripped_obj.color = obj.color;
            break;
        case FILLED_RECT:
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            stripped_obj.color = obj.color;
            stripped_obj.color2 = obj.color2;
            break;
        case RECT:
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            stripped_obj.color = obj.color;
            break;
        case GRID_RECT:
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            stripped_obj.color = obj.color;
            break;
        case IMAGE:
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            stripped_obj.url = obj.url;
            break;
        case TEXT:
            stripped_obj.text = obj.text;
            stripped_obj.size = obj.size;
            break;
        case EZ_TOKEN:
            stripped_obj.color = obj.color;
            stripped_obj.text = obj.text;
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            break;
        case IMG_TOKEN:
            stripped_obj.url = obj.url;
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            break;
        case DOOR:
            stripped_obj.color = obj.color;
            stripped_obj.width = obj.width;
            stripped_obj.doortype = obj.doortype;
            stripped_obj.orientation = obj.orientation;
            break;
    }
    return stripped_obj;
}
function publish_delete_by_ids(ids){
    socket.emit('canvas-delete', ids)
}
function publish_obj_by_id(id){
    const obj = canvas_objs.get(id);
    if(!obj){
        console.log('invalid id given for publishing:', id);
        return;
    }
    const stripped_obj = strip_obj(obj, STRIP_INCLUDE_ID);
    socket.emit('canvas-create', stripped_obj);
}
function get_stripped_state_by_id(ids){
    const length = ids.length;
    const updates = []
    for(let i = 0; i < length; ++i){
        const id = ids[i];
        const obj = canvas_objs.get(id);
        if(!obj){
            console.log('Invalid id given for publishing update', id);
            continue;
        }
        const stripped = strip_obj(obj, STRIP_INCLUDE_ID);
        updates.push(stripped);
    }
    return updates;
}
function publish_obj_updates(updates){
    socket.emit('canvas-update', updates);
}

function edit_is_impossible(){
    if(selected.size !== 1)
        return true;
    const first = selected.values().next().value;
    const obj = canvas_objs.get(first);
    switch(obj.type){
        case FREEHAND_LINE:
            return true;
        case GRID_LINE:
            return true;
        case RECT:
            return true;
        case GRID_RECT:
            return true;
        case FILLED_RECT:
            return true;
        case IMAGE:
            return false;
        case TEXT:
            return true;
        case EZ_TOKEN:
            return false;
        case IMG_TOKEN:
            return false;
        case DOOR:
            return true;
    }
    return false;
}

function launch_edit_dialog(){
    if(selected.size !== 1)
        return;
    const first = selected.values().next().value;
    const obj = canvas_objs.get(first);
    switch(obj.type){
        case FREEHAND_LINE:
            return;
        case GRID_LINE:
            return;
        case RECT:
            return;
        case GRID_RECT:
            return;
        case FILLED_RECT:
            return;
        case IMAGE:
            return;
        case TEXT:
            return;
        case EZ_TOKEN:{
            const html = `
            <h2>Edit Token</h2>
            <table class="input-container">
                <tr>
                    <td><label for="color">Color:</label>
                    <td><input type="color" id="hover-color" value="`+obj.color+`">
                </tr>
                <tr>
                    <td><label for="width">Width (sq):</label>
                    <td><input type="number" name="width" id="hover-width" min="1" max="5" value="`+obj.width+`" class="numeric-input">
                    <td><label for="height">Height (sq):</label>
                    <td><input type="number" name="height" id="hover-height" min="1" max="5" value="`+obj.height+`" class="numeric-input">
                </tr>
                <tr>
                    <td><label for="text">Text:</label>
                    <td colspan="3"><input type="text" name="text" id="hover-text" value="`+obj.text+`">
                </tr>
            </table>
            `;
            make_ok_dialog(html, function(hoverpop){
                const text_input = document.getElementById('hover-text');
                const text = text_input.value;
                const before = strip_obj(obj, STRIP_INCLUDE_ID);
                if(text){
                    obj.text = text;
                }
                const width = +document.getElementById('hover-width').value;
                const height = +document.getElementById('hover-height').value;
                if(!width)
                    width = 1;
                if(!height)
                    height = 1;
                obj.width = width;
                obj.height = height;
                const color = document.getElementById('hover-color').value;
                obj.color = color;
                const after = strip_obj(obj, STRIP_INCLUDE_ID);
                publish_obj_updates([after]);
                request_render();
            });
        }return;
        case IMG_TOKEN:{
        }return;
        case DOOR:
            return;
    }

}

// State variable so that we don't double render in a single frame.
// requestAnimationFrame calls stack, so to avoid double drawing, you
// need to keep track of this.
let animation_requested = false;
function request_render(){
    if(animation_requested){
        return;
    }
    animation_requested = true;
    // only call this from here to avoid double renders.
    requestAnimationFrame(render);
}
// const timings = [];
function render(){
    // const before = performance.now();
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
    const canvas_bbox = {
        x0:-camera_x,
        y0:-camera_y,
        x1:-camera_x+width/scale,
        y1:-camera_y+height/scale,
    };
    for(let i = 0; i < length; ++i){
        let obj = canvas_obj_array[i];
        if(obj.flags & FLAG_DELETED)
            continue;
        const is_selected = selected.has(obj.id);
        switch(obj.type){
            case FREEHAND_LINE:{
                // This works well enough for now.
                // If things get hairy, I could build a quadtree or whatever.
                const line_bbox = {
                    x0:obj.bbox.x0 + obj.base_x,
                    y0:obj.bbox.y0 + obj.base_y,
                    x1:obj.bbox.x1 + obj.base_x,
                    y1:obj.bbox.y1 + obj.base_y,
                };
                if(!bbox_overlaps(canvas_bbox, line_bbox)){
                    break;
                }
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
            case GRID_LINE:{
                const line_bbox = {
                    x0:obj.bbox.x0 + obj.base_x,
                    y0:obj.bbox.y0 + obj.base_y,
                    x1:obj.bbox.x1 + obj.base_x,
                    y1:obj.bbox.y1 + obj.base_y,
                };
                if(!bbox_overlaps(canvas_bbox, line_bbox)){
                    break;
                }
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
            case FILLED_RECT:{
                const rect_bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+obj.width,
                    y1:obj.base_y+obj.height,
                };
                if(!bbox_overlaps(rect_bbox, canvas_bbox)){
                    break;
                }
                if(obj.width && obj.height){
                    if(is_selected){
                        ctx.lineWidth=8;
                        ctx.strokeStyle = SELECTED_COLOR;
                        ctx.strokeRect(obj.base_x-2, obj.base_y-2, obj.width+4, obj.height+4);
                    }
                    ctx.lineWidth=4;
                    ctx.fillStyle = obj.color2;
                    ctx.fillRect(obj.base_x, obj.base_y, obj.width, obj.height);
                    ctx.strokeStyle = obj.color;
                    ctx.strokeRect(obj.base_x, obj.base_y, obj.width, obj.height);
                }
            }break;
            case RECT:{
                const rect_bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+obj.width,
                    y1:obj.base_y+obj.height,
                };
                if(!bbox_overlaps(rect_bbox, canvas_bbox)){
                    break;
                }
                if(obj.width && obj.height){
                    if(is_selected){
                        ctx.lineWidth=8;
                        ctx.strokeStyle = SELECTED_COLOR;
                        ctx.strokeRect(obj.base_x-2, obj.base_y-2, obj.width+4, obj.height+4);
                    }
                    ctx.lineWidth=4;
                    ctx.strokeStyle = obj.color;
                    ctx.strokeRect(obj.base_x, obj.base_y, obj.width, obj.height);
                }
            }break;
            case GRID_RECT:{
                const rect_bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+obj.width,
                    y1:obj.base_y+obj.height,
                };
                if(!bbox_overlaps(rect_bbox, canvas_bbox)){
                    break;
                }
                if(obj.width && obj.height){
                    if(is_selected){
                        ctx.fillStyle = SELECTED_COLOR+'aa';
                        ctx.fillRect(obj.base_x-2, obj.base_y-2, obj.width+4, obj.height+4);
                    }
                    ctx.fillStyle = obj.color + 'aa';
                    ctx.fillRect(obj.base_x, obj.base_y, obj.width, obj.height);
                }
            }break;
            case TEXT:{
                if(obj.text){
                    ctx.font = obj.size + 'px sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = "center";
                    if(obj.bbox.x0 == obj.bbox.x1){
                        let metric = ctx.measureText(obj.text);
                        // Metric object varies between browser, but I believe
                        // they all have width?
                        let width = metric.width;
                        // Only some have this property.
                        let height = metric.fontBoundingBoxAscent? metric.fontBoundingBoxAscent + 2 : obj.size;
                        obj.bbox.x0 = -width/2;
                        obj.bbox.x1 = width/2;
                        obj.bbox.y0 = -height/2;
                        obj.bbox.y1 = height/2;
                    }
                    const text_bbox = {
                        x0:obj.bbox.x0 + obj.base_x,
                        y0:obj.bbox.y0 + obj.base_y,
                        x1:obj.bbox.x1 + obj.base_x,
                        y1:obj.bbox.y1 + obj.base_y,
                    };
                    if(!bbox_overlaps(text_bbox, canvas_bbox)){
                        break;
                    }
                    if(is_selected){
                        ctx.fillStyle = SELECTED_COLOR+'aa';
                        const x = obj.base_x+obj.bbox.x0;
                        const y = obj.base_y+obj.bbox.y0;
                        const width = obj.bbox.x1-obj.bbox.x0;
                        const height = obj.bbox.y1-obj.bbox.y0;
                        ctx.fillRect(x, y, width, height);
                    }
                    ctx.fillStyle = '#000';
                    ctx.fillText(obj.text, obj.base_x, obj.base_y);
                }
            }break;
            case EZ_TOKEN:{
                // TODO: currently we don't consider radius_y
                const radius_x = obj.width*REFERENCE_WIDTH/2;
                const radius_y = obj.height*REFERENCE_WIDTH/2;
                const token_bbox = {
                    x0: obj.base_x,
                    x1: obj.base_x + 2*radius_x,
                    y0: obj.base_y,
                    y1: obj.base_y + 2*radius_y,
                };
                if(!bbox_overlaps(token_bbox, canvas_bbox)){
                    break;
                }
                if(is_selected){
                    ctx.beginPath();
                    ctx.fillStyle = SELECTED_COLOR;
                    ctx.arc(obj.base_x+radius_x, obj.base_y+radius_y, radius_x+4, 0, 2*Math.PI);
                    ctx.fill();
                }
                ctx.beginPath();
                ctx.fillStyle = '#000';
                ctx.arc(obj.base_x+radius_x, obj.base_y+radius_y, radius_x, 0, 2*Math.PI);
                ctx.fill();
                ctx.beginPath();
                ctx.fillStyle = obj.color;
                ctx.arc(obj.base_x+radius_x, obj.base_y+radius_y, radius_x-2, 0, 2*Math.PI);
                ctx.fill();
                ctx.font = '18px sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = "center";
                ctx.fillStyle = '#000';
                ctx.fillText(obj.text, obj.base_x+radius_x, obj.base_y+radius_y);
            }break;
            case IMAGE:{
                const rect_bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+obj.width,
                    y1:obj.base_y+obj.height,
                };
                if(!bbox_overlaps(rect_bbox, canvas_bbox)){
                    break;
                }
                if(is_selected){
                    ctx.fillStyle = SELECTED_COLOR+'aa';
                    ctx.fillRect(obj.base_x-4, obj.base_y-4, obj.width+8, obj.height+8);
                }
                if(obj.img)
                    ctx.drawImage(obj.img, obj.base_x, obj.base_y, obj.width, obj.height);
                else {
                    ctx.fillStyle = '#337733aa';
                    ctx.fillRect(obj.base_x, obj.base_y, obj.width, obj.height);
                }
            }break;
            case IMG_TOKEN:{
                // TODO: currently we don't consider radius_y
                const radius_x = obj.width*REFERENCE_WIDTH/2;
                const radius_y = obj.height*REFERENCE_WIDTH/2;
                const token_bbox = {
                    x0: obj.base_x,
                    x1: obj.base_x + 2*radius_x,
                    y0: obj.base_y,
                    y1: obj.base_y + 2*radius_y,
                };
                if(!bbox_overlaps(token_bbox, canvas_bbox)){
                    break;
                }
                if(is_selected){
                    ctx.beginPath();
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = SELECTED_COLOR;
                    ctx.arc(obj.base_x+radius_x, obj.base_y+radius_y, radius_x+2, 0, 2*Math.PI);
                    ctx.stroke();
                }
                ctx.beginPath();
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#000';
                ctx.arc(obj.base_x+radius_x, obj.base_y+radius_y, radius_x-2, 0, 2*Math.PI);
                ctx.stroke();
                if(obj.img){
                    ctx.drawImage(obj.img, obj.base_x, obj.base_y, radius_x*2, radius_y*2);
                }
                else {
                    ctx.beginPath();
                    ctx.fillStyle = '#333333';
                    ctx.arc(obj.base_x+radius_x, obj.base_y+radius_y, radius_x-4, 0, 2*Math.PI);
                    ctx.fill();
                }
            }break;
            case DOOR:{
                const is_vertical = obj.orientation === VERTICAL;
                if(!is_vertical){
                    // FIXME: I just hardcoded some random values.
                    const bbox = {
                        x0 : obj.base_x - 32,
                        x1 : obj.base_x + 32,
                        y0 : obj.base_y - 5,
                        y1 : obj.base_y +5,
                    };
                    if(!bbox_overlaps(bbox, canvas_bbox)){
                        break;
                    }
                }
                else {
                    // FIXME: I just hardcoded some random values.
                    const bbox = {
                        x0 : obj.base_x - 5,
                        x1 : obj.base_x + 5,
                        y0 : obj.base_y - 32,
                        y1 : obj.base_y + 32,
                    };
                    if(!bbox_overlaps(bbox, canvas_bbox)){
                        break;
                    }
                }
                switch(obj.doortype){
                    case DOOR_DOUBLE:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case VERTICAL:
                                    ctx.strokeRect(obj.base_x-10, obj.base_y-24, 20, 48);
                                    break;
                                case HORIZONTAL:
                                    ctx.strokeRect(obj.base_x-24, obj.base_y-10, 48, 20);
                                    break;
                                case TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x-22, obj.base_y-22)
                                    ctx.lineTo(obj.base_x+22, obj.base_y+22);
                                    ctx.stroke();
                                    break;
                                case TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x+22, obj.base_y-22)
                                    ctx.lineTo(obj.base_x-22, obj.base_y+22);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.fillStyle = '#fff';
                        ctx.strokeStyle = obj.color;
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case VERTICAL:
                                ctx.fillRect(obj.base_x-10, obj.base_y-24, 20, 48);
                                ctx.strokeRect(obj.base_x-10, obj.base_y-24, 20, 48);
                                ctx.strokeRect(obj.base_x-10, obj.base_y, 20, 1);
                                break;
                            case HORIZONTAL:
                                ctx.fillRect(obj.base_x-24, obj.base_y-10, 48, 20);
                                ctx.strokeRect(obj.base_x-24, obj.base_y-10, 48, 20);
                                ctx.strokeRect(obj.base_x, obj.base_y-10, 1, 20);
                                break;
                            case TOPLEFT_DOWNRIGHT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-20, obj.base_y-20)
                                ctx.lineTo(obj.base_x+20, obj.base_y+20);
                                ctx.stroke();
                                ctx.strokeStyle = '#fff';
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-16, obj.base_y-16)
                                ctx.lineTo(obj.base_x-2, obj.base_y-2);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+2, obj.base_y+2)
                                ctx.lineTo(obj.base_x+16, obj.base_y+16);
                                ctx.stroke();
                                break;
                            case TOPRIGHT_DOWNLEFT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+20, obj.base_y-20)
                                ctx.lineTo(obj.base_x-20, obj.base_y+20);
                                ctx.stroke();
                                ctx.strokeStyle = '#fff';
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+16, obj.base_y-16)
                                ctx.lineTo(obj.base_x+2, obj.base_y-2);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-2, obj.base_y+2)
                                ctx.lineTo(obj.base_x-16, obj.base_y+16);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DOOR_DOOR:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case VERTICAL:
                                    ctx.strokeRect(obj.base_x-10, obj.base_y-24, 20, 48);
                                    break;
                                case HORIZONTAL:
                                    ctx.strokeRect(obj.base_x-24, obj.base_y-10, 48, 20);
                                    break;
                                case TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x-22, obj.base_y-22)
                                    ctx.lineTo(obj.base_x+22, obj.base_y+22);
                                    ctx.stroke();
                                    break;
                                case TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x+22, obj.base_y-22)
                                    ctx.lineTo(obj.base_x-22, obj.base_y+22);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.fillStyle = '#fff';
                        ctx.strokeStyle = obj.color;
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case VERTICAL:
                                ctx.fillRect(obj.base_x-10, obj.base_y-24, 20, 48);
                                ctx.strokeRect(obj.base_x-10, obj.base_y-24, 20, 48);
                                break;
                            case HORIZONTAL:
                                ctx.fillRect(obj.base_x-24, obj.base_y-10, 48, 20);
                                ctx.strokeRect(obj.base_x-24, obj.base_y-10, 48, 20);
                                break;
                            case TOPLEFT_DOWNRIGHT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-20, obj.base_y-20)
                                ctx.lineTo(obj.base_x+20, obj.base_y+20);
                                ctx.stroke();
                                ctx.strokeStyle = '#fff';
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-16, obj.base_y-16)
                                ctx.lineTo(obj.base_x+16, obj.base_y+16);
                                ctx.stroke();
                                break;
                            case TOPRIGHT_DOWNLEFT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+20, obj.base_y-20)
                                ctx.lineTo(obj.base_x-20, obj.base_y+20);
                                ctx.stroke();
                                ctx.strokeStyle = '#fff';
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+16, obj.base_y-16)
                                ctx.lineTo(obj.base_x-16, obj.base_y+16);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DOOR_PORTCULLIS:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case VERTICAL:
                                    ctx.strokeRect(obj.base_x-10, obj.base_y-16, 20, 32);
                                    break;
                                case HORIZONTAL:
                                    ctx.strokeRect(obj.base_x-16, obj.base_y-10, 32, 20);
                                    break;
                                case TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x-22, obj.base_y-22)
                                    ctx.lineTo(obj.base_x+22, obj.base_y+22);
                                    ctx.stroke();
                                    break;
                                case TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x+22, obj.base_y-22)
                                    ctx.lineTo(obj.base_x-22, obj.base_y+22);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.strokeStyle = '#fff';
                        ctx.lineWidth=12;
                        ctx.setLineDash([6, 4]);
                        ctx.beginPath();
                        switch(obj.orientation){
                            case VERTICAL:
                                ctx.moveTo(obj.base_x, obj.base_y-20);
                                ctx.lineTo(obj.base_x, obj.base_y+28);
                                break;
                            case HORIZONTAL:
                                ctx.moveTo(obj.base_x-20, obj.base_y);
                                ctx.lineTo(obj.base_x+28, obj.base_y);
                                break;
                            case TOPLEFT_DOWNRIGHT:
                                ctx.moveTo(obj.base_x-16, obj.base_y-16)
                                ctx.lineTo(obj.base_x+16, obj.base_y+16);
                                break;
                            case TOPRIGHT_DOWNLEFT:
                                ctx.moveTo(obj.base_x+16, obj.base_y-16)
                                ctx.lineTo(obj.base_x-16, obj.base_y+16);
                                break;
                        }
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }break;
                    case DOOR_PORTAL:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case VERTICAL:
                                    ctx.strokeRect(obj.base_x-10, obj.base_y-16, 20, 32);
                                    break;
                                case HORIZONTAL:
                                    ctx.strokeRect(obj.base_x-16, obj.base_y-10, 32, 20);
                                    break;
                                case TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x-22, obj.base_y-22)
                                    ctx.lineTo(obj.base_x+22, obj.base_y+22);
                                    ctx.stroke();
                                    break;
                                case TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x+22, obj.base_y-22)
                                    ctx.lineTo(obj.base_x-22, obj.base_y+22);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.fillStyle = '#fff';
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case VERTICAL:
                                ctx.fillRect(obj.base_x-10, obj.base_y-16, 20, 32);
                                break;
                            case HORIZONTAL:
                                ctx.fillRect(obj.base_x-16, obj.base_y-10, 32, 20);
                                break;
                            case TOPLEFT_DOWNRIGHT:
                                ctx.strokeStyle = '#fff';
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-16, obj.base_y-16)
                                ctx.lineTo(obj.base_x+16, obj.base_y+16);
                                ctx.stroke();
                                break;
                            case TOPRIGHT_DOWNLEFT:
                                ctx.strokeStyle = '#fff';
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+16, obj.base_y-16)
                                ctx.lineTo(obj.base_x-16, obj.base_y+16);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DOOR_SECRET:{
                        ctx.save();
                        ctx.textBaseline = 'middle';
                        ctx.textAlign = 'center';
                        if(is_selected){
                            ctx.font = '44px sans-serif';
                            ctx.fillStyle = SELECTED_COLOR;
                            ctx.fillText('S', obj.base_x, obj.base_y);
                            }
                        ctx.font = '36px sans-serif';
                        ctx.fillStyle = '#000';
                        ctx.fillText('S', obj.base_x, obj.base_y);
                        ctx.restore();
                    }break;
                    case DOOR_BRICKED_WALL:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            ctx.beginPath();
                            switch(obj.orientation){
                                case VERTICAL:
                                    ctx.moveTo(obj.base_x, obj.base_y-22)
                                    ctx.lineTo(obj.base_x, obj.base_y+22);
                                    break;
                                case HORIZONTAL:
                                    ctx.moveTo(obj.base_x-22, obj.base_y)
                                    ctx.lineTo(obj.base_x+22, obj.base_y);
                                    break;
                                case TOPLEFT_DOWNRIGHT:
                                    ctx.moveTo(obj.base_x-22, obj.base_y-22)
                                    ctx.lineTo(obj.base_x+22, obj.base_y+22);
                                    break;
                                case TOPRIGHT_DOWNLEFT:
                                    ctx.moveTo(obj.base_x+22, obj.base_y-22)
                                    ctx.lineTo(obj.base_x-22, obj.base_y+22);
                                    break;
                            }
                            ctx.stroke();
                        }
                        ctx.strokeStyle = '#ff1111';
                        ctx.lineWidth=6;
                        ctx.beginPath();
                        switch(obj.orientation){
                            case VERTICAL:
                                ctx.moveTo(obj.base_x, obj.base_y-22)
                                ctx.lineTo(obj.base_x, obj.base_y+22);
                                break;
                            case HORIZONTAL:
                                ctx.moveTo(obj.base_x-22, obj.base_y)
                                ctx.lineTo(obj.base_x+22, obj.base_y);
                                break;
                            case TOPLEFT_DOWNRIGHT:
                                ctx.moveTo(obj.base_x-22, obj.base_y-22)
                                ctx.lineTo(obj.base_x+22, obj.base_y+22);
                                break;
                            case TOPRIGHT_DOWNLEFT:
                                ctx.moveTo(obj.base_x+22, obj.base_y-22)
                                ctx.lineTo(obj.base_x-22, obj.base_y+22);
                                break;
                        }
                        ctx.stroke();
                    }break;
                }
            }break;
        }
    }
    if(selection_area.is_selecting){
        ctx.fillStyle = '#55555555';
        ctx.fillRect(selection_area.x0, selection_area.y0, selection_area.x1-selection_area.x0, selection_area.y1-selection_area.y0);
    }
    // request_render();
    // timings.push(performance.now()-before);
    // console.log('rendering:', (performance.now()-before).toFixed(4)+'ms');
}
document.addEventListener('DOMContentLoaded', render);
const PAN_TOOL         = 'Pan';
const SELECT_TOOL      = 'Select';
const MOVE_TOOL        = 'Move';
const LINE_TOOL        = 'Line';
const WALL_TOOL        = 'Wall';
const DOOR_TOOL        = 'Door';
const RECT_TOOL        = 'Rect';
const FILLED_RECT_TOOL = 'Filled-Rect';
const FLOOR_TOOL       = 'Floor';
const TEXT_TOOL        = 'Text';
const EZ_TOKEN_TOOL    = 'Ez-Token';
const IMAGE_TOOL       = 'Image';
const IMG_TOKEN_TOOL   = 'Img-Token';
let current_tool = PAN_TOOL;
let color_picker = null;
let color_picker2 = null;
let tools = null;
function change_tool(toolname){
    if(!tools)
        return;
    current_tool = toolname;
    switch(toolname){
        case PAN_TOOL:
        case SELECT_TOOL:
        case MOVE_TOOL:
            break;
        default:
            end_selecting();
            break;
    }
    for(let j = 0; j < tools.length-1; ++j){
        const tool = tools[j];
        tool.classList.remove('selected');
        if(tool.firstChild.textContent.trim() == toolname){
            tool.classList.add('selected');
        }
    }
}
document.addEventListener('DOMContentLoaded', function(){
    const tools_div = document.getElementById('tools');
    tools = tools_div.children;
    color_picker = document.getElementById('color-picker');
    color_picker2 = document.getElementById('color-picker2');
    for(let i = 0; i < tools.length-1; ++i){
        const tool = tools[i];
        tool.addEventListener('click', function(e){
            e.stopPropagation();
            e.preventDefault();
            const toolname = tool.firstChild.textContent.trim();
            change_tool(toolname);
        });
        if(tool.firstChild.textContent.trim() == 'Select'){
            let has_menu = false;
            const name = tool.getElementsByTagName('span')[0];
            switch(selection_area.select_type){
                case SELECT_ANY:
                    name.innerText = 'Any';
                    break;
                case SELECT_MAP:
                    name.innerText = 'Map';
                    break;
                case SELECT_TOKEN:
                    name.innerText = 'Token';
                    break;
            }
            const triangle = tool.getElementsByTagName('span')[1];
            triangle.addEventListener('click', function(e){
                e.preventDefault();
                e.stopPropagation();
                if(has_menu)
                    return;
                has_menu = true;
                const trimenu = document.createElement('section');
                trimenu.classList.add('menu');
                trimenu.style.left = e.clientX + 'px';
                const window_height = window.innerHeight;
                trimenu.style.bottom = (window_height - e.clientY)+'px'
                function close_select_menu(e){
                    if(e){
                        e.stopPropagation();
                        e.preventDefault();
                    }
                    document.body.removeChild(trimenu);
                    canvas.removeEventListener('mousedown', close_select_menu);
                    has_menu = false;
                }
                const options = [
                    {
                        func: function(e){
                            e.stopPropagation();
                            e.preventDefault();
                            name.innerText = 'Any';
                            change_tool(SELECT_TOOL);
                            change_select_mode(SELECT_ANY);
                            close_select_menu();
                        },
                        text:'Any',
                    },
                    {
                        func: function(e){
                            e.stopPropagation();
                            e.preventDefault();
                            change_tool(SELECT_TOOL);
                            name.innerText = 'Map';
                            change_select_mode(SELECT_MAP);
                            close_select_menu();
                        },
                        text:'Map',
                    },
                    {
                        func: function(e){
                            e.stopPropagation();
                            e.preventDefault();
                            change_tool(SELECT_TOOL);
                            name.innerText = 'Token';
                            change_select_mode(SELECT_TOKEN);
                            close_select_menu();
                        },
                        text:'Token',
                    },
                ];
                for(let i = 0; i < options.length; ++i){
                    const option = options[i];
                    const s = document.createElement('section');
                    s.classList.add('menuitem')
                    const text = document.createTextNode(option.text);
                    s.appendChild(text);
                    s.addEventListener('mousedown', option.func);
                    trimenu.appendChild(s);
                }
                document.body.appendChild(trimenu);
                canvas.addEventListener('mousedown', close_select_menu);
            });
        }
        if(tool.firstChild.textContent.trim() == 'Door'){
            let has_menu = false;
            const name = tool.getElementsByTagName('span')[0];
            function change_door(doortype){
                current_door = doortype;
                switch(current_door){
                    case DOOR_DOOR:
                        name.innerText = '';
                        break;
                    case DOOR_DOUBLE:
                        name.innerText = '- Double';
                        break;
                    case DOOR_SECRET:
                        name.innerText = '- Secret';
                        break;
                    case DOOR_BRICKED_WALL:
                        name.innerText = '- Bricks';
                        break;
                    case DOOR_PORTAL:
                        name.innerText = '- Portal';
                        break;
                    case DOOR_PORTCULLIS:
                        name.innerText = '- Portcullis';
                        break;
                }
            }
            const triangle = tool.getElementsByTagName('span')[1];
            triangle.addEventListener('click', function(e){
                e.preventDefault();
                e.stopPropagation();
                if(has_menu)
                    return;
                has_menu = true;
                const trimenu = document.createElement('section');
                trimenu.classList.add('menu');
                trimenu.style.left = e.clientX + 'px';
                const window_height = window.innerHeight;
                trimenu.style.bottom = (window_height - e.clientY)+'px'
                function close_menu(e){
                    if(e){
                        e.stopPropagation();
                        e.preventDefault();
                    }
                    document.body.removeChild(trimenu);
                    canvas.removeEventListener('mousedown', close_menu);
                    has_menu = false;
                }
                function make_cb(dt){
                    function cb(e){
                        e.stopPropagation();
                        e.preventDefault();
                        change_tool(DOOR_TOOL);
                        change_door(dt);
                        close_menu();
                    }
                    return cb;
                }
                const options = [
                    {doortype:DOOR_DOOR,         text:'Door',         },
                    {doortype:DOOR_SECRET,       text:'Secret Door',  },
                    {doortype:DOOR_BRICKED_WALL, text:'Bricked Wall', },
                    {doortype:DOOR_PORTAL,       text:'Portal', },
                    {doortype:DOOR_DOUBLE,       text:'Double Door', },
                    {doortype:DOOR_PORTCULLIS,   text:'Portcullis', },
                ];
                for(let i = 0; i < options.length; ++i){
                    const option = options[i];
                    const s = document.createElement('section');
                    s.classList.add('menuitem')
                    const text = document.createTextNode(option.text);
                    s.appendChild(text);
                    s.addEventListener('mousedown', make_cb(option.doortype));
                    trimenu.appendChild(s);
                }
                document.body.appendChild(trimenu);
                canvas.addEventListener('mousedown', close_menu);
            });
        }
        // Lot of copy paste amongst these tools.
        // Can probably abstract over it maybe?
        // Meh. The 4th one is where I draw the line.
        if(tool.firstChild.textContent.trim() == 'Wall'){
            let has_menu = false;
            const name = tool.getElementsByTagName('span')[0];
            function change_wall(on_the_half){
                walls_snap_to_half_grid = on_the_half;
                if(on_the_half){
                    name.innerText = "- 5'";
                }
                else {
                    name.innerText = ''
                }
            }
            const triangle = tool.getElementsByTagName('span')[1];
            triangle.addEventListener('click', function(e){
                e.preventDefault();
                e.stopPropagation();
                if(has_menu)
                    return;
                has_menu = true;
                const trimenu = document.createElement('section');
                trimenu.classList.add('menu');
                trimenu.style.left = e.clientX + 'px';
                const window_height = window.innerHeight;
                trimenu.style.bottom = (window_height - e.clientY)+'px'
                function close_menu(e){
                    if(e){
                        e.stopPropagation();
                        e.preventDefault();
                    }
                    document.body.removeChild(trimenu);
                    canvas.removeEventListener('mousedown', close_menu);
                    has_menu = false;
                }
                function make_cb(on_the_half){
                    function cb(e){
                        e.stopPropagation();
                        e.preventDefault();
                        change_tool(WALL_TOOL);
                        change_wall(on_the_half);
                        close_menu();
                    }
                    return cb;
                }
                const options = [
                    {on_the_half:false, text: "10' Grid"},
                    {on_the_half:true,  text: "5' Grid" },
                ];
                for(let i = 0; i < options.length; ++i){
                    const option = options[i];
                    const s = document.createElement('section');
                    s.classList.add('menuitem')
                    const text = document.createTextNode(option.text);
                    s.appendChild(text);
                    s.addEventListener('mousedown', make_cb(option.on_the_half));
                    trimenu.appendChild(s);
                }
                document.body.appendChild(trimenu);
                canvas.addEventListener('mousedown', close_menu);
            });
        }
    }
    change_tool(PAN_TOOL);
});

// Extracts the session id from an object's id so that we can ignore objects we
// created.
function get_session_id_from_obj_id(objid){
    let id = objid >> 20;
    return id;
}
document.addEventListener('DOMContentLoaded', function(){
    canvas = document.getElementsByTagName('canvas')[0];
    canvas.addEventListener('wheel', function(e){
        e.stopPropagation();
        e.preventDefault();
        const oldscale = scale;
        let dy = e.deltaY;
        const dscale = 120;
        if(dy > dscale)
            dy = dscale;
        if(dy < -dscale)
            dy = -dscale;
        scale *= 1 + (-dy/dscale);
        scale = clamp_scale(scale);
        camera_x -= e.offsetX/oldscale;
        camera_x += e.offsetX/scale;
        camera_y -= e.offsetY/oldscale;
        camera_y += e.offsetY/scale;
        camera_x = Math.round(camera_x);
        camera_y = Math.round(camera_y);
        request_render();
    });
    window.addEventListener('keydown', function(e){
        if(document.activeElement !== document.body)
            return;
        const ctrl_or_cmd_is_pressed = e.ctrlKey || e.metaKey;
        const other_modifiers = e.altKey || e.shiftKey;
        const shift = e.shiftKey;
        const shortcut = ctrl_or_cmd_is_pressed && !other_modifiers;
        switch(e.key){
            case 'ArrowLeft':{
                camera_x += 256;
                request_render();
            }break;
            case 'ArrowRight':{
                camera_x -= 256;
                request_render();
            }break;
            case 'ArrowUp':{
                camera_y += 256;
                request_render();
            }break;
            case 'ArrowDown':{
                camera_y -= 256;
                request_render();
            }break;
            case 'Escape':{
                selected.clear();
                request_render();
            }
            case 'Backspace': // fall-through
            case 'Delete':{
                for(let item of selected){
                    canvas_objs.get(item).flags |= FLAG_DELETED;
                }
                publish_delete_by_ids(Array.from(selected));
                note_delete_by_ids_for_undo(Array.from(selected));
                end_selecting();
            }break;
            case 'q':
                change_tool(PAN_TOOL);
                break;
            case 'w':
                change_tool(SELECT_TOOL);
                break;
            case 'e':
                change_tool(MOVE_TOOL);
                break;
            case 'a':
                change_tool(WALL_TOOL);
                break;
            case 's':
                change_tool(DOOR_TOOL);
                break;
            case 'd':
                change_tool(LINE_TOOL);
                break;
            case 'f':
                change_tool(RECT_TOOL);
                break;
            case 'g':
                change_tool(FILLED_RECT_TOOL);
                break;
            case 'h':
                change_tool(FLOOR_TOOL);
                break;
            case 'y':
                if(shortcut){
                    do_one_redo();
                }
                else {
                    return; // avoid the stop prop stuff
                }
                break;
            case 'z':
                if(shortcut){
                    do_one_undo();
                }
                else {
                    change_tool(TEXT_TOOL);
                }
                break;
            case 'x':
                if(shortcut){
                    if(selected.size !== 0){
                        clear_copy_buffer();
                        cut_selected_objs_to_copy_buffer();
                    }
                }
                else {
                    change_tool(EZ_TOKEN_TOOL);
                }
                break;
            case 'c':
                if(shortcut){
                    if(selected.size !== 0){
                        clear_copy_buffer();
                        copy_selected_objs_to_copy_buffer();
                    }
                }
                else {
                    change_tool(IMAGE_TOOL);
                }
                break;
            case 'v':
                if(shortcut){
                    if(copied_objs.length){
                        const x = canvas.width/4/scale - camera_x;
                        const y = canvas.height/4/scale - camera_y;
                        paste_from_copy_buffer_at(x, y);
                    }
                    break;
                }
            default:
                return;
        }
        // unhandled keys should return to avoid this.
        e.stopPropagation();
        e.preventDefault();
    });
    let prev_tool = null;
    // this state variable is kind of janky.
    let ctxmenu_is_active = 0;
    let ez_token_color = '#ff3333';
    canvas.addEventListener('mousedown', function(e){
        if(e.button !== 0 && e.button !== 1){ //0 is the 'primary' button
            return;
        }
        if(ctxmenu_is_active !== 0)
            return;
        e.stopPropagation();
        e.preventDefault();
        if(e.button === 1){
            prev_tool = current_tool;
            current_tool = PAN_TOOL;
        }
        switch(current_tool){
            case SELECT_TOOL:{
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
            case MOVE_TOOL:{
                if(!selected.size)
                    return;
                let clicked_x = e.offsetX/scale - camera_x;
                let clicked_y = e.offsetY/scale - camera_y;
                let rawclick_x = e.offsetX;
                let rawclick_y = e.offsetY;
                let changed = false;
                const before_update = get_stripped_state_by_id(Array.from(selected));
                function move(e){
                    e.stopPropagation();
                    e.preventDefault();
                    const diff = Math.abs(e.offsetX - rawclick_x) + Math.abs(e.offsetY - rawclick_y);
                    if(diff < 2)
                        return;
                    let move_x = e.offsetX/scale - camera_x;
                    let move_y = e.offsetY/scale - camera_y;
                    changed = true;
                    let new_coords = move_selected_objects(clicked_x, clicked_y, move_x - clicked_x, move_y - clicked_y);
                    clicked_x = new_coords[0];
                    clicked_y = new_coords[1];;
                }
                canvas.addEventListener('mousemove', move);
                function finish_move(){
                    canvas.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', finish_move);
                    canvas.removeEventListener('mouseleave', finish_move);
                    if(!changed)
                        return;
                    const after_update = get_stripped_state_by_id(Array.from(selected));
                    publish_obj_updates(after_update);
                    note_updates_for_undo(before_update, after_update);
                }
                window.addEventListener('mouseup', finish_move);
                canvas.addEventListener('mouseleave', finish_move);
            }break;
            case PAN_TOOL:{
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
            case LINE_TOOL:{
                let id = get_new_id();
                add_freehand_line(id, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y, color_picker.value);
                function add_point(e){
                    e.stopPropagation();
                    e.preventDefault();
                    add_freehand_point_by_id(id, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y);
                    request_render();
                }
                canvas.addEventListener('mousemove', add_point);
                function finish_point(){
                    canvas.removeEventListener('mousemove', add_point);
                    window.removeEventListener('mouseup', finish_point);
                    canvas.removeEventListener('mouseleave', finish_point);
                    publish_obj_by_id(id);
                    note_create_by_id_for_undo(id);
                }
                window.addEventListener('mouseup', finish_point);
                canvas.addEventListener('mouseleave', finish_point);
            }break;
            case WALL_TOOL:{
                let id = get_new_id();
                add_gridline(id, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y, color_picker.value);
                function add_point(e){
                    e.stopPropagation();
                    e.preventDefault();
                    add_gridline_point_by_id(id, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y);
                    request_render();
                }
                canvas.addEventListener('mousemove', add_point);
                function finish_point(){
                    canvas.removeEventListener('mousemove', add_point);
                    window.removeEventListener('mouseup', finish_point);
                    canvas.removeEventListener('mouseleave', finish_point);
                    publish_obj_by_id(id);
                    note_create_by_id_for_undo(id);
                }
                window.addEventListener('mouseup', finish_point);
                canvas.addEventListener('mouseleave', finish_point);
            }break;
            case DOOR_TOOL:{
                let x0 = snap_to_grid(e.offsetX/scale-camera_x);
                let y0 = snap_to_grid(e.offsetY/scale-camera_y);
                let x1 = x0;
                let y1 = y0;
                function change_point(e){
                    e.stopPropagation();
                    e.preventDefault();
                    x1 = snap_to_grid(e.offsetX/scale-camera_x);
                    y1 = snap_to_grid(e.offsetY/scale-camera_y);
                    if(x1 > x0 + REFERENCE_WIDTH)
                        x1 = x0 + REFERENCE_WIDTH;
                    if(x1 < x0 - REFERENCE_WIDTH)
                        x1 = x0 - REFERENCE_WIDTH;
                    if(y1 > y0 + REFERENCE_WIDTH)
                        y1 = y0 + REFERENCE_WIDTH;
                    if(y1 < y0 - REFERENCE_WIDTH)
                        y1 = y0 - REFERENCE_WIDTH;
                }
                canvas.addEventListener('mousemove', change_point);
                function finish_door(){
                    canvas.removeEventListener('mousemove', change_point);
                    window.removeEventListener('mouseup', finish_door);
                    canvas.removeEventListener('mouseleave', finish_door);
                    if(x0 !== x1 || y0 !== y1){
                        let id = get_new_id();
                        let orientation;
                        if(y1 === y0){
                            orientation = HORIZONTAL;
                        }
                        else if(x1 == x0){
                            orientation = VERTICAL;
                        }
                        else if((x1 < x0 && y1 < y0) || (x1 > x0 && y1 > y0)){
                            orientation = TOPLEFT_DOWNRIGHT;
                        }
                        else {
                            orientation = TOPRIGHT_DOWNLEFT;
                        }
                        let x = ((x0 + x1)/2) | 0;
                        let y = ((y0 + y1)/2) | 0;
                        add_door(id, x, y, current_door, color_picker.value, orientation);
                        publish_obj_by_id(id);
                        note_create_by_id_for_undo(id);
                        request_render();
                    }
                }
                window.addEventListener('mouseup', finish_door);
                canvas.addEventListener('mouseleave', finish_door);
            }break;
            case FLOOR_TOOL:{
                let id = get_new_id();
                const x0 = e.offsetX/scale-camera_x;
                const y0 = e.offsetY/scale-camera_y;
                add_gridrect(id, x0, y0, color_picker.value);
                function add_point(e){
                    e.stopPropagation();
                    e.preventDefault();
                    change_gridrect_by_id(id, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y, x0, y0);
                    request_render();
                }
                canvas.addEventListener('mousemove', add_point);
                function finish_point(){
                    canvas.removeEventListener('mousemove', add_point);
                    window.removeEventListener('mouseup', finish_point);
                    canvas.removeEventListener('mouseleave', finish_point);
                    publish_obj_by_id(id);
                    note_create_by_id_for_undo(id);
                }
                window.addEventListener('mouseup', finish_point);
                canvas.addEventListener('mouseleave', finish_point);
            }break;
            case RECT_TOOL:{
                let id = get_new_id();
                const x0 = e.offsetX/scale-camera_x;
                const y0 = e.offsetY/scale-camera_y;
                add_rect(id, x0, y0, color_picker.value);
                function add_point(e){
                    e.stopPropagation();
                    e.preventDefault();
                    change_rect_by_id(id, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y, x0, y0);
                    request_render();
                }
                canvas.addEventListener('mousemove', add_point);
                function finish_point(){
                    canvas.removeEventListener('mousemove', add_point);
                    window.removeEventListener('mouseup', finish_point);
                    canvas.removeEventListener('mouseleave', finish_point);
                    publish_obj_by_id(id);
                    note_create_by_id_for_undo(id);
                }
                window.addEventListener('mouseup', finish_point);
                canvas.addEventListener('mouseleave', finish_point);
            }break;
            case FILLED_RECT_TOOL:{
                let id = get_new_id();
                const x0 = e.offsetX/scale-camera_x;
                const y0 = e.offsetY/scale-camera_y;
                add_filled_rect(id, x0, y0, color_picker.value, color_picker2.value);
                function add_point(e){
                    e.stopPropagation();
                    e.preventDefault();
                    change_filled_rect_by_id(id, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y, x0, y0);
                    request_render();
                }
                canvas.addEventListener('mousemove', add_point);
                function finish_point(){
                    canvas.removeEventListener('mousemove', add_point);
                    window.removeEventListener('mouseup', finish_point);
                    canvas.removeEventListener('mouseleave', finish_point);
                    publish_obj_by_id(id);
                    note_create_by_id_for_undo(id);
                }
                window.addEventListener('mouseup', finish_point);
                canvas.addEventListener('mouseleave', finish_point);
            }break;
            case TEXT_TOOL:{
                const x0 = e.offsetX/scale-camera_x;
                const y0 = e.offsetY/scale-camera_y;
                /*
                    <tr>
                        <td>Alignment:</td>
                        <td>
                        <input type="radio" name="alignment" id="align-left" value="Left">
                        <label for="align-left">Left</label>
                        <input type="radio" name="alignment" id="align-middle" value="Middle" checked>
                        <label for="align-middle">Middle</label>
                        <input type="radio" name="alignment" id="align-right" value="Right">
                        <label for="align-right">Right</label>
                        </td>
                    </tr>
                */
                const html = `
                <h2>Enter Text</h2>
                <table class="input-container">
                    <tr>
                        <td><label for="text-size">Size:</label>
                        <td><input type="number" id="text-size" name="text-size" min="8" max="72" value="18" class="numeric-input">
                    </tr>
                    <tr>
                        <td><label for="text">Text:</label>
                        <td><input type="text" name="text" id="hover-text" value="">
                    </tr>
                </table>
                `;
                make_ok_dialog(html, function(hoverpop){
                    const text_input = document.getElementById('hover-text');
                    const text = text_input.value;
                    if(!text || !text.trim())
                        return;
                    const size_el = document.getElementById('text-size')
                    const size = (+size_el.value) | 0;
                    if(size < 8)
                        return;
                    if(size > 72)
                        return;
                    let id = get_new_id();
                    add_text(id, x0, y0, text, size);
                    publish_obj_by_id(id);
                    note_create_by_id_for_undo(id);
                    request_render();
                });
            }break;
            case IMAGE_TOOL:{
                const x0 = e.offsetX/scale-camera_x;
                const y0 = e.offsetY/scale-camera_y;
                const html = `
                    <h2>Enter Image</h2>
                    <table class="input-container">
                        <tr>
                            <td><label for="width">Width:</label>
                            <input type="number" name="width" id="hover-width" min="0" class="numeric-input">
                            <td><label for="height">Height:</label>
                            <input type="number" name="height" id="hover-height" min="0" class="numeric-input">
                            <td><label for="hover-checkbox">Round to Grid</label>
                            <input name="round" type="checkbox" id="hover-checkbox" checked>
                        </tr>
                        <tr>
                            <td colspan="3"><label for="url">URL:</label>
                            <input type="url" name="url" id="hover-url" value="">
                        </tr>
                    </table>
                `;
                make_ok_dialog(html, function(hoverpop){
                    const text = document.getElementById('hover-url').value;
                    if(!text || !text.trim()){
                        return;
                    }
                    let width = +document.getElementById('hover-width').value;
                    let height = +document.getElementById('hover-height').value;
                    if(!width)
                        width = 0;
                    if(!height)
                        height = 0;
                    const round = document.getElementById('hover-checkbox').checked;
                    if(round){
                        width = snap_to_grid(width);
                        height = snap_to_grid(height);
                    }
                    let id = get_new_id();
                    add_image(id, x0, y0, width, height, text);
                    publish_obj_by_id(id);
                    note_create_by_id_for_undo(id);
                    request_render();
                });
            }break;
            case EZ_TOKEN_TOOL:{
                const x0 = e.offsetX/scale-camera_x;
                const y0 = e.offsetY/scale-camera_y;
                const html = `
                    <h2>Enter Token</h2>
                    <table class="input-container">
                        <tr>
                            <td><label for="color">Color:</label>
                            <td><input type="color" id="hover-color" value="`+ez_token_color+`">
                        </tr>
                        <tr>
                            <td><label for="width">Width (sq):</label>
                            <td><input type="number" name="width" id="hover-width" min="1" max="5" value="1" class="numeric-input">
                            <td><label for="height">Height (sq):</label>
                            <td><input type="number" name="height" id="hover-height" min="1" max="5" value="1" class="numeric-input">
                        </tr>
                        <tr>
                            <td><label for="text">Text:</label>
                            <td colspan="3"><input type="text" name="text" id="hover-text" value="">
                        </tr>
                    </table>
                `;
                make_ok_dialog(html, function(hoverpop){
                    const text_input = document.getElementById('hover-text');
                    const text = text_input.value;
                    if(!text || !text.trim())
                        return;
                    const width = +document.getElementById('hover-width').value;
                    const height = +document.getElementById('hover-height').value;
                    if(!width)
                        width = 1;
                    if(!height)
                        height = 1;
                    let id = get_new_id();
                    ez_token_color = document.getElementById('hover-color').value;
                    add_ez_token(id, x0, y0, text, ez_token_color, width, height);
                    publish_obj_by_id(id);
                    note_create_by_id_for_undo(id);
                    request_render();
                });
            }break;
            case IMG_TOKEN_TOOL:{
                const x0 = e.offsetX/scale-camera_x;
                const y0 = e.offsetY/scale-camera_y;
                const html = `
                    <h2>Enter Image</h2>
                    <table class="input-container">
                        <tr>
                            <td><label for="url">Token Image URL:</label>
                            <td><input type="url" name="url" id="hover-url" value="">
                        </tr>
                    </table>
                `;
                make_ok_dialog(html, function(hoverpop){
                    const text = document.getElementById('hover-url').value;
                    if(!text || !text.trim()){
                        return;
                    }
                    let id = get_new_id();
                    add_img_token(id, x0, y0, text);
                    publish_obj_by_id(id);
                    note_create_by_id_for_undo(id);
                    request_render();
                });
            }break;
            default:{
                console.log('unknown tool:', current_tool);
            }break;
        }
    });
    canvas.addEventListener('contextmenu', function(e){
        e.preventDefault();
        e.stopPropagation();
        ctxmenu_is_active++;
        const ctxmenu = document.createElement('section');
        ctxmenu.classList.add('menu');
        ctxmenu.style.left = e.clientX + 'px';
        ctxmenu.style.top = e.clientY + 'px';
        const x = e.offsetX/scale - camera_x - canvas.width/2/scale;
        const y = e.offsetY/scale - camera_y - canvas.height/2/scale;
        const click_x = e.offsetX/scale - camera_x;
        const click_y = e.offsetY/scale - camera_y;
        function remove_menu(e){
            canvas.removeEventListener('mousedown', remove_menu);
            document.body.removeChild(ctxmenu);
            ctxmenu_is_active--;
            if(e){
                e.stopPropagation();
                e.preventDefault();
            }
        }
        canvas.addEventListener('mousedown', remove_menu);
        const items = [
            {
                label: 'Zoom In',
                func: function(){zoom_in();remove_menu();},
                disabled: false,
            },
            {
                label: 'Zoom Out',
                func: function(){zoom_out();remove_menu();},
                disabled: false,
            },
            {
                label: 'Reset Zoom',
                func: function(){reset_zoom();remove_menu();},
                disabled: false,
            },
            {
                label: 'Gather Party',
                func: function(){socket.emit('canvas-gather', {x:-x, y:-y}); remove_menu();},
                disabled: false,
            },
            {
                label: 'Edit',
                func: function(){
                    launch_edit_dialog();
                    remove_menu();
                },
                disabled: edit_is_impossible(),
            },
            {
                label: 'Undo',
                func: function(){
                    do_one_undo();
                    remove_menu();
                },
                disabled: undo_is_impossible(),
            },
            {
                label: 'Redo',
                func: function(){
                    do_one_redo();
                    remove_menu();
                },
                disabled: redo_is_impossible(),
            },
            {
                label: 'Cut',
                func: function(){
                    clear_copy_buffer();
                    cut_selected_objs_to_copy_buffer();
                    remove_menu();
                },
                disabled: selected.size === 0,
            },
            {
                label: 'Copy',
                func: function(){
                    clear_copy_buffer();
                    copy_selected_objs_to_copy_buffer();
                    remove_menu();
                },
                disabled: selected.size === 0,
            },
            {
                label: 'Paste',
                func: function(){
                    paste_from_copy_buffer_at(click_x, click_y);
                    remove_menu();
                },
                disabled: copied_objs.length === 0,
            },
            {
                label: 'Cancel',
                func: function(){remove_menu();},
                disabled: false,
            },
        ];
        for(let i = 0; i < items.length; i++){
            const item = items[i];
            const menuitem = document.createElement('section');
            menuitem.classList.add('menuitem');
            if(item.disabled){
                menuitem.classList.add('disabled');
            }
            menuitem.addEventListener('click', item.func);
            menuitem.appendChild(document.createTextNode(item.label));
            ctxmenu.appendChild(menuitem);
        }
        document.body.appendChild(ctxmenu);
    });
});

let hover_is_open = false;
function make_ok_dialog(html, on_ok){
    if(hover_is_open)
        return;
    hover_is_open = true;
    const hoverpop = document.createElement('section');
    hoverpop.classList.add('hover');
    html += `
        <div class="hover-button-container">
            <button type="button" id="hoverpop-ok">Ok</button>
            <button type="button" id="hoverpop-cancel">Cancel</button>
        </div>
        `;
    hoverpop.innerHTML = html;
    document.body.appendChild(hoverpop);
    function remove_hoverpop(){
        document.body.removeChild(hoverpop);
        hover_is_open = false;
    }
    const ok = document.getElementById('hoverpop-ok');
    function submit(){
        on_ok(hoverpop);
        remove_hoverpop();
    }
    ok.addEventListener('click', function(){
        submit();
    });
    const cancel = document.getElementById('hoverpop-cancel');
    cancel.addEventListener('click', function(){
        remove_hoverpop();
    });
    const text_inputs = hoverpop.getElementsByTagName('input');
    let did_focus = false;;
    for(let i = 0; i < text_inputs.length; i++){
        const text_input = text_inputs[i];
        if(text_input.type == 'text' || text_input.type == 'url'){
            if(!did_focus){
                text_input.focus();
                did_focus = true;
            }
            text_input.addEventListener('keydown', function(e){
                let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
                if(!modified && e.key == "Enter"){
                    e.preventDefault();
                    e.stopPropagation();
                    ok.click();
                }
            });
        }
    }
}

/*
document.addEventListener('DOMContentLoaded', function(){
    const html = `
        <h2>Enter Image</h2>
        <table class="input-container">
            <tr>
                <td><label for="url">URL:</label>
                <td><input type="url" name="url" id="hover-url" value="">
            </tr>
            <tr>
                <td><label for="width">Width:</label>
                <td><input type="number" name="width" id="hover-width" value="1" class="numeric-input" min="1" max="5">
            </tr>
            <tr>
                <td><label for="height">Height:</label>
                <td><input type="number" name="height" id="hover-width" value="1" class="numeric-input" min="1" max="5">
            </tr>
        </table>
    `;
    make_ok_dialog(html, function(hoverpop){});
});
*/


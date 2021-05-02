"use strict";
function bbox_overlaps(bbox1, bbox2) {
    const x0 = Math.max(bbox1.x0, bbox2.x0);
    const y0 = Math.max(bbox1.y0, bbox2.y0);
    const x1 = Math.min(bbox1.x1, bbox2.x1);
    const y1 = Math.min(bbox1.y1, bbox2.y1);
    return x0 <= x1 && y0 <= y1;
}
var CANVASTYPE;
(function (CANVASTYPE) {
    CANVASTYPE[CANVASTYPE["FREEHAND_LINE"] = 1] = "FREEHAND_LINE";
    CANVASTYPE[CANVASTYPE["GRID_LINE"] = 2] = "GRID_LINE";
    CANVASTYPE[CANVASTYPE["RECT"] = 3] = "RECT";
    CANVASTYPE[CANVASTYPE["GRID_RECT"] = 4] = "GRID_RECT";
    CANVASTYPE[CANVASTYPE["FILLED_RECT"] = 5] = "FILLED_RECT";
    CANVASTYPE[CANVASTYPE["IMAGE"] = 7] = "IMAGE";
    CANVASTYPE[CANVASTYPE["TEXT"] = 8] = "TEXT";
    CANVASTYPE[CANVASTYPE["EZ_TOKEN"] = 9] = "EZ_TOKEN";
    CANVASTYPE[CANVASTYPE["IMG_TOKEN"] = 10] = "IMG_TOKEN";
    CANVASTYPE[CANVASTYPE["DOOR"] = 11] = "DOOR";
})(CANVASTYPE || (CANVASTYPE = {}));
var CANVASFLAG;
(function (CANVASFLAG) {
    CANVASFLAG[CANVASFLAG["NONE"] = 0] = "NONE";
    CANVASFLAG[CANVASFLAG["DELETED"] = 1] = "DELETED";
    CANVASFLAG[CANVASFLAG["ALL"] = 1] = "ALL";
})(CANVASFLAG || (CANVASFLAG = {}));
var DOORTYPE;
(function (DOORTYPE) {
    DOORTYPE[DOORTYPE["DOOR"] = 0] = "DOOR";
    DOORTYPE[DOORTYPE["DOUBLE"] = 1] = "DOUBLE";
    DOORTYPE[DOORTYPE["PORTCULLIS"] = 2] = "PORTCULLIS";
    DOORTYPE[DOORTYPE["SECRET"] = 3] = "SECRET";
    DOORTYPE[DOORTYPE["BRICKED_WALL"] = 4] = "BRICKED_WALL";
    DOORTYPE[DOORTYPE["PORTAL"] = 5] = "PORTAL";
})(DOORTYPE || (DOORTYPE = {}));
let current_door = DOORTYPE.DOOR;
let walls_snap_to_half_grid = false;
var ORIENTATION;
(function (ORIENTATION) {
    ORIENTATION[ORIENTATION["VERTICAL"] = 0] = "VERTICAL";
    ORIENTATION[ORIENTATION["HORIZONTAL"] = 1] = "HORIZONTAL";
    ORIENTATION[ORIENTATION["TOPLEFT_DOWNRIGHT"] = 2] = "TOPLEFT_DOWNRIGHT";
    ORIENTATION[ORIENTATION["TOPRIGHT_DOWNLEFT"] = 3] = "TOPRIGHT_DOWNLEFT";
})(ORIENTATION || (ORIENTATION = {}));
;
let current_map_id = 0;
const MAPS = new Map();
function get_map(map_id) {
    if (MAPS.has(map_id))
        return MAPS.get(map_id);
    const new_map = {
        map_id: map_id,
        camera_x: 0,
        camera_y: 0,
        scale: 1,
        canvas_obj_array: [],
        canvas_objs: new Map(),
        undo_stack: [],
        undo_position: 0,
        selected: new Set(),
        selection_area: {
            select_type: SELECTTYPE.ANY,
            is_selecting: false,
            x0: 0, y0: 0,
            x1: 0, y1: 0,
        },
    };
    socket.emit('canvas-create-map', map_id);
    add_map_tab(map_id);
    MAPS.set(map_id, new_map);
    return new_map;
}
function change_map(map_id) {
    current_map_id = map_id;
    const top = document.getElementById('top');
    if (!top)
        return;
    for (let tab of top.children) {
        tab.classList.remove('active-map');
        if (tab.firstChild.textContent.trim() == "" + map_id) {
            tab.classList.add('active-map');
        }
    }
    request_render();
}
socket.on('canvas-create-map', function (map_id) {
    get_map(map_id);
});
const REFERENCE_WIDTH = 64;
let canvas;
let ctx;
socket.on('canvas-gather', function (where) {
    const map = get_map(where.map_id);
    map.camera_x = where.x;
    map.camera_y = where.y;
    change_map(where.map_id);
    request_render();
});
const MIN_SCALE = 0.125;
const MAX_SCALE = 5;
function clamp_scale(scale) {
    if (scale < MIN_SCALE)
        scale = MIN_SCALE;
    if (scale > MAX_SCALE)
        scale = MAX_SCALE;
    return scale;
}
function reset_zoom(map) {
    const center_x = canvas.width / 2 / map.scale - map.camera_x;
    const center_y = canvas.height / 2 / map.scale - map.camera_y;
    map.scale = 1;
    map.camera_x = canvas.width / 2 / map.scale - center_x;
    map.camera_y = canvas.height / 2 / map.scale - center_y;
    request_render();
}
function zoom_in(map) {
    const center_x = canvas.width / 2 / map.scale - map.camera_x;
    const center_y = canvas.height / 2 / map.scale - map.camera_y;
    map.scale *= 1.50;
    map.scale = clamp_scale(map.scale);
    map.camera_x = canvas.width / 2 / map.scale - center_x;
    map.camera_y = canvas.height / 2 / map.scale - center_y;
    request_render();
}
function zoom_out(map) {
    const center_x = canvas.width / 2 / map.scale - map.camera_x;
    const center_y = canvas.height / 2 / map.scale - map.camera_y;
    map.scale /= 1.50;
    map.scale = clamp_scale(map.scale);
    map.camera_x = canvas.width / 2 / map.scale - center_x;
    map.camera_y = canvas.height / 2 / map.scale - center_y;
    request_render();
}
function resize_canvas() {
    canvas = document.getElementsByTagName('canvas')[0];
    ctx = canvas.getContext('2d');
    const chat_rect = document.getElementById('chat').getBoundingClientRect();
    canvas.width = window.innerWidth - chat_rect.width;
    canvas.height = window.innerHeight - 6;
    request_render();
}
function make_freehand_line(id, base_x, base_y, color) {
    base_x = Math.round(base_x);
    base_y = Math.round(base_y);
    const obj = {
        type: CANVASTYPE.FREEHAND_LINE,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CANVASFLAG.NONE,
        points: [],
        color: color,
        path: undefined,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
    };
    return obj;
}
function add_freehand_line(map, id, base_x, base_y, color) {
    const obj = make_freehand_line(id, base_x, base_y, color);
    add_canv_obj(map, obj);
}
function add_freehand_point(obj, x, y) {
    x -= obj.base_x;
    y -= obj.base_y;
    x = Math.round(x);
    y = Math.round(y);
    const points = obj.points;
    if (points.length > 1) {
        let diff = Math.abs(points[points.length - 2] - x);
        diff += Math.abs(points[points.length - 1] - y);
        if (diff < 2)
            return;
    }
    points.push(x);
    points.push(y);
    if (x < obj.bbox.x0) {
        obj.bbox.x0 = x;
    }
    if (x > obj.bbox.x1) {
        obj.bbox.x1 = x;
    }
    if (y < obj.bbox.y0) {
        obj.bbox.y0 = y;
    }
    if (y > obj.bbox.y1) {
        obj.bbox.y1 = y;
    }
    freehand_recalculate_path(obj);
}
function freehand_recalculate_bbox(obj) {
    const points = obj.points;
    const length = points.length;
    if (length > 1) {
        obj.bbox.x0 = points[0];
        obj.bbox.y0 = points[1];
        obj.bbox.x1 = points[0];
        obj.bbox.y1 = points[1];
    }
    for (let i = 0; i < length; i += 2) {
        let x = points[i];
        let y = points[i + 1];
        if (x < obj.bbox.x0) {
            obj.bbox.x0 = x;
        }
        if (x > obj.bbox.x1) {
            obj.bbox.x1 = x;
        }
        if (y < obj.bbox.y0) {
            obj.bbox.y0 = y;
        }
        if (y > obj.bbox.y1) {
            obj.bbox.y1 = y;
        }
    }
}
function freehand_recalculate_path(obj) {
    const points = obj.points;
    const base_x = obj.base_x;
    const base_y = obj.base_y;
    let x0 = base_x;
    let y0 = base_y;
    const length = points.length;
    const path = new Path2D();
    path.moveTo(x0, y0);
    for (let i = 0; i < length; i += 2) {
        const x1 = points[i] + base_x;
        const y1 = points[i + 1] + base_y;
        const xc = (x0 + x1) / 2;
        const yc = (y0 + y1) / 2;
        path.quadraticCurveTo(x0, y0, xc, yc);
        x0 = x1;
        y0 = y1;
    }
    if (length > 2) {
        path.quadraticCurveTo(points[length - 4] + base_x, points[length - 3] + base_y, x0, y0);
    }
    obj.path = path;
}
function add_freehand_point_by_id(map, id, x, y) {
    let obj = map.canvas_objs.get(id);
    add_freehand_point(obj, x, y);
}
function snap_to_grid(x) {
    x = Math.round(x);
    const remainder = x & (REFERENCE_WIDTH - 1);
    if (remainder < (REFERENCE_WIDTH >> 1)) {
        x -= remainder;
    }
    else {
        x += REFERENCE_WIDTH - remainder;
    }
    return x;
}
function snap_to_half_grid(x) {
    const SNAP = REFERENCE_WIDTH / 2;
    x = Math.round(x);
    const remainder = x & (SNAP - 1);
    if (remainder < (SNAP >> 1)) {
        x -= remainder;
    }
    else {
        x += SNAP - remainder;
    }
    return x;
}
function make_gridline(id, base_x, base_y, color) {
    if (walls_snap_to_half_grid) {
        base_x = snap_to_half_grid(base_x);
        base_y = snap_to_half_grid(base_y);
    }
    else {
        base_x = snap_to_grid(base_x);
        base_y = snap_to_grid(base_y);
    }
    const obj = {
        type: CANVASTYPE.GRID_LINE,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CANVASFLAG.NONE,
        points: [],
        color: color,
        path: undefined,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
    };
    return obj;
}
function add_gridline(map, id, base_x, base_y, color) {
    const obj = make_gridline(id, base_x, base_y, color);
    add_canv_obj(map, obj);
}
function add_gridline_point(obj, x, y) {
    const points = obj.points;
    const last_x = points.length ? points[points.length - 2] + obj.base_x : obj.base_x;
    const last_y = points.length ? points[points.length - 1] + obj.base_y : obj.base_x;
    const dist = Math.abs(last_x - x) + Math.abs(last_y - y);
    if (walls_snap_to_half_grid) {
        if (dist < 30)
            return;
        if (dist < 64) {
            let xrem = Math.round(x) & ((REFERENCE_WIDTH >> 1) - 1);
            let yrem = Math.round(y) & ((REFERENCE_WIDTH >> 1) - 1);
            if ((xrem > 8 && xrem < 24) || (yrem > 8 && yrem < 24)) {
                return;
            }
        }
        x = snap_to_half_grid(x);
        y = snap_to_half_grid(y);
    }
    else {
        if (dist < 60)
            return;
        if (dist < 128) {
            let xrem = Math.round(x) & (REFERENCE_WIDTH - 1);
            let yrem = Math.round(y) & (REFERENCE_WIDTH - 1);
            if ((xrem > 16 && xrem < 48) || (yrem > 16 && yrem < 48)) {
                return;
            }
        }
        x = snap_to_grid(x);
        y = snap_to_grid(y);
    }
    x -= obj.base_x;
    y -= obj.base_y;
    if (points.length > 1) {
        const diff = Math.abs(points[points.length - 2] - x) + Math.abs(points[points.length - 1] - y);
        if (diff < 2)
            return;
    }
    points.push(x);
    points.push(y);
    if (x < obj.bbox.x0) {
        obj.bbox.x0 = x;
    }
    if (x > obj.bbox.x1) {
        obj.bbox.x1 = x;
    }
    if (y < obj.bbox.y0) {
        obj.bbox.y0 = y;
    }
    if (y > obj.bbox.y1) {
        obj.bbox.y1 = y;
    }
    gridline_recalculate_path(obj);
}
function gridline_recalculate_bbox(obj) {
    const points = obj.points;
    const length = points.length;
    if (length > 1) {
        obj.bbox.x0 = points[0];
        obj.bbox.y0 = points[1];
        obj.bbox.x1 = points[0];
        obj.bbox.y1 = points[1];
    }
    for (let i = 0; i < length; i += 2) {
        let x = points[i];
        let y = points[i + 1];
        if (x < obj.bbox.x0) {
            obj.bbox.x0 = x;
        }
        if (x > obj.bbox.x1) {
            obj.bbox.x1 = x;
        }
        if (y < obj.bbox.y0) {
            obj.bbox.y0 = y;
        }
        if (y > obj.bbox.y1) {
            obj.bbox.y1 = y;
        }
    }
}
function gridline_recalculate_path(obj) {
    const points = obj.points;
    const base_x = obj.base_x;
    const base_y = obj.base_y;
    const length = points.length;
    const path = new Path2D();
    path.moveTo(base_x, base_y);
    for (let i = 0; i < length; i += 2) {
        const x1 = points[i] + base_x;
        const y1 = points[i + 1] + base_y;
        path.lineTo(x1, y1);
    }
    obj.path = path;
}
function add_gridline_point_by_id(map, id, x, y) {
    let obj = map.canvas_objs.get(id);
    add_gridline_point(obj, x, y);
}
function make_gridrect(id, base_x, base_y, color) {
    base_x = snap_to_grid(base_x);
    base_y = snap_to_grid(base_y);
    const obj = {
        type: CANVASTYPE.GRID_RECT,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CANVASFLAG.NONE,
        color: color,
        width: 0,
        height: 0,
    };
    return obj;
}
function add_gridrect(map, id, base_x, base_y, color) {
    const obj = make_gridrect(id, base_x, base_y, color);
    add_canv_obj(map, obj);
}
function change_gridrect(obj, x0, y0, x1, y1) {
    x0 = snap_to_grid(x0);
    y0 = snap_to_grid(y0);
    x1 = snap_to_grid(x1);
    y1 = snap_to_grid(y1);
    if (x1 < x0) {
        let temp = x1;
        x1 = x0;
        x0 = temp;
    }
    if (y1 < y0) {
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
function change_gridrect_by_id(map, id, x0, y0, x1, y1) {
    let obj = map.canvas_objs.get(id);
    change_gridrect(obj, x0, y0, x1, y1);
}
function make_door(id, x, y, doortype, color, orientation) {
    const obj = {
        type: CANVASTYPE.DOOR,
        id: id,
        base_x: x,
        base_y: y,
        flags: CANVASFLAG.NONE,
        doortype: doortype,
        color: color,
        width: 1,
        orientation: orientation,
    };
    return obj;
}
function add_door(map, id, base_x, base_y, doortype, color, orientation) {
    const obj = make_door(id, base_x, base_y, doortype, color, orientation);
    add_canv_obj(map, obj);
}
function make_rect(id, base_x, base_y, color) {
    const obj = {
        type: CANVASTYPE.RECT,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CANVASFLAG.NONE,
        color: color,
        width: 0,
        height: 0,
    };
    return obj;
}
function add_rect(map, id, base_x, base_y, color) {
    const obj = make_rect(id, base_x, base_y, color);
    add_canv_obj(map, obj);
}
function change_rect(obj, x0, y0, x1, y1) {
    if (x1 < x0) {
        let temp = x1;
        x1 = x0;
        x0 = temp;
    }
    if (y1 < y0) {
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
function change_rect_by_id(map, id, x0, y0, x1, y1) {
    let obj = map.canvas_objs.get(id);
    change_rect(obj, x0, y0, x1, y1);
}
function make_filled_rect(id, base_x, base_y, color, color2) {
    const obj = {
        type: CANVASTYPE.FILLED_RECT,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CANVASFLAG.NONE,
        color: color,
        color2: color2,
        width: 0,
        height: 0,
    };
    return obj;
}
function add_filled_rect(map, id, base_x, base_y, color, color2) {
    const obj = make_filled_rect(id, base_x, base_y, color, color2);
    add_canv_obj(map, obj);
}
function change_filled_rect(obj, x0, y0, x1, y1) {
    if (x1 < x0) {
        let temp = x1;
        x1 = x0;
        x0 = temp;
    }
    if (y1 < y0) {
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
function change_filled_rect_by_id(map, id, x0, y0, x1, y1) {
    let obj = map.canvas_objs.get(id);
    change_rect(obj, x0, y0, x1, y1);
}
function make_text(id, base_x, base_y, text, size) {
    base_x = base_x - (base_x & (REFERENCE_WIDTH - 1)) + REFERENCE_WIDTH / 2;
    base_y = base_y - (base_y & (REFERENCE_WIDTH - 1)) + REFERENCE_WIDTH / 2;
    const obj = {
        type: CANVASTYPE.TEXT,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CANVASFLAG.NONE,
        text: text,
        size: size,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
    };
    return obj;
}
function add_text(map, id, base_x, base_y, text, size) {
    const obj = make_text(id, base_x, base_y, text, size);
    add_canv_obj(map, obj);
}
function make_ez_token(id, base_x, base_y, text, color, width, height) {
    base_x = base_x - (base_x & (REFERENCE_WIDTH - 1));
    base_y = base_y - (base_y & (REFERENCE_WIDTH - 1));
    const obj = {
        type: CANVASTYPE.EZ_TOKEN,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CANVASFLAG.NONE,
        text: text,
        color: color,
        width: width,
        height: height,
    };
    return obj;
}
function add_ez_token(map, id, base_x, base_y, text, color, width, height) {
    const obj = make_ez_token(id, base_x, base_y, text, color, width, height);
    add_canv_obj(map, obj);
}
function make_img_token(id, base_x, base_y, url) {
    base_x = base_x - (base_x & (REFERENCE_WIDTH - 1));
    base_y = base_y - (base_y & (REFERENCE_WIDTH - 1));
    const obj = {
        type: CANVASTYPE.IMG_TOKEN,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CANVASFLAG.NONE,
        url: url,
        img: undefined,
        width: 1,
        height: 1,
    };
    const img = new Image(REFERENCE_WIDTH, REFERENCE_WIDTH);
    img.addEventListener('load', function () {
        obj.img = img;
        request_render();
    }, { once: true });
    img.src = url;
    return obj;
}
function add_img_token(map, id, base_x, base_y, url) {
    const obj = make_img_token(id, base_x, base_y, url);
    add_canv_obj(map, obj);
}
function make_image(id, base_x, base_y, width, height, url) {
    base_x = Math.round(base_x);
    base_y = Math.round(base_y);
    base_x = base_x - (base_x & (REFERENCE_WIDTH - 1)) + 1;
    base_y = base_y - (base_y & (REFERENCE_WIDTH - 1)) + 1;
    const obj = {
        type: CANVASTYPE.IMAGE,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CANVASFLAG.NONE,
        width: width,
        height: height,
        url: url,
        img: undefined,
    };
    const img = width && height ? new Image(width, height) : new Image();
    img.addEventListener('load', function () {
        obj.img = img;
        if (!width || !height) {
            obj.width = img.width;
            obj.height = img.height;
        }
        request_render();
    }, { once: true });
    img.src = url;
    return obj;
}
function add_image(map, id, base_x, base_y, width, height, url) {
    const obj = make_image(id, base_x, base_y, width, height, url);
    add_canv_obj(map, obj);
}
document.addEventListener('DOMContentLoaded', resize_canvas);
window.addEventListener('resize', resize_canvas);
function clear_canvas(map) {
    map.canvas_obj_array.length = 0;
    map.canvas_objs.clear();
    map.undo_stack.length = 0;
    map.undo_position = 0;
    clear_copy_buffer();
    map.selected.clear();
    request_render();
}
socket.on('canvas-clear', function () {
    for (let m of MAPS.values())
        clear_canvas(m);
    MAPS.clear();
    const top = document.getElementById('top');
    for (let tab of Array.from(top.children)) {
        if (tab.id == "new-map")
            continue;
        top.removeChild(tab);
    }
});
var UNDO_EVENT_TYPE;
(function (UNDO_EVENT_TYPE) {
    UNDO_EVENT_TYPE[UNDO_EVENT_TYPE["CREATE"] = 0] = "CREATE";
    UNDO_EVENT_TYPE[UNDO_EVENT_TYPE["DELETE"] = 1] = "DELETE";
    UNDO_EVENT_TYPE[UNDO_EVENT_TYPE["UPDATE"] = 2] = "UPDATE";
    UNDO_EVENT_TYPE[UNDO_EVENT_TYPE["MASS_CREATE"] = 3] = "MASS_CREATE";
})(UNDO_EVENT_TYPE || (UNDO_EVENT_TYPE = {}));
function push_undo_event(map, undo_event) {
    map.undo_stack.length = map.undo_position;
    map.undo_stack.push(undo_event);
    const MAX_UNDO_STACK = 100;
    if (map.undo_stack.length > MAX_UNDO_STACK) {
        const new_stack = [];
        for (let i = map.undo_stack.length - Math.floor(MAX_UNDO_STACK / 2); i < map.undo_stack.length; i++) {
            new_stack.push(map.undo_stack[i]);
        }
        map.undo_stack = new_stack;
    }
    map.undo_position = map.undo_stack.length;
}
function note_delete_by_ids_for_undo(map, deleted) {
    const undo_event = {
        type: UNDO_EVENT_TYPE.DELETE,
        ids: deleted,
    };
    push_undo_event(map, undo_event);
}
function note_create_by_id_for_undo(map, created_id) {
    const undo_event = {
        type: UNDO_EVENT_TYPE.CREATE,
        id: created_id,
    };
    push_undo_event(map, undo_event);
}
function note_updates_for_undo(map, before, after) {
    const undo_event = {
        type: UNDO_EVENT_TYPE.UPDATE,
        before: before,
        after: after,
    };
    push_undo_event(map, undo_event);
}
function note_mass_create_for_undo(map, created_ids) {
    const undo_event = {
        type: UNDO_EVENT_TYPE.MASS_CREATE,
        ids: created_ids,
    };
    push_undo_event(map, undo_event);
}
function do_one_undo(map) {
    if (!map.undo_position)
        return;
    map.undo_position--;
    const undo_event = map.undo_stack[map.undo_position];
    switch (undo_event.type) {
        case UNDO_EVENT_TYPE.CREATE:
            {
                const ue = undo_event;
                const obj = map.canvas_objs.get(ue.id);
                obj.flags |= CANVASFLAG.DELETED;
                publish_delete_by_ids(map.map_id, [obj.id]);
            }
            break;
        case UNDO_EVENT_TYPE.DELETE:
            {
                const ue = undo_event;
                const ids = ue.ids;
                const length = ids.length;
                const stripped = get_stripped_state_by_id(map, ids);
                for (let i = 0; i < length; i++) {
                    const obj = map.canvas_objs.get(ids[i]);
                    obj.flags &= ~CANVASFLAG.DELETED;
                    stripped[i].flags &= ~CANVASFLAG.DELETED;
                }
                publish_obj_updates(map.map_id, stripped);
            }
            break;
        case UNDO_EVENT_TYPE.MASS_CREATE:
            {
                const ue = undo_event;
                const ids = ue.ids;
                const length = ids.length;
                for (let i = 0; i < length; i++) {
                    const obj = map.canvas_objs.get(ids[i]);
                    obj.flags |= CANVASFLAG.DELETED;
                }
                publish_delete_by_ids(map.map_id, ids);
            }
            break;
        case UNDO_EVENT_TYPE.UPDATE:
            {
                const ue = undo_event;
                set_obj_states_from_stripped_objs(map, ue.before);
                publish_obj_updates(map.map_id, ue.before);
            }
            break;
    }
    request_render();
}
function do_one_redo(map) {
    if (map.undo_position == map.undo_stack.length)
        return;
    const undo_event = map.undo_stack[map.undo_position];
    switch (undo_event.type) {
        case UNDO_EVENT_TYPE.CREATE:
            {
                const ue = undo_event;
                const obj = map.canvas_objs.get(ue.id);
                obj.flags &= ~CANVASFLAG.DELETED;
                const stripped = get_stripped_state_by_id(map, [ue.id]);
                publish_obj_updates(map.map_id, stripped);
            }
            break;
        case UNDO_EVENT_TYPE.DELETE:
            {
                const ue = undo_event;
                const ids = ue.ids;
                const length = ids.length;
                for (let i = 0; i < length; i++) {
                    const obj = map.canvas_objs.get(ids[i]);
                    obj.flags |= CANVASFLAG.DELETED;
                }
                publish_delete_by_ids(map.map_id, ue.ids);
            }
            break;
        case UNDO_EVENT_TYPE.MASS_CREATE:
            {
                const ue = undo_event;
                const ids = ue.ids;
                const length = ids.length;
                for (let i = 0; i < length; i++) {
                    const obj = map.canvas_objs.get(ids[i]);
                    obj.flags &= ~CANVASFLAG.DELETED;
                }
                const stripped = get_stripped_state_by_id(map, ue.ids);
                publish_obj_updates(map.map_id, stripped);
            }
            break;
        case UNDO_EVENT_TYPE.UPDATE:
            {
                const ue = undo_event;
                set_obj_states_from_stripped_objs(map, ue.after);
                publish_obj_updates(map.map_id, ue.after);
            }
            break;
    }
    map.undo_position++;
    request_render();
}
function undo_is_impossible(map) {
    return !map.undo_position;
}
function redo_is_impossible(map) {
    return map.undo_position == map.undo_stack.length;
}
let localid = 0;
function get_new_id() {
    ++localid;
    let id = (session_id << 20) + localid;
    return id;
}
const copied_objs = [];
function clear_copy_buffer() {
    copied_objs.length = 0;
}
function copy_selected_objs_to_copy_buffer(map) {
    for (let obj_id of map.selected) {
        const obj = map.canvas_objs.get(obj_id);
        if (obj.flags & CANVASFLAG.DELETED)
            continue;
        const stripped = strip_obj(obj, STRIP_FLAGS_NONE);
        copied_objs.push(stripped);
    }
}
function cut_selected_objs_to_copy_buffer(map) {
    for (let obj_id of map.selected) {
        const obj = map.canvas_objs.get(obj_id);
        if (obj.flags & CANVASFLAG.DELETED)
            continue;
        const stripped = strip_obj(obj, STRIP_FLAGS_NONE);
        copied_objs.push(stripped);
        obj.flags |= CANVASFLAG.DELETED;
    }
    publish_delete_by_ids(map.map_id, Array.from(map.selected));
    note_delete_by_ids_for_undo(map, Array.from(map.selected));
    map.selected.clear();
    request_render();
}
function paste_from_copy_buffer_at(map, x, y) {
    x = snap_to_grid(x);
    y = snap_to_grid(y);
    const length = copied_objs.length;
    let x0 = 0;
    let y0 = 0;
    if (length) {
        x0 = copied_objs[0].base_x;
        y0 = copied_objs[0].base_y;
    }
    for (let i = 0; i < length; ++i) {
        const stripped = copied_objs[i];
        if (stripped.base_x < x0)
            x0 = stripped.base_x;
        if (stripped.base_y < y0)
            y0 = stripped.base_y;
    }
    const dx = x - x0;
    const dy = y - y0;
    const new_ids = [];
    for (let i = 0; i < length; ++i) {
        const stripped = copied_objs[i];
        let id = get_new_id();
        const obj = {
            type: stripped.type,
            id: id,
            base_x: stripped.base_x + dx,
            base_y: stripped.base_y + dy,
            flags: CANVASFLAG.NONE,
        };
        switch (obj.type) {
            case CANVASTYPE.FREEHAND_LINE:
                obj.color = stripped.color;
                obj.points = Array.from(stripped.points);
                obj.path = null;
                obj.bbox = { x0: 0, y0: 0, x1: 0, y1: 0 };
                freehand_recalculate_bbox(obj);
                freehand_recalculate_path(obj);
                break;
            case CANVASTYPE.GRID_LINE:
                obj.color = stripped.color;
                obj.points = Array.from(stripped.points);
                obj.path = null;
                obj.bbox = { x0: 0, x1: 0, y0: 0, y1: 0 };
                gridline_recalculate_bbox(obj);
                gridline_recalculate_path(obj);
                break;
            case CANVASTYPE.RECT:
                obj.color = stripped.color;
                obj.width = stripped.width;
                obj.height = stripped.height;
                break;
            case CANVASTYPE.FILLED_RECT:
                obj.color = stripped.color;
                obj.color2 = stripped.color2;
                obj.width = stripped.width;
                obj.height = stripped.height;
                break;
            case CANVASTYPE.GRID_RECT:
                obj.color = stripped.color;
                obj.width = stripped.width;
                obj.height = stripped.height;
                break;
            case CANVASTYPE.IMAGE:
                {
                    obj.width = stripped.width;
                    obj.height = stripped.height;
                    obj.url = stripped.url;
                    obj.img = null;
                    const img = new Image(obj.width, obj.height);
                    img.addEventListener('load', function () {
                        obj.img = img;
                        request_render();
                    }, { once: true });
                    img.src = obj.url;
                }
                break;
            case CANVASTYPE.TEXT:
                obj.text = stripped.text;
                obj.bbox = { x0: 0, x1: 0, y0: 0, y1: 0 };
                obj.size = stripped.size;
                break;
            case CANVASTYPE.EZ_TOKEN:
                obj.text = stripped.text;
                obj.color = stripped.color;
                obj.width = stripped.width;
                obj.height = stripped.height;
                break;
            case CANVASTYPE.IMG_TOKEN:
                {
                    obj.url = stripped.url;
                    obj.img = null;
                    obj.width = stripped.width;
                    obj.height = stripped.height;
                    const img = new Image(obj.width, obj.height);
                    img.addEventListener('load', function () {
                        obj.img = img;
                        request_render();
                    }, { once: true });
                    img.src = obj.url;
                }
                break;
            case CANVASTYPE.DOOR:
                {
                    obj.doortype = stripped.doortype;
                    obj.color = stripped.color;
                    obj.width = stripped.width;
                    obj.orientation = stripped.orientation;
                }
                break;
        }
        add_canv_obj(map, obj);
        new_ids.push(id);
        publish_obj_by_id(map, obj.id);
    }
    note_mass_create_for_undo(map, new_ids);
    request_render();
}
socket.on('canvas-create', function (msgs) {
    for (let msg of msgs) {
        const map_id = msg.map_id;
        const map = get_map(map_id);
        const objs = msg.objects;
        const length = objs.length;
        for (let i = 0; i < length; ++i) {
            const obj = objs[i];
            switch (obj.type) {
                case CANVASTYPE.FREEHAND_LINE:
                    obj.bbox = { x0: 0, x1: 0, y0: 0, y1: 0 };
                    freehand_recalculate_bbox(obj);
                    freehand_recalculate_path(obj);
                    break;
                case CANVASTYPE.GRID_LINE:
                    obj.bbox = { x0: 0, x1: 0, y0: 0, y1: 0 };
                    gridline_recalculate_bbox(obj);
                    gridline_recalculate_path(obj);
                    break;
                case CANVASTYPE.FILLED_RECT:
                    break;
                case CANVASTYPE.RECT:
                    break;
                case CANVASTYPE.GRID_RECT:
                    break;
                case CANVASTYPE.IMAGE:
                    {
                        obj.img = null;
                        const img = new Image(obj.width, obj.height);
                        img.addEventListener('load', function () {
                            obj.img = img;
                            request_render();
                        }, { once: true });
                        img.src = obj.url;
                    }
                    break;
                case CANVASTYPE.TEXT:
                    obj.bbox = { x0: 0, x1: 0, y0: 0, y1: 0 };
                    break;
                case CANVASTYPE.EZ_TOKEN:
                    break;
                case CANVASTYPE.IMG_TOKEN:
                    {
                        obj.img = null;
                        const img = new Image(obj.width, obj.height);
                        img.addEventListener('load', function () {
                            obj.img = img;
                            request_render();
                        }, { once: true });
                        img.src = obj.url;
                    }
                    break;
                case CANVASTYPE.DOOR:
                    {
                    }
                    break;
            }
            const existing_obj = map.canvas_objs.get(obj.id);
            if (existing_obj) {
                console.log('object already exists???', obj.id);
            }
            else {
                add_canv_obj(map, obj);
            }
        }
    }
    change_map(0);
    request_render();
});
socket.on('canvas-delete', function (msg) {
    const map_id = msg.map_id;
    const map = get_map(map_id);
    const obj_ids = msg.ids;
    const length = obj_ids.length;
    for (let i = 0; i < length; i++) {
        const id = obj_ids[i];
        const obj = map.canvas_objs.get(id);
        if (obj) {
            obj.flags |= CANVASFLAG.DELETED;
        }
        else {
            console.log('Deleting unknown object??', id);
        }
    }
    request_render();
});
socket.on('canvas-update', function (msg) {
    const map_id = msg.map_id;
    const map = get_map(map_id);
    const obj_states = msg.obj_states;
    set_obj_states_from_stripped_objs(map, obj_states);
    request_render();
});
function set_obj_states_from_stripped_objs(map, obj_states) {
    const length = obj_states.length;
    for (let i = 0; i < length; ++i) {
        const state = obj_states[i];
        const obj = map.canvas_objs.get(state.id);
        if (!obj) {
            console.log('Updating unknown object??', state.id);
            continue;
        }
        obj.base_x = state.base_x;
        obj.base_y = state.base_y;
        obj.flags = state.flags;
        switch (obj.type) {
            case CANVASTYPE.FREEHAND_LINE:
                obj.bbox = { x0: 0, x1: 0, y0: 0, y1: 0 };
                obj.points = state.points;
                obj.color = state.color;
                freehand_recalculate_bbox(obj);
                freehand_recalculate_path(obj);
                break;
            case CANVASTYPE.GRID_LINE:
                obj.bbox = { x0: 0, x1: 0, y0: 0, y1: 0 };
                obj.points = state.points;
                obj.color = state.color;
                gridline_recalculate_bbox(obj);
                gridline_recalculate_path(obj);
                break;
            case CANVASTYPE.FILLED_RECT:
                obj.width = state.width;
                obj.height = state.height;
                obj.color = state.color;
                obj.color2 = state.color2;
                break;
            case CANVASTYPE.RECT:
                obj.width = state.width;
                obj.height = state.height;
                obj.color = state.color;
                break;
            case CANVASTYPE.GRID_RECT:
                obj.width = state.width;
                obj.height = state.height;
                obj.color = state.color;
                break;
            case CANVASTYPE.IMAGE:
                {
                    const needs_new_image = (obj.width !== state.width) || (obj.height !== state.height) || (obj.url !== state.url);
                    obj.width = state.width;
                    obj.height = state.height;
                    if (needs_new_image) {
                        const img = new Image(obj.width, obj.height);
                        img.addEventListener('load', function () {
                            obj.img = img;
                            request_render();
                        }, { once: true });
                        img.src = obj.url;
                    }
                }
                break;
            case CANVASTYPE.TEXT:
                obj.bbox = { x0: 0, x1: 0, y0: 0, y1: 0 };
                obj.text = state.text;
                break;
            case CANVASTYPE.EZ_TOKEN:
                obj.color = state.color;
                obj.text = state.text;
                obj.width = state.width;
                obj.height = state.height;
                break;
            case CANVASTYPE.IMG_TOKEN:
                {
                    obj.width = state.width;
                    obj.height = state.height;
                }
                break;
            case CANVASTYPE.DOOR:
                obj.color = state.color;
                obj.doortype = state.doortype;
                obj.width = state.width;
                obj.orientation = state.orientation;
                break;
        }
    }
}
var SELECTTYPE;
(function (SELECTTYPE) {
    SELECTTYPE[SELECTTYPE["MAP"] = 1] = "MAP";
    SELECTTYPE[SELECTTYPE["TOKEN"] = 2] = "TOKEN";
    SELECTTYPE[SELECTTYPE["ANY"] = 3] = "ANY";
})(SELECTTYPE || (SELECTTYPE = {}));
function update_selection(map, x0, y0, x1, y1) {
    if (x0 > x1) {
        let temp = x0;
        x0 = x1;
        x1 = temp;
    }
    if (y0 > y1) {
        let temp = y0;
        y0 = y1;
        y1 = temp;
    }
    map.selection_area.x0 = x0;
    map.selection_area.y0 = y0;
    map.selection_area.x1 = x1;
    map.selection_area.y1 = y1;
}
function point_in_rect(x, y, x0, y0, x1, y1) {
    return (x >= x0) && (x <= x1) && (y >= y0) && (y <= y1);
}
function note_selections(map) {
    const canvas_obj_array = map.canvas_obj_array;
    const length = canvas_obj_array.length;
    const x0 = map.selection_area.x0;
    const y0 = map.selection_area.y0;
    const x1 = map.selection_area.x1;
    const y1 = map.selection_area.y1;
    const selection_bbox = { x0: x0, y0: y0, x1: x1, y1: y1, };
    const selection_type = map.selection_area.select_type;
    const selected = map.selected;
    for (let i = 0; i < length; ++i) {
        const obj = canvas_obj_array[i];
        if (obj.flags & CANVASFLAG.DELETED)
            continue;
        switch (obj.type) {
            case CANVASTYPE.GRID_LINE:
            case CANVASTYPE.FREEHAND_LINE:
                {
                    if (!(selection_type & SELECTTYPE.MAP))
                        break;
                    const line_bbox = {
                        x0: obj.bbox.x0 + obj.base_x,
                        y0: obj.bbox.y0 + obj.base_y,
                        x1: obj.bbox.x1 + obj.base_x,
                        y1: obj.bbox.y1 + obj.base_y,
                    };
                    if (!bbox_overlaps(line_bbox, selection_bbox)) {
                        break;
                    }
                    if (point_in_rect(obj.base_x, obj.base_y, x0, y0, x1, y1)) {
                        selected.add(obj.id);
                        break;
                    }
                    const points = obj.points;
                    const length = points.length;
                    for (let j = 0; j < length; j += 2) {
                        const x = points[j] + obj.base_x;
                        const y = points[j + 1] + obj.base_y;
                        if (point_in_rect(x, y, x0, y0, x1, y1)) {
                            selected.add(obj.id);
                            break;
                        }
                    }
                }
                break;
            case CANVASTYPE.FILLED_RECT:
            case CANVASTYPE.RECT:
            case CANVASTYPE.IMAGE:
            case CANVASTYPE.GRID_RECT:
                {
                    if (!(selection_type & SELECTTYPE.MAP))
                        break;
                    const rect_bbox = {
                        x0: obj.base_x,
                        y0: obj.base_y,
                        x1: obj.base_x + obj.width,
                        y1: obj.base_y + obj.height,
                    };
                    if (bbox_overlaps(rect_bbox, selection_bbox)) {
                        selected.add(obj.id);
                        break;
                    }
                }
                break;
            case CANVASTYPE.IMG_TOKEN:
            case CANVASTYPE.EZ_TOKEN:
                {
                    if (!(selection_type & SELECTTYPE.TOKEN))
                        break;
                    const radius_x = obj.width * REFERENCE_WIDTH / 2;
                    const radius_y = obj.height * REFERENCE_WIDTH / 2;
                    const token_bbox = {
                        x0: obj.base_x,
                        x1: obj.base_x + 2 * radius_x,
                        y0: obj.base_y,
                        y1: obj.base_y + 2 * radius_y,
                    };
                    if (bbox_overlaps(token_bbox, selection_bbox)) {
                        selected.add(obj.id);
                        break;
                    }
                }
                break;
            case CANVASTYPE.TEXT:
                {
                    if (!(selection_type & SELECTTYPE.MAP))
                        break;
                    const text_bbox = {
                        x0: obj.bbox.x0 + obj.base_x,
                        y0: obj.bbox.y0 + obj.base_y,
                        x1: obj.bbox.x1 + obj.base_x,
                        y1: obj.bbox.y1 + obj.base_y,
                    };
                    if (bbox_overlaps(text_bbox, selection_bbox)) {
                        selected.add(obj.id);
                        break;
                    }
                }
                break;
            case CANVASTYPE.DOOR:
                {
                    if (!(selection_type & SELECTTYPE.MAP))
                        break;
                    const is_vertical = obj.orientation === ORIENTATION.VERTICAL;
                    if (is_vertical) {
                        const bbox = {
                            x0: obj.base_x - 32,
                            x1: obj.base_x + 32,
                            y0: obj.base_y - 5,
                            y1: obj.base_y + 5,
                        };
                        if (bbox_overlaps(bbox, selection_bbox)) {
                            selected.add(obj.id);
                            break;
                        }
                    }
                    else {
                        const bbox = {
                            x0: obj.base_x - 5,
                            x1: obj.base_x + 5,
                            y0: obj.base_y - 32,
                            y1: obj.base_y + 32,
                        };
                        if (bbox_overlaps(bbox, selection_bbox)) {
                            selected.add(obj.id);
                            break;
                        }
                    }
                }
                break;
        }
    }
}
function finalize_selection(map) {
    map.selected.clear();
    map.selection_area.is_selecting = false;
    note_selections(map);
    request_render();
}
function end_selecting(map) {
    map.selected.clear();
    map.selection_area.is_selecting = false;
    request_render();
}
function change_select_mode(map, mode) {
    map.selected.clear();
    map.selection_area.select_type = mode;
    note_selections(map);
    request_render();
}
function move_selected_objects(map, base_x, base_y, dx, dy) {
    const selected_objs = [];
    let result = [base_x + dx, base_y + dy];
    let rigid = false;
    for (let item of map.selected) {
        const obj = map.canvas_objs.get(item);
        if (obj.flags & CANVASFLAG.DELETED)
            continue;
        switch (obj.type) {
            case CANVASTYPE.GRID_RECT:
            case CANVASTYPE.GRID_LINE:
            case CANVASTYPE.IMAGE:
            case CANVASTYPE.DOOR:
            case CANVASTYPE.EZ_TOKEN:
            case CANVASTYPE.IMG_TOKEN:
                rigid = true;
                break;
            default:
                break;
        }
        selected_objs.push(obj);
    }
    if (!selected_objs.length)
        return result;
    if (rigid) {
        const aligned_old_x = snap_to_grid(base_x);
        const aligned_old_y = snap_to_grid(base_y);
        const aligned_new_x = snap_to_grid(base_x + dx);
        const aligned_new_y = snap_to_grid(base_y + dy);
        dx = aligned_new_x - aligned_old_x;
        dy = aligned_new_y - aligned_old_y;
        if (dx || dy) {
            for (let i = 0; i < selected_objs.length; i++) {
                const obj = selected_objs[i];
                obj.base_x += dx;
                obj.base_y += dy;
                switch (obj.type) {
                    case CANVASTYPE.FREEHAND_LINE:
                        freehand_recalculate_path(obj);
                        break;
                    case CANVASTYPE.GRID_LINE:
                        gridline_recalculate_path(obj);
                        break;
                    case CANVASTYPE.FILLED_RECT:
                    case CANVASTYPE.RECT:
                    case CANVASTYPE.GRID_RECT:
                        break;
                    case CANVASTYPE.IMAGE:
                        break;
                    case CANVASTYPE.TEXT:
                        break;
                    case CANVASTYPE.EZ_TOKEN:
                        break;
                    case CANVASTYPE.IMG_TOKEN:
                        break;
                    case CANVASTYPE.DOOR:
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
        for (let i = 0; i < selected_objs.length; i++) {
            const obj = selected_objs[i];
            obj.base_x += dx;
            obj.base_y += dy;
            switch (obj.type) {
                case CANVASTYPE.FREEHAND_LINE:
                    freehand_recalculate_path(obj);
                    break;
                case CANVASTYPE.GRID_LINE:
                    gridline_recalculate_path(obj);
                    break;
                case CANVASTYPE.FILLED_RECT:
                case CANVASTYPE.RECT:
                case CANVASTYPE.GRID_RECT:
                    break;
                case CANVASTYPE.IMAGE:
                    break;
                case CANVASTYPE.TEXT:
                    break;
                case CANVASTYPE.EZ_TOKEN:
                    break;
                case CANVASTYPE.IMG_TOKEN:
                    break;
                case CANVASTYPE.DOOR:
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
function add_canv_obj(map, obj) {
    map.canvas_objs.set(obj.id, obj);
    map.canvas_obj_array.push(obj);
}
const STRIP_FLAGS_NONE = 0;
const STRIP_INCLUDE_ID = 1;
;
;
function strip_obj(obj, include_flags) {
    let stripped_obj = {
        type: obj.type,
        base_x: obj.base_x,
        base_y: obj.base_y,
        flags: obj.flags,
    };
    if (include_flags & STRIP_INCLUDE_ID) {
        stripped_obj.id = obj.id;
    }
    switch (obj.type) {
        case CANVASTYPE.FREEHAND_LINE:
            stripped_obj.points = obj.points;
            stripped_obj.color = obj.color;
            break;
        case CANVASTYPE.GRID_LINE:
            stripped_obj.points = obj.points;
            stripped_obj.color = obj.color;
            break;
        case CANVASTYPE.FILLED_RECT:
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            stripped_obj.color = obj.color;
            stripped_obj.color2 = obj.color2;
            break;
        case CANVASTYPE.RECT:
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            stripped_obj.color = obj.color;
            break;
        case CANVASTYPE.GRID_RECT:
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            stripped_obj.color = obj.color;
            break;
        case CANVASTYPE.IMAGE:
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            stripped_obj.url = obj.url;
            break;
        case CANVASTYPE.TEXT:
            stripped_obj.text = obj.text;
            stripped_obj.size = obj.size;
            break;
        case CANVASTYPE.EZ_TOKEN:
            stripped_obj.color = obj.color;
            stripped_obj.text = obj.text;
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            break;
        case CANVASTYPE.IMG_TOKEN:
            stripped_obj.url = obj.url;
            stripped_obj.width = obj.width;
            stripped_obj.height = obj.height;
            break;
        case CANVASTYPE.DOOR:
            stripped_obj.color = obj.color;
            stripped_obj.width = obj.width;
            stripped_obj.doortype = obj.doortype;
            stripped_obj.orientation = obj.orientation;
            break;
    }
    return stripped_obj;
}
function publish_delete_by_ids(map_id, ids) {
    socket.emit('canvas-delete', { map_id: map_id, ids: ids });
}
function publish_obj_by_id(map, id) {
    const obj = map.canvas_objs.get(id);
    if (!obj) {
        console.log('invalid id given for publishing:', id);
        return;
    }
    const stripped_obj = strip_obj(obj, STRIP_INCLUDE_ID);
    socket.emit('canvas-create', { map_id: map.map_id, object: stripped_obj });
}
function get_stripped_state_by_id(map, ids) {
    const length = ids.length;
    const updates = [];
    for (let i = 0; i < length; ++i) {
        const id = ids[i];
        const obj = map.canvas_objs.get(id);
        if (!obj) {
            console.log('Invalid id given for publishing update', id);
            continue;
        }
        const stripped = strip_obj(obj, STRIP_INCLUDE_ID);
        updates.push(stripped);
    }
    return updates;
}
function publish_obj_updates(map_id, updates) {
    socket.emit('canvas-update', { map_id: map_id, obj_states: updates });
}
function edit_is_impossible(map) {
    if (map.selected.size !== 1)
        return true;
    const first = map.selected.values().next().value;
    const obj = map.canvas_objs.get(first);
    switch (obj.type) {
        case CANVASTYPE.FREEHAND_LINE:
            return true;
        case CANVASTYPE.GRID_LINE:
            return true;
        case CANVASTYPE.RECT:
            return true;
        case CANVASTYPE.GRID_RECT:
            return true;
        case CANVASTYPE.FILLED_RECT:
            return true;
        case CANVASTYPE.IMAGE:
            return false;
        case CANVASTYPE.TEXT:
            return true;
        case CANVASTYPE.EZ_TOKEN:
            return false;
        case CANVASTYPE.IMG_TOKEN:
            return false;
        case CANVASTYPE.DOOR:
            return true;
    }
    return false;
}
function launch_edit_dialog(map) {
    if (map.selected.size !== 1)
        return;
    const first = map.selected.values().next().value;
    const obj = map.canvas_objs.get(first);
    switch (obj.type) {
        case CANVASTYPE.FREEHAND_LINE:
            return;
        case CANVASTYPE.GRID_LINE:
            return;
        case CANVASTYPE.RECT:
            return;
        case CANVASTYPE.GRID_RECT:
            return;
        case CANVASTYPE.FILLED_RECT:
            return;
        case CANVASTYPE.IMAGE:
            return;
        case CANVASTYPE.TEXT:
            return;
        case CANVASTYPE.EZ_TOKEN:
            {
                const html = `
            <h2>Edit Token</h2>
            <table class="input-container">
                <tr>
                    <td><label for="color">Color:</label>
                    <td><input type="color" id="hover-color" value="` + obj.color + `">
                </tr>
                <tr>
                    <td><label for="width">Width (sq):</label>
                    <td><input type="number" name="width" id="hover-width" min="1" max="5" value="` + obj.width + `" class="numeric-input">
                    <td><label for="height">Height (sq):</label>
                    <td><input type="number" name="height" id="hover-height" min="1" max="5" value="` + obj.height + `" class="numeric-input">
                </tr>
                <tr>
                    <td><label for="text">Text:</label>
                    <td colspan="3"><input type="text" name="text" id="hover-text" value="` + obj.text + `">
                </tr>
            </table>
            `;
                make_ok_dialog(html, function (hoverpop) {
                    const text_input = document.getElementById('hover-text');
                    const text = text_input.value;
                    if (text) {
                        obj.text = text;
                    }
                    let width = +(document.getElementById('hover-width').value);
                    let height = +(document.getElementById('hover-height').value);
                    if (!width)
                        width = 1;
                    if (!height)
                        height = 1;
                    obj.width = width;
                    obj.height = height;
                    const color = document.getElementById('hover-color').value;
                    obj.color = color;
                    const after = strip_obj(obj, STRIP_INCLUDE_ID);
                    publish_obj_updates(map.map_id, [after]);
                    request_render();
                });
            }
            return;
        case CANVASTYPE.IMG_TOKEN:
            {
            }
            return;
        case CANVASTYPE.DOOR:
            return;
    }
}
let animation_requested = false;
function request_render() {
    if (animation_requested) {
        return;
    }
    animation_requested = true;
    requestAnimationFrame(render);
}
function render() {
    if (!ctx)
        return;
    const map = get_map(current_map_id);
    if (map.selection_area.is_selecting) {
        map.selected.clear();
        note_selections(map);
    }
    const canvas_obj_array = map.canvas_obj_array;
    const selected = map.selected;
    const camera_x = map.camera_x;
    const camera_y = map.camera_y;
    const scale = map.scale;
    animation_requested = false;
    const width = canvas.width;
    const height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    let SCALE = scale;
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = 'rgb(150, 150, 150)';
    let grid_base_x = camera_x & (REFERENCE_WIDTH - 1);
    let grid_base_y = camera_y & (REFERENCE_WIDTH - 1);
    let grid_max_x = width / SCALE;
    let grid_max_y = height / SCALE;
    for (let x = grid_base_x; x < grid_max_x; x += REFERENCE_WIDTH) {
        ctx.fillRect(x, 0, 1 / SCALE, height / SCALE);
    }
    for (let y = grid_base_y; y < grid_max_y; y += REFERENCE_WIDTH) {
        ctx.fillRect(0, y, width / SCALE, 1 / SCALE);
    }
    ctx.translate(camera_x, camera_y);
    let length = canvas_obj_array.length;
    const SELECTED_COLOR = '#33ffdd';
    const canvas_bbox = {
        x0: -camera_x,
        y0: -camera_y,
        x1: -camera_x + width / scale,
        y1: -camera_y + height / scale,
    };
    for (let i = 0; i < length; ++i) {
        let obj = canvas_obj_array[i];
        if (obj.flags & CANVASFLAG.DELETED)
            continue;
        const is_selected = selected.has(obj.id);
        switch (obj.type) {
            case CANVASTYPE.FREEHAND_LINE:
                {
                    const line_bbox = {
                        x0: obj.bbox.x0 + obj.base_x,
                        y0: obj.bbox.y0 + obj.base_y,
                        x1: obj.bbox.x1 + obj.base_x,
                        y1: obj.bbox.y1 + obj.base_y,
                    };
                    if (!bbox_overlaps(canvas_bbox, line_bbox)) {
                        break;
                    }
                    if (obj.path) {
                        if (is_selected) {
                            ctx.lineWidth = 8;
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.stroke(obj.path);
                        }
                        ctx.lineWidth = 4;
                        ctx.strokeStyle = obj.color;
                        ctx.stroke(obj.path);
                    }
                }
                break;
            case CANVASTYPE.GRID_LINE:
                {
                    const line_bbox = {
                        x0: obj.bbox.x0 + obj.base_x,
                        y0: obj.bbox.y0 + obj.base_y,
                        x1: obj.bbox.x1 + obj.base_x,
                        y1: obj.bbox.y1 + obj.base_y,
                    };
                    if (!bbox_overlaps(canvas_bbox, line_bbox)) {
                        break;
                    }
                    if (obj.path) {
                        if (is_selected) {
                            ctx.lineWidth = 2 * Math.max(3 / scale, 6);
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.stroke(obj.path);
                        }
                        ctx.lineWidth = Math.max(3 / scale, 6);
                        ctx.strokeStyle = obj.color;
                        ctx.stroke(obj.path);
                    }
                }
                break;
            case CANVASTYPE.FILLED_RECT:
                {
                    const rect_bbox = {
                        x0: obj.base_x,
                        y0: obj.base_y,
                        x1: obj.base_x + obj.width,
                        y1: obj.base_y + obj.height,
                    };
                    if (!bbox_overlaps(rect_bbox, canvas_bbox)) {
                        break;
                    }
                    if (obj.width && obj.height) {
                        if (is_selected) {
                            ctx.lineWidth = 8;
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.strokeRect(obj.base_x - 2, obj.base_y - 2, obj.width + 4, obj.height + 4);
                        }
                        ctx.lineWidth = 4;
                        ctx.fillStyle = obj.color2;
                        ctx.fillRect(obj.base_x, obj.base_y, obj.width, obj.height);
                        ctx.strokeStyle = obj.color;
                        ctx.strokeRect(obj.base_x, obj.base_y, obj.width, obj.height);
                    }
                }
                break;
            case CANVASTYPE.RECT:
                {
                    const rect_bbox = {
                        x0: obj.base_x,
                        y0: obj.base_y,
                        x1: obj.base_x + obj.width,
                        y1: obj.base_y + obj.height,
                    };
                    if (!bbox_overlaps(rect_bbox, canvas_bbox)) {
                        break;
                    }
                    if (obj.width && obj.height) {
                        if (is_selected) {
                            ctx.lineWidth = 8;
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.strokeRect(obj.base_x - 2, obj.base_y - 2, obj.width + 4, obj.height + 4);
                        }
                        ctx.lineWidth = 4;
                        ctx.strokeStyle = obj.color;
                        ctx.strokeRect(obj.base_x, obj.base_y, obj.width, obj.height);
                    }
                }
                break;
            case CANVASTYPE.GRID_RECT:
                {
                    const rect_bbox = {
                        x0: obj.base_x,
                        y0: obj.base_y,
                        x1: obj.base_x + obj.width,
                        y1: obj.base_y + obj.height,
                    };
                    if (!bbox_overlaps(rect_bbox, canvas_bbox)) {
                        break;
                    }
                    if (obj.width && obj.height) {
                        if (is_selected) {
                            ctx.fillStyle = SELECTED_COLOR + 'aa';
                            ctx.fillRect(obj.base_x - 2, obj.base_y - 2, obj.width + 4, obj.height + 4);
                        }
                        ctx.fillStyle = obj.color + 'aa';
                        ctx.fillRect(obj.base_x, obj.base_y, obj.width, obj.height);
                    }
                }
                break;
            case CANVASTYPE.TEXT:
                {
                    if (obj.text) {
                        ctx.font = obj.size + 'px sans-serif';
                        ctx.textBaseline = 'middle';
                        ctx.textAlign = "center";
                        if (obj.bbox.x0 == obj.bbox.x1) {
                            let metric = ctx.measureText(obj.text);
                            let width = metric.width;
                            let height = metric.fontBoundingBoxAscent ? metric.fontBoundingBoxAscent + 2 : obj.size;
                            obj.bbox.x0 = -width / 2;
                            obj.bbox.x1 = width / 2;
                            obj.bbox.y0 = -height / 2;
                            obj.bbox.y1 = height / 2;
                        }
                        const text_bbox = {
                            x0: obj.bbox.x0 + obj.base_x,
                            y0: obj.bbox.y0 + obj.base_y,
                            x1: obj.bbox.x1 + obj.base_x,
                            y1: obj.bbox.y1 + obj.base_y,
                        };
                        if (!bbox_overlaps(text_bbox, canvas_bbox)) {
                            break;
                        }
                        if (is_selected) {
                            ctx.fillStyle = SELECTED_COLOR + 'aa';
                            const x = obj.base_x + obj.bbox.x0;
                            const y = obj.base_y + obj.bbox.y0;
                            const width = obj.bbox.x1 - obj.bbox.x0;
                            const height = obj.bbox.y1 - obj.bbox.y0;
                            ctx.fillRect(x, y, width, height);
                        }
                        ctx.fillStyle = '#000';
                        ctx.fillText(obj.text, obj.base_x, obj.base_y);
                    }
                }
                break;
            case CANVASTYPE.EZ_TOKEN:
                {
                    const radius_x = obj.width * REFERENCE_WIDTH / 2;
                    const radius_y = obj.height * REFERENCE_WIDTH / 2;
                    const token_bbox = {
                        x0: obj.base_x,
                        x1: obj.base_x + 2 * radius_x,
                        y0: obj.base_y,
                        y1: obj.base_y + 2 * radius_y,
                    };
                    if (!bbox_overlaps(token_bbox, canvas_bbox)) {
                        break;
                    }
                    if (is_selected) {
                        ctx.beginPath();
                        ctx.fillStyle = SELECTED_COLOR;
                        ctx.arc(obj.base_x + radius_x, obj.base_y + radius_y, radius_x + 4, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                    ctx.beginPath();
                    ctx.fillStyle = '#000';
                    ctx.arc(obj.base_x + radius_x, obj.base_y + radius_y, radius_x, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.fillStyle = obj.color;
                    ctx.arc(obj.base_x + radius_x, obj.base_y + radius_y, radius_x - 2, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.font = '18px sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = "center";
                    ctx.fillStyle = '#000';
                    ctx.fillText(obj.text, obj.base_x + radius_x, obj.base_y + radius_y);
                }
                break;
            case CANVASTYPE.IMAGE:
                {
                    const rect_bbox = {
                        x0: obj.base_x,
                        y0: obj.base_y,
                        x1: obj.base_x + obj.width,
                        y1: obj.base_y + obj.height,
                    };
                    if (!bbox_overlaps(rect_bbox, canvas_bbox)) {
                        break;
                    }
                    if (is_selected) {
                        ctx.fillStyle = SELECTED_COLOR + 'aa';
                        ctx.fillRect(obj.base_x - 4, obj.base_y - 4, obj.width + 8, obj.height + 8);
                    }
                    if (obj.img)
                        ctx.drawImage(obj.img, obj.base_x, obj.base_y, obj.width, obj.height);
                    else {
                        ctx.fillStyle = '#337733aa';
                        ctx.fillRect(obj.base_x, obj.base_y, obj.width, obj.height);
                    }
                }
                break;
            case CANVASTYPE.IMG_TOKEN:
                {
                    const radius_x = obj.width * REFERENCE_WIDTH / 2;
                    const radius_y = obj.height * REFERENCE_WIDTH / 2;
                    const token_bbox = {
                        x0: obj.base_x,
                        x1: obj.base_x + 2 * radius_x,
                        y0: obj.base_y,
                        y1: obj.base_y + 2 * radius_y,
                    };
                    if (!bbox_overlaps(token_bbox, canvas_bbox)) {
                        break;
                    }
                    if (is_selected) {
                        ctx.beginPath();
                        ctx.lineWidth = 4;
                        ctx.strokeStyle = SELECTED_COLOR;
                        ctx.arc(obj.base_x + radius_x, obj.base_y + radius_y, radius_x + 2, 0, 2 * Math.PI);
                        ctx.stroke();
                    }
                    ctx.beginPath();
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = '#000';
                    ctx.arc(obj.base_x + radius_x, obj.base_y + radius_y, radius_x - 2, 0, 2 * Math.PI);
                    ctx.stroke();
                    if (obj.img) {
                        ctx.drawImage(obj.img, obj.base_x, obj.base_y, radius_x * 2, radius_y * 2);
                    }
                    else {
                        ctx.beginPath();
                        ctx.fillStyle = '#333333';
                        ctx.arc(obj.base_x + radius_x, obj.base_y + radius_y, radius_x - 4, 0, 2 * Math.PI);
                        ctx.fill();
                    }
                }
                break;
            case CANVASTYPE.DOOR:
                {
                    const is_vertical = obj.orientation === ORIENTATION.VERTICAL;
                    if (!is_vertical) {
                        const bbox = {
                            x0: obj.base_x - 32,
                            x1: obj.base_x + 32,
                            y0: obj.base_y - 5,
                            y1: obj.base_y + 5,
                        };
                        if (!bbox_overlaps(bbox, canvas_bbox)) {
                            break;
                        }
                    }
                    else {
                        const bbox = {
                            x0: obj.base_x - 5,
                            x1: obj.base_x + 5,
                            y0: obj.base_y - 32,
                            y1: obj.base_y + 32,
                        };
                        if (!bbox_overlaps(bbox, canvas_bbox)) {
                            break;
                        }
                    }
                    switch (obj.doortype) {
                        case DOORTYPE.DOUBLE:
                            {
                                if (is_selected) {
                                    ctx.strokeStyle = SELECTED_COLOR;
                                    ctx.lineWidth = 8;
                                    switch (obj.orientation) {
                                        case ORIENTATION.VERTICAL:
                                            ctx.strokeRect(obj.base_x - 10, obj.base_y - 24, 20, 48);
                                            break;
                                        case ORIENTATION.HORIZONTAL:
                                            ctx.strokeRect(obj.base_x - 24, obj.base_y - 10, 48, 20);
                                            break;
                                        case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                            ctx.lineWidth = 22;
                                            ctx.beginPath();
                                            ctx.moveTo(obj.base_x - 22, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x + 22, obj.base_y + 22);
                                            ctx.stroke();
                                            break;
                                        case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                            ctx.lineWidth = 22;
                                            ctx.beginPath();
                                            ctx.moveTo(obj.base_x + 22, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x - 22, obj.base_y + 22);
                                            ctx.stroke();
                                            break;
                                    }
                                }
                                ctx.fillStyle = '#fff';
                                ctx.strokeStyle = obj.color;
                                ctx.lineWidth = 4;
                                switch (obj.orientation) {
                                    case ORIENTATION.VERTICAL:
                                        ctx.fillRect(obj.base_x - 10, obj.base_y - 24, 20, 48);
                                        ctx.strokeRect(obj.base_x - 10, obj.base_y - 24, 20, 48);
                                        ctx.strokeRect(obj.base_x - 10, obj.base_y, 20, 1);
                                        break;
                                    case ORIENTATION.HORIZONTAL:
                                        ctx.fillRect(obj.base_x - 24, obj.base_y - 10, 48, 20);
                                        ctx.strokeRect(obj.base_x - 24, obj.base_y - 10, 48, 20);
                                        ctx.strokeRect(obj.base_x, obj.base_y - 10, 1, 20);
                                        break;
                                    case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                        ctx.lineWidth = 18;
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x - 20, obj.base_y - 20);
                                        ctx.lineTo(obj.base_x + 20, obj.base_y + 20);
                                        ctx.stroke();
                                        ctx.strokeStyle = '#fff';
                                        ctx.lineWidth = 10;
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x - 16, obj.base_y - 16);
                                        ctx.lineTo(obj.base_x - 2, obj.base_y - 2);
                                        ctx.stroke();
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x + 2, obj.base_y + 2);
                                        ctx.lineTo(obj.base_x + 16, obj.base_y + 16);
                                        ctx.stroke();
                                        break;
                                    case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                        ctx.lineWidth = 18;
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x + 20, obj.base_y - 20);
                                        ctx.lineTo(obj.base_x - 20, obj.base_y + 20);
                                        ctx.stroke();
                                        ctx.strokeStyle = '#fff';
                                        ctx.lineWidth = 10;
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x + 16, obj.base_y - 16);
                                        ctx.lineTo(obj.base_x + 2, obj.base_y - 2);
                                        ctx.stroke();
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x - 2, obj.base_y + 2);
                                        ctx.lineTo(obj.base_x - 16, obj.base_y + 16);
                                        ctx.stroke();
                                        break;
                                }
                            }
                            break;
                        case DOORTYPE.DOOR:
                            {
                                if (is_selected) {
                                    ctx.strokeStyle = SELECTED_COLOR;
                                    ctx.lineWidth = 8;
                                    switch (obj.orientation) {
                                        case ORIENTATION.VERTICAL:
                                            ctx.strokeRect(obj.base_x - 10, obj.base_y - 24, 20, 48);
                                            break;
                                        case ORIENTATION.HORIZONTAL:
                                            ctx.strokeRect(obj.base_x - 24, obj.base_y - 10, 48, 20);
                                            break;
                                        case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                            ctx.lineWidth = 22;
                                            ctx.beginPath();
                                            ctx.moveTo(obj.base_x - 22, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x + 22, obj.base_y + 22);
                                            ctx.stroke();
                                            break;
                                        case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                            ctx.lineWidth = 22;
                                            ctx.beginPath();
                                            ctx.moveTo(obj.base_x + 22, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x - 22, obj.base_y + 22);
                                            ctx.stroke();
                                            break;
                                    }
                                }
                                ctx.fillStyle = '#fff';
                                ctx.strokeStyle = obj.color;
                                ctx.lineWidth = 4;
                                switch (obj.orientation) {
                                    case ORIENTATION.VERTICAL:
                                        ctx.fillRect(obj.base_x - 10, obj.base_y - 24, 20, 48);
                                        ctx.strokeRect(obj.base_x - 10, obj.base_y - 24, 20, 48);
                                        break;
                                    case ORIENTATION.HORIZONTAL:
                                        ctx.fillRect(obj.base_x - 24, obj.base_y - 10, 48, 20);
                                        ctx.strokeRect(obj.base_x - 24, obj.base_y - 10, 48, 20);
                                        break;
                                    case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                        ctx.lineWidth = 18;
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x - 20, obj.base_y - 20);
                                        ctx.lineTo(obj.base_x + 20, obj.base_y + 20);
                                        ctx.stroke();
                                        ctx.strokeStyle = '#fff';
                                        ctx.lineWidth = 10;
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x - 16, obj.base_y - 16);
                                        ctx.lineTo(obj.base_x + 16, obj.base_y + 16);
                                        ctx.stroke();
                                        break;
                                    case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                        ctx.lineWidth = 18;
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x + 20, obj.base_y - 20);
                                        ctx.lineTo(obj.base_x - 20, obj.base_y + 20);
                                        ctx.stroke();
                                        ctx.strokeStyle = '#fff';
                                        ctx.lineWidth = 10;
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x + 16, obj.base_y - 16);
                                        ctx.lineTo(obj.base_x - 16, obj.base_y + 16);
                                        ctx.stroke();
                                        break;
                                }
                            }
                            break;
                        case DOORTYPE.PORTCULLIS:
                            {
                                if (is_selected) {
                                    ctx.strokeStyle = SELECTED_COLOR;
                                    ctx.lineWidth = 8;
                                    switch (obj.orientation) {
                                        case ORIENTATION.VERTICAL:
                                            ctx.strokeRect(obj.base_x - 10, obj.base_y - 16, 20, 32);
                                            break;
                                        case ORIENTATION.HORIZONTAL:
                                            ctx.strokeRect(obj.base_x - 16, obj.base_y - 10, 32, 20);
                                            break;
                                        case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                            ctx.lineWidth = 22;
                                            ctx.beginPath();
                                            ctx.moveTo(obj.base_x - 22, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x + 22, obj.base_y + 22);
                                            ctx.stroke();
                                            break;
                                        case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                            ctx.lineWidth = 22;
                                            ctx.beginPath();
                                            ctx.moveTo(obj.base_x + 22, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x - 22, obj.base_y + 22);
                                            ctx.stroke();
                                            break;
                                    }
                                }
                                ctx.strokeStyle = '#fff';
                                ctx.lineWidth = 12;
                                ctx.setLineDash([6, 4]);
                                ctx.beginPath();
                                switch (obj.orientation) {
                                    case ORIENTATION.VERTICAL:
                                        ctx.moveTo(obj.base_x, obj.base_y - 20);
                                        ctx.lineTo(obj.base_x, obj.base_y + 28);
                                        break;
                                    case ORIENTATION.HORIZONTAL:
                                        ctx.moveTo(obj.base_x - 20, obj.base_y);
                                        ctx.lineTo(obj.base_x + 28, obj.base_y);
                                        break;
                                    case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                        ctx.moveTo(obj.base_x - 16, obj.base_y - 16);
                                        ctx.lineTo(obj.base_x + 16, obj.base_y + 16);
                                        break;
                                    case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                        ctx.moveTo(obj.base_x + 16, obj.base_y - 16);
                                        ctx.lineTo(obj.base_x - 16, obj.base_y + 16);
                                        break;
                                }
                                ctx.stroke();
                                ctx.setLineDash([]);
                            }
                            break;
                        case DOORTYPE.PORTAL:
                            {
                                if (is_selected) {
                                    ctx.strokeStyle = SELECTED_COLOR;
                                    ctx.lineWidth = 8;
                                    switch (obj.orientation) {
                                        case ORIENTATION.VERTICAL:
                                            ctx.strokeRect(obj.base_x - 10, obj.base_y - 16, 20, 32);
                                            break;
                                        case ORIENTATION.HORIZONTAL:
                                            ctx.strokeRect(obj.base_x - 16, obj.base_y - 10, 32, 20);
                                            break;
                                        case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                            ctx.lineWidth = 22;
                                            ctx.beginPath();
                                            ctx.moveTo(obj.base_x - 22, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x + 22, obj.base_y + 22);
                                            ctx.stroke();
                                            break;
                                        case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                            ctx.lineWidth = 22;
                                            ctx.beginPath();
                                            ctx.moveTo(obj.base_x + 22, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x - 22, obj.base_y + 22);
                                            ctx.stroke();
                                            break;
                                    }
                                }
                                ctx.fillStyle = '#fff';
                                ctx.lineWidth = 4;
                                switch (obj.orientation) {
                                    case ORIENTATION.VERTICAL:
                                        ctx.fillRect(obj.base_x - 10, obj.base_y - 16, 20, 32);
                                        break;
                                    case ORIENTATION.HORIZONTAL:
                                        ctx.fillRect(obj.base_x - 16, obj.base_y - 10, 32, 20);
                                        break;
                                    case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                        ctx.strokeStyle = '#fff';
                                        ctx.lineWidth = 10;
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x - 16, obj.base_y - 16);
                                        ctx.lineTo(obj.base_x + 16, obj.base_y + 16);
                                        ctx.stroke();
                                        break;
                                    case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                        ctx.strokeStyle = '#fff';
                                        ctx.lineWidth = 10;
                                        ctx.beginPath();
                                        ctx.moveTo(obj.base_x + 16, obj.base_y - 16);
                                        ctx.lineTo(obj.base_x - 16, obj.base_y + 16);
                                        ctx.stroke();
                                        break;
                                }
                            }
                            break;
                        case DOORTYPE.SECRET:
                            {
                                ctx.save();
                                ctx.textBaseline = 'middle';
                                ctx.textAlign = 'center';
                                if (is_selected) {
                                    ctx.font = '44px sans-serif';
                                    ctx.fillStyle = SELECTED_COLOR;
                                    ctx.fillText('S', obj.base_x, obj.base_y);
                                }
                                ctx.font = '36px sans-serif';
                                ctx.fillStyle = '#000';
                                ctx.fillText('S', obj.base_x, obj.base_y);
                                ctx.restore();
                            }
                            break;
                        case DOORTYPE.BRICKED_WALL:
                            {
                                if (is_selected) {
                                    ctx.strokeStyle = SELECTED_COLOR;
                                    ctx.lineWidth = 8;
                                    ctx.beginPath();
                                    switch (obj.orientation) {
                                        case ORIENTATION.VERTICAL:
                                            ctx.moveTo(obj.base_x, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x, obj.base_y + 22);
                                            break;
                                        case ORIENTATION.HORIZONTAL:
                                            ctx.moveTo(obj.base_x - 22, obj.base_y);
                                            ctx.lineTo(obj.base_x + 22, obj.base_y);
                                            break;
                                        case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                            ctx.moveTo(obj.base_x - 22, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x + 22, obj.base_y + 22);
                                            break;
                                        case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                            ctx.moveTo(obj.base_x + 22, obj.base_y - 22);
                                            ctx.lineTo(obj.base_x - 22, obj.base_y + 22);
                                            break;
                                    }
                                    ctx.stroke();
                                }
                                ctx.strokeStyle = '#ff1111';
                                ctx.lineWidth = 6;
                                ctx.beginPath();
                                switch (obj.orientation) {
                                    case ORIENTATION.VERTICAL:
                                        ctx.moveTo(obj.base_x, obj.base_y - 22);
                                        ctx.lineTo(obj.base_x, obj.base_y + 22);
                                        break;
                                    case ORIENTATION.HORIZONTAL:
                                        ctx.moveTo(obj.base_x - 22, obj.base_y);
                                        ctx.lineTo(obj.base_x + 22, obj.base_y);
                                        break;
                                    case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                        ctx.moveTo(obj.base_x - 22, obj.base_y - 22);
                                        ctx.lineTo(obj.base_x + 22, obj.base_y + 22);
                                        break;
                                    case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                        ctx.moveTo(obj.base_x + 22, obj.base_y - 22);
                                        ctx.lineTo(obj.base_x - 22, obj.base_y + 22);
                                        break;
                                }
                                ctx.stroke();
                            }
                            break;
                    }
                }
                break;
        }
    }
    if (map.selection_area.is_selecting) {
        ctx.fillStyle = '#55555555';
        ctx.fillRect(map.selection_area.x0, map.selection_area.y0, map.selection_area.x1 - map.selection_area.x0, map.selection_area.y1 - map.selection_area.y0);
    }
}
document.addEventListener('DOMContentLoaded', render);
var TOOLTYPE;
(function (TOOLTYPE) {
    TOOLTYPE["PAN"] = "Pan";
    TOOLTYPE["SELECT"] = "Select";
    TOOLTYPE["MOVE"] = "Move";
    TOOLTYPE["LINE"] = "Line";
    TOOLTYPE["WALL"] = "Wall";
    TOOLTYPE["DOOR"] = "Door";
    TOOLTYPE["RECT"] = "Rect";
    TOOLTYPE["FILLED_RECT"] = "Filled-Rect";
    TOOLTYPE["FLOOR"] = "Floor";
    TOOLTYPE["TEXT"] = "Text";
    TOOLTYPE["EZ_TOKEN"] = "Ez-Token";
    TOOLTYPE["IMAGE"] = "Image";
    TOOLTYPE["IMG_TOKEN"] = "Img-Token";
    TOOLTYPE["HELP"] = "Help";
})(TOOLTYPE || (TOOLTYPE = {}));
let current_tool = TOOLTYPE.PAN;
let color_picker = null;
let color_picker2 = null;
let tools = null;
function change_tool(toolname) {
    let prev = current_tool;
    if (!tools)
        return;
    current_tool = toolname;
    switch (toolname) {
        case TOOLTYPE.PAN:
        case TOOLTYPE.SELECT:
        case TOOLTYPE.MOVE:
            break;
        default:
            end_selecting(get_map(current_map_id));
            break;
    }
    switch (toolname) {
        case TOOLTYPE.SELECT:
            {
                numeric_hot_keys = select_numeric_hot_keys;
            }
            break;
        case TOOLTYPE.WALL:
            {
                numeric_hot_keys = wall_numeric_hot_keys;
            }
            break;
        case TOOLTYPE.DOOR:
            {
                numeric_hot_keys = door_numeric_hot_keys;
            }
            break;
        default:
            numeric_hot_keys = [];
            break;
    }
    for (let j = 0; j < tools.length - 1; ++j) {
        const tool = tools[j];
        tool.classList.remove('selected');
        if (tool.firstChild.textContent.trim() == toolname) {
            tool.classList.add('selected');
        }
    }
    if (toolname == TOOLTYPE.HELP) {
        if (prev != TOOLTYPE.HELP)
            change_tool(prev);
        make_ok_dialog(`
            <h2>Help</h2>
            <h3 style="text-align:center;">Tips</h3>
            <div style="margin:auto;max-width:36em;">
            <p>You can use <b>q</b> to switch to Wall, <b>w</b> to switch to Door and <b>e</b> to switch to Line.
            <p>You can use <b>a</b> to switch to Pan, <b>s</b> to switch to Select, <b>d</b> to switch to Move.
            <p>The <span>☰</span> means there are other options for that tool. If that tool is selected, you can use 1,2,3,etc. to switch between them.
            <p>Right-clicking on the map shows some more options
            <p>You can cut, copy, paste things on the map.
            <h3 style="text-align:center;">Tools</h3>
            </div>
            <table id="help-menu">
                <tr>
                    <td>Pan
                    <td>Allows you to click to drag where you are on the map.
                </tr>
                <tr>
                    <td>Select
                    <td>Select things. Select modes change what you can select.
                </tr>
                <tr>
                    <td>Move
                    <td>Allows you to click to drag to move things that are selected.
                </tr>
                <tr>
                    <td>Wall
                    <td>Allows you to draw walls. Click and drag between corners of the grid.
                </tr>
                <tr>
                    <td>Door
                    <td>Allows you to draw doors. Click and drag between corners of the grid. Do this over walls.
                </tr>
                <tr>
                    <td>Line
                    <td>A freehand line.
                </tr>
                <tr>
                    <td>Rect
                    <td>A freehand rectangle, not filled in. Border is primary color.
                </tr>
                <tr>
                    <td>Filled-Rect
                    <td>A freehand rectangle, filled in. Border is primary color, filling is secondary..
                </tr>
                <tr>
                    <td>Floor
                    <td>A rectangle that snaps to grid and is semi-transparent. Uses primary color.
                </tr>
                <tr>
                    <td>Text
                    <td>Allows you to type in some text. Snaps to the center of the square at first, but you can move it to wherever.
                </tr>
                <tr>
                    <td>Ez-Token
                    <td>Allows you to make a simple token with a label.
                </tr>
                <tr>
                    <td>Img-Token
                    <td>Allows you to make a token with an image from a url.
                </tr>
                <tr>
                    <td>Image
                    <td>Allows you to place an image from a url.
                </tr>

            </table>
                   `, function (unused) { });
    }
}
let select_numeric_hot_keys = [];
let wall_numeric_hot_keys = [];
let door_numeric_hot_keys = [];
document.addEventListener('DOMContentLoaded', function () {
    const tools_div = document.getElementById('tools');
    tools = tools_div.children;
    color_picker = document.getElementById('color-picker');
    color_picker2 = document.getElementById('color-picker2');
    for (let i = 0; i < tools.length - 1; ++i) {
        const tool = tools[i];
        tool.addEventListener('click', function (e) {
            e.stopPropagation();
            e.preventDefault();
            const toolname = tool.firstChild.textContent.trim();
            change_tool(toolname);
        });
        if (tool.firstChild.textContent.trim() == 'Select') {
            let has_menu = false;
            const name = tool.getElementsByTagName('span')[0];
            const map = get_map(current_map_id);
            switch (map.selection_area.select_type) {
                case SELECTTYPE.ANY:
                    name.innerText = 'Any';
                    break;
                case SELECTTYPE.MAP:
                    name.innerText = 'Map';
                    break;
                case SELECTTYPE.TOKEN:
                    name.innerText = 'Token';
                    break;
            }
            select_numeric_hot_keys = [
                function () {
                    const map = get_map(current_map_id);
                    name.innerText = 'Any';
                    change_select_mode(map, SELECTTYPE.ANY);
                },
                function () {
                    const map = get_map(current_map_id);
                    name.innerText = 'Map';
                    change_select_mode(map, SELECTTYPE.MAP);
                },
                function () {
                    const map = get_map(current_map_id);
                    name.innerText = 'Token';
                    change_select_mode(map, SELECTTYPE.TOKEN);
                },
            ];
            const triangle = tool.getElementsByTagName('span')[1];
            triangle.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (has_menu)
                    return;
                has_menu = true;
                const trimenu = document.createElement('section');
                trimenu.classList.add('menu');
                trimenu.style.left = e.clientX + 'px';
                const window_height = window.innerHeight;
                trimenu.style.bottom = (window_height - e.clientY) + 'px';
                function close_select_menu(e) {
                    if (e) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                    document.body.removeChild(trimenu);
                    canvas.removeEventListener('mousedown', close_select_menu);
                    has_menu = false;
                }
                const options = [
                    {
                        func: function (e) {
                            e.stopPropagation();
                            e.preventDefault();
                            name.innerText = 'Any';
                            change_tool(TOOLTYPE.SELECT);
                            const map = get_map(current_map_id);
                            change_select_mode(map, SELECTTYPE.ANY);
                            close_select_menu();
                        },
                        text: 'Any',
                    },
                    {
                        func: function (e) {
                            e.stopPropagation();
                            e.preventDefault();
                            change_tool(TOOLTYPE.SELECT);
                            name.innerText = 'Map';
                            const map = get_map(current_map_id);
                            change_select_mode(map, SELECTTYPE.MAP);
                            close_select_menu();
                        },
                        text: 'Map',
                    },
                    {
                        func: function (e) {
                            e.stopPropagation();
                            e.preventDefault();
                            change_tool(TOOLTYPE.SELECT);
                            name.innerText = 'Token';
                            const map = get_map(current_map_id);
                            change_select_mode(map, SELECTTYPE.TOKEN);
                            close_select_menu();
                        },
                        text: 'Token',
                    },
                ];
                for (let i = 0; i < options.length; ++i) {
                    const option = options[i];
                    const s = document.createElement('section');
                    s.classList.add('menuitem');
                    const text = document.createTextNode(option.text);
                    s.appendChild(text);
                    s.addEventListener('mousedown', option.func);
                    trimenu.appendChild(s);
                }
                document.body.appendChild(trimenu);
                canvas.addEventListener('mousedown', close_select_menu);
            });
        }
        if (tool.firstChild.textContent.trim() == 'Door') {
            let has_menu = false;
            const name = tool.getElementsByTagName('span')[0];
            function change_door(doortype) {
                current_door = doortype;
                switch (current_door) {
                    case DOORTYPE.DOOR:
                        name.innerText = ' - Door';
                        break;
                    case DOORTYPE.DOUBLE:
                        name.innerText = '- Double';
                        break;
                    case DOORTYPE.SECRET:
                        name.innerText = '- Secret';
                        break;
                    case DOORTYPE.BRICKED_WALL:
                        name.innerText = '- Bricks';
                        break;
                    case DOORTYPE.PORTAL:
                        name.innerText = '- Portal';
                        break;
                    case DOORTYPE.PORTCULLIS:
                        name.innerText = '- Portcullis';
                        break;
                }
            }
            change_door(DOORTYPE.DOOR);
            door_numeric_hot_keys = [
                function () { change_door(DOORTYPE.DOOR); },
                function () { change_door(DOORTYPE.SECRET); },
                function () { change_door(DOORTYPE.BRICKED_WALL); },
                function () { change_door(DOORTYPE.PORTAL); },
                function () { change_door(DOORTYPE.DOUBLE); },
                function () { change_door(DOORTYPE.PORTCULLIS); },
            ];
            const triangle = tool.getElementsByTagName('span')[1];
            triangle.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (has_menu)
                    return;
                has_menu = true;
                const trimenu = document.createElement('section');
                trimenu.classList.add('menu');
                trimenu.style.left = e.clientX + 'px';
                const window_height = window.innerHeight;
                trimenu.style.bottom = (window_height - e.clientY) + 'px';
                function close_menu(e) {
                    if (e) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                    document.body.removeChild(trimenu);
                    canvas.removeEventListener('mousedown', close_menu);
                    has_menu = false;
                }
                function make_cb(dt) {
                    function cb(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        change_tool(TOOLTYPE.DOOR);
                        change_door(dt);
                        close_menu();
                    }
                    return cb;
                }
                const options = [
                    { doortype: DOORTYPE.DOOR, text: 'Door', },
                    { doortype: DOORTYPE.SECRET, text: 'Secret Door', },
                    { doortype: DOORTYPE.BRICKED_WALL, text: 'Bricked Wall', },
                    { doortype: DOORTYPE.PORTAL, text: 'Portal', },
                    { doortype: DOORTYPE.DOUBLE, text: 'Double Door', },
                    { doortype: DOORTYPE.PORTCULLIS, text: 'Portcullis', },
                ];
                for (let i = 0; i < options.length; ++i) {
                    const option = options[i];
                    const s = document.createElement('section');
                    s.classList.add('menuitem');
                    const text = document.createTextNode(option.text);
                    s.appendChild(text);
                    s.addEventListener('mousedown', make_cb(option.doortype));
                    trimenu.appendChild(s);
                }
                document.body.appendChild(trimenu);
                canvas.addEventListener('mousedown', close_menu);
            });
        }
        if (tool.firstChild.textContent.trim() == 'Wall') {
            let has_menu = false;
            const name = tool.getElementsByTagName('span')[0];
            function change_wall(on_the_half) {
                walls_snap_to_half_grid = on_the_half;
                if (on_the_half) {
                    name.innerText = "- 5'";
                }
                else {
                    name.innerText = "- 10'";
                }
            }
            change_wall(false);
            wall_numeric_hot_keys.push(function () { change_wall(false); });
            wall_numeric_hot_keys.push(function () { change_wall(true); });
            const triangle = tool.getElementsByTagName('span')[1];
            triangle.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                if (has_menu)
                    return;
                has_menu = true;
                const trimenu = document.createElement('section');
                trimenu.classList.add('menu');
                trimenu.style.left = e.clientX + 'px';
                const window_height = window.innerHeight;
                trimenu.style.bottom = (window_height - e.clientY) + 'px';
                function close_menu(e) {
                    if (e) {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                    document.body.removeChild(trimenu);
                    canvas.removeEventListener('mousedown', close_menu);
                    has_menu = false;
                }
                function make_cb(on_the_half) {
                    function cb(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        change_tool(TOOLTYPE.WALL);
                        change_wall(on_the_half);
                        close_menu();
                    }
                    return cb;
                }
                const options = [
                    { on_the_half: false, text: "10' Grid" },
                    { on_the_half: true, text: "5' Grid" },
                ];
                for (let i = 0; i < options.length; ++i) {
                    const option = options[i];
                    const s = document.createElement('section');
                    s.classList.add('menuitem');
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
    change_tool(TOOLTYPE.PAN);
});
function get_session_id_from_obj_id(objid) {
    let id = objid >> 20;
    return id;
}
let numeric_hot_keys = [];
document.addEventListener('DOMContentLoaded', function () {
    canvas = document.getElementsByTagName('canvas')[0];
    canvas.addEventListener('wheel', function (e) {
        e.stopPropagation();
        e.preventDefault();
        const map = get_map(current_map_id);
        const oldscale = map.scale;
        let dy = e.deltaY;
        const dscale = 120;
        if (dy > dscale)
            dy = dscale;
        if (dy < -dscale)
            dy = -dscale;
        map.scale *= 1 + (-dy / dscale);
        map.scale = clamp_scale(map.scale);
        map.camera_x -= e.offsetX / oldscale;
        map.camera_x += e.offsetX / map.scale;
        map.camera_y -= e.offsetY / oldscale;
        map.camera_y += e.offsetY / map.scale;
        map.camera_x = Math.round(map.camera_x);
        map.camera_y = Math.round(map.camera_y);
        request_render();
    });
    window.addEventListener('keydown', function (e) {
        if (document.activeElement !== document.body)
            return;
        const ctrl_or_cmd_is_pressed = e.ctrlKey || e.metaKey;
        const other_modifiers = e.altKey || e.shiftKey;
        const shortcut = ctrl_or_cmd_is_pressed && !other_modifiers;
        const map = get_map(current_map_id);
        switch (e.key) {
            case 'ArrowLeft':
                {
                    map.camera_x += 256;
                    request_render();
                }
                break;
            case 'ArrowRight':
                {
                    map.camera_x -= 256;
                    request_render();
                }
                break;
            case 'ArrowUp':
                {
                    map.camera_y += 256;
                    request_render();
                }
                break;
            case 'ArrowDown':
                {
                    map.camera_y -= 256;
                    request_render();
                }
                break;
            case 'Escape':
                {
                    map.selected.clear();
                    request_render();
                }
                break;
            case 'Backspace':
            case 'Delete':
                {
                    for (let item of map.selected) {
                        map.canvas_objs.get(item).flags |= CANVASFLAG.DELETED;
                    }
                    publish_delete_by_ids(map.map_id, Array.from(map.selected));
                    note_delete_by_ids_for_undo(map, Array.from(map.selected));
                    end_selecting(map);
                }
                break;
            case 'a':
                change_tool(TOOLTYPE.PAN);
                break;
            case 's':
                change_tool(TOOLTYPE.SELECT);
                break;
            case 'd':
                change_tool(TOOLTYPE.MOVE);
                break;
            case 'q':
                change_tool(TOOLTYPE.WALL);
                break;
            case 'w':
                change_tool(TOOLTYPE.DOOR);
                break;
            case 'e':
                change_tool(TOOLTYPE.LINE);
                break;
            case 'f':
                change_tool(TOOLTYPE.RECT);
                break;
            case 'g':
                change_tool(TOOLTYPE.FILLED_RECT);
                break;
            case 'h':
                change_tool(TOOLTYPE.FLOOR);
                break;
            case 'y':
                if (shortcut) {
                    do_one_redo(map);
                }
                else {
                    return;
                }
                break;
            case 'z':
                if (shortcut) {
                    do_one_undo(map);
                }
                break;
            case 'x':
                if (shortcut) {
                    if (map.selected.size !== 0) {
                        clear_copy_buffer();
                        cut_selected_objs_to_copy_buffer(map);
                    }
                }
                break;
            case 'c':
                if (shortcut) {
                    if (map.selected.size !== 0) {
                        clear_copy_buffer();
                        copy_selected_objs_to_copy_buffer(map);
                    }
                }
                break;
            case 'v':
                if (shortcut) {
                    if (copied_objs.length) {
                        const x = canvas.width / 4 / map.scale - map.camera_x;
                        const y = canvas.height / 4 / map.scale - map.camera_y;
                        paste_from_copy_buffer_at(map, x, y);
                    }
                    break;
                }
                break;
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
                if (!ctrl_or_cmd_is_pressed && !other_modifiers) {
                    const i = (+e.key) - 1;
                    if (i < numeric_hot_keys.length) {
                        numeric_hot_keys[i]();
                        break;
                    }
                }
                return;
            default:
                return;
        }
        e.stopPropagation();
        e.preventDefault();
    });
    let prev_tool = TOOLTYPE.PAN;
    let ctxmenu_is_active = 0;
    let ez_token_color = '#ff3333';
    canvas.addEventListener('mousedown', function (e) {
        if (e.button !== 0 && e.button !== 1) {
            return;
        }
        let map = get_map(current_map_id);
        if (ctxmenu_is_active !== 0)
            return;
        e.stopPropagation();
        e.preventDefault();
        if (e.button === 1) {
            prev_tool = current_tool;
            current_tool = TOOLTYPE.PAN;
        }
        switch (current_tool) {
            case TOOLTYPE.SELECT:
                {
                    let clicked_x = e.offsetX / map.scale - map.camera_x;
                    let clicked_y = e.offsetY / map.scale - map.camera_y;
                    map.selection_area.is_selecting = true;
                    update_selection(map, clicked_x - 5 / map.scale, clicked_y - 5 / map.scale, clicked_x + 5 / map.scale, clicked_y + 5 / map.scale);
                    request_render();
                    function select(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        let select_x = e.offsetX / map.scale - map.camera_x;
                        let select_y = e.offsetY / map.scale - map.camera_y;
                        update_selection(map, clicked_x, clicked_y, select_x, select_y);
                        request_render();
                    }
                    canvas.addEventListener('mousemove', select);
                    function finish_select() {
                        finalize_selection(map);
                        canvas.removeEventListener('mousemove', select);
                        window.removeEventListener('mouseup', finish_select);
                        canvas.removeEventListener('mouseleave', finish_select);
                    }
                    window.addEventListener('mouseup', finish_select);
                    canvas.addEventListener('mouseleave', finish_select);
                }
                break;
            case TOOLTYPE.MOVE:
                {
                    if (!map.selected.size)
                        return;
                    let clicked_x = e.offsetX / map.scale - map.camera_x;
                    let clicked_y = e.offsetY / map.scale - map.camera_y;
                    let rawclick_x = e.offsetX;
                    let rawclick_y = e.offsetY;
                    let changed = false;
                    const before_update = get_stripped_state_by_id(map, Array.from(map.selected));
                    function move(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        const diff = Math.abs(e.offsetX - rawclick_x) + Math.abs(e.offsetY - rawclick_y);
                        if (diff < 2)
                            return;
                        let move_x = e.offsetX / map.scale - map.camera_x;
                        let move_y = e.offsetY / map.scale - map.camera_y;
                        changed = true;
                        let new_coords = move_selected_objects(map, clicked_x, clicked_y, move_x - clicked_x, move_y - clicked_y);
                        clicked_x = new_coords[0];
                        clicked_y = new_coords[1];
                        ;
                    }
                    canvas.addEventListener('mousemove', move);
                    function finish_move() {
                        canvas.removeEventListener('mousemove', move);
                        window.removeEventListener('mouseup', finish_move);
                        canvas.removeEventListener('mouseleave', finish_move);
                        if (!changed)
                            return;
                        const after_update = get_stripped_state_by_id(map, Array.from(map.selected));
                        publish_obj_updates(map.map_id, after_update);
                        note_updates_for_undo(map, before_update, after_update);
                    }
                    window.addEventListener('mouseup', finish_move);
                    canvas.addEventListener('mouseleave', finish_move);
                }
                break;
            case TOOLTYPE.PAN:
                {
                    let clicked_x = e.offsetX / map.scale;
                    let clicked_y = e.offsetY / map.scale;
                    function pan(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        let pan_x = e.offsetX / map.scale;
                        let pan_y = e.offsetY / map.scale;
                        map.camera_x -= clicked_x - pan_x;
                        map.camera_y -= clicked_y - pan_y;
                        clicked_x = pan_x;
                        clicked_y = pan_y;
                        request_render();
                    }
                    canvas.addEventListener('mousemove', pan);
                    function finish_pan() {
                        if (prev_tool) {
                            current_tool = prev_tool;
                            prev_tool = TOOLTYPE.PAN;
                        }
                        canvas.removeEventListener('mousemove', pan);
                        window.removeEventListener('mouseup', finish_pan);
                        canvas.removeEventListener('mouseleave', finish_pan);
                    }
                    window.addEventListener('mouseup', finish_pan);
                    canvas.addEventListener('mouseleave', finish_pan);
                }
                break;
            case TOOLTYPE.LINE:
                {
                    let id = get_new_id();
                    add_freehand_line(map, id, e.offsetX / map.scale - map.camera_x, e.offsetY / map.scale - map.camera_y, color_picker.value);
                    function add_point(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        add_freehand_point_by_id(map, id, e.offsetX / map.scale - map.camera_x, e.offsetY / map.scale - map.camera_y);
                        request_render();
                    }
                    canvas.addEventListener('mousemove', add_point);
                    function finish_point() {
                        canvas.removeEventListener('mousemove', add_point);
                        window.removeEventListener('mouseup', finish_point);
                        canvas.removeEventListener('mouseleave', finish_point);
                        publish_obj_by_id(map, id);
                        note_create_by_id_for_undo(map, id);
                    }
                    window.addEventListener('mouseup', finish_point);
                    canvas.addEventListener('mouseleave', finish_point);
                }
                break;
            case TOOLTYPE.WALL:
                {
                    let id = get_new_id();
                    add_gridline(map, id, e.offsetX / map.scale - map.camera_x, e.offsetY / map.scale - map.camera_y, color_picker.value);
                    function add_point(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        add_gridline_point_by_id(map, id, e.offsetX / map.scale - map.camera_x, e.offsetY / map.scale - map.camera_y);
                        request_render();
                    }
                    canvas.addEventListener('mousemove', add_point);
                    function finish_point() {
                        canvas.removeEventListener('mousemove', add_point);
                        window.removeEventListener('mouseup', finish_point);
                        canvas.removeEventListener('mouseleave', finish_point);
                        publish_obj_by_id(map, id);
                        note_create_by_id_for_undo(map, id);
                    }
                    window.addEventListener('mouseup', finish_point);
                    canvas.addEventListener('mouseleave', finish_point);
                }
                break;
            case TOOLTYPE.DOOR:
                {
                    let x0 = snap_to_grid(e.offsetX / map.scale - map.camera_x);
                    let y0 = snap_to_grid(e.offsetY / map.scale - map.camera_y);
                    let x1 = x0;
                    let y1 = y0;
                    function change_point(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        x1 = snap_to_grid(e.offsetX / map.scale - map.camera_x);
                        y1 = snap_to_grid(e.offsetY / map.scale - map.camera_y);
                        if (x1 > x0 + REFERENCE_WIDTH)
                            x1 = x0 + REFERENCE_WIDTH;
                        if (x1 < x0 - REFERENCE_WIDTH)
                            x1 = x0 - REFERENCE_WIDTH;
                        if (y1 > y0 + REFERENCE_WIDTH)
                            y1 = y0 + REFERENCE_WIDTH;
                        if (y1 < y0 - REFERENCE_WIDTH)
                            y1 = y0 - REFERENCE_WIDTH;
                    }
                    canvas.addEventListener('mousemove', change_point);
                    function finish_door() {
                        canvas.removeEventListener('mousemove', change_point);
                        window.removeEventListener('mouseup', finish_door);
                        canvas.removeEventListener('mouseleave', finish_door);
                        if (x0 !== x1 || y0 !== y1) {
                            let id = get_new_id();
                            let orientation;
                            if (y1 === y0) {
                                orientation = ORIENTATION.HORIZONTAL;
                            }
                            else if (x1 == x0) {
                                orientation = ORIENTATION.VERTICAL;
                            }
                            else if ((x1 < x0 && y1 < y0) || (x1 > x0 && y1 > y0)) {
                                orientation = ORIENTATION.TOPLEFT_DOWNRIGHT;
                            }
                            else {
                                orientation = ORIENTATION.TOPRIGHT_DOWNLEFT;
                            }
                            let x = ((x0 + x1) / 2) | 0;
                            let y = ((y0 + y1) / 2) | 0;
                            add_door(map, id, x, y, current_door, color_picker.value, orientation);
                            publish_obj_by_id(map, id);
                            note_create_by_id_for_undo(map, id);
                            request_render();
                        }
                    }
                    window.addEventListener('mouseup', finish_door);
                    canvas.addEventListener('mouseleave', finish_door);
                }
                break;
            case TOOLTYPE.FLOOR:
                {
                    let id = get_new_id();
                    const x0 = e.offsetX / map.scale - map.camera_x;
                    const y0 = e.offsetY / map.scale - map.camera_y;
                    add_gridrect(map, id, x0, y0, color_picker.value);
                    function add_point(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        change_gridrect_by_id(map, id, e.offsetX / map.scale - map.camera_x, e.offsetY / map.scale - map.camera_y, x0, y0);
                        request_render();
                    }
                    canvas.addEventListener('mousemove', add_point);
                    function finish_point() {
                        canvas.removeEventListener('mousemove', add_point);
                        window.removeEventListener('mouseup', finish_point);
                        canvas.removeEventListener('mouseleave', finish_point);
                        publish_obj_by_id(map, id);
                        note_create_by_id_for_undo(map, id);
                    }
                    window.addEventListener('mouseup', finish_point);
                    canvas.addEventListener('mouseleave', finish_point);
                }
                break;
            case TOOLTYPE.RECT:
                {
                    let id = get_new_id();
                    const x0 = e.offsetX / map.scale - map.camera_x;
                    const y0 = e.offsetY / map.scale - map.camera_y;
                    add_rect(map, id, x0, y0, color_picker.value);
                    function add_point(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        change_rect_by_id(map, id, e.offsetX / map.scale - map.camera_x, e.offsetY / map.scale - map.camera_y, x0, y0);
                        request_render();
                    }
                    canvas.addEventListener('mousemove', add_point);
                    function finish_point() {
                        canvas.removeEventListener('mousemove', add_point);
                        window.removeEventListener('mouseup', finish_point);
                        canvas.removeEventListener('mouseleave', finish_point);
                        publish_obj_by_id(map, id);
                        note_create_by_id_for_undo(map, id);
                    }
                    window.addEventListener('mouseup', finish_point);
                    canvas.addEventListener('mouseleave', finish_point);
                }
                break;
            case TOOLTYPE.FILLED_RECT:
                {
                    let id = get_new_id();
                    const x0 = e.offsetX / map.scale - map.camera_x;
                    const y0 = e.offsetY / map.scale - map.camera_y;
                    add_filled_rect(map, id, x0, y0, color_picker.value, color_picker2.value);
                    function add_point(e) {
                        e.stopPropagation();
                        e.preventDefault();
                        change_filled_rect_by_id(map, id, e.offsetX / map.scale - map.camera_x, e.offsetY / map.scale - map.camera_y, x0, y0);
                        request_render();
                    }
                    canvas.addEventListener('mousemove', add_point);
                    function finish_point() {
                        canvas.removeEventListener('mousemove', add_point);
                        window.removeEventListener('mouseup', finish_point);
                        canvas.removeEventListener('mouseleave', finish_point);
                        publish_obj_by_id(map, id);
                        note_create_by_id_for_undo(map, id);
                    }
                    window.addEventListener('mouseup', finish_point);
                    canvas.addEventListener('mouseleave', finish_point);
                }
                break;
            case TOOLTYPE.TEXT:
                {
                    const x0 = e.offsetX / map.scale - map.camera_x;
                    const y0 = e.offsetY / map.scale - map.camera_y;
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
                    make_ok_dialog(html, function (hoverpop) {
                        const text_input = document.getElementById('hover-text');
                        const text = text_input.value;
                        if (!text || !text.trim())
                            return;
                        const size_el = document.getElementById('text-size');
                        const size = (+size_el.value) | 0;
                        if (size < 8)
                            return;
                        if (size > 72)
                            return;
                        let id = get_new_id();
                        add_text(map, id, x0, y0, text, size);
                        publish_obj_by_id(map, id);
                        note_create_by_id_for_undo(map, id);
                        request_render();
                    });
                }
                break;
            case TOOLTYPE.IMAGE:
                {
                    const x0 = e.offsetX / map.scale - map.camera_x;
                    const y0 = e.offsetY / map.scale - map.camera_y;
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
                    make_ok_dialog(html, function (hoverpop) {
                        const text = document.getElementById('hover-url').value;
                        if (!text || !text.trim()) {
                            return;
                        }
                        let width = +document.getElementById('hover-width').value;
                        let height = +document.getElementById('hover-height').value;
                        if (!width)
                            width = 0;
                        if (!height)
                            height = 0;
                        const round = document.getElementById('hover-checkbox').checked;
                        if (round) {
                            width = snap_to_grid(width);
                            height = snap_to_grid(height);
                        }
                        let id = get_new_id();
                        add_image(map, id, x0, y0, width, height, text);
                        publish_obj_by_id(map, id);
                        note_create_by_id_for_undo(map, id);
                        request_render();
                    });
                }
                break;
            case TOOLTYPE.EZ_TOKEN:
                {
                    const x0 = e.offsetX / map.scale - map.camera_x;
                    const y0 = e.offsetY / map.scale - map.camera_y;
                    const html = `
                    <h2>Enter Token</h2>
                    <table class="input-container">
                        <tr>
                            <td><label for="color">Color:</label>
                            <td><input type="color" id="hover-color" value="` + ez_token_color + `">
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
                    make_ok_dialog(html, function (hoverpop) {
                        const text_input = document.getElementById('hover-text');
                        const text = text_input.value;
                        if (!text || !text.trim())
                            return;
                        let width = +document.getElementById('hover-width').value;
                        let height = +document.getElementById('hover-height').value;
                        if (!width)
                            width = 1;
                        if (!height)
                            height = 1;
                        let id = get_new_id();
                        ez_token_color = document.getElementById('hover-color').value;
                        add_ez_token(map, id, x0, y0, text, ez_token_color, width, height);
                        publish_obj_by_id(map, id);
                        note_create_by_id_for_undo(map, id);
                        request_render();
                    });
                }
                break;
            case TOOLTYPE.IMG_TOKEN:
                {
                    const x0 = e.offsetX / map.scale - map.camera_x;
                    const y0 = e.offsetY / map.scale - map.camera_y;
                    const html = `
                    <h2>Enter Image</h2>
                    <table class="input-container">
                        <tr>
                            <td><label for="url">Token Image URL:</label>
                            <td><input type="url" name="url" id="hover-url" value="">
                        </tr>
                    </table>
                `;
                    make_ok_dialog(html, function (hoverpop) {
                        const text = document.getElementById('hover-url').value;
                        if (!text || !text.trim()) {
                            return;
                        }
                        let id = get_new_id();
                        add_img_token(map, id, x0, y0, text);
                        publish_obj_by_id(map, id);
                        note_create_by_id_for_undo(map, id);
                        request_render();
                    });
                }
                break;
            default:
                {
                    console.log('unknown tool:', current_tool);
                }
                break;
        }
    });
    canvas.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        ctxmenu_is_active++;
        const ctxmenu = document.createElement('section');
        ctxmenu.classList.add('menu');
        ctxmenu.style.left = e.clientX + 'px';
        ctxmenu.style.top = e.clientY + 'px';
        const map = get_map(current_map_id);
        const x = e.offsetX / map.scale - map.camera_x - canvas.width / 2 / map.scale;
        const y = e.offsetY / map.scale - map.camera_y - canvas.height / 2 / map.scale;
        const click_x = e.offsetX / map.scale - map.camera_x;
        const click_y = e.offsetY / map.scale - map.camera_y;
        function remove_menu(e) {
            canvas.removeEventListener('mousedown', remove_menu);
            document.body.removeChild(ctxmenu);
            ctxmenu_is_active--;
            if (e) {
                e.stopPropagation();
                e.preventDefault();
            }
        }
        canvas.addEventListener('mousedown', remove_menu);
        const items = [
            {
                label: 'Zoom In',
                func: function () { zoom_in(map); remove_menu(); },
                disabled: false,
            },
            {
                label: 'Zoom Out',
                func: function () { zoom_out(map); remove_menu(); },
                disabled: false,
            },
            {
                label: 'Reset Zoom',
                func: function () { reset_zoom(map); remove_menu(); },
                disabled: false,
            },
            {
                label: 'Gather Party',
                func: function () { socket.emit('canvas-gather', { x: -x, y: -y, map_id: map.map_id }); remove_menu(); },
                disabled: false,
            },
            {
                label: 'Edit',
                func: function () {
                    launch_edit_dialog(map);
                    remove_menu();
                },
                disabled: edit_is_impossible(map),
            },
            {
                label: 'Undo',
                func: function () {
                    do_one_undo(map);
                    remove_menu();
                },
                disabled: undo_is_impossible(map),
            },
            {
                label: 'Redo',
                func: function () {
                    do_one_redo(map);
                    remove_menu();
                },
                disabled: redo_is_impossible(map),
            },
            {
                label: 'Cut',
                func: function () {
                    clear_copy_buffer();
                    cut_selected_objs_to_copy_buffer(map);
                    remove_menu();
                },
                disabled: map.selected.size === 0,
            },
            {
                label: 'Copy',
                func: function () {
                    clear_copy_buffer();
                    copy_selected_objs_to_copy_buffer(map);
                    remove_menu();
                },
                disabled: map.selected.size === 0,
            },
            {
                label: 'Paste',
                func: function () {
                    paste_from_copy_buffer_at(map, click_x, click_y);
                    remove_menu();
                },
                disabled: copied_objs.length === 0,
            },
            {
                label: 'Cancel',
                func: function () { remove_menu(); },
                disabled: false,
            },
        ];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const menuitem = document.createElement('section');
            menuitem.classList.add('menuitem');
            if (item.disabled) {
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
function make_ok_dialog(html, on_ok) {
    if (hover_is_open)
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
    function remove_hoverpop() {
        document.body.removeChild(hoverpop);
        hover_is_open = false;
    }
    const ok = document.getElementById('hoverpop-ok');
    function submit() {
        on_ok(hoverpop);
        remove_hoverpop();
    }
    ok.addEventListener('click', function () {
        submit();
    });
    const cancel = document.getElementById('hoverpop-cancel');
    cancel.addEventListener('click', function () {
        remove_hoverpop();
    });
    const text_inputs = hoverpop.getElementsByTagName('input');
    let did_focus = false;
    ;
    for (let i = 0; i < text_inputs.length; i++) {
        const text_input = text_inputs[i];
        if (text_input.type == 'text' || text_input.type == 'url') {
            if (!did_focus) {
                text_input.focus();
                did_focus = true;
            }
            text_input.addEventListener('keydown', function (e) {
                let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
                if (!modified && e.key == "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    ok.click();
                }
            });
        }
    }
}
function add_map_tab(map_id) {
    const new_tab = document.createElement('div');
    new_tab.appendChild(document.createTextNode("" + map_id));
    const top = document.getElementById('top');
    const new_map = document.getElementById('new-map');
    top.insertBefore(new_tab, new_map);
    new_tab.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        change_map(map_id);
    });
}
document.addEventListener('DOMContentLoaded', function () {
    const new_map = document.getElementById('new-map');
    new_map.addEventListener('click', function (e) {
        let max = current_map_id;
        for (let k of MAPS.keys()) {
            k |= 0;
            if (k > max)
                max = k;
        }
        get_map(max + 1);
        e.stopPropagation();
        e.preventDefault();
    });
});

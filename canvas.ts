interface Bbox {
    // These are relative to some base_x, base_y.
    x0: number;
    x1: number;
    y0: number;
    y1: number;
}
// Note, for this function, make sure the bboxes have been adjusted
// to the same frame of reference.
function bbox_overlaps(bbox1:Bbox, bbox2:Bbox){
    const x0 = Math.max(bbox1.x0, bbox2.x0);
    const y0 = Math.max(bbox1.y0, bbox2.y0);
    const x1 = Math.min(bbox1.x1, bbox2.x1);
    const y1 = Math.min(bbox1.y1, bbox2.y1);
    return x0 <= x1 && y0 <= y1;
}
function point_in_rect(x:number, y:number, x0:number, y0:number, x1:number, y1:number):boolean{
    return (x >= x0) && (x <= x1) && (y >= y0) && (y <= y1);
}
function line_overlaps_bbox(bbox:Bbox, x0:number, y0:number, x1:number, y1:number):boolean{
    // equation for the segment: F(x y) = (y1-y0)*x + (x0-x1)*y + (x1*y0-x0*y1)
    // rewrite to Ax+By+C
    // TODO: test this.
    {
        const temp_bbox = {
            x0: x0, x1: x1, y0: y0, y1:y1,
        };
        if(temp_bbox.x0 > temp_bbox.x1){
            temp_bbox.x0 = x1;
            temp_bbox.x1 = x0;
        }
        if(temp_bbox.y0 > temp_bbox.y1){
            temp_bbox.y0 = y1;
            temp_bbox.y1 = y0;
        }
        if(!bbox_overlaps(bbox, temp_bbox))
            return false;
    }
    const A = y1-y0;
    const B = x0-x1;
    const C = x1*y0-x0*y1;
    const tl = A*bbox.x0 + B*bbox.y0+C;
    const tr = A*bbox.x1 + B*bbox.y0+C;
    const bl = A*bbox.x0 + B*bbox.y1+C;
    const br = A*bbox.x1 + B*bbox.y1+C;
    if(!tl || !tr || !bl || !br)
        return true; // point is on a corner;
    if(tl < 0 && tr < 0 && bl < 0 && br < 0)
        return false;
    if(tl > 0 && tr > 0 && bl > 0 && br > 0)
        return false;
    return true;
}

//
//  Canvas Obj Types
//  ================
enum CANVASTYPE {
    FREEHAND_LINE =  1,
    GRID_LINE     =  2,
    RECT          =  3,
    GRID_RECT     =  4,
    FILLED_RECT   =  5,
    ELLIPSE       =  6,
    IMAGE         =  7,
    TEXT          =  8,
    EZ_TOKEN      =  9,
    IMG_TOKEN     = 10,
    DOOR          = 11,
    STAIRS        = 12,
    MEASURE       = 13,
    FIXTURE       = 14,
    FILLED_TILE   = 15,
}
// High numbers go on top.
const SORTORDER = [
    9999, // Nothing
       5, // FREEHAND_LINE
       3, // GRID_LINE
       3, // RECT
       2, // GRID_RECT
       4, // FILLED_RECT
       3, // ELLIPSE
       1, // IMAGE
       5, // TEXT
       5, // EZ_TOKEN
       5, // IMG_TOKEN
       4, // DOOR
       4, // STAIRS
     100, // MEASURE
       4, // FIXTURE
       1, // FILLED_TILE
];
//
// flags
enum CANVASFLAG {
    NONE = 0,
    DELETED = 1 << 0,
    ALL = NONE | DELETED,
}
//
// Base of all objects and then the rest of the fields are different.
// Essentially, they are tagged unions.
//
// This interface is implicit as it is the
// intersection of all the canvas objects.
// interface CanvasObject {
//     type: CANVASTYPE;
//     id: number;
//     base_x: number;
//     base_y: number;
//     flags: CANVASFLAG;
// }
//
//  Additionally, each object also has a "stripped" representation, which is
//  the minimal amount of information for that object. For several types
//  this is the same as the regular one, but for others the unstripped
//  representation would include things like an HTMLImageElement.
//  Furthermore, the "stripped" representation can be converted to and from json,
//  so it can be shipped to and from the server.
//

//  freehand-line
//  -------------
//  Freehand lines are a bag of sequenced points that are
//  interpolated together with quadratic curves.
//  The server can optimize the lines by removing redundant
//  points.
type FreehandLine = {
    type: CANVASTYPE; // FREEHAND_LINE
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    color: string;
    // points are just raw x,y pairs in a flat array.
    points: Array<number>;
    path?: Path2D;
    bbox: Bbox;
    thickness: number;
}
type StrippedFreehandLine = {
    type: CANVASTYPE; // FREEHAND_LINE
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    color: string;
    // points are just raw x,y pairs in a flat array.
    points: Array<number>;
    thickness: number;
}
//  grid-line
//  ---------
//  A grid line are straight line-fragments whose points snap
//  to the corners of the grid.
//  Optimizing the points array is easy.
//  When moving this object, movements need to snap to the closest
//  grid point. When moving multiple objects, all of them need to snap
//  this way so that their relative positions are maintained.
type GridLine = {
    type: CANVASTYPE; // GRID_LINE
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    color: string;
    // points are just raw x,y pairs in a flat array.
    points: Array<number>;
    path?: Path2D;
    bbox: Bbox;
}
type StrippedGridLine = {
    type: CANVASTYPE; // GRID_LINE
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    color: string;
    // points are just raw x,y pairs in a flat array.
    points: Array<number>;
}
//  rectangle
//  ---------
//  An axis-aligned box.
//  base_x and base_y is the top-left corner of the box.
type Rectangle = {
    type: CANVASTYPE; // RECT
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    color: string;
    width: number;
    height: number;
}
// Stripped rectangles are the same as regular Rectangle.
type StrippedRectangle = Rectangle;

//  filled-rectangle
//  ---------
//  An axis-aligned box, but the center is filled with 'color2'
//  base_x and base_y is the top-left corner of the box.
type FilledRectangle = {
    type: CANVASTYPE; // FILLED_RECT
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    color: string;
    color2: string;
    width: number;
    height: number;
}
type StrippedFilledRectangle = FilledRectangle;
//  grid-rectangle
//  ---------
//  An axis-aligned box, whose corners snap to the grid.
//  Same movement restrictions apply to this as apply to the
//  grid-line.
//  base_x and base_y is the top-left corner of the box.
type GridRectangle = {
    type: CANVASTYPE; // GRID_RECT
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    color: string;
    width: number;
    height: number;
}
// Stripped Grid Rectangles are the same as regular rectangles.
type StrippedGridRectangle = GridRectangle;

enum ELLIPSETYPE {
    HOLLOW = 0,
    SOLID = 1,
    FILLED = 2,
}
const ELLIPSETYPE_MAX = ELLIPSETYPE.FILLED+1;
const ELLIPSETYPE_TO_NAME = [
    // ELLIPSETYPE.HOLLOW
    'Hollow',
    // ELLIPSETYPE.SOLID
    'Solid',
    // ELLIPSETYPE.FILLED
    'Filled',
];
let current_ellipse = ELLIPSETYPE.HOLLOW;
//  ellipse - doesn't exist yet
//  -------
//  base_x and base_y is the center of the ellipse.
//  We only allow axis-aligned ellipses.
type Ellipse = {
    type: CANVASTYPE; // ELLIPSE
    id: number;
    base_x: number; // top left of the bounding box
    base_y: number; // top left of the bounding box
    flags: CANVASFLAG;
    color: string;
    color2: string;
    width: number;
    height: number;
    variant: ELLIPSETYPE;
}
// Stripped Ellipses are the same as regular rectangles.
type StrippedEllipse = Ellipse;

//  image
//  -----
type ImageObj = {
    type: CANVASTYPE; // IMAGE
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    width: number;
    height: number;
    url: string;
    img?: HTMLImageElement;
}

type StrippedImageObj = {
    type: CANVASTYPE; // IMAGE
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    width: number;
    height: number;
    url: string;
}
//  text
//  ----
enum TEXTALIGNMENT {
    LEFT = 0,
    CENTER = 1,
    RIGHT = 2,
}
type TextObj = {
    type: CANVASTYPE; // TEXT
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    text: string;
    size: number;
    bbox: Bbox;
    lines: Array<string>;
    bboxes: Array<Bbox>;
    alignment: TEXTALIGNMENT;
}
type StrippedTextObj = {
    type: CANVASTYPE; // TEXT
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    text: string;
    size: number;
    alignment: TEXTALIGNMENT;
}
//  ez-token
//  --------
//  A token that just has a simple text label.
type EzToken = {
    type: CANVASTYPE; // EZ_TOKEN
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    text: string;
    color: string;
    width: number; // in squares (?)
    height: number; // in squares (?)
}

// stripped EzToken is the same as a regular EzToken
type StrippedEzToken = EzToken;

//  img-token
//  --------
//  A token that has an image as its contents.
type ImgToken = {
    type: CANVASTYPE; // IMG_TOKEN
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    url: string;
    img?: HTMLImageElement,
    width: number; // in squares (?)
    height: number; // in squares (?)
}
type StrippedImgToken = {
    type: CANVASTYPE; // IMG_TOKEN
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    url: string;
    width: number; // in squares (?)
    height: number; // in squares (?)
}
//  door
//  ----
//  A door.
type DoorObj = {
    type: CANVASTYPE; // DOOR
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    doortype: DOORTYPE;
    color: string;
    width: number; // in squares (?)
    orientation: ORIENTATION;
}
// stripped doors are the same as regular doors.
type StrippedDoorObj = DoorObj;
enum ROTATION {
    // we might add the diagonals
    UP    = 0,
    RIGHT = 2,
    DOWN  = 4,
    LEFT  = 6,
}
type Stairs = {
    type: CANVASTYPE; // STAIRS
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    width: number; // in squares
    height: number; // in squares
    rotation: ROTATION;
}
// stripped stairs are the same as regular stairs.
type StrippedStairs = Stairs;

// Measure
// -------
// This is a weird object, but it is the measurement tool.
type MeasureObj = {
    type: CANVASTYPE; // MEASURE
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    color: string;
    x1: number;
    y1: number;
}
// stripped measure is the same as regular measure.
type StrippedMeasureObj = MeasureObj;
enum FIXTURETYPE {
    STATUE = 0,
    STAIRS = 1,
    PIT    = 2,
    RUBBLE = 3,
}
const FIXTURETYPE_MAX = FIXTURETYPE.RUBBLE + 1;
const FIXTURETYPE_TO_NAME = [
    // FIXTURETYPE.STATUE
    'Statue',
    // FIXTURETYPE.STAIRS
    'Stairs',
    // FIXTURETYPE.PIT
    'Pit',
    // FIXTURETYPE.RUBBLE
    'Rubble',
];

// Fixture
// ----------
// For dungeon fixtures, like rubble or pits.
type FixtureObj = {
    type: CANVASTYPE; // FIXTURE
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    width: number;
    height: number;
    ftype: FIXTURETYPE;
}

// stripped fixture obj is the same as regular fixtures.
type StrippedFixtureObj = FixtureObj;

// FilledTile
// ----------
type FilledTile = {
    type: CANVASTYPE; // FILLED_TILE
    id: number;
    base_x: number;
    base_y: number;
    flags: CANVASFLAG;
    color: string;
};

type StrippedFilledTile = FilledTile;

type CanvasObject = FreehandLine | GridLine | Rectangle | FilledRectangle | GridRectangle | ImageObj | TextObj | EzToken | ImgToken | DoorObj | Stairs | Ellipse | MeasureObj | FixtureObj | FilledTile;
type StrippedObj = StrippedFreehandLine | StrippedGridLine | StrippedRectangle | StrippedFilledRectangle | StrippedGridRectangle | StrippedEllipse | StrippedImageObj | StrippedTextObj | StrippedEzToken | StrippedImgToken | StrippedDoorObj | StrippedStairs | StrippedMeasureObj | StrippedFixtureObj | StrippedFilledTile;

// Door subtypes
// ------------
enum DOORTYPE {
    DOOR = 0,
    DOUBLE = 1,
    PORTCULLIS = 2,
    SECRET = 3,
    BRICKED_WALL = 4,
    PORTAL = 5,
    CURTAINS = 6,
    HALLWAY = 7,
}
const DOORTYPE_MAX = DOORTYPE.HALLWAY + 1;
const DOOR_TO_NAMES = [
    // DOORTYPE.DOOR
    'Door',
    // DOORTYPE.DOUBLE
    'Double',
    // DOORTYPE.PORTCULLIS
    'Portcullis',
    // DOORTYPE.SECRET
    'Secret',
    // DOORTYPE.BRICKED_WALL
    'Bricks',
    // DOORTYPE.PORTAL
    'Portal',
    // DOORTYPE.CURTAINS
    'Curtains',
    // DOORTYPE.HALLWAY
    'Hallway',
];
let current_door = DOORTYPE.DOOR;

enum SNAPMODE {
    GRID = "GRID",
    HALF = "HALF",
    FREE = "FREE",
}
let snapmode: SNAPMODE = SNAPMODE.GRID;
function change_snapmode(mode:SNAPMODE){
    snapmode = mode;
}
function visually_set_snapmode(mode:SNAPMODE){
    const snap_grid = document.getElementById('grid-snap-grid') as HTMLInputElement;
    const snap_half = document.getElementById('grid-snap-half') as HTMLInputElement;
    const snap_free = document.getElementById('grid-snap-free') as HTMLInputElement;
    switch(mode){
        case SNAPMODE.GRID:
            snap_grid.click();
            break;
        case SNAPMODE.HALF:
            snap_half.click();
            break;
        case SNAPMODE.FREE:
            snap_free.click();
            break;
    }
}
document.addEventListener('DOMContentLoaded', function(){
    const snap_grid = document.getElementById('grid-snap-grid') as HTMLInputElement;
    snap_grid.addEventListener('change', function(){
        change_snapmode(snap_grid.value as SNAPMODE);
    });
    if(snap_grid.checked)
        snapmode = SNAPMODE.GRID;
    const snap_half = document.getElementById('grid-snap-half') as HTMLInputElement;
    snap_half.addEventListener('change', function(){
        change_snapmode(snap_half.value as SNAPMODE);
    });
    if(snap_half.checked)
        snapmode = SNAPMODE.HALF;
    const snap_free = document.getElementById('grid-snap-free') as HTMLInputElement;
    snap_free.addEventListener('change', function(){
        change_snapmode(snap_free.value as SNAPMODE);
    });
    if(snap_free.checked)
        snapmode = SNAPMODE.FREE;
});

// orientations
enum ORIENTATION {
    VERTICAL = 0,
    HORIZONTAL = 1,
    TOPLEFT_DOWNRIGHT = 2,
    TOPRIGHT_DOWNLEFT = 3,
}

const MAPS:Map<number,DungeonMap> = new Map();
const MapOptionElements: Map<number, HTMLOptionElement> = new Map();
enum MapFlags {
    NONE        = 0,
    DELETED     = 1 << 0,
    CANT_DELETE = 1 << 1,
    NUMBERED    = 1 << 2,
}
enum GRIDTYPE {
    SQUARE = 0,
    HEX = 1,
    NOGRID = 2,
}
type DungeonMap = {
    map_id: number; // integer
    grid_type: GRIDTYPE;
    map_name: string;
    flags: MapFlags;
    canvas_obj_array: Array<CanvasObject>;
    canvas_objs: Map<number, CanvasObject>;
    is_sorted: boolean;
    undo_stack: Array<UndoEvent>;
    undo_position: number; // integer
    pings: Array<Ping>;
}
type Ping = {
    t0?: DOMHighResTimeStamp;
    cx: number;
    cy: number;
    color: string;
};
function ping_at(map:DungeonMap, x:number, y:number){
    const ping = {cx:x, cy:y, color:'#ff3300'};
    map.pings.push(ping);
    socket.emit('canvas-ping', {ping:ping, map_id:map.map_id});
    request_render();
}
socket.on('canvas-ping', function(data:{ping:Ping, map_id:number}){
    const map = get_map(data.map_id);
    map.pings.push(data.ping);
    request_render();
});
type DungeonMapView = {
    map: DungeonMap; // non-owning
    // These are in REFERENCE_WIDTH space.
    // To go from screen space to grid space, divide by `scale` and subtract
    // `camera_x`/`camera_y`.
    // TODO: all this camera_N stuff is totally fucked.
    // I should've added camera_x from the start, not subtract.
    camera_x: number;
    camera_y: number;
    scale: number;
    selected: Set<number>;
    selection_area: {
        is_selecting: boolean;
        select_one: boolean;
        x0: number;
        x1: number;
        y0: number;
        y1: number;
    };
    placing_area: {
        is_placing: boolean;
        is_line: boolean;
        x0: number;
        x1: number;
        y0: number;
        y1: number;
    };
}
let active_map_view_index = 0;
let dungeon_map_views: Array<DungeonMapView> = [];
function new_map_view(map_id:number): DungeonMapView{
    const view: DungeonMapView = {
        map: get_map(map_id),
        camera_x: 0,
        camera_y: 0,
        scale: 1,
        selected: new Set(),
        selection_area: {
            select_one: false,
            is_selecting: false,
            x0:0, y0:0,
            x1:0, y1:0,
        },
        placing_area: {
            is_placing: false,
            is_line: false,
            x0: 0, y0: 0,
            x1: 0, y1: 0,
        },
    };
    return view;
}
function change_active_map_view(idx: number, from_select:boolean){
    active_map_view_index = idx;
    request_render();
    if(from_select)
        return;
    const select = document.getElementById('current-map-name') as HTMLSelectElement;
    for(let i = 0; i < select.options.length; i++){
        if(+select.options[i].value == dungeon_map_views[idx].map.map_id){
            select.selectedIndex = i;
            break;
        }
    }
}
document.addEventListener('DOMContentLoaded', function(){
    const select = document.getElementById('current-map-name') as HTMLSelectElement;
    select.addEventListener('input', function(e:Event){
        e.stopPropagation();
        change_map(+select.value, true);
    });
});
function get_active_view(): DungeonMapView{
    if(!dungeon_map_views.length){
        dungeon_map_views.push(new_map_view(0));
        change_active_map_view(0, false);
    }
    return dungeon_map_views[active_map_view_index];
}
function get_map(map_id:number): DungeonMap {
    if(MAPS.has(map_id))
        return MAPS.get(map_id)!;
    const new_map:DungeonMap = {
        map_id: map_id,
        map_name: 'Untitled',
        grid_type: GRIDTYPE.SQUARE,
        flags: MapFlags.NONE,
        // TODO: these shouldn't be on the map itself, this prevents having multiple
        // dungeon_map_views into the same map.

        canvas_obj_array: [],
        canvas_objs: new Map(),
        is_sorted: true,

        undo_stack: [],
        undo_position: 0,

        pings: [],
    };
    socket.emit('canvas-create-map', map_id);
    MAPS.set(map_id, new_map);
    const option = document.createElement('option');
    option.innerText = 'Untitled';
    option.value = ""+map_id;
    MapOptionElements.set(map_id, option);
    const select = document.getElementById('current-map-name') as HTMLSelectElement;
    select.options.add(option);
    return new_map;
}
function change_map(map_id:number, from_select:boolean){
    for(let i = 0; i < dungeon_map_views.length; ++i){
        const mv = dungeon_map_views[i];
        if(mv.map.map_id == map_id){
            change_active_map_view(i, from_select);
            break;
        }
    }
    request_render();
}
function sort_canv_objs(map:DungeonMap){
    if(map.is_sorted)
        return;
    map.canvas_obj_array.sort(function(first:CanvasObject, second:CanvasObject){
        return SORTORDER[first.type] - SORTORDER[second.type];
    });
    map.is_sorted = true;
}
socket.on('canvas-create-map', function(map_id:number){
    if(MAPS.has(map_id))
        return;
    dungeon_map_views.push(new_map_view(map_id));
    change_active_map_view(dungeon_map_views.length-1, false);
});
function rename_map(map:DungeonMap, name:string){
    map.map_name = name;
    const opt = MapOptionElements.get(map.map_id)!;
    opt.innerText = name;
}
socket.on('canvas-name-map', function(data:{map_id:number, map_name:string}){
    const map = get_map(data.map_id);
    rename_map(map, data.map_name);
});
socket.on('canvas-grid-type', function(data:{map_id:number, grid_type:GRIDTYPE}){
    const map = get_map(data.map_id);
    map.grid_type = data.grid_type;
    request_render();
});
socket.on('canvas-grid-numbered', function(data:{map_id:number, numbered:number}){
    const map = get_map(data.map_id);
    if(data.numbered)
        map.flags |= MapFlags.NUMBERED
    else
        map.flags &= ~(MapFlags.NUMBERED);
    request_render();
});

//
// THIS NEEDS TO ALWAYS BE POWER OF 2.
// Also if it changes, lots of things will probably break.
const REFERENCE_WIDTH = 64; // the size of a square at scale = 1.
// The main canvas and its context. These are set once the content loads.
let canvas:HTMLCanvasElement;
let ctx:CanvasRenderingContext2D;
socket.on('canvas-gather', function(where:{map_id:number; x:number; y:number}): void{
    change_map(where.map_id, false);
    const view = get_active_view();
    view.camera_x = where.x;
    view.camera_y = where.y;
    request_render();
});
const MIN_SCALE = 0.125;
const MAX_SCALE = 5;
function clamp_scale(scale:number): number{
    if(scale < MIN_SCALE)
        scale = MIN_SCALE;
    if(scale > MAX_SCALE)
        scale = MAX_SCALE;
    return scale;
}
function reset_zoom(view:DungeonMapView): void{
    const center_x = canvas.width/2/view.scale - view.camera_x;
    const center_y = canvas.height/2/view.scale - view.camera_y;
    view.scale = 1;
    view.camera_x = canvas.width/2/view.scale - center_x;
    view.camera_y = canvas.height/2/view.scale - center_y;
    request_render();
}
function zoom_in(view:DungeonMapView):void{
    const center_x = canvas.width/2/view.scale - view.camera_x;
    const center_y = canvas.height/2/view.scale - view.camera_y;
    view.scale *= 1.50;
    view.scale = clamp_scale(view.scale);
    view.camera_x = canvas.width/2/view.scale - center_x;
    view.camera_y = canvas.height/2/view.scale - center_y;
    request_render();
}
function zoom_out(view:DungeonMapView):void{
    const center_x = canvas.width/2/view.scale - view.camera_x;
    const center_y = canvas.height/2/view.scale - view.camera_y;
    view.scale /= 1.50;
    view.scale = clamp_scale(view.scale);
    view.camera_x = canvas.width/2/view.scale - center_x;
    view.camera_y = canvas.height/2/view.scale - center_y;
    request_render();
}

//
function resize_canvas():void{
    canvas = document.getElementsByTagName('canvas')[0]!;
    ctx = canvas.getContext('2d')!;
    const chat_rect = document.getElementById('chat')!.getBoundingClientRect();
    canvas.width = window.innerWidth - chat_rect.width-4;
    canvas.height = window.innerHeight-6;
    request_render();
}

//
// freehand-line stuff.
function make_freehand_line(id:number, base_x:number, base_y:number, color:string, thickness:number):FreehandLine{
    base_x = Math.round(base_x);
    base_y = Math.round(base_y);
    const obj =  {
        type: CANVASTYPE.FREEHAND_LINE,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CANVASFLAG.NONE,
        points: [],
        color: color,
        path: undefined,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
        thickness: thickness,
    };
    return obj;
}
function add_freehand_line(map:DungeonMap, id:number, base_x:number, base_y:number, color:string, thickness:number):void{
    const obj = make_freehand_line(id, base_x, base_y, color, thickness);
    add_canv_obj(map, obj);
}
function add_freehand_point(obj:FreehandLine, x:number, y:number):void{
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
function freehand_recalculate_bbox(obj:FreehandLine):void{
    const points = obj.points;
    const length = points.length;
    obj.bbox.x0 = 0;
    obj.bbox.y0 = 0;
    obj.bbox.x1 = 0;
    obj.bbox.y1 = 0;
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
function freehand_recalculate_path(obj:FreehandLine):void{
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
function add_freehand_point_by_id(map:DungeonMap, id:number, x:number, y:number):void{
    let obj = map.canvas_objs.get(id) as FreehandLine;
    add_freehand_point(obj, x, y);
}

function snap_down_to_grid(x: number):number{
    x = Math.round(x);
    x -= x & (REFERENCE_WIDTH-1);
    return x;
}
function snap_down_to_hex_grid(x: number, y:number):[number, number]{
    x = snap_down_to_grid(x);
    // If the hex is in an odd column, we need to offset y.
    if((x >> 6) & 1){
        y += 32;
        y = snap_down_to_grid(y);
        y -= 32;
    }
    else {
        y = snap_down_to_grid(y);
    }
    return [x, y];
}
// Rounds a single dimension to the grid.
function snap_to_grid(x:number):number{
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
function snap_to_half_grid(x:number):number{
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
function snap_identity(x:number):number{
    return x;
}
function get_snap_func():(x:number)=>number{
    switch(snapmode){
        case SNAPMODE.GRID:
            return snap_to_grid;
        case SNAPMODE.HALF:
            return snap_to_half_grid;
        case SNAPMODE.FREE:
            return snap_identity;
    }
}

function snap_to_grid_center(x:number):number{
    x = Math.round(x);
    x = x - (x & (REFERENCE_WIDTH-1)) + REFERENCE_WIDTH/2;
    return x;
}
function snap_to_half_grid_center(x:number):number{
    x = Math.round(x);
    x = x - (x & (REFERENCE_WIDTH/2-1)) + REFERENCE_WIDTH/4;
    return x;
}

function get_snap_center_func():(_:number)=>number{
    switch(snapmode){
        case SNAPMODE.GRID:
            return snap_to_grid_center;
        case SNAPMODE.HALF:
            return snap_to_half_grid_center;
        case SNAPMODE.FREE:
            return snap_identity;
    }
}

function make_gridline(id:number, base_x:number, base_y:number, color:string):GridLine{
    if(snapmode == SNAPMODE.HALF){
        base_x = snap_to_half_grid(base_x);
        base_y = snap_to_half_grid(base_y);
    }
    else{
        base_x = snap_to_grid(base_x);
        base_y = snap_to_grid(base_y);
    }
    const obj =  {
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
function add_gridline(map:DungeonMap, id:number, base_x:number, base_y:number, color:string):void{
    const obj = make_gridline(id, base_x, base_y, color);
    add_canv_obj(map, obj);
}
function add_gridline_point(obj:GridLine, x:number, y:number):void{
    const points = obj.points;
    const last_x = points.length? points[points.length-2]+obj.base_x : obj.base_x;
    const last_y = points.length? points[points.length-1]+obj.base_y : obj.base_x;
    const dist = Math.abs(last_x - x) + Math.abs(last_y - y);
    if(snapmode == SNAPMODE.HALF){
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
function gridline_recalculate_bbox(obj:GridLine):void{
    // this is the same as freehand??
    const points = obj.points;
    const length = points.length;
    obj.bbox.x0 = 0;
    obj.bbox.y0 = 0;
    obj.bbox.x1 = 0;
    obj.bbox.y1 = 0;
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
function gridline_recalculate_path(obj:GridLine):void{
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
function add_gridline_point_by_id(map:DungeonMap, id:number, x:number, y:number):void{
    // this is the same as freehand
    let obj = map.canvas_objs.get(id) as GridLine;
    add_gridline_point(obj, x, y);
}
function make_gridrect(id:number, base_x:number, base_y:number, color:string):GridRectangle{
    const obj =  {
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
function add_gridrect(map:DungeonMap, id:number, base_x:number, base_y:number, color:string){
    const obj = make_gridrect(id, base_x, base_y, color);
    add_canv_obj(map, obj);
}
function change_gridrect(obj:GridRectangle, x0:number, y0:number, x1:number, y1:number):void{
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
function change_gridrect_by_id(map:DungeonMap, id:number, x0:number, y0:number, x1:number, y1:number):void{
    let obj = map.canvas_objs.get(id) as GridRectangle;
    change_gridrect(obj, x0, y0, x1, y1);
}
function make_door(id:number, x:number, y:number, doortype:DOORTYPE, color:string, width:number, orientation:ORIENTATION):DoorObj{
    const obj = {
        type: CANVASTYPE.DOOR,
        id: id,
        base_x: x,
        base_y: y,
        flags: CANVASFLAG.NONE,
        doortype: doortype,
        color: color,
        width: width,
        orientation: orientation,
    };
    return obj;
}
function add_door(map:DungeonMap, id:number, base_x:number, base_y:number, doortype:DOORTYPE, color:string, width:number, orientation:ORIENTATION):void{
    const obj = make_door(id, base_x, base_y, doortype, color, width, orientation);
    add_canv_obj(map, obj);
}
function make_rect(id:number, base_x:number, base_y:number, color:string):Rectangle{
    const obj =  {
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
function add_rect(map:DungeonMap, id:number, base_x:number, base_y:number, color:string):void{
    const obj = make_rect(id, base_x, base_y, color);
    add_canv_obj(map, obj);
}
function change_rect(obj:Rectangle, x0:number, y0:number, x1:number, y1:number):void{
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
function change_rect_by_id(map:DungeonMap, id:number, x0:number, y0:number, x1:number, y1:number):void{
    let obj = map.canvas_objs.get(id) as Rectangle;
    change_rect(obj, x0, y0, x1, y1);
}
function make_filled_rect(id:number, base_x:number, base_y:number, color:string, color2:string):FilledRectangle{
    const obj =  {
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
function add_filled_rect(map:DungeonMap, id:number, base_x:number, base_y:number, color:string, color2:string){
    const obj = make_filled_rect(id, base_x, base_y, color, color2);
    add_canv_obj(map, obj);
}
function change_filled_rect(obj:FilledRectangle, x0:number, y0:number, x1:number, y1:number):void{
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
function change_filled_rect_by_id(map:DungeonMap, id:number, x0:number, y0:number, x1:number, y1:number):void{
    let obj = map.canvas_objs.get(id) as FilledRectangle;
    change_filled_rect(obj, x0, y0, x1, y1);
}
function make_ellipse(id:number, base_x:number, base_y:number, color:string, color2:string, variant:ELLIPSETYPE):Ellipse{
    const obj:Ellipse = {
        type: CANVASTYPE.ELLIPSE,
        id:id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CANVASFLAG.NONE,
        color: color,
        color2: color2,
        width: 0,
        height: 0,
        variant: variant,
    };
    return obj;
}
function add_ellipse(map:DungeonMap, id:number, base_x:number, base_y:number, color:string, color2:string, variant:ELLIPSETYPE){
    const obj = make_ellipse(id, base_x, base_y, color, color2, variant);
    add_canv_obj(map, obj);
}
function make_text(id:number, base_x:number, base_y:number, text:string, size:number, alignment: TEXTALIGNMENT):TextObj{
    let snap = get_snap_center_func();
    base_x = snap(base_x);
    base_y = snap(base_y);
    const obj =  {
        type: CANVASTYPE.TEXT,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CANVASFLAG.NONE,
        text: text,
        size: size,
        bbox: {x0:0, y0:0, x1:0, y1:0},
        bboxes: [],
        lines: text.split('\n'),
        alignment: alignment,
    };
    return obj;
}
function add_text(map:DungeonMap, id:number, base_x:number, base_y:number, text:string, size:number, alignment:TEXTALIGNMENT):void{
    const obj = make_text(id, base_x, base_y, text, size, alignment);
    add_canv_obj(map, obj);
}
function make_ez_token(id:number, base_x:number, base_y:number, text:string, color:string, width:number, height:number):EzToken{
    base_x = base_x - (base_x & (REFERENCE_WIDTH-1));
    base_y = base_y - (base_y & (REFERENCE_WIDTH-1));
    const obj =  {
        type: CANVASTYPE.EZ_TOKEN,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CANVASFLAG.NONE,
        text: text,
        color:color,
        width: width,
        height: height,
    };
    return obj;
}
function add_ez_token(map:DungeonMap, id:number, base_x:number, base_y:number, text:string, color:string, width:number, height:number):void{
    const obj = make_ez_token(id, base_x, base_y, text, color, width, height);
    add_canv_obj(map, obj);
}
function make_img_token(id:number, base_x:number, base_y:number, url:string):ImgToken{
    base_x = base_x - (base_x & (REFERENCE_WIDTH-1));
    base_y = base_y - (base_y & (REFERENCE_WIDTH-1));

    const obj:ImgToken =  {
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
    img.addEventListener('load', function(){
        obj.img = img;
        request_render();
    }, {once:true});
    img.src = url;
    return obj;
}
function add_img_token(map:DungeonMap, id:number, base_x:number, base_y:number, url:string):void{
    const obj = make_img_token(id, base_x, base_y, url);
    add_canv_obj(map, obj);
}

function make_image(id:number, base_x:number, base_y:number, width:number, height:number, url:string):ImageObj{
    base_x = Math.round(base_x);
    base_y = Math.round(base_y);
    base_x = base_x - (base_x & (REFERENCE_WIDTH-1)) + 1;
    base_y = base_y - (base_y & (REFERENCE_WIDTH-1)) + 1;
    const obj:ImageObj =  {
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
function add_image(map:DungeonMap, id:number, base_x:number, base_y:number, width:number, height:number, url:string):void{
    const obj = make_image(id, base_x, base_y, width, height, url);
    add_canv_obj(map, obj);
}
function make_stairs(id:number, base_x:number, base_y:number): Stairs{
    const snap = get_snap_func();
    base_x = snap(base_x);
    base_y = snap(base_y);
    const obj:Stairs = {
        type: CANVASTYPE.STAIRS,
        id: id,
        base_x:base_x,
        base_y:base_y,
        flags: CANVASFLAG.NONE,
        width: 0,
        height: 0,
        rotation: ROTATION.UP,
    };
    return obj;
}
function add_stairs(map:DungeonMap, id:number, base_x:number, base_y:number){
    const obj = make_stairs(id, base_x, base_y);
    add_canv_obj(map, obj);
}
function change_stairs(obj:Stairs, x0:number, y0:number, x1:number, y1:number){
    const xdiff = x1-x0;
    const ydiff = y1-y0;
    const snap = get_snap_func();
    x0 = snap(x0);
    y0 = snap(y0);
    x1 = snap(x1);
    y1 = snap(y1);
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
    obj.width = (x1 - x0)/REFERENCE_WIDTH;
    obj.height = (y1 - y0)/REFERENCE_WIDTH;
    if(Math.abs(xdiff) > Math.abs(ydiff)){
        if(xdiff > 0){
            obj.rotation = ROTATION.RIGHT;
        }
        else{
            obj.rotation = ROTATION.LEFT;
        }
    }
    else {
        if(ydiff > 0){
            obj.rotation = ROTATION.UP;
        }
        else{
            obj.rotation = ROTATION.DOWN;
        }
    }
}
function make_measure(id:number, x:number, y:number, color:string):MeasureObj{
    const obj:MeasureObj = {
        type: CANVASTYPE.MEASURE,
        id: id,
        base_x:x,
        base_y:y,
        flags: CANVASFLAG.NONE,
        color:color,
        x1:x,
        y1:y,
    };
    return obj;
}
function make_fixture(id:number, x:number, y:number, ftype:FIXTURETYPE):FixtureObj{
    const obj:FixtureObj = {
        type: CANVASTYPE.FIXTURE,
        id: id,
        base_x:x,
        base_y:y,
        flags: CANVASFLAG.NONE,
        width:0,
        height:0,
        ftype:ftype,
    };
    return obj;
}

document.addEventListener('DOMContentLoaded', resize_canvas);
window.addEventListener('resize', resize_canvas);
function clear_canvas(map:DungeonMap):void{
    map.canvas_obj_array.length = 0;
    map.canvas_objs.clear();
    map.undo_stack.length = 0;
    map.undo_position = 0;
    clear_copy_buffer();
    for(let view of dungeon_map_views){
        if(view.map.map_id == map.map_id)
            view.selected.clear();
    }
    request_render();
}
socket.on('canvas-clear', function():void{
    for(let m of MAPS.values())
        clear_canvas(m);
    MAPS.clear()
    dungeon_map_views.length = 0;
    active_map_view_index = 0;
    const select = document.getElementById('current-map-name') as HTMLSelectElement;
    while(select.options.length){
        select.remove(0);
    }
    MapOptionElements.clear();
});

enum UNDO_EVENT_TYPE {
    CREATE = 0,
    DELETE = 1,
    UPDATE = 2,
    MASS_CREATE = 3,
}
type UndoCreate = {
    type: UNDO_EVENT_TYPE; // CREATE
    id: number;
}
type UndoMassCreate = {
    type: UNDO_EVENT_TYPE; // MASS_CREATE
    ids: Array<number>;
}
type UndoDelete = {
    type: UNDO_EVENT_TYPE; // DELETE
    ids: Array<number>;
}
type UndoUpdate = {
    type: UNDO_EVENT_TYPE; // UPDATE
    before: Array<StrippedObj>;
    after: Array<StrippedObj>;
}
type UndoEvent = UndoCreate | UndoMassCreate | UndoDelete | UndoUpdate;

function push_undo_event(map:DungeonMap, undo_event:UndoEvent):void{
    map.undo_stack.length = map.undo_position;
    map.undo_stack.push(undo_event);
    const MAX_UNDO_STACK = 10000;
    if(map.undo_stack.length > MAX_UNDO_STACK){
        const new_stack = [];
        // Is there a better way to slice arrays?
        for(let i = map.undo_stack.length-Math.floor(MAX_UNDO_STACK/2); i < map.undo_stack.length; i++){
            new_stack.push(map.undo_stack[i]);
        }
        map.undo_stack = new_stack;
    }
    map.undo_position = map.undo_stack.length;
}
function note_delete_by_ids_for_undo(map:DungeonMap, deleted:Array<number>):void{
    const undo_event:UndoDelete = {
        type: UNDO_EVENT_TYPE.DELETE,
        ids: deleted,
    };
    push_undo_event(map, undo_event);
}
function note_create_by_id_for_undo(map:DungeonMap, created_id:number):void{
    const undo_event:UndoCreate = {
        type: UNDO_EVENT_TYPE.CREATE,
        id: created_id,
    };
    push_undo_event(map, undo_event);
}
function note_updates_for_undo(map:DungeonMap, before:Array<StrippedObj>, after:Array<StrippedObj>):void{
    const undo_event: UndoUpdate = {
        type: UNDO_EVENT_TYPE.UPDATE,
        before: before,
        after: after,
    };
    push_undo_event(map, undo_event);
}
function note_mass_create_for_undo(map:DungeonMap, created_ids:Array<number>){
    const undo_event: UndoMassCreate = {
        type: UNDO_EVENT_TYPE.MASS_CREATE,
        ids: created_ids,
    };
    push_undo_event(map, undo_event);
}
function do_one_undo(map:DungeonMap):void{
    if(!map.undo_position)
        return;
    map.undo_position--;
    const undo_event = map.undo_stack[map.undo_position];
    switch(undo_event.type){
        case UNDO_EVENT_TYPE.CREATE:{
            const ue = undo_event as UndoCreate;
            const obj = map.canvas_objs.get(ue.id)!;
            obj.flags |= CANVASFLAG.DELETED;
            publish_delete_by_ids(map.map_id, [obj.id]);
        }break;
        case UNDO_EVENT_TYPE.DELETE:{
            const ue = undo_event as UndoDelete;
            const ids = ue.ids;
            const length = ids.length;
            const stripped = get_stripped_state_by_id(map, ids);
            for(let i = 0; i < length; i++){
                const obj = map.canvas_objs.get(ids[i])!;
                obj.flags &= ~CANVASFLAG.DELETED;
                stripped[i].flags &= ~CANVASFLAG.DELETED;
            }
            // maybe there should be an undelete?
            publish_obj_updates(map.map_id, stripped);
        }break;
        case UNDO_EVENT_TYPE.MASS_CREATE:{
            const ue = undo_event as UndoMassCreate;
            const ids = ue.ids;
            const length = ids.length;
            for(let i = 0; i < length; i++){
                const obj = map.canvas_objs.get(ids[i])!;
                obj.flags |= CANVASFLAG.DELETED;
            }
            publish_delete_by_ids(map.map_id, ids);
        }break;
        case UNDO_EVENT_TYPE.UPDATE:{
            const ue = undo_event as UndoUpdate;
            set_obj_states_from_stripped_objs(map, ue.before);
            publish_obj_updates(map.map_id, ue.before);
        }break;
    }
    request_render();
}
function do_one_redo(map:DungeonMap):void{
    if(map.undo_position == map.undo_stack.length)
        return;
    const undo_event = map.undo_stack[map.undo_position];
    switch(undo_event.type){
        case UNDO_EVENT_TYPE.CREATE:{
            const ue = undo_event as UndoCreate;
            const obj = map.canvas_objs.get(ue.id)!;
            obj.flags &= ~CANVASFLAG.DELETED;
            const stripped = get_stripped_state_by_id(map, [ue.id]);
            publish_obj_updates(map.map_id, stripped);
        }break;
        case UNDO_EVENT_TYPE.DELETE:{
            const ue = undo_event as UndoDelete;
            const ids = ue.ids;
            const length = ids.length;
            for(let i = 0; i < length; i++){
                const obj = map.canvas_objs.get(ids[i])!;
                obj.flags |= CANVASFLAG.DELETED;
            }
            publish_delete_by_ids(map.map_id, ue.ids);
        }break;
        case UNDO_EVENT_TYPE.MASS_CREATE:{
            const ue = undo_event as UndoMassCreate;
            const ids = ue.ids;
            const length = ids.length;
            for(let i = 0; i < length; i++){
                const obj = map.canvas_objs.get(ids[i])!;
                obj.flags &= ~ CANVASFLAG.DELETED;
            }
            const stripped = get_stripped_state_by_id(map, ue.ids);
            publish_obj_updates(map.map_id, stripped);
        }break;
        case UNDO_EVENT_TYPE.UPDATE:{
            const ue = undo_event as UndoUpdate
            set_obj_states_from_stripped_objs(map, ue.after);
            publish_obj_updates(map.map_id, ue.after);
        }break;
    }
    map.undo_position++;
    request_render();
}
function undo_is_impossible(map:DungeonMap):boolean{
    return !map.undo_position;
}
function redo_is_impossible(map:DungeonMap):boolean{
    return map.undo_position == map.undo_stack.length;
}
let localid = 0;
// Combines the session id with the local id to create a
// unique id for an object
function get_new_id(): number{
    ++localid;
    let id = (session_id << 20) + localid;
    return id;
}
// Needs to be global as it's shared between buffers.
const copied_objs: Array<StrippedObj> = [];
function clear_copy_buffer():void{
    copied_objs.length = 0;
}
function copy_selected_objs_to_copy_buffer(view:DungeonMapView):void{
    for(let obj_id of view.selected){
        const obj = view.map.canvas_objs.get(obj_id)!;
        if(obj.flags & CANVASFLAG.DELETED)
            continue;
        const stripped = strip_obj(obj);
        copied_objs.push(stripped);
    }
}

function cut_selected_objs_to_copy_buffer(view:DungeonMapView):void{
    for(let obj_id of view.selected){
        const obj = view.map.canvas_objs.get(obj_id)!;
        if(obj.flags & CANVASFLAG.DELETED)
            continue;
        const stripped = strip_obj(obj);
        copied_objs.push(stripped);
        obj.flags |= CANVASFLAG.DELETED;
    }
    publish_delete_by_ids(view.map.map_id, Array.from(view.selected));
    note_delete_by_ids_for_undo(view.map, Array.from(view.selected));
    view.selected.clear()
    request_render();
}
function translate_object(obj: CanvasObject, dx: number, dy: number){
    obj.base_x += dx;
    obj.base_y += dy;
    switch(obj.type){
        case CANVASTYPE.FREEHAND_LINE:{
            freehand_recalculate_bbox(obj as FreehandLine);
            freehand_recalculate_path(obj as FreehandLine);
        }break;
        case CANVASTYPE.GRID_LINE:{
            gridline_recalculate_bbox(obj as GridLine);
            gridline_recalculate_path(obj as GridLine);
        }break;
        default:
            break;
    }
}
function paste_from_copy_buffer_at(map:DungeonMap, x:number, y:number):void{
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
        const obj = unstrip_obj(copied_objs[i]);
        let id = get_new_id();
        obj.id = id;
        translate_object(obj, dx, dy);
        add_canv_obj(map, obj);
        new_ids.push(id);
        publish_obj_by_id(map, obj.id);
    }
    note_mass_create_for_undo(map, new_ids);
    request_render();
}

socket.on('canvas-delete-map', function(map_id:number){
    delete_map(map_id);
});

function delete_map(map_id:number){
    const map = MAPS.get(map_id);
    if(!map)
        return;
    if(map.flags & MapFlags.CANT_DELETE){
        console.log('invalid deletion request')
        return;
    }
    map.flags |= MapFlags.DELETED;
    const select = document.getElementById('current-map-name') as HTMLSelectElement;
    let prev_idx = select.selectedIndex-1;
    if(prev_idx < 0)
        prev_idx = 0;
    for(let i = 0; i < select.options.length; i++){
        if(+select.options[i].value == map_id){
            select.remove(i);
            break;
        }
    }
    let new_active_map_id = +select.options[prev_idx].value;
    select.selectedIndex = prev_idx;
    for(let i = 0; i < dungeon_map_views.length; ++i){
        if(dungeon_map_views[i].map.map_id == new_active_map_id){
            change_active_map_view(i, true);
            break;
        }
    }
}

// cutnpaste from below. TODO: factor these.

socket.on('canvas-initialize-maps', function(msgs:Array<{map_id:number; map_name:string; objects:Array<StrippedObj>; flags:MapFlags; grid_type:GRIDTYPE}>){
    for(let msg of msgs){
        const map_id = msg.map_id;
        if(msg.flags & MapFlags.DELETED){
            console.log('Received deleted map');
        }
        const view = new_map_view(map_id);
        dungeon_map_views.push(view);
        const map = view.map;
        map.flags = msg.flags;
        map.grid_type = msg.grid_type;
        rename_map(map, msg.map_name);
        const objs = msg.objects;
        const length = objs.length;
        for(let i = 0; i < length; ++i){
            const obj = unstrip_obj(objs[i]);
            const existing_obj = map.canvas_objs.get(obj.id);
            if(existing_obj){
                console.log('object already exists???', obj.id);
            }
            else {
                add_canv_obj(map, obj);
            }
        }
    }
    request_render();
});
socket.on('canvas-create-objects', function(msgs:Array<{map_id:number;objects:Array<StrippedObj>}>){
    for(let msg of msgs){
        const map_id = msg.map_id;
        if(!MAPS.has(map_id)){
            console.log("creating objects for a map we don't have??", map_id);
        }
        const map = get_map(map_id);
        const objs = msg.objects;
        const length = objs.length;
        for(let i = 0; i < length; ++i){
            const obj = unstrip_obj(objs[i]);
            const existing_obj = map.canvas_objs.get(obj.id);
            if(existing_obj){
                console.log('object already exists???', obj.id);
            }
            else {
                add_canv_obj(map,obj);
            }
        }
    }
    request_render();
});
socket.on('canvas-delete', function(msg:{map_id:number;ids:Array<number>}){
    const map_id = msg.map_id;
    const map = get_map(map_id);
    const obj_ids = msg.ids;
    const length = obj_ids.length;
    for(let i = 0; i < length; i++){
        const id = obj_ids[i];
        const obj = map.canvas_objs.get(id);
        if(obj){
            obj.flags |= CANVASFLAG.DELETED;
        }
        else {
            console.log('Deleting unknown object??', id);
        }
    }
    request_render();
});


socket.on('canvas-update', function(msg:{map_id:number;obj_states:Array<StrippedObj>}){
    const map_id = msg.map_id;
    const map = get_map(map_id);
    const obj_states = msg.obj_states;
    set_obj_states_from_stripped_objs(map, obj_states);
    request_render();
});
function set_obj_states_from_stripped_objs(map:DungeonMap, obj_states:Array<StrippedObj>):void{
    const length = obj_states.length;
    for(let i = 0; i < length; ++i){
        const state = obj_states[i];
        const obj: CanvasObject = map.canvas_objs.get(state.id)!;
        if(!obj){
            console.log('Updating unknown object??', state.id);
            continue;
        }
        set_obj_from_stripped(obj, state);
    }
}

// These are a bit flags
// Select background things (walls, lines).
enum SELECTTYPE {
    MAP = 1 << 0,
    TOKEN = 1 << 1,
    BACKGROUND = 1 << 2,
    NONBACKGROUND = TOKEN | MAP,
    ANY = MAP | TOKEN | BACKGROUND,
}
let select_type: SELECTTYPE = SELECTTYPE.NONBACKGROUND;

function update_selection(view:DungeonMapView, x0:number, y0:number, x1:number, y1:number):void{
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
    view.selection_area.x0 = x0;
    view.selection_area.y0 = y0;
    view.selection_area.x1 = x1;
    view.selection_area.y1 = y1;
}
// Pray the JIT inlines this call.
function obj_in_bbox(obj_:CanvasObject, bbox:Bbox, selection_type:SELECTTYPE):boolean{
    switch(obj_.type){
        case CANVASTYPE.FREEHAND_LINE:
        case CANVASTYPE.GRID_LINE:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const obj = obj_ as (GridLine|FreehandLine);
            const outer_bbox: Bbox = {
                x0:obj.bbox.x0 + obj.base_x,
                y0:obj.bbox.y0 + obj.base_y,
                x1:obj.bbox.x1 + obj.base_x,
                y1:obj.bbox.y1 + obj.base_y,
            };
            if(!bbox_overlaps(outer_bbox, bbox))
                return false;
            const b_x = obj.base_x;
            const b_y = obj.base_y;
            let x0 = b_x;
            let y0 = b_y;
            const points = obj.points;
            const length = points.length;
            for(let i = 0; i < length; i+= 2){
                let x1 = points[i]+b_x;
                let y1 = points[i+1]+b_y;
                if(line_overlaps_bbox(bbox, x0, y0, x1, y1))
                    return true;
                x0 = x1;
                y0 = y1;
            }
            return false;
        }break;
        case CANVASTYPE.ELLIPSE: // this is wrong
        case CANVASTYPE.FILLED_RECT:
        case CANVASTYPE.RECT: // fall-through
        case CANVASTYPE.IMAGE: // fall-through
        case CANVASTYPE.GRID_RECT:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const obj = obj_ as (Ellipse | FilledRectangle | Rectangle | GridRectangle | ImageObj);
            const rect_bbox = {
                x0:obj.base_x,
                y0:obj.base_y,
                x1:obj.base_x+obj.width,
                y1:obj.base_y+obj.height,
            };
            return bbox_overlaps(bbox, rect_bbox);
        }break;
        case CANVASTYPE.IMG_TOKEN:// fall-through
        case CANVASTYPE.EZ_TOKEN:{
            if(!(selection_type & SELECTTYPE.TOKEN))
                return false;
            const obj = obj_ as (ImgToken | EzToken);
            const w = obj.width * REFERENCE_WIDTH;
            const h = obj.height * REFERENCE_WIDTH;
            // const radius_x = obj.width*REFERENCE_WIDTH/2;
            // const radius_y = obj.height*REFERENCE_WIDTH/2;
            const token_bbox = {
                x0: obj.base_x,
                x1: obj.base_x + w,
                y0: obj.base_y,
                y1: obj.base_y + h,
            };
            return bbox_overlaps(token_bbox, bbox);
        }break;
        case CANVASTYPE.TEXT:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const obj = obj_ as TextObj;
            const text_bbox = {
                x0:obj.bbox.x0 + obj.base_x,
                y0:obj.bbox.y0 + obj.base_y,
                x1:obj.bbox.x1 + obj.base_x,
                y1:obj.bbox.y1 + obj.base_y,
            };
            if(!bbox_overlaps(text_bbox, bbox))
                return false;
            for(let bb of obj.bboxes){
                const text_bbox = {
                    x0:bb.x0 + obj.base_x,
                    y0:bb.y0 + obj.base_y,
                    x1:bb.x1 + obj.base_x,
                    y1:bb.y1 + obj.base_y,
                };
                if(bbox_overlaps(text_bbox, bbox))
                    return true;
            }
            return false;
        }break;
        case CANVASTYPE.DOOR:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const obj = obj_ as DoorObj;
            const is_vertical = obj.orientation === ORIENTATION.VERTICAL;
            if(is_vertical){
                // FIXME: I just hardcoded some random values.
                const door_bbox = {
                    x0 : obj.base_x - 32 * obj.width,
                    x1 : obj.base_x + 32 * obj.width,
                    y0 : obj.base_y - 5,
                    y1 : obj.base_y + 5,
                };
                return bbox_overlaps(bbox, door_bbox);
            }
            else {
                // FIXME: I just hardcoded some random values.
                const door_bbox = {
                    x0 : obj.base_x - 5,
                    x1 : obj.base_x + 5,
                    y0 : obj.base_y - 32 * obj.width,
                    y1 : obj.base_y + 32 * obj.width,
                };
                return bbox_overlaps(bbox, door_bbox);
            }
        }break;
        case CANVASTYPE.STAIRS:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const obj = obj_ as Stairs;
            if(!obj.width || !obj.height)
                return false;
            const w = obj.width*REFERENCE_WIDTH;
            const h = obj.height*REFERENCE_WIDTH;
            const stairs_bbox = {
                    x0 : obj.base_x,
                    x1 : obj.base_x + w,
                    y0 : obj.base_y,
                    y1 : obj.base_y+h
            };
            return bbox_overlaps(bbox, stairs_bbox);
        }break;
        case CANVASTYPE.MEASURE:
            return false;
        case CANVASTYPE.FIXTURE:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const obj = obj_ as FixtureObj;
            if(!obj.width || !obj.height)
                return false;
            const f_bbox = {
                    x0 : obj.base_x,
                    x1 : obj.base_x + obj.width,
                    y0 : obj.base_y,
                    y1 : obj.base_y + obj.height
            };
            return bbox_overlaps(bbox, f_bbox);
        }
        case CANVASTYPE.FILLED_TILE:{
            if(!(selection_type & SELECTTYPE.BACKGROUND))
                return false;
            // const obj = obj_ as FilledTile;
            // kind of cheesy.
            const ftbbox = {
                x0: obj_.base_x,
                x1: obj_.base_x + REFERENCE_WIDTH,
                y0: obj_.base_y,
                y1: obj_.base_y + REFERENCE_WIDTH,
            };
            return bbox_overlaps(bbox, ftbbox);
        }
    }
}
function note_selections(view:DungeonMapView):void{
    const canvas_obj_array = view.map.canvas_obj_array;
    const length = canvas_obj_array.length;
    const x0 = view.selection_area.x0;
    const y0 = view.selection_area.y0;
    const x1 = view.selection_area.x1;
    const y1 = view.selection_area.y1;
    const selection_bbox = {x0:x0, y0:y0, x1:x1, y1:y1};
    const selection_type = select_type;
    const selected = view.selected;
    if(view.selection_area.select_one){
        for(let i = length-1; i >=0; --i){
            const obj = canvas_obj_array[i];
            if(obj.flags & CANVASFLAG.DELETED)
                continue;
            if(obj_in_bbox(obj, selection_bbox, selection_type)){
                selected.add(obj.id);
                break;
            }
        }
    }
    else {
        for(let i = 0; i < length; ++i){
            const obj = canvas_obj_array[i];
            if(obj.flags & CANVASFLAG.DELETED)
                continue;
            if(obj_in_bbox(obj, selection_bbox, selection_type)){
                selected.add(obj.id);
            }
        }
    }
}
function selection_is_rigid(view:DungeonMapView):boolean{
    // hack
    if(view.map.grid_type == GRIDTYPE.HEX)
        return false;
    for(let id of view.selected){
        const obj = view.map.canvas_objs.get(id)!;
        if(obj.flags & CANVASFLAG.DELETED)
            continue;
        switch(obj.type){
            case CANVASTYPE.GRID_RECT:
            case CANVASTYPE.GRID_LINE:
            case CANVASTYPE.IMAGE:
            case CANVASTYPE.DOOR:
            case CANVASTYPE.EZ_TOKEN:
            case CANVASTYPE.IMG_TOKEN:
            case CANVASTYPE.STAIRS:
                return true;
            default:
                break;
        }
    }
    return false;
}
function there_are_selected_objs_at(view:DungeonMapView, x0:number, y0:number, x1:number, y1:number):boolean{
    const selection_bbox = {x0:x0, y0:y0, x1:x1, y1:y1,};
    const selection_type = select_type;
    for(let id of view.selected){
        const obj = view.map.canvas_objs.get(id) as CanvasObject;
        if(obj.flags & CANVASFLAG.DELETED)
            continue;
        if(obj_in_bbox(obj, selection_bbox, selection_type))
            return true;
    }
    return false;
}
function finalize_selection(view:DungeonMapView):void{
    view.selected.clear();
    view.selection_area.is_selecting = false;
    note_selections(view);
    request_render();
}
function end_selecting(view:DungeonMapView):void{
    view.selected.clear();
    view.selection_area.is_selecting = false;
    request_render();
}
function change_select_mode(mode:SELECTTYPE):void{
    select_type = mode;
    for(let view of dungeon_map_views){
        view.selected.clear();
        note_selections(view);
    }
    request_render();
}
function move_selected_objects(view:DungeonMapView, rigid:boolean, base_x:number, base_y:number, dx:number, dy:number){
    const selected_objs = [];
    for(let item of view.selected){
        const obj = view.map.canvas_objs.get(item)!;
        if(obj.flags & CANVASFLAG.DELETED)
            continue;
        selected_objs.push(obj);
    }
    if(!selected_objs.length)
        return;
    if(rigid){
        const ox = base_x + dx;
        const oy = base_y + dy;
        let m = snapmode == SNAPMODE.HALF? REFERENCE_WIDTH/2-1 : REFERENCE_WIDTH-1;
        const aligned_old_x = base_x - (base_x & m);
        const aligned_old_y = base_y - (base_y & m);
        const aligned_new_x = ox - (ox & m);
        const aligned_new_y = oy - (oy & m);
        dx = aligned_new_x - aligned_old_x;
        dy = aligned_new_y - aligned_old_y;
        dx = Math.round(dx/64)*64;
        dy = Math.round(dy/64)*64;
        if(dx || dy){
            for(let i = 0; i < selected_objs.length; i++){
                const obj = selected_objs[i];
                translate_object(obj, dx, dy);
            }
        }
    }
    else {
        for(let i = 0; i < selected_objs.length; i++){
            const obj = selected_objs[i];
            translate_object(obj, dx, dy);
        }
    }
    request_render();
}

function add_canv_obj(map:DungeonMap, obj:CanvasObject):void{
    map.canvas_objs.set(obj.id, obj);
    map.canvas_obj_array.push(obj);
    map.is_sorted = false;
}

//
// Returns a brand new object that is the stripped version of the given object.
// Things like arrays are created fresh to avoid sharing state.
//
function strip_obj(obj_:CanvasObject): StrippedObj{
    switch(obj_.type){
        case CANVASTYPE.FREEHAND_LINE:{
            const obj = obj_ as FreehandLine;
            const stripped_obj: StrippedFreehandLine = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                thickness: obj.thickness,
                points: Array.from(obj.points),
                color: obj.color,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.GRID_LINE:{
            const obj = obj_ as GridLine;
            const stripped_obj: StrippedGridLine = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                points: Array.from(obj.points),
                color: obj.color,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.ELLIPSE:{
            const obj = obj_ as Ellipse;
            const stripped_obj: StrippedEllipse = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                width: obj.width, height:obj.height,
                color: obj.color, color2: obj.color2,
                variant: obj.variant,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.FILLED_RECT:{
            const obj = obj_ as FilledRectangle;
            const stripped_obj: StrippedFilledRectangle = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                width: obj.width, height:obj.height,
                color: obj.color, color2: obj.color2,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.RECT:{
            const obj = obj_ as Rectangle;
            const stripped_obj: StrippedRectangle = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                width: obj.width, height:obj.height,
                color: obj.color,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.GRID_RECT:{
            const obj = obj_ as GridRectangle;
            const stripped_obj: StrippedRectangle = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                width: obj.width, height:obj.height,
                color: obj.color,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.IMAGE:{
            const obj = obj_ as ImageObj;
            const stripped_obj: StrippedImageObj = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                width: obj.width, height:obj.height,
                url: obj.url,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.TEXT:{
            const obj = obj_ as TextObj;
            const stripped_obj: StrippedTextObj = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                text: obj.text, size: obj.size, alignment:obj.alignment,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.EZ_TOKEN:{
            const obj = obj_ as EzToken;
            const stripped_obj: StrippedEzToken = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                width: obj.width, height:obj.height,
                color: obj.color, text: obj.text,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.IMG_TOKEN:{
            const obj = obj_ as ImgToken;
            const stripped_obj: StrippedImgToken = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                width: obj.width, height:obj.height,
                url: obj.url,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.DOOR:{
            const obj = obj_ as DoorObj;
            const stripped_obj: StrippedDoorObj = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                width: obj.width,
                color: obj.color,
                doortype: obj.doortype,
                orientation: obj.orientation,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.STAIRS:{
            const obj = obj_ as Stairs;
            const stripped_obj: StrippedStairs = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                width: obj.width, height:obj.height,
                rotation: obj.rotation,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.MEASURE:{
            const obj = obj_ as MeasureObj;
            const stripped_obj: StrippedMeasureObj = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                x1: obj.x1, y1: obj.y1,
                color: obj.color,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.FIXTURE:{
            const obj = obj_ as FixtureObj;
            const stripped_obj: StrippedFixtureObj = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                width: obj.width, height: obj.height,
                ftype: obj.ftype,
            };
            return stripped_obj;
        }break;
        case CANVASTYPE.FILLED_TILE:{
            const obj = obj_ as FilledTile;
            const stripped_obj: StrippedFilledTile = {
                type: obj.type, id: obj.id, flags: obj.flags,
                base_x: obj.base_x, base_y: obj.base_y,
                color: obj.color,
            };
            return stripped_obj;
        }break;
    }
}
//
// Returns a brand new object that is the unstripped version of the given object.
// Things like arrays are created fresh to avoid sharing state.
//
function unstrip_obj(obj_: StrippedObj):CanvasObject{
    switch(obj_.type){
        case CANVASTYPE.FREEHAND_LINE:{
            const obj:FreehandLine = {
                ...(obj_ as StrippedFreehandLine),
                bbox:{x0:0, x1:0, y0:0, y1:0}
            };
            obj.points = Array.from(obj.points),
            freehand_recalculate_bbox(obj);
            freehand_recalculate_path(obj);
            return obj;
            }break;
        case CANVASTYPE.GRID_LINE:{
            const obj:GridLine = {
                ...(obj_ as StrippedGridLine),
                bbox:{x0:0, x1:0, y0:0, y1:0},
            };
            obj.points = Array.from(obj.points),
            gridline_recalculate_bbox(obj);
            gridline_recalculate_path(obj);
            return obj;
        }break;
        case CANVASTYPE.FILLED_RECT:{
            const obj:FilledRectangle = {...(obj_ as StrippedFilledRectangle)};
            return obj;
        }break;
        case CANVASTYPE.ELLIPSE:{
            const obj:Ellipse = {...(obj_ as StrippedEllipse)};
            return obj;
        }break;
        case CANVASTYPE.RECT:{
            const obj:Rectangle = {...(obj_ as StrippedRectangle)};
            return obj;
        }break;
        case CANVASTYPE.GRID_RECT:{
            const obj: GridRectangle = {...(obj_ as StrippedGridRectangle)};
            return obj;
        }break;
        case CANVASTYPE.IMAGE:{
            const obj: ImageObj = {...(obj_ as StrippedImageObj)};
            const img = new Image(obj.width, obj.height);
            img.addEventListener('load', function(){
                obj.img = img;
                request_render();
            }, {once:true});
            img.src = obj.url;
            return obj;
        }break;
        case CANVASTYPE.TEXT:{
            const obj: TextObj = {
                ...(obj_ as StrippedTextObj),
                bbox:{x0:0, x1:0, y0:0, y1:0},
                lines: (obj_ as StrippedTextObj).text.split('\n'),
                bboxes: [],
            };
            return obj;
        }break;
        case CANVASTYPE.EZ_TOKEN:{
            const obj: EzToken = {
                ...(obj_ as StrippedEzToken),
            };
            return obj;
        }break;
        case CANVASTYPE.IMG_TOKEN:{
            const obj: ImgToken = {
                ...(obj_ as StrippedImgToken),
            };
            const img = new Image(obj.width, obj.height);
            img.addEventListener('load', function(){
                obj.img = img;
                request_render();
            }, {once:true});
            img.src = obj.url;
            return obj;
        }break;
        case CANVASTYPE.DOOR:{
            const obj:DoorObj = {
                ...(obj_ as StrippedDoorObj),
            };
            return obj;
        }break;
        case CANVASTYPE.STAIRS:{
            const obj: Stairs = {
                ...(obj_ as StrippedStairs),
            };
            return obj;
        }break;
        case CANVASTYPE.MEASURE:{
            const obj: MeasureObj = {
                ...(obj_ as StrippedMeasureObj),
            };
            return obj;
            // all fields are good
        }break;
        case CANVASTYPE.FIXTURE:{
            const obj: FixtureObj = {
                ...(obj_ as StrippedFixtureObj),
            };
            return obj;
        }break;
        case CANVASTYPE.FILLED_TILE:{
            const obj: FilledTile = {
                ...(obj_ as StrippedFilledTile),
            };
            return obj;
        }break;
    }
}

//
// Updates the fields of the first given to be the same as the second.
// Arrays and such are made fresh to avoid sharing state.
//
function set_obj_from_stripped(obj_: CanvasObject, state:StrippedObj){
    switch(obj_.type){
        case CANVASTYPE.FREEHAND_LINE:{
            const obj = obj_ as FreehandLine;
            Object.assign(obj, state);
            obj.bbox = {x0:0, x1:0, y0:0, y1:0};
            obj.points = Array.from((state as StrippedFreehandLine).points);
            freehand_recalculate_bbox(obj);
            freehand_recalculate_path(obj);
        }break;
        case CANVASTYPE.GRID_LINE:{
            const obj = obj_ as GridLine;
            Object.assign(obj, state);
            obj.bbox = {x0:0, x1:0, y0:0, y1:0};
            obj.points = Array.from((state as StrippedGridLine).points);
            gridline_recalculate_bbox(obj);
            gridline_recalculate_path(obj);
        }break;
        case CANVASTYPE.IMAGE:{
            const obj = obj_ as ImageObj;
            const state_ = state as StrippedImageObj;
            const needs_new_image = (obj.width !== state_.width) || (obj.height !== state_.height) || (obj.url !== state_.url);
            Object.assign(obj, state);
            if(needs_new_image){
                const img = new Image(obj.width, obj.height);
                img.addEventListener('load', function(){
                    obj.img = img;
                    request_render();
                }, {once:true});
                img.src = obj.url;
            }
        }break;
        case CANVASTYPE.TEXT:{
            const obj = obj_ as TextObj;
            Object.assign(obj, state);
            obj.bbox = {x0:0, x1:0, y0:0, y1:0};
            obj.bboxes = [];
            obj.lines = obj.text.split('\n');
        }break;
        default:
            Object.assign(obj_, state);
            break;
    }

}
function publish_delete_by_ids(map_id:number, ids:Array<number>):void{
    socket.emit('canvas-delete', {map_id:map_id, ids:ids})
}
function publish_obj_by_id(map:DungeonMap, id:number):void{
    const obj = map.canvas_objs.get(id);
    if(!obj){
        console.log('invalid id given for publishing:', id);
        return;
    }
    const stripped_obj = strip_obj(obj);
    socket.emit('canvas-create-objects', {map_id:map.map_id, object:stripped_obj});
}
function get_stripped_state_by_id(map:DungeonMap, ids:Array<number>):Array<StrippedObj>{
    const length = ids.length;
    const updates = []
    for(let i = 0; i < length; ++i){
        const id = ids[i];
        const obj = map.canvas_objs.get(id);
        if(!obj){
            console.log('Invalid id given for publishing update', id);
            continue;
        }
        const stripped = strip_obj(obj);
        updates.push(stripped);
    }
    return updates;
}
function publish_obj_updates(map_id:number, updates:Array<StrippedObj>){
    socket.emit('canvas-update', {map_id:map_id, obj_states:updates});
}

function edit_is_impossible(view:DungeonMapView):boolean{
    if(view.selected.size !== 1)
        return true;
    const first = view.selected.values().next().value;
    const obj = view.map.canvas_objs.get(first)!;
    if(obj.flags & CANVASFLAG.DELETED)
        return true;
    switch(obj.type){
        case CANVASTYPE.FREEHAND_LINE:
            return true;
        case CANVASTYPE.GRID_LINE:
            return true;
        case CANVASTYPE.RECT:
            return true;
        case CANVASTYPE.GRID_RECT:
            return true;
        case CANVASTYPE.ELLIPSE:
            return true;
        case CANVASTYPE.FILLED_RECT:
            return true;
        case CANVASTYPE.IMAGE:
            return false;
        case CANVASTYPE.TEXT:
            return false;
        case CANVASTYPE.EZ_TOKEN:
            return false;
        case CANVASTYPE.IMG_TOKEN:
            return false;
        case CANVASTYPE.DOOR:
            return true;
        case CANVASTYPE.STAIRS:
            return true;
        case CANVASTYPE.MEASURE:
            return true; // should be unreachable
        case CANVASTYPE.FIXTURE:
            return true;
    }
    return false;
}

function launch_edit_dialog(view:DungeonMapView):void{
    if(view.selected.size !== 1)
        return;
    const first = view.selected.values().next()!.value;
    const obj_:CanvasObject = view.map.canvas_objs.get(first)!;
    if(obj_.flags & CANVASFLAG.DELETED)
        return;
    switch(obj_.type){
        case CANVASTYPE.FREEHAND_LINE:
            return;
        case CANVASTYPE.GRID_LINE:
            return;
        case CANVASTYPE.RECT:
            return;
        case CANVASTYPE.GRID_RECT:
            return;
        case CANVASTYPE.ELLIPSE:
            return;
        case CANVASTYPE.FILLED_RECT:
            return;
        case CANVASTYPE.IMAGE:
            return;
        case CANVASTYPE.TEXT:{
            const obj = obj_ as TextObj;
            const html = `
            <h2>Edit Text</h2>
            <table class="input-container">
                <tr>
                    <td><label for="text-size">Size:</label>
                    <td><input type="number" id="text-size" name="text-size" min="8" max="72" value="${obj.size}" class="numeric-input">
                </tr>
                <tr>
                    <td><span>Alignment:</span>
                    <td><input type="radio" id="text-align-left" name="text-align" value="auto"  ${obj.alignment == TEXTALIGNMENT.LEFT?'checked':''}>
                    <label for="text-align-left">Left</label>
                    <input type="radio" id="text-align-center" name="text-align" value="auto" ${obj.alignment == TEXTALIGNMENT.CENTER?'checked':''}>
                    <label for="text-align-center">Center</label>
                    <input type="radio" id="text-align-right" name="text-align" value="auto" ${obj.alignment == TEXTALIGNMENT.RIGHT?'checked':''}>
                    <label for="text-align-right">Right</label>
                    </td>
                </tr>
                <tr>
                    <td><label for="hover-text">Text:</label>
                    <td><textarea name="hover-text" id="hover-text"  cols="30" rows="5"></textarea>
                </tr>
            </table>
            `;
            function insert_obj_text(){
                const ta = document.getElementById('hover-text')! as HTMLTextAreaElement;
                ta.textContent = obj.text;
            }
            make_ok_dialog2(html, insert_obj_text, function(hoverpop){
                const number_input = document.getElementById('text-size')! as HTMLInputElement;
                const number = +number_input.value;
                const text_input = document.getElementById('hover-text')! as HTMLTextAreaElement;
                const text = text_input.value.trim();
                if(!text)
                    return;
                const tac = document.getElementById('text-align-center')! as HTMLInputElement;
                const tar = document.getElementById('text-align-right')! as HTMLInputElement;
                if(tac.checked)
                    obj.alignment = TEXTALIGNMENT.CENTER;
                else if(tar.checked)
                    obj.alignment = TEXTALIGNMENT.RIGHT;
                else
                    obj.alignment = TEXTALIGNMENT.LEFT;
                obj.size = number;
                obj.text = text;
                obj.bbox = {x0:0, y0:0, x1:0, y1:0};
                obj.bboxes = [];
                obj.lines = text.split('\n');
                const after = strip_obj(obj);
                publish_obj_updates(view.map.map_id, [after]);
                request_render();
            });
        }return;
        case CANVASTYPE.EZ_TOKEN:{
            const obj = obj_ as EzToken;
            const html = `
            <h2>Edit Token</h2>
            <table class="input-container">
                <tr>
                    <td><label for="color">Color:</label>
                    <td><input type="color" id="hover-color" value="${obj.color}">
                </tr>
                <tr>
                    <td><label for="width">Width (sq):</label>
                    <td><input type="number" name="width" id="hover-width" min="1" max="5" value="${obj.width}" class="numeric-input">
                    <td><label for="height">Height (sq):</label>
                    <td><input type="number" name="height" id="hover-height" min="1" max="5" value="${obj.height}" class="numeric-input">
                </tr>
                <tr>
                    <td><label for="text">Text:</label>
                    <td colspan="3"><input type="text" name="text" id="hover-text" value="${obj.text}">
                </tr>
            </table>
            `;
            make_ok_dialog(html, function(hoverpop){
                const text_input = document.getElementById('hover-text')! as HTMLInputElement;
                const text = text_input.value;
                if(text){
                    obj.text = text;
                }
                let width = +((document.getElementById('hover-width') as HTMLInputElement).value);
                let height = +((document.getElementById('hover-height') as HTMLInputElement).value);
                if(!width)
                    width = 1;
                if(!height)
                    height = 1;
                obj.width = width;
                obj.height = height;
                const color = (document.getElementById('hover-color') as HTMLInputElement).value;
                obj.color = color;
                const after = strip_obj(obj);
                publish_obj_updates(view.map.map_id, [after]);
                request_render();
            });
        }return;
        case CANVASTYPE.IMG_TOKEN:{
        }return;
        case CANVASTYPE.DOOR:
            return;
        case CANVASTYPE.STAIRS:
            return;
        case CANVASTYPE.MEASURE:
            return;
        case CANVASTYPE.FIXTURE:
            return;
    }
}

// State variable so that we don't double render in a single frame.
// requestAnimationFrame calls stack, so to avoid double drawing, you
// need to keep track of this.
let animation_requested = false;
function request_render():void{
    if(animation_requested){
        return;
    }
    animation_requested = true;
    // only call this from here to avoid double renders.
    requestAnimationFrame(render);
}
let RUBBLEIMAGE: HTMLImageElement | null = new Image();
RUBBLEIMAGE.addEventListener('error', function(){
    RUBBLEIMAGE = null;
});
if(RUBBLEIMAGE)
    RUBBLEIMAGE.src = '/imgs/rubble.png';
// const timings: Array<number> = [];
function render(timestamp:DOMHighResTimeStamp):void{
    // const before = performance.now();
    if(!ctx)
        return;
    const view = get_active_view();
    if(!view)
        return;
    const map = view.map;
    sort_canv_objs(map);
    if(view.selection_area.is_selecting){
        view.selected.clear();
        note_selections(view);
    }
    let background = '#fff';
    if(DARKMODE)
        background = '#333';
    const SELECTED_COLOR = '#33ffdd';
    const canvas_obj_array = map.canvas_obj_array;
    const selected = view.selected;
    const camera_x = Math.round(view.camera_x);
    const camera_y = Math.round(view.camera_y);
    const scale = view.scale;
    animation_requested = false;
    const width = canvas.width;
    const height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    let SCALE = scale;
    const BACKGROUND = background;
    const canvas_bbox = {
        x0:-camera_x,
        y0:-camera_y,
        x1:-camera_x+width/scale,
        y1:-camera_y+height/scale,
    };
    {
        const bgtiles: Array<FilledTile> = [];
        const length = canvas_obj_array.length;
        for(let i = 0; i < length; ++i){
            const obj_ = canvas_obj_array[i];
            if(obj_.flags & CANVASFLAG.DELETED)
                continue;
            if(obj_.type != CANVASTYPE.FILLED_TILE)
                continue;
            bgtiles.push(obj_ as FilledTile);
        }
        ctx.scale(SCALE, SCALE);
        ctx.translate(camera_x, camera_y);
        ctx.font = 12 + 'px sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'center';
        switch(map.grid_type){
            case GRIDTYPE.SQUARE:{
                for(let obj of bgtiles){
                    const rect_bbox = {
                        x0:obj.base_x,
                        y0:obj.base_y,
                        x1:obj.base_x+REFERENCE_WIDTH,
                        y1:obj.base_y+REFERENCE_WIDTH,
                    };
                    if(!bbox_overlaps(rect_bbox, canvas_bbox)){
                        continue;
                    }
                    const is_selected = selected.has(obj.id);
                    if(is_selected)
                        ctx.fillStyle = SELECTED_COLOR;
                    else
                        ctx.fillStyle = obj.color;
                    ctx.fillRect(obj.base_x, obj.base_y, REFERENCE_WIDTH, REFERENCE_WIDTH);
                }
            }break;
            case GRIDTYPE.HEX:{
                const half = REFERENCE_WIDTH/2;
                const full = REFERENCE_WIDTH;
                const p = new Path2D();
                p.moveTo(-9, half);
                p.lineTo(+9, full);
                p.lineTo(REFERENCE_WIDTH-9, full);
                p.lineTo(REFERENCE_WIDTH+9, half);
                p.lineTo(REFERENCE_WIDTH-9, 0);
                p.lineTo(+9, 0);
                p.closePath();
                for(let obj of bgtiles){
                    const rect_bbox = {
                        x0:obj.base_x,
                        y0:obj.base_y,
                        x1:obj.base_x+REFERENCE_WIDTH,
                        y1:obj.base_y+REFERENCE_WIDTH,
                    };
                    if(!bbox_overlaps(rect_bbox, canvas_bbox)){
                        continue;
                    }
                    ctx.save();
                    const is_selected = selected.has(obj.id);
                    if(is_selected)
                        ctx.fillStyle = SELECTED_COLOR;
                    else
                        ctx.fillStyle = obj.color;
                    ctx.translate(obj.base_x, obj.base_y);
                    ctx.fill(p);
                    if(map.flags & MapFlags.NUMBERED){
                        if(obj.color == '#000000')
                            ctx.fillStyle = '#ffffff';
                        else
                            ctx.fillStyle = '#000000';
                        ctx.fillText(`${obj.base_x>>6},${obj.base_y>>6}`, 32, 63);
                    }
                    ctx.restore();
                }
            }break;
            case GRIDTYPE.NOGRID:{
            }break;
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = 'rgb(150, 150, 150)';
    switch(map.grid_type){
        case GRIDTYPE.SQUARE:{
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
        }break;
        case GRIDTYPE.HEX:{
            function draw_hex_grid(){
                let top_left_hex_x = Math.ceil(camera_x / REFERENCE_WIDTH);
                if(((camera_x) & (REFERENCE_WIDTH-1)) == 0){
                    top_left_hex_x++;
                }
                let grid_base_x = camera_x & (REFERENCE_WIDTH-1);
                let grid_base_y = camera_y & (REFERENCE_WIDTH-1);
                ctx.lineWidth = 1;
                // ctx.strokeStyle = '#000000';
                ctx.strokeStyle = '#888888';
                grid_base_x -= REFERENCE_WIDTH;
                const half = REFERENCE_WIDTH/2;
                const full = REFERENCE_WIDTH;
                const p = new Path2D();
                p.moveTo(-9, -half);
                let n_y = Math.ceil(height/SCALE/REFERENCE_WIDTH)+3;
                for(let i = 0; i < n_y; i++){
                    p.lineTo(-9, i*full-half);
                    p.lineTo(+9, i*full);
                    p.lineTo(-9+full, i*full);
                    p.lineTo(+9, i*full);
                }
                ctx.save();
                if(top_left_hex_x & 1)
                    ctx.translate(grid_base_x-full, grid_base_y-full);
                else
                    ctx.translate(grid_base_x-full, grid_base_y-half);
                let n_x = Math.ceil(width/SCALE/REFERENCE_WIDTH)+3;
                for(let i = 0; i < n_x; i++){
                    ctx.translate(full, -half);
                    ctx.stroke(p);
                    ctx.translate(full, +half);
                    ctx.stroke(p);
                }
                ctx.restore();
            }
        draw_hex_grid();
        }break;
        case GRIDTYPE.NOGRID:
            // draw no grid... duh!
            break;
    }
    ctx.translate(camera_x, camera_y);
    let length = canvas_obj_array.length;
    for(let i = 0; i < length; ++i){
        let obj_ = canvas_obj_array[i];
        if(obj_.flags & CANVASFLAG.DELETED)
            continue;
        const is_selected = selected.has(obj_.id);
        switch(obj_.type){
            case CANVASTYPE.FREEHAND_LINE:{
                const obj = obj_ as FreehandLine;
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
                    const oldcap = ctx.lineCap;
                    const oldjoin = ctx.lineJoin;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    if(is_selected){
                        ctx.lineWidth=obj.thickness+4;
                        ctx.strokeStyle = SELECTED_COLOR;
                        ctx.stroke(obj.path);
                    }
                    ctx.lineWidth = obj.thickness;
                    ctx.strokeStyle = obj.color;
                    ctx.stroke(obj.path);
                    ctx.lineCap = oldcap;
                    ctx.lineJoin = oldjoin;
                }
            }break;
            case CANVASTYPE.GRID_LINE:{
                const obj = obj_ as GridLine;
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
                const oldcap = ctx.lineCap;
                const oldjoin = ctx.lineJoin;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                if(obj.path){
                    if(is_selected){
                        ctx.lineWidth=12;
                        ctx.strokeStyle = SELECTED_COLOR;
                        ctx.stroke(obj.path);
                    }
                    ctx.lineWidth = 6;
                    ctx.strokeStyle = obj.color;
                    ctx.stroke(obj.path);
                }
                ctx.lineCap = oldcap;
                ctx.lineJoin = oldjoin;
            }break;
            case CANVASTYPE.ELLIPSE:{
                const obj = obj_ as Ellipse;
                const bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+obj.width,
                    y1:obj.base_y+obj.height,
                };
                if(!bbox_overlaps(bbox, canvas_bbox))
                    break;
                const cx = obj.base_x+obj.width/2;
                const cy = obj.base_y+obj.height/2;
                if(obj.width && obj.height){
                    if(is_selected){
                        ctx.lineWidth=8;
                        ctx.strokeStyle = SELECTED_COLOR;
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, obj.width/2, obj.height/2, 0, 0, Math.PI*2);
                        ctx.stroke();
                    }
                    ctx.lineWidth=4;
                    ctx.beginPath();
                    ctx.strokeStyle = obj.color;
                    ctx.ellipse(cx, cy, obj.width/2, obj.height/2, 0, 0, Math.PI*2);
                    ctx.stroke();
                    switch(obj.variant){
                        case ELLIPSETYPE.HOLLOW:
                            break;
                        case ELLIPSETYPE.SOLID:
                            ctx.fillStyle = obj.color;
                            ctx.fill();
                            break;
                        case ELLIPSETYPE.FILLED:
                            ctx.fillStyle = obj.color2;
                            ctx.fill();
                            break;
                    }
                }
            }break;
            case CANVASTYPE.FILLED_RECT:{
                const obj = obj_ as FilledRectangle;
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
            case CANVASTYPE.RECT:{
                const obj = obj_ as Rectangle;
                const rect_bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+obj.width,
                    y1:obj.base_y+obj.height,
                };
                if(!bbox_overlaps(rect_bbox, canvas_bbox)){
                    break;
                }
                // if(obj.width && obj.height){
                if(1){
                    if(is_selected){
                        ctx.lineWidth=8;
                        ctx.strokeStyle = SELECTED_COLOR;
                        ctx.strokeRect(obj.base_x-2, obj.base_y-2, obj.width+4, obj.height+4);
                    }
                    ctx.lineWidth=6;
                    ctx.strokeStyle = obj.color;
                    ctx.strokeRect(obj.base_x, obj.base_y, obj.width, obj.height);
                }
            }break;
            case CANVASTYPE.GRID_RECT:{
                const obj = obj_ as GridRectangle;
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
                        ctx.fillStyle = SELECTED_COLOR;
                        ctx.fillRect(obj.base_x-2, obj.base_y-2, obj.width+4, obj.height+4);
                    }
                    ctx.fillStyle = obj.color;
                    ctx.fillRect(obj.base_x-0.5, obj.base_y-0.5, obj.width+1, obj.height+1);
                }
            }break;
            case CANVASTYPE.TEXT:{
                const obj = obj_ as TextObj;
                if(obj.text){
                    let y_off = 0;
                    ctx.font = obj.size + 'px sans-serif';
                    ctx.textBaseline = 'middle';
                    switch(obj.alignment){
                        case TEXTALIGNMENT.LEFT:
                            ctx.textAlign = 'left';
                            break;
                        case TEXTALIGNMENT.CENTER:
                            ctx.textAlign = 'center';
                            break;
                        case TEXTALIGNMENT.RIGHT:
                            ctx.textAlign = 'right';
                            break;
                    }
                    if(obj.bboxes.length != obj.lines.length){
                        for(let i = 0; i < obj.lines.length; i++){
                            obj.bboxes.push({x0:0, y0:0, x1:0, y1:0});
                        }
                    }
                    for(let i = 0; i < obj.lines.length; i++){
                        const line = obj.lines[i];
                        const bbox = obj.bboxes[i];

                        if(bbox.x0 == bbox.x1){
                            const metric = ctx.measureText(line);
                            // Metric object varies between browser, but I believe
                            // they all have width?
                            const width = metric.width;
                            // Only some have this property.
                            const height = metric.fontBoundingBoxAscent? metric.fontBoundingBoxAscent + 2 : obj.size;
                            switch(obj.alignment){
                                case TEXTALIGNMENT.LEFT:
                                    bbox.x0 = -2;
                                    bbox.x1 = width+2;
                                    break;
                                case TEXTALIGNMENT.CENTER:
                                    bbox.x0 = -width/2-2;
                                    bbox.x1 = width/2+2;
                                    break;
                                case TEXTALIGNMENT.RIGHT:
                                    bbox.x0 = -width-2;
                                    bbox.x1 = 2;
                                    break;
                            }
                            bbox.y0 = -height/2 + y_off-2;
                            bbox.y1 = height/2 + y_off+2;
                        }
                        const text_bbox = {
                            x0:bbox.x0 + obj.base_x,
                            y0:bbox.y0 + obj.base_y,
                            x1:bbox.x1 + obj.base_x,
                            y1:bbox.y1 + obj.base_y,
                        };
                        if(bbox_overlaps(text_bbox, canvas_bbox)){
                            if(is_selected){
                                ctx.fillStyle = SELECTED_COLOR+'aa';
                                const x = obj.base_x+bbox.x0;
                                const y = obj.base_y+bbox.y0;
                                const width = bbox.x1-bbox.x0;
                                const height = bbox.y1-bbox.y0;
                                ctx.fillRect(x, y, width, height);
                            }
                            if(DARKMODE)
                                ctx.fillStyle = '#fff';
                            else
                                ctx.fillStyle = '#000';
                            ctx.fillText(line, obj.base_x, obj.base_y+y_off);
                        }
                        y_off += bbox.y1 - bbox.y0;
                    }
                    if(obj.bbox.x0 == obj.bbox.x1){
                        for(let bb of obj.bboxes){
                            if(obj.bbox.y0 > bb.y0)
                                obj.bbox.y0 = bb.y0;
                            if(obj.bbox.y1 < bb.y1)
                                obj.bbox.y1 = bb.y1;
                            if(obj.bbox.x0 > bb.x0)
                                obj.bbox.x0 = bb.x0;
                            if(obj.bbox.x1 < bb.x1)
                                obj.bbox.x1 = bb.x1;
                        }
                    }
                }
            }break;
            case CANVASTYPE.EZ_TOKEN:{
                const obj = obj_ as EzToken;
                // TODO: currently we don't consider radius_y
                const radius_x = obj.width*REFERENCE_WIDTH/2;
                const radius_y = obj.height*REFERENCE_WIDTH/2;
                if(!radius_x || !radius_y)
                    continue;
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
            case CANVASTYPE.IMAGE:{
                const obj = obj_ as ImageObj;
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
            case CANVASTYPE.IMG_TOKEN:{
                const obj = obj_ as ImgToken;
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
            case CANVASTYPE.DOOR:{
                const obj = obj_ as DoorObj;
                const is_vertical = obj.orientation === ORIENTATION.VERTICAL;
                const w = obj.width;
                if(!is_vertical){
                    // FIXME: I just hardcoded some random values.
                    const bbox = {
                        x0 : obj.base_x - 32 * w,
                        x1 : obj.base_x + 32 * w,
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
                        y0 : obj.base_y - 32 * w,
                        y1 : obj.base_y + 32 * w,
                    };
                    if(!bbox_overlaps(bbox, canvas_bbox)){
                        break;
                    }
                }
                switch(obj.doortype){
                    case DOORTYPE.DOUBLE:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case ORIENTATION.VERTICAL:
                                    ctx.strokeRect(obj.base_x-10*w, obj.base_y-24*w, 20*w, 48*w);
                                    break;
                                case ORIENTATION.HORIZONTAL:
                                    ctx.strokeRect(obj.base_x-24*w, obj.base_y-10*w, 48*w, 20*w);
                                    break;
                                case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x-22*w, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x+22*w, obj.base_y+22*w);
                                    ctx.stroke();
                                    break;
                                case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x+22*w, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x-22*w, obj.base_y+22*w);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.fillStyle = BACKGROUND;
                        ctx.strokeStyle = obj.color;
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case ORIENTATION.VERTICAL:
                                ctx.fillRect(obj.base_x-10*w, obj.base_y-24*w, 20*w, 48*w);
                                ctx.strokeRect(obj.base_x-10*w, obj.base_y-24*w, 20*w, 48*w);
                                ctx.strokeRect(obj.base_x-10*w, obj.base_y, 20*w, 1);
                                break;
                            case ORIENTATION.HORIZONTAL:
                                ctx.fillRect(obj.base_x-24*w, obj.base_y-10*w, 48*w, 20*w);
                                ctx.strokeRect(obj.base_x-24*w, obj.base_y-10*w, 48*w, 20*w);
                                ctx.strokeRect(obj.base_x, obj.base_y-10*w, 1, 20*w);
                                break;
                            case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-20*w, obj.base_y-20*w)
                                ctx.lineTo(obj.base_x+20*w, obj.base_y+20*w);
                                ctx.stroke();
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-16*w, obj.base_y-16*w)
                                ctx.lineTo(obj.base_x-2*w, obj.base_y-2*w);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+2*w, obj.base_y+2*w)
                                ctx.lineTo(obj.base_x+16*w, obj.base_y+16*w);
                                ctx.stroke();
                                break;
                            case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+20*w, obj.base_y-20*w)
                                ctx.lineTo(obj.base_x-20*w, obj.base_y+20*w);
                                ctx.stroke();
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+16*w, obj.base_y-16*w)
                                ctx.lineTo(obj.base_x+2*w, obj.base_y-2*w);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-2*w, obj.base_y+2*w)
                                ctx.lineTo(obj.base_x-16*w, obj.base_y+16*w);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DOORTYPE.DOOR:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case ORIENTATION.VERTICAL:
                                    ctx.strokeRect(obj.base_x-10*w, obj.base_y-24*w, 20*w, 48*w);
                                    break;
                                case ORIENTATION.HORIZONTAL:
                                    ctx.strokeRect(obj.base_x-24*w, obj.base_y-10*w, 48*w, 20*w);
                                    break;
                                case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x-22*w, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x+22*w, obj.base_y+22*w);
                                    ctx.stroke();
                                    break;
                                case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x+22*w, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x-22*w, obj.base_y+22*w);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.fillStyle = BACKGROUND;
                        ctx.strokeStyle = obj.color;
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case ORIENTATION.VERTICAL:
                                ctx.fillRect(obj.base_x-10*w, obj.base_y-24*w, 20*w, 48*w);
                                ctx.strokeRect(obj.base_x-10*w, obj.base_y-24*w, 20*w, 48*w);
                                break;
                            case ORIENTATION.HORIZONTAL:
                                ctx.fillRect(obj.base_x-24*w, obj.base_y-10*w, 48*w, 20*w);
                                ctx.strokeRect(obj.base_x-24*w, obj.base_y-10*w, 48*w, 20*w);
                                break;
                            case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-20*w, obj.base_y-20*w)
                                ctx.lineTo(obj.base_x+20*w, obj.base_y+20*w);
                                ctx.stroke();
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-16*w, obj.base_y-16*w)
                                ctx.lineTo(obj.base_x+16*w, obj.base_y+16*w);
                                ctx.stroke();
                                break;
                            case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+20*w, obj.base_y-20*w)
                                ctx.lineTo(obj.base_x-20*w, obj.base_y+20*w);
                                ctx.stroke();
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+16*w, obj.base_y-16*w)
                                ctx.lineTo(obj.base_x-16*w, obj.base_y+16*w);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DOORTYPE.PORTCULLIS:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case ORIENTATION.VERTICAL:
                                    ctx.strokeRect(obj.base_x-10*w, obj.base_y-16*w, 20*w, 32*w);
                                    break;
                                case ORIENTATION.HORIZONTAL:
                                    ctx.strokeRect(obj.base_x-16*w, obj.base_y-10*w, 32*w, 20*w);
                                    break;
                                case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x-22*w, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x+22*w, obj.base_y+22*w);
                                    ctx.stroke();
                                    break;
                                case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x+22*w, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x-22*w, obj.base_y+22*w);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.strokeStyle = BACKGROUND;
                        ctx.lineWidth=12;
                        ctx.setLineDash([6, 4]);
                        ctx.beginPath();
                        switch(obj.orientation){
                            case ORIENTATION.VERTICAL:
                                ctx.moveTo(obj.base_x, obj.base_y-20*w);
                                ctx.lineTo(obj.base_x, obj.base_y+28*w);
                                break;
                            case ORIENTATION.HORIZONTAL:
                                ctx.moveTo(obj.base_x-20*w, obj.base_y);
                                ctx.lineTo(obj.base_x+28*w, obj.base_y);
                                break;
                            case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                ctx.moveTo(obj.base_x-16*w, obj.base_y-16*w)
                                ctx.lineTo(obj.base_x+16*w, obj.base_y+16*w);
                                break;
                            case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                ctx.moveTo(obj.base_x+16*w, obj.base_y-16*w)
                                ctx.lineTo(obj.base_x-16*w, obj.base_y+16*w);
                                break;
                        }
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }break;
                    case DOORTYPE.PORTAL:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case ORIENTATION.VERTICAL:
                                    ctx.strokeRect(obj.base_x-10*w, obj.base_y-16*w, 20*w, 32*w);
                                    break;
                                case ORIENTATION.HORIZONTAL:
                                    ctx.strokeRect(obj.base_x-16*w, obj.base_y-10*w, 32*w, 20*w);
                                    break;
                                case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x-22*w, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x+22*w, obj.base_y+22*w);
                                    ctx.stroke();
                                    break;
                                case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x+22*w, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x-22*w, obj.base_y+22*w);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.fillStyle = BACKGROUND;
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case ORIENTATION.VERTICAL:
                                ctx.fillRect(obj.base_x-5, obj.base_y-16*w, 10, 32*w);
                                if((obj.base_x & (REFERENCE_WIDTH-1)) == 0){
                                    ctx.fillStyle = 'rgb(150, 150, 150)';
                                    ctx.fillRect(obj.base_x, obj.base_y-16*w, 1/SCALE, 32*w);
                                }
                                break;
                            case ORIENTATION.HORIZONTAL:
                                ctx.fillRect(obj.base_x-16*w, obj.base_y-5, 32*w, 10);
                                if((obj.base_y & (REFERENCE_WIDTH-1)) == 0){
                                    ctx.fillStyle = 'rgb(150, 150, 150)';
                                    ctx.fillRect(obj.base_x-16*w, obj.base_y, 32*w, 1/SCALE);
                                }
                                break;
                            case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-16*w, obj.base_y-16*w)
                                ctx.lineTo(obj.base_x+16*w, obj.base_y+16*w);
                                ctx.stroke();
                                break;
                            case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+16*w, obj.base_y-16*w)
                                ctx.lineTo(obj.base_x-16*w, obj.base_y+16*w);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DOORTYPE.HALLWAY:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case ORIENTATION.VERTICAL:
                                    ctx.strokeRect(obj.base_x-10*w, obj.base_y-32*w, 20*w, 64*w);
                                    break;
                                case ORIENTATION.HORIZONTAL:
                                    ctx.strokeRect(obj.base_x-32*w, obj.base_y-10*w, 64*w, 20*w);
                                    break;
                                case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x-32*w, obj.base_y-32*w)
                                    ctx.lineTo(obj.base_x+32*w, obj.base_y+32*w);
                                    ctx.stroke();
                                    break;
                                case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(obj.base_x+32*w, obj.base_y-32*w)
                                    ctx.lineTo(obj.base_x-32*w, obj.base_y+32*w);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.fillStyle = BACKGROUND;
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case ORIENTATION.VERTICAL:
                                ctx.fillRect(obj.base_x-5, obj.base_y-32*w+3, 10, 64*w-6);
                                if((obj.base_x & (REFERENCE_WIDTH-1)) == 0){
                                    ctx.fillStyle = 'rgb(150, 150, 150)';
                                    ctx.fillRect(obj.base_x, obj.base_y-32*w+3, 1/SCALE, 64*w-6);
                                }
                                break;
                            case ORIENTATION.HORIZONTAL:
                                ctx.fillRect(obj.base_x-32*w+3, obj.base_y-5, 64*w-6, 10);
                                if((obj.base_y & (REFERENCE_WIDTH-1)) == 0){
                                    ctx.fillStyle = 'rgb(150, 150, 150)';
                                    ctx.fillRect(obj.base_x-32*w+3, obj.base_y, 64*w-6, 1/SCALE);
                                }
                                break;
                            case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x-28*w, obj.base_y-28*w)
                                ctx.lineTo(obj.base_x+28*w, obj.base_y+28*w);
                                ctx.stroke();
                                break;
                            case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(obj.base_x+28*w, obj.base_y-28*w)
                                ctx.lineTo(obj.base_x-28*w, obj.base_y+28*w);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DOORTYPE.CURTAINS:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=4;
                            const r = 8;
                            switch(obj.orientation){
                                case ORIENTATION.VERTICAL:
                                    for(let y = obj.base_y-REFERENCE_WIDTH*w/2+r, i=0; y < obj.base_y+REFERENCE_WIDTH*w/2+r; y+= 2*r, i++){
                                        ctx.beginPath();
                                        ctx.arc(obj.base_x, y, r, Math.PI/2, 3*Math.PI/2, !!(i & 1));
                                        ctx.stroke();
                                    }
                                    break;
                                case ORIENTATION.HORIZONTAL:
                                    for(let x = obj.base_x-REFERENCE_WIDTH*w/2+r, i=0; x < obj.base_x+REFERENCE_WIDTH*w/2+r; x+= 2*r, i++){
                                        ctx.beginPath();
                                        ctx.arc(x, obj.base_y, r, 0, Math.PI, !!(i & 1));
                                        ctx.stroke();
                                    }
                                    break;
                                case ORIENTATION.TOPLEFT_DOWNRIGHT:{
                                    let r = 64*1.4159/12;
                                    for(let d = 0, i=0; i < w*6; d+= 2*r/1.4159, i++){
                                        ctx.beginPath();
                                        ctx.arc(obj.base_x-REFERENCE_WIDTH/2+d+r/1.41519, obj.base_y-REFERENCE_WIDTH/2+d+r/1.41519, r, Math.PI/4, 5*Math.PI/4, !!(i & 1));
                                        ctx.stroke();
                                    }
                                }break;
                                case ORIENTATION.TOPRIGHT_DOWNLEFT:{
                                    let r = 64*1.4159/12;
                                    for(let d = 0, i=0; i < w*6; d+= 2*r/1.4159, i++){
                                        ctx.beginPath();
                                        ctx.arc(obj.base_x-REFERENCE_WIDTH/2+d+r/1.41519, obj.base_y+REFERENCE_WIDTH/2-d-r/1.41519, r, 3*Math.PI/4, 7*Math.PI/4, !!(i & 1));
                                        ctx.stroke();
                                    }
                                }break;
                            }
                        }
                        ctx.strokeStyle = '#444';
                        ctx.lineWidth=2;
                        const r = 8;
                        switch(obj.orientation){
                            case ORIENTATION.VERTICAL:
                                for(let y = obj.base_y-REFERENCE_WIDTH*w/2+r, i=0; y < obj.base_y+REFERENCE_WIDTH*w/2+r; y+= 2*r, i++){
                                    ctx.beginPath();
                                    ctx.arc(obj.base_x, y, r, Math.PI/2, 3*Math.PI/2, !!(i & 1));
                                    ctx.stroke();
                                }
                                break;
                            case ORIENTATION.HORIZONTAL:
                                for(let x = obj.base_x-REFERENCE_WIDTH*w/2+r, i=0; x < obj.base_x+REFERENCE_WIDTH*w/2+r; x+= 2*r, i++){
                                    ctx.beginPath();
                                    ctx.arc(x, obj.base_y, r, 0, Math.PI, !!(i & 1));
                                    ctx.stroke();
                                }
                                break;
                            case ORIENTATION.TOPLEFT_DOWNRIGHT:{
                                let r = 64*1.4159/12;
                                for(let d = 0, i=0; i < w*6; d+= 2*r/1.4159, i++){
                                    ctx.beginPath();
                                    ctx.arc(obj.base_x-REFERENCE_WIDTH/2+d+r/1.41519, obj.base_y-REFERENCE_WIDTH/2+d+r/1.41519, r, Math.PI/4, 5*Math.PI/4, !!(i & 1));
                                    ctx.stroke();
                                }
                            }break;
                            case ORIENTATION.TOPRIGHT_DOWNLEFT:{
                                let r = 64*1.4159/12;
                                for(let d = 0, i=0; i < w*6; d+= 2*r/1.4159, i++){
                                    ctx.beginPath();
                                    ctx.arc(obj.base_x-REFERENCE_WIDTH/2+d+r/1.41519, obj.base_y+REFERENCE_WIDTH/2-d-r/1.41519, r, 3*Math.PI/4, 7*Math.PI/4, !!(i & 1));
                                    ctx.stroke();
                                }
                            }break;
                        }
                    }break;
                    case DOORTYPE.SECRET:{
                        ctx.save();
                        ctx.textBaseline = 'middle';
                        ctx.textAlign = 'center';
                        ctx.translate(obj.base_x, obj.base_y);
                        switch(obj.orientation){
                            case ORIENTATION.VERTICAL:
                                break;
                            case ORIENTATION.HORIZONTAL:
                                ctx.rotate(Math.PI/2);
                                break;
                            case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                ctx.rotate(3*Math.PI/4);
                                break;
                            case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                ctx.rotate(Math.PI/4);
                                break;
                        }
                        if(is_selected){
                            ctx.font = '56px sans-serif';
                            ctx.fillStyle = SELECTED_COLOR;
                            ctx.fillText('S', 0, 0);
                            }
                        ctx.font = '48px sans-serif';
                        if(DARKMODE)
                            ctx.fillStyle = '#888';
                        else
                            ctx.fillStyle = '#444';
                        ctx.fillText('S', 0, 0);
                        ctx.restore();
                    }break;
                    case DOORTYPE.BRICKED_WALL:{
                        if(is_selected){
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.lineWidth=8;
                            ctx.beginPath();
                            switch(obj.orientation){
                                case ORIENTATION.VERTICAL:
                                    ctx.moveTo(obj.base_x, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x, obj.base_y+22*w);
                                    break;
                                case ORIENTATION.HORIZONTAL:
                                    ctx.moveTo(obj.base_x-22*w, obj.base_y)
                                    ctx.lineTo(obj.base_x+22*w, obj.base_y);
                                    break;
                                case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                    ctx.moveTo(obj.base_x-22*w, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x+22*w, obj.base_y+22*w);
                                    break;
                                case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                    ctx.moveTo(obj.base_x+22*w, obj.base_y-22*w)
                                    ctx.lineTo(obj.base_x-22*w, obj.base_y+22*w);
                                    break;
                            }
                            ctx.stroke();
                        }
                        ctx.strokeStyle = '#ff1111';
                        ctx.lineWidth=6;
                        ctx.beginPath();
                        switch(obj.orientation){
                            case ORIENTATION.VERTICAL:
                                ctx.moveTo(obj.base_x, obj.base_y-22*w)
                                ctx.lineTo(obj.base_x, obj.base_y+22*w);
                                break;
                            case ORIENTATION.HORIZONTAL:
                                ctx.moveTo(obj.base_x-22*w, obj.base_y)
                                ctx.lineTo(obj.base_x+22*w, obj.base_y);
                                break;
                            case ORIENTATION.TOPLEFT_DOWNRIGHT:
                                ctx.moveTo(obj.base_x-22*w, obj.base_y-22*w)
                                ctx.lineTo(obj.base_x+22*w, obj.base_y+22*w);
                                break;
                            case ORIENTATION.TOPRIGHT_DOWNLEFT:
                                ctx.moveTo(obj.base_x+22*w, obj.base_y-22*w)
                                ctx.lineTo(obj.base_x-22*w, obj.base_y+22*w);
                                break;
                        }
                        ctx.stroke();
                    }break;
                }
            }break;
            case CANVASTYPE.STAIRS:{
                const obj = obj_ as Stairs;
                if(!obj.width || !obj.height)
                    break;
                const bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+obj.width*REFERENCE_WIDTH,
                    y1:obj.base_y+obj.height*REFERENCE_WIDTH,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    break;
                }
                if(is_selected){
                    ctx.lineWidth=4;
                    ctx.strokeStyle = SELECTED_COLOR;
                    ctx.strokeRect(obj.base_x, obj.base_y, obj.width*REFERENCE_WIDTH, obj.height*REFERENCE_WIDTH);
                }
                ctx.fillStyle = "#000000";
                let n = 0;
                let dx = 0;
                let dy = 0;
                let w = 0;
                let h = 0;
                let dw = 0;
                let dh = 0;
                let x = obj.base_x;
                let y = obj.base_y;
                switch(obj.rotation){
                    case ROTATION.UP:{
                        x += 2;
                        y += 4;
                        n = obj.height * 8 - 1;
                        w = REFERENCE_WIDTH*obj.width-4;
                        h = 4;
                        dw = -w / n;
                        dx = -dw/2;
                        dy = 8;
                    }break;
                    case ROTATION.DOWN:{
                        x += 2;
                        n = obj.height * 8 - 1;
                        w = REFERENCE_WIDTH*obj.width-4;
                        h = 4;
                        dw = -w / n;
                        dx = -dw/2;
                        dy = -8;
                        y = obj.base_y + obj.height*64 - 8;
                    }break;
                    case ROTATION.RIGHT:{
                        y += 2;
                        x += 4;
                        n = obj.width * 8 - 1;
                        h = REFERENCE_WIDTH*obj.height-4;
                        w = 4;
                        dh = -h / n;
                        dy = -dh/2;
                        dx = 8;
                    }break;
                    case ROTATION.LEFT:{
                        y += 2;
                        n = obj.width * 8 - 1;
                        h = REFERENCE_WIDTH*obj.height-4;
                        w = 4;
                        dh = -h / n;
                        dy = -dh/2;
                        dx = -8;
                        x = obj.base_x + obj.width*64 - 8;
                    }break;
                }
                for(let q = 0; q < n; ++q){
                    ctx.fillRect(x, y, w, h);
                    w += dw;
                    h += dh;
                    x += dx;
                    y += dy;
                }
            }break;
            case CANVASTYPE.MEASURE:{
                const obj = obj_ as MeasureObj;
                const bbox = {
                    x0: obj.base_x < obj.x1?obj.base_x : obj.x1,
                    x1: obj.base_x > obj.x1?obj.base_x : obj.x1,
                    y0: obj.base_y < obj.y1?obj.base_y : obj.y1,
                    y1: obj.base_y > obj.y1?obj.base_y : obj.y1,
                };
                if(!bbox_overlaps(bbox, canvas_bbox))
                    break;
                if(bbox.x0 == bbox.x1 && bbox.y0 == bbox.y1)
                    break;
                ctx.strokeStyle = obj.color;
                ctx.lineWidth = 4/scale;
                ctx.lineJoin = 'miter';
                ctx.beginPath();
                ctx.moveTo(obj.base_x, obj.base_y);
                const head_length = 20/scale;
                const dx = obj.x1 - obj.base_x;
                const dy = obj.y1 - obj.base_y;
                const angle = Math.atan2(dy, dx);
                ctx.lineTo(obj.x1, obj.y1);
                ctx.stroke();
                ctx.beginPath();
                let x_off = head_length * Math.cos(angle - Math.PI/6);
                let y_off = head_length * Math.sin(angle - Math.PI/6);
                ctx.lineTo(obj.x1 - x_off, obj.y1 - y_off);
                ctx.lineTo(obj.x1, obj.y1);
                x_off = head_length * Math.cos(angle + Math.PI/6);
                y_off = head_length * Math.sin(angle + Math.PI/6);
                ctx.lineTo(obj.x1 - x_off, obj.y1 - y_off);
                ctx.stroke();
                const fontsize = 24/scale | 0;
                ctx.font = fontsize+'px sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#000000';
                const length = (Math.sqrt(Math.pow(obj.base_x - obj.x1, 2)+ Math.pow(obj.base_y - obj.y1, 2))*10/REFERENCE_WIDTH).toFixed(0);
                ctx.fillText(length + "'", (obj.base_x+obj.x1)/2-fontsize, (obj.base_y+obj.y1)/2-fontsize);
            }break;
            case CANVASTYPE.FIXTURE:{
                const obj = obj_ as FixtureObj;
                if(!obj.width || !obj.height)
                    break;
                const bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+obj.width,
                    y1:obj.base_y+obj.height,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    break;
                }
                switch(obj.ftype){
                    case FIXTURETYPE.STAIRS:
                        break; // should be unreachable
                    case FIXTURETYPE.STATUE:{
                        const cx = (bbox.x0+bbox.x1)/2;
                        const cy = (bbox.y0+bbox.y1)/2;
                        if(is_selected){
                            ctx.lineWidth=4;
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.beginPath();
                            ctx.ellipse(cx, cy, obj.width/2, obj.height/2, 0, 0, Math.PI*2);
                            ctx.stroke();
                        }
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, obj.width/2, obj.height/2, 0, 0, Math.PI*2);
                        const r = Math.min(obj.width/2, obj.height/2)-1;
                        const ir = r/2; // inner radius
                        ctx.stroke();
                        ctx.beginPath();
                        let angle = 3*Math.PI/10;
                        ctx.moveTo(cx+r*Math.cos(angle), cy+r*Math.sin(angle));
                        for(let i = 0; i < 5; i++){
                            angle += Math.PI/5;
                            ctx.lineTo(cx+ir*Math.cos(angle), cy+ir*Math.sin(angle));
                            angle += Math.PI/5;
                            ctx.lineTo(cx+r*Math.cos(angle), cy+r*Math.sin(angle));
                        }
                        ctx.closePath();
                        ctx.stroke();
                    }break;
                    case FIXTURETYPE.PIT:{
                        let w = obj.width - 8;
                        let h = obj.height - 8;
                        let x = obj.base_x + 4;
                        let y = obj.base_y + 4;
                        if(is_selected){
                            ctx.lineWidth = 4;
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.strokeRect(x-2,y-2,w+4,h+4);
                        }
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#000000';
                        ctx.fillStyle = '#00000011';
                        ctx.fillRect(x,y, w, h);
                        ctx.fillStyle = '#00000033';
                        const thick = Math.min(10, Math.min(obj.height/6, obj.width/6));
                        ctx.fillRect(x+thick,y+thick, w-2*thick, h-2*thick);
                        ctx.strokeRect(x,y,w,h);
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.lineTo(x+thick, y+thick);
                        ctx.lineTo(x+thick, y+h-thick);
                        ctx.lineTo(x, y+h);
                        ctx.lineTo(x+thick, y+h-thick);
                        ctx.lineTo(x+w-thick, y+h-thick);
                        ctx.lineTo(x+w, y+h);
                        ctx.lineTo(x+w-thick, y+h-thick);
                        ctx.lineTo(x+w-thick, y+thick);
                        ctx.lineTo(x+w, y);
                        ctx.lineTo(x+w-thick, y+thick);
                        ctx.lineTo(x+thick, y+thick);
                        ctx.stroke();
                    }break;
                    case FIXTURETYPE.RUBBLE:{
                        if(is_selected){
                            ctx.lineWidth = 4;
                            ctx.strokeStyle = SELECTED_COLOR;
                            ctx.strokeRect(obj.base_x, obj.base_y, obj.width, obj.height);
                        }
                        if(RUBBLEIMAGE){
                            ctx.drawImage(RUBBLEIMAGE, obj.base_x, obj.base_y, obj.width, obj.height);
                        }
                    }break;
                }
            }break;
            case CANVASTYPE.FILLED_TILE:{
            }break;
        }
    }
    if(view.selection_area.is_selecting){
        ctx.fillStyle = '#55555555';
        const a = view.selection_area;
        ctx.fillRect(a.x0, a.y0, a.x1-a.x0, a.y1-a.y0);
    }
    if(view.placing_area.is_placing){
        ctx.strokeStyle = '#33aaaaaa';
        ctx.lineWidth = 4;
        const a = view.placing_area;
        const w = a.x1 - a.x0;
        const h = a.y1 - a.y0;
        if(view.placing_area.is_line){
            ctx.beginPath();
            ctx.moveTo(a.x0, a.y0);
            ctx.lineTo(a.x1, a.y1);
            ctx.stroke();
        }
        else {
            ctx.strokeRect(a.x0-2, a.y0-2, w+4, h+4);
        }
    }
    const PING_DURATION = 1000;
    const PING_RADIUS = 64;
    if(map.pings.length){
        const new_pings = [];
        ctx.lineWidth  = 8;
        for(let p of map.pings){
            if(!p.t0){
                p.t0 = timestamp;
            }
            const delta_t = timestamp - p.t0;
            if(delta_t < PING_DURATION){
                new_pings.push(p);
                ctx.beginPath();
                ctx.strokeStyle = p.color;
                ctx.arc(p.cx, p.cy, PING_RADIUS*delta_t/PING_DURATION, 0, 2*Math.PI);
                ctx.stroke();
            }
        }
        map.pings = new_pings;
        request_render();
    }
    /*
    if(1){
        request_render();
        timings.push(performance.now()-before);
        while(timings.length > 100){
            timings.splice(0, 1);
        }
        let total = 0;
        for(let t of timings)
            total += t;
        const avg = (total / timings.length).toFixed(4)+'ms';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(width/2-100, height/2-50, 200, 100);
        ctx.fillStyle = '#000000';
        ctx.fillText(avg, width/2, height/2);
    }
    */
}
enum TOOLTYPE {
    PAN         = 0,
    SELECT      = 1,
    LINE        = 2,
    ELLIPSE     = 3,
    WALL        = 4,
    DOOR        = 5,
    RECT        = 6,
    TEXT        = 7,
    TOKEN       = 8,
    IMAGE       = 9,
    HELP        = 10,
    MEASURE     = 11,
    FIXTURE     = 12,
    FILLED_TILE = 13,
}
const TOOLTYPE_MAX = TOOLTYPE.FIXTURE + 1;
const NAMES_TO_TOOL = (function(){
    const m: Map<string, TOOLTYPE> = new Map();
    m.set('Pan',         TOOLTYPE.PAN);
    m.set('Select',      TOOLTYPE.SELECT);
    m.set('Line',        TOOLTYPE.LINE);
    m.set('Ellipse',     TOOLTYPE.ELLIPSE);
    m.set('Wall',        TOOLTYPE.WALL);
    m.set('Door',        TOOLTYPE.DOOR);
    m.set('Rect',        TOOLTYPE.RECT);
    m.set('Text',        TOOLTYPE.TEXT);
    m.set('Token',       TOOLTYPE.TOKEN);
    m.set('Image',       TOOLTYPE.IMAGE);
    m.set('Help',        TOOLTYPE.HELP);
    m.set('Measure',     TOOLTYPE.MEASURE);
    m.set('Fixture',     TOOLTYPE.FIXTURE);
    m.set('Tile - Filled', TOOLTYPE.FILLED_TILE);
    return m;
}());
const TOOL_TO_NAMES = [
    // TOOLTYPE.PAN:
    'Pan',
    // TOOLTYPE.SELECT:
    'Select',
    // TOOLTYPE.LINE:
    'Line',
    // TOOLTYPE.ELLIPSE:
    'Ellipse',
    // TOOLTYPE.WALL:
    'Wall',
    // TOOLTYPE.DOOR:
    'Door',
    // TOOLTYPE.RECT:
    'Rect',
    // TOOLTYPE.TEXT:
    'Text',
    // TOOLTYPE.TOKEN:
    'Token',
    // TOOLTYPE.IMAGE:
    'Image',
    // TOOLTYPE.HELP:
    'Help',
    // TOOLTYPE.MEASURE:
    'Measure',
    // TOOLTYPE.FIXTURE:
    'Fixture',
    // TOOLTYPE.FILL:
    'Tile - Filled'
];
let current_fixture_type = FIXTURETYPE.STAIRS;
enum TOKENTYPE {
    EZ = 0,
    IMG = 1,
}
const TOKEN_TO_NAME = [
    // TOKENTYPE.EZ
    'EZ',
    // TOKENTYPE.IMG
    'Img',
];
const TOKENTYPE_MAX = TOKENTYPE.IMG + 1;
let current_token_type = TOKENTYPE.EZ;
enum RECTTYPE {
    HOLLOW = 0,
    SOLID = 1,
    FILLED = 2,
}
const RECTTYPE_MAX = RECTTYPE.FILLED+1;
const RECTTYPE_TO_NAME = [
    // RECTTYPE.HOLLOW
    'Hollow',
    // RECTTYPE.SOLID
    'Solid',
    // RECTTYPE.FILLED
    'Filled',
];
let current_rect_type = RECTTYPE.HOLLOW;
let current_tool:TOOLTYPE = (function(){
    const t = localStorage.getItem('current_tool');
    if(t){
        const result =  NAMES_TO_TOOL.get(t);
        if(result !== undefined){
            return result;
        }
    }
    return show_pan?TOOLTYPE.PAN:TOOLTYPE.SELECT;
    }());
let color_picker_:HTMLInputElement;
let color_picker2_:HTMLInputElement;
function retrieve_colors(storage_key:string): Array<string>{
    const js = localStorage.getItem(storage_key);
    if(!js)
        return ['#ff2600', '#ff9300', '#fffb00', '#00f900', '#00fdff', '#0433ff', '#ff40ff', '#942192', '#aa7942', '#ffffff', '#919191', '#000000'];
    else
        return JSON.parse(js);
}
const primary_colors: Array<string> = retrieve_colors('primary_colors');
const secondary_colors: Array<string> = retrieve_colors('secondary_colors');
function add_recent_color(color:string, colors:Array<string>, storage_key:string){
    const index = colors.findIndex(function(e:string){return e==color;});
    if(index != -1){
        colors.splice(index, 1);
    }
    if(colors.unshift(color) > 20){
        colors.pop();
    }
    if(index == -1){
        localStorage.setItem(storage_key, JSON.stringify(colors));
    }
}
function get_primary_color():string{
    const color = color_picker_.value;
    add_recent_color(color, primary_colors, 'primary_colors');
    return color;
}
function get_secondary_color():string{
    const color = color_picker2_.value;
    add_recent_color(color, secondary_colors, 'secondary_colors');
    return color;
}
function make_color_menu(e:MouseEvent, colorpicker: HTMLInputElement, colors:Array<string>){
    // Piggy back on tri_menu stuff.
    if(has_tri_menu)
        return;
    has_tri_menu = true;
    const trimenu = document.createElement('section');
    trimenu.classList.add('menu');
    trimenu.style.left = e.clientX + 'px';
    const window_height = window.innerHeight;
    trimenu.style.bottom = (window_height - e.clientY)+'px'
    function remove_tri_menu(e?:MouseEvent){
        if(e){
            e.stopPropagation();
            e.preventDefault();
        }
        document.body.removeChild(trimenu);
        window.removeEventListener('mousedown', remove_tri_menu);
        canvas.removeEventListener('mousedown', remove_tri_menu);
        has_tri_menu = false;
    }
    function make_cb(color: string){
        function cb(e:MouseEvent){
            e.stopPropagation();
            e.preventDefault();
            colorpicker.value = color;
            remove_tri_menu();
        }
        return cb;
    }
    for(let i = colors.length; i-- > 0;){
        const color = colors[i];
        const s = document.createElement('section');
        s.classList.add('color-menuitem')
        s.style.backgroundColor = color;
        s.style.height = '2em';
        s.style.width = '3em'
        s.style.border = '2px solid ' + color;
        s.addEventListener('mousedown', make_cb(color));
        trimenu.appendChild(s);
    }
    document.body.appendChild(trimenu);
    window.addEventListener('mousedown', remove_tri_menu);
    canvas.addEventListener('mousedown', remove_tri_menu);
}
document.addEventListener('DOMContentLoaded', function(){
    const cpt1 = document.getElementById('color-picker-dropdown')! as HTMLElement;
    const cpt2 = document.getElementById('color-picker2-dropdown')! as HTMLElement;
    cpt1.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        make_color_menu(e, color_picker_, primary_colors);
    });
    cpt2.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        make_color_menu(e, color_picker2_, secondary_colors);
    });

});
let tools: Array<HTMLElement> = [];
function change_tool(tool:TOOLTYPE):void{
    localStorage.setItem('current_tool', TOOL_TO_NAMES[tool]);
    let prev = current_tool;
    if(!tools)
        return;
    current_tool = tool;
    switch(tool){
        case TOOLTYPE.PAN:
        case TOOLTYPE.SELECT:
            break;
        default:
            for(let view of dungeon_map_views){
                end_selecting(view);
            }
            break;
    }
    numeric_hot_key = numeric_hot_keys.get(tool) || DEFAULT_NUMERIC_HOT_KEY;
    for(let j = 0; j < tools.length; ++j){
        const toolel = tools[j];
        const toolname = TOOL_TO_NAMES[tool];
        toolel.classList.remove('selected');
        if(toolel.firstChild!.textContent!.trim() == toolname){
            toolel.classList.add('selected');
        }
    }
    if(tool == TOOLTYPE.HELP){
        if(prev != TOOLTYPE.HELP)
            change_tool(prev);
        make_ok_dialog(`
            <h2>Help</h2>
            <div style="max-height:90%;overflow-y:auto;margin:auto;">
            <h3 style="text-align:center;">Tips</h3>
            <div style="margin:auto;max-width:60em;padding:1em;">
            <p>The Grid/Half/Free buttons affect what the tools will snap to.
               You can use <b>q</b> to switch to Grid, <b>w</b> to switch to Half
               and <b>e</b> to switch to Free.
            <p>You can use <b>s</b> to switch to Select.
            <p>The <span>☰</span> means there are other options for that tool.
            <p>Right-clicking on the map shows some more options
            <p>You can cut, copy, paste things on the map.
            <p>Click the options button to add macros and change your chat name.
            <p>Roll a die by typing a dice expression into the chat, like 'd20+4'.
               Non-dice messages are just sent as text.
            <h3 style="text-align:center;">Tools</h3>
            </div>
            <table id="help-menu">
                <thead>
                    <tr><th>Tool</th><th>Hotkey</th><th>Description</th></tr>
                </thead>
                <tbody>
                <tr>
                    <td>Pan
                    <td>n
                    <td>Allows you to click to drag where you are on the map.
                </tr>
                <tr>
                    <td>Select
                    <td>s
                    <td>Select things. Select modes change what you can select.
                        A single click selects one object; dragging will select anything that
                        overlaps. Clicking on a selected object and dragging will move.
                </tr>
                <tr>
                    <td>Wall
                    <td>a
                    <td>Allows you to draw walls. Click and drag between corners of the grid.
                </tr>
                <tr>
                    <td>Door
                    <td>d
                    <td>Allows you to draw doors. Click and drag between corners of the grid.
                        Do this over walls.
                </tr>
                <tr>
                    <td>Fixture
                    <td>f
                    <td>Allows you to draw various fixtures, such as stairs.
                </tr>
                <tr>
                    <td>Line
                    <td>l
                    <td>A freehand line.
                </tr>
                <tr>
                    <td>Rect
                    <td>r
                    <td>A rectangle. Border is primary color.
                        A solid rectangle is all the border color,
                        a filled rectangle uses the secondary color for the fill.
                </tr>
                <tr>
                    <td>Ellipse
                    <td>p
                    <td>An ellipse. Border is primary color.
                        A solid ellipse is all the border color,
                        a filled ellipse uses the secondary color for the fill.
                </tr>
                <tr>
                    <td>Text
                    <td>t
                    <td>Allows you to type in some text.
                        Snaps to the center of the square at first, but you can move it to wherever.
                </tr>
                <tr>
                    <td>Token
                    <td>o
                    <td>Ez Token allows you to make a simple token with a label.
                        Img Token allows you to make a token with an image from a url.
                </tr>
                <tr>
                    <td>Image
                    <td>i
                    <td>Allows you to place an image from a url.
                </tr>
                <tr>
                    <td>Measure
                    <td>m
                    <td>A tool for measuring distances. Snaps to the center of the square.
                        In half-grid, snaps to center of the half grid.
                        With free, can be anywhere.
                </tbody>
            </table>
            </div>
                   `, function(unused){});
    }
}
let has_tri_menu = false;
function make_tri_menu(e:MouseEvent, options:Array<{func:()=>void;text:string}>){
    if(has_tri_menu)
        return;
    has_tri_menu = true;
    const trimenu = document.createElement('section');
    trimenu.classList.add('menu');
    trimenu.style.left = e.clientX + 'px';
    const window_height = window.innerHeight;
    trimenu.style.bottom = (window_height - e.clientY)+'px'
    function remove_tri_menu(e?:MouseEvent){
        if(e){
            e.stopPropagation();
            e.preventDefault();
        }
        document.body.removeChild(trimenu);
        window.removeEventListener('mousedown', remove_tri_menu);
        canvas.removeEventListener('mousedown', remove_tri_menu);
        has_tri_menu = false;
    }
    function make_cb(func:()=>void){
        function cb(e:MouseEvent){
            e.stopPropagation();
            e.preventDefault();
            func()
            remove_tri_menu();
        }
        return cb;
    }
    for(let i = 0; i < options.length; ++i){
        const option = options[i];
        const s = document.createElement('section');
        s.classList.add('menuitem')
        const text = document.createTextNode(option.text);
        s.appendChild(text);
        s.addEventListener('mousedown', make_cb(option.func));
        trimenu.appendChild(s);
    }
    document.body.appendChild(trimenu);
    window.addEventListener('mousedown', remove_tri_menu);
    canvas.addEventListener('mousedown', remove_tri_menu);
}
document.addEventListener('DOMContentLoaded', function():void{
    tools = Array.from(document.getElementsByClassName('tool')) as Array<HTMLElement>;
    color_picker_ = document.getElementById('color-picker')! as HTMLInputElement;
    color_picker2_ = document.getElementById('color-picker2')! as HTMLInputElement;
    for(let i = 0; i < tools.length; ++i){
        const toolel = tools[i];
        toolel.addEventListener('click', function(e:MouseEvent){
            const toolname = toolel.firstChild!.textContent!.trim() as string;
            const tool = NAMES_TO_TOOL.get(toolname);
            if(tool !== undefined)
                change_tool(tool);
        });
        // Selecttype is bit flags, so it has to be its own special snowflake.
        // I guess it should actually be like checkboxes?
        if(toolel.firstChild!.textContent!.trim() == 'Select'){
            const name = toolel.getElementsByTagName('span')[0];
            function change_st(st:SELECTTYPE){
                select_type = st;
                switch(select_type){
                    case SELECTTYPE.NONBACKGROUND:
                        name.innerText = '- Nonbackground ☰';
                        break;
                    case SELECTTYPE.MAP:
                        name.innerText = '- Map ☰';
                        break;
                    case SELECTTYPE.TOKEN:
                        name.innerText = '- Token ☰';
                        break;
                    case SELECTTYPE.BACKGROUND:
                        name.innerText = '- Background ☰';
                        break;
                    case SELECTTYPE.ANY:
                        name.innerText = '- Any ☰';
                        break;
                }
            }
            change_st(SELECTTYPE.NONBACKGROUND);
            change_select_mode(SELECTTYPE.NONBACKGROUND);

            function make_cb(st:SELECTTYPE){
                function cb():void{
                    change_tool(TOOLTYPE.SELECT);
                    change_st(st);
                    change_select_mode(st);
                }
                return cb;
            }
            numeric_hot_keys.set(TOOLTYPE.SELECT, {
                func: function(index:number){
                    switch(index){
                        case 0:
                            change_select_mode(SELECTTYPE.NONBACKGROUND);
                            change_st(SELECTTYPE.NONBACKGROUND);
                            break;
                        case 1:
                            change_select_mode(SELECTTYPE.MAP);
                            change_st(SELECTTYPE.MAP);
                            break;
                        case 2:
                            change_select_mode(SELECTTYPE.TOKEN);
                            change_st(SELECTTYPE.TOKEN);
                            break;
                        case 3:
                            change_select_mode(SELECTTYPE.BACKGROUND);
                            change_st(SELECTTYPE.BACKGROUND);
                            break;
                        case 4:
                            change_select_mode(SELECTTYPE.ANY);
                            change_st(SELECTTYPE.ANY);
                            break;
                    }
                },
                max_index: 5,
            });
            const triangle = toolel.getElementsByTagName('span')[0];
            triangle.addEventListener('click', function(e:MouseEvent){
                e.preventDefault();
                e.stopPropagation();
                if(has_tri_menu)
                    return;
                make_tri_menu(e, [
                    {func:make_cb(SELECTTYPE.NONBACKGROUND), text:'Nonbackground'},
                    {func:make_cb(SELECTTYPE.MAP), text:'Map'},
                    {func:make_cb(SELECTTYPE.TOKEN), text:'Token'},
                    {func:make_cb(SELECTTYPE.BACKGROUND), text:'Background'},
                    {func:make_cb(SELECTTYPE.ANY), text:'Any'},
                ]);
            });
        }
        function setup_multi_option(toolel:HTMLElement, t_type:TOOLTYPE, set_current:(_:number)=>void, t_to_name:Array<string>, t_max:number){
            const name = toolel.getElementsByTagName('span')[0];
            function change_t(t:number){
                set_current(t);
                const tname = t_to_name[t];
                name.innerText = ` - ${tname} ☰`;
            }
            numeric_hot_keys.set(t_type, {
                func: change_t,
                max_index: t_max,
            });
            change_t(0);
            function make_cb(t:number){
                function cb(){
                    change_tool(t_type);
                    change_t(t);
                };
                return cb;
            }
            const triangle = toolel.getElementsByTagName('span')[0];
            triangle.addEventListener('click', function(e:MouseEvent){
                e.preventDefault();
                e.stopPropagation();
                if(has_tri_menu)
                    return;
                make_tri_menu(e, (function(){
                    const a = [];
                    for(let i = 0; i < t_max; i++){
                        a.push({func:make_cb(i), text:t_to_name[i]});
                    }
                    return a;
                }()));
            });
        }
        const tcontent = toolel.firstChild!.textContent!.trim();
        switch(NAMES_TO_TOOL.get(tcontent)){
            case TOOLTYPE.DOOR:
                setup_multi_option(toolel, TOOLTYPE.DOOR, function(i:number){current_door=i}, DOOR_TO_NAMES, DOORTYPE_MAX);
            break;
            case TOOLTYPE.TOKEN:
                setup_multi_option(toolel, TOOLTYPE.TOKEN, function(i:number){current_token_type=i}, TOKEN_TO_NAME, TOKENTYPE_MAX);
            break;
            case TOOLTYPE.RECT:
                setup_multi_option(toolel, TOOLTYPE.RECT, function(i:number){current_rect_type=i}, RECTTYPE_TO_NAME, RECTTYPE_MAX);
            break;
            case TOOLTYPE.ELLIPSE:
                setup_multi_option(toolel, TOOLTYPE.ELLIPSE, function(i:number){current_ellipse=i}, ELLIPSETYPE_TO_NAME, ELLIPSETYPE_MAX);
            break;
            case TOOLTYPE.FIXTURE:
                setup_multi_option(toolel, TOOLTYPE.FIXTURE, function(i:number){current_fixture_type=i}, FIXTURETYPE_TO_NAME, FIXTURETYPE_MAX);
            break;
            default:
            break;
        }
    }
    change_tool(current_tool);
});

// Extracts the session id from an object's id so that we can ignore objects we
// created.
function get_session_id_from_obj_id(objid:number):number{
    let id = objid >> 20;
    return id;
}
type NumericHotKey = {
    func: (_:number)=>void;
    max_index: number;
}
const DEFAULT_NUMERIC_HOT_KEY = {
    func: function(_:number){},
    max_index: 0,
};
let numeric_hot_key = DEFAULT_NUMERIC_HOT_KEY;
let numeric_hot_keys:Map<TOOLTYPE, NumericHotKey> = new Map();
let token_paths: Array<string> = [];
socket.on('token-paths', function(paths:Array<string>){
    token_paths = paths;
});
document.addEventListener('DOMContentLoaded', function(){
    canvas = document.getElementsByTagName('canvas')[0]!;
    canvas.addEventListener('wheel', function(e:WheelEvent){
        e.stopPropagation();
        e.preventDefault();
        const view = get_active_view();
        const oldscale = view.scale;
        let dy = e.deltaY;
        const dscale = 120;
        if(dy > dscale)
            dy = dscale;
        if(dy < -dscale)
            dy = -dscale;
        let factor = 1 + Math.abs(dy/dscale);
        if(dy > 0)
            factor = 1 / factor;
        view.scale *= factor;
        view.scale = clamp_scale(view.scale);
        view.camera_x -= e.offsetX/oldscale;
        view.camera_x += e.offsetX/view.scale;
        view.camera_y -= e.offsetY/oldscale;
        view.camera_y += e.offsetY/view.scale;
        view.camera_x = Math.round(view.camera_x);
        view.camera_y = Math.round(view.camera_y);
        request_render();
    });
    window.addEventListener('keydown', function(e:KeyboardEvent){
        if(document.activeElement !== document.body)
            return;
        const ctrl_or_cmd_is_pressed = e.ctrlKey || e.metaKey;
        const other_modifiers = e.altKey || e.shiftKey;
        // const shift = e.shiftKey;
        const shortcut = ctrl_or_cmd_is_pressed && !other_modifiers;
        const view = get_active_view();
        switch(e.key){
            case 'ArrowLeft':{
                view.camera_x += 256;
                request_render();
            }break;
            case 'ArrowRight':{
                view.camera_x -= 256;
                request_render();
            }break;
            case 'ArrowUp':{
                view.camera_y += 256;
                request_render();
            }break;
            case 'ArrowDown':{
                view.camera_y -= 256;
                request_render();
            }break;
            case 'Escape':{
                view.selected.clear();
                request_render();
            }break;
            case 'Backspace': // fall-through
            case 'Delete':{
                if(!view.selected.size)
                    break;
                for(let item of view.selected){
                    view.map.canvas_objs.get(item)!.flags |= CANVASFLAG.DELETED;
                }
                publish_delete_by_ids(view.map.map_id, Array.from(view.selected));
                note_delete_by_ids_for_undo(view.map, Array.from(view.selected));
                end_selecting(view);
            }break;
            case 'q':
                visually_set_snapmode(SNAPMODE.GRID);
                break;
            case 'w':
                visually_set_snapmode(SNAPMODE.HALF);
                break;
            case 'e':
                visually_set_snapmode(SNAPMODE.FREE);
                break;
            case 's':
                change_tool(TOOLTYPE.SELECT);
                break;
            case 'p':
                change_tool(TOOLTYPE.ELLIPSE);
                break;
            case 'n':
                if(show_pan) change_tool(TOOLTYPE.PAN);
                break;
            case 'l':
                change_tool(TOOLTYPE.LINE);
                break;
            case 'r':
                change_tool(TOOLTYPE.RECT);
                break;
            case 'i':
                change_tool(TOOLTYPE.IMAGE);
                break;
            case 'f':
                change_tool(TOOLTYPE.FIXTURE);
                break;
            case 'd':
                change_tool(TOOLTYPE.DOOR);
                break;
            case 'm':
                change_tool(TOOLTYPE.MEASURE);
                break;
            case 'a':
                change_tool(TOOLTYPE.WALL);
                break;
            case 't':
                change_tool(TOOLTYPE.TEXT);
                break;
            case 'o':
                change_tool(TOOLTYPE.TOKEN);
                break;
            case 'y':
                if(shortcut){
                    do_one_redo(view.map);
                }
                else {
                    return; // avoid the stop prop stuff
                }
                break;
            case 'z':
                if(shortcut){
                    do_one_undo(view.map);
                }
                break;
            case 'x':
                if(shortcut){
                    if(view.selected.size !== 0){
                        clear_copy_buffer();
                        cut_selected_objs_to_copy_buffer(view);
                    }
                }
                break;
            case 'c':
                if(shortcut){
                    if(view.selected.size !== 0){
                        clear_copy_buffer();
                        copy_selected_objs_to_copy_buffer(view);
                    }
                }
                break;
            case 'v':
                if(shortcut){
                    if(copied_objs.length){
                        const x = canvas.width/4/view.scale - view.camera_x;
                        const y = canvas.height/4/view.scale - view.camera_y;
                        paste_from_copy_buffer_at(view.map, x, y);
                    }
                    break;
                }
                break;
            case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':{
                const index = (+e.key) - 1;
                if(index < numeric_hot_key.max_index)
                    numeric_hot_key.func(index);
            }break;
            default:
                return;
        }
        // unhandled keys should return to avoid this.
        e.stopPropagation();
        e.preventDefault();
    });
    let prev_tool:TOOLTYPE = TOOLTYPE.PAN;
    // this state variable is kind of janky.
    let ctxmenu_is_active = 0;
    let ez_token_color = '#ff3333';
    canvas.addEventListener('mousedown', function(e:MouseEvent){
        if(e.button !== 0 && e.button !== 1){ //0 is the 'primary' button
            return;
        }
        let view = get_active_view();
        if(ctxmenu_is_active !== 0)
            return;
        if(has_tri_menu)
            return;
        e.stopPropagation();
        e.preventDefault();
        if(e.button === 1){
            prev_tool = current_tool;
            current_tool = TOOLTYPE.PAN;
        }
        let snap = get_snap_func();
        switch(current_tool){
            case TOOLTYPE.SELECT:{
                let clicked_x = e.offsetX/view.scale - view.camera_x;
                let clicked_y = e.offsetY/view.scale - view.camera_y;
                const fudged_x0 = clicked_x-10/view.scale;
                const fudged_x1 = clicked_x+10/view.scale;
                const fudged_y0 = clicked_y-10/view.scale;
                const fudged_y1 = clicked_y+10/view.scale;
                if(view.selected.size && there_are_selected_objs_at(view, fudged_x0, fudged_y0, fudged_x1, fudged_y1)){
                    // handle movement
                    let rawclick_x = e.offsetX;
                    let rawclick_y = e.offsetY;
                    let changed = false;
                    const before_update = get_stripped_state_by_id(view.map, Array.from(view.selected));
                    const is_rigid = selection_is_rigid(view);
                    function move(e:MouseEvent){
                        e.stopPropagation();
                        e.preventDefault();
                        const diff = Math.abs(e.offsetX - rawclick_x) + Math.abs(e.offsetY - rawclick_y);
                        if(diff < 1)
                            return;
                        let move_x = e.offsetX/view.scale - view.camera_x;
                        let move_y = e.offsetY/view.scale - view.camera_y;
                        changed = true;
                        move_selected_objects(view, is_rigid, clicked_x, clicked_y, move_x - clicked_x, move_y - clicked_y);
                        clicked_x = move_x;
                        clicked_y = move_y;
                    }
                    canvas.addEventListener('mousemove', move);
                    function finish_move(){
                        canvas.removeEventListener('mousemove', move);
                        window.removeEventListener('mouseup', finish_move);
                        canvas.removeEventListener('mouseleave', finish_move);
                        if(!changed)
                            return;
                        const after_update = get_stripped_state_by_id(view.map, Array.from(view.selected));
                        publish_obj_updates(view.map.map_id, after_update);
                        note_updates_for_undo(view.map, before_update, after_update);
                    }
                    window.addEventListener('mouseup', finish_move);
                    canvas.addEventListener('mouseleave', finish_move);
                }
                else {
                    sort_canv_objs(view.map);
                    view.selection_area.select_one = true;
                    view.selection_area.is_selecting = true;
                    update_selection(view, fudged_x0, fudged_y0, fudged_x1, fudged_y1);
                    request_render();
                    function select(e:MouseEvent){
                        e.stopPropagation();
                        e.preventDefault();
                        let select_x = e.offsetX/view.scale - view.camera_x;
                        let select_y = e.offsetY/view.scale - view.camera_y;
                        if(select_x != clicked_x || select_y != select_y)
                            view.selection_area.select_one = false;
                        update_selection(view, clicked_x, clicked_y, select_x, select_y);
                        request_render();
                    }
                    canvas.addEventListener('mousemove', select);
                    function finish_select(){
                        finalize_selection(view);
                        canvas.removeEventListener('mousemove', select);
                        window.removeEventListener('mouseup', finish_select);
                        canvas.removeEventListener('mouseleave', finish_select);
                    }
                    window.addEventListener('mouseup', finish_select);
                    canvas.addEventListener('mouseleave', finish_select);
                }
            }break;
            case TOOLTYPE.PAN:{
                let clicked_x = e.offsetX/view.scale;
                let clicked_y = e.offsetY/view.scale;
                function pan(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    let pan_x = e.offsetX/view.scale;
                    let pan_y = e.offsetY/view.scale;
                    view.camera_x -= clicked_x - pan_x;
                    view.camera_y -= clicked_y - pan_y;
                    clicked_x = pan_x;
                    clicked_y = pan_y;
                    request_render();
                }
                canvas.addEventListener('mousemove', pan);
                function finish_pan(){
                    if(prev_tool){
                        current_tool = prev_tool;
                        prev_tool = TOOLTYPE.PAN;
                    }
                    canvas.removeEventListener('mousemove', pan);
                    window.removeEventListener('mouseup', finish_pan);
                    canvas.removeEventListener('mouseleave', finish_pan);
                }
                window.addEventListener('mouseup', finish_pan);
                canvas.addEventListener('mouseleave', finish_pan);
            }break;
            case TOOLTYPE.LINE:{
                let id = get_new_id();
                const x0 = e.offsetX/view.scale-view.camera_x;
                const y0 = e.offsetY/view.scale-view.camera_y;
                const thickness_input = document.getElementById('line-thickness') as HTMLInputElement;
                const thickness = +thickness_input.value || 4;
                add_freehand_line(view.map, id, x0, y0, get_primary_color(), thickness);
                function add_point(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    const x1 = e.offsetX/view.scale-view.camera_x;
                    const y1 = e.offsetY/view.scale-view.camera_y;
                    add_freehand_point_by_id(view.map, id, x1, y1);
                    request_render();
                }
                canvas.addEventListener('mousemove', add_point);
                function finish_point(){
                    canvas.removeEventListener('mousemove', add_point);
                    window.removeEventListener('mouseup', finish_point);
                    canvas.removeEventListener('mouseleave', finish_point);
                    publish_obj_by_id(view.map, id);
                    note_create_by_id_for_undo(view.map, id);
                }
                window.addEventListener('mouseup', finish_point);
                canvas.addEventListener('mouseleave', finish_point);
            }break;
            case TOOLTYPE.WALL:{
                let id = get_new_id();
                if(snapmode == SNAPMODE.FREE){
                    // copy paste from LINE above.
                    const x0 = e.offsetX/view.scale-view.camera_x;
                    const y0 = e.offsetY/view.scale-view.camera_y;
                    add_freehand_line(view.map, id, x0, y0, get_primary_color(), 4);
                    function add_point(e:MouseEvent){
                        e.stopPropagation();
                        e.preventDefault();
                        const x1 = e.offsetX/view.scale-view.camera_x;
                        const y1 = e.offsetY/view.scale-view.camera_y;
                        add_freehand_point_by_id(view.map, id, x1, y1);
                        request_render();
                    }
                    canvas.addEventListener('mousemove', add_point);
                    function finish_point(){
                        canvas.removeEventListener('mousemove', add_point);
                        window.removeEventListener('mouseup', finish_point);
                        canvas.removeEventListener('mouseleave', finish_point);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                    }
                    window.addEventListener('mouseup', finish_point);
                    canvas.addEventListener('mouseleave', finish_point);
                }
                else{
                    const x0 = e.offsetX/view.scale-view.camera_x;
                    const y0 = e.offsetY/view.scale-view.camera_y;
                    add_gridline(view.map, id, x0, y0, get_primary_color());
                    function add_point(e:MouseEvent){
                        e.stopPropagation();
                        e.preventDefault();
                        const x1 = e.offsetX/view.scale-view.camera_x;
                        const y1 = e.offsetY/view.scale-view.camera_y;
                        add_gridline_point_by_id(view.map, id, x1, y1);
                        request_render();
                    }
                    canvas.addEventListener('mousemove', add_point);
                    function finish_point(){
                        canvas.removeEventListener('mousemove', add_point);
                        window.removeEventListener('mouseup', finish_point);
                        canvas.removeEventListener('mouseleave', finish_point);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                    }
                    window.addEventListener('mouseup', finish_point);
                    canvas.addEventListener('mouseleave', finish_point);
                }
            }break;
            case TOOLTYPE.DOOR:{
                let x0 = snap(e.offsetX/view.scale-view.camera_x);
                let y0 = snap(e.offsetY/view.scale-view.camera_y);
                let x1 = x0;
                let y1 = y0;
                view.placing_area.is_placing = true;
                view.placing_area.is_line = true;
                view.placing_area.x0 = x0;
                view.placing_area.y0 = y0;
                view.placing_area.x1 = x1;
                view.placing_area.y1 = y1;
                request_render();
                function change_point(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    x1 = snap(e.offsetX/view.scale-view.camera_x);
                    y1 = snap(e.offsetY/view.scale-view.camera_y);
                    if(x1 > x0 + REFERENCE_WIDTH)
                        x1 = x0 + REFERENCE_WIDTH;
                    if(x1 < x0 - REFERENCE_WIDTH)
                        x1 = x0 - REFERENCE_WIDTH;
                    if(y1 > y0 + REFERENCE_WIDTH)
                        y1 = y0 + REFERENCE_WIDTH;
                    if(y1 < y0 - REFERENCE_WIDTH)
                        y1 = y0 - REFERENCE_WIDTH;
                    view.placing_area.x0 = x0;
                    view.placing_area.y0 = y0;
                    view.placing_area.x1 = x1;
                    view.placing_area.y1 = y1;
                    request_render();
                }
                canvas.addEventListener('mousemove', change_point);
                function finish_door(){
                    view.placing_area.is_placing = false;
                    canvas.removeEventListener('mousemove', change_point);
                    window.removeEventListener('mouseup', finish_door);
                    canvas.removeEventListener('mouseleave', finish_door);
                    if(x0 !== x1 || y0 !== y1){
                        let id = get_new_id();
                        let orientation;
                        let width;
                        if(Math.abs(y1-y0) < 4){
                        // if(y1 === y0){
                            orientation = ORIENTATION.HORIZONTAL;
                            width = Math.abs(x1-x0)/REFERENCE_WIDTH;
                        }
                        else if(Math.abs(x1-x0) < 4){
                        // else if(x1 == x0){
                            orientation = ORIENTATION.VERTICAL;
                            width = Math.abs(y1-y0)/REFERENCE_WIDTH;
                        }
                        else if((x1 < x0 && y1 < y0) || (x1 > x0 && y1 > y0)){
                            orientation = ORIENTATION.TOPLEFT_DOWNRIGHT;
                            width = Math.max(Math.abs(y1-y0), Math.abs(x1-x0))/REFERENCE_WIDTH;
                        }
                        else {
                            orientation = ORIENTATION.TOPRIGHT_DOWNLEFT;
                            width = Math.max(Math.abs(y1-y0), Math.abs(x1-x0))/REFERENCE_WIDTH;
                        }
                        if(width < 0.1)
                            return;
                        let x = ((x0 + x1)/2) | 0;
                        let y = ((y0 + y1)/2) | 0;
                        add_door(view.map, id, x, y, current_door, get_primary_color(), width, orientation);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                    }
                    request_render()
                }
                window.addEventListener('mouseup', finish_door);
                canvas.addEventListener('mouseleave', finish_door);
            }break;
            case TOOLTYPE.RECT:{
                switch(current_rect_type){
                    case RECTTYPE.HOLLOW:{
                        let id = get_new_id();
                        const x0 = snap(e.offsetX/view.scale-view.camera_x);
                        const y0 = snap(e.offsetY/view.scale-view.camera_y);
                        add_rect(view.map, id, x0, y0, get_primary_color());
                        function add_point(e:MouseEvent){
                            e.stopPropagation();
                            e.preventDefault();
                            const x1 = snap(e.offsetX/view.scale-view.camera_x);
                            const y1 = snap(e.offsetY/view.scale-view.camera_y);
                            change_rect_by_id(view.map, id, x1, y1, x0, y0);
                            request_render();
                        }
                        canvas.addEventListener('mousemove', add_point);
                        function finish_point(){
                            canvas.removeEventListener('mousemove', add_point);
                            window.removeEventListener('mouseup', finish_point);
                            canvas.removeEventListener('mouseleave', finish_point);
                            publish_obj_by_id(view.map, id);
                            note_create_by_id_for_undo(view.map, id);
                        }
                        window.addEventListener('mouseup', finish_point);
                        canvas.addEventListener('mouseleave', finish_point);
                    }break;
                    case RECTTYPE.FILLED:{
                        let id = get_new_id();
                        const x0 = snap(e.offsetX/view.scale-view.camera_x);
                        const y0 = snap(e.offsetY/view.scale-view.camera_y);
                        add_filled_rect(view.map, id, x0, y0, get_primary_color(), get_secondary_color());
                        function add_point(e:MouseEvent){
                            e.stopPropagation();
                            e.preventDefault();
                            const x1 = snap(e.offsetX/view.scale-view.camera_x);
                            const y1 = snap(e.offsetY/view.scale-view.camera_y);
                            change_filled_rect_by_id(view.map, id, x1, y1, x0, y0);
                            request_render();
                        }
                        canvas.addEventListener('mousemove', add_point);
                        function finish_point(){
                            canvas.removeEventListener('mousemove', add_point);
                            window.removeEventListener('mouseup', finish_point);
                            canvas.removeEventListener('mouseleave', finish_point);
                            publish_obj_by_id(view.map, id);
                            note_create_by_id_for_undo(view.map, id);
                        }
                        window.addEventListener('mouseup', finish_point);
                        canvas.addEventListener('mouseleave', finish_point);
                    }break;
                    case RECTTYPE.SOLID:{
                        let id = get_new_id();
                        const x0 = snap(e.offsetX/view.scale-view.camera_x);
                        const y0 = snap(e.offsetY/view.scale-view.camera_y);
                        add_gridrect(view.map, id, x0, y0, get_primary_color());
                        const gridrect = view.map.canvas_objs.get(id) as GridRectangle;
                        view.placing_area.is_placing = true;
                        view.placing_area.is_line = false;
                        view.placing_area.x0 = gridrect.base_x;
                        view.placing_area.y0 = gridrect.base_y;
                        view.placing_area.x1 = gridrect.base_x;
                        view.placing_area.y1 = gridrect.base_y;
                        request_render()
                        function add_point(e:MouseEvent){
                            e.stopPropagation();
                            e.preventDefault();
                            const x1 = snap(e.offsetX/view.scale-view.camera_x);
                            const y1 = snap(e.offsetY/view.scale-view.camera_y);
                            change_gridrect_by_id(view.map, id, x1, y1, x0, y0);
                            view.placing_area.x0 = gridrect.base_x;
                            view.placing_area.y0 = gridrect.base_y;
                            view.placing_area.x1 = gridrect.base_x + gridrect.width;
                            view.placing_area.y1 = gridrect.base_y + gridrect.height;
                            request_render();
                        }
                        canvas.addEventListener('mousemove', add_point);
                        function finish_point(){
                            canvas.removeEventListener('mousemove', add_point);
                            window.removeEventListener('mouseup', finish_point);
                            canvas.removeEventListener('mouseleave', finish_point);
                            view.placing_area.is_placing = false;
                            request_render();
                            publish_obj_by_id(view.map, id);
                            note_create_by_id_for_undo(view.map, id);
                        }
                        window.addEventListener('mouseup', finish_point);
                        canvas.addEventListener('mouseleave', finish_point);
                    }break;
                }
            }break;
            case TOOLTYPE.ELLIPSE:{
                let id = get_new_id();
                const x0 = snap(e.offsetX/view.scale-view.camera_x);
                const y0 = snap(e.offsetY/view.scale-view.camera_y);
                add_ellipse(view.map, id, x0, y0, get_primary_color(), get_secondary_color(), current_ellipse);
                const ellipse = view.map.canvas_objs.get(id)! as Ellipse;
                view.placing_area.is_placing = true;
                view.placing_area.is_line = false;
                view.placing_area.x0 = ellipse.base_x;
                view.placing_area.y0 = ellipse.base_y;
                view.placing_area.x1 = ellipse.base_x;
                view.placing_area.y1 = ellipse.base_y;
                request_render()
                function add_point(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    let x1 = snap(e.offsetX/view.scale-view.camera_x);
                    let y1 = snap(e.offsetY/view.scale-view.camera_y);
                    if(x1 < x0)
                        ellipse.base_x = x1;
                    else
                        ellipse.base_x = x0;
                    if(y1 < y0)
                        ellipse.base_y = y1
                    else
                        ellipse.base_y = y0;
                    ellipse.width = Math.abs(x1-x0);
                    ellipse.height = Math.abs(y1-y0);
                    view.placing_area.x0 = ellipse.base_x;
                    view.placing_area.y0 = ellipse.base_y;
                    view.placing_area.x1 = ellipse.base_x + ellipse.width;
                    view.placing_area.y1 = ellipse.base_y + ellipse.height;
                    request_render();
                }
                canvas.addEventListener('mousemove', add_point);
                function finish_point(){
                    canvas.removeEventListener('mousemove', add_point);
                    window.removeEventListener('mouseup', finish_point);
                    canvas.removeEventListener('mouseleave', finish_point);
                    view.placing_area.is_placing = false;
                    request_render();
                    publish_obj_by_id(view.map, id);
                    note_create_by_id_for_undo(view.map, id);
                }
                window.addEventListener('mouseup', finish_point);
                canvas.addEventListener('mouseleave', finish_point);
            }break;
            case TOOLTYPE.TEXT:{
                const x0 = e.offsetX/view.scale-view.camera_x;
                const y0 = e.offsetY/view.scale-view.camera_y;
                const html = `
                <h2>Enter Text</h2>
                <table class="input-container">
                    <tr>
                        <td><label for="text-size">Size:</label>
                        <td><input type="number" id="text-size" name="text-size" min="8" max="72" value="18" class="numeric-input">
                    </tr>
                    <tr>
                        <td><span>Alignment:</span>
                        <td><input type="radio" id="text-align-left" name="text-align" value="auto" checked>
                        <label for="text-align-left">Left</label>
                        <input type="radio" id="text-align-center" name="text-align" value="auto">
                        <label for="text-align-center">Center</label>
                        <input type="radio" id="text-align-right" name="text-align" value="auto">
                        <label for="text-align-right">Right</label>
                        </td>
                    </tr>
                    <tr>
                        <td><label for="hover-text">Text:</label>
                        <td><textarea name="hover-text" id="hover-text" cols="30" rows="5"></textarea>
                    </tr>
                </table>
                `;
                make_ok_dialog(html, function(hoverpop){
                    const text_input = document.getElementById('hover-text')! as HTMLTextAreaElement;
                    const text = text_input.value;
                    if(!text || !text.trim())
                        return;
                    // const tal = document.getElementById('text-align-left')! as HTMLInputElement;
                    const tac = document.getElementById('text-align-center')! as HTMLInputElement;
                    const tar = document.getElementById('text-align-right')! as HTMLInputElement;
                    let alignment = TEXTALIGNMENT.LEFT;
                    if(tac.checked)
                        alignment = TEXTALIGNMENT.CENTER;
                    else if(tar.checked)
                        alignment = TEXTALIGNMENT.RIGHT;


                    const size_el = document.getElementById('text-size')! as HTMLInputElement;
                    const size = (+size_el.value) | 0;
                    if(size < 8)
                        return;
                    if(size > 72)
                        return;
                    let id = get_new_id();
                    add_text(view.map, id, x0, y0, text, size, alignment);
                    publish_obj_by_id(view.map, id);
                    note_create_by_id_for_undo(view.map, id);
                    request_render();
                });
            }break;
            case TOOLTYPE.IMAGE:{
                const x0 = e.offsetX/view.scale-view.camera_x;
                const y0 = e.offsetY/view.scale-view.camera_y;
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
                    const text = (document.getElementById('hover-url') as HTMLInputElement).value;
                    if(!text || !text.trim()){
                        return;
                    }
                    let width = +(document.getElementById('hover-width') as HTMLInputElement).value;
                    let height = +(document.getElementById('hover-height') as HTMLInputElement).value;
                    if(!width)
                        width = 0;
                    if(!height)
                        height = 0;
                    const round = (document.getElementById('hover-checkbox') as HTMLInputElement).checked;
                    if(round){
                        width = snap_to_grid(width);
                        height = snap_to_grid(height);
                    }
                    let id = get_new_id();
                    add_image(view.map, id, x0, y0, width, height, text);
                    publish_obj_by_id(view.map, id);
                    note_create_by_id_for_undo(view.map, id);
                    request_render();
                });
            }break;
            case TOOLTYPE.TOKEN:{
                if(current_token_type == TOKENTYPE.EZ){
                    const x0 = e.offsetX/view.scale-view.camera_x;
                    const y0 = e.offsetY/view.scale-view.camera_y;
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
                        const text_input = document.getElementById('hover-text') as HTMLInputElement;
                        const text = text_input.value;
                        if(!text || !text.trim())
                            return;
                        let width = +(document.getElementById('hover-width') as HTMLInputElement).value;
                        let height = +(document.getElementById('hover-height') as HTMLInputElement).value;
                        if(!width)
                            width = 1;
                        if(!height)
                            height = 1;
                        let id = get_new_id();
                        ez_token_color = (document.getElementById('hover-color') as HTMLInputElement).value;
                        add_ez_token(view.map, id, x0, y0, text, ez_token_color, width, height);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                        request_render();
                    });
                }
                else {
                    const x0 = e.offsetX/view.scale-view.camera_x;
                    const y0 = e.offsetY/view.scale-view.camera_y;
                    let html = `
                        <h2>Enter Image</h2>
                        <div id="token-img-gallery">
                        </div>
                        <table class="input-container">
                            <tr>
                                <td><label for="url">Token Image URL:</label>
                                <td><input type="url" name="url" id="hover-url" value="">
                            </tr>
                        </table>
                    `;
                    function add_img_buttons(){
                        const gallery = document.getElementById('token-img-gallery')! as HTMLDivElement;
                        const url_input = document.getElementById('hover-url')! as HTMLInputElement;
                        for(let path of token_paths){
                            const button = document.createElement('button');
                            const img = document.createElement('img');
                            const url = `/tokens/${path}`;
                            img.src = url;
                            img.width = 64;
                            img.height = 64;
                            button.appendChild(img);
                            gallery.appendChild(button);
                            button.addEventListener('click', function(){
                                url_input.value = url;
                            });
                        }

                    }
                    make_ok_dialog2(html, add_img_buttons, function(hoverpop:HTMLElement){
                        const text = (document.getElementById('hover-url') as HTMLInputElement).value;
                        if(!text || !text.trim()){
                            return;
                        }
                        let id = get_new_id();
                        add_img_token(view.map, id, x0, y0, text);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                        request_render();
                    });
                }
            }break;
            case TOOLTYPE.FIXTURE:{
                switch(current_fixture_type){
                    // Legacy: is its own impl
                    case FIXTURETYPE.STAIRS:{
                        let id = get_new_id();
                        let x0 = e.offsetX/view.scale-view.camera_x;
                        let y0 = e.offsetY/view.scale-view.camera_y;
                        add_stairs(view.map, id, x0, y0);
                        view.placing_area.is_placing = true;
                        view.placing_area.is_line = false;
                        const stairs = view.map.canvas_objs.get(id)! as Stairs; // lazy
                        view.placing_area.x0 = stairs.base_x;
                        view.placing_area.y0 = stairs.base_y;
                        view.placing_area.x1 = stairs.base_x;
                        view.placing_area.y1 = stairs.base_y;
                        x0 = stairs.base_x;
                        y0 = stairs.base_y;
                        request_render();
                        function change_stairs_on_move(e:MouseEvent){
                            e.stopPropagation();
                            e.preventDefault();
                            const ex0 = e.offsetX/view.scale-view.camera_x;
                            const ey0 = e.offsetY/view.scale-view.camera_y;
                            change_stairs(stairs, x0, y0, ex0, ey0);
                            view.placing_area.x0 = stairs.base_x;
                            view.placing_area.y0 = stairs.base_y;
                            view.placing_area.x1 = stairs.base_x+REFERENCE_WIDTH*stairs.width;
                            view.placing_area.y1 = stairs.base_y+REFERENCE_WIDTH*stairs.height;
                            request_render();
                        }
                        canvas.addEventListener('mousemove', change_stairs_on_move);
                        function finish_point(){
                            view.placing_area.is_placing = false;
                            request_render();
                            canvas.removeEventListener('mousemove', change_stairs_on_move);
                            window.removeEventListener('mouseup', finish_point);
                            canvas.removeEventListener('mouseleave', finish_point);
                            if(stairs.width != 0 && stairs.height != 0){
                                publish_obj_by_id(view.map, id);
                                note_create_by_id_for_undo(view.map, id);
                            }
                            else {
                                stairs.flags |= CANVASFLAG.DELETED;
                            }
                        }
                        window.addEventListener('mouseup', finish_point);
                        canvas.addEventListener('mouseleave', finish_point);
                    }break;
                    default:{
                        let id = get_new_id();
                        const x = snap(e.offsetX/view.scale-view.camera_x);
                        const y = snap(e.offsetY/view.scale-view.camera_y);
                        const fixture = make_fixture(id, x, y, current_fixture_type);
                        add_canv_obj(view.map, fixture);
                        view.placing_area.is_placing = true;
                        view.placing_area.is_line = false;
                        view.placing_area.x0 = fixture.base_x;
                        view.placing_area.y0 = fixture.base_y;
                        view.placing_area.x1 = fixture.base_x;
                        view.placing_area.y1 = fixture.base_y;
                        request_render();
                        function move(e:MouseEvent){
                            e.stopPropagation();
                            e.preventDefault();
                            let x0 = x;
                            let y0 = y;
                            let x1 = snap(e.offsetX/view.scale-view.camera_x);
                            let y1 = snap(e.offsetY/view.scale-view.camera_y);
                            if(x1 < x0){
                                let temp = x1; x1 = x0; x0 = temp;
                            }
                            if(y1 < y0){
                                let temp = y1; y1 = y0; y0 = temp;
                            }
                            fixture.base_x = x0;
                            fixture.base_y = y0;
                            fixture.width = x1 - x0;
                            fixture.height = y1 - y0;
                            view.placing_area.x0 = x0;
                            view.placing_area.y0 = y0;
                            view.placing_area.x1 = x1;
                            view.placing_area.y1 = y1;
                            request_render();
                        }
                        canvas.addEventListener('mousemove', move);
                        function finish(){
                            view.placing_area.is_placing = false;
                            request_render();
                            canvas.removeEventListener('mousemove', move);
                            window.removeEventListener('mouseup', finish);
                            canvas.removeEventListener('mouseleave', finish);
                            if(fixture.width != 0 && fixture.height != 0){
                                publish_obj_by_id(view.map, id);
                                note_create_by_id_for_undo(view.map, id);
                            }
                            else {
                                fixture.flags |= CANVASFLAG.DELETED;
                            }
                        }
                        window.addEventListener('mouseup', finish);
                        canvas.addEventListener('mouseleave', finish);
                    }break;
                }
            }break;
            case TOOLTYPE.MEASURE:{
                let id = get_new_id();
                let snap_center = get_snap_center_func();
                const x0 = snap_center(e.offsetX/view.scale-view.camera_x);
                const y0 = snap_center(e.offsetY/view.scale-view.camera_y);
                let measure = make_measure(id, x0, y0, '#aa0033');
                add_canv_obj(view.map, measure);
                publish_obj_by_id(view.map, id); // don't note create for undo
                request_render();
                function move(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    const x = snap_center(e.offsetX/view.scale-view.camera_x);
                    const y = snap_center(e.offsetY/view.scale-view.camera_y);
                    if(x == measure.x1 && y == measure.y1)
                        return;
                    measure.x1 = x;
                    measure.y1 = y;
                    const stripped = strip_obj(measure);
                    publish_obj_updates(view.map.map_id, [stripped]);
                    request_render();
                }
                canvas.addEventListener('mousemove', move);
                function finish(){
                    publish_delete_by_ids(view.map.map_id, [id]);
                    measure.flags |= CANVASFLAG.DELETED;
                    request_render();
                    canvas.removeEventListener('mousemove', move);
                    window.removeEventListener('mouseup', finish);
                    canvas.removeEventListener('mouseleave', finish);
                }
                window.addEventListener('mouseup', finish);
                canvas.addEventListener('mouseleave', finish);

            }break;
            case TOOLTYPE.FILLED_TILE:{
                let x:number;
                let y:number;
                if(view.map.grid_type == GRIDTYPE.HEX){
                    [x, y] = snap_down_to_hex_grid(e.offsetX/view.scale-view.camera_x, e.offsetY/view.scale-view.camera_y);
                }
                else {
                    x = snap_down_to_grid(e.offsetX/view.scale-view.camera_x);
                    y = snap_down_to_grid(e.offsetY/view.scale-view.camera_y);
                }
                let id = get_new_id();
                let filled: FilledTile = {
                    type: CANVASTYPE.FILLED_TILE,
                    id: id,
                    base_x: x,
                    base_y: y,
                    flags: CANVASFLAG.NONE,
                    color: get_primary_color(),
                };
                add_canv_obj(view.map, filled);
                publish_obj_by_id(view.map, id);
                note_create_by_id_for_undo(view.map, id);
                request_render();
            }break;
            default:{
                console.log('unknown tool:', current_tool);
            }break;
        }
    });
    canvas.addEventListener('dblclick', function(e:MouseEvent){
        let view = get_active_view();
        if(current_tool != TOOLTYPE.SELECT)
            return;
        launch_edit_dialog(view);
    });
    canvas.addEventListener('contextmenu', function(e:MouseEvent){
        e.preventDefault();
        e.stopPropagation();
        ctxmenu_is_active++;
        const ctxmenu = document.createElement('section');
        ctxmenu.classList.add('menu');
        ctxmenu.style.left = e.clientX + 'px';
        ctxmenu.style.top = e.clientY + 'px';
        const view = get_active_view();
        const x = e.offsetX/view.scale - view.camera_x - canvas.width/2/view.scale;
        const y = e.offsetY/view.scale - view.camera_y - canvas.height/2/view.scale;
        const click_x = e.offsetX/view.scale - view.camera_x;
        const click_y = e.offsetY/view.scale - view.camera_y;
        function remove_menu(e?:MouseEvent){
            canvas.removeEventListener('mousedown', remove_menu);
            document.body.removeChild(ctxmenu);
            ctxmenu_is_active--;
            if(e){
                e.stopPropagation();
                e.preventDefault();
            }
        }
        enum CONTEXTMENUWHENFLAGS {
            ALWAYS            = 1 << 0,
            MULTIPLE_SELECTED = 1 << 1, // > 1
            NO_SELECTION      = 1 << 2, // == 0
            ONE_SELECTED      = 1 << 3, // == 1
            ANY_SELECTED      = 1 << 4, // >= 1
        };
        let whenflags = CONTEXTMENUWHENFLAGS.ALWAYS;
        if(view.selected.size == 0){
            whenflags |= CONTEXTMENUWHENFLAGS.NO_SELECTION;
        }
        else {
            whenflags |= CONTEXTMENUWHENFLAGS.ANY_SELECTED;
        }
        if(view.selected.size > 1){
            whenflags |= CONTEXTMENUWHENFLAGS.MULTIPLE_SELECTED;
        }
        if(view.selected.size == 1){
            whenflags |= CONTEXTMENUWHENFLAGS.ONE_SELECTED;
        }

        canvas.addEventListener('mousedown', remove_menu);
        type itemtype = {
            label:string;
            func: () => void;
            disabled: boolean;
            whenflags: CONTEXTMENUWHENFLAGS;
        };
        const items: Array<itemtype> = [
            {
                label: 'Ping',
                func: function(){ping_at(view.map, click_x, click_y);remove_menu();},
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.NO_SELECTION,
            },
            {
                label: 'Zoom In',
                func: function(){zoom_in(view);remove_menu();},
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.NO_SELECTION,
            },
            {
                label: 'Zoom Out',
                func: function(){zoom_out(view);remove_menu();},
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.NO_SELECTION,
            },
            {
                label: 'Reset Zoom',
                func: function(){reset_zoom(view);remove_menu();},
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.NO_SELECTION,
            },
            {
                label: 'Gather Party',
                func: function(){
                    socket.emit('canvas-gather', {x:-x, y:-y, map_id:view.map.map_id});
                    remove_menu();
                },
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.NO_SELECTION,
            },
            {
                label: 'Edit',
                func: function(){
                    launch_edit_dialog(view);
                    remove_menu();
                },
                disabled: edit_is_impossible(view),
                whenflags: CONTEXTMENUWHENFLAGS.ONE_SELECTED,
            },
            {
                label: 'Cut',
                func: function(){
                    clear_copy_buffer();
                    cut_selected_objs_to_copy_buffer(view);
                    remove_menu();
                },
                disabled: view.selected.size === 0,
                whenflags: CONTEXTMENUWHENFLAGS.ANY_SELECTED,
            },
            {
                label: 'Copy',
                func: function(){
                    clear_copy_buffer();
                    copy_selected_objs_to_copy_buffer(view);
                    remove_menu();
                },
                disabled: view.selected.size === 0,
                whenflags: CONTEXTMENUWHENFLAGS.ANY_SELECTED,
            },
            {
                label: 'Paste',
                func: function(){
                    paste_from_copy_buffer_at(view.map, click_x, click_y);
                    remove_menu();
                },
                disabled: copied_objs.length === 0,
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Undo',
                func: function(){
                    do_one_undo(view.map);
                    remove_menu();
                },
                disabled: undo_is_impossible(view.map),
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Redo',
                func: function(){
                    do_one_redo(view.map);
                    remove_menu();
                },
                disabled: redo_is_impossible(view.map),
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Cancel',
                func: function(){remove_menu();},
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
        ];
        for(let i = 0; i < items.length; i++){
            const item = items[i];
            if(!(item.whenflags & whenflags))
                continue;
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
function make_ok_dialog(html:string, on_ok:(_:HTMLElement)=>void){
    make_ok_dialog2(html, function(){}, on_ok);
}
function make_ok_dialog2(html:string, after_append:()=>void, on_ok:(_:HTMLElement)=>void){
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
    hoverpop.innerHTML += "<script>alert('hello world')</sc"+"ript>";
    document.body.appendChild(hoverpop);
    after_append();
    function remove_hoverpop(){
        document.body.removeChild(hoverpop);
        hover_is_open = false;
    }
    const ok = document.getElementById('hoverpop-ok')!;
    function submit(){
        on_ok(hoverpop);
        remove_hoverpop();
    }
    ok.addEventListener('click', function(){
        submit();
    });
    const cancel = document.getElementById('hoverpop-cancel')!;
    cancel.addEventListener('click', function(){
        remove_hoverpop();
    });
    const text_inputs = hoverpop.getElementsByTagName('input');
    let did_focus = false;
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
    const text_areas = hoverpop.getElementsByTagName('textarea');
    for(let ta of text_areas){
        if(!did_focus){
            ta.focus();
            did_focus = true;
        }
    }
}

document.addEventListener('DOMContentLoaded', function(){
    const edit_map_button = document.getElementById('edit-map-button')! as HTMLButtonElement;
    const new_map_button = document.getElementById('new-map-button')! as HTMLButtonElement;
    edit_map_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        const active_view = get_active_view();
        const cant_delete = active_view.map.flags & MapFlags.CANT_DELETE;
        let html = `
        <h2>Edit Map</h2>
        <table class="input-container">
            <tr>
                <td><label for="text">Map Name:</label>
                <td><input type="text" name="text" id="hover-text" value="${active_view.map.map_name}">
            </tr>
            <tr>
                <td><label for="hover-hex-grid">Hex Grid</label>
                <td><input name="hover-hex-grid" type="checkbox" id="hover-hex-grid" ${(function(){
                     switch(active_view.map.grid_type){
                         case GRIDTYPE.SQUARE:
                             return "";
                         case GRIDTYPE.HEX:
                             return "checked";
                         case GRIDTYPE.NOGRID:
                             return "";
                     }
                })()}>
            </tr>
            <tr>
                <td><label for="hover-numbered">Numbered</label>
                <td><input name="hover-numbered" type="checkbox" id="hover-numbered" ${(active_view.map.flags & MapFlags.NUMBERED)?"checked":""}>
            </tr>
        `;
        if(!cant_delete){
            html += `
            <tr>
                <td><label for="hover-delete">Delete Map</label>
                <td><input name="hover-delete" type="checkbox" id="hover-delete">
            </tr>
            `
        }
        html += `
        </table>
        `;
        function on_ok(unused:any){
            const name_input = document.getElementById('hover-text')! as HTMLInputElement;
            if(!cant_delete){
                const delete_checkbox = document.getElementById('hover-delete')! as HTMLInputElement;
                const should_delete = delete_checkbox.checked;
                if(should_delete){
                    socket.emit('canvas-delete-map-request', active_view.map.map_id);
                    return;
                }
            }
            if(!name_input.value)
                return;
            const name = name_input.value.trim();
            if(!name.length)
                return;
            rename_map(active_view.map, name);
            socket.emit('canvas-name-map', {map_id:active_view.map.map_id, map_name:name});
            const hg = document.getElementById('hover-hex-grid')! as HTMLInputElement;
            const gt = hg.checked? GRIDTYPE.HEX : GRIDTYPE.SQUARE;
            if(active_view.map.grid_type != gt)
                socket.emit('canvas-grid-type', {map_id:active_view.map.map_id, grid_type:gt});
            const numbered = (document.getElementById('hover-numbered')! as HTMLInputElement).checked? MapFlags.NUMBERED : 0;
            if((active_view.map.flags & numbered) != numbered)
                socket.emit('canvas-grid-numbered', {map_id:active_view.map.map_id, numbered:numbered});
        }
        make_ok_dialog(html, on_ok);
    });
    new_map_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        const html = `
        <h2>New Map</h2>
        <table class="input-container">
            <tr>
                <td><label for="text">Map Name:</label>
                <td><input type="text" name="text" id="hover-text" value="">
            </tr>
            <tr>
                <td><label for="hover-hex-grid">Hex Grid</label>
                <td><input name="hover-hex-grid" type="checkbox" id="hover-hex-grid">
            </tr>
        </table>
        `;
        function on_ok(unused:any){
            const text = document.getElementById('hover-text')! as HTMLInputElement;
            const value = text.value;
            if(!value)
                return;
            if(!value.length)
                return;
            const hg = document.getElementById('hover-hex-grid')! as HTMLInputElement;
            const gt = hg.checked? GRIDTYPE.HEX : GRIDTYPE.SQUARE;
            socket.emit('canvas-new-map-request', {name:value, grid_type:gt});
        }
        make_ok_dialog(html, on_ok);
    });
});

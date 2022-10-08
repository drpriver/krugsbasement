//
// Copyright © 2021-2022, David Priver
//

const {
    export_maps,
    import_maps,
    screenshot,
    request_render,
    resize_canvas,
} = (function(){
let SHOW_FPS = false;
const enum FUDGE {
    _ = 1,
}
const enum INDEX {
    TYPE = 0,
    ID = 1,
    BASE_X = 2,
    BASE_Y = 3,
    FLAGS = 4,
    HIDINGUSER = 5,
    SUBMAP = 6,
}
function bbox_overlaps_ref_unit_hexagon(bbox:Bbox, bx:number, by:number):boolean{
    const inner_bbox = {
        x0: bx+9,
        x1: bx+REFERENCE.WIDTH-9,
        y0: by,
        y1: by+REFERENCE.WIDTH,
    };
    if(bbox_overlaps(bbox, inner_bbox)) return true;
    if(bbox_overlaps_triangle(bbox, [bx+9,by, bx+9, by+REFERENCE.HALF_WIDTH, bx-9, by+REFERENCE.HALF_WIDTH]))
        return true;
    if(bbox_overlaps_triangle(bbox, [bx+9, by+REFERENCE.HALF_WIDTH, bx-9, by+REFERENCE.HALF_WIDTH, bx+9, by+REFERENCE.WIDTH]))
        return true;
    if(bbox_overlaps_triangle(bbox, [bx+REFERENCE.WIDTH-9, by, bx+REFERENCE.WIDTH-9, by+REFERENCE.HALF_WIDTH, bx+REFERENCE.WIDTH+9, by+REFERENCE.HALF_WIDTH]))
        return true;
    if(bbox_overlaps_triangle(bbox, [bx+REFERENCE.WIDTH-9, by+REFERENCE.HALF_WIDTH, bx+REFERENCE.WIDTH+9, by+REFERENCE.HALF_WIDTH, bx+REFERENCE.WIDTH-9, by+REFERENCE.WIDTH]))
        return true;
    return false;
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
       6, // TEXT
       7, // EZ_TOKEN
       7, // IMG_TOKEN
       4, // DOOR
       4, // STAIRS
     100, // MEASURE
       4, // FIXTURE
       1, // FILLED_TILE
       1, // TERRAIN_TILE
       1, // ICON_TILE
      10, // SUBMAP
];
type Resizable = Rectangle | GridRectangle | FilledRectangle | Ellipse | ImageObj | SubMap | Arc | Stairs;

function is_resizable(obj:CanvasObject): obj is Resizable{
    switch(obj.type){
        case CanvasType.RECT:
        case CanvasType.GRID_RECT:
        case CanvasType.FILLED_RECT:
        case CanvasType.ELLIPSE:
        case CanvasType.IMAGE:
        case CanvasType.STAIRS:
        case CanvasType.SUBMAP:
        case CanvasType.FIXTURE:
        case CanvasType.ARC:
            return true
        default:
            return false;
    }
}

//
// Base of all objects and then the rest of the fields are different.
// Essentially, they are tagged unions.
//
// This interface is implicit as it is the
// intersection of all the canvas objects.
// interface CanvasObject {
//     type: CanvasType;
//     id: number;
//     base_x: number;
//     base_y: number;
//     flags: CanvasFlag;
// }
//
// Additionally, each object also has a "stripped" representation, which is the
// minimal amount of information for that object. These are defined in
// types.shared. They are arrays instead of objects, as those are smaller when
// serialized to json.
//

// freehand-line
// -------------
// Freehand lines are a bag of sequenced points that are
// interpolated together with quadratic curves.
// The server can optimize the lines by removing redundant
// points.
type FreehandLine = {
    type: CanvasType.FREEHAND_LINE; // FREEHAND_LINE
    id: number;
    base_x: number;
    base_y: number;
    flags: CanvasFlag;
    hidinguser: number;
    submap: number;
    color: string;
    // points are just raw x,y pairs in a flat array.
    points: Array<number>;
    path?: Path2D;
    bbox: Bbox;
    thickness: number;
    // These are a hack to know if the path got invalidated.
    last_bx?:number;
    last_by?:number;
}

const enum LineType {
    PEN = 0,
    LINE = 1,
    ARROW = 2,
}
const enum LINETYPE {
    MAX = 3,
}
const LINETYPE_TO_NAME = [
    'Pen',
    'Line',
    'Arrow',
];
let current_line_type = LineType.PEN;

// shape
// -----
// A shape is a shape enclosed by an arbitrary sequence of points.
// The points are interpolated together
// with quadratic curves.
type Shape = {
    type: CanvasType.SHAPE; // SHAPE
    id: number;
    base_x: number;
    base_y: number;
    flags: CanvasFlag;
    hidinguser: number;
    submap: number;
    color: string;
    color2: string;
    // points are just raw x,y pairs in a flat array.
    points: Array<number>;
    path?: Path2D;
    bbox: Bbox;
    thickness: number;
    // These are a hack to know if the path got invalidated.
    last_bx?:number;
    last_by?:number;
}

const enum ShapeType {
    SOLID_SHAPE = 0,
    FILLED_SHAPE = 1,
}
const enum SHAPETYPE {
    MAX = 2,
}
const SHAPETYPE_TO_NAME = [
    'Solid',
    'Filled',
];

const SHAPETYPE_TO_SHORT_NAME = [
    'Solid',
    'Filled',
];

let current_shape = ShapeType.SOLID_SHAPE;
//  grid-line
//  ---------
//  A grid line are straight line-fragments whose points snap
//  to the corners of the grid.
//  Optimizing the points array is easy.
//  When moving this object, movements need to snap to the closest
//  grid point. When moving multiple objects, all of them need to snap
//  this way so that their relative positions are maintained.
type GridLine = {
    type: CanvasType.GRID_LINE; // GRID_LINE
    id: number;
    base_x: number;
    base_y: number;
    flags: CanvasFlag;
    hidinguser: number;
    submap: number;
    color: string;
    // points are just raw x,y pairs in a flat array.
    points: Array<number>;
    path?: Path2D;
    bbox: Bbox;
    // These are a hack to know if the path got invalidated.
    last_bx?:number;
    last_by?:number;
}
//  rectangle
//  ---------
//  An axis-aligned box.
//  base_x and base_y is the top-left corner of the box.
//  This is a HOLLOW rectangle

type Rectangle = {
    type: CanvasType.RECT,
    id: number,
    base_x: number,
    base_y: number,
    flags: CanvasFlag,
    hidinguser: number;
    submap: number;
    color: string,
    width: number,
    height: number,
}

//  filled-rectangle
//  ---------
//  An axis-aligned box, but the center is filled with 'color2'
//  base_x and base_y is the top-left corner of the box.
//
//  This is a FILLED rectangle
type FilledRectangle = {
    type: CanvasType.FILLED_RECT,
    id: number,
    base_x: number,
    base_y: number,
    flags: CanvasFlag,
    hidinguser: number;
    submap: number;
    color: string,
    color2: string,
    width: number,
    height: number,
}
//  grid-rectangle
//  ---------
//  An axis-aligned box, whose corners snap to the grid.
//  Same movement restrictions apply to this as apply to the
//  grid-line.
//  base_x and base_y is the top-left corner of the box.
//  This is a SOLID rectangle.

type GridRectangle = {
    type: CanvasType.GRID_RECT,
    id: number,
    base_x: number,
    base_y: number,
    flags: CanvasFlag,
    hidinguser: number;
    submap: number;
    color: string,
    width: number,
    height: number,
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
//  ellipse
//  -------
//  base_x and base_y is the center of the ellipse.
//  We only allow axis-aligned ellipses.
//
type Ellipse = {
    type: CanvasType.ELLIPSE,
    id: number,
    base_x: number,
    base_y: number,
    flags: CanvasFlag,
    hidinguser: number;
    submap: number;
    color: string,
    color2: string,
    width: number,
    height: number,
    variant: ELLIPSETYPE,
}

//  image
//  -----
type ImageObj = {
    type: CanvasType.IMAGE; // IMAGE
    id: number;
    base_x: number;
    base_y: number;
    flags: CanvasFlag;
    hidinguser: number;
    submap: number;
    width: number;
    height: number;
    url: string;
    img?: HTMLImageElement;
}

//  text
//  ----
type TextObj = {
    type: CanvasType.TEXT; // TEXT
    id: number;
    base_x: number;
    base_y: number;
    flags: CanvasFlag;
    hidinguser: number;
    submap: number;
    text: string;
    size: number;
    bbox: Bbox;
    lines: Array<string>;
    bboxes: Array<Bbox>;
    alignment: TextAlignment;
    map_id: number; // integer
}

let PACKED: Packed | null = null;
let TERRAIN_BY_ID: Map<number, Terrain> = new Map();
let TERRAIN_ICON_BY_ID: Map<number, TerrainIcon> = new Map();
let TOKEN_BY_PATH: Map<string, Token> = new Map();
let PACKEDIMG = new Image();
PACKEDIMG.addEventListener('error', function(){
    // try again with png
    PACKEDIMG.src = '/tiles/packed.png';
}, {once:true});
PACKEDIMG.src = '/tiles/packed.webp'
let TOKENIMG = new Image();
TOKENIMG.addEventListener('error', function(){
    // try again with png
    TOKENIMG.src = '/tiles/toks.png';
}, {once:true});
TOKENIMG.src = '/tiles/toks.webp'
fetch('/tiles/packed.json') .then(response => response.json()) .then(data => {
    PACKED=data;
    for(let t of PACKED!.terrain)
        TERRAIN_BY_ID.set(t[0], t);
    for(let t of PACKED!.terrain_icons)
        TERRAIN_ICON_BY_ID.set(t[0], t);
    for(let t of PACKED!.tokens)
        TOKEN_BY_PATH.set(`/tokens/${t[1]}`, t)
    if(current_tool == ToolType.TILE){
        switch(current_tile_type){
            case TileType.ICON:
                make_terrain_icon_palette();
                break;
            case TileType.TERRAIN:
                make_terrain_palette();
                break;
            default:
                break;
        }
    }
});

//  ez-token
//  --------
//  A token that just has a simple text label.

type EzToken = {
    type: CanvasType.EZ_TOKEN,
    id: number,
    base_x: number,
    base_y: number,
    flags: CanvasFlag
    hidinguser: number;
    submap: number;
    text: string,
    color: string,
    width: number, // in squares (?)
    height: number, // in squares (?)
    statusflags: TokenStatusFlags,
}

//  img-token
//  --------
//  A token that has an image as its contents.
type ImgToken = {
    type: CanvasType.IMG_TOKEN; // IMG_TOKEN
    id: number;
    base_x: number;
    base_y: number;
    flags: CanvasFlag;
    hidinguser: number;
    submap: number;
    url: string;
    img?: HTMLImageElement,
    width: number; // in squares (?)
    height: number; // in squares (?)
    statusflags: TokenStatusFlags;
}
//  door
//  ----
//  A door.
type DoorObj = {
    type: CanvasType.DOOR,
    id: number,
    base_x: number,
    base_y: number,
    flags: CanvasFlag
    hidinguser: number;
    submap: number;
    doortype: DoorType
    color: string,
    width: number, // in squares (?)
    orientation: Orientation,
}


type Stairs = {
    type: CanvasType.STAIRS,
    id: number,
    base_x: number,
    base_y: number,
    flags: CanvasFlag,
    hidinguser: number;
    submap: number;
    width: number, // in squares
    height: number, // in squares
    rotation: Rotation,
}

// Measure
// -------
// This is a weird object, but it is the measurement tool.
type MeasureObj = {
    type: CanvasType.MEASURE,
    id: number,
    base_x: number,
    base_y: number,
    flags: CanvasFlag
    hidinguser: number;
    submap: number;
    color: string,
    x1: number,
    y1: number,
}

const FixtureType_MAX = FixtureType.WELL + 1;
const FixtureType_TO_NAME = [
    // FixtureType.STATUE
    'Statue',
    // FixtureType.STAIRS
    'Stairs',
    // FixtureType.PIT
    'Pit',
    // FixtureType.RUBBLE
    'Rubble',
    // FixtureType.WELL
    'Well',
];

// Fixture
// ----------
// For dungeon fixtures, like rubble or pits.

type FixtureObj = {
    type: CanvasType.FIXTURE,
    id: number,
    base_x: number,
    base_y: number,
    flags: CanvasFlag,
    hidinguser: number;
    submap: number;
    width: number,
    height: number,
    ftype: FixtureType,
}

let current_tile_type = TileType.FILLED;
let current_terrain_id: number = 0;
const TileType_MAX = TileType.ICON+1;
const TileType_TO_NAME = [
    // TileType.FILLED
    'Filled',
    // TileType.TERRAIN
    'Terrain',
    // TileType.ICON
    'Icon',
];

// FilledTile
// ----------

type FilledTile = {
    type: CanvasType.FILLED_TILE,
    id: number,
    base_x: number,
    base_y: number,
    flags: CanvasFlag,
    hidinguser: number;
    submap: number;
    color: string,
    size: number,
}

// TerrainTile
// -----------
type TerrainTile = {
    type: CanvasType.TERRAIN_TILE; // TERRAIN_TILE
    id: number;
    base_x: number;
    base_y: number;
    flags: CanvasFlag;
    hidinguser: number;
    submap: number;
    terrain_id: number;
}

let current_terrain_icon_id: number = 0;
// IconTile
// --------
type IconTile = {
    type: CanvasType.ICON_TILE; // ICON_TILE
    id: number;
    base_x: number;
    base_y: number;
    flags: CanvasFlag;
    hidinguser: number;
    submap: number;
    terrainicon_id: number;
}
// SubMap
// ------
type SubMap = {
    type: CanvasType.SUBMAP; // SUBMAP
    id: number;
    base_x: number;
    base_y: number;
    flags: CanvasFlag;
    hidinguser: number;
    submap: number;
    width: number;
    height: number;
    tlx : number;
    tly: number;
    grid_type: GridType;
    title: string;
    grid_color: string;
    bg_color: string;
}

// Arc
// ---
type Arc = {
    type: CanvasType.ARC; // ARC
    id: number;
    base_x: number;
    base_y: number
    flags: CanvasFlag;
    hidinguser: number;
    submap: number;
    width: number;
    height: number;
    start_arc: number;
    end_arc: number;
    thickness: number;
    color: string;
}

const enum ArcType {
    SEMI = 0,
    QUARTER = 1,
}

const enum ARCTYPE {
    MAX = 2,
}

const ARCTYPE_TO_NAME = ['Semi', 'Quarter'];
let current_arc_type = ArcType.SEMI;
function set_arc_type(i:number){
    current_arc_type = i;
    store_global(StorageCategory.CANVAS, 'arctype', current_arc_type);
}

function arc_components(obj:Arc, offx:number, offy:number):[number, number, number, number]{
    let sa = obj.start_arc & 3;
    let cx = obj.base_x;
    let cy = obj.base_y;
    let rx = obj.width;
    let ry = obj.height;
    if((obj.end_arc - obj.start_arc) == 1){
        switch(sa){
            case 0:
                break;
            case 1:
                cx += obj.width;
                break;
            case 2:
                cx += obj.width;
                cy += obj.height;
                break;
            case 3:
                cy += obj.height
                break;
        }
    }
    else {
        switch(sa){
            case 0:
                rx /=2;
                cx += rx;
                break;
            case 1:
                cx += rx;
                ry /=2 ;
                cy += ry;
                break;
            case 2:
                cy += ry;
                rx /= 2;
                cx += rx;
                break;
            case 3:
                ry /= 2;
                cy += ry;
                break;
        }
    }
    return [cx+offx, cy+offy, rx, ry];
}



type CanvasObject = FreehandLine | GridLine | Rectangle | FilledRectangle | GridRectangle | ImageObj | TextObj | EzToken | ImgToken | DoorObj | Stairs | Ellipse | MeasureObj | FixtureObj | FilledTile | TerrainTile | IconTile | SubMap | Shape | Arc;

// Door subtypes
// ------------
const DoorType_MAX = DoorType.WINDOW + 1;
const DOOR_TO_NAMES = [
    // DoorType.DOOR
    'Door',
    // DoorType.DOUBLE
    'Double',
    // DoorType.PORTCULLIS
    'Portcullis',
    // DoorType.SECRET
    'Secret',
    // DoorType.BRICKED_WALL
    'Bricks',
    // DoorType.PORTAL
    'Portal',
    // DoorType.CURTAINS
    'Curtains',
    // DoorType.HALLWAY
    'Hallway',
    // DoorType.WINDOW
    'Window',
];
const DOOR_TO_SHORT_NAMES = [
    // DoorType.DOOR
    'Door',
    // DoorType.DOUBLE
    'Double',
    // DoorType.PORTCULLIS
    'Portcul',
    // DoorType.SECRET
    'Secret',
    // DoorType.BRICKED_WALL
    'Bricks',
    // DoorType.PORTAL
    'Portal',
    // DoorType.CURTAINS
    'Curtain',
    // DoorType.HALLWAY
    'Hall',
    // DoorType.WINDOW
    'Window',
];
let current_door = DoorType.DOOR;

const enum GRIDSCALE {
    FIVE = 0,
    TEN  = 1,
};
let gridscale = GRIDSCALE.TEN;
function change_gridscale(newscale:GRIDSCALE){
    gridscale = newscale;
    switch(gridscale){
        case GRIDSCALE.FIVE:
            visually_set_snapmode(SNAPMODE.HALF);
            break;
        case GRIDSCALE.TEN:
            visually_set_snapmode(SNAPMODE.GRID);
            break;
    }
    request_render();
}
function visually_set_gridscale(newscale:GRIDSCALE){
    // change_gridscale(newscale);
    switch(newscale){
        case GRIDSCALE.TEN:{
            const g = by_id('grid-10');
            g.click();
        }break;
        case GRIDSCALE.FIVE:{
            const g = by_id('grid-5');
            g.click();
        }break;
    }
}
document.addEventListener('DOMContentLoaded', function(){
    // Checking if the elements is checked
    by_id('grid-10').addEventListener('change', function(){
        change_gridscale(GRIDSCALE.TEN);
    });
    if(by_id('grid-10').checked) gridscale = GRIDSCALE.TEN;
    by_id('grid-5').addEventListener('change', function(){
        change_gridscale(GRIDSCALE.FIVE);
    });
    if(by_id('grid-5').checked) gridscale = GRIDSCALE.FIVE;
});

const enum SNAPMODE {
    GRID    = 0, // "GRID",
    HALF    = 1, // "HALF",
    QUARTER = 2, // "QUARTER",
    FREE    = 3, // "FREE",
}
let snapmode: SNAPMODE = SNAPMODE.GRID;
function invisibly_change_snapmode(mode:SNAPMODE){
    snapmode = mode;
}
function visually_set_snapmode(mode:SNAPMODE){
    switch(mode){
        case SNAPMODE.GRID:
            by_id('grid-snap-grid').click();
            break;
        case SNAPMODE.HALF:
            by_id('grid-snap-half').click();
            break;
        case SNAPMODE.QUARTER:
            by_id('grid-snap-quarter').click();
            break;
        case SNAPMODE.FREE:
            by_id('grid-snap-free').click();
            break;
    }
}
document.addEventListener('DOMContentLoaded', function(){
    function do_it(id:string, mode:SNAPMODE){
        const snap: HTMLInputElement = get_by_id(id);
        snap.addEventListener('change', function(){
            invisibly_change_snapmode(mode);
        });
        if(snap.checked) snapmode = mode;

    }
    do_it('grid-snap-grid',    SNAPMODE.GRID);
    do_it('grid-snap-half',    SNAPMODE.HALF);
    do_it('grid-snap-quarter', SNAPMODE.QUARTER);
    do_it('grid-snap-free',    SNAPMODE.FREE);
});

document.addEventListener('DOMContentLoaded', function(){
    const zoom_in_b = by_id('zoom-in');
    const zoom_out_b = by_id('zoom-out');
    zoom_in_b.addEventListener('click', function(){
        const view = get_active_view();
        zoom_in(view);
    });
    zoom_out_b.addEventListener('click', function(){
        const view = get_active_view();
        zoom_out(view);
    });
    by_id('undo').addEventListener('click', function(){
        const view = get_active_view();
        do_one_undo(view.map);
    });
    by_id('redo').addEventListener('click', function(){
        const view = get_active_view();
        do_one_redo(view.map);
    });
    by_id('cut').addEventListener('click', function(){
        const view = get_active_view();
        if(view.selected.size !== 0){
            clear_copy_buffer();
            cut_selected_objs_to_copy_buffer(view);
        }
    });
    by_id('copy').addEventListener('click', function(){
        const view = get_active_view();
        if(view.selected.size !== 0){
            clear_copy_buffer();
            copy_selected_objs_to_copy_buffer(view);
        }
    });
    by_id('paste').addEventListener('click', function(){
        const view = get_active_view();
        if(copied_objs.length){
            let submapid = 0;
            let x = view.mouse.x; let y = view.mouse.y;
            let sm = get_submap_at(view, x, y);
            if(sm){
                submapid = sm.id;
                x -= sm.base_x + sm.tlx;
                y -= sm.base_y + sm.tly;
            }
            paste_from_copy_buffer_at(view.map, x, y, submapid);
        }
    });
    by_id('delete').addEventListener('click', function(){
        const view = get_active_view();
        if(!view.selected.size)
            return;
        let deleted = [];
        for(let item of view.selected){
            let o = view.map.canvas_objs.get(item)!;
            if(o.flags & CanvasFlag.DELETED) continue;
            o.flags |= CanvasFlag.DELETED;
            deleted.push(o.id);
            // #SPEED: faster way to get all objects in this submap
            if(o.type == CanvasType.SUBMAP){
                for(let obj of view.map.canvas_obj_array){
                    if(obj.flags & CanvasFlag.DELETED) continue;
                    if(obj.submap == o.id){
                        obj.flags |= CanvasFlag.DELETED;
                        deleted.push(obj.id);
                    }
                }

            }
        }
        if(deleted.length){
            publish_delete_by_ids(view.map.map_id, deleted);
            note_delete_by_ids_for_undo(view.map, deleted);
        }
        end_selecting(view);
    });
    by_id('edit').addEventListener('click', function(){
        const view = get_active_view();
        launch_edit_dialog(view);
    });
});

const MAPS:Map<number,DungeonMap> = new Map();
const MapOptionElements: Map<number, HTMLOptionElement> = new Map();

type DungeonMap = {
    map_id: number; // integer
    grid_type: GridType;
    grid_color: string;
    bg_color: string;
    map_name: string;
    flags: MapFlags;
    canvas_obj_array: Array<CanvasObject>;
    canvas_objs: Map<number, CanvasObject>;
    is_sorted: boolean;
    undo_stack: Array<UndoEvent>;
    undo_position: number; // integer
    pings: Array<Ping>;
    submaps: Array<SubMap>;
}

function export_maps():Array<InitializeMap>{
    let result = [];
    for(let map of MAPS.values())
        result.push(export_map(map));
    return result;
}

function import_maps(msgs:Array<InitializeMap>){
    initialize_maps(msgs);
    // Fix up our localid to avoid collisions.
    let highest = 0;
    for(let map of MAPS.values()){
        for(let o of map.canvas_obj_array){
            let local = o.id & 0xfffff;
            if(local > highest) highest = local;
        }
    }
    localid = highest;
}

function export_map(map:DungeonMap):InitializeMap{
    return {
        map_id: map.map_id,
        map_name: map.map_name,
        objects: strip_objs(map.canvas_obj_array, true),
        flags: map.flags,
        grid_type: map.grid_type,
        grid_color: map.grid_color,
        bg_color: map.bg_color,
    };
}

type Ping = {
    t0?: DOMHighResTimeStamp; // we add this onto the PingMessage
    cx: number;
    cy: number;
    color: string;
};
function ping_at(map:DungeonMap, x:number, y:number){
    const ping: PingMessage = {
        ping: {cx:x, cy:y, color:'#ff3300'},
        map_id:map.map_id,
    };;
    // map.pings.push(ping);
    EMIT(FromClient.CANVAS_PING, ping);
    request_render();
}
ONRECV(ToClient.CANVAS_PING, function(data:PingMessage){
    const map = get_map(data.map_id);
    map.pings.push(data.ping);
    request_render();
});
type ResizeHandle = {
    bbox: Bbox;
    obj_id: number;
    topleft: boolean;
}
type ActionArea = {
    bbox: Bbox;
    obj_id: number;
    action: number;
}
type DungeonMapView = {
    map: DungeonMap; // non-owning
    // These are in REFERENCE.WIDTH space.
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
        submap: number;
    };
    placing_area: {
        is_placing: boolean;
        is_line: boolean;
        x0: number;
        x1: number;
        y0: number;
        y1: number;
    };
    mouse: {
        x: number;
        y: number;
    };
    hovered_id: number;
    resize: {
        handles: Array<ResizeHandle>;
        resizing: boolean;
    };
    action: {
        areas: Array<ActionArea>;
    };
}
let active_map_view_index = 0;
let dungeon_map_views: Array<DungeonMapView> = [];
function new_map_view(map_id:number): DungeonMapView{
    const view: DungeonMapView = {
        map: get_map(map_id),
        camera_x: 0,
        camera_y: 0,
        scale: 0.5,
        selected: new Set(),
        selection_area: {
            select_one: false,
            is_selecting: false,
            x0:0, y0:0,
            x1:0, y1:0,
            submap: 0,
        },
        placing_area: {
            is_placing: false,
            is_line: false,
            x0: 0, y0: 0,
            x1: 0, y1: 0,
        },
        mouse:{
            x: -1, y:-1,
        },
        hovered_id: -1,
        resize: {
            handles: [],
            resizing: false,
        },
        action:{
            areas: [],
        },
    };
    return view;
}
function center_view_at(view:DungeonMapView, x:number, y:number){
    view.camera_x = -x + TheCanvas.width/2/view.scale;
    view.camera_y = -y + TheCanvas.height/2/view.scale;
    request_render();
}
function change_active_map_view(idx: number, from_select:boolean, store:boolean){
    let old_view = active_map_view_index >=0 && active_map_view_index < dungeon_map_views.length? dungeon_map_views[active_map_view_index]:null;
    if(old_view && store){
        store_local(StorageCategory.CANVAS, `camera.${active_map_view_index}`, [old_view.camera_x, old_view.camera_y, old_view.scale]);
    }
    active_map_view_index = idx;
    if(store){
        store_local(StorageCategory.CANVAS, 'active_map_view_index', idx);
    }
    let camera = get_local(StorageCategory.CANVAS, `camera.${active_map_view_index}`);
    if(camera !== undefined){
        try {
            let [cx, cy, scale] = camera;
            let view = dungeon_map_views[active_map_view_index];
            view.camera_x = cx;
            view.camera_y = cy;
            view.scale = scale;
        }
        catch(e){
        }
    }
    request_render();
    if(from_select)
        return;
    const select = by_id('current-map-name');
    for(let i = 0; i < select.options.length; i++){
        if(+select.options[i].value == dungeon_map_views[idx].map.map_id){
            select.selectedIndex = i;
            break;
        }
    }
}
document.addEventListener('DOMContentLoaded', function(){
    const select = by_id('current-map-name');
    select.addEventListener('input', function(e:Event){
        e.stopPropagation();
        change_map(+select.value, true);
        map_hist.add(+select.value);
        select.blur();
    });
});
function get_active_view(): DungeonMapView{
    if(!dungeon_map_views.length){
        dungeon_map_views.push(new_map_view(0));
        change_active_map_view(0, false, false);
    }
    return dungeon_map_views[active_map_view_index];
}
document.addEventListener('visibilitychange', function(){
    let view = get_active_view();
    if(view)
        store_local(StorageCategory.CANVAS, `camera.${active_map_view_index}`, [view.camera_x, view.camera_y, view.scale]);
});
function get_map(map_id:number): DungeonMap {
    if(MAPS.has(map_id))
        return MAPS.get(map_id)!;
    const new_map:DungeonMap = {
        map_id: map_id,
        map_name: 'Untitled',
        grid_type: GridType.SQUARE,
        grid_color: '',
        bg_color: '',
        flags: MapFlags.NONE,

        canvas_obj_array: [],
        canvas_objs: new Map(),
        is_sorted: true,

        undo_stack: [],
        undo_position: 0,

        pings: [],
        submaps: [],
    };
    EMIT(FromClient.CANVAS_CREATE_MAP, map_id);
    MAPS.set(map_id, new_map);
    const option = document.createElement('option');
    option.innerText = 'Untitled';
    option.value = ""+map_id;
    MapOptionElements.set(map_id, option);
    const select = by_id('current-map-name');
    select.options.add(option);
    return new_map;
}

function update_disabled_forward_back(){
    by_id('back-map-button').disabled = !map_hist.can_go_back();
    by_id('forward-map-button').disabled = !map_hist.can_go_forward();
}

// Map History stack for going forward and backward when clicking on map links
// or using the map changer dropdown.
const map_hist = (function(){
    const h:{
        idx: number;
        ids: Array<number>;
        go_back:()=>void;
        go_forward:()=>void;
        can_go_back:()=>boolean;
        can_go_forward:()=>boolean;
        add:(_:number)=>void;
        clear:()=>void;
    } = {
        idx: -1,
        ids: [],
        go_back:()=>{
            if(h.idx<=0) return;
            let id = h.ids[--h.idx];
            change_map(id, false);
            update_disabled_forward_back();
        },
        go_forward:()=>{
            if(h.idx>=h.ids.length-1) return;
            let id = h.ids[++h.idx];
            change_map(id, false);
            update_disabled_forward_back();
        },
        can_go_back:()=>{
            return h.idx > 0;
        },
        can_go_forward:()=>{
            return h.idx < h.ids.length-1;
        },
        add:(id:number)=>{
            if(h.idx >=0 && h.ids[h.idx] == id)
                return;
            if(h.idx == h.ids.length - 1){
                // Infinitely grows, but in practice it won't, and they're just
                // numbers anyway.
                h.ids.push(id);
                h.idx++;
                update_disabled_forward_back();
                return;
            }
            h.ids[++h.idx] = id;
            h.ids.splice(h.idx+1);
            update_disabled_forward_back();
        },
        clear:()=>{
            h.ids.splice(0);
            h.idx = -1;
            update_disabled_forward_back();
        },
    };
    return h;
}());

function change_map(map_id:number, from_select:boolean){
    for(let i = 0; i < dungeon_map_views.length; ++i){
        const mv = dungeon_map_views[i];
        if(mv.map.map_id == map_id){
            change_active_map_view(i, from_select, true);
            break;
        }
    }
    request_render();
}
function sort_canv_objs(map:DungeonMap){
    if(map.is_sorted)
        return;
    map.canvas_obj_array.sort(function(first:CanvasObject, second:CanvasObject){
        let a = SORTORDER[first.type] + (first.submap? 50 : 0);
        let b = SORTORDER[second.type] + (second.submap? 50 : 0);
        return a - b;
    });
    map.is_sorted = true;
}
ONRECV(ToClient.CANVAS_CREATE_MAP, function(map_id:number){
    if(MAPS.has(map_id))
        return;
    dungeon_map_views.push(new_map_view(map_id));
    change_active_map_view(dungeon_map_views.length-1, false, true);
});
function rename_map(map:DungeonMap, name:string){
    map.map_name = name;
    const opt = MapOptionElements.get(map.map_id)!;
    opt.innerText = name;
}
ONRECV(ToClient.CANVAS_NAME_MAP, function(data:NameMapMessage){
    const map = get_map(data.map_id);
    rename_map(map, data.map_name);
});
ONRECV(ToClient.CANVAS_GRID_TYPE, function(data:CanvasGridTypeMsg){
    const map = get_map(data.map_id);
    map.grid_type = data.grid_type;
    request_render();
});
// FIXME: misnumbered
ONRECV(ToClient.CANVAS_GRID_NUMBERED, function(data:CanvasGridNumberedMsg){
    const map = get_map(data.map_id);
    // FIXME: can twiddle the bits in fewer ops
    if(data.numbered & MapFlags.NUMBERED)
        map.flags |= MapFlags.NUMBERED
    else
        map.flags &= ~(MapFlags.NUMBERED);
    if(data.numbered & MapFlags.BIG_HEX)
        map.flags |= MapFlags.BIG_HEX
    else
        map.flags &= ~(MapFlags.BIG_HEX);
    request_render();
});
ONRECV(ToClient.CANVAS_GRID_COLOR, function(data:CanvasColorMsg){
    const map = get_map(data.map_id);
    map.grid_color = data.color;
    request_render();
});

ONRECV(ToClient.CANVAS_BG_COLOR, function(data:CanvasColorMsg){
    const map = get_map(data.map_id);
    map.bg_color = data.color;
    request_render();
});

//
// THIS NEEDS TO ALWAYS BE POWER OF 2.
// Also if it changes, lots of things will probably break.
const enum REFERENCE {WIDTH = 64, HALF_WIDTH=WIDTH/2, QUARTER_WIDTH=WIDTH/4}; // the size of a square at scale = 1.
// The main canvas and its context. These are set once the content loads.
let TheCanvas:HTMLCanvasElement;
let TheCtx:CanvasRenderingContext2D;
ONRECV(ToClient.CANVAS_GATHER, function(where:GatherMessage): void{
    change_map(where.map_id, false);
    map_hist.add(where.map_id);
    const view = get_active_view();
    view.camera_x = where.x;
    view.camera_y = where.y;
    request_render();
});
ONRECV(ToClient.CANVAS_BATTLE, function(where:GatherMessage): void{
    change_map(where.map_id, false);
    map_hist.add(where.map_id);
    const view = get_active_view();
    view.camera_x = where.x;
    view.camera_y = where.y;
    visually_set_gridscale(GRIDSCALE.FIVE);
    request_render();
});
ONRECV(ToClient.CANVAS_DUNGEON_MODE, function():void{
    visually_set_gridscale(GRIDSCALE.TEN);
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
    const center_x = TheCanvas.width/2/view.scale - view.camera_x;
    const center_y = TheCanvas.height/2/view.scale - view.camera_y;
    view.scale = 1;
    view.camera_x = TheCanvas.width/2/view.scale - center_x;
    view.camera_y = TheCanvas.height/2/view.scale - center_y;
    request_render();
}
function zoom_in(view:DungeonMapView):void{
    const center_x = TheCanvas.width/2/view.scale - view.camera_x;
    const center_y = TheCanvas.height/2/view.scale - view.camera_y;
    view.scale *= 1.50;
    view.scale = clamp_scale(view.scale);
    view.camera_x = TheCanvas.width/2/view.scale - center_x;
    view.camera_y = TheCanvas.height/2/view.scale - center_y;
    request_render();
}
function zoom_out(view:DungeonMapView):void{
    const center_x = TheCanvas.width/2/view.scale - view.camera_x;
    const center_y = TheCanvas.height/2/view.scale - view.camera_y;
    view.scale /= 1.50;
    view.scale = clamp_scale(view.scale);
    view.camera_x = TheCanvas.width/2/view.scale - center_x;
    view.camera_y = TheCanvas.height/2/view.scale - center_y;
    request_render();
}

//
function resize_canvas():void{
    TheCanvas = by_id('map');
    TheCtx = TheCanvas.getContext('2d', {alpha:false})!;
    const chat = by_id('chat');
    const ww = window.innerWidth;
    const wh = window.innerHeight;
    let width;
    let height;
    if(SETTINGS.hidechat){
        width = ww;
        height = wh;
    }
    else {
        width = chat.offsetLeft?chat.offsetLeft:ww;
        height = chat.offsetTop?chat.offsetTop:wh;
    }
    width |= 0;
    height |= 0;
    TheCanvas.width = width;
    TheCanvas.height = height ;
    TheCanvas.style.width = width + 'px';
    TheCanvas.style.height = height + 'px';
    request_render();
}

//
// freehand-line stuff.
function make_freehand_line(id:number, base_x:number, base_y:number, submap:number, color:string, thickness:number):FreehandLine{
    // base_x = Math.round(base_x);
    // base_y = Math.round(base_y);
    // nearest tenth seems good enough to get smooth lines
    base_x = Math.round(base_x*10)/10;
    base_y = Math.round(base_y*10)/10;
    const obj: FreehandLine =  {
        type: CanvasType.FREEHAND_LINE,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap: submap,
        points: [],
        color: color,
        path: undefined,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
        thickness: thickness,
        last_bx:undefined,
        last_by:undefined,
    };
    return obj;
}
function make_shape(id:number, base_x:number, base_y:number, submap:number, color:string, color2:string, thickness:number):Shape {
    // nearest tenth seems good enough to get smooth lines
    base_x = Math.round(base_x*10)/10;
    base_y = Math.round(base_y*10)/10;
    const obj: Shape =  {
        type: CanvasType.SHAPE,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap: submap,
        points: [],
        color: color,
        color2: color2,
        path: undefined,
        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
        thickness: thickness,
        last_bx:undefined,
        last_by:undefined,
    };
    return obj;
}
function add_freehand_line(map:DungeonMap, id:number, base_x:number, base_y:number, submap:number, color:string, thickness:number):void{
    const obj = make_freehand_line(id, base_x, base_y, submap, color, thickness);
    add_canv_obj(map, obj);
}
function add_freehand_point(obj:FreehandLine|Shape, x:number, y:number):void{
    x -= obj.base_x;
    y -= obj.base_y;
    // x = Math.round(x);
    // y = Math.round(y);
    // nearest tenth seems good enough to get smooth lines
    x = Math.round(x*10)/10;
    y = Math.round(y*10)/10;
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
    obj.path = undefined;
}
function freehand_recalculate_bbox(obj:FreehandLine|Shape):void{
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
function freehand_recalculate_path(obj:FreehandLine, base_x:number, base_y:number):void{
    const points = obj.points;
    let x0 = base_x;
    let y0 = base_y;
    const length = points.length;
    const path = new Path2D();
    path.moveTo(x0, y0);
    if(length == 2 || obj.flags & CanvasFlag.LINE_IS_ARROW){
        const x1 = points[0] + base_x
        const y1 = points[1] + base_y;
        path.lineTo(x1, y1);
        if(obj.flags & CanvasFlag.LINE_IS_ARROW){
            const theta = Math.atan2(points[0], points[1]);
            const theta_left = -theta - Math.PI/4;
            const theta_right = -theta - 3*Math.PI/4;
            path.lineTo(x1+Math.cos(theta_left)*obj.thickness*8, y1+Math.sin(theta_left)*obj.thickness*8);
            path.moveTo(x1, y1);
            path.lineTo(x1+Math.cos(theta_right)*obj.thickness*8, y1+Math.sin(theta_right)*obj.thickness*8);
        }
    }
    else {
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
    }
    obj.path = path;
}
function shape_recalculate_path(obj:Shape, base_x:number, base_y:number):void{
    const points = obj.points;
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
    x -= x & (REFERENCE.WIDTH-1);
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
    const remainder = x & (REFERENCE.WIDTH-1);
    if(remainder < (REFERENCE.WIDTH>>1)){
        x -= remainder;
    }
    else{
        x += REFERENCE.WIDTH - remainder;
    }
    return x;
}
function snap_to_half_grid(x:number):number{
    const SNAP = REFERENCE.WIDTH/2;
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

function snap_to_quarter_grid(x:number):number{
    const SNAP = REFERENCE.WIDTH/4;
    x = Math.round(x);
    const remainder = x & (SNAP-1);
    if(remainder < (SNAP>>1)){
        x -= remainder;
    }
    else {
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
        case SNAPMODE.QUARTER:
            return snap_to_quarter_grid;
    }
}

// Rounds both dimensions to the grid.
function snap_to_grid2(x:number, y:number):[number, number]{
    return [snap_to_grid(x), snap_to_grid(y)];
}
function snap_to_half_grid2(x:number, y:number):[number, number]{
    return [snap_to_half_grid(x), snap_to_half_grid(y)];
}
function snap_to_quarter_grid2(x:number, y:number):[number, number]{
    return [snap_to_quarter_grid(x), snap_to_quarter_grid(y)];
}
function snap_identity2(x:number, y:number):[number, number]{
    return [x, y];
}

function snap_to_hex_corner2(x:number, y:number): [number, number]{
    let [cx, cy] = snap_to_hex_center(x, y);
    let points: Array<[number, number]> = [
        [cx,                        cy                     ],
        [cx-REFERENCE.HALF_WIDTH+9, cy-REFERENCE.HALF_WIDTH],
        [cx+REFERENCE.HALF_WIDTH-9, cy-REFERENCE.HALF_WIDTH],
        [cx-REFERENCE.HALF_WIDTH-9, cy                     ],
        [cx+REFERENCE.HALF_WIDTH+9, cy                     ],
        [cx-REFERENCE.HALF_WIDTH+9, cy+REFERENCE.HALF_WIDTH],
        [cx+REFERENCE.HALF_WIDTH-9, cy+REFERENCE.HALF_WIDTH],
    ];
    let bestd = 9999;
    let bestp = points[0];
    for(let p of points){
        let d = Math.sqrt((p[0]-x)**2 + (p[1]-y)**2);
        if(d < bestd){
            bestd = d;
            bestp = p;
        }
    }
    return bestp;
}

function get_snap_corner_func(gt:GridType):(x:number, y:number)=>[number, number]{
    if(gt & GridType.HEX) {
        if(snapmode == SNAPMODE.FREE) return snap_identity2;
        return snap_to_hex_corner2;
    }

    switch(snapmode){
        case SNAPMODE.GRID:
            return snap_to_grid2;
        case SNAPMODE.HALF:
            return snap_to_half_grid2;
        case SNAPMODE.FREE:
            return snap_identity2;
        case SNAPMODE.QUARTER:
            return snap_to_quarter_grid2;
    }
}
function snap_to_grid_center(x:number):number{
    x = Math.round(x);
    x = x - (x & (REFERENCE.WIDTH-1)) + REFERENCE.WIDTH/2;
    return x;
}
function snap_to_half_grid_center(x:number):number{
    x = Math.round(x);
    x = x - (x & (REFERENCE.WIDTH/2-1)) + REFERENCE.WIDTH/4;
    return x;
}
function snap_to_quarter_grid_center(x:number):number{
    x = Math.round(x);
    x = x - (x & (REFERENCE.WIDTH/4-1)) + REFERENCE.WIDTH/8;
    return x;
}

function get_snap_center_func():(_:number)=>number{
    switch(snapmode){
        case SNAPMODE.GRID:
            return snap_to_grid_center;
        case SNAPMODE.HALF:
            return snap_to_half_grid_center;
        case SNAPMODE.QUARTER:
            return snap_to_quarter_grid_center;
        case SNAPMODE.FREE:
            return snap_identity;
    }
}

function snap_to_grid_tl(x:number):number{
    x |= 0;
    return x - (x & (REFERENCE.WIDTH-1));
}
function snap_to_half_tl(x:number):number{
    x |= 0;
    return x - (x & (REFERENCE.WIDTH/2-1));
}
function snap_to_quarter_tl(x:number):number{
    x |= 0;
    return x - (x & (REFERENCE.WIDTH/4-1));
}

function get_snap_tl_func():(_:number)=>number{
    switch(snapmode){
        case SNAPMODE.GRID:
            return snap_to_grid_tl;
        case SNAPMODE.HALF:
            return snap_to_half_tl;
        case SNAPMODE.QUARTER:
            return snap_to_quarter_tl;
        case SNAPMODE.FREE:
            return snap_identity;
    }
}

function point_to_hex_coord(x0:number, y0:number):[number, number]{
        let hex_x0 = Math.floor(x0/REFERENCE.WIDTH);
        let hex_y0;
        if(hex_x0 & 1)
            hex_y0 = Math.floor((y0-32)/REFERENCE.WIDTH);
        else
            hex_y0 = Math.floor(y0/REFERENCE.WIDTH);
        return [hex_x0|0, hex_y0|0];
}
function snap_to_hex_center(x0:number, y0:number):[number, number]{
    const [hx, hy] = point_to_hex_coord(x0, y0);
    if(hx & 1){
        return [hx*REFERENCE.WIDTH+REFERENCE.WIDTH/2, (hy+0.5)*REFERENCE.WIDTH+REFERENCE.WIDTH/2];
    }
    else {
        return [hx*REFERENCE.WIDTH+REFERENCE.WIDTH/2, hy*REFERENCE.WIDTH+REFERENCE.WIDTH/2];
    }
}
// unused apparently?
// @ts-ignore
function cube_to_oddq(x:number, y:number, z:number):[number, number]{
    let col = x;
    let row = (z + (x-(x&1)) >> 1);
    return [col|0, row|0];
}

function oddq_to_cube(col:number, row:number):[number, number, number]{
    let cu_x = col;
    let cu_z = row - ((col - (col&1)) >> 1);
    let cu_y = -cu_x -cu_z;
    const result:[number, number, number] = [cu_x|0, cu_y|0, cu_z|0];
    return result;
}
function cube_distance(a:[number, number, number], b:[number, number, number]):number{
    const x = Math.abs(a[0]-b[0]);
    const y = Math.abs(a[1]-b[1]);
    const z = Math.abs(a[2]-b[2]);
    const d = Math.max(x, y, z);
    return d;
}

function calc_measure_length(map:DungeonMap, x0:number, y0:number, x1:number, y1:number):string{
    if(map.grid_type & GridType.HEX){
        let [hex_x0, hex_y0] = point_to_hex_coord(x0, y0);
        let [hex_x1, hex_y1] = point_to_hex_coord(x1, y1);
        const dist = cube_distance(oddq_to_cube(hex_x0, hex_y0), oddq_to_cube(hex_x1, hex_y1));
        if(dist == 1)
            return "1 hex";
        return dist + " hexes";
    }
    else{
        const h2 = (x0-x1)**2 + (y0-y1)**2;
        const h = Math.sqrt(h2);
        const length = h * 10 / REFERENCE.WIDTH;
        return length.toFixed(0) + "'";
    }
}
function calc_square_length(map:DungeonMap, x0:number, y0:number, x1:number, y1:number):string{
    const h2 = (x0-x1)**2 + (y0-y1)**2;
    const h = Math.sqrt(h2);
    const length = h * 10 / REFERENCE.WIDTH;
    return length.toFixed(0) + "'";
}

function add_gridline_point(obj:GridLine, x:number, y:number):void{
    const points = obj.points;
    x -= obj.base_x;
    y -= obj.base_y;
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
    obj.path = undefined;
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
function gridline_recalculate_path(obj:GridLine, base_x:number, base_y:number):void{
    // this is the same as freehand??
    const points = obj.points;
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
function make_gridrect(id:number, base_x:number, base_y:number, submap:number, color:string):GridRectangle{
    const obj:GridRectangle =  {
        type: CanvasType.GRID_RECT,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        color: color,
        width: 0,
        height: 0,
    };
    return obj;
}
function add_gridrect(map:DungeonMap, id:number, base_x:number, base_y:number, submap:number, color:string){
    const obj = make_gridrect(id, base_x, base_y, submap, color);
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
}
function change_gridrect_by_id(map:DungeonMap, id:number, x0:number, y0:number, x1:number, y1:number):void{
    let obj = map.canvas_objs.get(id) as GridRectangle;
    change_gridrect(obj, x0, y0, x1, y1);
}
function make_door(id:number, x:number, y:number, doortype:DoorType, submap:number, color:string, width:number, orientation:Orientation):DoorObj{
    const obj: DoorObj = {
        type: CanvasType.DOOR,
        id: id,
        base_x: x,
        base_y: y,
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        doortype: doortype,
        color: color,
        width: width,
        orientation: orientation,
    };
    return obj;
}
function add_door(map:DungeonMap, id:number, base_x:number, base_y:number, doortype:DoorType, submap:number, color:string, width:number, orientation:Orientation):void{
    const obj = make_door(id, base_x, base_y, doortype, submap, color, width, orientation);
    add_canv_obj(map, obj);
}
function make_rect(id:number, base_x:number, base_y:number, submap:number, color:string):Rectangle{
    const obj: Rectangle =  {
        type: CanvasType.RECT,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        color: color,
        width: 0,
        height: 0,
    };
    return obj;
}
function add_rect(map:DungeonMap, id:number, base_x:number, base_y:number, submap:number, color:string):void{
    const obj = make_rect(id, base_x, base_y, submap, color);
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
function make_filled_rect(id:number, base_x:number, base_y:number, submap:number, color:string, color2:string):FilledRectangle{
    const obj: FilledRectangle =  {
        type: CanvasType.FILLED_RECT,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        color: color,
        color2: color2,
        width: 0,
        height: 0,
    };
    return obj;
}
function add_filled_rect(map:DungeonMap, id:number, base_x:number, base_y:number, submap:number, color:string, color2:string){
    const obj = make_filled_rect(id, base_x, base_y, submap, color, color2);
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
function make_ellipse(id:number, base_x:number, base_y:number, submap:number, color:string, color2:string, variant:ELLIPSETYPE):Ellipse{
    const obj:Ellipse = {
        type: CanvasType.ELLIPSE,
        id:id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        color: color,
        color2: color2,
        width: 0,
        height: 0,
        variant: variant,
    };
    return obj;
}
function add_ellipse(map:DungeonMap, id:number, base_x:number, base_y:number, submap:number, color:string, color2:string, variant:ELLIPSETYPE){
    const obj = make_ellipse(id, base_x, base_y, submap, color, color2, variant);
    add_canv_obj(map, obj);
}
function make_text(id:number, base_x:number, base_y:number, submap:number, text:string, size:number, alignment: TextAlignment, map_id:number):TextObj{
    let snap = get_snap_center_func();
    base_x = snap(base_x);
    base_y = snap(base_y);
    const obj: TextObj =  {
        type: CanvasType.TEXT,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        text: text,
        size: size,
        bbox: {x0:0, y0:0, x1:0, y1:0},
        bboxes: [],
        lines: text.split('\n'),
        alignment: alignment,
        map_id: map_id,
    };
    return obj;
}
function add_text(map:DungeonMap, id:number, base_x:number, base_y:number, submap:number, text:string, size:number, alignment:TextAlignment, map_id:number):void{
    const obj = make_text(id, base_x, base_y, submap, text, size, alignment, map_id);
    add_canv_obj(map, obj);
}
function make_ez_token(id:number, base_x:number, base_y:number, submap:number, text:string, color:string, width:number, height:number):EzToken{
    const obj: EzToken = {
        type: CanvasType.EZ_TOKEN,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        text: text,
        color:color,
        width: width,
        height: height,
        statusflags: 0,
    };
    return obj;
}
function add_ez_token(map:DungeonMap, id:number, base_x:number, base_y:number, submap:number, text:string, color:string, width:number, height:number):void{
    const obj = make_ez_token(id, base_x, base_y, submap, text, color, width, height);
    add_canv_obj(map, obj);
}
function make_img_token(id:number, base_x:number, base_y:number, submap:number, url:string, width:number, height: number):ImgToken{
    const obj:ImgToken = {
        type: CanvasType.IMG_TOKEN,
        id: id,
        base_x: Math.round(base_x),
        base_y: Math.round(base_y),
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        url: url,
        img: undefined,
        width: width,
        height: height,
        statusflags: 0,
    };
    delay_load_obj_image(obj, REFERENCE.WIDTH, REFERENCE.WIDTH, 1, 1);
    return obj;
}
function add_img_token(map:DungeonMap, id:number, base_x:number, base_y:number, submap:number, url:string, width:number, height:number):void{
    const obj = make_img_token(id, base_x, base_y, submap, url, width, height);
    add_canv_obj(map, obj);
}

function delay_load_obj_image(obj:ImageObj|ImgToken, width:number, height:number, error_width:number, error_height:number){
    if(TOKEN_BY_PATH.has(obj.url)){
        const tok = TOKEN_BY_PATH.get(obj.url)!;
        const img = token_to_img(tok[2], tok[3], tok[4], tok[5], width, height);
        obj.img = img;
        request_render();
        return;
    }
    const img = width && height? new Image(width, height): new Image();
    img.crossOrigin = 'anonymous';
    img.addEventListener('load', function(){
        obj.img = img;
        if(!width || !height){
            obj.width = img.width;
            obj.height = img.height;
        }
        request_render();
    }, {once:true});
    img.addEventListener('error', function(){
        obj.width = error_width;
        obj.height = error_height;
        if(!error_width || !error_height){
            obj.width = REFERENCE.WIDTH;
            obj.height = REFERENCE.WIDTH;
        }
        request_render();
    }, {once:true});
    img.src = obj.url;
}
function make_image(id:number, base_x:number, base_y:number, width:number, height:number, submap:number, url:string):ImageObj{
    base_x = Math.round(base_x);
    base_y = Math.round(base_y);
    base_x = base_x - (base_x & (REFERENCE.WIDTH-1)) + 1;
    base_y = base_y - (base_y & (REFERENCE.WIDTH-1)) + 1;
    const obj:ImageObj =  {
        type: CanvasType.IMAGE,
        id: id,
        base_x: base_x,
        base_y: base_y,
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        width: width,
        height: height,
        url: url,
        img: undefined,
    };
    delay_load_obj_image(obj, width, height, width, height);
    return obj;
}
function add_image(map:DungeonMap, id:number, base_x:number, base_y:number, width:number, height:number, submap:number, url:string):void{
    const obj = make_image(id, base_x, base_y, width, height, submap, url);
    add_canv_obj(map, obj);
}
function change_stairs(obj:Stairs, x0:number, y0:number, x1:number, y1:number, snap:(_:number)=>number){
    const xdiff = x1-x0;
    const ydiff = y1-y0;
    // x0 = snap(x0);
    // y0 = snap(y0);
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
    obj.width = (x1 - x0)/REFERENCE.WIDTH;
    obj.height = (y1 - y0)/REFERENCE.WIDTH;
    let angle = Math.atan2(xdiff, ydiff);
    angle /= Math.PI;
    if(angle < -0.75)
        obj.rotation = Rotation.DOWN;
    else if(angle < -0.25)
        obj.rotation = Rotation.LEFT;
    else if(angle < 0.25)
        obj.rotation = Rotation.UP;
    else if(angle < 0.75)
        obj.rotation = Rotation.RIGHT;
    else
        obj.rotation = Rotation.DOWN;
}
function make_measure(id:number, x:number, y:number, submap:number, color:string):MeasureObj{
    const obj:MeasureObj = {
        type: CanvasType.MEASURE,
        id: id,
        base_x:x,
        base_y:y,
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        color:color,
        x1:x,
        y1:y,
    };
    return obj;
}
function make_fixture(id:number, x:number, y:number, submap:number,ftype:FixtureType):FixtureObj{
    const obj:FixtureObj = {
        type: CanvasType.FIXTURE,
        id: id,
        base_x:x,
        base_y:y,
        flags: CanvasFlag.NONE,
        hidinguser: hiddenid(),
        submap:submap,
        width:0,
        height:0,
        ftype:ftype,
    };
    return obj;
}

document.addEventListener('DOMContentLoaded', function(){resize_canvas();resize_canvas();
document.body.addEventListener('load', resize_canvas);
});
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

const enum UNDO_EVENT_TYPE {
    CREATE = 0,
    DELETE = 1,
    UPDATE = 2,
    MASS_CREATE = 3,
    COMBO = 4, // more than one of the above, simultaneously
}
type UndoCreate = {
    type: UNDO_EVENT_TYPE.CREATE;
    id: number;
}
type UndoMassCreate = {
    type: UNDO_EVENT_TYPE.MASS_CREATE;
    ids: Array<number>;
}
type UndoDelete = {
    type: UNDO_EVENT_TYPE.DELETE;
    ids: Array<number>;
}
type UndoUpdate = {
    type: UNDO_EVENT_TYPE.UPDATE;
    before: Array<StrippedObj>;
    after: Array<StrippedObj>;
}
type UndoCombo = {
    type: UNDO_EVENT_TYPE.COMBO;
    events: Array<UndoCreate | UndoMassCreate | UndoDelete | UndoUpdate>;
};
type UndoEvent = UndoCreate | UndoMassCreate | UndoDelete | UndoUpdate | UndoCombo;

function push_undo_event(map:DungeonMap, undo_event:UndoEvent):void{
    map.undo_stack.length = map.undo_position;
    map.undo_stack.push(undo_event);
    const enum UNDO_STACK {MAX= 10000, MAX_HALF=MAX/2};
    if(map.undo_stack.length > UNDO_STACK.MAX)
        map.undo_stack = Array.from(map.undo_stack.slice(UNDO_STACK.MAX_HALF));
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
function node_deletes_and_creates_for_undo(map:DungeonMap, deleted:Array<number>, created_ids:Array<number>){
    const creat: UndoMassCreate = {
        type: UNDO_EVENT_TYPE.MASS_CREATE,
        ids: created_ids,
    };
    const delet:UndoDelete = {
        type: UNDO_EVENT_TYPE.DELETE,
        ids: deleted,
    };
    const combo: UndoCombo = {
        type: UNDO_EVENT_TYPE.COMBO,
        events:[delet, creat],
    };
    // console.log('combo', combo);
    push_undo_event(map, combo);
}

function do_one_undo_event(map:DungeonMap, undo_event:UndoEvent){
    switch(undo_event.type){
        case UNDO_EVENT_TYPE.CREATE:{
            const obj = map.canvas_objs.get(undo_event.id)!;
            obj.flags |= CanvasFlag.DELETED;
            publish_delete_by_ids(map.map_id, [obj.id]);
        }break;
        case UNDO_EVENT_TYPE.DELETE:{
            const ids = undo_event.ids;
            const length = ids.length;
            const stripped = get_stripped_state_by_id(map, ids);
            for(let i = 0; i < length; i++){
                const obj = map.canvas_objs.get(ids[i])!;
                obj.flags &= ~CanvasFlag.DELETED;
                stripped[i][INDEX.FLAGS] &= ~CanvasFlag.DELETED;
            }
            // maybe there should be an undelete?
            publish_obj_updates(map.map_id, stripped);
        }break;
        case UNDO_EVENT_TYPE.MASS_CREATE:{
            const ids = undo_event.ids;
            const length = ids.length;
            for(let i = 0; i < length; i++){
                const obj = map.canvas_objs.get(ids[i])!;
                obj.flags |= CanvasFlag.DELETED;
            }
            publish_delete_by_ids(map.map_id, ids);
        }break;
        case UNDO_EVENT_TYPE.UPDATE:{
            set_obj_states_from_stripped_objs(map, undo_event.before);
            publish_obj_updates(map.map_id, undo_event.before);
        }break;
        case UNDO_EVENT_TYPE.COMBO:{
            for(let i = undo_event.events.length; --i >= 0; )
                do_one_undo_event(map, undo_event.events[i]);
        }break;
    }
}
function do_one_undo(map:DungeonMap):void{
    if(!map.undo_position)
        return;
    map.undo_position--;
    const undo_event = map.undo_stack[map.undo_position];
    do_one_undo_event(map, undo_event);
    request_render();
}
function do_one_redo_event(map:DungeonMap, undo_event:UndoEvent){
    switch(undo_event.type){
        case UNDO_EVENT_TYPE.CREATE:{
            const obj = map.canvas_objs.get(undo_event.id)!;
            obj.flags &= ~CanvasFlag.DELETED;
            const stripped = get_stripped_state_by_id(map, [undo_event.id]);
            publish_obj_updates(map.map_id, stripped);
        }break;
        case UNDO_EVENT_TYPE.DELETE:{
            const ids = undo_event.ids;
            const length = ids.length;
            for(let i = 0; i < length; i++){
                const obj = map.canvas_objs.get(ids[i])!;
                obj.flags |= CanvasFlag.DELETED;
            }
            publish_delete_by_ids(map.map_id, undo_event.ids);
        }break;
        case UNDO_EVENT_TYPE.MASS_CREATE:{
            const ids = undo_event.ids;
            const length = ids.length;
            for(let i = 0; i < length; i++){
                const obj = map.canvas_objs.get(ids[i])!;
                obj.flags &= ~ CanvasFlag.DELETED;
            }
            const stripped = get_stripped_state_by_id(map, undo_event.ids);
            publish_obj_updates(map.map_id, stripped);
        }break;
        case UNDO_EVENT_TYPE.UPDATE:{
            set_obj_states_from_stripped_objs(map, undo_event.after);
            publish_obj_updates(map.map_id, undo_event.after);
        }break;
        case UNDO_EVENT_TYPE.COMBO:{
            for(let ue of undo_event.events)
                do_one_redo_event(map, ue);
        }break;
    }
}
function do_one_redo(map:DungeonMap):void{
    if(map.undo_position == map.undo_stack.length)
        return;
    const undo_event = map.undo_stack[map.undo_position];
    do_one_redo_event(map, undo_event);
    map.undo_position++;
    request_render();
}
function undo_is_impossible(map:DungeonMap):boolean{
    return !map.undo_position;
}
function redo_is_impossible(map:DungeonMap):boolean{
    return map.undo_position == map.undo_stack.length;
}
// Combines the session id with the local id to create a
// unique id for an object
// If you get more up to more than 1,048,576 objects in a single session we'll be in trouble.
// That's actually kind of a FIXME...
let localid = 0;
function get_new_id(): number{
    ++localid;
    let id = (session_id << 20) | localid;
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
        if(obj.flags & CanvasFlag.DELETED)
            continue;
        const stripped = strip_obj(obj);
        copied_objs.push(stripped);
    }
}

function copy_selected_objs_to_clipboard(view:DungeonMapView):void{
    let objs = [];
    for(let obj_id of view.selected){
        const obj = view.map.canvas_objs.get(obj_id)!;
        if(obj.flags & CanvasFlag.DELETED)
            continue;
        const stripped = strip_obj(obj);
        objs.push(stripped);
    }
    let text = JSON.stringify(objs);
    navigator.clipboard.writeText(text);
}
function paste_from_clipboard_at(map:DungeonMap, x:number, y:number, submapid:number):void{
    x = snap_to_grid(x);
    y = snap_to_grid(y);
    function doit(objs:unknown){
        if(!Array.isArray(objs)) return;
        const length = objs.length;
        if(!length) return;
        const valid_objs = [];
        for(let i = 0; i < length; ++i){
            const o = v_StrippedObj(objs[i]);
            // if(!o) console.log({o:objs[i]})
            if(!o) return;
            valid_objs.push(o);
        }
        // Do a pre-pass to get the top left corner of the objects.
        let x0 = valid_objs[0][INDEX.BASE_X];
        let y0 = valid_objs[0][INDEX.BASE_Y];
        for(let i = 0; i < length; ++i){
            const stripped = valid_objs[i];
            if(stripped[INDEX.BASE_X] < x0)
                x0 = stripped[INDEX.BASE_X];
            if(stripped[INDEX.BASE_Y] < y0)
                y0 = stripped[INDEX.BASE_Y];
        }
        // TODO: might be more intuitive to paste the center of the objects.
        const dx = x - x0;
        const dy = y - y0;
        const new_ids = [];
        for(let i = 0; i < valid_objs.length; i++){
            let obj = unstrip_obj(valid_objs[i]);
            obj.submap = submapid;
            if(submapid && obj.type == CanvasType.SUBMAP)
                continue;
            let id = get_new_id();
            obj.id = id;
            translate_object(obj, dx, dy);
            add_canv_obj(map, obj);
            new_ids.push(obj.id);
            publish_obj_by_id(map, obj.id);
        }
        note_mass_create_for_undo(map, new_ids);
        request_render();
    }
    if(navigator.clipboard.readText){
        navigator.clipboard.readText().then(
            ct => {
                let objs;
                try{ objs = JSON.parse(ct); }catch(e){ return; }
                doit(objs);
            }
        )
        .catch((error)=>{
            let dialog = get_dialog('clipboard');
            dialog.f.json.value = '';
            dialog.ok_handler = function(){
                let text = dialog.f.json.value;
                if(!text) return;
                let objs;
                try{ objs = JSON.parse(text); }catch(e){ return; }
                doit(objs);
            };
            dialog.show();
        });
    }
    else {
        let dialog = get_dialog('clipboard');
        dialog.f.json.value = '';
        dialog.ok_handler = function(){
            let text = dialog.f.json.value;
            if(!text) return;
            let objs;
            try{ objs = JSON.parse(text); }catch(e){ return; }
            doit(objs);
        };
        dialog.show();
    }
}

function cut_selected_objs_to_copy_buffer(view:DungeonMapView):void{
    let deleted = [];
    for(let obj_id of view.selected){
        const obj = view.map.canvas_objs.get(obj_id)!;
        if(obj.flags & CanvasFlag.DELETED)
            continue;
        const stripped = strip_obj(obj);
        copied_objs.push(stripped);
        obj.flags |= CanvasFlag.DELETED;
        deleted.push(obj.id);
        // #SPEED: faster way to get all objects in this submap
        if(obj.type == CanvasType.SUBMAP){
            for(let o of view.map.canvas_obj_array){
                if(o.flags & CanvasFlag.DELETED) continue;
                if(o.submap == obj.id){
                    copied_objs.push(strip_obj(o));
                    o.flags |= CanvasFlag.DELETED;
                    deleted.push(o.id);
                }
            }
        }
    }
    publish_delete_by_ids(view.map.map_id, deleted);
    note_delete_by_ids_for_undo(view.map, deleted);
    view.selected.clear()
    request_render();
}
function translate_object(obj: CanvasObject, dx: number, dy: number){
    obj.base_x += dx;
    obj.base_y += dy;
    switch(obj.type){
        case CanvasType.FREEHAND_LINE:{
            freehand_recalculate_bbox(obj);
            obj.path = undefined;
        }break;
        case CanvasType.GRID_LINE:{
            gridline_recalculate_bbox(obj);
            obj.path = undefined;
        }break;
        default:
            break;
    }
}

function rotate_pair(x:number, y:number):[number, number]{
    return [y, -x];
}
function rotate_base(obj: CanvasObject){
    let [x,y] = rotate_pair(obj.base_x, obj.base_y);
    obj.base_y = y;
    obj.base_x = x;
}

interface Rectangleish {
    base_x: number;
    base_y: number;
    width: number;
    height: number;
}
function rotate_rectangleish(obj:Rectangleish){
    let x1 = obj.base_x + obj.width;
    let y1 = obj.base_y + obj.height;
    [x1, y1] = rotate_pair(x1, y1);
    let [x0, y0] = rotate_pair(obj.base_x, obj.base_y);
    if (x0 > x1){
        const temp = x0;
        x0 = x1;
        x1 = temp;
    }
    if (y0 > y1){
        const temp = y0;
        y0 = y1;
        y1 = temp;
    }
    obj.base_x = x0;
    obj.base_y = y0;
    obj.width = x1 - x0;
    obj.height = y1 - y0;
}

// Normally I would do these in two steps, but to get exhaustiveness
// checking I need to return a value.
function rotate_and_then_strip_obj(obj: CanvasObject):StrippedObj{
    switch(obj.type){
        case CanvasType.SHAPE: // fall-through
        case CanvasType.FREEHAND_LINE:{
            rotate_base(obj);
            const length = obj.points.length;
            for(let i = 0; i < length; i+=2){
                let [x, y] = rotate_pair(obj.points[i], obj.points[i+1]);
                obj.points[i] = x;
                obj.points[i+1] = y;
            }
            freehand_recalculate_bbox(obj);
            obj.path = undefined;
            return strip_obj(obj);
        }
        case CanvasType.GRID_LINE:{
            rotate_base(obj);
            const length = obj.points.length;
            for(let i = 0; i < length; i+=2){
                let [x, y] = rotate_pair(obj.points[i], obj.points[i+1]);
                obj.points[i] = x;
                obj.points[i+1] = y;
            }
            gridline_recalculate_bbox(obj);
            obj.path = undefined;
            return strip_obj(obj);
        }
        case CanvasType.RECT:{
            rotate_rectangleish(obj);
            return strip_obj(obj);
        }
        case CanvasType.FILLED_RECT:{
            rotate_rectangleish(obj);
            return strip_obj(obj);
        }
        case CanvasType.GRID_RECT:{
            rotate_rectangleish(obj);
            return strip_obj(obj);
        }
        case CanvasType.ELLIPSE:{
            rotate_rectangleish(obj);
            return strip_obj(obj);
        }
        case CanvasType.IMAGE:{
            // This is kind of weird. Not sure how images are
            // supposed to behave when the world gets rotated.
            // rotate_base(obj);
            rotate_rectangleish(obj);
            let tmp = obj.width;
            obj.width = obj.height;
            obj.height = tmp;
            return strip_obj(obj);
        }
        case CanvasType.TEXT:{
            rotate_base(obj);
            obj.bbox = {x0:0, y0:0, x1:0, y1:0};
            obj.bboxes = [];
            return strip_obj(obj);
        }
        case CanvasType.EZ_TOKEN:{
            const r = {
                base_x: obj.base_x, base_y:obj.base_y,
                width:obj.width*REFERENCE.WIDTH, height:obj.height*REFERENCE.WIDTH,
            };
            rotate_rectangleish(r);
            obj.base_x = r.base_x;
            obj.base_y = r.base_y;
            const temp = obj.width;
            obj.width = obj.height;
            obj.height = temp;
            return strip_obj(obj);
        }
        case CanvasType.IMG_TOKEN:{
            const r = {
                base_x: obj.base_x, base_y:obj.base_y,
                width:obj.width*REFERENCE.WIDTH, height:obj.height*REFERENCE.WIDTH,
            };
            rotate_rectangleish(r);
            obj.base_x = r.base_x;
            obj.base_y = r.base_y;
            const temp = obj.width;
            obj.width = obj.height;
            obj.height = temp;
            return strip_obj(obj);
        }
        case CanvasType.DOOR:{
            rotate_base(obj);
            switch(obj.orientation){
                case Orientation.VERTICAL:
                    obj.orientation = Orientation.HORIZONTAL;
                    break;
                case Orientation.HORIZONTAL:
                    obj.orientation = Orientation.VERTICAL;
                    break;
                case Orientation.TOPLEFT_DOWNRIGHT:
                    obj.orientation = Orientation.TOPRIGHT_DOWNLEFT;
                    break;
                case Orientation.TOPRIGHT_DOWNLEFT:
                    obj.orientation = Orientation.TOPLEFT_DOWNRIGHT;
                    break;
            }
            return strip_obj(obj);
        }
        case CanvasType.STAIRS:{
            const r = {
                base_x: obj.base_x, base_y:obj.base_y,
                width:obj.width*REFERENCE.WIDTH, height:obj.height*REFERENCE.WIDTH,
            };
            rotate_rectangleish(r);
            obj.base_x = r.base_x;
            obj.base_y = r.base_y;
            const temp = obj.width;
            obj.width = obj.height;
            obj.height = temp;
            obj.rotation += 2;
            if(obj.rotation > 7){
                obj.rotation -= 8;
            }
            return strip_obj(obj);
        }
        case CanvasType.MEASURE:{
            // meh
            rotate_base(obj);
            return strip_obj(obj);
        }
        case CanvasType.FIXTURE:{
            rotate_rectangleish(obj);
            return strip_obj(obj);
        }
        // The tile rotations are kind of janky, as you can't rotate a hexagon
        // 90 degrees and expect anything reasonable to happen.
        // We'll do our best.
        case CanvasType.FILLED_TILE:{
            const r = {
                base_x: obj.base_x, base_y:obj.base_y,
                width:REFERENCE.WIDTH, height:REFERENCE.WIDTH,
            };
            rotate_rectangleish(r);
            obj.base_x = r.base_x;
            obj.base_y = r.base_y;
            return strip_obj(obj);
        }
        case CanvasType.TERRAIN_TILE:{
            const r = {
                base_x: obj.base_x, base_y:obj.base_y,
                width:REFERENCE.WIDTH, height:REFERENCE.WIDTH,
            };
            rotate_rectangleish(r);
            obj.base_x = r.base_x;
            obj.base_y = r.base_y;
            return strip_obj(obj);
        }
        case CanvasType.ICON_TILE:{
            const r = {
                base_x: obj.base_x, base_y:obj.base_y,
                width:REFERENCE.WIDTH, height:REFERENCE.WIDTH,
            };
            rotate_rectangleish(r);
            obj.base_x = r.base_x;
            obj.base_y = r.base_y;
            return strip_obj(obj);
        }
        case CanvasType.SUBMAP:{
            rotate_rectangleish(obj);
            return strip_obj(obj);
        }
        case CanvasType.ARC:{
            rotate_rectangleish(obj);
            obj.start_arc++;
            obj.end_arc++;
            return strip_obj(obj);
        }
    }
}
function rotate_everything_90(view:DungeonMapView){
    const before_rotate = [];
    const after_rotate = []
    for(let obj of view.map.canvas_obj_array){
        if(obj.flags & CanvasFlag.DELETED)
            continue;
        if(obj.type == CanvasType.MEASURE)
            continue;
        before_rotate.push(strip_obj(obj));
        const after = rotate_and_then_strip_obj(obj);
        after_rotate.push(after)
    }
    note_updates_for_undo(view.map, before_rotate, after_rotate);
    publish_obj_updates(view.map.map_id, after_rotate);
    request_render();
}

function paste_from_copy_buffer_at(map:DungeonMap, x:number, y:number, submapid:number):void{
    x = snap_to_grid(x);
    y = snap_to_grid(y);
    const length = copied_objs.length;
    // Do a pre-pass to get the top left corner of the objects.
    let x0 = 0;
    let y0 = 0;
    if(length){
        x0 = copied_objs[0][INDEX.BASE_X];
        y0 = copied_objs[0][INDEX.BASE_Y];
    }
    for(let i = 0; i < length; ++i){
        const stripped = copied_objs[i];
        if(stripped[INDEX.BASE_X] < x0)
            x0 = stripped[INDEX.BASE_X];
        if(stripped[INDEX.BASE_Y] < y0)
            y0 = stripped[INDEX.BASE_Y];
    }
    // TODO: might be more intuitive to paste the center of the objects.
    const dx = x - x0;
    const dy = y - y0;
    const new_ids = [];
    for(let i = 0; i < length; ++i){
        const obj = unstrip_obj(copied_objs[i]);
        obj.submap = submapid;
        if(submapid && obj.type == CanvasType.SUBMAP)
            continue;
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

ONRECV(ToClient.CANVAS_DELETE_MAP, function(map_id:number){
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
    const select = by_id('current-map-name');
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
            change_active_map_view(i, true, true);
            break;
        }
    }
}

// cutnpaste from below. TODO: factor these.

function initialize_maps(msgs:Array<InitializeMap>){
    // Clear
    {
        for(let m of MAPS.values())
            clear_canvas(m);
        MAPS.clear()
        dungeon_map_views = []
        active_map_view_index = 0;
        const select = by_id('current-map-name');
        while(select.options.length){
            select.remove(0);
        }
        MapOptionElements.clear();
    }

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
        map.grid_color = msg.grid_color;
        map.bg_color = msg.bg_color;
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
            if(obj.type == CanvasType.SUBMAP)
                map.submaps.push(obj)
        }
    }
    let old_idx = get_local(StorageCategory.CANVAS, 'active_map_view_index');
    if(old_idx !== undefined){
        if(old_idx < dungeon_map_views.length && old_idx >= 0)
            change_active_map_view(old_idx, false, false);
    }
    map_hist.clear();
    map_hist.add(get_active_view().map.map_id);
    resize_canvas();
    request_render();
}
ONRECV(ToClient.CANVAS_INITIALIZE_MAPS, initialize_maps);
ONRECV(ToClient.CANVAS_CREATE_OBJECTS, function(msgs:Array<CreateObjectsMessage>){
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
            if(obj.type == CanvasType.SUBMAP)
                map.submaps.push(obj);
        }
    }
    request_render();
});
ONRECV(ToClient.CANVAS_DELETE, function(msg:CanvasDeleteMessage){
    const map_id = msg.map_id;
    const map = get_map(map_id);
    const obj_ids = msg.ids;
    const length = obj_ids.length;
    for(let i = 0; i < length; i++){
        const id = obj_ids[i];
        const obj = map.canvas_objs.get(id);
        if(obj){
            obj.flags |= CanvasFlag.DELETED;
        }
        else {
            console.log('Deleting unknown object??', id);
        }
    }
    request_render();
});


ONRECV(ToClient.CANVAS_UPDATE, function(msg:CanvasUpdateMessage){
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
        const obj: CanvasObject = map.canvas_objs.get(state[INDEX.ID])!;
        if(!obj){
            console.log('Updating unknown object??', state[INDEX.ID]);
            continue;
        }
        set_obj_from_stripped(obj, state);
    }
}

// These are bit flags
// Select background things (walls, lines).
const enum SELECTTYPE {
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
// FIXME: this shouldn't be looking at selection type, hoist to the caller.
function obj_in_bbox(obj:Readonly<CanvasObject>, bbox:Readonly<Bbox>, selection_type:SELECTTYPE, is_hex:boolean):boolean{
    switch(obj.type){
        case CanvasType.SHAPE: // hack
        case CanvasType.FREEHAND_LINE:
        case CanvasType.GRID_LINE:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const th2 = obj.type==CanvasType.FREEHAND_LINE?obj.thickness/2:3;
            const bb = {
                x0: bbox.x0-th2,
                y0: bbox.y0-th2,
                x1: bbox.x1+th2,
                y1: bbox.y1+th2,
            };
            const outer_bbox: Bbox = {
                x0:obj.bbox.x0 + obj.base_x,
                y0:obj.bbox.y0 + obj.base_y,
                x1:obj.bbox.x1 + obj.base_x,
                y1:obj.bbox.y1 + obj.base_y,
            };
            if(!bbox_overlaps(outer_bbox, bb))
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
                if(line_overlaps_bbox(bb, x0, y0, x1, y1))
                    return true;
                x0 = x1;
                y0 = y1;
            }
            return false;
        }break;
        case CanvasType.SUBMAP: {
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const th2 = 3;
            const rect_bbox = {
                x0:obj.base_x-th2,
                y0:obj.base_y-th2,
                x1:obj.base_x+obj.width+th2,
                y1:obj.base_y+obj.height+th2,
            };
            if(!bbox_overlaps(rect_bbox, bbox))
                return false;
            // break into four pieces
            let left = {
                x0: obj.base_x-th2,
                y0: obj.base_y-th2,
                x1: obj.base_x+th2,
                y1: obj.base_y+obj.height+th2,
            };
            let top = {
                x0: obj.base_x-th2,
                y0: obj.base_y-th2,
                x1: obj.base_x+obj.width+th2,
                y1: obj.base_y+th2+64,
            };
            let right = {
                x0: obj.base_x+obj.width-th2,
                y0: obj.base_y+th2,
                x1: obj.base_x+obj.width+th2,
                y1: obj.base_y+obj.height+th2,
            };
            let bottom = {
                x0: obj.base_x-th2,
                y0: obj.base_y+obj.height-th2,
                x1: obj.base_x+obj.width+th2,
                y1: obj.base_y+obj.height+th2,
            };
            if(obj.flags & CanvasFlag.SUBMAP_IS_MINIMIZED){
                if(bbox_overlaps(top, bbox)) return true;
            }
            else {
                for(let b of [left, top, right, bottom]){
                    if(bbox_overlaps(b, bbox)) return true;
                }
            }
            return false;
        }break;
        case CanvasType.RECT:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const th2 = 3;
            const rect_bbox = {
                x0:obj.base_x-th2,
                y0:obj.base_y-th2,
                x1:obj.base_x+obj.width+th2,
                y1:obj.base_y+obj.height+th2,
            };
            if(!bbox_overlaps(rect_bbox, bbox))
                return false;
            // break into four pieces
            let left = {
                x0: obj.base_x-th2,
                y0: obj.base_y-th2,
                x1: obj.base_x+th2,
                y1: obj.base_y+obj.height+th2,
            };
            let top = {
                x0: obj.base_x-th2,
                y0: obj.base_y-th2,
                x1: obj.base_x+obj.width+th2,
                y1: obj.base_y+th2,
            };
            let right = {
                x0: obj.base_x+obj.width-th2,
                y0: obj.base_y+th2,
                x1: obj.base_x+obj.width+th2,
                y1: obj.base_y+obj.height+th2,
            };
            let bottom = {
                x0: obj.base_x-th2,
                y0: obj.base_y+obj.height-th2,
                x1: obj.base_x+obj.width+th2,
                y1: obj.base_y+obj.height+th2,
            };
            for(let b of [left, top, right, bottom]){
                if(bbox_overlaps(b, bbox)) return true;
            }
            return false;
        }break;
        case CanvasType.ELLIPSE:{
            const rect_bbox = {
                x0:obj.base_x,
                y0:obj.base_y,
                x1:obj.base_x+obj.width,
                y1:obj.base_y+obj.height,
            };
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
	        // Ellipses are a little hard to click, fudge their size a bit.
            const fudged = {
                x0: bbox.x0-2,
                x1: bbox.x1+2,
                y0: bbox.y0-2,
                y1: bbox.y1+2,
            };
            if(!bbox_overlaps(fudged, rect_bbox))
                return false;
            const rx = obj.width /2;
            const ry = obj.height/2;
            const cx = obj.base_x+rx;
            const cy = obj.base_y+ry;
            // if ellipse is inside our selection, return true
            if(bbox_inside(fudged, rect_bbox)) return true;
            switch(obj.variant){
                case ELLIPSETYPE.HOLLOW:
                    return bbox_overlaps_ellipse_edge(fudged, cx, cy, rx, ry);
                    break;
                case ELLIPSETYPE.SOLID: // fall-through
                case ELLIPSETYPE.FILLED:
                    return bbox_overlaps_ellipse(fudged, cx, cy, rx, ry)
                        || bbox_overlaps_ellipse_edge(fudged, cx, cy, rx, ry);
                    break;
            }
        }
        // @ts-expect-error // for fall-through
        case CanvasType.IMAGE: // fall-through
            if(obj.flags & CanvasFlag.IMG_IS_BACKGROUND){
                if(!(selection_type & SELECTTYPE.BACKGROUND)) return false;
                const rect_bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+obj.width,
                    y1:obj.base_y+obj.height,
                };
                return bbox_overlaps(bbox, rect_bbox);
            }
            // fall-through
        case CanvasType.FILLED_RECT: // fall-through
        case CanvasType.GRID_RECT:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const rect_bbox = {
                x0:obj.base_x,
                y0:obj.base_y,
                x1:obj.base_x+obj.width,
                y1:obj.base_y+obj.height,
            };
            return bbox_overlaps(bbox, rect_bbox);
        }break;
        case CanvasType.IMG_TOKEN:// fall-through
        case CanvasType.EZ_TOKEN:{
            if(!(selection_type & SELECTTYPE.TOKEN))
                return false;
            const w = obj.width * REFERENCE.WIDTH;
            const h = obj.height * REFERENCE.WIDTH;
            // const radius_x = obj.width*REFERENCE.WIDTH/2;
            // const radius_y = obj.height*REFERENCE.WIDTH/2;
            const token_bbox = {
                x0: obj.base_x,
                x1: obj.base_x + w,
                y0: obj.base_y,
                y1: obj.base_y + h,
            };
            return bbox_overlaps(token_bbox, bbox);
        }break;
        case CanvasType.TEXT:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
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
        case CanvasType.DOOR:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            const is_vertical = obj.orientation === Orientation.VERTICAL;
            if(!is_vertical){
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
        case CanvasType.STAIRS:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            if(!obj.width || !obj.height)
                return false;
            const w = obj.width*REFERENCE.WIDTH;
            const h = obj.height*REFERENCE.WIDTH;
            const stairs_bbox = {
                    x0 : obj.base_x,
                    x1 : obj.base_x + w,
                    y0 : obj.base_y,
                    y1 : obj.base_y+h
            };
            return bbox_overlaps(bbox, stairs_bbox);
        }break;
        case CanvasType.MEASURE:
            return false;
        case CanvasType.FIXTURE:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
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
        case CanvasType.ICON_TILE:{
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
            if(is_hex){
                const ftbbox = {
                    x0: obj.base_x-9,
                    x1: obj.base_x + REFERENCE.WIDTH+9,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                if(!bbox_overlaps(bbox, ftbbox)) return false;
                return bbox_overlaps_ref_unit_hexagon(bbox, obj.base_x, obj.base_y);
            }
            else {
                const ftbbox = {
                    x0: obj.base_x,
                    x1: obj.base_x + REFERENCE.WIDTH,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                return bbox_overlaps(bbox, ftbbox);
            }
        }
        case CanvasType.FILLED_TILE:{
            if(!(selection_type & SELECTTYPE.BACKGROUND))
                return false;
            if(is_hex){
                const ftbbox = {
                    x0: obj.base_x-9,
                    x1: obj.base_x + REFERENCE.WIDTH+9,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                if(!bbox_overlaps(bbox, ftbbox)) return false;
                return bbox_overlaps_ref_unit_hexagon(bbox, obj.base_x, obj.base_y);
            }
            else {
                const ftbbox = {
                    x0: obj.base_x,
                    x1: obj.base_x + REFERENCE.WIDTH,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                return bbox_overlaps(bbox, ftbbox);
            }
        }
        case CanvasType.TERRAIN_TILE:{
            if(!(selection_type & SELECTTYPE.BACKGROUND))
                return false;
            if(is_hex){
                const ftbbox = {
                    x0: obj.base_x-9,
                    x1: obj.base_x + REFERENCE.WIDTH+9,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                if(!bbox_overlaps(bbox, ftbbox)) return false;
                return bbox_overlaps_ref_unit_hexagon(bbox, obj.base_x, obj.base_y);
            }
            else {
                const ftbbox = {
                    x0: obj.base_x,
                    x1: obj.base_x + REFERENCE.WIDTH,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                return bbox_overlaps(bbox, ftbbox);
            }
        }
        case CanvasType.ARC:{
            const rect_bbox = {
                x0:obj.base_x,
                y0:obj.base_y,
                x1:obj.base_x+obj.width,
                y1:obj.base_y+obj.height,
            };
            if(!(selection_type & SELECTTYPE.MAP))
                return false;
	        // Ellipses are a little hard to click, fudge their size a bit.
            const fudged = {
                x0: bbox.x0-2,
                x1: bbox.x1+2,
                y0: bbox.y0-2,
                y1: bbox.y1+2,
            };
            if(!bbox_overlaps(fudged, rect_bbox))
                return false;
            // if ellipse is inside our selection, return true
            if(bbox_inside(fudged, rect_bbox)) return true;
            let [cx, cy, rx, ry] = arc_components(obj, 0, 0);
            return bbox_overlaps_ellipse_edge(fudged, cx, cy, rx, ry);
        }
    }
}

function get_bbox(obj:Readonly<CanvasObject>, is_hex:boolean):Bbox{
    switch(obj.type){
        case CanvasType.SHAPE: // hack
        case CanvasType.FREEHAND_LINE:
        case CanvasType.GRID_LINE:{
            const outer_bbox: Bbox = {
                x0:obj.bbox.x0 + obj.base_x,
                y0:obj.bbox.y0 + obj.base_y,
                x1:obj.bbox.x1 + obj.base_x,
                y1:obj.bbox.y1 + obj.base_y,
            };
            return outer_bbox;
        }break;
        case CanvasType.SUBMAP: {
            const th2 = 3;
            const rect_bbox = {
                x0:obj.base_x-th2,
                y0:obj.base_y-th2,
                x1:obj.base_x+obj.width+th2,
                y1:obj.base_y+obj.height+th2,
            };
            return rect_bbox;
        }break;
        case CanvasType.RECT:{
            const th2 = 3;
            const rect_bbox = {
                x0:obj.base_x-th2,
                y0:obj.base_y-th2,
                x1:obj.base_x+obj.width+th2,
                y1:obj.base_y+obj.height+th2,
            };
            return rect_bbox;
        }break;
        case CanvasType.ELLIPSE:{
            const rect_bbox = {
                x0:obj.base_x,
                y0:obj.base_y,
                x1:obj.base_x+obj.width,
                y1:obj.base_y+obj.height,
            };
            return rect_bbox;
        }
        case CanvasType.FILLED_RECT: // fall-through
        case CanvasType.IMAGE: // fall-through
        case CanvasType.GRID_RECT:{
            const rect_bbox = {
                x0:obj.base_x,
                y0:obj.base_y,
                x1:obj.base_x+obj.width,
                y1:obj.base_y+obj.height,
            };
            return rect_bbox;
        }break;
        case CanvasType.IMG_TOKEN:// fall-through
        case CanvasType.EZ_TOKEN:{
            const w = obj.width * REFERENCE.WIDTH;
            const h = obj.height * REFERENCE.WIDTH;
            // const radius_x = obj.width*REFERENCE.WIDTH/2;
            // const radius_y = obj.height*REFERENCE.WIDTH/2;
            const token_bbox = {
                x0: obj.base_x,
                x1: obj.base_x + w,
                y0: obj.base_y,
                y1: obj.base_y + h,
            };
            return token_bbox;
        }break;
        case CanvasType.TEXT:{
            const text_bbox = {
                x0:obj.bbox.x0 + obj.base_x,
                y0:obj.bbox.y0 + obj.base_y,
                x1:obj.bbox.x1 + obj.base_x,
                y1:obj.bbox.y1 + obj.base_y,
            };
            return text_bbox;
        }break;
        case CanvasType.DOOR:{
            const is_vertical = obj.orientation === Orientation.VERTICAL;
            if(!is_vertical){
                // FIXME: I just hardcoded some random values.
                const door_bbox = {
                    x0 : obj.base_x - 32 * obj.width,
                    x1 : obj.base_x + 32 * obj.width,
                    y0 : obj.base_y - 5,
                    y1 : obj.base_y + 5,
                };
                return door_bbox;
            }
            else {
                // FIXME: I just hardcoded some random values.
                const door_bbox = {
                    x0 : obj.base_x - 5,
                    x1 : obj.base_x + 5,
                    y0 : obj.base_y - 32 * obj.width,
                    y1 : obj.base_y + 32 * obj.width,
                };
                return door_bbox;
            }
        }break;
        case CanvasType.STAIRS:{
            const w = obj.width*REFERENCE.WIDTH;
            const h = obj.height*REFERENCE.WIDTH;
            const stairs_bbox = {
                    x0 : obj.base_x,
                    x1 : obj.base_x + w,
                    y0 : obj.base_y,
                    y1 : obj.base_y+h
            };
            return stairs_bbox;
        }break;
        case CanvasType.MEASURE:
            return {x0:0, x1:0, y0:0, y1:0};
        case CanvasType.FIXTURE:{
            const f_bbox = {
                    x0 : obj.base_x,
                    x1 : obj.base_x + obj.width,
                    y0 : obj.base_y,
                    y1 : obj.base_y + obj.height
            };
            return f_bbox;
        }
        case CanvasType.ICON_TILE:{
            if(is_hex){
                const ftbbox = {
                    x0: obj.base_x-9,
                    x1: obj.base_x + REFERENCE.WIDTH+9,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                return ftbbox;
            }
            else {
                const ftbbox = {
                    x0: obj.base_x,
                    x1: obj.base_x + REFERENCE.WIDTH,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                return ftbbox;
            }
        }
        case CanvasType.FILLED_TILE:{
            if(is_hex){
                const ftbbox = {
                    x0: obj.base_x-9,
                    x1: obj.base_x + REFERENCE.WIDTH+9,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                return ftbbox;
            }
            else {
                const ftbbox = {
                    x0: obj.base_x,
                    x1: obj.base_x + REFERENCE.WIDTH,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                return ftbbox;
            }
        }
        case CanvasType.TERRAIN_TILE:{
            if(is_hex){
                const ftbbox = {
                    x0: obj.base_x-9,
                    x1: obj.base_x + REFERENCE.WIDTH+9,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                return ftbbox;
            }
            else {
                const ftbbox = {
                    x0: obj.base_x,
                    x1: obj.base_x + REFERENCE.WIDTH,
                    y0: obj.base_y,
                    y1: obj.base_y + REFERENCE.WIDTH,
                };
                return ftbbox;
            }
        }
        case CanvasType.ARC:{
            const rect_bbox = {
                x0:obj.base_x,
                y0:obj.base_y,
                x1:obj.base_x+obj.width,
                y1:obj.base_y+obj.height,
            };
            return rect_bbox;
        }
    }
}
function obj_at(view:DungeonMapView, x0:number, y0:number, select_type:SELECTTYPE):CanvasObject | null {
    sort_canv_objs(view.map);
    const canvas_obj_array = view.map.canvas_obj_array;
    const length = canvas_obj_array.length;
    const bbox = {
        x0:x0-FUDGE._,///view.scale,
        y0:y0-FUDGE._,///view.scale,
        x1:x0+FUDGE._,///view.scale,
        y1:y0+FUDGE._,///view.scale,
    };
    for(let i = length-1; i >= 0; --i){
        const obj = canvas_obj_array[i];
        if(obj.flags & CanvasFlag.DELETED)
            continue;
        if(obj.hidinguser && obj.hidinguser != SETTINGS.userid)
            continue;
        if(obj.submap){
            let sm = view.map.canvas_objs.get(obj.submap)! as SubMap;
            let bbox_ = {
                x0: bbox.x0-sm.base_x-sm.tlx,
                y0: bbox.y0-sm.base_y-sm.tly,
                x1: bbox.x1-sm.base_x-sm.tlx,
                y1: bbox.y1-sm.base_y-sm.tly,
            };
            if(obj_in_bbox(obj, bbox_, select_type, !!(view.map.grid_type & GridType.HEX)))
                return obj;
        }
        else if(obj_in_bbox(obj, bbox, select_type, !!(view.map.grid_type & GridType.HEX)))
            return obj;
    }
    return null;
}
function tile_at(view:DungeonMapView, x0:number, y0:number, tile_type:TileType):CanvasObject|null{
    const canvas_obj_array = view.map.canvas_obj_array;
    const length = canvas_obj_array.length;
    for(let i = 0; i < length; ++i){
        const obj = canvas_obj_array[i];
        if(obj.flags & CanvasFlag.DELETED)
            continue;
        if(obj.hidinguser && obj.hidinguser != SETTINGS.userid)
            continue;
        if(obj.submap)
            continue;
        switch(obj.type){
        case CanvasType.ICON_TILE:
            if(tile_type != TileType.ICON) continue;
            break;
        case CanvasType.FILLED_TILE:
        case CanvasType.TERRAIN_TILE:
            if(tile_type == TileType.FILLED || tile_type == TileType.TERRAIN) break;
            continue;
        default: continue;
        }
        if(obj.base_x == x0 && obj.base_y == y0)
            return obj;
    }
    return null;
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
            if(obj.flags & CanvasFlag.DELETED)
                continue;
            if(obj.hidinguser && obj.hidinguser != SETTINGS.userid)
                continue;
            if(obj.submap){
                let sm = view.map.canvas_objs.get(obj.submap)! as SubMap;
                let bbox_ = {
                    x0: selection_bbox.x0-sm.base_x-sm.tlx,
                    y0: selection_bbox.y0-sm.base_y-sm.tly,
                    x1: selection_bbox.x1-sm.base_x-sm.tlx,
                    y1: selection_bbox.y1-sm.base_y-sm.tly,
                };
                if(obj_in_bbox(obj, bbox_, selection_type, !!(view.map.grid_type & GridType.HEX))){
                    selected.add(obj.id);
                    break;
                }
            }
            else if(obj_in_bbox(obj, selection_bbox, selection_type, !!(view.map.grid_type & GridType.HEX))){
                selected.add(obj.id);
                break;
            }
        }
    }
    else {
        for(let i = 0; i < length; ++i){
            const obj = canvas_obj_array[i];
            if(obj.flags & CanvasFlag.DELETED)
                continue;
            if(obj.hidinguser && obj.hidinguser != SETTINGS.userid)
                continue;
            if(obj.submap !== view.selection_area.submap)
                continue;
            if(obj.submap){
                let sm = view.map.canvas_objs.get(obj.submap)! as SubMap;
                let bbox_ = {
                    x0: selection_bbox.x0-sm.base_x-sm.tlx,
                    y0: selection_bbox.y0-sm.base_y-sm.tly,
                    x1: selection_bbox.x1-sm.base_x-sm.tlx,
                    y1: selection_bbox.y1-sm.base_y-sm.tly,
                };
                if(obj_in_bbox(obj, bbox_, selection_type, !!(view.map.grid_type & GridType.HEX)))
                    selected.add(obj.id);
            }
            else if(obj_in_bbox(obj, selection_bbox, selection_type, !!(view.map.grid_type & GridType.HEX))){
                selected.add(obj.id);
            }
        }
    }
}
function selection_is_rigid(view:DungeonMapView):boolean{
    for(let id of view.selected){
        const obj = view.map.canvas_objs.get(id)!;
        if(obj.flags & CanvasFlag.DELETED)
            continue;
        switch(obj.type){
            // Idk, this is unclear.
            case CanvasType.EZ_TOKEN:
            case CanvasType.IMG_TOKEN:
            case CanvasType.ELLIPSE:
            case CanvasType.GRID_RECT:
            case CanvasType.GRID_LINE:
            case CanvasType.IMAGE:
            case CanvasType.ARC:
                return snapmode != SNAPMODE.FREE;
            case CanvasType.DOOR:
            case CanvasType.STAIRS:
            case CanvasType.ICON_TILE:
            case CanvasType.FILLED_TILE:
            case CanvasType.TERRAIN_TILE:
                return true;
            case CanvasType.FIXTURE:
                return (obj.ftype == FixtureType.WELL || obj.ftype == FixtureType.PIT || obj.ftype == FixtureType.STATUE) && snapmode != SNAPMODE.FREE;
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
        if(obj.flags & CanvasFlag.DELETED)
            continue;
        if(obj_in_bbox(obj, selection_bbox, selection_type, !!(view.map.grid_type & GridType.HEX)))
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
        if(obj.flags & CanvasFlag.DELETED)
            continue;
        selected_objs.push(obj);
    }
    if(!selected_objs.length)
        return;
    if(rigid){
        const ox = base_x + dx;
        const oy = base_y + dy;
        let m;
        if(snapmode == SNAPMODE.HALF || (view.map.grid_type & GridType.HEX)){
            m = REFERENCE.WIDTH/2-1;
        }
        else if(snapmode == SNAPMODE.QUARTER){
            m = REFERENCE.WIDTH/4-1;
        }
        else{
            m = REFERENCE.WIDTH-1;
        }
        const m1 = m + 1;
        const aligned_old_x = base_x - (base_x & m);
        const aligned_old_y = base_y - (base_y & m);
        const aligned_new_x = ox - (ox & m);
        const aligned_new_y = oy - (oy & m);
        dx = aligned_new_x - aligned_old_x;
        dy = aligned_new_y - aligned_old_y;
        dx = Math.round(dx/m1)*m1;
        dy = Math.round(dy/m1)*m1;
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
function strip_obj(obj:CanvasObject): StrippedObj{
    switch(obj.type){
        case CanvasType.FREEHAND_LINE:{
            const stripped_obj: StrippedFreehandLine =
                [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.color, Array.from(obj.points), obj.thickness];
            return stripped_obj;
        }break;
        case CanvasType.GRID_LINE:{
            const stripped_obj: StrippedGridLine = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.color, Array.from(obj.points)];
            return stripped_obj;
        }break;
        case CanvasType.RECT:{
            const stripped_obj: StrippedRectangle = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.color, obj.width, obj.height];
            return stripped_obj;
        }break;
        case CanvasType.FILLED_RECT:{
            const stripped_obj: StrippedFilledRectangle = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.color, obj.color2, obj.width, obj.height];
            return stripped_obj;
        }break;
        case CanvasType.GRID_RECT:{
            const stripped_obj: StrippedGridRectangle = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.color, obj.width, obj.height];
            return stripped_obj;
        }break;
        case CanvasType.ELLIPSE:{
            const stripped_obj: StrippedEllipse = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.color, obj.color2, obj.width, obj.height, obj.variant];
            return stripped_obj;
        }break;
        case CanvasType.IMAGE:{
            const stripped_obj: StrippedImageObj = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.width, obj.height, obj.url];
            return stripped_obj;
        }break;
        case CanvasType.TEXT:{
            const stripped_obj: StrippedTextObj = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.text, obj.size, obj.alignment, obj.map_id];
            return stripped_obj;
        }break;
        case CanvasType.EZ_TOKEN:{
            const stripped_obj: StrippedEzToken = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.text, obj.color, obj.width, obj.height, obj.statusflags];
            return stripped_obj;
        }break;
        case CanvasType.IMG_TOKEN:{
            const stripped_obj: StrippedImgToken = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.url, obj.width, obj.height, obj.statusflags];
            return stripped_obj;
        }break;
        case CanvasType.DOOR:{
            const stripped_obj: StrippedDoorObj = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.doortype, obj.color, obj.width, obj.orientation];
            return stripped_obj;
        }break;
        case CanvasType.STAIRS:{
            const stripped_obj: StrippedStairs = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.width, obj.height, obj.rotation];
            return stripped_obj;
        }break;
        case CanvasType.MEASURE:{
            const stripped_obj: StrippedMeasureObj = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.color, obj.x1, obj.y1];
            return stripped_obj;
        }break;
        case CanvasType.FIXTURE:{
            const stripped_obj: StrippedFixtureObj = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.width, obj.height, obj.ftype];
            return stripped_obj;
        }break;
        case CanvasType.FILLED_TILE:{
            const stripped_obj: StrippedFilledTile = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.color, obj.size];
            return stripped_obj;
        }break;
        case CanvasType.TERRAIN_TILE:{
            const stripped_obj: StrippedTerrainTile = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.terrain_id];
            return stripped_obj;
        }break;
        case CanvasType.ICON_TILE:{
            const stripped_obj: StrippedIconTile = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.terrainicon_id];
            return stripped_obj;
        }break;
        case CanvasType.SUBMAP:{
            const stripped_obj: StrippedSubMap = [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.width, obj.height, obj.tlx, obj.tly, obj.grid_type, obj.title, obj.grid_color, obj.bg_color]
            return stripped_obj;
        }break;
        case CanvasType.SHAPE:{
            const stripped_obj: StrippedShape =
                [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.color, obj.color2, Array.from(obj.points), obj.thickness];
            return stripped_obj;
        }break;
        case CanvasType.ARC:{
            const stripped_obj: StrippedArc =
                [obj.type, obj.id, obj.base_x, obj.base_y, obj.flags, obj.hidinguser, obj.submap, obj.width, obj.height, obj.start_arc, obj.end_arc, obj.thickness, obj.color];
            return stripped_obj;
        }break;
    }
}
function strip_objs(objs:Array<CanvasObject>, skip_deleted:boolean): Array<StrippedObj>{
    let result = [];
    if(skip_deleted)
        for(let i = 0; i < objs.length; i++){
            let o = objs[i];
            if(o.flags & CanvasFlag.DELETED) continue;
            result.push(strip_obj(o));
        }
    else
        for(let i = 0; i < objs.length; i++){
            let o = objs[i];
            result.push(strip_obj(o));
        }
    return result;
}
//
// Returns a brand new object that is the unstripped version of the given object.
// Things like arrays are created fresh to avoid sharing state.
//
function unstrip_obj(sobj: StrippedObj):CanvasObject{
    switch(sobj[INDEX.TYPE]){
        case CanvasType.FREEHAND_LINE:{
            const obj:FreehandLine = {
                type: CanvasType.FREEHAND_LINE,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                // typescript  is being dumb here
                color: (sobj as StrippedFreehandLine)[7],
                points: (sobj as StrippedFreehandLine)[8],
                thickness: (sobj as StrippedFreehandLine)[9],
                bbox:{x0:0, x1:0, y0:0, y1:0}
            };
            obj.points = Array.from(obj.points),
            freehand_recalculate_bbox(obj);
            obj.path = undefined;
            return obj;
            }break;
        case CanvasType.GRID_LINE:{
            const obj:GridLine = {
                type: CanvasType.GRID_LINE,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                color:  (sobj as StrippedGridLine)[7],
                points: (sobj as StrippedGridLine)[8],
                bbox:{x0:0, x1:0, y0:0, y1:0},
            };
            obj.points = Array.from(obj.points),
            gridline_recalculate_bbox(obj);
            obj.path = undefined;
            return obj;
        }break;
        case CanvasType.RECT:{
            const obj:Rectangle = {
                type: CanvasType.RECT,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                color: (sobj as StrippedRectangle)[7],
                width: (sobj as StrippedRectangle)[8],
                height: (sobj as StrippedRectangle)[9],
            };
            return obj;
        }break;
        case CanvasType.FILLED_RECT:{
            const obj:FilledRectangle = {
                type: CanvasType.FILLED_RECT,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                color  : (sobj as StrippedFilledRectangle)[7],
                color2 : (sobj as StrippedFilledRectangle)[8],
                width  : (sobj as StrippedFilledRectangle)[9],
                height : (sobj as StrippedFilledRectangle)[10],
            };
            return obj;
        }break;
        case CanvasType.GRID_RECT:{
            const obj: GridRectangle = {
                type: CanvasType.GRID_RECT,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                color  : (sobj as StrippedGridRectangle)[7],
                width  : (sobj as StrippedGridRectangle)[8],
                height : (sobj as StrippedGridRectangle)[9],
            };
            return obj;
        }break;
        case CanvasType.ELLIPSE:{
            const obj:Ellipse = {
                type: CanvasType.ELLIPSE,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                color   : (sobj as StrippedEllipse)[7],
                color2  : (sobj as StrippedEllipse)[8],
                width   : (sobj as StrippedEllipse)[9],
                height  : (sobj as StrippedEllipse)[10],
                variant : (sobj as StrippedEllipse)[11],
            };
            return obj;
        }break;
        case CanvasType.IMAGE:{
            const obj: ImageObj = {
                type: CanvasType.IMAGE,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                width  : (sobj as StrippedImageObj)[7],
                height : (sobj as StrippedImageObj)[8],
                url    : (sobj as StrippedImageObj)[9],
            };
            delay_load_obj_image(obj, obj.width, obj.height, obj.width?obj.width:64, obj.height?obj.height:64);
            return obj;
        }break;
        case CanvasType.TEXT:{
            const obj: TextObj = {
                type: CanvasType.TEXT,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                text      : (sobj as StrippedTextObj)[7],
                size      : (sobj as StrippedTextObj)[8],
                alignment : (sobj as StrippedTextObj)[9],
                bbox:{x0:0, x1:0, y0:0, y1:0},
                lines: (sobj as StrippedTextObj)[7].split('\n'),
                bboxes: [],
                map_id: (sobj as StrippedTextObj)[10],
            };
            return obj;
        }break;
        case CanvasType.EZ_TOKEN:{
            const obj: EzToken = {
                type: CanvasType.EZ_TOKEN,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                text        : (sobj as StrippedEzToken)[7],
                color       : (sobj as StrippedEzToken)[8],
                width       : (sobj as StrippedEzToken)[9],
                height      : (sobj as StrippedEzToken)[10],
                statusflags : (sobj as StrippedEzToken)[11],
            };
            return obj;
        }break;
        case CanvasType.IMG_TOKEN:{
            const obj: ImgToken = {
                type: CanvasType.IMG_TOKEN,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                url         : (sobj as StrippedImgToken)[7],
                width       : (sobj as StrippedImgToken)[8],
                height      : (sobj as StrippedImgToken)[9],
                statusflags : (sobj as StrippedImgToken)[10],
            };
            delay_load_obj_image(obj, obj.width*REFERENCE.WIDTH, obj.height*REFERENCE.WIDTH, obj.width, obj.width);
            return obj;
        }break;
        case CanvasType.DOOR:{
            const obj:DoorObj = {
                type: CanvasType.DOOR,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                doortype    : (sobj as StrippedDoorObj)[7],
                color       : (sobj as StrippedDoorObj)[8],
                width       : (sobj as StrippedDoorObj)[9],
                orientation : (sobj as StrippedDoorObj)[10],
            };
            return obj;
        }break;
        case CanvasType.STAIRS:{
            const obj: Stairs = {
                type: CanvasType.STAIRS,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                width    : (sobj as StrippedStairs)[7],
                height   : (sobj as StrippedStairs)[8],
                rotation : (sobj as StrippedStairs)[9],
            };
            return obj;
        }break;
        case CanvasType.MEASURE:{
            const obj: MeasureObj = {
                type: CanvasType.MEASURE,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                color : (sobj as StrippedMeasureObj)[7],
                x1    : (sobj as StrippedMeasureObj)[8],
                y1    : (sobj as StrippedMeasureObj)[9],
            };
            return obj;
            // all fields are good
        }break;
        case CanvasType.FIXTURE:{
            const obj: FixtureObj = {
                type: CanvasType.FIXTURE,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                width  : (sobj as StrippedFixtureObj)[7],
                height : (sobj as StrippedFixtureObj)[8],
                ftype  : (sobj as StrippedFixtureObj)[9],
            };
            return obj;
        }break;
        case CanvasType.FILLED_TILE:{
            const obj: FilledTile = {
                type: CanvasType.FILLED_TILE,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                color : (sobj as StrippedFilledTile)[7],
                size  : (sobj as StrippedFilledTile)[8],
            };
            return obj;
        }break;
        case CanvasType.TERRAIN_TILE:{
            const obj: TerrainTile = {
                type: CanvasType.TERRAIN_TILE,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                terrain_id: (sobj as StrippedTerrainTile)[7],
            };
            return obj;
        }break;
        case CanvasType.ICON_TILE:{
            const obj: IconTile = {
                type: CanvasType.ICON_TILE,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                terrainicon_id: (sobj as StrippedIconTile)[7],
            };
            return obj;
        }break;
        case CanvasType.SUBMAP:{
            const obj: SubMap = {
                type: CanvasType.SUBMAP,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                width  : (sobj as StrippedSubMap)[7],
                height : (sobj as StrippedSubMap)[8],
                tlx: (sobj as StrippedSubMap)[9],
                tly: (sobj as StrippedSubMap)[10],
                grid_type: (sobj as StrippedSubMap)[11],
                title: (sobj as StrippedSubMap)[12],
                grid_color: (sobj as StrippedSubMap)[13],
                bg_color: (sobj as StrippedSubMap)[14],
            };
            return obj;
        }break;
        case CanvasType.SHAPE:{
            const obj:Shape = {
                type: CanvasType.SHAPE,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                // typescript  is being dumb here
                color: (sobj as StrippedShape)[7],
                color2: (sobj as StrippedShape)[8],
                points: (sobj as StrippedShape)[9],
                thickness: (sobj as StrippedShape)[10],
                bbox:{x0:0, x1:0, y0:0, y1:0}
            };
            obj.points = Array.from(obj.points),
            freehand_recalculate_bbox(obj);
            obj.path = undefined;
            return obj;
        }break;
        case CanvasType.ARC:{
            const obj: Arc = {
                type: CanvasType.ARC,
                id: sobj[INDEX.ID],
                base_x: sobj[INDEX.BASE_X],
                base_y: sobj[INDEX.BASE_Y],
                flags: sobj[INDEX.FLAGS],
                hidinguser: sobj[INDEX.HIDINGUSER],
                submap: sobj[INDEX.SUBMAP],
                width: (sobj as StrippedArc)[7],
                height: (sobj as StrippedArc)[8],
                start_arc: (sobj as StrippedArc)[9],
                end_arc: (sobj as StrippedArc)[10],
                thickness: (sobj as StrippedArc)[11],
                color: (sobj as StrippedArc)[12],
            };
            return obj;
        }break;
    }
}

//
// Updates the fields of the first given to be the same as the second.
// Arrays and such are made fresh to avoid sharing state.
//
function set_obj_from_stripped(obj: CanvasObject, state:StrippedObj){
    switch(obj.type){
        case CanvasType.SHAPE:
        case CanvasType.FREEHAND_LINE:{
            const o = unstrip_obj(state);
            Object.assign(obj, o);
            obj.bbox = {x0:0, x1:0, y0:0, y1:0};
            obj.points = Array.from(obj.points);
            freehand_recalculate_bbox(obj);
            obj.path = undefined;
        }break;
        case CanvasType.GRID_LINE:{
            const o = unstrip_obj(state);
            Object.assign(obj, o);
            obj.bbox = {x0:0, x1:0, y0:0, y1:0};
            obj.points = Array.from(obj.points);
            gridline_recalculate_bbox(obj);
            obj.path = undefined;
        }break;
        case CanvasType.IMAGE:{
            const o = unstrip_obj(state) as ImageObj;
            const needs_new_image = (obj.width !== o.width) || (obj.height !== o.height) || (obj.url !== o.url);
            Object.assign(obj, o);
            if(needs_new_image){
                delay_load_obj_image(obj, obj.width, obj.height, obj.width?obj.width:64, obj.height?obj.height:64);
            }
        }break;
        case CanvasType.IMG_TOKEN:{
            const o = unstrip_obj(state) as ImgToken;
            const needs_new_image = (obj.width !== o.width) || (obj.height !== o.height) || (obj.url !== o.url);
            Object.assign(obj, o);
            if(needs_new_image){
                delay_load_obj_image(obj, obj.width*REFERENCE.WIDTH, obj.height*REFERENCE.WIDTH, obj.width, obj.height);
            }
        }break;
        case CanvasType.TEXT:{
            const o = unstrip_obj(state);
            Object.assign(obj, o);
            obj.bbox = {x0:0, x1:0, y0:0, y1:0};
            obj.bboxes = [];
            obj.lines = obj.text.split('\n');
        }break;
        default:
            const o = unstrip_obj(state);
            Object.assign(obj, o);
            break;
    }

}
function publish_delete_by_ids(map_id:number, ids:Array<number>):void{
    let msg: CanvasDeleteMessage = {map_id:map_id, ids:ids};
    EMIT(FromClient.CANVAS_DELETE, msg);
}
function publish_obj_by_id(map:DungeonMap, id:number):void{
    const obj = map.canvas_objs.get(id);
    if(!obj){
        console.log('invalid id given for publishing:', id);
        return;
    }
    const stripped_obj = strip_obj(obj);
    let msg: CreateObjectsMessage = {map_id:map.map_id, objects:[stripped_obj]};
    EMIT(FromClient.CANVAS_CREATE_OBJECTS, [msg]);
}

function publish_objs_by_ids(map:DungeonMap, ids:Array<number>):void{
    const objs = [];
    for(let id of ids){
        const obj = map.canvas_objs.get(id);
        if(!obj){
            console.log('invalid id given for publishing:', id);
            return;
        }
        const stripped_obj = strip_obj(obj);
        objs.push(stripped_obj);
    }
    let msg: CreateObjectsMessage = {map_id:map.map_id, objects:objs};
    EMIT(FromClient.CANVAS_CREATE_OBJECTS, [msg]);
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
    let msg:CanvasUpdateMessage = {map_id:map_id, obj_states:updates};
    EMIT(FromClient.CANVAS_UPDATE, msg);
}

function edit_is_impossible(view:DungeonMapView):boolean{
    if(view.selected.size !== 1)
        return true;
    const first = view.selected.values().next().value;
    const obj = view.map.canvas_objs.get(first)!;
    if(obj.flags & CanvasFlag.DELETED)
        return true;
    switch(obj.type){
        case CanvasType.FREEHAND_LINE:
            return true;
        case CanvasType.GRID_LINE:
            return true;
        case CanvasType.RECT:
            return true;
        case CanvasType.GRID_RECT:
            return true;
        case CanvasType.ELLIPSE:
            return true;
        case CanvasType.FILLED_RECT:
            return true;
        case CanvasType.IMAGE:
            return false;
        case CanvasType.TEXT:
            return false;
        case CanvasType.EZ_TOKEN:
            return false;
        case CanvasType.IMG_TOKEN:
            return false;
        case CanvasType.DOOR:
            return true;
        case CanvasType.STAIRS:
            return true;
        case CanvasType.MEASURE:
            return true; // should be unreachable
        case CanvasType.FIXTURE:
            return true;
        case CanvasType.FILLED_TILE:
            return true;
        case CanvasType.TERRAIN_TILE:
            return true;
        case CanvasType.ICON_TILE:
            return true;
        case CanvasType.SUBMAP:
            return false;
        case CanvasType.SHAPE:
            return true;
        case CanvasType.ARC:
            return true;
    }
}
function launch_edit_dialog(view:DungeonMapView):void{
    if(view.selected.size !== 1)
        return;
    const first = view.selected.values().next()!.value;
    const obj: CanvasObject = view.map.canvas_objs.get(first)!;
    if(obj.flags & CanvasFlag.DELETED)
        return;
    switch(obj.type){
        case CanvasType.FREEHAND_LINE:
            return;
        case CanvasType.GRID_LINE:
            return;
        case CanvasType.RECT:
            return;
        case CanvasType.GRID_RECT:
            return;
        case CanvasType.ELLIPSE:
            return;
        case CanvasType.FILLED_RECT:
            return;
        case CanvasType.IMAGE:{
            let dialog = get_dialog('image-input');
            if(!dialog) return;
            dialog.title.textContent = 'Edit Image';
            dialog.f.width.value = ""+obj.width;
            dialog.f.height.value = ""+obj.height;
            dialog.f.url.value = obj.url;
            dialog.f.background.checked = !!(obj.flags & CanvasFlag.IMG_IS_BACKGROUND);
            dialog.ok_handler = function(){
                const text = dialog.f.url.value.trim();
                if(!text)
                    return;
                let width = +dialog.f.width.value;
                let height = +dialog.f.height.value;
                if(!width || width < 0) width = 0;
                if(!height || height < 0) height = 0;
                const round = dialog.f.checkbox.checked;
                if(round){
                    width = snap_to_grid(width);
                    height = snap_to_grid(height);
                }
                const before = strip_obj(obj);
                obj.width = width;
                obj.height = height;
                obj.url = text;
                if(dialog.f.background.checked)
                    obj.flags |= CanvasFlag.IMG_IS_BACKGROUND;
                else
                    obj.flags &= ~CanvasFlag.IMG_IS_BACKGROUND;
                const after = strip_obj(obj);
                delay_load_obj_image(obj, obj.width, obj.height, obj.width?obj.width:64, obj.height?obj.height:64);
                note_updates_for_undo(view.map,[before], [after]);
                publish_obj_updates(view.map.map_id, [after]);
                request_render();
            };
            dialog.show();
        }return;
        case CanvasType.TEXT:{
            let dialog = get_dialog('text-input');
            if(!dialog) return;
            dialog.title.textContent = 'Edit Text';
            dialog.f.size.value = "" + obj.size;
            const [l, c, r] = [dialog.f.left, dialog.f.center, dialog.f.right];
            for(let a of [l, c, r]) {
                a.name = 'text-input-alignment';
                a.checked = false;
            }
            [l, c, r][obj.alignment].checked = true;
            dialog.f.background.checked = !!(obj.flags & CanvasFlag.TEXT_HAS_BACKGROUND);
            dialog.f.text.textContent = obj.text;
            dialog.f['link-dungeon'].innerHTML = '<option value="-1">No Link</option>'+by_id('current-map-name').innerHTML;
            let submapoptions = '<option value="-1">No Link</option>'
            for(let sm of view.map.submaps){
                if(sm.flags & CanvasFlag.DELETED) continue;
                if(sm.hidinguser && sm.hidinguser !== SETTINGS.userid) continue;
                submapoptions += `<option value="${sm.id}">${sm.title}</option>`;
            }
            dialog.f['link-submap'].innerHTML = submapoptions;
            dialog.f['link-dungeon'].value = '-1';
            dialog.f['link-submap'].value = '-1';
            if(obj.flags & CanvasFlag.TEXT_LINKS_TO_SUBMAP)
                dialog.f['link-submap'].value = ""+obj.map_id;
            else
                dialog.f['link-dungeon'].value = ""+obj.map_id;
            dialog.f['link-dungeon'].onchange = function(){
                dialog.f['link-submap'].value = '-1'
            };
            dialog.f['link-submap'].onchange = function(){
                dialog.f['link-dungeon'].value = '-1'
            };
            dialog.show_handler = function(){
                dialog.f.text.value = obj.text;
                if(!IS_TOUCH) dialog.f.text.focus();
            };
            dialog.ok_handler = function(){
                const text = dialog.f.text.value.trim();
                if(!text) return;
                let alignment = radio_to_value([l,c,r], [TextAlignment.LEFT, TextAlignment.CENTER, TextAlignment.RIGHT]);
                let textsize = (+dialog.f.size.value) | 0;
                if(textsize < 4) textsize = 4;
                if(textsize > 72) textsize = 72;
                let map_id = +dialog.f['link-dungeon'].value;
                // This is annoying otherwise
                if(map_id == view.map.map_id)
                    map_id = -1;
                let submap = false;
                if(map_id == -1){
                    map_id = +dialog.f['link-submap'].value;
                    submap = true;
                }
                obj.size = textsize;
                obj.text = text;
                obj.bbox = {x0:0, y0:0, x1:0, y1:0};
                obj.bboxes = [];
                obj.lines = text.split('\n');
                obj.map_id = map_id;
                obj.alignment = alignment;
                if(submap)
                    obj.flags |= CanvasFlag.TEXT_LINKS_TO_SUBMAP;
                else
                    obj.flags &= ~CanvasFlag.TEXT_LINKS_TO_SUBMAP;
                if(dialog.f.background.checked)
                    obj.flags |= CanvasFlag.TEXT_HAS_BACKGROUND;
                else
                    obj.flags &= ~CanvasFlag.TEXT_HAS_BACKGROUND;
                const after = strip_obj(obj);
                publish_obj_updates(view.map.map_id, [after]);
                request_render();
            }

            dialog.show();

        }return;
        case CanvasType.EZ_TOKEN:{
            let dialog = get_dialog('ez-token');
            if(!dialog) return;
            dialog.title.textContent = 'Edit Token';
            dialog.f.color.value = obj.color;
            dialog.f.width.value = ""+obj.width;
            dialog.f.height.value = ""+obj.height;
            dialog.f.text.value = obj.text;
            dialog.hide_handler = function(){
                dialog.f.conditions.innerHTML = '';
            };
            const conditions = dialog.f.conditions;
            const flags_before = obj.statusflags;
            let flags_after = flags_before;
            function make_handler(el: HTMLInputElement, flag:TokenStatusFlags){
                function onchange(){
                    if(el.checked)
                        flags_after |= flag;
                    else
                        flags_after &= ~flag;
                }
                return onchange;
            }

            if(PACKED)
            for(let i = 0; i < PACKED.status_icons.length; i++){
                const si = PACKED.status_icons[i];
                const flag = 1 << i;
                const name = si[1];
                const d = document.createElement('div');
                const inp = document.createElement('input');
                inp.type = 'checkbox';
                const fullname = `hover-status-${name}`;
                inp.name = fullname;
                inp.id = fullname;
                if(flags_before & flag)
                    inp.checked = true;
                const label = document.createElement('label');
                let img = packed_to_img(si[2], si[3], si[4], si[5], si[1], 16, 16);
                label.appendChild(img);
                label.appendChild(document.createTextNode(name));
                label.htmlFor = fullname;
                inp.addEventListener('change', make_handler(inp, flag));
                d.appendChild(inp);
                d.appendChild(label);
                conditions.appendChild(d);
            }
            dialog.ok_handler = function(){
                const text = dialog.f.text.value.trim();
                if(text) obj.text = text;
                let width  = +dialog.f.width.value;
                let height = +dialog.f.height.value;
                if(!width) width = 1;
                if(!height) height = 1;
                if(!width || width < 0) width = gridscale == GRIDSCALE.TEN?1:0.5;
                if(!height || height < 0) height = gridscale == GRIDSCALE.TEN?1:0.5;
                obj.width = width;
                obj.height = height;
                const color = dialog.f.color.value;
                obj.color = color;
                obj.statusflags = flags_after;
                const after = strip_obj(obj);
                publish_obj_updates(view.map.map_id, [after]);
                request_render();
            };
            dialog.show();
        }return;
        case CanvasType.IMG_TOKEN:{
            let dialog = get_dialog('img-token');
            if(!dialog) return;
            dialog.title.textContent = 'Edit Token';
            dialog.f.width.value = ""+obj.width;
            dialog.f.height.value = ""+obj.height;
            dialog.f.url.value = obj.url;
            const conditions = dialog.f.conditions;
            dialog.hide_handler = function(){
                conditions.innerHTML = '';
            };
            const flags_before = obj.statusflags;
            const url_before = obj.url;
            let flags_after = flags_before;
            function make_handler(el: HTMLInputElement, flag:TokenStatusFlags){
                function onchange(){
                    if(el.checked)
                        flags_after |= flag;
                    else
                        flags_after &= ~flag;
                }
                return onchange;
            }
            if(PACKED)
            for(let i = 0; i < PACKED.status_icons.length; i++){
                const si = PACKED.status_icons[i];
                const flag = 1 << i;
                const name = si[1];
                const d = document.createElement('div');
                const inp = document.createElement('input');
                inp.type = 'checkbox';
                const fullname = `hover-status-${name}`;
                inp.name = fullname;
                inp.id = fullname;
                if(flags_before & flag)
                    inp.checked = true;
                const label = document.createElement('label');
                label.appendChild(packed_to_img(si[2], si[3], si[4], si[5], si[1], 16, 16));
                label.appendChild(document.createTextNode(name));
                label.htmlFor = fullname;
                inp.addEventListener('change', make_handler(inp, flag));
                d.appendChild(inp);
                d.appendChild(label);
                conditions.appendChild(d);
            }
            dialog.ok_handler = function(){
                let width  = +dialog.f.width.value;
                let height = +dialog.f.height.value;
                if(!width || width < 0) width = gridscale == GRIDSCALE.TEN?1:0.5;
                if(!height || height < 0) height = gridscale == GRIDSCALE.TEN?1:0.5;
                obj.width = width;
                obj.height = height;
                obj.statusflags = flags_after;
                obj.url = dialog.f.url.value.trim();
                if(obj.url != url_before){
                    delay_load_obj_image(obj, obj.width*REFERENCE.WIDTH, obj.height*REFERENCE.WIDTH, obj.width*REFERENCE.WIDTH, obj.height*REFERENCE.WIDTH);
                }
                const after = strip_obj(obj);
                publish_obj_updates(view.map.map_id, [after]);
                request_render();
            };
            dialog.show();
        }return;
        case CanvasType.DOOR:
            return;
        case CanvasType.STAIRS:
            return;
        case CanvasType.MEASURE:
            return;
        case CanvasType.FIXTURE:
            return;
        case CanvasType.SUBMAP:{
            let dialog = get_dialog('submap');
            if(!dialog) return;
            dialog.title.textContent = 'Submap';
            const orig_grid_color = obj.grid_color;
            const orig_bg_color = obj.bg_color;
            dialog.f['sm-title'].value = obj.title;
            link_input_value(obj.grid_color, dialog.f['grid-color'], 'onchange', dialog.f['grid-color-text'], 'oninput', function(){
                obj.grid_color = dialog.f['grid-color-text'].value;
                request_render();
            });
            link_input_value(obj.bg_color, dialog.f['bg-color'], 'onchange', dialog.f['bg-color-text'], 'oninput', function(){
                obj.bg_color = dialog.f['bg-color-text'].value;
                request_render();
            });
            dialog.show_handler = function(){
            };
            dialog.ok_handler = function(){
                const title = dialog.f['sm-title'].value.trim();
                const changed = title !== obj.title || orig_grid_color !== obj.grid_color || orig_bg_color !== obj.bg_color;
                if(changed){
                    obj.title = title;
                    const after = strip_obj(obj);
                    publish_obj_updates(view.map.map_id, [after]);
                    request_render();
                }
            };
            dialog.cancel_handler = function(){
                obj.grid_color = orig_grid_color;
                obj.bg_color = orig_bg_color;
                request_render();
            }
            dialog.show();
        }return;
    }
}

// State variable so that we don't double render in a single frame.
// requestAnimationFrame calls stack, so to avoid double drawing, you
// need to keep track of this.
let animation_requested = false;
function request_render():void{
    if(SETTINGS.uimode != UiMode.NORMAL) return;
    if(animation_requested){
        return;
    }
    animation_requested = true;
    // only call this from here to avoid double renders.
    requestAnimationFrame(render);
}
const timings: Array<number> = [];
// It's kind of janky, but so that hexmaps and staggered squares
// are just two views of the same data, we stretch the resulting
// image via these factors.
const HEX_Y_FIX_INV = 74/82;
const HEX_Y_FIX = 82/74;
function fmod(a:number, n:number){
    return a < 0? (a % n)+n : a % n;
}
const enum RenderFlags {
    NONE = 0,
    DRAW_SUBMAPS = 1 << 0,
    DARK_MODE = 1 << 1,
    SHOW_FPS = 1 << 2,
    DO_PINGS = 1 << 3,
    DRAW_TEXT = 1 << 4,
}
function render(timestamp:DOMHighResTimeStamp):void{
    if(!TheCtx) return;
    const view = get_active_view();
    if(!view) return;
    let flags = RenderFlags.DRAW_SUBMAPS;
    if(DARKMODE) flags |= RenderFlags.DARK_MODE;
    if(SHOW_FPS) flags |= RenderFlags.SHOW_FPS;
    flags |= RenderFlags.DO_PINGS;
    flags |= RenderFlags.DRAW_TEXT;
    animation_requested = false;
    actually_render(timestamp, TheCtx, view, flags);
}
function screenshot_canvas(view:DungeonMapView){
    let canvas = document.createElement('canvas');
    let dialog = get_dialog('screenshot-prefs');
    dialog.f.gridsize.value = '64';
    dialog.f.selection.checked = false;
    dialog.f.submaps.checked = false;
    dialog.f.darkmode.checked = DARKMODE;
    dialog.f.text.checked = true;
    if(current_tool == ToolType.SELECT){
        if(view.selected.size != 0){
            dialog.f.selection.checked = true;
        }
    }
    dialog.ok_handler = function(){
        const include_submaps = dialog.f.submaps.checked;
        const darkmode = dialog.f.darkmode.checked;
        const draw_text = dialog.f.text.checked;
        let x0 = 999999999;
        let y0 = 999999999;
        let x1 = 0;
        let y1 = 0;
        let scale = (+dialog.f.gridsize.value)
        if(!scale) scale = 32;
        if(scale > 256) scale = 256;
        dialog.f.gridsize.value = ''+scale;
        scale /= 64;
        let fake_view: DungeonMapView = {
            map: view.map,
            camera_x: 0,
            camera_y: 0,
            scale: 1,
            selected: new Set(),
            selection_area: {is_selecting: false, select_one: false, x0: 0, x1: 0, y0: 0, y1: 0, submap: 0},
            placing_area: {is_placing: false, is_line: false, x0: 0, x1: 0, y0: 0, y1: 0},
            mouse: {x: 0, y: 0},
            hovered_id: 0,
            resize: {handles: [], resizing: false},
            action: {areas: []},
        };
        const is_hex = !!(fake_view.map.grid_type & GridType.HEX);
        if(dialog.f.selection.checked){
            x0 = view.selection_area.x0;
            y0 = view.selection_area.y0;
            x1 = view.selection_area.x1;
            y1 = view.selection_area.y1;
            canvas.width  = scale*(x1 - x0);
            canvas.height = scale*(y1 - y0);
        }
        else {
            for(let o of view.map.canvas_obj_array){
                if(o.flags & CanvasFlag.DELETED) continue;
                if(o.hidinguser && o.hidinguser !== SETTINGS.userid) continue;
                if(o.type == CanvasType.SUBMAP){
                    if(!include_submaps) continue;
                    if(o.flags & CanvasFlag.SUBMAP_IS_MINIMIZED) continue;
                }
                let bbox = get_bbox(o, is_hex);
                if(o.submap){
                    continue;
                }
                if(bbox.x0 == bbox.x1 && bbox.y0 == bbox.y1) continue;
                // if(bbox.y0 < y0) console.log('y0 < y0', bbox, o);
                // if(bbox.x0 < x0) console.log('x0 < x0', bbox, o);
                // if(bbox.x1 > x1) console.log('x1 > x1', bbox, o);
                // if(bbox.y1 > y1) console.log('y1 > y1', bbox, o);

                if(bbox.x0 < x0) x0 = bbox.x0;
                if(bbox.y0 < y0) y0 = bbox.y0;
                if(bbox.x1 > x1) x1 = bbox.x1;
                if(bbox.y1 > y1) y1 = bbox.y1;
            }
            // console.log('x0, y0, x1, y1', x0, y0, x1, y1);

            // add small buffer
            const enum SMALL {BUFFER=12};
            x0 -= SMALL.BUFFER;
            y0 -= SMALL.BUFFER;
            x1 += SMALL.BUFFER;
            y1 += SMALL.BUFFER;
            canvas.width  = scale*(x1 - x0);
            canvas.height = scale*(y1 - y0);
        }
        if(fake_view.map.grid_type & GridType.HEX){
            canvas.height *= HEX_Y_FIX;
            canvas.width += 9;
            y0 *= HEX_Y_FIX;
        }
        fake_view.camera_x = -x0;
        fake_view.camera_y = -y0;
        fake_view.scale = scale;
        fake_view.selection_area.is_selecting = false;
        let ctx = canvas.getContext('2d', {alpha:true})!;
        let flags = 0;
        if(include_submaps) flags |= RenderFlags.DRAW_SUBMAPS;
        if(darkmode) flags |= RenderFlags.DARK_MODE;
        if(draw_text) flags |= RenderFlags.DRAW_TEXT;
        actually_render(0, ctx, fake_view, flags);
        canvas.toBlob(function(b:Blob|null){
            if(!b) return;
            let a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = `${view.map.map_name}.png`;
            a.click();
        }, 'image/png', 1);
    };
    dialog.show();
}
function screenshot(){
    screenshot_canvas(get_active_view());
}

function actually_render(timestamp:DOMHighResTimeStamp, ctx:CanvasRenderingContext2D, view:DungeonMapView, flags:RenderFlags):void{
    const draw_submaps = !!(flags & RenderFlags.DRAW_SUBMAPS);
    // console.log('render', performance.now());
    const before = flags & RenderFlags.SHOW_FPS?performance.now():0;
    // console.log('ctx?', !!ctx);
    ctx.imageSmoothingQuality = 'medium';
    view.resize.handles = [];
    view.action.areas = [];
    const map = view.map;
    sort_canv_objs(map);
    if(view.selection_area.is_selecting){
        view.selected.clear();
        note_selections(view);
    }
    const draw_text = !!(flags & RenderFlags.DRAW_TEXT);
    const is_darkmode = !!(flags & RenderFlags.DARK_MODE);
    const background = is_darkmode? '#333333' : '#ffffff';
    const cvs_bg = map.bg_color.length? map.bg_color : background;
    const SELECTED_COLOR = '#33ffdd';
    const COULD_SELECT_COLOR = '#aaccaa';
    const hovered_id = view.hovered_id;
    const canvas_obj_array = map.canvas_obj_array;
    const canvas_objs = map.canvas_objs;
    const selected = view.selected;
    const camera_x = view.camera_x;
    const camera_y = view.camera_y;
    const scale = view.scale;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = cvs_bg;
    ctx.fillRect(0, 0, width, height);
    const SCALE = scale;
    const BACKGROUND = background;
    const canvas_bbox = {
        // The 10s are so we can be sloppy with canvas/object intersection and
        // still draw things on the edge of the map properly.
        x0:-camera_x-10,
        y0:-camera_y-10,
        x1:-camera_x+width/scale+10,
        y1:-camera_y+height/scale+10,
    };
    if(map.grid_type & GridType.HEX){
        canvas_bbox.y0 *= HEX_Y_FIX_INV;
        canvas_bbox.y1 *= HEX_Y_FIX_INV;
    }
    // TAG renderTILES
    {
        const bgtiles: Array<FilledTile> = [];
        const terraintiles: Array<TerrainTile> = [];
        const length = canvas_obj_array.length;
        for(let i = 0; i < length; ++i){
            const obj = canvas_obj_array[i];
            if(obj.flags & CanvasFlag.DELETED)
                continue;
            if(obj.hidinguser && obj.hidinguser != SETTINGS.userid)
                continue;
            if(obj.type == CanvasType.FILLED_TILE){
                bgtiles.push(obj);
                continue;
            }
            if(obj.type == CanvasType.TERRAIN_TILE){
                terraintiles.push(obj);
                continue;
            }
        }
        ctx.scale(SCALE, SCALE);
        ctx.translate(camera_x, camera_y);
        ctx.font = 12 + 'px sans-serif';
        ctx.textBaseline = 'bottom';
        ctx.textAlign = 'center';
        // draw hex version of map
        if(map.grid_type & GridType.HEX){
            ctx.scale(1, HEX_Y_FIX);
            const half = REFERENCE.WIDTH/2;
            const full = REFERENCE.WIDTH;
            const p = new Path2D();
            p.moveTo(-9, half);
            p.lineTo(+9, full);
            p.lineTo(REFERENCE.WIDTH-9, full);
            p.lineTo(REFERENCE.WIDTH+9, half);
            p.lineTo(REFERENCE.WIDTH-9, 0);
            p.lineTo(+9, 0);
            p.closePath();
            for(let obj of bgtiles){
                const bbox = {
                    x0:obj.base_x-9,
                    y0:obj.base_y,
                    x1:obj.base_x+REFERENCE.WIDTH+9,
                    y1:obj.base_y+REFERENCE.WIDTH,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
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
            for(let obj of terraintiles){
                const bbox = {
                    x0:obj.base_x-9,
                    y0:obj.base_y,
                    x1:obj.base_x+REFERENCE.WIDTH+9,
                    y1:obj.base_y+REFERENCE.WIDTH,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    continue;
                }
                ctx.save();
                const is_selected = selected.has(obj.id);
                const info = TERRAIN_BY_ID.get(obj.terrain_id);
                if(info){
                    if(is_selected)
                        ctx.fillStyle = SELECTED_COLOR;
                    else
                        ctx.fillStyle = info[2];
                    ctx.translate(obj.base_x, obj.base_y);
                    ctx.fill(p);
                    if(info[5]){
                        ctx.save();
                        ctx.translate(4, 4);
                        ctx.scale(56/250, 56/250);
                        ctx.drawImage(PACKEDIMG, info[3], info[4], info[5], info[6], 0, 0, 250, 250);
                        ctx.restore();
                    }
                    if(map.flags & MapFlags.NUMBERED){
                        if(info[2] == '#000000')
                            ctx.fillStyle = '#ffffff';
                        else
                            ctx.fillStyle = '#000000';
                        ctx.fillText(`${obj.base_x>>6},${obj.base_y>>6}`, 32, 63);
                    }
                }
                ctx.restore();
            }
        }
        else {
            for(let obj of bgtiles){
                const size = obj.size? obj.size: 1;
                const bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+REFERENCE.WIDTH*size,
                    y1:obj.base_y+REFERENCE.WIDTH*size,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    continue;
                }
                const is_selected = selected.has(obj.id);
                if(is_selected)
                    ctx.fillStyle = SELECTED_COLOR;
                else
                    ctx.fillStyle = obj.color;
                ctx.fillRect(obj.base_x, obj.base_y, REFERENCE.WIDTH*size, REFERENCE.WIDTH*size);
            }
            for(let obj of terraintiles){
                const bbox = {
                    x0:obj.base_x,
                    y0:obj.base_y,
                    x1:obj.base_x+REFERENCE.WIDTH,
                    y1:obj.base_y+REFERENCE.WIDTH,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    continue;
                }
                const is_selected = selected.has(obj.id);
                const info = TERRAIN_BY_ID.get(obj.terrain_id);
                if(info){
                    if(is_selected)
                        ctx.fillStyle = SELECTED_COLOR;
                    else
                        ctx.fillStyle = info[2]
                    ctx.fillRect(obj.base_x, obj.base_y, REFERENCE.WIDTH, REFERENCE.WIDTH);
                    if(info[5]){
                        ctx.drawImage(PACKEDIMG, info[3], info[4], info[5], info[6], obj.base_x, obj.base_y, 64, 64);
                    }
                    if(map.flags & MapFlags.NUMBERED){
                        if(info[2] == '#000000')
                            ctx.fillStyle = '#ffffff';
                        else
                            ctx.fillStyle = '#000000';
                        ctx.fillText(`${obj.base_x>>6},${obj.base_y>>6}`, obj.base_x+32, obj.base_y+64);
                    }
                }
            }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.scale(SCALE, SCALE);
    // TAG renderGRID
    ctx.fillStyle = map.grid_color.length?map.grid_color:'rgb(150, 150, 150)';
    if(map.grid_type & GridType.NOGRID){
    }
    else if(map.grid_type & GridType.HEX){
        function draw_hex_grid(){
            let grid_base_y = fmod(camera_y*HEX_Y_FIX_INV, REFERENCE.WIDTH);
            let grid_base_x = fmod(camera_x, REFERENCE.WIDTH*2);
            ctx.lineWidth = 1;
            // ctx.strokeStyle = '#000000';
            ctx.strokeStyle = map.grid_color.length?map.grid_color:'#888888';
            grid_base_x -= REFERENCE.WIDTH;
            const half = REFERENCE.WIDTH/2;
            const full = REFERENCE.WIDTH;
            const p = new Path2D();
            p.moveTo(-9, -half);
            let n_y = Math.ceil(height/SCALE/REFERENCE.WIDTH)+3;
            for(let i = 0; i < n_y; i++){
                p.lineTo(-9, i*full-half);
                p.lineTo(+9, i*full);
                p.lineTo(-9+full, i*full);
                p.lineTo(+9, i*full);
            }
            ctx.save();
            ctx.translate(grid_base_x-3*full, grid_base_y-full);
            let n_x = Math.ceil(width/SCALE/REFERENCE.WIDTH)+3;
            for(let i = 0; i < n_x; i++){
                ctx.translate(full, -half);
                ctx.stroke(p);
                ctx.translate(full, +half);
                ctx.stroke(p);
            }
            ctx.restore();
            if(map.flags & MapFlags.BIG_HEX){
                let big_base_y = fmod(camera_y*HEX_Y_FIX_INV, 6*REFERENCE.WIDTH);
                let big_base_x = fmod(camera_x, 6*REFERENCE.WIDTH*2);
                ctx.lineWidth = 4;
                big_base_x -= 5.3333*REFERENCE.WIDTH;
                const half = 6*REFERENCE.WIDTH/2;
                const full = 6*REFERENCE.WIDTH;
                const p = new Path2D();
                p.moveTo(-76, -half);
                let n_y = Math.ceil(height/SCALE/REFERENCE.WIDTH/6)+3;
                for(let i = 0; i < n_y; i++){
                    p.lineTo(-76, i*full-half);
                    p.lineTo(+54, i*full);
                    p.lineTo(-76+full, i*full);
                    p.lineTo(+54, i*full);
                }
                ctx.save();
                ctx.translate(big_base_x-2*full+1, big_base_y-full);
                let n_x = Math.ceil(width/SCALE/REFERENCE.WIDTH/6)+3;
                for(let i = 0; i < n_x; i++){
                    ctx.translate(full, -half);
                    ctx.stroke(p);
                    ctx.translate(full, +half);
                    ctx.stroke(p);
                }
                ctx.restore();
            }
        }
        ctx.save();
        ctx.scale(1, HEX_Y_FIX);
        draw_hex_grid();
        ctx.restore();
    }
    else if(gridscale == GRIDSCALE.FIVE){
        let grid_base_x = fmod(camera_x, REFERENCE.HALF_WIDTH);
        let grid_base_y = fmod(camera_y, REFERENCE.HALF_WIDTH);
        let grid_max_x = width/SCALE;
        let grid_max_y = height/SCALE;
        for(let x = grid_base_x; x < grid_max_x; x+= REFERENCE.HALF_WIDTH){
            ctx.fillRect(x, 0, 0.5, height/SCALE);
        }
        for(let y = grid_base_y; y < grid_max_y; y+= REFERENCE.HALF_WIDTH){
            ctx.fillRect(0, y, width/SCALE, 0.5);
        }
    }
    else{
        let grid_base_x = fmod(camera_x, REFERENCE.WIDTH);
        let grid_base_y = fmod(camera_y, REFERENCE.WIDTH);
        let grid_max_x = width/SCALE;
        let grid_max_y = height/SCALE;
        for(let x = grid_base_x; x < grid_max_x; x+= REFERENCE.WIDTH){
            ctx.fillRect(x, 0, 1, height/SCALE);
        }
        for(let y = grid_base_y; y < grid_max_y; y+= REFERENCE.WIDTH){
            ctx.fillRect(0, y, width/SCALE, 1);
        }
    }
    ctx.translate(camera_x, camera_y);
    if(map.grid_type & GridType.HEX)
        ctx.scale(1, HEX_Y_FIX);
    let length = canvas_obj_array.length;
    function draw_status_icons(token_bbox: Bbox, statusflags: TokenStatusFlags, scale:number){
        const enum STATUSICONSIZE {_ = 24};
        let sx = token_bbox.x0;
        let sy = token_bbox.y1-STATUSICONSIZE._*scale;
        if(!PACKED)
            return;
        for(let i = 0; i < PACKED.status_icons.length; i++){
            const flag = 1 << i;
            if(!(statusflags & flag))
                continue;
            const si = PACKED.status_icons[i];
            ctx.drawImage(PACKEDIMG, si[2], si[3], si[4], si[5], sx, sy, STATUSICONSIZE._*scale, STATUSICONSIZE._*scale);
            sx += STATUSICONSIZE._*scale;
            if(sx >= token_bbox.x1){
                sx = token_bbox.x0;
                sy -= STATUSICONSIZE._*scale;
            }
        }
    }
    const one_selection = selected.size == 1;
    // TAG renderOBJECTS
    for(let i = 0; i < length; ++i){
        let obj = canvas_obj_array[i];
        if(obj.flags & CanvasFlag.DELETED)
            continue;
        if(obj.hidinguser && obj.hidinguser != SETTINGS.userid)
            continue;
        let bx = obj.base_x;
        let by = obj.base_y;
        let is_hidden = obj.hidinguser != 0;
        if(obj.submap){
            if(!draw_submaps) continue;
            const sm = canvas_objs.get(obj.submap)! as SubMap;
            if(sm.flags & (CanvasFlag.SUBMAP_IS_MINIMIZED | CanvasFlag.DELETED))
                continue;
            if(sm.hidinguser && sm.hidinguser != SETTINGS.userid)
                continue;
            if(sm.hidinguser)
                is_hidden = true;
            bx += sm.base_x + sm.tlx;
            by += sm.base_y + sm.tly;
        }
        let is_selected = selected.has(obj.id);
        const is_hovered = obj.id == hovered_id;
        const sel_color = is_selected?SELECTED_COLOR:COULD_SELECT_COLOR;
        if(is_hovered)
            is_selected = true;
        ctx.globalAlpha = is_hidden? 0.5 : 1;
        switch(obj.type){
            case CanvasType.FREEHAND_LINE:{ // TAG renderFREEHAND_LINE
                // This works well enough for now.
                // If things get hairy, I could build a quadtree or whatever.
                const line_bbox = {
                    x0:obj.bbox.x0 + bx,
                    y0:obj.bbox.y0 + by,
                    x1:obj.bbox.x1 + bx,
                    y1:obj.bbox.y1 + by,
                };
                if(!bbox_overlaps(canvas_bbox, line_bbox)){
                    break;
                }
                if(obj.last_bx !== bx || obj.last_by !== by)
                    obj.path = undefined;
                if(!obj.path){
                    obj.last_bx = bx;
                    obj.last_by = by;
                    freehand_recalculate_path(obj, bx, by);
                }
                const oldcap = ctx.lineCap;
                const oldjoin = ctx.lineJoin;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                if(is_selected){
                    ctx.lineWidth=obj.thickness+4;
                    ctx.strokeStyle = sel_color;
                    ctx.stroke(obj.path!);
                }
                ctx.lineWidth = obj.thickness;
                ctx.strokeStyle = obj.color;
                ctx.stroke(obj.path!);
                ctx.lineCap = oldcap;
                ctx.lineJoin = oldjoin;
            }break;
            case CanvasType.GRID_LINE:{ // TAG renderGRID_LINE
                const line_bbox = {
                    x0:obj.bbox.x0 + bx,
                    y0:obj.bbox.y0 + by,
                    x1:obj.bbox.x1 + bx,
                    y1:obj.bbox.y1 + by,
                };
                if(!bbox_overlaps(canvas_bbox, line_bbox)){
                    break;
                }
                // TODO: delete incomplete objects that are canceled.
                const oldcap = ctx.lineCap;
                const oldjoin = ctx.lineJoin;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                if(obj.last_bx !== bx || obj.last_by !== by)
                    obj.path = undefined;
                if(!obj.path){
                    obj.last_bx = bx;
                    obj.last_by = by;
                    gridline_recalculate_path(obj, bx, by);
                }
                if(is_selected){
                    ctx.lineWidth=12;
                    ctx.strokeStyle = sel_color;
                    ctx.stroke(obj.path!);
                }
                ctx.lineWidth = 6;
                ctx.strokeStyle = obj.color;
                ctx.stroke(obj.path!);
                ctx.lineCap = oldcap;
                ctx.lineJoin = oldjoin;
            }break;
            case CanvasType.ELLIPSE:{ // TAG renderELLIPSE
                const bbox = {
                    x0:bx,
                    y0:by,
                    x1:bx+obj.width,
                    y1:by+obj.height,
                };
                if(!bbox_overlaps(bbox, canvas_bbox))
                    break;
                const cx = bx+obj.width/2;
                const cy = by+obj.height/2;
                if(obj.width && obj.height){
                    if(is_selected){
                        ctx.lineWidth=8;
                        ctx.strokeStyle = sel_color;
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
                    if(one_selection && selected.has(obj.id)){
                        ctx.fillStyle = sel_color;
                        ctx.fillRect(bbox.x0-10, bbox.y0-10, 20, 20);
                        ctx.fillRect(bbox.x1-10, bbox.y1-10, 20, 20);
                        view.resize.handles.push({
                            bbox: { x0: bbox.x0-10, y0: bbox.y0-10, x1: bbox.x0+10, y1: bbox.y0+10, },
                            obj_id: obj.id,
                            topleft:true,
                        });
                        view.resize.handles.push({
                            bbox: { x0: bbox.x1-10, y0: bbox.y1-10, x1: bbox.x1+10, y1: bbox.y1+10, },
                            obj_id: obj.id,
                            topleft:false,
                        });
                    }
                }
            }break;
            case CanvasType.FILLED_RECT:{ // TAG renderFILLED_RECT
                const bbox = {
                    x0:bx,
                    y0:by,
                    x1:bx+obj.width,
                    y1:by+obj.height,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    break;
                }
                if(obj.width && obj.height){
                    if(is_selected){
                        ctx.lineWidth=8;
                        ctx.strokeStyle = sel_color;
                        ctx.strokeRect(bx-2, by-2, obj.width+4, obj.height+4);
                    }
                    ctx.lineWidth=4;
                    ctx.fillStyle = obj.color2;
                    ctx.fillRect(bx, by, obj.width, obj.height);
                    ctx.strokeStyle = obj.color;
                    ctx.strokeRect(bx, by, obj.width, obj.height);
                }
                if(one_selection && selected.has(obj.id)){
                    ctx.fillStyle = sel_color;
                    ctx.fillRect(bbox.x0-10, bbox.y0-10, 20, 20);
                    ctx.fillRect(bbox.x1-10, bbox.y1-10, 20, 20);
                    view.resize.handles.push({
                        bbox: { x0: bbox.x0-10, y0: bbox.y0-10, x1: bbox.x0+10, y1: bbox.y0+10, },
                        obj_id: obj.id,
                        topleft:true,
                    });
                    view.resize.handles.push({
                        bbox: { x0: bbox.x1-10, y0: bbox.y1-10, x1: bbox.x1+10, y1: bbox.y1+10, },
                        obj_id: obj.id,
                        topleft:false,
                    });
                }
            }break;
            case CanvasType.RECT:{ // TAG renderRECT
                const bbox = {
                    x0:bx,
                    y0:by,
                    x1:bx+obj.width,
                    y1:by+obj.height,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    break;
                }
                // if(obj.width && obj.height){
                if(1){
                    if(is_selected){
                        ctx.lineWidth=8;
                        ctx.strokeStyle = sel_color;
                        ctx.strokeRect(bx-2, by-2, obj.width+4, obj.height+4);
                    }
                    ctx.lineWidth=6;
                    ctx.strokeStyle = obj.color;
                    ctx.strokeRect(bx, by, obj.width, obj.height);
                }
                if(one_selection && selected.has(obj.id)){
                    ctx.fillStyle = sel_color;
                    ctx.fillRect(bbox.x0-10, bbox.y0-10, 20, 20);
                    ctx.fillRect(bbox.x1-10, bbox.y1-10, 20, 20);
                    view.resize.handles.push({
                        bbox: { x0: bbox.x0-10, y0: bbox.y0-10, x1: bbox.x0+10, y1: bbox.y0+10, },
                        obj_id: obj.id,
                        topleft:true,
                    });
                    view.resize.handles.push({
                        bbox: { x0: bbox.x1-10, y0: bbox.y1-10, x1: bbox.x1+10, y1: bbox.y1+10, },
                        obj_id: obj.id,
                        topleft:false,
                    });
                }
            }break;
            case CanvasType.GRID_RECT:{ // TAG renderGRID_RECT
                const bbox = {
                    x0:bx,
                    y0:by,
                    x1:bx+obj.width,
                    y1:by+obj.height,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    break;
                }
                if(obj.width && obj.height){
                    if(is_selected){
                        ctx.fillStyle = sel_color;
                        ctx.fillRect(bx-2, by-2, obj.width+4, obj.height+4);
                    }
                    ctx.fillStyle = obj.color;
                    ctx.fillRect(bx-0.5, by-0.5, obj.width+1, obj.height+1);
                }
                if(one_selection && selected.has(obj.id)){
                    ctx.fillStyle = sel_color;
                    ctx.fillRect(bbox.x0-10, bbox.y0-10, 20, 20);
                    ctx.fillRect(bbox.x1-10, bbox.y1-10, 20, 20);
                    view.resize.handles.push({
                        bbox: { x0: bbox.x0-10, y0: bbox.y0-10, x1: bbox.x0+10, y1: bbox.y0+10, },
                        obj_id: obj.id,
                        topleft:true,
                    });
                    view.resize.handles.push({
                        bbox: { x0: bbox.x1-10, y0: bbox.y1-10, x1: bbox.x1+10, y1: bbox.y1+10, },
                        obj_id: obj.id,
                        topleft:false,
                    });
                }
            }break;
            case CanvasType.TEXT:{ // TAG renderTEXT
                if(!draw_text) continue;
                if(obj.text){
                    let y_off = 0;
                    ctx.font = obj.size + 'px sans-serif';
                    ctx.textBaseline = 'middle';
                    switch(obj.alignment){
                        case TextAlignment.LEFT:
                            ctx.textAlign = 'left';
                            break;
                        case TextAlignment.CENTER:
                            ctx.textAlign = 'center';
                            break;
                        case TextAlignment.RIGHT:
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
                                case TextAlignment.LEFT:
                                    bbox.x0 = -2;
                                    bbox.x1 = width+2;
                                    break;
                                case TextAlignment.CENTER:
                                    bbox.x0 = -width/2-2;
                                    bbox.x1 = width/2+2;
                                    break;
                                case TextAlignment.RIGHT:
                                    bbox.x0 = -width-2;
                                    bbox.x1 = 2;
                                    break;
                            }
                            bbox.y0 = -height/2 + y_off-2;
                            bbox.y1 = height/2 + y_off+2;
                        }
                        const text_bbox = {
                            x0:bbox.x0 + bx,
                            y0:bbox.y0 + by,
                            x1:bbox.x1 + bx,
                            y1:bbox.y1 + by,
                        };
                        if(bbox_overlaps(text_bbox, canvas_bbox)){
                            if(is_selected)
                                ctx.fillStyle = sel_color+'cc';
                            else
                                ctx.fillStyle = BACKGROUND + '88';
                            if(is_selected || (obj.flags & CanvasFlag.TEXT_HAS_BACKGROUND)){
                            const x = bx+bbox.x0;
                            const y = by+bbox.y0;
                            const width = bbox.x1-bbox.x0;
                            const height = bbox.y1-bbox.y0;
                            ctx.fillRect(x, y, width, height);
                            }
                            if(is_darkmode){
                                if(obj.map_id != -1){
                                    ctx.fillStyle = '#99f';
                                }
                                else
                                    ctx.fillStyle = '#fff';
                            }
                            else{
                                if(obj.map_id != -1){
                                    if(obj.flags & CanvasFlag.TEXT_LINKS_TO_SUBMAP)
                                        ctx.fillStyle = '#282';
                                    else
                                        ctx.fillStyle = '#44f';
                                }
                                else
                                    ctx.fillStyle = '#000';
                            }
                            ctx.fillText(line, bx, by+y_off);
                            if(obj.map_id != -1){
                                ctx.fillRect(bx+bbox.x0, by+bbox.y1-1, bbox.x1-bbox.x0, 2);
                            }
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
                    if(obj.map_id != -1)
                        for(let bb of obj.bboxes){
                            view.action.areas.push({
                                bbox:{x0:bb.x0+bx, y0:bb.y0+by, x1:bb.x1+bx, y1:bb.y1+by},
                                obj_id:obj.id,
                                action: 0,
                            });
                        }
                }
            }break;
            case CanvasType.EZ_TOKEN:{ // TAG renderEZ_TOKEN
                // TODO: currently we don't consider radius_y
                const radius_x = obj.width*REFERENCE.WIDTH/2;
                const radius_y = obj.height*REFERENCE.WIDTH/2;
                if(!radius_x || !radius_y)
                    continue;
                const token_bbox = {
                    x0: bx,
                    x1: bx + 2*radius_x,
                    y0: by,
                    y1: by + 2*radius_y,
                };
                if(!bbox_overlaps(token_bbox, canvas_bbox)){
                    break;
                }
                if(is_selected){
                    ctx.beginPath();
                    ctx.fillStyle = sel_color;
                    if(radius_x == radius_y)
                        ctx.arc(bx+radius_x, by+radius_y, radius_x+4, 0, 2*Math.PI);
                    else
                        ctx.ellipse(bx+radius_x, by+radius_y, radius_x+4, radius_y+4, 0, 0, 2*Math.PI);
                    ctx.fill();
                }
                ctx.beginPath();
                ctx.fillStyle = '#000';
                if(radius_x == radius_y)
                    ctx.arc(bx+radius_x, by+radius_y, radius_x, 0, 2*Math.PI);
                else
                    ctx.ellipse(bx+radius_x, by+radius_y, radius_x, radius_y, 0, 0, 2*Math.PI);
                ctx.fill();
                ctx.beginPath();
                ctx.fillStyle = obj.color;
                if(radius_x == radius_y)
                    ctx.arc(bx+radius_x, by+radius_y, radius_x-2, 0, 2*Math.PI);
                else
                    ctx.ellipse(bx+radius_x, by+radius_y, radius_x-2, radius_y-2, 0, 0, 2*Math.PI);
                ctx.fill();
                ctx.font = "" + ((18 * obj.width)|0) + 'px sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = "center";
                ctx.fillStyle = '#000';
                ctx.fillText(obj.text, bx+radius_x, by+radius_y);
                draw_status_icons(token_bbox, obj.statusflags, obj.width);
            }break;
            case CanvasType.IMAGE:{ // TAG renderIMAGE
                const bbox = {
                    x0:bx,
                    y0:by,
                    x1:bx+obj.width,
                    y1:by+obj.height,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    break;
                }
                if(is_selected){
                    ctx.fillStyle = sel_color+'aa';
                    ctx.fillRect(bx-4, by-4, obj.width+8, obj.height+8);
                }
                if(obj.img)
                    ctx.drawImage(obj.img, bx, by, obj.width, obj.height);
                else {
                    ctx.fillStyle = '#ff0000';
                    ctx.fillRect(bx, by, obj.width, obj.height);
                    ctx.fillStyle = '#000000';
                    ctx.fillText(`broken image url: ${obj.url}`, bx+32, by+32);
                }
                if(one_selection && selected.has(obj.id)){
                    ctx.fillStyle = sel_color;
                    ctx.fillRect(bbox.x0-10, bbox.y0-10, 20, 20);
                    ctx.fillRect(bbox.x1-10, bbox.y1-10, 20, 20);
                    view.resize.handles.push({
                        bbox: { x0: bbox.x0-10, y0: bbox.y0-10, x1: bbox.x0+10, y1: bbox.y0+10, },
                        obj_id: obj.id,
                        topleft:true,
                    });
                    view.resize.handles.push({
                        bbox: { x0: bbox.x1-10, y0: bbox.y1-10, x1: bbox.x1+10, y1: bbox.y1+10, },
                        obj_id: obj.id,
                        topleft:false,
                    });
                }
            }break;
            case CanvasType.IMG_TOKEN:{ // TAG renderIMG_TOKEN
                // TODO: currently we don't consider radius_y
                const radius_x = obj.width*REFERENCE.WIDTH/2;
                const radius_y = obj.height*REFERENCE.WIDTH/2;
                const token_bbox = {
                    x0: bx,
                    x1: bx + 2*radius_x,
                    y0: by,
                    y1: by + 2*radius_y,
                };
                if(!bbox_overlaps(token_bbox, canvas_bbox)){
                    break;
                }
                if(is_selected){
                    ctx.beginPath();
                    ctx.lineWidth = 4;
                    ctx.strokeStyle = sel_color;
                    ctx.arc(bx+radius_x, by+radius_y, radius_x+2, 0, 2*Math.PI);
                    ctx.stroke();
                }
                ctx.beginPath();
                ctx.lineWidth = 4;
                ctx.strokeStyle = '#000';
                ctx.arc(bx+radius_x, by+radius_y, radius_x-2, 0, 2*Math.PI);
                ctx.stroke();
                if(obj.img){
                    ctx.drawImage(obj.img, bx, by, radius_x*2, radius_y*2);
                }
                else {
                    ctx.beginPath();
                    ctx.fillStyle = '#333333';
                    ctx.arc(bx+radius_x, by+radius_y, radius_x-4, 0, 2*Math.PI);
                    ctx.fill();
                }
                draw_status_icons(token_bbox, obj.statusflags, obj.width);
            }break;
            case CanvasType.DOOR:{ // TAG renderDOOR
                const is_vertical = obj.orientation === Orientation.VERTICAL;
                const w = obj.width;
                const th = obj.width < 1.0? 0.5 : 1.0;
                if(!is_vertical){
                    // FIXME: I just hardcoded some random values.
                    const bbox = {
                        x0 : bx - 32 * w,
                        x1 : bx + 32 * w,
                        y0 : by - 5,
                        y1 : by +5,
                    };
                    if(!bbox_overlaps(bbox, canvas_bbox)){
                        break;
                    }
                }
                else {
                    // FIXME: I just hardcoded some random values.
                    const bbox = {
                        x0 : bx - 5,
                        x1 : bx + 5,
                        y0 : by - 32 * w,
                        y1 : by + 32 * w,
                    };
                    if(!bbox_overlaps(bbox, canvas_bbox)){
                        break;
                    }
                }
                switch(obj.doortype){
                    case DoorType.DOUBLE:{
                        const length = REFERENCE.WIDTH*w - 16*th;
                        const off = length/2;
                        if(is_selected){
                            ctx.strokeStyle = sel_color;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case Orientation.VERTICAL:
                                    ctx.strokeRect(bx-10*th, by-off, 20*th, length);
                                    break;
                                case Orientation.HORIZONTAL:
                                    ctx.strokeRect(bx-off, by-10*th, length, 20*th);
                                    break;
                                case Orientation.TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(bx-22*w, by-22*w)
                                    ctx.lineTo(bx+22*w, by+22*w);
                                    ctx.stroke();
                                    break;
                                case Orientation.TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(bx+22*w, by-22*w)
                                    ctx.lineTo(bx-22*w, by+22*w);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.fillStyle = BACKGROUND;
                        ctx.strokeStyle = obj.color;
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case Orientation.VERTICAL:
                                ctx.fillRect(bx-10*th, by-off, 20*th, length);
                                ctx.strokeRect(bx-10*th, by-off, 20*th, length);
                                ctx.strokeRect(bx-10*th, by, 20*th, 1);
                                break;
                            case Orientation.HORIZONTAL:
                                ctx.fillRect(bx-off, by-10*th, length, 20*th);
                                ctx.strokeRect(bx-off, by-10*th, length, 20*th);
                                ctx.strokeRect(bx, by-10*th, 1, 20*th);
                                break;
                            case Orientation.TOPLEFT_DOWNRIGHT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(bx-20*w, by-20*w)
                                ctx.lineTo(bx+20*w, by+20*w);
                                ctx.stroke();
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(bx-16*w, by-16*w)
                                ctx.lineTo(bx-2*w, by-2*w);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(bx+2*w, by+2*w)
                                ctx.lineTo(bx+16*w, by+16*w);
                                ctx.stroke();
                                break;
                            case Orientation.TOPRIGHT_DOWNLEFT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(bx+20*w, by-20*w)
                                ctx.lineTo(bx-20*w, by+20*w);
                                ctx.stroke();
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(bx+16*w, by-16*w)
                                ctx.lineTo(bx+2*w, by-2*w);
                                ctx.stroke();
                                ctx.beginPath();
                                ctx.moveTo(bx-2*w, by+2*w)
                                ctx.lineTo(bx-16*w, by+16*w);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DoorType.DOOR:{
                        const length = REFERENCE.WIDTH*w - 16*th;
                        const off = length/2;
                        if(is_selected){
                            ctx.strokeStyle = sel_color;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case Orientation.VERTICAL:
                                    ctx.strokeRect(bx-10*th, by-off, 20*th, length);
                                    break;
                                case Orientation.HORIZONTAL:
                                    ctx.strokeRect(bx-off, by-10*th, length, 20*th);
                                    break;
                                case Orientation.TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(bx-22*w, by-22*w)
                                    ctx.lineTo(bx+22*w, by+22*w);
                                    ctx.stroke();
                                    break;
                                case Orientation.TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(bx+22*w, by-22*w)
                                    ctx.lineTo(bx-22*w, by+22*w);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.fillStyle = BACKGROUND;
                        ctx.strokeStyle = obj.color;
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case Orientation.VERTICAL:
                                ctx.fillRect(bx-10*th, by-off, 20*th, length);
                                ctx.strokeRect(bx-10*th, by-off, 20*th, length);
                                break;
                            case Orientation.HORIZONTAL:
                                ctx.fillRect(bx-off, by-10*th, length, 20*th);
                                ctx.strokeRect(bx-off, by-10*th, length, 20*th);
                                break;
                            case Orientation.TOPLEFT_DOWNRIGHT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(bx-20*w, by-20*w)
                                ctx.lineTo(bx+20*w, by+20*w);
                                ctx.stroke();
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(bx-16*w, by-16*w)
                                ctx.lineTo(bx+16*w, by+16*w);
                                ctx.stroke();
                                break;
                            case Orientation.TOPRIGHT_DOWNLEFT:
                                ctx.lineWidth=18;
                                ctx.beginPath();
                                ctx.moveTo(bx+20*w, by-20*w)
                                ctx.lineTo(bx-20*w, by+20*w);
                                ctx.stroke();
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(bx+16*w, by-16*w)
                                ctx.lineTo(bx-16*w, by+16*w);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DoorType.PORTCULLIS:{
                        if(is_selected){
                            ctx.strokeStyle = sel_color;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case Orientation.VERTICAL:
                                    ctx.strokeRect(bx-10*th, by-16*w, 20*th, 32*w);
                                    break;
                                case Orientation.HORIZONTAL:
                                    ctx.strokeRect(bx-16*w, by-10*th, 32*w, 20*th);
                                    break;
                                case Orientation.TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(bx-22*w, by-22*w)
                                    ctx.lineTo(bx+22*w, by+22*w);
                                    ctx.stroke();
                                    break;
                                case Orientation.TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(bx+22*w, by-22*w)
                                    ctx.lineTo(bx-22*w, by+22*w);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        const length = REFERENCE.WIDTH*w;
                        ctx.strokeStyle = BACKGROUND;
                        ctx.lineWidth=12;
                        ctx.setLineDash([6, 4]);
                        ctx.beginPath();
                        switch(obj.orientation){
                            case Orientation.VERTICAL:
                                ctx.moveTo(bx, by-length/2+8);
                                ctx.lineTo(bx, by+length/2-6);
                                break;
                            case Orientation.HORIZONTAL:
                                ctx.moveTo(bx-length/2+8, by);
                                ctx.lineTo(bx+length/2-6, by);
                                break;
                            case Orientation.TOPLEFT_DOWNRIGHT:
                                ctx.moveTo(bx-16*w, by-16*w)
                                ctx.lineTo(bx+16*w, by+16*w);
                                break;
                            case Orientation.TOPRIGHT_DOWNLEFT:
                                ctx.moveTo(bx+16*w, by-16*w)
                                ctx.lineTo(bx-16*w, by+16*w);
                                break;
                        }
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }break;
                    case DoorType.PORTAL:{
                        if(is_selected){
                            ctx.strokeStyle = sel_color;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case Orientation.VERTICAL:
                                    ctx.strokeRect(bx-10, by-16*th, 20, 32*th);
                                    break;
                                case Orientation.HORIZONTAL:
                                    ctx.strokeRect(bx-16*th, by-10, 32*th, 20);
                                    break;
                                case Orientation.TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(bx-22*th, by-22*th)
                                    ctx.lineTo(bx+22*th, by+22*th);
                                    ctx.stroke();
                                    break;
                                case Orientation.TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(bx+22*th, by-22*th)
                                    ctx.lineTo(bx-22*th, by+22*th);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        const thingy = th * 13;
                        const length = 64*w-thingy*2;
                        ctx.fillStyle = BACKGROUND;
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case Orientation.VERTICAL:
                                ctx.fillRect(bx-5, by-length/2, 10, length);
                                if((bx & (REFERENCE.WIDTH-1)) == 0){
                                    ctx.fillStyle = 'rgb(150, 150, 150)';
                                    ctx.fillRect(bx, by-length/2, 1/SCALE, length);
                                }
                                break;
                            case Orientation.HORIZONTAL:
                                ctx.fillRect(bx-length/2, by-5, length, 10);
                                if((by & (REFERENCE.WIDTH-1)) == 0){
                                    ctx.fillStyle = 'rgb(150, 150, 150)';
                                    ctx.fillRect(bx-length/2, by, length, 1/SCALE);
                                }
                                break;
                            case Orientation.TOPLEFT_DOWNRIGHT:
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(bx-24*w, by-24*w)
                                ctx.lineTo(bx+24*w, by+24*w);
                                ctx.stroke();
                                break;
                            case Orientation.TOPRIGHT_DOWNLEFT:
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(bx+16*w, by-16*w)
                                ctx.lineTo(bx-16*w, by+16*w);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DoorType.HALLWAY:{
                        if(is_selected){
                            ctx.strokeStyle = sel_color;
                            ctx.lineWidth=8;
                            switch(obj.orientation){
                                case Orientation.VERTICAL:
                                    ctx.strokeRect(bx-10, by-32*w, 20, 64*w);
                                    break;
                                case Orientation.HORIZONTAL:
                                    ctx.strokeRect(bx-32*w, by-10, 64*w, 20);
                                    break;
                                case Orientation.TOPLEFT_DOWNRIGHT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(bx-32*w, by-32*w)
                                    ctx.lineTo(bx+32*w, by+32*w);
                                    ctx.stroke();
                                    break;
                                case Orientation.TOPRIGHT_DOWNLEFT:
                                    ctx.lineWidth=22;
                                    ctx.beginPath();
                                    ctx.moveTo(bx+32*w, by-32*w)
                                    ctx.lineTo(bx-32*w, by+32*w);
                                    ctx.stroke();
                                    break;
                            }
                        }
                        ctx.fillStyle = BACKGROUND;
                        ctx.lineWidth=4;
                        switch(obj.orientation){
                            case Orientation.VERTICAL:
                                ctx.fillRect(bx-5, by-32*w+3, 10, 64*w-6);
                                if((bx & (REFERENCE.WIDTH-1)) == 0){
                                    ctx.fillStyle = 'rgb(150, 150, 150)';
                                    ctx.fillRect(bx, by-32*w+3, 1/SCALE, 64*w-6);
                                }
                                break;
                            case Orientation.HORIZONTAL:
                                ctx.fillRect(bx-32*w+3, by-5, 64*w-6, 10);
                                if((by & (REFERENCE.WIDTH-1)) == 0){
                                    ctx.fillStyle = 'rgb(150, 150, 150)';
                                    ctx.fillRect(bx-32*w+3, by, 64*w-6, 1/SCALE);
                                }
                                break;
                            case Orientation.TOPLEFT_DOWNRIGHT:
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(bx-28*w, by-28*w)
                                ctx.lineTo(bx+28*w, by+28*w);
                                ctx.stroke();
                                break;
                            case Orientation.TOPRIGHT_DOWNLEFT:
                                ctx.strokeStyle = BACKGROUND;
                                ctx.lineWidth=10;
                                ctx.beginPath();
                                ctx.moveTo(bx+28*w, by-28*w)
                                ctx.lineTo(bx-28*w, by+28*w);
                                ctx.stroke();
                                break;
                        }
                    }break;
                    case DoorType.CURTAINS:{
                        if(is_selected){
                            ctx.strokeStyle = sel_color;
                            ctx.lineWidth=4;
                            const r = 8;
                            switch(obj.orientation){
                                case Orientation.VERTICAL:
                                    for(let y = by-REFERENCE.WIDTH*w/2+r, i=0; y < by+REFERENCE.WIDTH*w/2+r; y+= 2*r, i++){
                                        ctx.beginPath();
                                        ctx.arc(bx, y, r, Math.PI/2, 3*Math.PI/2, !!(i & 1));
                                        ctx.stroke();
                                    }
                                    break;
                                case Orientation.HORIZONTAL:
                                    for(let x = bx-REFERENCE.WIDTH*w/2+r, i=0; x < bx+REFERENCE.WIDTH*w/2+r; x+= 2*r, i++){
                                        ctx.beginPath();
                                        ctx.arc(x, by, r, 0, Math.PI, !!(i & 1));
                                        ctx.stroke();
                                    }
                                    break;
                                case Orientation.TOPLEFT_DOWNRIGHT:{
                                    let r = 64*1.4159/12;
                                    for(let d = 0, i=0; i < w*6; d+= 2*r/1.4159, i++){
                                        ctx.beginPath();
                                        ctx.arc(bx-REFERENCE.WIDTH/2+d+r/1.41519, by-REFERENCE.WIDTH/2+d+r/1.41519, r, Math.PI/4, 5*Math.PI/4, !!(i & 1));
                                        ctx.stroke();
                                    }
                                }break;
                                case Orientation.TOPRIGHT_DOWNLEFT:{
                                    let r = 64*1.4159/12;
                                    for(let d = 0, i=0; i < w*6; d+= 2*r/1.4159, i++){
                                        ctx.beginPath();
                                        ctx.arc(bx-REFERENCE.WIDTH/2+d+r/1.41519, by+REFERENCE.WIDTH/2-d-r/1.41519, r, 3*Math.PI/4, 7*Math.PI/4, !!(i & 1));
                                        ctx.stroke();
                                    }
                                }break;
                            }
                        }
                        ctx.strokeStyle = '#444';
                        ctx.lineWidth=2;
                        const r = 8;
                        switch(obj.orientation){
                            case Orientation.VERTICAL:
                                for(let y = by-REFERENCE.WIDTH*w/2+r, i=0; y < by+REFERENCE.WIDTH*w/2+r; y+= 2*r, i++){
                                    ctx.beginPath();
                                    ctx.arc(bx, y, r, Math.PI/2, 3*Math.PI/2, !!(i & 1));
                                    ctx.stroke();
                                }
                                break;
                            case Orientation.HORIZONTAL:
                                for(let x = bx-REFERENCE.WIDTH*w/2+r, i=0; x < bx+REFERENCE.WIDTH*w/2+r; x+= 2*r, i++){
                                    ctx.beginPath();
                                    ctx.arc(x, by, r, 0, Math.PI, !!(i & 1));
                                    ctx.stroke();
                                }
                                break;
                            case Orientation.TOPLEFT_DOWNRIGHT:{
                                let r = 64*1.4159/12;
                                for(let d = 0, i=0; i < w*6; d+= 2*r/1.4159, i++){
                                    ctx.beginPath();
                                    ctx.arc(bx-REFERENCE.WIDTH/2+d+r/1.41519, by-REFERENCE.WIDTH/2+d+r/1.41519, r, Math.PI/4, 5*Math.PI/4, !!(i & 1));
                                    ctx.stroke();
                                }
                            }break;
                            case Orientation.TOPRIGHT_DOWNLEFT:{
                                let r = 64*1.4159/12;
                                for(let d = 0, i=0; i < w*6; d+= 2*r/1.4159, i++){
                                    ctx.beginPath();
                                    ctx.arc(bx-REFERENCE.WIDTH/2+d+r/1.41519, by+REFERENCE.WIDTH/2-d-r/1.41519, r, 3*Math.PI/4, 7*Math.PI/4, !!(i & 1));
                                    ctx.stroke();
                                }
                            }break;
                        }
                    }break;
                    case DoorType.SECRET:{
                        ctx.save();
                        ctx.textBaseline = 'middle';
                        ctx.textAlign = 'center';
                        ctx.translate(bx, by);
                        switch(obj.orientation){
                            case Orientation.VERTICAL:
                                break;
                            case Orientation.HORIZONTAL:
                                ctx.rotate(Math.PI/2);
                                break;
                            case Orientation.TOPLEFT_DOWNRIGHT:
                                ctx.rotate(3*Math.PI/4);
                                break;
                            case Orientation.TOPRIGHT_DOWNLEFT:
                                ctx.rotate(Math.PI/4);
                                break;
                        }
                        if(is_selected){
                            ctx.font = '56px sans-serif';
                            ctx.fillStyle = sel_color;
                            ctx.fillText('S', 0, 0);
                            }
                        ctx.font = '48px sans-serif';
                        if(is_darkmode)
                            ctx.fillStyle = '#888';
                        else
                            ctx.fillStyle = '#444';
                        ctx.fillText('S', 0, 0);
                        ctx.restore();
                    }break;
                    case DoorType.BRICKED_WALL:{
                        if(is_selected){
                            ctx.strokeStyle = sel_color;
                            ctx.lineWidth=12;
                            ctx.beginPath();
                            switch(obj.orientation){
                                case Orientation.VERTICAL:
                                    ctx.moveTo(bx, by-22*w)
                                    ctx.lineTo(bx, by+22*w);
                                    break;
                                case Orientation.HORIZONTAL:
                                    ctx.moveTo(bx-22*w, by)
                                    ctx.lineTo(bx+22*w, by);
                                    break;
                                case Orientation.TOPLEFT_DOWNRIGHT:
                                    ctx.moveTo(bx-22*w, by-22*w)
                                    ctx.lineTo(bx+22*w, by+22*w);
                                    break;
                                case Orientation.TOPRIGHT_DOWNLEFT:
                                    ctx.moveTo(bx+22*w, by-22*w)
                                    ctx.lineTo(bx-22*w, by+22*w);
                                    break;
                            }
                            ctx.stroke();
                        }
                        ctx.strokeStyle = '#ff1111';
                        ctx.lineWidth=6;
                        ctx.beginPath();
                        switch(obj.orientation){
                            case Orientation.VERTICAL:
                                ctx.moveTo(bx, by-22*w)
                                ctx.lineTo(bx, by+22*w);
                                break;
                            case Orientation.HORIZONTAL:
                                ctx.moveTo(bx-22*w, by)
                                ctx.lineTo(bx+22*w, by);
                                break;
                            case Orientation.TOPLEFT_DOWNRIGHT:
                                ctx.moveTo(bx-22*w, by-22*w)
                                ctx.lineTo(bx+22*w, by+22*w);
                                break;
                            case Orientation.TOPRIGHT_DOWNLEFT:
                                ctx.moveTo(bx+22*w, by-22*w)
                                ctx.lineTo(bx-22*w, by+22*w);
                                break;
                        }
                        ctx.stroke();
                    }break;
                    case DoorType.WINDOW:{
                        if(is_selected){
                            ctx.strokeStyle = sel_color;
                            ctx.lineWidth=12;
                            ctx.beginPath();
                            switch(obj.orientation){
                                case Orientation.VERTICAL:
                                    ctx.moveTo(bx, by-22*w)
                                    ctx.lineTo(bx, by+22*w);
                                    break;
                                case Orientation.HORIZONTAL:
                                    ctx.moveTo(bx-22*w, by)
                                    ctx.lineTo(bx+22*w, by);
                                    break;
                                case Orientation.TOPLEFT_DOWNRIGHT:
                                    ctx.moveTo(bx-22*w, by-22*w)
                                    ctx.lineTo(bx+22*w, by+22*w);
                                    break;
                                case Orientation.TOPRIGHT_DOWNLEFT:
                                    ctx.moveTo(bx+22*w, by-22*w)
                                    ctx.lineTo(bx-22*w, by+22*w);
                                    break;
                            }
                            ctx.stroke();
                        }
                        if(obj.color === '#000000')
                            ctx.strokeStyle = '#73f9fd';
                        else
                            ctx.strokeStyle = obj.color;
                        ctx.lineWidth=6;
                        ctx.beginPath();
                        switch(obj.orientation){
                            case Orientation.VERTICAL:
                                ctx.moveTo(bx, by-30*w+1)
                                ctx.lineTo(bx, by+30*w);
                                break;
                            case Orientation.HORIZONTAL:
                                ctx.moveTo(bx-30*w+1, by)
                                ctx.lineTo(bx+30*w, by);
                                break;
                            case Orientation.TOPLEFT_DOWNRIGHT:
                                ctx.moveTo(bx-30*w+1, by-30*w+1)
                                ctx.lineTo(bx+30*w, by+30*w);
                                break;
                            case Orientation.TOPRIGHT_DOWNLEFT:
                                ctx.moveTo(bx+30*w+1, by-30*w+1)
                                ctx.lineTo(bx-30*w, by+30*w);
                                break;
                        }
                        ctx.stroke();
                    }break;
                }
            }break;
            case CanvasType.STAIRS:{ // TAG renderSTAIRS
                if(!obj.width || !obj.height)
                    break;
                const bbox = {
                    x0:bx,
                    y0:by,
                    x1:bx+obj.width*REFERENCE.WIDTH,
                    y1:by+obj.height*REFERENCE.WIDTH,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    break;
                }
                if(is_selected){
                    ctx.lineWidth=4;
                    ctx.strokeStyle = sel_color;
                    ctx.strokeRect(bx, by, obj.width*REFERENCE.WIDTH, obj.height*REFERENCE.WIDTH);
                }
                ctx.fillStyle = "#000000";
                let n = 0;
                let dx = 0;
                let dy = 0;
                let w = 0;
                let h = 0;
                let dw = 0;
                let dh = 0;
                let x = bx;
                let y = by;
                switch(obj.rotation){
                    case Rotation.UP:{
                        x += 2;
                        y += 4;
                        n = obj.height * 8 - 1;
                        w = REFERENCE.WIDTH*obj.width-4;
                        h = 4;
                        dw = -w / n;
                        dx = -dw/2;
                        dy = 8;
                    }break;
                    case Rotation.DOWN:{
                        x += 2;
                        n = obj.height * 8 - 1;
                        w = REFERENCE.WIDTH*obj.width-4;
                        h = 4;
                        dw = -w / n;
                        dx = -dw/2;
                        dy = -8;
                        y = by + obj.height*64 - 8;
                    }break;
                    case Rotation.RIGHT:{
                        y += 2;
                        x += 4;
                        n = obj.width * 8 - 1;
                        h = REFERENCE.WIDTH*obj.height-4;
                        w = 4;
                        dh = -h / n;
                        dy = -dh/2;
                        dx = 8;
                    }break;
                    case Rotation.LEFT:{
                        y += 2;
                        n = obj.width * 8 - 1;
                        h = REFERENCE.WIDTH*obj.height-4;
                        w = 4;
                        dh = -h / n;
                        dy = -dh/2;
                        dx = -8;
                        x = bx + obj.width*64 - 8;
                    }break;
                }
                for(let q = 0; q < n; ++q){
                    ctx.fillRect(x, y, w, h);
                    w += dw;
                    h += dh;
                    x += dx;
                    y += dy;
                }
                if(one_selection && selected.has(obj.id)){
                    ctx.fillStyle = sel_color;
                    ctx.fillRect(bbox.x0-10, bbox.y0-10, 20, 20);
                    ctx.fillRect(bbox.x1-10, bbox.y1-10, 20, 20);
                    view.resize.handles.push({
                        bbox: { x0: bbox.x0-10, y0: bbox.y0-10, x1: bbox.x0+10, y1: bbox.y0+10, },
                        obj_id: obj.id,
                        topleft:true,
                    });
                    view.resize.handles.push({
                        bbox: { x0: bbox.x1-10, y0: bbox.y1-10, x1: bbox.x1+10, y1: bbox.y1+10, },
                        obj_id: obj.id,
                        topleft:false,
                    });
                }
            }break;
            case CanvasType.MEASURE:{ // TAG renderMEASURE
                // this looks sus with the change to bx over obj.base_x
                let x1 = obj.x1;
                let y1 = obj.y1;
                if(obj.submap){
                    const sm = canvas_objs.get(obj.submap)! as SubMap;
                    if(sm!.flags & CanvasFlag.SUBMAP_IS_MINIMIZED)
                        continue;
                    x1 += sm.base_x + sm.tlx;
                    y1 += sm.base_y + sm.tly;
                }
                const bbox = {
                    x0: bx < x1 ? bx : x1,
                    x1: bx > x1 ? bx : x1,
                    y0: by < y1 ? by : y1,
                    y1: by > y1 ? by : y1,
                };
                if(!bbox_overlaps(bbox, canvas_bbox))
                    break;
                if(bbox.x0 == bbox.x1 && bbox.y0 == bbox.y1)
                    break;
                ctx.strokeStyle = obj.color;
                ctx.lineWidth = 4/scale;
                ctx.lineJoin = 'miter';
                ctx.beginPath();
                ctx.moveTo(bx, by);
                const head_length = 20/scale;
                const dx = x1 - bx;
                const dy = y1 - by;
                const angle = Math.atan2(dy, dx);
                ctx.lineTo(x1, y1);
                ctx.stroke();
                ctx.beginPath();
                let x_off = head_length * Math.cos(angle - Math.PI/6);
                let y_off = head_length * Math.sin(angle - Math.PI/6);
                ctx.lineTo(x1 - x_off, y1 - y_off);
                ctx.lineTo(x1, y1);
                x_off = head_length * Math.cos(angle + Math.PI/6);
                y_off = head_length * Math.sin(angle + Math.PI/6);
                ctx.lineTo(x1 - x_off, y1 - y_off);
                ctx.stroke();
                const fontsize = 24/scale | 0;
                ctx.font = fontsize+'px sans-serif';
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#000000';

                const measure_length = (obj.submap?calc_square_length:calc_measure_length)(map, bx, by, x1, y1);

                ctx.fillText(measure_length, (bx+x1)/2-fontsize, (by+y1)/2-fontsize);
            }break;
            case CanvasType.FIXTURE:{ // TAG renderFIXTURE
                if(!obj.width || !obj.height)
                    break;
                const bbox = {
                    x0:bx,
                    y0:by,
                    x1:bx+obj.width,
                    y1:by+obj.height,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    break;
                }
                switch(obj.ftype){
                    case FixtureType.STAIRS:
                        break; // should be unreachable
                    case FixtureType.STATUE:{
                        const cx = (bbox.x0+bbox.x1)/2;
                        const cy = (bbox.y0+bbox.y1)/2;
                        if(is_selected){
                            ctx.lineWidth=4;
                            ctx.strokeStyle = sel_color;
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
                    case FixtureType.PIT:{
                        let w = obj.width - 8;
                        let h = obj.height - 8;
                        let x = bx + 4;
                        let y = by + 4;
                        if(is_selected){
                            ctx.lineWidth = 4;
                            ctx.strokeStyle = sel_color;
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
                    case FixtureType.RUBBLE:{
                        if(is_selected){
                            ctx.lineWidth = 4;
                            ctx.strokeStyle = sel_color;
                            ctx.strokeRect(bx, by, obj.width, obj.height);
                        }
                        if(PACKED){
                            const ri = PACKED.fixtures[0];
                            ctx.drawImage(PACKEDIMG, ri[2], ri[3], ri[4], ri[5], bx, by, obj.width, obj.height);
                        }
                    }break;
                    case FixtureType.WELL:{
                        let rx = obj.width/2 - 2;
                        let ry = obj.height/2 - 2;
                        let cx = bx + obj.width/2+0.5;
                        let cy = by + obj.height/2+0.5;
                        if(is_selected){
                            ctx.lineWidth = 4;
                            ctx.strokeStyle = sel_color;
                            ctx.beginPath();
                            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2);
                            ctx.stroke();
                        }
                        ctx.strokeStyle = '#000000';
                        ctx.fillStyle = '#000000cc';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2);
                        ctx.stroke();

                        ctx.beginPath();
                        ctx.ellipse(cx, cy, rx-8, ry-8, 0, 0, Math.PI*2);
                        ctx.stroke();
                        ctx.fill();
                    }break;
                }
                if(one_selection && selected.has(obj.id)){
                    ctx.fillStyle = sel_color;
                    ctx.fillRect(bbox.x0-10, bbox.y0-10, 20, 20);
                    ctx.fillRect(bbox.x1-10, bbox.y1-10, 20, 20);
                    view.resize.handles.push({
                        bbox: { x0: bbox.x0-10, y0: bbox.y0-10, x1: bbox.x0+10, y1: bbox.y0+10, },
                        obj_id: obj.id,
                        topleft:true,
                    });
                    view.resize.handles.push({
                        bbox: { x0: bbox.x1-10, y0: bbox.y1-10, x1: bbox.x1+10, y1: bbox.y1+10, },
                        obj_id: obj.id,
                        topleft:false,
                    });
                }
            }break;
            case CanvasType.FILLED_TILE:{ // TAG renderFILLED_TILE
                // drawn already
            }break;
            case CanvasType.TERRAIN_TILE:{ // TAG renderTERRAIN_TILE
                // drawn already
            }break;
            case CanvasType.ICON_TILE:{ // TAG renderICON_TILE
                const icon = TERRAIN_ICON_BY_ID.get(obj.terrainicon_id);
                if(is_selected){
                    ctx.fillStyle = sel_color+'aa';
                    ctx.fillRect(bx+4, by+4, 56, 56);
                }
                if(icon)
                    ctx.drawImage(PACKEDIMG, icon[2], icon[3], icon[4], icon[5], bx+4, by+4, 56, 56);
            }break;
            case CanvasType.SUBMAP:{ // TAG renderSUBMAP
                if(!draw_submaps) continue;
                ctx.save();
                // if(map.grid_type & GridType.HEX)
                    // ctx.scale(1, HEX_Y_FIX_INV);
                const bbox = {
                    x0:bx,
                    y0:by,
                    x1:bx+obj.width,
                    y1:by+obj.height,
                };
                if(!bbox_overlaps(bbox, canvas_bbox)){
                    break;
                }
                if(is_selected){
                    ctx.lineWidth=8;
                    ctx.strokeStyle = sel_color;
                    if(obj.flags & CanvasFlag.SUBMAP_IS_MINIMIZED)
                        ctx.strokeRect(bx-2, by-2, obj.width+4, 68);
                    else
                        ctx.strokeRect(bx-2, by-2, obj.width+4, obj.height+4);
                }
                ctx.lineWidth=4;
                ctx.fillStyle = obj.bg_color.length?obj.bg_color:BACKGROUND;
                if(obj.flags & CanvasFlag.SUBMAP_IS_MINIMIZED)
                    ctx.fillRect(bx, by, obj.width, 64);
                else
                    ctx.fillRect(bx, by, obj.width, obj.height);
                ctx.strokeStyle = '#000';
                if(obj.flags & CanvasFlag.SUBMAP_IS_MINIMIZED)
                    ctx.strokeRect(bx, by, obj.width, 64);
                else{
                    ctx.strokeRect(bx, by, obj.width, obj.height);

                    if(obj.width && obj.height){
                        let box = new Path2D();
                        box.rect(bx+2/SCALE, by+2/SCALE, obj.width-4/SCALE, obj.height-4/SCALE);
                        ctx.clip(box);
                        ctx.fillStyle = obj.grid_color.length?obj.grid_color:'rgb(150, 150, 150)';
                        for(let dx = 0; dx < obj.width; dx += REFERENCE.WIDTH){
                            ctx.fillRect(bx+dx, by+64, 1, obj.height-64);
                        }
                        for(let dy = 0; dy < obj.height; dy += REFERENCE.WIDTH){
                            ctx.fillRect(bx, by+dy, obj.width, 1);
                        }
                    }
                }
                if(obj.title){
                    ctx.font = '48px sans-serif';
                    ctx.textBaseline = 'middle';
                    ctx.textAlign = 'center';
                    if(is_darkmode)
                        ctx.fillStyle = '#ffffff';
                    else
                        ctx.fillStyle = '#000000';
                    ctx.fillText(obj.title, bx+obj.width/2, by+32);
                }
                ctx.fillStyle = is_darkmode?'#ffffff':'#000000';
                ctx.strokeStyle = is_darkmode?'#ffffff':'#000000';
                const enum M {W=40, H=4};
                const enum O {BASE=(64-M.W)/2, WIN=64-BASE, MARGIN=BASE/2};
                ctx.lineWidth = M.H;
                const y = by + O.BASE;
                const x = IS_WINDOWS? bx + obj.width - O.WIN : bx + O.BASE;
                view.action.areas.push({
                    bbox: {
                        x0:x - O.MARGIN,
                        y0:y - O.MARGIN,
                        x1:x+M.W+O.MARGIN,
                        y1:y+M.W+O.MARGIN,
                    },
                    obj_id: obj.id,
                    action: 0,
                });
                if(point_in_rect(view.mouse.x, view.mouse.y, x-O.MARGIN, y-O.MARGIN, x+M.W+O.MARGIN, y+M.W+O.MARGIN)){
                    ctx.fillStyle = COULD_SELECT_COLOR;
                    ctx.fillRect(x-O.MARGIN, y-O.MARGIN, M.W+O.MARGIN*2, M.W+O.MARGIN*2);
                }
                const h = obj.flags & CanvasFlag.SUBMAP_IS_MINIMIZED? M.W : 0;
                ctx.strokeRect(x, y, M.W, h);
                ctx.restore();
                if(one_selection && selected.has(obj.id) && !(obj.flags & CanvasFlag.SUBMAP_IS_MINIMIZED)){
                    ctx.fillStyle = sel_color;
                    ctx.fillRect(bbox.x0-10, bbox.y0-10, 20, 20);
                    ctx.fillRect(bbox.x1-10, bbox.y1-10, 20, 20);
                    view.resize.handles.push({
                        bbox: { x0: bbox.x0-10, y0: bbox.y0-10, x1: bbox.x0+10, y1: bbox.y0+10, },
                        obj_id: obj.id,
                        topleft:true,
                    });
                    view.resize.handles.push({
                        bbox: { x0: bbox.x1-10, y0: bbox.y1-10, x1: bbox.x1+10, y1: bbox.y1+10, },
                        obj_id: obj.id,
                        topleft:false,
                    });
                }
            }break;
            case CanvasType.SHAPE:{ // TAG renderSHAPE
                // This works well enough for now.
                // If things get hairy, I could build a quadtree or whatever.
                const line_bbox = {
                    x0:obj.bbox.x0 + bx,
                    y0:obj.bbox.y0 + by,
                    x1:obj.bbox.x1 + bx,
                    y1:obj.bbox.y1 + by,
                };
                if(!bbox_overlaps(canvas_bbox, line_bbox)){
                    break;
                }
                if(obj.last_bx !== bx || obj.last_by !== by)
                    obj.path = undefined;
                if(!obj.path){
                    obj.last_bx = bx;
                    obj.last_by = by;
                    shape_recalculate_path(obj, bx, by);
                }
                const oldcap = ctx.lineCap;
                const oldjoin = ctx.lineJoin;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                if(is_selected){
                    ctx.lineWidth=obj.thickness+4;
                    ctx.strokeStyle = sel_color;
                    ctx.stroke(obj.path!);
                }
                ctx.lineWidth = obj.thickness;
                ctx.strokeStyle = obj.color;
                ctx.stroke(obj.path!);
                if(obj.color2.length){
                    ctx.fillStyle = obj.color2;
                    ctx.fill(obj.path!);
                }
                ctx.lineCap = oldcap;
                ctx.lineJoin = oldjoin;
            }break;
            case CanvasType.ARC:{ // TAG renderARC
                const bbox = {
                    x0:bx,
                    y0:by,
                    x1:bx+obj.width,
                    y1:by+obj.height,
                };
                if(!bbox_overlaps(bbox, canvas_bbox))
                    break;
                let sa = obj.start_arc & 3;
                let ea = obj.end_arc & 3;
                let th0 = sa * Math.PI/2;
                let th1 = ea * Math.PI/2;
                let [cx, cy, rx, ry] = arc_components(obj, bx-obj.base_x, by-obj.base_y);
                if(obj.width && obj.height){
                    if(is_selected){
                        ctx.lineWidth=8;
                        ctx.strokeStyle = sel_color;
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, rx, ry, 0, th0, th1);
                        ctx.stroke();
                    }
                    ctx.lineWidth=obj.thickness;
                    ctx.beginPath();
                    // ctx.strokeStyle = '#000000';
                    ctx.strokeStyle = obj.color;
                    ctx.ellipse(cx, cy, rx, ry, 0, th0, th1);
                    ctx.stroke();
                    // ctx.strokeStyle = '#8f0000';
                    // ctx.strokeRect(bbox.x0, bbox.y0, obj.width, obj.height);
                    // ctx.fillText(`${obj.end_arc} - ${obj.start_arc} = ${obj.end_arc - obj.start_arc} (${sa}, ${ea})`, bx, by);
                    if(one_selection && selected.has(obj.id)){
                        ctx.fillStyle = sel_color;
                        ctx.fillRect(bbox.x0-10, bbox.y0-10, 20, 20);
                        ctx.fillRect(bbox.x1-10, bbox.y1-10, 20, 20);
                        view.resize.handles.push({
                            bbox: { x0: bbox.x0-10, y0: bbox.y0-10, x1: bbox.x0+10, y1: bbox.y0+10, },
                            obj_id: obj.id,
                            topleft:true,
                        });
                        view.resize.handles.push({
                            bbox: { x0: bbox.x1-10, y0: bbox.y1-10, x1: bbox.x1+10, y1: bbox.y1+10, },
                            obj_id: obj.id,
                            topleft:false,
                        });
                    }
                }
            }
        }
    }
    ctx.globalAlpha = 1;
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
    const enum PING {DURATION=1000, RADIUS=64};
    if(flags & RenderFlags.DO_PINGS){
        if(map.pings.length){
            const new_pings = [];
            ctx.lineWidth  = 8;
            for(let p of map.pings){
                if(!p.t0){
                    p.t0 = timestamp;
                }
                const delta_t = timestamp - p.t0;
                if(delta_t < PING.DURATION){
                    new_pings.push(p);
                    ctx.beginPath();
                    ctx.strokeStyle = p.color;
                    ctx.arc(p.cx, p.cy, PING.RADIUS*delta_t/PING.DURATION, 0, 2*Math.PI);
                    ctx.stroke();
                }
            }
            map.pings = new_pings;
            request_render();
        }
    }
    if(flags & RenderFlags.SHOW_FPS){
        request_render();
        timings.push(performance.now()-before);
        while(timings.length > 30){
            timings.splice(0, 1);
        }
        let min = 100;
        let max = 0;
        let total = 0;
        for(let t of timings){
            if(t < min)
                min = t;
            if(t > max)
                max = t;
            total += t;
        }
        const avg = (total / timings.length).toFixed(4)+'ms';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 200, 100);
        ctx.fillStyle = '#000000';
        ctx.fillText('avg '+ avg, 10, 10);
        ctx.fillText('min '+ min.toFixed(4)+'ms', 10, 30);
        ctx.fillText('max '+ max.toFixed(4)+'ms', 10, 50);
    }
}
document.addEventListener('DOMContentLoaded', function(){
    const container = by_id('tool-container');
    const handle = by_id('tool-container-handle');
    setup_movable_window(container, handle, WINDOWFLAGS.REMEMBER_POSITION);
    setup_zsorted_window(container)();
    ensure_window_is_completely_on_screen(container);
});

// NOTE: The 'Help' tool was removed (it was a proto dialog button).
// There is now an empty slot due to this.
const enum ToolType {
    PAN     =  0,
    SELECT  =  1,
    LINE    =  2,
    ELLIPSE =  3,
    WALL    =  4,
    DOOR    =  5,
    RECT    =  6,
    TEXT    =  7,
    TOKEN   =  8,
    IMAGE   =  9,
    // HELP = 10,
    MEASURE = 11,
    FIXTURE = 12,
    TILE    = 13,
    SUBMAP  = 14,
    SHAPE   = 15,
    ARC     = 16,
}
const enum TOOLTYPE { MAX = 17}
const TOOL_IDS_TO_TOOL = (function(){
    const m: Map<string, ToolType> = new Map();
    m.set('pan-tool',     ToolType.PAN);
    m.set('select-tool',  ToolType.SELECT);
    m.set('line-tool',    ToolType.LINE);
    m.set('ellipse-tool', ToolType.ELLIPSE);
    m.set('wall-tool',    ToolType.WALL);
    m.set('door-tool',    ToolType.DOOR);
    m.set('rect-tool',    ToolType.RECT);
    m.set('text-tool',    ToolType.TEXT);
    m.set('token-tool',   ToolType.TOKEN);
    m.set('image-tool',   ToolType.IMAGE);
    // m.set('help-tool',    ToolType.HELP);
    m.set('measure-tool', ToolType.MEASURE);
    m.set('fixture-tool', ToolType.FIXTURE);
    m.set('tile-tool',    ToolType.TILE);
    m.set('submap-tool',  ToolType.SUBMAP);
    m.set('shape-tool',   ToolType.SHAPE);
    m.set('arc-tool',     ToolType.ARC);
    return m;
}());
const TOOL_TO_TOOL_ID = [
    // ToolType.PAN:
    'pan-tool',
    // ToolType.SELECT:
    'select-tool',
    // ToolType.LINE:
    'line-tool',
    // ToolType.ELLIPSE:
    'ellipse-tool',
    // ToolType.WALL:
    'wall-tool',
    // ToolType.DOOR:
    'door-tool',
    // ToolType.RECT:
    'rect-tool',
    // ToolType.TEXT:
    'text-tool',
    // ToolType.TOKEN:
    'token-tool',
    // ToolType.IMAGE:
    'image-tool',
    // ToolType.HELP:
    'help-tool', // unused?
    // ToolType.MEASURE:
    'measure-tool',
    // ToolType.FIXTURE:
    'fixture-tool',
    // ToolType.FILL:
    'tile-tool',
    // ToolType.SUBMAP
    'submap-tool',
    // ToolType.SHAPE
    'shape-tool',
    // ToolType.ARC
    'arc-tool',
];
let current_fixture_type = FixtureType.STAIRS;
const enum TOKENTYPE {
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
const enum RECTTYPE {
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
let current_tool:ToolType = (function(){
    let t = get_global(StorageCategory.CANVAS, 'current_tool');
    if(t === undefined)
        t = localStorage.getItem('current_tool');
    if(t){
        const result =  TOOL_IDS_TO_TOOL.get(t);
        if(result !== undefined){
            return result;
        }
    }
    return show_pan?ToolType.PAN:ToolType.SELECT;
}());
let color_picker_:HTMLInputElement;
let color_picker2_:HTMLInputElement;
function retrieve_colors(storage_key:string): Array<string>{
    let result = get_global(StorageCategory.CANVAS, storage_key);
    if(result) return result;
    const js = localStorage.getItem(storage_key);
    if(!js)
        return ['#ff2600', '#ff9300', '#fffb00', '#00f900', '#00fdff', '#0433ff', '#ff40ff', '#942192', '#aa7942', '#ffffff', '#919191', '#000000'];
    else
        return JSON.parse(js);
}
function retrieve_tool_colors(color_key:string): Map<ToolType, string> {
    let result = new Map();
    for(let i = 0; i < TOOLTYPE.MAX; i++){
        result.set(i, get_global_default(StorageCategory.CANVAS, `tools/${i}/${color_key}`, color_key==='primary_colors'?'#000000':'#ffffff'));
    }
    return result;
}
const primary_colors: Array<string> = retrieve_colors('primary_colors');
const secondary_colors: Array<string> = retrieve_colors('secondary_colors');
let primary_tool_colors: Map<ToolType, string> = retrieve_tool_colors('primary_colors');
let secondary_tool_colors: Map<ToolType, string> = retrieve_tool_colors('secondary_colors');
function add_recent_color(color:string, colors:Array<string>, storage_key:string){
    const index = colors.findIndex(function(e:string){return e==color;});
    if(index != -1){
        colors.splice(index, 1);
    }
    if(colors.unshift(color) > 20){
        colors.pop();
    }
    if(index == -1){
        store_global(StorageCategory.CANVAS, storage_key, colors);
    }
    if(storage_key === 'primary_colors'){
        primary_tool_colors.set(current_tool, color);
    }
    else {
        secondary_tool_colors.set(current_tool, color);
    }
    store_global(StorageCategory.CANVAS, `tools/${current_tool}/${storage_key}`, color);
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
function get_tool_colors(tool:ToolType):[string, string]{
    let a = primary_tool_colors.get(tool);
    if(!a) a = '#000000';
    let b = secondary_tool_colors.get(tool);
    if(!b) b = '#ffffff';
    return [a, b];
}
function make_color_menu(e:MouseEvent, colorpicker: HTMLInputElement, colors:Array<string>){
    // Piggy back on tri_menu stuff.
    if(has_tri_menu)
        return;
    has_tri_menu = true;
    const trimenu = document.createElement('section');
    const container = by_id('tool-container');
    trimenu.classList.add('menu');
    trimenu.style.left = e.clientX + 'px';
    trimenu.style.zIndex = container.style.zIndex;
    const window_height = window.innerHeight;
    trimenu.style.bottom = (window_height - e.clientY)+'px'
    function remove_tri_menu(e?:MouseEvent){
        if(e){
            e.stopPropagation();
            e.preventDefault();
        }
        document.body.removeChild(trimenu);
        window.removeEventListener('pointerdown', remove_tri_menu);
        TheCanvas.removeEventListener('pointerdown', remove_tri_menu);
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
        s.addEventListener('pointerdown', make_cb(color));
        trimenu.appendChild(s);
    }
    document.body.appendChild(trimenu);
    window.addEventListener('pointerdown', remove_tri_menu);
    TheCanvas.addEventListener('pointerdown', remove_tri_menu);
}
document.addEventListener('DOMContentLoaded', function(){
    const cpt1 = by_id('color-picker-dropdown');
    const cpt2 = by_id('color-picker2-dropdown');
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
function hide_palette(){
    const palette = by_id('palette');
    palette.style.display = 'none';
}

let PACKED_TO_IMG_CACHE = new Map();
function packed_to_img(x:number, y:number, w:number, h:number, alt:string, imw:number, imh:number){
    let key;
    if(imw) key = `${x},${y},${imw}x${imw}`;
    else key = `${x},${y}`;
    if(!PACKED_TO_IMG_CACHE.has(key)){
        let cvs = document.createElement('canvas');
        let c = cvs.getContext('2d')!;
        cvs.width = w;
        cvs.height = h;
        c.drawImage(PACKEDIMG, x, y, w, h, 0, 0, w, h);
        let durl = cvs.toDataURL();
        let img = new Image();
        img.src = durl;
        if(alt.length){
            img.alt = alt;
            img.title = alt;
        }
        if(imw){
            img.width = imw;
            img.height = imh;
        }
        PACKED_TO_IMG_CACHE.set(key, img);
    }
    return PACKED_TO_IMG_CACHE.get(key)!;
}
let TOKEN_TO_IMG_CACHE = new Map();
function token_to_img(x:number, y:number, w:number, h:number, imw:number, imh:number){
    let key;
    if(imw) key = `${x},${y},${imw}x${imw}`;
    else key = `${x},${y}`;
    if(!TOKEN_TO_IMG_CACHE.has(key)){
        let cvs = document.createElement('canvas');
        let c = cvs.getContext('2d')!;
        cvs.width = w;
        cvs.height = h;
        c.drawImage(TOKENIMG, x, y, w, h, 0, 0, w, h);
        let durl = cvs.toDataURL();
        let img = new Image();
        img.src = durl;
        if(imw){
            img.width = imw;
            img.height = imh;
        }
        TOKEN_TO_IMG_CACHE.set(key, img);
    }
    return TOKEN_TO_IMG_CACHE.get(key)!;
}
function make_terrain_palette(){
    const icons = by_id('palette-icons');
    (icons as any).replaceChildren();
    function make_cb(id:number){
        function cb(){
            current_terrain_id = id;
        }
        return cb;
    }
    by_id('palette').style.display = 'block';
    if(PACKED){
        const terrains = PACKED.terrain;
        for(let terr of terrains){
            const inp = document.createElement('input');
            inp.type = 'radio';
            inp.name = 'terrain';
            inp.id = `terrain-${terr[1]}`;
            const label = document.createElement('label');
            label.htmlFor = inp.id;
            label.style.backgroundColor = terr[2];
            if(terr[5])
                label.appendChild(packed_to_img(terr[3], terr[4], terr[5], terr[6], terr[1], 0, 0));
            icons.appendChild(inp);
            icons.appendChild(label);
            label.addEventListener('pointerdown', make_cb(terr[0]));
            if(terr[0] == current_terrain_id){
                label.click();
                label.scrollIntoView();
            }
        }
    }
    palette_top();
}
function make_terrain_icon_palette(){
    const icons = by_id('palette-icons');
    (icons as any).replaceChildren();
    function make_cb(id:number){
        function cb(){
            current_terrain_icon_id = id;
        }
        return cb;
    }
    by_id('palette').style.display = 'block';
    if(PACKED)
    for(let ti of PACKED.terrain_icons){
        const inp = document.createElement('input');
        inp.type = 'radio';
        inp.name = 'terrain';
        inp.id = `terrain-icon-${ti[0]}`;
        const label = document.createElement('label');
        label.htmlFor = inp.id;
        label.style.backgroundColor = '#e7f79c';
        label.appendChild(packed_to_img(ti[2], ti[3], ti[4], ti[5], ti[1], 0, 0));
        icons.appendChild(inp);
        icons.appendChild(label);
        label.addEventListener('pointerdown', make_cb(ti[0]));
        if(ti[0] == current_terrain_icon_id){
            label.click();
            label.scrollIntoView();
        }
    }
    palette_top();
}
let palette_top = function(){};
document.addEventListener('DOMContentLoaded', function(){
    const palette = by_id('palette');
    const handle = by_id('palette-window-handle');
    setup_movable_window(palette, handle, WINDOWFLAGS.REMEMBER_POSITION);
    palette_top = setup_zsorted_window(palette);
    ensure_window_is_completely_on_screen(palette);
});
let tools: Array<HTMLElement> = [];
function change_tool(tool:ToolType):void{
    store_global(StorageCategory.CANVAS, 'current_tool', TOOL_TO_TOOL_ID[tool]);
    if(!tools) return;
    current_tool = tool;
    switch(tool){
        case ToolType.PAN:
        case ToolType.SELECT:
            break;
        default:
            for(let view of dungeon_map_views){
                end_selecting(view);
            }
            break;
    }
    switch(tool){
        case ToolType.TILE:{
            switch(current_tile_type){
                case TileType.FILLED:
                    hide_palette();
                    break;
                case TileType.TERRAIN:
                    make_terrain_palette();
                    break;
                case TileType.ICON:
                    make_terrain_icon_palette();
                    break;
            }
        }break;
        default:
            hide_palette();
        break;
    }
    numeric_hot_key = numeric_hot_keys.get(tool) || DEFAULT_NUMERIC_HOT_KEY;
    for(let j = 0; j < tools.length; ++j){
        const toolel = tools[j];
        const tool_id = TOOL_TO_TOOL_ID[tool];
        toolel.classList.remove('selected');
        if(toolel.id == tool_id){
            toolel.classList.add('selected');
        }
    }
    let [primary, secondary] = get_tool_colors(tool);
    color_picker_.value = primary;
    color_picker2_.value = secondary;
    redo_canvas_cursor(get_active_view(), true);
}
let has_tri_menu = false;
function make_tri_menu(e:MouseEvent, options:Array<{func:()=>void;text:string}>){
    if(has_tri_menu)
        return;
    has_tri_menu = true;
    const trimenu = document.createElement('section');
    trimenu.classList.add('menu');
    trimenu.style.left = e.clientX + 'px';
    trimenu.style.zIndex = ""+TOPPERMOST_Z;
    const window_height = window.innerHeight;
    trimenu.style.bottom = (window_height - e.clientY)+'px';
    function remove_tri_menu(e?:MouseEvent){
        if(e){
            e.stopPropagation();
            e.preventDefault();
        }
        document.body.removeChild(trimenu);
        window.removeEventListener('pointerdown', remove_tri_menu);
        TheCanvas.removeEventListener('pointerdown', remove_tri_menu);
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
        s.addEventListener('pointerdown', make_cb(option.func));
        trimenu.appendChild(s);
    }
    document.body.appendChild(trimenu);
    window.addEventListener('pointerdown', remove_tri_menu);
    TheCanvas.addEventListener('pointerdown', remove_tri_menu);
}
document.addEventListener('DOMContentLoaded', function():void{
    tools = Array.from(document.getElementsByClassName('tool')) as Array<HTMLElement>;
    color_picker_ = by_id('color-picker');
    color_picker2_ = by_id('color-picker2');
    for(let i = 0; i < tools.length; ++i){
        const toolel = tools[i];
        toolel.addEventListener('click', function(e:MouseEvent){
            const tool = TOOL_IDS_TO_TOOL.get(toolel.id);
            if(tool !== undefined)
                change_tool(tool);
        });
        // Selecttype is bit flags, so it has to be its own special snowflake.
        // I guess it should actually be like checkboxes?
        if(toolel.id == 'select-tool'){
            const name = by_id('select-tool-menu');
            function change_st(st:SELECTTYPE){
                select_type = st;
                switch(select_type){
                    case SELECTTYPE.NONBACKGROUND:
                        name.innerText = 'M/T☰';
                        break;
                    case SELECTTYPE.MAP:
                        name.innerText = 'Map☰';
                        break;
                    case SELECTTYPE.TOKEN:
                        name.innerText = 'Token☰';
                        break;
                    case SELECTTYPE.BACKGROUND:
                        name.innerText = 'Bg☰';
                        break;
                    case SELECTTYPE.ANY:
                        name.innerText = 'Any☰';
                        break;
                }
            }
            change_st(SELECTTYPE.NONBACKGROUND);
            change_select_mode(SELECTTYPE.NONBACKGROUND);

            function make_cb(st:SELECTTYPE){
                function cb():void{
                    change_tool(ToolType.SELECT);
                    change_st(st);
                    change_select_mode(st);
                }
                return cb;
            }
            numeric_hot_keys.set(ToolType.SELECT, {
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
            // const triangle = toolel.getElementsByTagName('span')[0];
            name.addEventListener('click', function(e:MouseEvent){
                e.preventDefault();
                e.stopPropagation();
                if(has_tri_menu)
                    return;
                make_tri_menu(e, [
                    {func:make_cb(SELECTTYPE.NONBACKGROUND), text:'Map & Token'},
                    {func:make_cb(SELECTTYPE.MAP), text:'Map'},
                    {func:make_cb(SELECTTYPE.TOKEN), text:'Token'},
                    {func:make_cb(SELECTTYPE.BACKGROUND), text:'Background'},
                    {func:make_cb(SELECTTYPE.ANY), text:'Any'},
                ]);
            });
        }
        function setup_multi_option(toolel:HTMLElement, menu_id:string, t_type:ToolType, set_current:(_:number)=>void, t_to_name:Array<string>, t_to_short_name:Array<string>, t_max:number, current_value:number){
            const name = get_by_id<HTMLDivElement>(menu_id);
            function change_t(t:number){
                set_current(t);
                const tname = t_to_short_name[t];
                name.innerText = `${tname}☰`;
            }
            numeric_hot_keys.set(t_type, {
                func: change_t,
                max_index: t_max,
            });
            change_t(current_value);
            function make_cb(t:number){
                function cb(){
                    change_tool(t_type);
                    change_t(t);
                };
                return cb;
            }
            // const triangle = toolel.getElementsByTagName('span')[0];
            name.addEventListener('click', function(e:MouseEvent){
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
        // TAG setupMULTIOPTIONS
        switch(TOOL_IDS_TO_TOOL.get(toolel.id)){
            case ToolType.DOOR:
                setup_multi_option(toolel, 'door-tool-menu', ToolType.DOOR,
                                   function(i:number){
                                       current_door=i;
                                       store_global(StorageCategory.CANVAS, 'doortype', current_door);
                                   },
                                    DOOR_TO_NAMES, DOOR_TO_SHORT_NAMES, DoorType_MAX,
                                    get_global_default(StorageCategory.CANVAS, 'doortype', current_door));
            break;
            case ToolType.TOKEN:
                setup_multi_option(toolel, 'token-tool-menu', ToolType.TOKEN,
                                   function(i:number){
                                       current_token_type=i;
                                       store_global(StorageCategory.CANVAS, 'tokentype', current_token_type);
                                   },
                                   TOKEN_TO_NAME, TOKEN_TO_NAME, TOKENTYPE_MAX,
                                   get_global_default(StorageCategory.CANVAS, 'tokentype', current_token_type));
            break;
            case ToolType.RECT:
                setup_multi_option(toolel, 'rect-tool-menu', ToolType.RECT,
                                   function(i:number){
                                       current_rect_type=i;
                                       store_global(StorageCategory.CANVAS, 'recttype', current_rect_type);
                                   }, RECTTYPE_TO_NAME, RECTTYPE_TO_NAME, RECTTYPE_MAX,
                                   get_global_default(StorageCategory.CANVAS, 'recttype', current_rect_type));
            break;
            case ToolType.ELLIPSE:
                setup_multi_option(toolel, 'ellipse-tool-menu', ToolType.ELLIPSE,
                                   function(i:number){
                                       current_ellipse=i;
                                       store_global(StorageCategory.CANVAS, 'ellipsetype', current_ellipse);
                                   },
                                   ELLIPSETYPE_TO_NAME, ELLIPSETYPE_TO_NAME, ELLIPSETYPE_MAX,
                                   get_global_default(StorageCategory.CANVAS, 'ellipsetype', current_ellipse));
            break;
            case ToolType.FIXTURE:
                setup_multi_option(toolel, 'fixture-tool-menu', ToolType.FIXTURE,
                                   function(i:number){
                                       current_fixture_type=i;
                                       store_global(StorageCategory.CANVAS, 'fixturetype', current_fixture_type);
                                   },
                                   FixtureType_TO_NAME, FixtureType_TO_NAME, FixtureType_MAX,
                                   get_global_default(StorageCategory.CANVAS, 'fixturetype', current_fixture_type));
            break;
            case ToolType.TILE:
                setup_multi_option(toolel, 'tile-tool-menu', ToolType.TILE, function(i:number){
                    current_tile_type=i;
                    store_global(StorageCategory.CANVAS, 'tiletype', current_tile_type);
                    switch(current_tile_type){
                        case TileType.FILLED:
                            hide_palette();
                            break;
                        case TileType.TERRAIN:
                            make_terrain_palette();
                            break;
                        case TileType.ICON:
                            make_terrain_icon_palette();
                            break;
                    }
                }, TileType_TO_NAME, TileType_TO_NAME, TileType_MAX,
                get_global_default(StorageCategory.CANVAS, 'tiletype', current_tile_type));
            break;
            case ToolType.SHAPE:
                setup_multi_option(toolel, 'shape-tool-menu', ToolType.SHAPE,
                                   function(i:number){
                                       current_shape=i;
                                       store_global(StorageCategory.CANVAS, 'shapetype', current_shape);
                                   },
                                   SHAPETYPE_TO_NAME, SHAPETYPE_TO_SHORT_NAME, SHAPETYPE.MAX,
                                   get_global_default(StorageCategory.CANVAS, 'shapetype', current_shape));
            break;
            case ToolType.LINE:
                setup_multi_option(toolel, 'line-tool-menu', ToolType.LINE,
                                   function(i:number){
                                        current_line_type=i;
                                        store_global(StorageCategory.CANVAS, 'linetype', current_line_type);
                                   },
                                   LINETYPE_TO_NAME, LINETYPE_TO_NAME, LINETYPE.MAX,
                                   get_global_default(StorageCategory.CANVAS, 'linetype', current_line_type));
            break;
            case ToolType.ARC:
                setup_multi_option(toolel, 'arc-tool-menu', ToolType.ARC,
                                   set_arc_type,
                                   ARCTYPE_TO_NAME, ARCTYPE_TO_NAME, ARCTYPE.MAX,
                                   get_global_default(StorageCategory.CANVAS, 'arctype', current_arc_type));
            break;
            default:
            break;
        }
    }
    change_tool(current_tool);
});

// unused??
// @ts-ignore
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
let numeric_hot_keys:Map<ToolType, NumericHotKey> = new Map();
function maybe_move_selection_one_unit(view:DungeonMapView, dx:number, dy:number):boolean{
    switch(snapmode){
        case SNAPMODE.FREE: break;
        case SNAPMODE.GRID: break;
        case SNAPMODE.HALF: dx/=2; dy/=2; break;
        case SNAPMODE.QUARTER: dx/=4; dy/=4; break;
    }
    if(view.selected.size !== 1)
        return false;
    const s = view.selected.values().next().value;
    const obj = view.map.canvas_objs.get(s);
    if(!obj)
        return false;
    if(obj.flags & CanvasFlag.DELETED)
        return false;
    if(obj.type != CanvasType.EZ_TOKEN && obj.type != CanvasType.IMG_TOKEN)
        return false;
    const before = strip_obj(obj);
    obj.base_x += dx;
    obj.base_y += dy;
    const after = strip_obj(obj);
    publish_obj_updates(view.map.map_id, [after]);
    note_updates_for_undo(view.map, [before], [after]);
    return true;
}
const enum CONTEXTMENUWHENFLAGS {
    ALWAYS            = 1 << 0,
    MULTIPLE_SELECTED = 1 << 1, //  > 1
    NO_SELECTION      = 1 << 2, // == 0
    ONE_SELECTED      = 1 << 3, // == 1
    ANY_SELECTED      = 1 << 4, // >= 1
    GRID_TEN          = 1 << 5, //
    GRID_FIVE         = 1 << 6, //
};
function event_to_coord(e:MouseEvent, view:DungeonMapView):[number, number]{
    const x = e.offsetX/view.scale - view.camera_x
    const y = view.map.grid_type & GridType.HEX?
        HEX_Y_FIX_INV*(e.offsetY/view.scale - view.camera_y)
        : e.offsetY/view.scale - view.camera_y;
    return [x,y];
}
function event_to_coord_off(e:MouseEvent, view:DungeonMapView, off:[number, number]):[number, number]{
    const x = e.offsetX/view.scale - view.camera_x
    const y = view.map.grid_type & GridType.HEX?
        HEX_Y_FIX_INV*(e.offsetY/view.scale - view.camera_y)
        : e.offsetY/view.scale - view.camera_y;
    return [x-off[0],y-off[1]];
}
function event_to_coord_snapped(e:MouseEvent, view:DungeonMapView, snap:(x:number)=>number):[number, number]{
    const x = e.offsetX/view.scale - view.camera_x
    const y = view.map.grid_type & GridType.HEX?
        HEX_Y_FIX_INV*(e.offsetY/view.scale - view.camera_y)
        : e.offsetY/view.scale - view.camera_y;
    return [snap(x),snap(y)];
}
function event_to_coord_snapped_off(e:MouseEvent, view:DungeonMapView, snap:(x:number)=>number, off:[number, number]):[number, number]{
    const x = e.offsetX/view.scale - view.camera_x
    const y = view.map.grid_type & GridType.HEX?
        HEX_Y_FIX_INV*(e.offsetY/view.scale - view.camera_y)
        : e.offsetY/view.scale - view.camera_y;
    return [snap(x-off[0]),snap(y-off[1])];
}
function event_to_coord_snapped_off2(e:MouseEvent, view:DungeonMapView, snap:(x:number, y:number)=>[number, number], off:[number, number]):[number, number]{
    const x = e.offsetX/view.scale - view.camera_x
    const y = view.map.grid_type & GridType.HEX?
        HEX_Y_FIX_INV*(e.offsetY/view.scale - view.camera_y)
        : e.offsetY/view.scale - view.camera_y;
    return snap(x-off[0], y-off[1]);
}

function hiddenid():number {
    // This is pretty gross, but like who cares man.
    if(by_id('hidden-checkbox').checked)
        return SETTINGS.userid?SETTINGS.userid:0;
    return 0;
}

let GRABBING = false;
let SELECTING = false;
const redo_canvas_cursor = (function(){
    let prev_id = -1;
    function redo_canvas_cursor(view: DungeonMapView, modified:boolean){
        if(view.resize.resizing) return;
        if(GRABBING){
            if(TheCanvas.style.cursor != 'grabbing')
                TheCanvas.style.cursor = 'grabbing';
            return;
        }
        if(SELECTING){
            if(TheCanvas.style.cursor != 'crosshair')
                TheCanvas.style.cursor = 'crosshair';
            return;
        }
        if(current_tool == ToolType.PAN){
            if(!modified)
                for(let aa of view.action.areas){
                    if(point_in_rect(view.mouse.x, view.mouse.y, aa.bbox.x0, aa.bbox.y0, aa.bbox.x1, aa.bbox.y1)){
                        TheCanvas.style.cursor = 'pointer';
                        prev_id = -1;
                        return;
                    }
                }
            if(TheCanvas.style.cursor != 'grab')
                TheCanvas.style.cursor = 'grab';
            return;
        }
        if(current_tool != ToolType.SELECT){
            view.hovered_id = -1;
            if(TheCanvas.style.cursor != 'initial')
                TheCanvas.style.cursor = 'initial';
            return;
        }
        for(let rh of view.resize.handles){
            if(point_in_rect(view.mouse.x, view.mouse.y, rh.bbox.x0, rh.bbox.y0, rh.bbox.x1, rh.bbox.y1)){
                TheCanvas.style.cursor = 'nwse-resize';
                prev_id = -1;
                return;
            }
        }
        // This obj_at is necessary so that you can get the hovered outline.
        let o = obj_at(view, view.mouse.x, view.mouse.y, select_type);
        if(o){
            if(prev_id != o.id)
                request_render();
            if(TheCanvas.style.cursor != 'default')
                TheCanvas.style.cursor = 'default';
        }
        else {
            if(prev_id != -1)
                request_render();
            if(TheCanvas.style.cursor != 'crosshair')
                TheCanvas.style.cursor = 'crosshair';
        }
        prev_id = o?o.id:-1;
        if(view.selection_area.is_selecting)
            view.hovered_id = -1;
        else
            view.hovered_id = prev_id;
        if(!modified)
            for(let aa of view.action.areas){
                if(point_in_rect(view.mouse.x, view.mouse.y, aa.bbox.x0, aa.bbox.y0, aa.bbox.x1, aa.bbox.y1)){
                    request_render();
                    TheCanvas.style.cursor = 'pointer';
                    prev_id = -1;
                    return;
                }
            }
    }
    return redo_canvas_cursor;
}());


function get_submap_at(view:DungeonMapView, x:number, y:number):SubMap | null {
    for(let sm of view.map.submaps){
        if(sm.flags & CanvasFlag.DELETED)
            continue;
        if(sm.hidinguser && sm.hidinguser != SETTINGS.userid)
            continue;
        const sm_bbox = {
            x0:sm.base_x,
            y0:sm.base_y+64, // The title area.
            x1:sm.base_x+sm.width,
            y1:sm.base_y+(sm.flags & CanvasFlag.SUBMAP_IS_MINIMIZED?64:sm.height),
        };
        if(point_in_rect(x, y, sm_bbox.x0, sm_bbox.y0, sm_bbox.x1, sm_bbox.y1))
            return sm;
    }
    return null;
}

document.addEventListener('DOMContentLoaded', function(){
    TheCanvas = document.getElementsByTagName('canvas')[0]!;
    let gesturing = false;
    let stop_pan: (()=>void)| null = null;
    (function(){
        let start_scale = 1.0;
        let start_x = 0;
        let start_y = 0;
        TheCanvas.addEventListener('gesturestart', function(e:any){
            e.stopPropagation();
            e.preventDefault();
            if(stop_pan) stop_pan();
            const view = get_active_view();
            start_scale = view.scale;
            start_x = view.camera_x;
            start_y = view.camera_y;
            gesturing = true;
        });
        TheCanvas.addEventListener('gesturechange', function(e:any){
            e.stopPropagation();
            e.preventDefault();
            if(stop_pan) stop_pan();
            const view = get_active_view();
            view.scale = start_scale * e.scale;
            view.scale = clamp_scale(view.scale);
            let cx = start_x - TheCanvas.width/2/start_scale;
            let cy = start_y - TheCanvas.height/2/start_scale;
            cx += TheCanvas.width/2/view.scale;
            cy += TheCanvas.height/2/view.scale;
            // cx = Math.round(cx);
            // cy = Math.round(cy);
            view.camera_x = cx;
            view.camera_y = cy;

            request_render();
        });
        TheCanvas.addEventListener('gestureend', function(e:any){
            e.stopPropagation();
            e.preventDefault();
            gesturing = false;
        });
    })();
    TheCanvas.addEventListener('wheel', function(e:WheelEvent){
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
        // view.camera_x = Math.round(view.camera_x);
        // view.camera_y = Math.round(view.camera_y);
        request_render();
    });
    window.addEventListener('keydown', function(e:KeyboardEvent){
        if(document.activeElement !== document.body)
            return;
        const modified = e.altKey || e.shiftKey || e.metaKey || e.ctrlKey;
        const ctrl_or_cmd_is_pressed = e.ctrlKey || e.metaKey;
        const other_modifiers = e.altKey || e.shiftKey;
        // const shift = e.shiftKey;
        const shortcut = ctrl_or_cmd_is_pressed && !other_modifiers;
        const view = get_active_view();
        switch(e.key){
            case 'ArrowLeft':{
                if(maybe_move_selection_one_unit(view, -64, 0)){
                }
                else {
                    view.camera_x += 256;
                }
                request_render();
            }break;
            case 'ArrowRight':{
                if(maybe_move_selection_one_unit(view, +64, 0)){
                }
                else {
                    view.camera_x -= 256;
                }
                request_render();
            }break;
            case 'ArrowUp':{
                if(maybe_move_selection_one_unit(view, 0, -64)){
                }
                else {
                    view.camera_y += 256;
                }
                request_render();
            }break;
            case 'ArrowDown':{
                if(maybe_move_selection_one_unit(view, 0, +64)){
                }
                else {
                    view.camera_y -= 256;
                }
                request_render();
            }break;
            case 'Escape':{
                if(OPENDIALOG)
                    OPENDIALOG.close.click();
                else{
                    view.selected.clear();
                    request_render();
                }
            }break;
            case 'Backspace': // fall-through
            case 'Delete':{
                if(!view.selected.size)
                    break;
                let deleted = [];
                for(let item of view.selected){
                    let o = view.map.canvas_objs.get(item)!;
                    if(o.flags & CanvasFlag.DELETED) continue;
                    o.flags |= CanvasFlag.DELETED;
                    deleted.push(o.id);
                    // #SPEED: faster way to get all objects in this submap
                    if(o.type == CanvasType.SUBMAP){
                        for(let obj of view.map.canvas_obj_array){
                            if(obj.flags & CanvasFlag.DELETED) continue;
                            if(obj.submap == o.id){
                                obj.flags |= CanvasFlag.DELETED;
                                deleted.push(obj.id);
                            }
                        }

                    }
                }
                publish_delete_by_ids(view.map.map_id, deleted);
                note_delete_by_ids_for_undo(view.map, deleted);
                end_selecting(view);
            }break;
            case 'q':
                if(modified) return;
                visually_set_snapmode(SNAPMODE.GRID);
                break;
            case 'w':
                if(modified) return;
                visually_set_snapmode(SNAPMODE.HALF);
                break;
            case 'e':
                if(modified) return;
                visually_set_snapmode(SNAPMODE.FREE);
                break;
            case 's':
                if(modified) return;
                change_tool(ToolType.SELECT);
                break;
            case 'p':
                if(modified) return;
                change_tool(ToolType.ELLIPSE);
                break;
            case 'n':
                if(modified) return;
                if(show_pan) change_tool(ToolType.PAN);
                break;
            case 'l':
                if(modified) return;
                change_tool(ToolType.LINE);
                break;
            case 'r':
                if(modified) return;
                change_tool(ToolType.RECT);
                break;
            case 'i':
                if(modified) return;
                change_tool(ToolType.IMAGE);
                break;
            case 'f':
                if(modified) return;
                change_tool(ToolType.FIXTURE);
                break;
            case 'd':
                if(modified) return;
                change_tool(ToolType.DOOR);
                break;
            case 'm':
                if(modified) return;
                change_tool(ToolType.MEASURE);
                break;
            case 'a':
                if(modified) return;
                change_tool(ToolType.WALL);
                break;
            case 't':
                if(modified) return;
                change_tool(ToolType.TEXT);
                break;
            case 'o':
                if(modified) return;
                change_tool(ToolType.TOKEN);
                break;
            case 'k':
                if(modified) return;
                change_tool(ToolType.TILE);
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
                else
                    return;
                break;
            case 'x':
                if(shortcut){
                    if(view.selected.size !== 0){
                        clear_copy_buffer();
                        cut_selected_objs_to_copy_buffer(view);
                    }
                }
                else
                    return;
                break;
            case 'c':
                if(shortcut){
                    if(view.selected.size !== 0){
                        clear_copy_buffer();
                        copy_selected_objs_to_copy_buffer(view);
                    }
                }
                else
                    return;
                break;
            case 'v':
                if(shortcut){
                    if(copied_objs.length){
                        let submapid = 0;
                        let x = view.mouse.x; let y = view.mouse.y;
                        let sm = get_submap_at(view, x, y);
                        if(sm){
                            submapid = sm.id;
                            x -= sm.base_x + sm.tlx;
                            y -= sm.base_y + sm.tly;
                        }
                        paste_from_copy_buffer_at(view.map, x, y, submapid);
                    }
                    break;
                }
                else
                    return;
                break;
            case 'h':
                if(modified) return;
                {
                    if(!view.selected.size) break;
                    let nhidden = 0;
                    for(let obj_id of view.selected){
                        let o = view.map.canvas_objs.get(obj_id)!;
                        if(o.hidinguser) nhidden++;
                    }
                    let changed = false;
                    let before = [];
                    let after = [];
                    for(let obj_id of view.selected){
                        let o = view.map.canvas_objs.get(obj_id)!;
                        before.push(strip_obj(o));
                        if(nhidden != view.selected.size)
                            o.hidinguser = SETTINGS.userid;
                        else
                            o.hidinguser = 0;
                        after.push(strip_obj(o));
                        changed = true;
                    }
                    if(changed){
                        note_updates_for_undo(view.map, before, after);
                        publish_obj_updates(view.map.map_id, after);
                        request_render();
                    }
                }
                break;
            case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':{
                if(ctrl_or_cmd_is_pressed)
                    return;
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
    let prev_tool:ToolType = ToolType.PAN;
    // this state variable is kind of janky.
    let ctxmenu_is_active = 0;
    let ez_token_color = '#ff3333';
    // TAG toolimpl
    // TAG pointerdown
    // TAG click
    TheCanvas.addEventListener('pointerdown', function(e:PointerEvent){
        if(gesturing) return;
        if(e.button !== 0 && e.button !== 1){ //0 is the 'primary' button
            return;
        }
        let view = get_active_view();
        if(e.shiftKey){
            const [click_x, click_y] = event_to_coord(e, view);
            ping_at(view.map, click_x, click_y);
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        if(document.activeElement)
            (document.activeElement as any).blur();
        if(ctxmenu_is_active !== 0)
            return;
        if(has_tri_menu)
            return;
        e.stopPropagation();
        e.preventDefault();
        if(e.button === 1){
            prev_tool = current_tool;
            current_tool = ToolType.PAN;
        }
        let submapid = 0;
        let smoff:[number, number] = [0, 0];
        // Find what submap if any we are inside.
        {
            let [x, y] = event_to_coord(e, view);
            let sm = get_submap_at(view, x, y);
            if(sm){
                submapid = sm.id;
                smoff = [sm.base_x+sm.tlx, sm.base_y+sm.tly];
            }
        }
        let snap = get_snap_func();
        let snap_corn = get_snap_corner_func(view.map.grid_type);
        switch(current_tool){
            case ToolType.SELECT:{ // TAG toolSELECT
                let [clicked_x, clicked_y] = event_to_coord(e, view);
                const modified = e.altKey || e.shiftKey || e.metaKey || e.ctrlKey;
                if(!modified) {
                    for(let aa of view.action.areas){
                        if(point_in_rect(clicked_x, clicked_y, aa.bbox.x0, aa.bbox.y0, aa.bbox.x1, aa.bbox.y1)){
                            let o = view.map.canvas_objs.get(aa.obj_id);
                            if(!o) break;
                            if(o.flags & CanvasFlag.DELETED) break;
                            if(o.hidinguser && o.hidinguser !== SETTINGS.userid) break;
                            if(o.type == CanvasType.SUBMAP){
                                let before = strip_obj(o);
                                o.flags ^= CanvasFlag.SUBMAP_IS_MINIMIZED;
                                let after = strip_obj(o);
                                note_updates_for_undo(view.map, [before], [after]);
                                publish_obj_updates(view.map.map_id, [after]);
                            }
                            else if (o.type == CanvasType.TEXT){
                                if(o.flags & CanvasFlag.TEXT_LINKS_TO_SUBMAP){
                                    let sm = view.map.canvas_objs.get(o.map_id) as (SubMap | undefined);
                                    if(!sm) return;
                                    let before = strip_obj(sm);
                                    sm.flags &= ~CanvasFlag.SUBMAP_IS_MINIMIZED;
                                    let after = strip_obj(sm);
                                    note_updates_for_undo(view.map, [before], [after]);
                                    publish_obj_updates(view.map.map_id, [after]);
                                    center_view_at(view, sm.base_x+sm.width/2, sm.base_y+sm.height/2);
                                    request_render();
                                    return;
                                }
                                change_map(o.map_id, false);
                                map_hist.add(o.map_id);
                                view.selected.clear();
                                TheCanvas.style.cursor = 'initial';
                                return;
                            }
                            request_render();
                            return;
                        }
                    }
                    if(view.resize.handles.length){ // TAG resize
                        for(let rh of view.resize.handles){
                            if(point_in_rect(clicked_x, clicked_y, rh.bbox.x0, rh.bbox.y0, rh.bbox.x1, rh.bbox.y1)){
                                const o = view.map.canvas_objs.get(rh.obj_id);
                                if(!o) return;
                                if(o.flags & CanvasFlag.DELETED) return;
                                if(!is_resizable(o)) return;
                                const obj: Resizable = o;
                                view.resize.resizing = true;
                                if(obj.type == CanvasType.SUBMAP)
                                    smoff = [0, 0];
                                let o_x = obj.base_x; let o_y = obj.base_y; let o_w = obj.width; let o_h = obj.height;
                                function change_wh(e:PointerEvent){
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const [x1, y1] = event_to_coord_off(e, view, smoff);
                                    let x0 = obj.base_x; let y0 = obj.base_y;
                                    if(rh.topleft){
                                        if(obj.type == CanvasType.STAIRS){
                                            // stairs w/h are in squares
                                            x0 += obj.width * REFERENCE.WIDTH;
                                            y0 += obj.height * REFERENCE.WIDTH;
                                        }
                                        else {
                                            x0 += obj.width;
                                            y0 += obj.height;
                                        }
                                        if(x1 > x0 || y1 > y0) return;
                                        const xdiff = snap(x0 - x1);
                                        const ydiff = snap(y0 - y1);
                                        let old_w = obj.width;
                                        let old_h = obj.height;
                                        obj.width = xdiff;
                                        obj.height = ydiff;
                                        obj.base_x = x0 - obj.width;
                                        obj.base_y = y0 - obj.height;
                                        // stairs w/h are in squares
                                        if(obj.type == CanvasType.STAIRS){
                                            obj.width /= REFERENCE.WIDTH;
                                            obj.height /= REFERENCE.WIDTH;
                                        }
                                        if(obj.type == CanvasType.SUBMAP){
                                            obj.tlx -= old_w - obj.width;
                                            obj.tly -= old_h - obj.height;
                                        }
                                    }
                                    else {
                                        if(x1 < x0 || y1 < y0) return;
                                        const xdiff = snap(x1 - x0);
                                        const ydiff = snap(y1 - y0);
                                        if(!xdiff && !ydiff) return;
                                        obj.width = xdiff;
                                        obj.height = ydiff;
                                        // stairs w/h are in squares
                                        if(obj.type == CanvasType.STAIRS){
                                            obj.width /= REFERENCE.WIDTH;
                                            obj.height /= REFERENCE.WIDTH;
                                        }
                                    }
                                    request_render();
                                }
                                TheCanvas.addEventListener('pointermove', change_wh);
                                const before = strip_obj(obj);
                                function finish(){
                                    view.resize.resizing = false;
                                    redo_canvas_cursor(view, false);
                                    TheCanvas.removeEventListener('pointermove', change_wh);
                                    window.removeEventListener('pointerup', finish);
                                    TheCanvas.removeEventListener('pointerup', finish);
                                    request_render();
                                    if(o_x != obj.base_x || o_y != obj.base_y || o_w != obj.width || o_h != obj.height){
                                        const after = strip_obj(obj);
                                        note_updates_for_undo(view.map, [before], [after]);
                                        publish_obj_updates(view.map.map_id, [after]);
                                    }
                                    redo_canvas_cursor(view, false);
                                }
                                window.addEventListener('pointerup', finish);
                                TheCanvas.addEventListener('pointerleave', finish);
                                return;
                            }
                        }
                    }
                }
                const fudged_x0 = clicked_x-FUDGE._;
                const fudged_x1 = clicked_x+FUDGE._;
                const fudged_y0 = clicked_y-FUDGE._;
                const fudged_y1 = clicked_y+FUDGE._;
                // Simulate doing a single item click so that you can immediately
                // start moving it.
                // There's probably a more efficient/clear way to do this,
                // but this works.
                if(!e.altKey && !view.selection_area.is_selecting && !view.selected.size){
                    sort_canv_objs(view.map);
                    view.selection_area.select_one = true;
                    view.selection_area.is_selecting = true;
                    update_selection(view, fudged_x0, fudged_y0, fudged_x1, fudged_y1);
                    finalize_selection(view);
                    request_render();
                }
                if(view.selected.size && there_are_selected_objs_at(view, fudged_x0-smoff[0], fudged_y0-smoff[1], fudged_x1-smoff[0], fudged_y1-smoff[1])){
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
                        let [move_x, move_y] = event_to_coord(e, view);
                        changed = true;
                        move_selected_objects(view, is_rigid, clicked_x, clicked_y, move_x - clicked_x, move_y - clicked_y);
                        clicked_x = move_x;
                        clicked_y = move_y;
                    }
                    TheCanvas.addEventListener('pointermove', move);
                    function finish_move(){
                        TheCanvas.removeEventListener('pointermove', move);
                        window.removeEventListener('pointerup', finish_move);
                        TheCanvas.removeEventListener('pointerleave', finish_move);
                        if(!changed)
                            return;
                        const after_update = get_stripped_state_by_id(view.map, Array.from(view.selected));
                        publish_obj_updates(view.map.map_id, after_update);
                        note_updates_for_undo(view.map, before_update, after_update);
                    }
                    window.addEventListener('pointerup', finish_move);
                    TheCanvas.addEventListener('pointerleave', finish_move);
                }
                else {
                    sort_canv_objs(view.map);
                    view.selection_area.select_one = true;
                    view.selection_area.is_selecting = true;
                    view.selection_area.submap = submapid;
                    update_selection(view, fudged_x0, fudged_y0, fudged_x1, fudged_y1);
                    request_render();
                    function select(e:MouseEvent){
                        e.stopPropagation();
                        e.preventDefault();
                        let [select_x, select_y] = event_to_coord(e, view);
                        if(select_x != clicked_x || select_y != clicked_y)
                            view.selection_area.select_one = false;
                        update_selection(view, clicked_x, clicked_y, select_x, select_y);
                        request_render();
                    }
                    TheCanvas.addEventListener('pointermove', select);
                    function finish_select(){
                        finalize_selection(view);
                        TheCanvas.removeEventListener('pointermove', select);
                        window.removeEventListener('pointerup', finish_select);
                        TheCanvas.removeEventListener('pointerleave', finish_select);
                        SELECTING = false;
                        redo_canvas_cursor(view, false);
                    }
                    window.addEventListener('pointerup', finish_select);
                    TheCanvas.addEventListener('pointerleave', finish_select);
                    SELECTING = true;
                    redo_canvas_cursor(view, false);
                }
            }break;
            case ToolType.PAN:{ // TAG toolPAN
                { // copy-pasta from above
                    let [clicked_x, clicked_y] = event_to_coord(e, view);
                    const modified = e.altKey || e.shiftKey || e.metaKey || e.ctrlKey;
                    if(!modified) {
                        for(let aa of view.action.areas){
                            if(point_in_rect(clicked_x, clicked_y, aa.bbox.x0, aa.bbox.y0, aa.bbox.x1, aa.bbox.y1)){
                                let o = view.map.canvas_objs.get(aa.obj_id);
                                if(!o) break;
                                if(o.flags & CanvasFlag.DELETED) break;
                                if(o.hidinguser && o.hidinguser !== SETTINGS.userid) break;
                                if(o.type == CanvasType.SUBMAP){
                                    let before = strip_obj(o);
                                    o.flags ^= CanvasFlag.SUBMAP_IS_MINIMIZED;
                                    let after = strip_obj(o);
                                    note_updates_for_undo(view.map, [before], [after]);
                                    publish_obj_updates(view.map.map_id, [after]);
                                }
                                else if (o.type == CanvasType.TEXT){
                                    if(o.flags & CanvasFlag.TEXT_LINKS_TO_SUBMAP){
                                        let sm = view.map.canvas_objs.get(o.map_id) as (SubMap | undefined);
                                        if(!sm) return;
                                        let before = strip_obj(sm);
                                        sm.flags &= ~CanvasFlag.SUBMAP_IS_MINIMIZED;
                                        let after = strip_obj(sm);
                                        note_updates_for_undo(view.map, [before], [after]);
                                        publish_obj_updates(view.map.map_id, [after]);
                                        center_view_at(view, sm.base_x+sm.width/2, sm.base_y+sm.height/2);
                                        request_render();
                                        return;
                                    }
                                    change_map(o.map_id, false);
                                    map_hist.add(o.map_id);
                                    view.selected.clear();
                                    TheCanvas.style.cursor = 'initial';
                                    return;
                                }
                                request_render();
                                return;
                            }
                        }
                    }
                }
                // don't use the helper as it includes view.camera_*
                let clicked_x = e.offsetX/view.scale;
                let clicked_y = e.offsetY/view.scale;
                let pointer_id = e.pointerId;
                GRABBING = true;
                function pan(e:PointerEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    if(e.pointerId != pointer_id) return;
                    let pan_x = e.offsetX/view.scale;
                    let pan_y = e.offsetY/view.scale;
                    view.camera_x -= clicked_x - pan_x;
                    view.camera_y -= clicked_y - pan_y;
                    clicked_x = pan_x;
                    clicked_y = pan_y;
                    request_render();
                }
                TheCanvas.addEventListener('pointermove', pan);
                function finish_pan(){
                    stop_pan = null;
                    GRABBING = false;
                    if(prev_tool){
                        current_tool = prev_tool;
                        prev_tool = ToolType.PAN;
                    }
                    if(prev_tool == ToolType.PAN || !prev_tool){
                        TheCanvas.style.cursor = 'grab';
                    }
                    TheCanvas.removeEventListener('pointermove', pan);
                    window.removeEventListener('pointerup', finish_pan);
                    TheCanvas.removeEventListener('pointerleave', finish_pan);
                    redo_canvas_cursor(view, false);
                }
                stop_pan = finish_pan;
                window.addEventListener('pointerup', finish_pan);
                TheCanvas.addEventListener('pointerleave', finish_pan);
                redo_canvas_cursor(view, false);
            }break;
            case ToolType.LINE:{ // TAG toolLINE
                let id = get_new_id();
                const [x0, y0] = event_to_coord_off(e, view, smoff);
                const thickness_input = by_id('line-thickness');
                const thickness = +thickness_input.value || 4;
                add_freehand_line(view.map, id, x0, y0, submapid, get_primary_color(), thickness);
                if(current_line_type == LineType.ARROW){
                    let obj = view.map.canvas_objs.get(id) as FreehandLine;
                    obj.flags |= CanvasFlag.LINE_IS_ARROW;
                }
                function add_point(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    const [x1, y1] = event_to_coord_off(e, view, smoff);
                    if(current_line_type != LineType.PEN){
                        let obj = view.map.canvas_objs.get(id) as FreehandLine;
                        obj.points = [];
                    }
                    add_freehand_point_by_id(view.map, id, x1, y1);
                    request_render();
                }
                TheCanvas.addEventListener('pointermove', add_point);
                function finish_point(){
                    TheCanvas.removeEventListener('pointermove', add_point);
                    window.removeEventListener('pointerup', finish_point);
                    TheCanvas.removeEventListener('pointerleave', finish_point);
                    publish_obj_by_id(view.map, id);
                    note_create_by_id_for_undo(view.map, id);
                }
                window.addEventListener('pointerup', finish_point);
                TheCanvas.addEventListener('pointerleave', finish_point);
            }break;
            case ToolType.SHAPE:{ // TAG toolSHAPE
                let id = get_new_id();
                let thickness = 4;
                let color1 = get_primary_color();
                let color2 = '';
                switch(current_shape){
                    case ShapeType.SOLID_SHAPE:
                        color2 = color1;
                        break;
                    case ShapeType.FILLED_SHAPE:
                        color2 = get_secondary_color();
                        break;
                }
                let [x0, y0] = event_to_coord_off(e, view, smoff);
                let o = make_shape(id, x0, y0, submapid, color1, color2, thickness);
                add_canv_obj(view.map, o);
                function add_point(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    let [x1, y1] = event_to_coord_off(e, view, smoff);
                    add_freehand_point(o, x1, y1);
                    request_render();
                }
                TheCanvas.addEventListener('pointermove', add_point);
                function finish_point(){
                    TheCanvas.removeEventListener('pointermove', add_point);
                    window.removeEventListener('pointerup', finish_point);
                    TheCanvas.removeEventListener('pointerleave', finish_point);
                    add_freehand_point(o, x0, y0);
                    publish_obj_by_id(view.map, id);
                    note_create_by_id_for_undo(view.map, id);
                    request_render();
                }
                window.addEventListener('pointerup', finish_point);
                TheCanvas.addEventListener('pointerleave', finish_point);
            }break;
            case ToolType.WALL:{ // TAG toolWALL
                let id = get_new_id();
                if(0){
                // if(snapmode == SNAPMODE.FREE){
                    // copy paste from LINE above.
                    const [x0, y0] = event_to_coord_off(e, view, smoff);
                    add_freehand_line(view.map, id, x0, y0, submapid, get_primary_color(), 4);
                    function add_point(e:MouseEvent){
                        e.stopPropagation();
                        e.preventDefault();
                        const [x1, y1] = event_to_coord_off(e, view, smoff);
                        add_freehand_point_by_id(view.map, id, x1, y1);
                        request_render();
                    }
                    TheCanvas.addEventListener('pointermove', add_point);
                    function finish_point(){
                        TheCanvas.removeEventListener('pointermove', add_point);
                        window.removeEventListener('pointerup', finish_point);
                        TheCanvas.removeEventListener('pointerleave', finish_point);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                    }
                    window.addEventListener('pointerup', finish_point);
                    TheCanvas.addEventListener('pointerleave', finish_point);
                }
                else{
                    const [x0, y0] = event_to_coord_snapped_off2(e, view, snap_corn, smoff);
                    // const [x0, y0] = event_to_coord_off(e, view, smoff);
                    let x1 = x0;
                    let y1 = y0;
                    view.placing_area.is_placing = true;
                    view.placing_area.is_line = true;
                    view.placing_area.x0 = x0+smoff[0];
                    view.placing_area.y0 = y0+smoff[1];
                    view.placing_area.x1 = x1+smoff[0];
                    view.placing_area.y1 = y1+smoff[1];
                    let obj: GridLine = {
                        type: CanvasType.GRID_LINE,
                        id: id,
                        base_x: x0,
                        base_y: y0,
                        flags: CanvasFlag.NONE,
                        hidinguser: hiddenid(),
                        submap:submapid,
                        points: [],
                        color: get_primary_color(),
                        path: undefined,
                        bbox: { x0: 0, y0: 0, x1: 0, y1: 0, },
                        last_bx:undefined,
                        last_by:undefined,
                    };
                    add_canv_obj(view.map, obj);

                    function add_point(e:MouseEvent){
                        e.stopPropagation();
                        e.preventDefault();
                        const [x, y] = event_to_coord_snapped_off2(e, view, snap_corn, smoff);
                        x1 = x;
                        y1 = y;
                        view.placing_area.x1 = x1+smoff[0];
                        view.placing_area.y1 = y1+smoff[1];
                        request_render();
                    }
                    TheCanvas.addEventListener('pointermove', add_point);
                    function finish_point(){
                        view.placing_area.is_placing = false;
                        add_gridline_point(obj, x1, y1);
                        TheCanvas.removeEventListener('pointermove', add_point);
                        window.removeEventListener('pointerup', finish_point);
                        TheCanvas.removeEventListener('pointerleave', finish_point);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                        request_render();
                    }
                    window.addEventListener('pointerup', finish_point);
                    TheCanvas.addEventListener('pointerleave', finish_point);
                }
            }break;
            case ToolType.DOOR:{ // TAG toolDOOR
                const [x0, y0] = event_to_coord_snapped_off2(e, view, snap_corn, smoff);
                let x1 = x0;
                let y1 = y0;
                view.placing_area.is_placing = true;
                view.placing_area.is_line = true;
                view.placing_area.x0 = x0+smoff[0];
                view.placing_area.y0 = y0+smoff[1];
                view.placing_area.x1 = x1+smoff[0];
                view.placing_area.y1 = y1+smoff[1];
                request_render();
                function change_point(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    [x1, y1] = event_to_coord_snapped_off2(e, view, snap_corn, smoff);
                    view.placing_area.x0 = x0+smoff[0];
                    view.placing_area.y0 = y0+smoff[1];
                    view.placing_area.x1 = x1+smoff[0];
                    view.placing_area.y1 = y1+smoff[1];
                    request_render();
                }
                TheCanvas.addEventListener('pointermove', change_point);
                function finish_door(){
                    view.placing_area.is_placing = false;
                    TheCanvas.removeEventListener('pointermove', change_point);
                    window.removeEventListener('pointerup', finish_door);
                    TheCanvas.removeEventListener('pointerleave', finish_door);
                    if(x0 !== x1 || y0 !== y1){
                        let id = get_new_id();
                        let orientation;
                        let width;
                        if(Math.abs(y1-y0) < 4){
                        // if(y1 === y0){
                            orientation = Orientation.HORIZONTAL;
                            width = Math.abs(x1-x0)/REFERENCE.WIDTH;
                        }
                        else if(Math.abs(x1-x0) < 4){
                        // else if(x1 == x0){
                            orientation = Orientation.VERTICAL;
                            width = Math.abs(y1-y0)/REFERENCE.WIDTH;
                        }
                        else if((x1 < x0 && y1 < y0) || (x1 > x0 && y1 > y0)){
                            orientation = Orientation.TOPLEFT_DOWNRIGHT;
                            width = Math.max(Math.abs(y1-y0), Math.abs(x1-x0))/REFERENCE.WIDTH;
                        }
                        else {
                            orientation = Orientation.TOPRIGHT_DOWNLEFT;
                            width = Math.max(Math.abs(y1-y0), Math.abs(x1-x0))/REFERENCE.WIDTH;
                        }
                        if(width < 0.1)
                            return;
                        let x = ((x0 + x1)/2) | 0;
                        let y = ((y0 + y1)/2) | 0;
                        add_door(view.map, id, x, y, current_door, submapid, get_primary_color(), width, orientation);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                    }
                    request_render()
                }
                window.addEventListener('pointerup', finish_door);
                TheCanvas.addEventListener('pointerleave', finish_door);
            }break;
            case ToolType.RECT:{ // TAG toolRECT
                switch(current_rect_type){
                    case RECTTYPE.HOLLOW:{
                        let id = get_new_id();
                        const [x0, y0] = event_to_coord_snapped_off(e, view, snap, smoff);
                        add_rect(view.map, id, x0, y0, submapid, get_primary_color());
                        function add_point(e:MouseEvent){
                            e.stopPropagation();
                            e.preventDefault();
                            const [x1, y1] = event_to_coord_snapped_off(e, view, snap, smoff);
                            change_rect_by_id(view.map, id, x1, y1, x0, y0);
                            request_render();
                        }
                        TheCanvas.addEventListener('pointermove', add_point);
                        function finish_point(){
                            TheCanvas.removeEventListener('pointermove', add_point);
                            window.removeEventListener('pointerup', finish_point);
                            TheCanvas.removeEventListener('pointerleave', finish_point);
                            publish_obj_by_id(view.map, id);
                            note_create_by_id_for_undo(view.map, id);
                        }
                        window.addEventListener('pointerup', finish_point);
                        TheCanvas.addEventListener('pointerleave', finish_point);
                    }break;
                    case RECTTYPE.FILLED:{
                        let id = get_new_id();
                        const [x0, y0] = event_to_coord_snapped_off(e, view, snap, smoff);
                        add_filled_rect(view.map, id, x0, y0, submapid, get_primary_color(), get_secondary_color());
                        function add_point(e:MouseEvent){
                            e.stopPropagation();
                            e.preventDefault();
                            const [x1, y1] = event_to_coord_snapped_off(e, view, snap, smoff);
                            change_filled_rect_by_id(view.map, id, x1, y1, x0, y0);
                            request_render();
                        }
                        TheCanvas.addEventListener('pointermove', add_point);
                        function finish_point(){
                            TheCanvas.removeEventListener('pointermove', add_point);
                            window.removeEventListener('pointerup', finish_point);
                            TheCanvas.removeEventListener('pointerleave', finish_point);
                            publish_obj_by_id(view.map, id);
                            note_create_by_id_for_undo(view.map, id);
                        }
                        window.addEventListener('pointerup', finish_point);
                        TheCanvas.addEventListener('pointerleave', finish_point);
                    }break;
                    case RECTTYPE.SOLID:{
                        let id = get_new_id();
                        const [x0, y0] = event_to_coord_snapped_off(e, view, snap, smoff);
                        add_gridrect(view.map, id, x0, y0, submapid, get_primary_color());
                        const gridrect = view.map.canvas_objs.get(id) as GridRectangle;
                        view.placing_area.is_placing = true;
                        view.placing_area.is_line = false;
                        view.placing_area.x0 = gridrect.base_x+smoff[0];
                        view.placing_area.y0 = gridrect.base_y+smoff[1];
                        view.placing_area.x1 = gridrect.base_x+smoff[0];
                        view.placing_area.y1 = gridrect.base_y+smoff[1];
                        request_render()
                        function add_point(e:MouseEvent){
                            e.stopPropagation();
                            e.preventDefault();
                            const [x1, y1] = event_to_coord_snapped_off(e, view, snap, smoff);
                            change_gridrect_by_id(view.map, id, x1, y1, x0, y0);
                            view.placing_area.x0 = gridrect.base_x+smoff[0];
                            view.placing_area.y0 = gridrect.base_y+smoff[1];
                            view.placing_area.x1 = gridrect.base_x + gridrect.width+smoff[0];
                            view.placing_area.y1 = gridrect.base_y + gridrect.height+smoff[1];
                            request_render();
                        }
                        TheCanvas.addEventListener('pointermove', add_point);
                        function finish_point(){
                            TheCanvas.removeEventListener('pointermove', add_point);
                            window.removeEventListener('pointerup', finish_point);
                            TheCanvas.removeEventListener('pointerleave', finish_point);
                            view.placing_area.is_placing = false;
                            request_render();
                            publish_obj_by_id(view.map, id);
                            note_create_by_id_for_undo(view.map, id);
                        }
                        window.addEventListener('pointerup', finish_point);
                        TheCanvas.addEventListener('pointerleave', finish_point);
                    }break;
                }
            }break;
            case ToolType.ELLIPSE:{ // TAG toolELLIPSE
                let id = get_new_id();
                const [x0, y0] = event_to_coord_snapped_off(e, view, snap, smoff);
                add_ellipse(view.map, id, x0, y0, submapid, get_primary_color(), get_secondary_color(), current_ellipse);
                const ellipse = view.map.canvas_objs.get(id)! as Ellipse;
                view.placing_area.is_placing = true;
                view.placing_area.is_line = false;
                view.placing_area.x0 = ellipse.base_x+smoff[0];
                view.placing_area.y0 = ellipse.base_y+smoff[1];
                view.placing_area.x1 = ellipse.base_x+smoff[0];
                view.placing_area.y1 = ellipse.base_y+smoff[1];
                request_render()
                function add_point(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    const [x1, y1] = event_to_coord_snapped_off(e, view, snap, smoff);
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
                    view.placing_area.x0 = ellipse.base_x+smoff[0];
                    view.placing_area.y0 = ellipse.base_y+smoff[1];
                    view.placing_area.x1 = ellipse.base_x + ellipse.width+smoff[0];
                    view.placing_area.y1 = ellipse.base_y + ellipse.height+smoff[1];
                    request_render();
                }
                TheCanvas.addEventListener('pointermove', add_point);
                function finish_point(){
                    TheCanvas.removeEventListener('pointermove', add_point);
                    window.removeEventListener('pointerup', finish_point);
                    TheCanvas.removeEventListener('pointerleave', finish_point);
                    view.placing_area.is_placing = false;
                    request_render();
                    publish_obj_by_id(view.map, id);
                    note_create_by_id_for_undo(view.map, id);
                }
                window.addEventListener('pointerup', finish_point);
                TheCanvas.addEventListener('pointerleave', finish_point);
            }break;
            case ToolType.TEXT:{ // TAG toolTEXT
                const [x0, y0] = event_to_coord_off(e, view, smoff);
                let dialog = get_dialog('text-input');
                if(!dialog) return;
                dialog.title.textContent = 'Enter Text';
                if(!dialog.f.size.value)
                    dialog.f.size.value = '12';
                const [l, c, r] = [dialog.f.left, dialog.f.center, dialog.f.right];
                l.checked = false;
                c.checked = true;
                r.checked = false;
                dialog.f.text.value = '';
                dialog.f.background.checked = false;
                dialog.f['link-dungeon'].innerHTML = '<option value="-1">No Link</option>'+by_id('current-map-name').innerHTML;
                let submapoptions = '<option value="-1">No Link</option>'
                for(let sm of view.map.submaps){
                    if(sm.flags & CanvasFlag.DELETED) continue;
                    if(sm.hidinguser && sm.hidinguser !== SETTINGS.userid) continue;
                    submapoptions += `<option value="${sm.id}">${sm.title}</option>`;
                }
                dialog.f['link-submap'].innerHTML = submapoptions;
                dialog.f['link-dungeon'].value = '-1';
                dialog.f['link-submap'].value = '-1';
                dialog.f['link-dungeon'].onchange = function(){
                    dialog.f['link-submap'].value = '-1'
                };
                dialog.f['link-submap'].onchange = function(){
                    dialog.f['link-dungeon'].value = '-1'
                };
                dialog.ok_handler = function(){
                    const text = dialog.f.text.value.trim();
                    if(!text) return;
                    let alignment = radio_to_value([l, c, r], [TextAlignment.LEFT, TextAlignment.CENTER, TextAlignment.RIGHT]);

                    let textsize = (+dialog.f.size.value) | 0;
                    if(textsize < 4) textsize = 4;
                    if(textsize > 72) textsize = 72;
                    let map_id = +dialog.f['link-dungeon'].value;
                    // This is annoying otherwise
                    if(map_id == view.map.map_id)
                        map_id = -1;
                    let submap = false;
                    if(map_id == -1){
                        map_id = +dialog.f['link-submap'].value;
                        submap = true;
                    }
                    let id = get_new_id();
                    add_text(view.map, id, x0, y0, submapid, text, textsize, alignment, map_id);
                    // kind of hacky
                    let o = view.map.canvas_objs.get(id)!;
                    if(submap)
                        o.flags |= CanvasFlag.TEXT_LINKS_TO_SUBMAP;
                    if(dialog.f.background.checked)
                        o.flags |= CanvasFlag.TEXT_HAS_BACKGROUND;
                    publish_obj_by_id(view.map, id);
                    note_create_by_id_for_undo(view.map, id);
                    request_render();
                };
                dialog.show_handler = function(){
                    if(!IS_TOUCH) dialog.f.text.focus();
                };
                dialog.show();

            }break;
            case ToolType.IMAGE:{ // TAG toolIMAGE
                const [x0, y0] = event_to_coord_off(e, view, smoff);
                let dialog = get_dialog('image-input');
                if(!dialog) return;
                dialog.title.textContent = 'Enter Image';
                dialog.f.width.value = '';
                dialog.f.height.value = '';
                dialog.f.url.value = '';
                dialog.f.checkbox.checked = false;
                dialog.f.background.checked = false;
                dialog.show_handler = function(){
                    if(!IS_TOUCH) dialog.f.url.focus();
                };
                dialog.ok_handler = function(){
                    const text = dialog.f.url.value.trim();
                    if(!text) return;
                    let width = +dialog.f.width.value;
                    let height = +dialog.f.height.value;
                    if(!width || width < 0) width = 0;
                    if(!height || height < 0) height = 0;
                    const round = dialog.f.checkbox.checked;
                    if(round){
                        width = snap_to_grid(width);
                        height = snap_to_grid(height);
                    }
                    let id = get_new_id();
                    add_image(view.map, id, x0, y0, width, height, submapid, text);
                    if(dialog.f.background.checked)
                        view.map.canvas_objs.get(id)!.flags |= CanvasFlag.IMG_IS_BACKGROUND;
                    publish_obj_by_id(view.map, id);
                    note_create_by_id_for_undo(view.map, id);
                    request_render();
                };
                dialog.show();
            }break;
            case ToolType.TOKEN:{ // TAG toolTOKEN
                if(current_token_type == TOKENTYPE.EZ){
                    const [x0, y0] = event_to_coord_off(e, view, smoff);
                    let dialog = get_dialog('ez-token');
                    if(!dialog) return;
                    dialog.title.textContent = 'Enter Token';
                    dialog.f.color.value = ez_token_color;
                    dialog.f.width.value = gridscale == GRIDSCALE.TEN?'1':'0.5';
                    dialog.f.height.value = gridscale == GRIDSCALE.TEN?'1':'0.5';
                    dialog.f.text.value = '';
                    dialog.show_handler = function(){
                        if(!IS_TOUCH) dialog.f.text.focus();
                    };
                    dialog.ok_handler = function(){
                        const text = dialog.f.text.value.trim();
                        if(!text) return;
                        let width  = +dialog.f.width.value;
                        let height = +dialog.f.height.value;
                        if(!width || width < 0) width = gridscale == GRIDSCALE.TEN?1:0.5;
                        if(!height || height < 0) height = gridscale == GRIDSCALE.TEN?1:0.5;
                        const color = dialog.f.color.value;
                        let id = get_new_id();
                        ez_token_color = color;
                        let snap = get_snap_tl_func();
                        add_ez_token(view.map, id, snap(x0), snap(y0), submapid, text, color, width, height);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                        request_render();
                    };
                    dialog.show();

                }
                else {
                    const [x0, y0] = event_to_coord_off(e, view, smoff);
                    let dialog = get_dialog('img-token');
                    if(!dialog) return;
                    dialog.title.textContent = 'Choose Token';
                    const gallery = dialog.f.gallery;
                    dialog.hide_handler = function(){
                        gallery.innerHTML = '';
                    };
                    dialog.f.width.value = gridscale == GRIDSCALE.TEN?'1':'0.5';
                    dialog.f.height.value = gridscale == GRIDSCALE.TEN?'1':'0.5';
                    dialog.f.url.value = '';
                    function add_img_buttons(){
                        if(PACKED){
                            for(let ti of PACKED.tokens){
                                const button = document.createElement('button');
                                let path = ti[1];
                                const img = token_to_img(ti[2], ti[3], ti[4], ti[5], 64, 64);
                                button.appendChild(img);
                                gallery.appendChild(button);
                                const url = `/tokens/${path}`;
                                button.addEventListener('click', function(){
                                    dialog.f.url.value = url;
                                });
                            }
                        }
                    }
                    add_img_buttons();
                    dialog.ok_handler = function(){
                        const text = dialog.f.url.value.trim();
                        if(!text) return;
                        let id = get_new_id();
                        let snap = get_snap_tl_func();
                        let w = +dialog.f.width.value;
                        let h = +dialog.f.height.value;
                        if(!w || w < 0) w = gridscale == GRIDSCALE.TEN?1:0.5;
                        if(!h || h < 0) h = gridscale == GRIDSCALE.TEN?1:0.5;
                        add_img_token(view.map, id, snap(x0), snap(y0), submapid, text, w, h);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                        request_render();
                    };
                    dialog.show();
                }
            }break;
            case ToolType.FIXTURE:{ // TAG toolFIXTURE
                switch(current_fixture_type){
                    // Legacy: is its own impl
                    case FixtureType.STAIRS:{
                        let id = get_new_id();
                        let [x0, y0] = event_to_coord_snapped_off(e, view, snap, smoff);
                        let obj: Stairs = {
                            type: CanvasType.STAIRS,
                            id: id,
                            base_x:x0,
                            base_y:y0,
                            flags: CanvasFlag.NONE,
                            hidinguser: hiddenid(),
                            submap:submapid,
                            width: 0,
                            height: 0,
                            rotation: Rotation.UP,
                        };
                        add_canv_obj(view.map, obj);
                        view.placing_area.is_placing = true;
                        view.placing_area.is_line = false;
                        const stairs = view.map.canvas_objs.get(id)! as Stairs; // lazy
                        view.placing_area.x0 = x0+smoff[0];
                        view.placing_area.y0 = y0+smoff[1];
                        view.placing_area.x1 = x0+smoff[0];
                        view.placing_area.y1 = y0+smoff[1];
                        // x0 = stairs.base_x;
                        // y0 = stairs.base_y;
                        request_render();
                        function change_stairs_on_move(e:MouseEvent){
                            e.stopPropagation();
                            e.preventDefault();
                            const [ex0, ey0] = event_to_coord_off(e, view, smoff);
                            change_stairs(stairs, x0, y0, ex0, ey0, snap);
                            view.placing_area.x0 = stairs.base_x+smoff[0];
                            view.placing_area.y0 = stairs.base_y+smoff[1];
                            view.placing_area.x1 = stairs.base_x+REFERENCE.WIDTH*stairs.width+smoff[0];
                            view.placing_area.y1 = stairs.base_y+REFERENCE.WIDTH*stairs.height+smoff[1];
                            request_render();
                        }
                        TheCanvas.addEventListener('pointermove', change_stairs_on_move);
                        function finish_point(){
                            view.placing_area.is_placing = false;
                            request_render();
                            TheCanvas.removeEventListener('pointermove', change_stairs_on_move);
                            window.removeEventListener('pointerup', finish_point);
                            TheCanvas.removeEventListener('pointerleave', finish_point);
                            if(stairs.width != 0 && stairs.height != 0){
                                publish_obj_by_id(view.map, id);
                                note_create_by_id_for_undo(view.map, id);
                            }
                            else {
                                stairs.flags |= CanvasFlag.DELETED;
                            }
                        }
                        window.addEventListener('pointerup', finish_point);
                        TheCanvas.addEventListener('pointerleave', finish_point);
                    }break;
                    default:{
                        let id = get_new_id();
                        const [x, y] = event_to_coord_snapped_off(e, view, snap, smoff);
                        const fixture = make_fixture(id, x, y, submapid, current_fixture_type);
                        add_canv_obj(view.map, fixture);
                        view.placing_area.is_placing = true;
                        view.placing_area.is_line = false;
                        view.placing_area.x0 = fixture.base_x+smoff[0];
                        view.placing_area.y0 = fixture.base_y+smoff[1];
                        view.placing_area.x1 = fixture.base_x+smoff[0];
                        view.placing_area.y1 = fixture.base_y+smoff[1];
                        request_render();
                        function move(e:MouseEvent){
                            e.stopPropagation();
                            e.preventDefault();
                            let x0 = x;
                            let y0 = y;
                            let [x1, y1] = event_to_coord_snapped_off(e, view, snap, smoff);
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
                            view.placing_area.x0 = x0+smoff[0];
                            view.placing_area.y0 = y0+smoff[1];
                            view.placing_area.x1 = x1+smoff[0];
                            view.placing_area.y1 = y1+smoff[1];
                            request_render();
                        }
                        TheCanvas.addEventListener('pointermove', move);
                        function finish(){
                            view.placing_area.is_placing = false;
                            request_render();
                            TheCanvas.removeEventListener('pointermove', move);
                            window.removeEventListener('pointerup', finish);
                            TheCanvas.removeEventListener('pointerleave', finish);
                            if(fixture.width != 0 && fixture.height != 0){
                                publish_obj_by_id(view.map, id);
                                note_create_by_id_for_undo(view.map, id);
                            }
                            else {
                                fixture.flags |= CanvasFlag.DELETED;
                            }
                        }
                        window.addEventListener('pointerup', finish);
                        TheCanvas.addEventListener('pointerleave', finish);
                    }break;
                }
            }break;
            case ToolType.MEASURE:{ // TAG toolMEASURE
                let id = get_new_id();
                let snap:(x:number, y:number)=>[number, number];
                if(!submapid && view.map.grid_type & GridType.HEX){
                    snap = function(x:number, y:number):[number, number]{
                        return snap_to_hex_center(x, y);
                    };
                }
                else {
                    let snap_center = get_snap_center_func();
                    snap = function(x:number, y:number):[number, number]{
                        const x0 = snap_center(x);
                        const y0 = snap_center(y);
                        return [x0, y0];
                    };
                }
                const [unsnapped_x, unsnapped_y] = event_to_coord_off(e, view, smoff);
                const [x0, y0] = snap(unsnapped_x, unsnapped_y);
                let measure = make_measure(id, x0, y0, submapid, '#aa0033');
                add_canv_obj(view.map, measure);
                publish_obj_by_id(view.map, id); // don't note create for undo
                request_render();
                function move(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    const [x_, y_] = event_to_coord_off(e, view, smoff);
                    const [x, y] = snap(x_, y_);
                    if(x == measure.x1 && y == measure.y1)
                        return;
                    measure.x1 = x;
                    measure.y1 = y;
                    const stripped = strip_obj(measure);
                    publish_obj_updates(view.map.map_id, [stripped]);
                    request_render();
                }
                TheCanvas.addEventListener('pointermove', move);
                function finish(){
                    publish_delete_by_ids(view.map.map_id, [id]);
                    measure.flags |= CanvasFlag.DELETED;
                    request_render();
                    TheCanvas.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', finish);
                    TheCanvas.removeEventListener('pointerleave', finish);
                }
                window.addEventListener('pointerup', finish);
                TheCanvas.addEventListener('pointerleave', finish);

            }break;
            case ToolType.TILE:{ // TAG toolTILE
                let deleted_ids: Array<number> = [];
                let created_ids:Array<number> = [];
                let drag = false;
                let prevx:number|undefined = undefined; let prevy:number|undefined = undefined;
                function do_tile(x:number, y:number){
                    let old_tile = tile_at(view, x, y, current_tile_type);
                    if(drag){
                        if(old_tile) return;
                    }
                    else {
                        if(old_tile){
                            old_tile.flags |= CanvasFlag.DELETED;
                            deleted_ids.push(old_tile.id);
                        }
                    }
                    let id = get_new_id();
                    created_ids.push(id);
                    switch(current_tile_type){
                        case TileType.FILLED:{
                            let filled: FilledTile = {
                                type: CanvasType.FILLED_TILE,
                                id: id,
                                base_x: x,
                                base_y: y,
                                flags: CanvasFlag.NONE,
                                hidinguser: hiddenid(),
                                submap:submapid,
                                color: get_primary_color(),
                                size: gridscale == GRIDSCALE.TEN?1:0.5,
                            };
                            add_canv_obj(view.map, filled);
                        }break;
                        case TileType.TERRAIN: {
                            let terrain: TerrainTile = {
                                type: CanvasType.TERRAIN_TILE,
                                id: id,
                                base_x: x,
                                base_y: y,
                                flags: CanvasFlag.NONE,
                                hidinguser: hiddenid(),
                                submap:submapid,
                                terrain_id: current_terrain_id,
                            };
                            add_canv_obj(view.map, terrain);
                        }break;
                        case TileType.ICON: {
                            let icon: IconTile = {
                                type: CanvasType.ICON_TILE,
                                id: id,
                                base_x: x,
                                base_y: y,
                                flags: CanvasFlag.NONE,
                                hidinguser: hiddenid(),
                                submap:submapid,
                                terrainicon_id: current_terrain_icon_id,
                            };
                            add_canv_obj(view.map, icon);
                        }break;
                        default:
                            console.assert(false);
                    }
                    request_render();
                }
                function make_tile(e:PointerEvent){
                    let x:number;
                    let y:number;
                    if(view.map.grid_type & GridType.HEX){
                        const [x_, y_] = event_to_coord_off(e, view, smoff);
                        [x, y] = snap_down_to_hex_grid(x_, y_);
                    }
                    else {
                        let snap = get_snap_tl_func();
                        [x, y] = event_to_coord_snapped_off(e, view, snap, smoff);
                    }
                    if(prevx !== undefined && prevy !== undefined){
                        let xdiff = x - prevx;
                        let ydiff = y - prevy;
                        let snap = get_snap_tl_func();
                        // there's a better way to do this, but whatever
                        for(let i = 0; i < 10; i++){
                            let x_ = prevx + i*xdiff/10;
                            let y_ = prevy + i*ydiff/10;
                            if(view.map.grid_type & GridType.HEX){
                                [x_, y_] = snap_down_to_hex_grid(x_, y_);
                            }
                            else {
                                x_ = snap(x_);
                                y_ = snap(y_);
                            }
                            do_tile(x_, y_);
                        }
                    }
                    do_tile(x, y);
                    prevx = x;
                    prevy = y;
                }
                make_tile(e);
                drag = true;
                TheCanvas.addEventListener('pointermove', make_tile);
                function finish(){
                    // console.log('created_ids', created_ids);
                    // console.log('deleted ids', deleted_ids);
                    TheCanvas.removeEventListener('pointermove', make_tile);
                    TheCanvas.removeEventListener('pointerleave', finish);
                    window.removeEventListener('pointerup', finish);
                    publish_objs_by_ids(view.map, created_ids);
                    if(deleted_ids.length){
                        publish_delete_by_ids(view.map.map_id, deleted_ids);
                        node_deletes_and_creates_for_undo(view.map, deleted_ids, created_ids);
                    }
                    else {
                        note_mass_create_for_undo(view.map, created_ids);
                    }
                    request_render();
                };
                window.addEventListener('pointerup', finish);
                TheCanvas.addEventListener('pointerleave', finish);
            }break;
            case ToolType.SUBMAP:{ // TAG toolSUBMAP
                // Don't allow nested submaps
                if(submapid) break;
                let id = get_new_id();
                // could use smoff, whatever
                const [x0, y0] = event_to_coord_snapped(e, view, snap);
                let submap: SubMap = {
                    type: CanvasType.SUBMAP,
                    id: id,
                    base_x: x0,
                    base_y: y0,
                    flags: CanvasFlag.NONE,
                    hidinguser: hiddenid(),
                    submap: 0,
                    width: 0,
                    height: 0,
                    tlx: 0, tly:0,
                    grid_type: GridType.SQUARE,
                    title: "Untitled",
                    grid_color: '',
                    bg_color: '',
                };
                add_canv_obj(view.map, submap);
                request_render();
                function add_point(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    const [x1, y1] = event_to_coord_snapped(e, view, snap);
                    let bx = x0;
                    let width = Math.abs(x1 - x0);
                    if(x1 < bx) bx = x1;
                    let by = y0;
                    if(y1 < by) by = y1;
                    let height = Math.abs(y1 - y0);
                    submap.base_x = bx;
                    submap.base_y = by;
                    submap.width = width;
                    submap.height = height;
                    request_render();
                }
                TheCanvas.addEventListener('pointermove', add_point);
                function finish_point(){
                    TheCanvas.removeEventListener('pointermove', add_point);
                    window.removeEventListener('pointerup', finish_point);
                    TheCanvas.removeEventListener('pointerleave', finish_point);
                    if(submap.width == 0 || submap.height == 0){
                        submap.flags |= CanvasFlag.DELETED;
                    }
                    else {
                        view.map.submaps.push(submap);
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                    }
                    request_render();
                }
                window.addEventListener('pointerup', finish_point);
                TheCanvas.addEventListener('pointerleave', finish_point);
            }break;
            case ToolType.ARC:{ // TAG toolARC
                let id = get_new_id();
                const [x0, y0] = event_to_coord_snapped_off(e, view, snap, smoff);
                // const thickness_input = by_id('line-thickness');
                const thickness = 6; // +thickness_input.value || 4;
                let arc: Arc = {
                    type: CanvasType.ARC,
                    id: id,
                    base_x: x0,
                    base_y: y0,
                    flags: CanvasFlag.NONE,
                    hidinguser: hiddenid(),
                    submap: 0,
                    width: 0,
                    height: 0,
                    start_arc: 0,
                    end_arc: 1,
                    thickness: thickness,
                    color: get_primary_color(),
                };
                add_canv_obj(view.map, arc);
                view.placing_area.is_placing = true;
                view.placing_area.is_line = false;
                view.placing_area.x0 = arc.base_x+smoff[0];
                view.placing_area.y0 = arc.base_y+smoff[1];
                view.placing_area.x1 = arc.base_x+smoff[0];
                view.placing_area.y1 = arc.base_y+smoff[1];
                request_render();
                function add_point(e:MouseEvent){
                    e.stopPropagation();
                    e.preventDefault();
                    const [x1, y1] = event_to_coord_snapped_off(e, view, snap, smoff);
                    let xmin = x0;
                    let xmax = x0;
                    let ymin = y0;
                    let ymax = y0;

                    if(x1 < xmin) xmin = x1;
                    if(x1 > xmax) xmax = x1;
                    if(y1 < ymin) ymin = y1;
                    if(y1 > ymax) ymax = y1;

                    arc.base_x = xmin;
                    arc.base_y = ymin;
                    arc.width = xmax - xmin;
                    arc.height = ymax - ymin;
                    let [rawx, rawy] = event_to_coord_off(e, view, smoff);
                    let angle = Math.atan2(rawx-x0, rawy-y0) * 180/Math.PI;
                    if(current_arc_type == ArcType.QUARTER){
                        if(angle >= -180 && angle < -90){
                            arc.start_arc = 3;
                            arc.end_arc = 4;
                        }
                        else if(angle >= -90 && angle < 0){
                            arc.start_arc = 0;
                            arc.end_arc = 1;
                        }
                        else if(angle >= 0 && angle < 90){
                            arc.start_arc = 1;
                            arc.end_arc = 2;
                        }
                        else {
                            arc.start_arc = 2;
                            arc.end_arc = 3;
                        }
                    }
                    else {
                        if(angle < -135){
                            arc.start_arc = 1;
                            arc.end_arc = 3;
                        }
                        else if(angle < -90){
                            arc.start_arc = 2;
                            arc.end_arc = 4;
                        }
                        else if(angle < -45){
                            arc.start_arc = 0;
                            arc.end_arc = 2;
                        }
                        else if(angle < 0){
                            arc.start_arc = 1;
                            arc.end_arc = 3;
                        }
                        else if(angle < 45){
                            arc.start_arc = 3;
                            arc.end_arc = 5;
                        }
                        else if(angle < 90){
                            arc.start_arc = 0;
                            arc.end_arc = 2;
                        }
                        else if(angle < 135){
                            arc.start_arc = 2;
                            arc.end_arc = 4;
                        }
                        else {
                            arc.start_arc = 3;
                            arc.end_arc = 5;
                        }
                    }
                    view.placing_area.x0 = arc.base_x+smoff[0];
                    view.placing_area.y0 = arc.base_y+smoff[1];
                    view.placing_area.x1 = arc.base_x+smoff[0]+arc.width;
                    view.placing_area.y1 = arc.base_y+smoff[1]+arc.height;
                    request_render();
                }
                TheCanvas.addEventListener('pointermove', add_point);
                function finish_point(){
                    TheCanvas.removeEventListener('pointermove', add_point);
                    window.removeEventListener('pointerup', finish_point);
                    TheCanvas.removeEventListener('pointerleave', finish_point);
                    view.placing_area.is_placing = false;
                    if(arc.width && arc.height){
                        publish_obj_by_id(view.map, id);
                        note_create_by_id_for_undo(view.map, id);
                    }
                    request_render();
                }
                window.addEventListener('pointerup', finish_point);
                TheCanvas.addEventListener('pointerleave', finish_point);
            }break;
            default:{
                console.log('unknown tool:', current_tool);
            }break;
        }
    });
    TheCanvas.addEventListener('pointermove', function(e:PointerEvent){
        let view = get_active_view();
        // NOTE: obj_at handles submap
        let [mx, my] = event_to_coord(e, view);
        view.mouse.x = mx;
        view.mouse.y = my;
        const modified = e.altKey || e.shiftKey || e.metaKey || e.ctrlKey;
        redo_canvas_cursor(view, modified);

    });
    TheCanvas.addEventListener('dblclick', function(e:MouseEvent){
        let view = get_active_view();
        if(current_tool != ToolType.SELECT)
            return;
        if(view.resize.resizing) return;
        let [clicked_x, clicked_y] = event_to_coord(e, view);
        for(let aa of view.action.areas){
            if(point_in_rect(clicked_x, clicked_y, aa.bbox.x0, aa.bbox.y0, aa.bbox.x1, aa.bbox.y1))
                return;
        }
        launch_edit_dialog(view);
    });
    TheCanvas.addEventListener('contextmenu', function(e:MouseEvent){
        e.preventDefault();
        e.stopPropagation();
        ctxmenu_is_active++;
        const ctxmenu = document.createElement('section');
        ctxmenu.classList.add('menu');
        ctxmenu.style.left = e.clientX + 'px';
        ctxmenu.style.top = e.clientY + 'px';
        const view = get_active_view();
        let [x, y] = event_to_coord(e, view);
        x -= TheCanvas.width/2/view.scale;
        y -= TheCanvas.height/2/view.scale;
        let [click_x, click_y] = event_to_coord(e, view);
        function remove_menu(e?:MouseEvent){
            TheCanvas.removeEventListener('pointerdown', remove_menu);
            document.body.removeChild(ctxmenu);
            ctxmenu_is_active--;
            if(e){
                e.stopPropagation();
                e.preventDefault();
            }
        }
        let whenflags = CONTEXTMENUWHENFLAGS.ALWAYS;
        if(view.selected.size == 0){
            whenflags |= CONTEXTMENUWHENFLAGS.NO_SELECTION;
        }
        else {
            whenflags |= CONTEXTMENUWHENFLAGS.ANY_SELECTED;
        }
        if(view.selected.size > 1)
            whenflags |= CONTEXTMENUWHENFLAGS.MULTIPLE_SELECTED;
        if(view.selected.size == 1)
            whenflags |= CONTEXTMENUWHENFLAGS.ONE_SELECTED;
        if(gridscale == GRIDSCALE.TEN)
            whenflags |= CONTEXTMENUWHENFLAGS.GRID_TEN;
        else
            whenflags |= CONTEXTMENUWHENFLAGS.GRID_FIVE;

        TheCanvas.addEventListener('pointerdown', remove_menu);
        type ItemType = {
            label:string;
            func: () => void;
            disabled: boolean;
            whenflags: CONTEXTMENUWHENFLAGS;
        };
        const items: Array<ItemType> = [
            {
                label: 'Ping',
                func: function(){ping_at(view.map, click_x, click_y);},
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Back',
                func: map_hist.go_back,
                disabled: !map_hist.can_go_back(),
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Forward',
                func: map_hist.go_forward,
                disabled: !map_hist.can_go_forward(),
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Zoom In',
                func: function(){zoom_in(view);},
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.NO_SELECTION,
            },
            {
                label: 'Zoom Out',
                func: function(){zoom_out(view);},
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.NO_SELECTION,
            },
            {
                label: 'Reset Zoom',
                func: function(){reset_zoom(view);},
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.NO_SELECTION,
            },
            {
                label: 'Gather Party',
                func: function(){
                    EMIT(FromClient.CANVAS_GATHER, {x:-x, y:-y, map_id:view.map.map_id});
                },
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Battlemode',
                func: function(){
                    EMIT(FromClient.CANVAS_BATTLE, {x:-x, y:-y, map_id:view.map.map_id});
                },
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.GRID_TEN,
            },
            {
                label: 'Dungeonmode',
                func: function(){
                    EMIT(FromClient.CANVAS_DUNGEON_MODE);
                },
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.GRID_FIVE,
            },
            {
                label: 'Rotate Everything',
                func: function(){rotate_everything_90(view);},
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.NO_SELECTION,
            },
            {
                label: 'Hide',
                func: function(){
                    let changed = false;;
                    let before = [];
                    let after = [];
                    for(let obj_id of view.selected){
                        let o = view.map.canvas_objs.get(obj_id)!;
                        if(o.hidinguser == SETTINGS.userid)
                            continue;
                        before.push(strip_obj(o));
                        o.hidinguser = SETTINGS.userid;
                        after.push(strip_obj(o));
                        changed = true;
                    }
                    if(changed){
                        note_updates_for_undo(view.map, before, after);
                        publish_obj_updates(view.map.map_id, after);
                        request_render();
                    }
                },
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.ANY_SELECTED,
            },
            {
                label: 'Unhide',
                func: function(){
                    let changed = false;;
                    let before = [];
                    let after = [];
                    for(let obj_id of view.selected){
                        let o = view.map.canvas_objs.get(obj_id)!;
                        if(o.hidinguser == 0)
                            continue;
                        before.push(strip_obj(o));
                        o.hidinguser = 0;
                        after.push(strip_obj(o));
                        changed = true;
                    }
                    if(changed){
                        note_updates_for_undo(view.map, before, after);
                        publish_obj_updates(view.map.map_id, after);
                        request_render();
                    }
                },
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.ANY_SELECTED,
            },
            {
                label: 'Edit',
                func: function(){
                    launch_edit_dialog(view);
                },
                disabled: edit_is_impossible(view),
                whenflags: CONTEXTMENUWHENFLAGS.ONE_SELECTED,
            },
            {
                label: 'Cut',
                func: function(){
                    clear_copy_buffer();
                    cut_selected_objs_to_copy_buffer(view);
                },
                disabled: view.selected.size === 0,
                whenflags: CONTEXTMENUWHENFLAGS.ANY_SELECTED,
            },
            {
                label: 'Copy',
                func: function(){
                    clear_copy_buffer();
                    copy_selected_objs_to_copy_buffer(view);
                },
                disabled: view.selected.size === 0,
                whenflags: CONTEXTMENUWHENFLAGS.ANY_SELECTED,
            },
            {
                label: 'Paste',
                func: function(){
                    let submapid = 0;
                    let sm = get_submap_at(view, click_x, click_y);
                    if(sm){
                        submapid = sm.id;
                        click_x -= sm.base_x + sm.tlx;
                        click_y -= sm.base_y + sm.tly;
                    }
                    paste_from_copy_buffer_at(view.map, click_x, click_y, submapid);
                },
                disabled: copied_objs.length === 0,
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Copy to Clipboard',
                func: function(){
                    copy_selected_objs_to_clipboard(view);
                },
                disabled: view.selected.size === 0,
                whenflags: CONTEXTMENUWHENFLAGS.ANY_SELECTED,
            },
            {
                label: 'Paste from Clipboard',
                func: function(){
                    let submapid = 0;
                    let sm = get_submap_at(view, click_x, click_y);
                    if(sm){
                        submapid = sm.id;
                        click_x -= sm.base_x + sm.tlx;
                        click_y -= sm.base_y + sm.tly;
                    }
                    paste_from_clipboard_at(view.map, click_x, click_y, submapid);
                },
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Undo',
                func: function(){
                    do_one_undo(view.map);
                },
                disabled: undo_is_impossible(view.map),
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Redo',
                func: function(){
                    do_one_redo(view.map);
                },
                disabled: redo_is_impossible(view.map),
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Reset Camera',
                func: function(){
                    let view = get_active_view();
                    view.camera_x=0;
                    view.camera_y=0;
                    view.scale=1;
                    request_render();
                },
                disabled: false,
                whenflags: CONTEXTMENUWHENFLAGS.ALWAYS,
            },
            {
                label: 'Cancel',
                func: function(){},
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
            menuitem.addEventListener('click', function(){item.func();remove_menu();});
            menuitem.appendChild(document.createTextNode(item.label));
            ctxmenu.appendChild(menuitem);
        }
        document.body.appendChild(ctxmenu);
    });
});

document.addEventListener('DOMContentLoaded', function(){
    const edit_map_button = by_id('edit-map-button');
    const new_map_button = by_id('new-map-button');
    edit_map_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        const active_view = get_active_view();
        const map = active_view.map;
        let dialog = get_dialog('map-input');
        if(!dialog) return;
        dialog.title.textContent = 'Edit Map';
        dialog.f.name.value = map.map_name;
        dialog.f.delete.checked = false;
        const orig_grid_color = map.grid_color;
        link_input_value(orig_grid_color.length?orig_grid_color:'#969696',
            dialog.f['grid-color'], 'onchange', dialog.f['grid-color-text'], 'oninput', function(){
                map.grid_color = dialog.f['grid-color-text'].value;
                request_render();
            });
        const orig_bg_color = map.bg_color;
        link_input_value(orig_bg_color.length?orig_bg_color:'#ffffff',
            dialog.f['bg-color'], 'onchange', dialog.f['bg-color-text'], 'oninput', function(){
                map.bg_color = dialog.f['bg-color-text'].value;
                request_render();
            });
        const hg = dialog.f['hex-grid'];
        const ng = dialog.f['no-grid']
        hg.checked = !!(map.grid_type & GridType.HEX);
        ng.checked = !!(map.grid_type & GridType.NOGRID);
        dialog.f.numbered.checked = !!(map.flags & MapFlags.NUMBERED);
        dialog.f.big.checked = !!(map.flags & MapFlags.BIG_HEX);
        dialog.ok_handler = function(){
            if(dialog.f.delete.checked){
                let dialog = get_dialog('map-delete');
                if(!dialog) return;
                const cant_delete = map.flags & MapFlags.CANT_DELETE;
                dialog.title.innerText = 'Delete Map?';
                if(cant_delete){
                    dialog.f.can.style.display = 'none';
                    dialog.f.cant.style.display = 'initial';
                }
                else {
                    dialog.f.can.style.display = 'initial';
                    dialog.f.cant.style.display = 'none';
                }
                dialog.f.delete.checked = false;
                dialog.ok_handler = function(){
                    if(!dialog.f.delete.checked) return;
                    EMIT(FromClient.CANVAS_DELETE_MAP_REQUEST, active_view.map.map_id);
                };
                dialog.show();
                return;
            }
            const value = dialog.f.name.value.trim();
            if(!value) return;
            if(value != map.map_name){
                rename_map(map, value);
                let msg: NameMapMessage = {map_id:map.map_id, map_name:value};
                EMIT(FromClient.CANVAS_NAME_MAP, msg);
            }
            let gt = hg.checked? GridType.HEX : GridType.SQUARE;
            if(ng.checked) gt |= GridType.NOGRID;
            if(map.grid_type != gt){
                let msg: CanvasGridTypeMsg = {map_id:map.map_id, grid_type:gt};
                EMIT(FromClient.CANVAS_GRID_TYPE, msg);
            }
            let flags = MapFlags.NONE;
            if(dialog.f.numbered.checked)
                flags |= MapFlags.NUMBERED
            if(dialog.f.big.checked)
                flags |= MapFlags.BIG_HEX;
            if((map.flags & (MapFlags.NUMBERED|MapFlags.BIG_HEX)) != flags){
                let msg : CanvasGridNumberedMsg = {map_id:map.map_id, numbered:flags};
                EMIT(FromClient.CANVAS_GRID_NUMBERED, msg);
            }

            let grid_color = dialog.f['grid-color-text'].value;
            if(grid_color == '#969696') grid_color = '';
            if(orig_grid_color != grid_color){
                let msg : CanvasColorMsg = {map_id:map.map_id, color:grid_color};
                EMIT(FromClient.CANVAS_GRID_COLOR, msg);
            }
            let bg_color = dialog.f['bg-color-text'].value;
            if(bg_color == '#ffffff') bg_color = '';
            if(orig_bg_color != bg_color){
                let msg : CanvasColorMsg = {map_id:map.map_id, color:bg_color};
                EMIT(FromClient.CANVAS_BG_COLOR, msg);
            }
        };
        dialog.cancel_handler = function(){
            map.grid_color = orig_grid_color;
            map.bg_color = orig_bg_color;
            request_render();
        };
        dialog.show();
    });
    new_map_button.addEventListener('click', function(e:MouseEvent){
        e.stopPropagation();
        e.preventDefault();
        let dialog = get_dialog('map-input');
        if(!dialog) return;
        dialog.title.textContent = 'New Map';
        dialog.f.name.value = '';

        link_input_value('#969696', dialog.f['grid-color'], 'onchange', dialog.f['grid-color-text'], 'oninput');
        link_input_value('#ffffff', dialog.f['bg-color'], 'onchange', dialog.f['bg-color-text'], 'oninput');
        const hg = dialog.f['hex-grid'];
        const ng = dialog.f['no-grid']
        hg.checked = false;
        ng.checked = false;
        const numbered = dialog.f.numbered;
        numbered.checked = false;
        dialog.f.big.checked = false;
        dialog.show_handler = function(){
            if(!IS_TOUCH) dialog.f.name.focus();
        };
        dialog.ok_handler = function(){
            const value = dialog.f.name.value.trim();
            if(!value) return;
            let gt = hg.checked? GridType.HEX : GridType.SQUARE;
            if(ng.checked) gt |= GridType.NOGRID;
            let flags = MapFlags.NONE;
            if(numbered.checked)
                flags |= MapFlags.NUMBERED
            if(dialog.f.big.checked)
                flags |= MapFlags.BIG_HEX;
            let grid_color = dialog.f['grid-color-text'].value;
            let bg_color = dialog.f['bg-color-text'].value
            if(bg_color == '#ffffff') bg_color = '';
            if(grid_color == '#969696') grid_color = '';
            let msg: NewMapRequest = {name:value, grid_type:gt, flags, grid_color, bg_color};
            EMIT(FromClient.CANVAS_NEW_MAP_REQUEST, msg);
        };
        dialog.cancel_handler = undefined;
        dialog.show();
    });
    by_id('back-map-button').addEventListener('click', function(){
        map_hist.go_back();
    });
    by_id('forward-map-button').addEventListener('click', function(){
        map_hist.go_forward();
    });
});
listen_for(ListenEvent.DARKMODE_CHANGED, request_render);
listen_for(ListenEvent.LAYOUT_CHANGED, resize_canvas);
return {
    export_maps,
    import_maps,
    screenshot,
    request_render,
    resize_canvas,
};
}());

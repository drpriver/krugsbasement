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
//    text: "foo-bar",
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
        points: [],
        color: color,
        path: null,
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
        path.quadraticCurveTo(points[length-4]+base_x, points[length-3]+base_y,  x0, y0);
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
        points: [],
        color: color,
        path: null,
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
document.addEventListener('DOMContentLoaded', resize_canvas);
window.addEventListener('resize', resize_canvas);
const canvas_obj_array = [];
const canvas_objs = {};

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
  for(let i = 0; i < length; ++i){
      let obj = canvas_obj_array[i];
      switch(obj.type){
          case 'freehand-line':{
              ctx.lineWidth = 4;
              ctx.strokeStyle = obj.color;
              ctx.stroke(obj.path);
          }break;
          case 'grid-line':{
              ctx.lineWidth = Math.max(3/scale, 6);
              ctx.strokeStyle = obj.color;
              ctx.stroke(obj.path);
          }break;
      }
  }
  // request_render();
}
document.addEventListener('DOMContentLoaded', render);
let current_tool = "Pan";
document.addEventListener('DOMContentLoaded', function(){
    const tools_div = document.getElementById('tools');
    const tools = tools_div.children;
    
    for(let i = 0; i < tools.length; ++i){
        const tool = tools[i];
        if(tool.innerHTML.trim() === 'Pan'){
            tool.classList.toggle('selected');
        }
        tool.addEventListener('click', function(e){
            e.stopPropagation();
            e.preventDefault();
            current_tool = tool.innerHTML.trim();
            for(let j = 0; j < tools.length; ++j){
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
    if(e.key == 'ArrowLeft'){
      e.stopPropagation();
      e.preventDefault();
      camera_x += 256;
      request_render();
    }
    else if(e.key == 'ArrowRight'){
      e.stopPropagation();
      e.preventDefault();
      camera_x -= 256;
      request_render();
    }
    else if(e.key == 'ArrowUp'){
      e.stopPropagation();
      e.preventDefault();
      camera_y += 256;
      request_render();
    }
    else if(e.key == 'ArrowDown'){
      e.stopPropagation();
      e.preventDefault();
      camera_y -= 256;
      request_render();
    }
  });
  let lineid = 0;
  canvas.addEventListener('mousedown', function(e){
      switch(current_tool){
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
              canvas.removeEventListener('mousemove', pan);
              window.removeEventListener('mouseup', finish_pan);
              canvas.removeEventListener('mouseleave', finish_pan);
            }
            window.addEventListener('mouseup', finish_pan);
            canvas.addEventListener('mouseleave', finish_pan);
          }break;
          case 'Line':{
            ++lineid;
              add_freehand_line(lineid, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y, '#f00');
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
              add_gridline(lineid, e.offsetX/scale-camera_x, e.offsetY/scale-camera_y, '#f00');
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
      }
  });
});

type Bbox = {
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
function bbox_inside(container:Bbox, needle:Bbox):boolean{
    return container.x0 <= needle.x0
            && container.x1 >= needle.x1
            && container.y0 <= needle.y0
            && container.y1 >= needle.y1;
}
function point_in_rect(x:number, y:number, x0:number, y0:number, x1:number, y1:number):boolean{
    return (x >= x0) && (x <= x1) && (y >= y0) && (y <= y1);
}
function point_in_bbox(x:number, y:number, bbox:Bbox):boolean{
    return (x >= bbox.x0) && (x <= bbox.x1) && (y >= bbox.y0) && (y <= bbox.y1);
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
// precondition: bbox
function bbox_overlaps_ellipse(bbox:Bbox, cx:number, cy:number, rx:number, ry:number):boolean {
    // strategy: since we know the bbox doesn't entirely contain the ellipse,
    // check if one of the corners is in the ellipse.
    const x0 = bbox.x0-cx;
    const x1 = bbox.x1-cx;
    const y0 = bbox.y0-cy;
    const y1 = bbox.y1-cy;
    return point_in_ellipse(x0, y0, rx, ry)
        || point_in_ellipse(x0, y1, rx, ry)
        || point_in_ellipse(x1, y0, rx, ry)
        || point_in_ellipse(x1, y1, rx, ry);
}
function point_in_ellipse(x:number, y:number, rx:number, ry:number): boolean {
    // ellipse formula (for around origin) is:
    //
    // x^2/rx^2 + y^2/ry^2 == 1
    //
    // Inside is:
    // x^2/rx^2 + y^2/ry^2 <= 1
    //
    // Rewrite to:
    // x^2*ry^2 + y^2*rx^2 <= rx^2*ry^2
    const ry2 = ry*ry;
    const rx2 = rx*rx;
    return x*x*ry2 + y*y*rx2 <= rx2*ry2;
}

function bbox_overlaps_ellipse_edge(bbox:Bbox, cx:number, cy:number, rx:number, ry:number):boolean{
    if(!ry || !rx) return false;
    const x0 = bbox.x0-cx;
    const x1 = bbox.x1-cx;
    const y0 = bbox.y0-cy;
    const y1 = bbox.y1-cy;

    // x = [x0, x1], y=y0
    // x^2*ry^2 + y^2*rx^2 = rx^2*ry^2
    // y = y0
    // x^2*ry^2 = rx^2*ry^2 - y0^2*rx^2
    // x^2 = (rx^2*ry^2 - y0^2*rx^2)/ry2
    // x = sqrt((rx^2*ry^2 - y0^2*rx^2)/ry2)
    // x = x0 + dx*t
    // dx*t = sqrt((rx^2*ry^2 - y0^2*rx^2)/ry2) - x0
    const rx2 = rx*rx;
    const ry2 = ry*ry;
    const rr2 = rx2*ry2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    // top
    let inner = (rr2 - y0*y0*rx2)/ry2;
    if(inner >= 0){
        let inn = Math.sqrt(inner);
        if( ((inn - x0) <= dx && (inn - x0) >= 0)
            || ((-inn - x0) <= dx && (-inn - x0) >= 0))
            return true;
    }
    // bottom
    inner = (rr2 - y1*y1*rx2)/ry2;
    if(inner >= 0){
        let inn = Math.sqrt(inner);
        if(((inn - x0) <= dx && (inn - x0) >= 0)
            || ((-inn - x0) <= dx && (-inn - x0) >= 0))
            return true;
    }
    // x=x0, y = [y0, y1]
    // x^2*ry^2 + y^2*rx^2 = rx^2*ry^2
    // x = x0
    // y^2*rx^2 = rx^2*ry^2-x0^2*ry^2
    // y^2 = (rx^2*ry^2 - x0^2*ry2)/rx2
    // y = sqrt((rx^2*ry^2 - x0^2*ry^2)/rx2)
    // y = y0 + dy*t
    // dy*t = sqrt((rx^2*ry^2 - x0^2*ry^2)/rx2) - y0
    // left
    inner = (rr2 - x0*x0*ry2)/rx2;
    if(inner >= 0){
        let inn = Math.sqrt(inner);
        if(((inn - y0) <= dy && (inn - y0) >= 0)
            || ((-inn - y0) <= dy && (-inn - y0) >= 0))
            return true;
    }
    // right
    inner = (rr2 - x1*x1*ry2)/rx2;
    if(inner >= 0){
        let inn = Math.sqrt(inner);
        if(((inn - y0) <= dy && (inn - y0) >= 0)
            || ((-inn - y0) <= dy && (-inn - y0) >= 0))
            return true;
    }
    return false;
}

type Triangle = [number, number, number, number, number, number];

function bbox_overlaps_triangle(bbox:Bbox, tri:Triangle):boolean{
    if(line_overlaps_bbox(bbox, tri[0], tri[1], tri[2], tri[3]))
        return true;
    if(line_overlaps_bbox(bbox, tri[2], tri[3], tri[4], tri[5]))
        return true;
    if(line_overlaps_bbox(bbox, tri[4], tri[5], tri[0], tri[1]))
        return true;
    if(point_in_bbox(tri[0], tri[1], bbox))
        return true;
    return point_in_triangle(bbox.x0, bbox.y0, tri);
}

function point_in_triangle(x:number, y:number, tri:Triangle):boolean{

    // tbh I copy-pasted this from stack overflow
    const s = tri[1]*tri[4] - tri[0]*tri[5] + x*(tri[5] - tri[1]) + y*(tri[0] - tri[4]);
    const t = tri[0]*tri[3] - tri[1]*tri[2] + x*(tri[1] - tri[3]) + y*(tri[2] - tri[0]);

    if((s < 0) != (t < 0))
        return false;

    // shoelace algorithm
    const A = -tri[3]*tri[4] + tri[1]*(tri[4] - tri[2]) + tri[0]*(tri[3] - tri[5]) + tri[2]*tri[5];

    return A < 0 ?
              (s <= 0 && s + t >= A)
            : (s >= 0 && s + t <= A);
    return false;
}


function random_color_range(low, high){
    const golden_ratio = 0.618033988749895
    let r = Math.random()
    r += golden_ratio
    r %= 1
    const result = Math.floor(low + r*(high + 1 - low));
    return result;
}

function random_color(){
    let h = random_color_range(0, 360);
    let s = 100;
    // let s = random_color_range(70, 100);
    let v = random_color_range(50, 100);
    if(h === 0)
        h = 1;
    if(h === 360)
        h = 359;
    h /= 360;
    s /= 100;
    v /= 100;
    let h_i = Math.floor(h*6);
    let f = h * 6 - h_i;
    let p = v * (1 - s);
    let q = v * (1 - f*s);
    let t = v * (1 - (1 - f)*s);
    let r = 256;
    let g = 256;
    let b = 256;
    switch(h_i) {
        case 0: 
            r = v; 
            g = t; 
            b = p;  
            break;
        case 1: 
            r = q; 
            g = v; 
            b = p;  
            break;
        case 2: 
            r = p; 
            g = v; 
            b = t;  
            break;
        case 3: 
            r = p; 
            g = q; 
            b = v;  
            break;
        case 4: 
            r = t; 
            g = p; 
            b = v;  
            break;
        case 5: 
            r = v; 
            g = p; 
            b = q;  
            break;
    }

    let result = '#';
    let r_s = Math.floor(r*255).toString(16);
    if(r_s.length < 2)
        r_s = '0'+r_s;
    result = result + r_s;
    let g_s = Math.floor(g*255).toString(16);
    if(g_s.length < 2)
        g_s = '0'+g_s;
    result = result + g_s;
    let b_s = Math.floor(b*255).toString(16);
    if(b_s.length < 2)
        b_s = '0'+b_s;
    result = result + b_s;
    return result;
}

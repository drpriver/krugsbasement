#define STB_RECT_PACK_IMPLEMENTATION
#include "stb_rect_pack.h"
#include <stdio.h>
#include <assert.h>
#include <string.h>

enum {MAX_RECTS = 1024};
struct stbrp_rect rects[MAX_RECTS];
int n_rects;
struct stbrp_node nodes[MAX_RECTS*8];

int pack(int x, int y){
    memset(nodes, 0, sizeof nodes);
    for(int i = 0; i < n_rects; i++){
        rects[i].was_packed = 0;
        rects[i].x = 0;
        rects[i].y = 0;
    }
    struct stbrp_context ctx = {0};
    stbrp_init_target(&ctx, x, y, nodes, sizeof(nodes)/sizeof(nodes[0]));
    int packed = stbrp_pack_rects(&ctx, rects, n_rects);
    return packed;
}

int main(){
    char buff[1024];
    while(fgets(buff, sizeof buff, stdin)){
        struct stbrp_rect* r = &rects[n_rects++];
        assert(n_rects < MAX_RECTS);
        int n = sscanf(buff, "%d,%d,%d", &r->id, &r->w, &r->h);
        assert(n==3);
    }

    enum {UPPER=20000};
    assert(pack(UPPER/2, UPPER/2));
    int x_min=UPPER/2, y_min=UPPER/2; 
    int best=UPPER/2*UPPER/2;
    int spread = UPPER/3;
    int step = spread/4;
    int i = 0;
    while(step){
        int y_ = y_min;
        int x_ = x_min;
        for(int y = y_-spread; y < y_+spread; y += step){
            for(int x = x_-spread; x < x_+spread; x += step){
                if(x * y >= best) continue;
                i++;
                if(pack(x, y)){
                    best = x * y;
                    x_min = x;
                    y_min = y;
                }
            }
        }
        spread /= 2;
        step /= 2;
    }

    // fprintf(stderr, "%d checks\n", i);
    // fprintf(stderr, "%d,%d\n", x_min, y_min);
    fprintf(stdout, "%d,%d\n", x_min, y_min);
    int packed = pack(x_min, y_min);
    assert(packed);

    for(int i = 0; i < n_rects; i++){
        struct stbrp_rect* r = &rects[i];
        assert(r->was_packed);
        printf("%d,%d,%d,%d,%d\n", r->id, r->x, r->y, r->w,r->h);
    }
    return packed == 1? 0: 1;
}

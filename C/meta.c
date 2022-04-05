#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <inttypes.h>
#include <assert.h>
#include <stdarg.h>
#include <errno.h>
#include <unistd.h>
extern void*memmem(const void*, size_t, const void*, size_t);
enum {
    FILE_ERROR = 1,
    FILE_NOT_OPENED = 2,
    FILE_RESULT_ALLOC_FAILURE = 3,
};

typedef struct LongString{
    size_t length;
    const char* text;
}LongString;

typedef struct TextFileResult {
    LongString result;
    int errored;
    int native_error;
} TextFileResult;

typedef struct FileSizeResult {
    size_t result;
    int errored;
    int native_error;
} FileSizeResult;

typedef struct StringView {
    size_t length;
    const char* text;
} StringView;

typedef struct StringBuilder {
    size_t cursor;
    size_t capacity;
    char* data;
} StringBuilder;

static inline
void
sb_check_size(StringBuilder* sb, size_t n){
    if(sb->cursor + n > sb->capacity){
        // this grow strategy is wonky, but this program is so trivial.
        size_t new_size = (sb->capacity + n)*2;
        if(new_size & 15)
            new_size += 16 - (new_size&15);
        char* new_data = realloc(sb->data, new_size);
        assert(new_data);
        sb->data = new_data;
        sb->capacity = new_size;
    }
}

static inline
void
sb_put(StringBuilder* sb, const char* data, size_t size){
    sb_check_size(sb, size);
    char* ptr = sb->data + sb->cursor;
    memcpy(ptr, data, size);
    sb->cursor += size;
}

#define SB_PUT(sb, literal) sb_put(sb, "" literal, sizeof(literal)-1)

static inline
void
sb_printf(StringBuilder* sb, const char* fmt, ...){
    va_list args, args2;
    va_start(args, fmt);
    va_copy(args2, args);
    int size = vsnprintf(NULL, 0, fmt, args);
    va_end(args);
    sb_check_size(sb, size);
    char* ptr = sb->data + sb->cursor;
    int printed = vsnprintf(ptr, sb->capacity-sb->cursor, fmt, args2);
    sb->cursor += printed;
    va_end(args2);
}

static inline
FileSizeResult
file_size_from_fp(FILE* fp){
    FileSizeResult result = {0};
    // sadly, the only way in standard c to do this.
    if(fseek(fp, 0, SEEK_END))
        goto errored;
    result.result = ftell(fp);
    if(result.result < 0)
        goto errored;
    if(fseek(fp, 0, SEEK_SET))
        goto errored;
    // fprintf(stderr, "result.result: %zu\n", result.result);
    return result;

    errored:
    result.errored = FILE_ERROR;
    result.native_error = errno;
    return result;
}

static inline
TextFileResult
read_file(const char* filepath){
    TextFileResult result = {0};
    FILE* fp = fopen(filepath, "rb");
    if(! fp)
        return (TextFileResult){.errored=FILE_NOT_OPENED};
    if(isatty(fileno(fp))){
        StringBuilder sb = {0};
        enum {READ_AMOUNT=4092};
        sb_check_size(&sb, READ_AMOUNT);
        size_t nread = 0;
        for(;;){
            nread = fread(sb.data+sb.cursor, 1, READ_AMOUNT, fp);
            if(nread != READ_AMOUNT){
                if(ferror(fp)){
                    result.errored = 1;
                    result.native_error = errno;
                    free(sb.data);
                    goto finally;
                }
                else
                    break;
            }
        }
        char* text = realloc(sb.data, sb.cursor+1);
        if(!text){
            result.errored = 1;
            result.native_error = ENOMEM;
            free(sb.data);
            goto finally;
        }
        text[sb.cursor] = 0;
        result.result.text = text;
        result.result.length = sb.cursor;
        goto finally;
    }
    FileSizeResult size_e = file_size_from_fp(fp);
    if(size_e.errored){
        fclose(fp);
        result.errored = size_e.errored;
        result.native_error = size_e.native_error;
        return result;
    }
    size_t nbytes = size_e.result;
    char* text = malloc(nbytes+1);
    if(!text){
        result.errored = FILE_RESULT_ALLOC_FAILURE;
        result.native_error = ENOMEM;
        goto finally;
    }
    size_t fread_result = fread(text, 1, nbytes, fp);
    if(fread_result != nbytes){
        result.errored = FILE_ERROR;
        result.native_error = errno;
        free(text);
        goto finally;
    }
    text[nbytes] = '\0';
    result.result.text = text;
    result.result.length = nbytes;
finally:
    fclose(fp);
    return result;
}

static inline
_Bool
eq(const char* a, const char* b, int length){
    return memcmp(a, b, length) == 0;
}

const char*
get_tag_type(const char* tag, int length){
    switch(length){
        case sizeof("h1")-1:
        // case sizeof("h2")-1:
        // case sizeof("td")-1:
        // case sizeof("tr")-1:
            if(eq(tag, "h1", length))     return "HTMLHeadingElement";
            if(eq(tag, "h2", length))     return "HTMLHeadingElement";
            if(eq(tag, "h3", length))     return "HTMLHeadingElement";
            if(eq(tag, "h4", length))     return "HTMLHeadingElement";
            if(eq(tag, "h5", length))     return "HTMLHeadingElement";
            if(eq(tag, "h6", length))     return "HTMLHeadingElement";
            if(eq(tag, "td", length))     return "HTMLTableCellElement";
            if(eq(tag, "th", length))     return "HTMLTableCellElement";
            if(eq(tag, "tr", length))     return "HTMLTableRowElement";
            break;
        case sizeof("div")-1:
            if(eq(tag, "div", length))    return "HTMLDivElement";
            break;
        case sizeof("span")-1:
            if(eq(tag, "span", length))   return "HTMLSpanElement";
            break;
        case sizeof("input")-1:
        /* case sizeof("table")-1;*/
        /* case sizeof("tbody")-1;*/
            if(eq(tag, "input", length))  return "HTMLInputElement";
            if(eq(tag, "table", length))  return "HTMLTableElement";
            if(eq(tag, "tbody", length))  return "HTMLTableSectionElement";
            break;
        case sizeof("select")-1:
        /* case sizeof("iframe")-1:*/
        /* case sizeof("button")-1:*/
        /* case sizeof("canvas")-1:*/
            if(eq(tag, "select", length)) return "HTMLSelectElement";
            if(eq(tag, "iframe", length)) return "HTMLIFrameElement";
            if(eq(tag, "button", length)) return "HTMLButtonElement";
            if(eq(tag, "canvas", length)) return "HTMLCanvasElement";
            break;
        case sizeof("textarea")-1:
            if(eq(tag, "textarea", length)) return "HTMLTextAreaElement";
            break;
        default:
            break;
    }
    fprintf(stderr, "Unknown tag: '%.*s'\n", length, tag);
    return NULL;
}

typedef struct DynArray {
    void* pointer;
    int count, capacity;
} DynArray;

// 0 on success, 1 on failure.
// On Failure, pointer is unaltered.
int
da_check(DynArray* da, size_t elsize){
    if(da->count < da->capacity)
        return 0;
    if(da->capacity >= INT32_MAX/2) return 1;
    int new_cap = da->capacity? da->capacity*2 : 8;
    size_t size = elsize*new_cap;
    void* pointer = realloc(da->pointer, size);
    if(!pointer) return 1;
    da->pointer = pointer;
    da->capacity = new_cap;
    return 0;
}


int main(int argc, char** argv){
    if(argc < 2) return 1;
    const char* INFILE = argv[1];
    TextFileResult fr = read_file(INFILE);
    if(fr.errored){
        fprintf(stderr, "Unable to open: '%s': %s\n", INFILE, strerror(fr.native_error));
        return fr.errored;
    }
    assert(!fr.errored);
    StringBuilder sb = {0};
    const char* end = fr.result.text+fr.result.length;
    const char* text = fr.result.text;
    DynArray previous = {0};
    SB_PUT(&sb, "// NOTE: this file was generated by " __FILE__ "\n"
                "// Do NOT edit this file. Your edits will be lost!\n"
                "\n"
                "// It was generated by scanning");
    sb_put(&sb, INFILE, strlen(INFILE));
    SB_PUT(&sb, "\n"
                "// And finding anything that even looks like an\n"
                "// html tag with an id.\n"
                "\n"
                "interface NodeIdMap {\n");
    enum {LEFT_WIDTH=40};
    for(;;){
        const char* id = memmem(text, end-text, "id=\"", 4);
        if(!id) break;
        id+=4;
        const char* idend = id;
        while(*idend && *idend != '"')
            idend++;
        const char* tag = id;
        while(*tag != '<' && tag != fr.result.text)
            tag--;
        tag++;
        const char* tagend = tag;
        while(*tagend && *tagend != ' ')
            tagend++;
        StringView sv = {.length=idend-id, .text=id};
        StringView* p = previous.pointer;
        for(int i = 0; i < previous.count; i++){
            if(p[i].length == sv.length){
                if(memcmp(p[i].text, sv.text, sv.length) == 0){
                    fprintf(stderr, "Duplicate id: '%.*s'\n", (int)sv.length, sv.text);
                    goto Continue;
                }
            }
        }
        if(da_check(&previous, sizeof(StringView)) != 0){
            fprintf(stderr, "Allocation failure\n");
            return 1;
        }
        ((StringView*)previous.pointer)[previous.count++] = sv;
        int idwidth = (int)(idend-id);
        int padwidth = idwidth < LEFT_WIDTH? LEFT_WIDTH-idwidth : 1;
        int tagwidth = (int)(tagend-tag);
        const char* tagtype = get_tag_type(tag, tagwidth);
        if(!tagtype) return 1;
        sb_printf(&sb, "  '%.*s': %*s%s;\n", idwidth, id, padwidth, "", tagtype);
        Continue:
        text = idend;
    }
    SB_PUT(&sb, "}\n");
    SB_PUT(&sb,
    "//\n"
    "// This generated function allows you to get an element by its id,\n"
    "// in a typed way. This is generated by scanning the output html for\n"
    "// ids and finding the corresponding tag name. The scanner is so dumb\n"
    "// that it is actually brilliant and can even find ids in template\n"
    "// strings.\n"
    "function by_id<K extends keyof NodeIdMap>(id: K): NodeIdMap[K]{\n"
    "    return document.getElementById(id) as NodeIdMap[K];\n"
    "}\n");
    FILE* fp = stdout;
    if(argc > 2)
        fp = fopen(argv[2], "w");
    if(!fp){
        perror("fopen");
        return 3;
    }
    fwrite(sb.data, sb.cursor, 1, fp);
    fclose(fp);
    return 0;
}

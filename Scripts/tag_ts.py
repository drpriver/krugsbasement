#
# Copyright © 2021-2023, David Priver
#
import glob
from enum import IntEnum
from typing import NamedTuple, List
import io
import re
class TagType(IntEnum):
    FUNC = 0
    ENUM = 1
    GLOBAL = 2
    TYPE = 3
    MISC = 4
def textopen(*args, **kwargs):
    return open(*args, **kwargs, encoding='utf-8')
TYPE_TO_KIND = {
        TagType.FUNC:'f',
        TagType.ENUM: 'g',
        TagType.GLOBAL:'v',
        TagType.TYPE:'t',
        TagType.MISC: 'v',
    }

class TagLoc(NamedTuple):
    type: TagType
    query: str
    ident: str
    filename: str
    lineno:int
    is_global: bool

IDENT = r'\b([A-Za-z0-9_]+)\b'
RE = re.compile(r'\b(const\senum|function|type|enum|TAG|(^(let|const|var)))\b\s?'+IDENT)
MATCH_TO_TYPE = {
    'function': TagType.FUNC,
    'type': TagType.TYPE,
    'let': TagType.GLOBAL,
    'const': TagType.GLOBAL,
    'var': TagType.GLOBAL,
    'enum': TagType.TYPE,
    'const enum':TagType.TYPE,
    'TAG': TagType.MISC,
}

def analyze_line(filename:str, lineno:int, line:str) -> List[TagLoc]:
    result = []
    matches = re.finditer(RE, line)
    for m in matches:
        t = MATCH_TO_TYPE[m[1]]
        if m.start() == 0:
            is_global = True
            query = '/^'+m[0]+r'\>/'
        else:
            is_global = False
            query = '/'+m[0]+r'\>/'
        result.append(TagLoc(t, query, m[4], filename, lineno, is_global))
    return result

def get_tags(filename:str) -> List[TagLoc]:
    tags = []
    with textopen(filename) as fp:
        for lineno, line in enumerate(fp):
            tags.extend(analyze_line(filename, lineno+1, line))
    return tags

def get_all_tags() -> List[TagLoc]:
    tsfiles = glob.glob('WebClient/*.ts')
    tsfiles.extend(glob.glob('Generated/*.ts'))
    tags = []
    for filename in tsfiles:
        if 'messages' in filename: continue
        tags.extend(get_tags(filename))
    from . import make_enums
    tags.extend(make_enums.make_tags(make_enums.get_values('types.shared')))
    tags = sorted(tags, key=lambda x: (x.ident, not x.is_global, x.lineno, x.filename, x.type))
    return tags

def format_tag(tag:TagLoc, s:io.StringIO):
    s.write(tag.ident)
    s.write('\t')
    s.write(tag.filename)
    s.write('\t')
    s.write(tag.query)
    s.write(';"')
    s.write('\t')
    s.write(TYPE_TO_KIND[tag.type])
    s.write('\n')


def write_files(tags:List[TagLoc]) -> None:
    tag_s = io.StringIO()
    funcs = io.StringIO()
    variables = io.StringIO()
    types = io.StringIO()
    enum = io.StringIO()
    misc = io.StringIO()
    shenum = io.StringIO()
    shtypes = io.StringIO()
    buffers = {
        TagType.FUNC: funcs,
        TagType.ENUM: enum,
        TagType.GLOBAL: variables,
        TagType.TYPE: types,
        TagType.MISC: misc,
    }
    shared_buffers = {
        TagType.ENUM: shenum,
        TagType.TYPE: shtypes
    }
    for tag in tags:
        format_tag(tag, tag_s)
        buff = buffers[tag.type]
        buff.write(' ')
        buff.write(tag.ident)
        if tag.filename.endswith('.shared'):
            buff = shared_buffers[tag.type]
            buff.write(' ')
            buff.write(tag.ident)
    with textopen('tags', 'w') as fp:
        fp.write('!_TAG_FILE_FORMAT\t2\n')
        fp.write('!_TAG_FILE_SORTED\t1\n')
        fp.write('!_TAG_FILE_AUTHOR\tDavid\n')
        fp.write(tag_s.getvalue())

    with textopen('.vimrc', 'w') as fp:
        fp.write('set path=.,,WebSite/**,WebClient/**,Server/**,Scripts,\n')
        fp.write('au BufEnter *.ts,*.js setlocal ts=4 sw=4 sts=4 et\n')
        fp.write('au BufEnter *.css setlocal ts=2 sw=2 sts=2 et\n')
        fp.write('if &diff\n\nelse\n  au BufEnter *.ts,*.js,*.css setlocal foldmethod=indent\nendif\n')
        fp.write('au BufEnter *.ts setlocal errorformat=%+A\ %#%f\ %#(%l\\\,%c):\ %m,%C%m\n')
        fp.write('hi tsConstant cterm=bold gui=bold\n')
        fp.write('hi tsFunction ctermfg=109 guifg=#664499\n')
        fp.write('au BufEnter *.ts syn keyword Function')
        fp.write(funcs.getvalue())
        fp.write('\n')
        fp.write('au BufEnter *.ts syn keyword Type')
        fp.write(' string number boolean Array Map Set');
        fp.write(types.getvalue())
        fp.write('\n')
        fp.write('au BufEnter *.ts syn keyword tsConstant')
        fp.write(variables.getvalue())
        fp.write('\n')
        fp.write('au BufEnter *.ts syn keyword Enum')
        fp.write(enum.getvalue())
        fp.write('\n')
        fp.write('source shared.vim')
        fp.write('\n')
        fp.write('au BufEnter *.shared syn keyword Type')
        fp.write(shtypes.getvalue())
        fp.write('\n')
        fp.write('au BufEnter *.shared syn keyword Enum')
        fp.write(shenum.getvalue())
        fp.write('\n')

if __name__ == '__main__':
    write_files(get_all_tags())

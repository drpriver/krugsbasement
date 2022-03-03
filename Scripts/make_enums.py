import os
import textwrap
from typing import List, Tuple, Union, Optional, Set, NamedTuple
import hashlib
Comment = str
TypeName = str
class CommentInfo:
    def __init__(self):
        self.comments:List[Comment] = []
    def add_line(self, line:str) -> None:
        raise Exception
        self.append(line)
    def add_comment(self, comment:Comment) -> None:
        self.comments.append(comment.rstrip())
class EnumInfo:
    def __init__(self, name:str, type:str, filename:str, line:int):
        self.filename = filename
        self.line = line
        parts = type.split()
        self.type = parts[0]
        self.flag = False
        if len(parts) > 1:
            for p in parts[1:]:
                if p == 'flag':
                    self.flag = True

        assert self.type in {'str', 'int'}
        self.name = name
        self.items: List[Union[Comment, Tuple[str, str, Optional[Comment]]]] = []
        self.values:Set[str] = set()
        self.keys:Set[str] = set()
    def add_line(self, line:str) -> None:
        k, *v = line.split('=')
        assert v
        v = '='.join(v)
        self.append(k, v)
    def add_comment(self, comment:Comment) -> None:
        self.items.append(comment.strip())
    def append(self, k:str, v:str) -> None:
        k = k.strip()
        v = v.strip()
        comment = None
        if '#' in v:
            v, *comment = v.split('#')
            v = v.strip()
            comment = '#'.join(comment).strip()
        elif '//' in v:
            v, *comment = v.split('//')
            v = v.strip()
            comment = '//'.join(comment).strip()
        if k in self.keys:
            raise Exception(self.name, 'duplicate key:', k)
        if v in self.values and k != 'ALL':
            raise Exception(self.name, 'duplicate value:', v)
        self.keys.add(k)
        self.values.add(v)
        self.items.append((k, v, comment))

class StructInfo:
    def __init__(self, name:str, base:str, filename:str, line:int) -> None:
        self.filename = filename
        self.line = line
        self.name = name
        self.base = base
        if base not in {'array', 'dict'}:
            raise Exception(base)
        self.members: List[Union[Comment, Tuple[str, TypeName, Optional[Comment]]]] = []
        self.member_names: Set[str] = set()
    def add_line(self, line:str) -> None:
        k, *v = line.split('=')
        assert v
        self.append(k, '='.join(v))
    def add_comment(self, comment:Comment) -> None:
        self.members.append(comment.strip())
    def append(self, name:str, type:str) -> None:
        name = name.strip()
        type = type.strip()
        comment = None
        if '#' in type:
            a, *b = type.split('#')
            type = a.strip()
            comment = '#'.join(b).strip()
        elif '//' in type:
            a, *b = type.split('//')
            type = a.strip()
            comment = '//'.join(b).strip()
        if name in self.member_names:
            raise Exception()
        self.member_names.add(name)
        self.members.append((name, type, comment))

class UnionInfo:
    def __init__(self, name:str, filename:str, line:int) -> None:
        self.filename = filename
        self.line = line
        if ':' in name:
            name, base = name.split(':')
            name = name.strip()
            base = base.strip()
        else:
            base = 'array'
        self.name = name
        self.base = base
        self.variants: List[Union[Comment, Tuple[TypeName, Optional[Comment]]]] = []
        self.variant_types: Set[str] = set()
    def add_comment(self, comment:Comment) -> None:
        self.variants.append(comment.strip())
    def add_line(self, line:str) -> None:
        self.append(line)
    def append(self, type:str) -> None:
        type = type.strip()
        comment = None
        if '#' in type:
            a, *b = type.split('#')
            type = a.strip()
            comment = '#'.join(b).strip()
        elif '//' in type:
            a, *b = type.split('//')
            type = a.strip()
            comment = '//'.join(b).strip()
        if type in self.variant_types:
            raise Exception()
        self.variant_types.add(type)
        self.variants.append((type, comment))

class MsgInfo:
    def __init__(self, name:str, enu:str, filename:str, line:int) -> None:
        self.filename = filename
        self.line = line
        self.name = name
        self.enu = enu
        self.items:List[Union[Comment, Tuple[str, str, Optional[str], Optional[Comment]]]] = []
    def add_line(self, line:str) -> None:
        k, v = line.split('=', 1)
        comment = None
        cb = None
        if '#' in v:
            v, comment = v.split('#', 1)
        elif '//' in v:
            v, comment = v.split('//', 1)
        if ',' in v:
            v, cb = v.split(',')
        self.append(k, v, cb, comment)
    def add_comment(self, comment:Comment) -> None:
        self.items.append(comment.strip())
    def append(self, k:str, v:str, cb:Optional[str], comment:Optional[Comment]) -> None:
        k = k.strip()
        v = v.strip()
        if cb:
            cb = cb.strip()
        if comment:
            comment = comment.strip()
        self.items.append((k, v, cb, comment))

Info = Union[EnumInfo, StructInfo, UnionInfo , CommentInfo, MsgInfo]

def get_values(filename:str) -> List[Info]:
    with open(filename, 'rb') as bfp:
        b = bfp.read()
    sh = hashlib.sha256()
    sh.update(b)
    ver = int.from_bytes(sh.digest()[:4], 'little', signed=False)

    fp = open(filename, encoding='utf-8')
    result = []
    current_info: Info = None # type: ignore
    result = []
    lineno = 0
    for line in fp:
        if 'VERSION = 13' in line:
            line = line.replace('13', str(ver))
        lineno += 1
        line = line.rstrip()
        if not line:
            if current_info and isinstance(current_info, CommentInfo):
                current_info = None # type: ignore
            continue
        if line[0] == '\t':
            raise Exception('tab')
        if line.startswith(('#', '//')):
            if not isinstance(current_info, CommentInfo):
                current_info = CommentInfo()
                result.append(current_info)
        if line.strip().startswith(('#', '//')):
            com = line.strip()
            if com.startswith('#'):
                com = com[1:]
            else:
                com = com[2:]
            current_info.add_comment(com)
            continue
        if line[0] != ' ':
            if line.startswith(('#', '//')):
                pass
            elif line.startswith('struct'):
                line = line[len('struct'):].strip()
                name, base = line.split(':')
                current_info = StructInfo(name.strip(), base.strip(), filename, lineno)
            elif line.startswith('enum'):
                line = line[len('enum'):].strip()
                name, type = line.split(':')
                current_info = EnumInfo(name.strip(), type.strip(), filename, lineno)
            elif line.startswith('union'):
                line = line[len('union'):].strip()
                current_info = UnionInfo(line, filename, lineno)
            elif line.startswith('message'):
                line = line[len('message'):].strip()
                name, enu = line.split(':')
                current_info = MsgInfo(name.strip(), enu.strip(), filename, lineno)
            else:
                raise Exception('Unrecognized type', line)
            result.append(current_info)
            continue
        current_info.add_line(line)
    fp.close()
    return result

def make_python(filename:str, infos: List[Info]) -> None:
    fp = open('WebDnD/messages.py', 'w', encoding='utf-8')
    def p(*args, **kwargs):
        print(*args, **kwargs, file=fp)
    p('# Generated via', os.path.relpath(__file__))
    p(f'# Input at "{filename}"')
    p('# DO NOT EDIT THIS FILE DIRECTLY')
    p('from enum import Enum, IntFlag')
    p('from typing import Tuple, Union, List, TYPE_CHECKING')
    p('if TYPE_CHECKING:')
    p('    from typing import TypedDict, Literal')
    p('else:')
    p('    TypedDict = object')
    p('    class Literal_:')
    p('        def __getitem__(self, o):')
    p('            return object')
    p('    Literal = Literal_()')
    p('from .validator import',
        'register_enum,',
        'register_dictstruct,',
        'register_dictstruct_field,',
        'register_arraystruct,',
        'register_arraystruct_field,',
        'register_unionarray,',
        'register_uniondict,',
        'register_union_variant,',
        'register_list')
    p('')
    def convert_type(t:str) -> str:
        if '[' in t[1:]:
            t = t[:1+t[1:].index('[')]
        if t.startswith('['):
            inner = t[1:-1]
            inner = convert_type(inner.strip())
            return f'List[{inner}]'
        if '.' in t: # hack
            return f'Literal[{t}]'
        if t == 'color': return 'str'
        if t not in {'str', 'int', 'float'}:
            return f"'{t}'"
        return t
    for info in infos:
        if isinstance(info, CommentInfo):
            if info.comments:
                p('')
            for comment in info.comments:
                p(f'#{comment}')
        elif isinstance(info, EnumInfo):
            if info.flag and info.type == 'int':
                base = 'IntFlag'
            else:
                base = f'{info.type}, Enum'
            p(f'class {info.name}({base}):')
            for item in info.items:
                if isinstance(item, str):
                    p(f'    # {item}')
                    continue
                elif info.type == 'str':
                    if item[2]:
                        p(f"    {item[0]} = '{item[1]}' # {item[2]}")
                    else:
                        p(f"    {item[0]} = '{item[1]}'")
                else:
                    if item[2]:
                        p(f"    {item[0]} = {item[1]} # {item[2]}")
                    else:
                        p(f"    {item[0]} = {item[1]}")
            p('')
        elif isinstance(info, StructInfo):
            if info.base == 'array':
                p(f'{info.name} = Tuple[', end='')
                for i, member in enumerate(info.members):
                    if isinstance(member, Comment):
                        continue
                    typename = convert_type(member[1])
                    if i != 0:
                        p(f', {typename}', end='')
                    else:
                        p(f'{typename}', end='')
                p('] # type: ignore')
            else:
                p(f'class {info.name}(TypedDict):')
                for member in info.members:
                    if isinstance(member, Comment):
                        p(f'    # {member}')
                        continue
                    typename = convert_type(member[1])
                    p(f'    {member[0]}: {typename}{(" # "+member[2]) if member[2] else ""}')
                p('')
        elif isinstance(info, UnionInfo):
            p(f'{info.name} = Union[', end='')
            for i, variant in enumerate(info.variants):
                if isinstance(variant, Comment):
                    continue
                typename = convert_type(variant[0])
                if i != 0:
                    p(f', {typename}', end='')
                else:
                    p(f'{typename}', end='')
            p('] # type: ignore')
            p('')

    # first forward declare all the types
    p('')
    p('# Forward declare all the types')
    for info in infos:
        if isinstance(info, EnumInfo):
            p(f"register_enum('{info.name}', {info.name})")
        elif isinstance(info, StructInfo):
            if info.base == 'array':
                p(f"register_arraystruct('{info.name}')")
            else:
                p(f"register_dictstruct('{info.name}')")
        elif isinstance(info, UnionInfo):
            if info.base == 'array':
                p(f"register_unionarray('{info.name}')")
            else:
                p(f"register_uniondict('{info.name}')")
    p('')

    structs ={info.name:info for info in infos if isinstance(info, StructInfo)}

    def find_discrim(typename):
        s = structs[typename]
        for member in s.members:
            if isinstance(member, Comment): continue
            name, typename, _ = member
            if name == 'type': return typename
        raise AssertionError

    p('# Register the fields')
    # then register the fields
    for info in infos:
        if isinstance(info, StructInfo):
            if info.base == 'array':
                for member in info.members:
                    if isinstance(member, Comment): continue
                    name, typename, _ = member
                    if typename == 'color': typename = 'str'
                    if typename.startswith('['):
                        inner = typename[1:-1] # hack, only strip one layer off
                        p(f"register_list('{typename}', '{inner}')")
                    if '[' in typename[1:]:
                        typename = typename[:1+typename[1:].index('[')]
                    if '.' in typename: # assume it's an enum, hack
                        p(f"register_arraystruct_field('{info.name}', {typename})")
                    else:
                        p(f"register_arraystruct_field('{info.name}', '{typename}')")
            else:
                for member in info.members:
                    if isinstance(member, Comment): continue
                    name, typename, _ = member
                    if typename == 'color': typename = 'str'
                    if typename.startswith('['):
                        inner = typename[1:-1] # hack, only strip one layer off
                        p(f"register_list('{typename}', '{inner}')")
                    if '[' in typename[1:]:
                        typename = typename[:1+typename[1:].index('[')]
                    if '.' in typename: # assume it's an enum, hack
                        p(f"register_dictstruct_field('{info.name}', '{name}', {typename})")
                    else:
                        p(f"register_dictstruct_field('{info.name}', '{name}', '{typename}')")
            p('')
        elif isinstance(info, UnionInfo):
            for variant in info.variants:
                if isinstance(variant, Comment): continue
                typename, _ = variant
                discrim = find_discrim(typename)
                p(f"register_union_variant('{info.name}', {discrim}, '{typename}')")
            p('')

    fp.flush()
    fp.close()
    fp = open('flask_socketio.pyi', 'w')
    p('from typing import Callable, Union, Dict, Type, Optional, Any, Mapping, overload, Literal')
    p('JSType = Union[str, int, float, dict, list, tuple, Mapping]')
    p('from WebDnD.messages import *')
    # p('def emit(event:Union[str,int], *args:JSType, **kwargs:JSType) -> None:
    # p('    ...
    for info in infos:
        if not isinstance(info, MsgInfo): continue
        if info.name != 'FromClientMsg': continue
        for it in info.items:
            if isinstance(it, Comment): continue
            k, v, _, _ = it
            if v == 'void':
                c = 'Callable[[Callable[[], None]], Callable[[], None]]'
            else:
                v = convert_type(v)
                c = f'Callable[[Callable[[{v}], None]], Callable[[{v}], None]]'
            p(f'{k}_T =', c)
    p('')
    p('class SocketIO:')
    p('    server: Any')
    p('    def run(self, *args:Any, **kwargs:Any) -> Any:')
    p('        ...')
    p('    def __init__(self, *args:Any, **kwargs:Any) -> None:')
    p('        ...')
    for s in ['connect', 'disconnect']:
        p(' '*3, '@overload')
        p(' '*3, f'def on(self, key:Literal[{s!r}]) ->Callable[[Callable[[], None]], Callable[[], None]]:')
        p(' '*7, '...')
    for info in infos:
        if not isinstance(info, MsgInfo): continue
        if info.name != 'FromClientMsg': continue
        for it in info.items:
            if isinstance(it, Comment): continue
            k, _, _, _ = it
            p(' '*3, '@overload')
            p(' '*3,  f'def on(self, key:Literal[FromClient.{k}]) -> {k}_T:')
            p(' '*7, '...')
    p('')
    p('def join_room(room:str, sid:Optional[str]=None, namespace:Optional[str]=None)->None: ...')
    p('def disconnect() -> None: ...')
    for info in infos:
        if not isinstance(info, MsgInfo): continue
        if info.name != 'ToClientMsg': continue
        for it in info.items:
            if isinstance(it, Comment): continue
            k, v, _, _ = it
            p('@overload')
            if v == 'void':
                p(f'def emit(event:Literal[ToClient.{k}], **kwargs:Any) -> None:')
            else:
                p(f'def emit(event:Literal[ToClient.{k}], arg:{convert_type(v)}, **kwargs:Any) -> None:')
            p(' '*3, '...')
    p('')
    fp.flush()
    fp.close()



def make_ts(filename:str, infos:List[Info]) -> None:
    fp = open('Generated/messages.ts', 'w', encoding='utf-8')
    def p(*args, **kwargs):
        print(*args, **kwargs, file=fp)
    p('//', 'messages.ts')
    p('//', '-'*len('messages.ts'))
    p('// Generated via', os.path.relpath(__file__))
    p(f'// Input at "{filename}"')
    p('// DO NOT EDIT THIS FILE DIRECTLY')
    TsTypes = {
            'int': 'number',
            'float': 'number',
            'double': 'number',
            'str': 'string',
            'bool': 'boolean',
            'color': 'string',
            }
    def convert_type(t:str) -> str:
        if '[' in t[1:]:
            t = t[:1+t[1:].index('[')]
        if t in TsTypes:
            return TsTypes[t]
        if t.startswith('['):
            inner = t[1:-1]
            inner = convert_type(inner.strip())
            return f'Array<{inner}>'
        return t

    for info in infos:
        if isinstance(info, CommentInfo):
            if info.comments:
                p('')
            for comment in info.comments:
                p(f'//{comment}')
        elif isinstance(info, EnumInfo):
            p(f'const enum {info.name}', '{')
            for item in info.items:
                if isinstance(item, str):
                    p(f'    // {item}')
                elif info.type == 'str':
                    if item[2]:
                        p(f"    {item[0]} = '{item[1]}', // {item[2]}")
                    else:
                        p(f"    {item[0]} = '{item[1]}',")
                else:
                    if item[2]:
                        p(f"    {item[0]} = {item[1]}, // {item[2]}")
                    else:
                        p(f"    {item[0]} = {item[1]},")
            p('}')
            p('')
        elif isinstance(info, StructInfo):
            if info.base == 'array':
                p(f'type {info.name} = [', end='')
                for i, member in enumerate(info.members):
                    if isinstance(member, Comment):
                        continue
                    typename = convert_type(member[1])
                    if i != 0:
                        p(f', {typename}', end='')
                    else:
                        p(f'{typename}', end='')
                p('];')
            else:
                p(f'type {info.name} =', '{')
                for member in info.members:
                    if isinstance(member, Comment):
                        p(f'    // {member}')
                        continue
                    typename = convert_type(member[1])
                    p(f'    {member[0]}: {typename}{" // "+member[2] if member[2] else ""};')
                p('}')

        elif isinstance(info, UnionInfo):
            p(f'type {info.name} = ', end='')
            for i, variant in enumerate(info.variants):
                if isinstance(variant, Comment):
                    continue
                typename = convert_type(variant[0])
                if i != 0:
                    p(f' | {typename}', end='')
                else:
                    p(f'{typename}', end='')
            p(';')
            p('')
        elif isinstance(info, MsgInfo):
            if 'FromClient' in info.name:
                for it in info.items:
                    if isinstance(it, Comment):
                        continue
                    ty, arg, cb, comment = it
                    if arg == 'void':
                        arg = None
                    if cb:
                        cb = cb[3:-1]
                    if arg and cb:
                        p(f'function EMIT(type:{info.enu}.{ty}, arg:{convert_type(arg)}, cb:(_:{convert_type(cb)})=>void):void;')
                    elif arg:
                        p(f'function EMIT(type:{info.enu}.{ty}, arg:{convert_type(arg)}):void;')
                    elif cb:
                        p(f'function EMIT(type:{info.enu}.{ty}, cb:(_:{convert_type(cb)})=>void):void;')
                    else:
                        p(f'function EMIT(type:{info.enu}.{ty}):void;')
                p(textwrap.dedent('''
                  function EMIT(type:FromClient, arg?:any, cb?:any):void{
                      if(arg && cb){
                          SOCKET.emit(type, arg, cb);
                          return;
                      }
                      if(arg !== undefined){
                          SOCKET.emit(type, arg);
                          return;
                      }
                      if(cb !== undefined){
                          SOCKET.emit(type, cb);
                          return;
                      }
                      SOCKET.emit(type);
                  }
                        '''))
            else:
                assert 'ToClient' in info.name
                for it in info.items:
                    if isinstance(it, Comment):
                        continue
                    ty, arg, cb, comment = it
                    assert not cb
                    if arg == 'void':
                        arg = None
                    if arg:
                        p(f'function ONRECV(type:{info.enu}.{ty}, cb:(arg:{convert_type(arg)})=>void):void;')
                    else:
                        p(f'function ONRECV(type:{info.enu}.{ty}, cb:()=>void):void;')
                p(textwrap.dedent('''
                  function ONRECV(type:ToClient, cb:any):void{
                    SOCKET.on(type, cb);
                  }'''))


    fp.flush()
    fp.close();

def make_c(infos:List[Info], cf=False) -> None:
    fp = open('Generated/messages.h', 'w', encoding='utf-8')
    def p(*args, **kwargs):
        print(*args, **kwargs, file=fp)
    p('#ifndef WEBDND_MESSAGES_H')
    p('#define WEBDND_MESSAGES_H')
    p('#include <stdint.h> // integer types')
    p('#include <stddef.h> // size_t')
    if cf:
        p('#import <CoreFoundation/CFString.h>')
        p('typedef CFStringRef String;')
    else:
        p('typedef struct String {')
        p('    const char* text;')
        p('    size_t length;')
        p('} String;')
    p('typedef float Color[4];')
    enums = {}
    structs = {}
    unions = {}
    for info in infos:
        if isinstance(info, EnumInfo):
            p('typedef enum', info.name, info.name+';')
            enums[info.name] = info
        elif isinstance(info, StructInfo):
            p('typedef struct', info.name, info.name+';')
            structs[info.name] = info
        elif isinstance(info, UnionInfo):
            p('typedef union', info.name, info.name+';')
            unions[info.name] = info
        elif isinstance(info, MsgInfo):
            p(f'typedef union {info.name} {info.name};')
    p('')
    def fix_type(t):
        if '[' in t[1:]:
            t, n = t.split('[')
            n = '[' + n
        else:
            n = ''
        if t == 'str' and n:
            return 'char', n
        typenames = {
            'str': 'String',
            'int': 'int64_t',
            'color': 'Color',
        }
        if t in typenames:
            return typenames[t], n
        if t in unions:
            return t+'*', n
        return t, n
    for info in infos:
        if isinstance(info, EnumInfo):
            p('enum', info.name, '{')
            for item in info.items:
                if isinstance(item, Comment):
                    p('    //', item)
                    continue
                if info.type == 'str':
                    p('   ', f'{info.name}_{item[0]},')
                else:
                    p('   ', f'{info.name}_{item[0]} = {item[1]},')
            p('};')
            if info.type == 'str':
                p('static const String', info.name+'_Strings[] = {')
                for item in info.items:
                    if isinstance(item, Comment):
                        p('    //', item)
                        continue
                    p('    {.text=', f'"{item[1]}", .length=sizeof("{item[1]}")-1', '},')
                p('};')
        elif isinstance(info, StructInfo):
            p('struct', info.name, '{')
            for member in info.members:
                if isinstance(member, Comment):
                    p('    //', member)
                    continue
                name, type, comment = member
                if comment:
                    p('    //', comment)
                if '.' in type:
                    type = type.split('.')[0]
                if type[0] == '[':
                    type = type[1:-1]
                    type, n = fix_type(type)
                    p('    struct {')
                    if type.endswith('*'):
                        p(f'        {type} data{n};')
                    else:
                        p(f'        {type}* data{n};')
                    # int is justified by the fact we're not
                    # going to receive 2 billion items as json
                    p(f'        int count, capacity;')
                    p('    }', name+';')
                else:
                    type, n = fix_type(type)
                    p('   ', type, name+n+';')
            p('};')
            p('')
        elif isinstance(info, UnionInfo):
            p('union', info.name, '{')
            first = next(v for v in info.variants if not isinstance(v, Comment))
            first = next(m for m in structs[first[0]].members if not isinstance(m, Comment))
            discrimtype = first[1].split('.')[0]
            p('    struct {', discrimtype, 'type; } discrim;')
            for variant in info.variants:
                if isinstance(variant, Comment): 
                    p('    //', variant)
                    continue
                typename, _ = variant
                p('   ', typename, typename+'_;')
            p('};')
            p('')
        elif isinstance(info, MsgInfo):
            p('union', info.name, '{')
            p('  struct {', info.enu, 'type; } discrim;')
            i = 1
            for item in info.items:
                if isinstance(item, Comment):
                    p('    //', item)
                    continue
                ty, arg, cb, comment = item
                # p('  _Static_assert(', f'{info.enu}_{ty}', '==', i, ', "Bad enum");')
                if comment:
                    p('     //', comment)
                if arg == 'void':
                    continue
                    p('  struct {', info.enu, f'_type;', '}', ty+ ';')
                elif arg[0] == '[':
                    arg = arg[1:-1]
                    arg, n = fix_type(arg)
                    if not arg.endswith('*'): arg += '*'
                    p('  struct {',end ='')
                    p(info.enu, f'_type;',end='')
                    p(' struct {', arg+' data'+n+';', end='')
                    p(' int count, capacity;', end='')
                    p(' }', 'data'+'; }', ty+ ';')
                else:
                    arg,n = fix_type(arg)
                    p('  struct {', info.enu, f'_type;', arg, 'data'+n+'; }', ty+ ';')
                i += 1
            p('};')
        elif isinstance(info, CommentInfo):
            if info.comments:
                p('')
            for comment in info.comments:
                p(f'//{comment}')


    p('#endif')


def make_tags(infos:List[Info]) -> List['TagLoc']:
    # copy-pasted from tag_ts.py
    from enum import IntEnum
    class TagType(IntEnum):
        FUNC = 0
        ENUM = 1
        GLOBAL = 2
        TYPE = 3
    class TagLoc(NamedTuple):
        type: TagType
        query: str
        ident: str
        filename: str
        lineno:int 
        is_global: bool
    result = []
    for info in infos:
        if isinstance(info, EnumInfo):
            result.append(TagLoc(
                TagType.TYPE,
                f'/^enum {info.name}/',
                info.name,
                info.filename,
                info.line,
                True,
            ))
            for item in info.items:
                if isinstance(item, Comment):
                    continue
                memb = item[0]
                result.append(TagLoc(
                    TagType.ENUM,
                    f'/{memb}/',
                    memb,
                    info.filename,
                    info.line,
                    True))

        elif isinstance(info, StructInfo):
            result.append(TagLoc(
                TagType.TYPE,
                f'/^struct {info.name}/',
                info.name,
                info.filename,
                info.line,
                True,
            ))
        elif isinstance(info, UnionInfo):
            result.append(TagLoc(
                TagType.TYPE,
                f'/^struct {info.name}/',
                info.name,
                info.filename,
                info.line,
                True,
            ))
        elif isinstance(info, MsgInfo):
            result.append(TagLoc(
                TagType.TYPE,
                f'/^message {info.name}/',
                info.name,
                info.filename,
                info.line,
                True,
            ))


    return result


if __name__ == '__main__':
    INPUT = 'types.shared'
    infos = get_values(INPUT)
    make_python(INPUT, infos)
    make_ts(INPUT, infos)
    # make_c(infos)
    # make_c(infos, cf=True)

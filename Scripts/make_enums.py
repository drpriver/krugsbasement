#
# Copyright © 2021-2026, David Priver <david@davidpriver.com>
#
from __future__ import annotations

import hashlib
import io
import os
import re
import sys
import textwrap
from typing import List, Tuple, Union, Optional, Set, NamedTuple, Dict, Any, Literal

# This wrapper is needed because you don't want to
# default to the system locale's encoding!
def textopen(filename:str, mode:Literal['r'|'w']='r') -> io.TextIOWrapper:
    return open(filename,  mode, encoding='utf-8')
Comment = str
TypeName = str
class Error(Exception):
    def __init__(self, lineno:int, msg:str)-> None:
        super().__init__(lineno, msg)


def split_kv(line:str, lineno:int) -> tuple[str, str]:
    try:
        k, v = re.split('[=:]', line, 1)
    except ValueError:
        raise Error(lineno, f"can't split line by '=' or ':': {line!r}")
    if not v:
        raise Error(lineno, f"empty rhs after '=' or ':': {line!r}")
    return k, v

class CommentInfo:
    def __init__(self) -> None:
        self.comments:List[Comment] = []
    def add_line(self, line:str, lineno:int) -> None:
        raise Exception('???')
        self.append(line)
    def add_comment(self, comment:Comment) -> None:
        self.comments.append(comment.rstrip())

class EnumInfo:
    def __init__(self, name:str, type:str, filename:str, line:int) -> None:
        self.filename = filename
        self.line = line
        parts = type.split()
        self.type = parts[0]
        self.flag = False
        if len(parts) > 1:
            for p in parts[1:]:
                if p == 'flag':
                    self.flag = True
                else:
                    raise Error(line, f'Unknown Enum modifier: {p!r}')
        if self.type not in {'str', 'int'}:
            raise Error(line, f'Enum type must be int or str, not {self.type!r}')
        self.name = name
        self.items: List[Union[Comment, Tuple[str, str, Optional[Comment]]]] = []
        self.values:Set[str] = set()
        self.keys:Set[str] = set()

    def minmax(self) -> tuple[int|str, int|str]:
        min = 9999999999
        max = -min
        for val in self.values:
            try:
                v = eval(val)
                if v < min: min = v
                if v > max: max = v
            except:
                continue
        if min == 9999999999:
            vals = [x[1] for x in self.values if not isinstance(x, Comment)]
            return vals[0], vals[-1]
        return min, max
    def add_line(self, line:str, lineno:int) -> None:
        k, v = split_kv(line, lineno)
        assert v
        self.append(k, v, lineno)
    def add_comment(self, comment:Comment) -> None:
        self.items.append(comment.strip())
    def append(self, k:str, v:str, lineno:int) -> None:
        k = k.strip()
        v = v.strip()
        duplicate = False
        if ' ' in k or '\t' in k:
            first, k = k.split(None, 1)
            if first == 'duplicate':
                duplicate = True
            else:
                raise Exception('Unknown leading keyword', first)
            k = k.strip()

        comment:str|None = None
        if '#' in v:
            v, *comment = v.split('#') # type: ignore
            v = v.strip()
            comment = '#'.join(comment).strip() # type: ignore
        elif '//' in v:
            v, *comment = v.split('//') # type: ignore
            v = v.strip()
            comment = '//'.join(comment).strip() # type: ignore
        if k in self.keys:
            raise Error(lineno, f'{self.name}  duplicate key: {k}')
        if not duplicate and v in self.values and k != 'ALL':
            raise Error(lineno, f'{self.name} duplicate value: {v}')
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
            raise Error(line, base)
        self.members: List[Union[Comment, Tuple[str, TypeName, Optional[Comment]]]] = []
        self.member_names: Set[str] = set()
    def add_line(self, line:str, lineno:int) -> None:
        k, v = split_kv(line, lineno)
        assert v
        self.append(k, v, lineno)
    def add_comment(self, comment:Comment) -> None:
        self.members.append(comment.strip())
    def append(self, name:str, type:str, lineno:int) -> None:
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
            raise Error(lineno, f'{self.name} duplicate member name: {name}')
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
    def add_line(self, line:str, lineno:int) -> None:
        self.append(line, lineno)
    def append(self, type:str, lineno:int) -> None:
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
            raise Error(lineno, f'{self.name} duplicate type: {type}')
        self.variant_types.add(type)
        self.variants.append((type, comment))

class MsgInfo:
    def __init__(self, name:str, enu:str, filename:str, line:int) -> None:
        self.filename = filename
        self.line = line
        self.name = name
        self.enu = enu
        self.items:List[Union[Comment, Tuple[str, str, Optional[str], Optional[Comment]]]] = []
    def add_line(self, line:str, lineno:int) -> None:
        k, v = split_kv(line, lineno)
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

class ValidatorInfo:
    def __init__(self, name:str, type:str, filename:str, line:int) -> None:
        self.name = name
        self.type = type
        self.filename = filename
        self.line = line
        self.langs: Set[str] = set()
    def add_comment(self, comment:Comment) -> None:
        pass
    def add_line(self, line:str, lineno:int) -> None:
        line = line.strip()
        if line not in {'ts'}:
            raise Error(lineno, f'Unsupported validator: {line!r}')
        assert line in {'ts'}
        self.langs.add(line)

Info = Union[EnumInfo, StructInfo, UnionInfo , CommentInfo, MsgInfo, ValidatorInfo]

def get_values(filename:str) -> List[Info]:
    with open(filename, 'rb') as bfp:
        b = bfp.read()
    sh = hashlib.sha256()
    sh.update(b)
    ver = int.from_bytes(sh.digest()[:4], 'little', signed=False)

    fp = textopen(filename)
    result:List[Info] = []
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
            raise Error(lineno, 'tab')
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
            elif line.startswith('validator'):
                line = line[len('validator'):].strip()
                name, type = line.split(':')
                current_info = ValidatorInfo(name.strip(), type.strip(), filename, lineno)
            else:
                raise Error(lineno, f'Unrecognized type: {line}')
            result.append(current_info)
            continue
        current_info.add_line(line, lineno)
    fp.close()
    return result

def make_python(filename:str, infos: List[Info]) -> Tuple[str, str]:
    fp = io.StringIO()
    def p(*args:Any, **kwargs:Any) -> None:
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
                p(']')
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
            p(']')
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

    def find_discrim(typename:str) -> str:
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
        elif isinstance(info, MsgInfo):
            for it in info.items:
                if isinstance(it, Comment): continue
                _, typename, _, _ = it
                if typename.startswith('['):
                    inner = typename[1:-1] # hack, only strip one layer off
                    p(f"register_list('{typename}', '{inner}')")

    s1 = fp.getvalue()

    fp = io.StringIO()
    p('from __future__ import annotations')
    p('from typing import Callable, Union, Dict, Type, Optional, Any, Mapping, overload, Literal, List')
    p('JSType = Union[str, int, float, dict, list, tuple, Mapping]')
    p('from Server.WebDnD.messages import *')
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
    s2 = fp.getvalue()
    return s1, s2

def make_ts(filename:str, infos:List[Info]) -> str:
    fp = io.StringIO()
    def p(*args:Any, **kwargs:Any) -> None:
        print(*args, **kwargs, file=fp)
    p('//', 'messages.ts')
    p('//', '-'*len('messages.ts'))
    p('// Generated via', os.path.relpath(__file__))
    p(f'// Input at "{filename}"')
    p('// DO NOT EDIT THIS FILE DIRECTLY')
    TsTypes = {
        'int'    : 'number',
        'float'  : 'number',
        'double' : 'number',
        'str'    : 'string',
        'bool'   : 'boolean',
        'color'  : 'string',
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
    ud_types:Dict[str, Union[EnumInfo, StructInfo, UnionInfo]] = {}
    validators: List[ValidatorInfo] = []
    comment: str | None
    arg: str | None
    for info in infos:
        if isinstance(info, CommentInfo):
            if info.comments:
                p('')
            for comment in info.comments:
                p(f'//{comment}')
        elif isinstance(info, EnumInfo):
            assert info.name not in ud_types
            ud_types[info.name] = info
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
            assert info.name not in ud_types
            ud_types[info.name] = info
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
            assert info.name not in ud_types
            ud_types[info.name] = info
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
                        p(f'// {it}')
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
        elif isinstance(info, ValidatorInfo):
            validators.append(info)

    tns:dict[str, int] = {}
    tni = 0
    def vname(type:str) -> str:
        nonlocal tni
        base = 'v_'
        if '[' in type:
            tn = convert_type(type[1:-1])
            if tn in tns:
                ti = tns[tn]
            else:
                tni += 1
                ti = tni
                tns[tn] = ti
            return base+'a_'+str(ti)
        tn = convert_type(type)
        if tn in tns:
            ti = tns[tn]
        else:
            tni += 1
            ti = tni
            tns[tn] = ti
        return base + str(ti)

    def validator_enum(t:EnumInfo) -> None:
        p('function '+vname(t.name)+'(o:unknown):null|'+t.name+'{')
        if t.type == 'str':
            p('  if(typeof(o) != "string") return null;')
            p('  switch(o){')
            for v in t.values:
                p('    case '+repr(v)+': return o as '+t.name+';')
            p('    ''default: return null;')
            p('  }')
        else:
            assert t.type == 'int'
            p('  if(typeof(o) != "number") return null;')
            p('  if(!Number.isInteger(o)) return null;')
            p('  o|=0;')
            min, max = t.minmax()
            if t.flag:
                p('  if(o < 0) return null;')
            else:
                p('  if(o <', min, ') return null;')
                p('  if(o >', max, ') return null;')
            p('  return o as '+t.name+';')
        p('}')
    def validator_union(t:UnionInfo) -> None:
        first = next(iter(t.variant_types))
        ft = ud_types[first]
        assert isinstance(ft, StructInfo)
        discrim, discrim_type = next((m[0],m[1]) for m in ft.members if not isinstance(m, Comment))
        if '.' in discrim_type:
            discrim_type = discrim_type.split('.')[0]
        validator(discrim_type)
        for ut in t.variant_types:
            validator(ut)
        p('function '+vname(t.name)+'(o:unknown):null|'+t.name+'{')
        if t.base == 'array':
            p('  if(!Array.isArray(o)) return null;')
            p('  if(o.length < 1) return null;')
            p('  const d = '+vname(discrim_type)+'(o[0]);')
            p('  if(d === null) return null;')
            p('  switch(d){')
            for ut in (x[0] for x in t.variants if not isinstance(x, Comment)):
                st = ud_types[ut]
                assert isinstance(st, StructInfo)
                discrim, discrim_type = next((m[0],m[1]) for m in st.members if not isinstance(m, Comment))
                p('    case '+discrim_type+': return '+vname(ut)+'(o);')
            p('    default: return null;')
            p('  }')
        else:
            raise NotImplementedError
        p('}')

    def validator_struct(t:StructInfo) -> None:
        if t.base != 'array':
            raise NotImplementedError
        for _, v, _ in (x for x in t.members if not isinstance(x, Comment)):
            if '.' in v: continue
            validator(v)
        p('function '+vname(t.name)+'(o:unknown):null|'+t.name+'{')
        p('  if(!ckarr(o,', len(t.member_names),')) return null;')
        for i, (_, v, _) in enumerate(x for x in t.members if not isinstance(x, Comment)):
            if '.' in v:
                p('  if(o[', i, '] !==', v, ') return null;')
            else:
                p('  if('+vname(v)+'(o[',i,'])===null) return null;')
        p('  return o as '+t.name+';');
        p('}')

    validated = set()
    p('function ckarr(o:unknown, l:number):o is Array<unknown>{')
    p('  if(!Array.isArray(o)) return false;')
    p('  return o.length == l;')
    p('}')

    def validator_array(type:str) -> None:
        validator(type)
        p('function '+vname('['+type+']')+'(o:unknown):Array<'+convert_type(type)+'>|null{')
        p('  if(!Array.isArray(o)) return null;')
        p('  for(let s of o){')
        p('     if('+vname(type)+'(s) === null) return null;')
        p('  }')
        p('  return o as Array<'+convert_type(type)+'>;')
        p('}')


    def validator(type:str) -> None:
        if vname(type) in validated:
            return
        validated.add(vname(type))
        if type in TsTypes:
            tstype = TsTypes[type]
            if tstype == 'number':
                p('function '+vname(type)+'(o:unknown):null|number{')
                p('  if(typeof(o) != "number") return null;')
                p('  return o as number;')
                p('}')
            elif tstype == 'string':
                p('function '+vname(type)+'(o:unknown):null|string{')
                p('  if(typeof(o) != "string") return null;')
                p('  return o as string;')
                p('}')
            elif tstype == 'boolean':
                p('function '+vname(type)+'(o:unknown):null|boolean{')
                p('  if(typeof(o) != "boolean") return null;')
                p('  return o as boolean;')
                p('}')
            else:
                raise NotImplementedError(tstype)
            return
        if type[0] == '[' and type[-1] == ']':
            validator_array(type[1:-1])
            return
        ud = ud_types[type]
        if isinstance(ud, EnumInfo):
            validator_enum(ud)
        elif isinstance(ud, UnionInfo):
            validator_union(ud)
        elif isinstance(ud, StructInfo):
            validator_struct(ud)
        else:
            raise NotImplementedError(ud)

    for v in validators:
        validator(v.type)
        p('function v_'+v.type+'(o:unknown):null|'+v.type+'{')
        p('  return '+vname(v.type)+'(o);')
        p('}')

    return fp.getvalue()

def make_tags(infos:List[Info]) -> List['TagLoc']: #type: ignore
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
                f'/^enum {info.name}\>/',
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
                    f'/^\s\*{memb}\>/',
                    memb,
                    info.filename,
                    info.line,
                    True))

        elif isinstance(info, StructInfo):
            result.append(TagLoc(
                TagType.TYPE,
                f'/^struct {info.name}\>/',
                info.name,
                info.filename,
                info.line,
                True,
            ))
        elif isinstance(info, UnionInfo):
            result.append(TagLoc(
                TagType.TYPE,
                f'/^union {info.name}\>/',
                info.name,
                info.filename,
                info.line,
                True,
            ))
        elif isinstance(info, MsgInfo):
            result.append(TagLoc(
                TagType.TYPE,
                f'/^message {info.name}\>/',
                info.name,
                info.filename,
                info.line,
                True,
            ))


    return result


if __name__ == '__main__':
    INPUT = 'types.shared'
    try:
        infos = get_values(INPUT)
    except Error as e:
        print(f'{INPUT}:{e.args[0]}', *e.args[1:], file=sys.stderr)
        sys.exit(1)
        raise Exception(INPUT, *e.args) from e
    py, py2 = make_python(INPUT, infos)
    ts = make_ts(INPUT, infos)
    with textopen('Generated/messages.ts', 'w') as fp:
        fp.write(ts)
    with textopen('Server/WebDnD/messages.py', 'w') as fp:
        fp.write(py)
    with textopen('Server/flask_socketio.pyi', 'w') as fp:
        fp.write(py2)

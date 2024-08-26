#
# Copyright © 2021-2024, David Priver
#
from __future__ import annotations
from typing import NamedTuple, Tuple, Callable, Any, List, Dict, TypeVar
T = TypeVar('T')
F = TypeVar('F', bound=Any)
import enum
import functools

class DictStructTypeInfo(NamedTuple):
    items: List[Tuple[str, Callable]]
    def parse(self, obj:Any) -> dict[str, Any]:
        result = {}
        for key, converter in self.items:
            result[key] = converter(obj[key])
        return result
    def __call__(self, obj:Any) -> dict[str, Any]:
        return self.parse(obj)

class ArrayStructTypeInfo(NamedTuple):
    items: List[Callable]
    def parse(self, obj:Any) -> list:
        result = []
        if len(obj) != len(self.items):
            raise TypeError
        for o, item in zip(obj, self.items):
            result.append(item(o))
        return result
    def __call__(self, obj:Any) -> list:
        return self.parse(obj)

class UnionArrayTypeInfo(NamedTuple):
    validators: Dict[Any, Callable]
    def parse(self, obj: Any)->tuple:
        which = obj[0]
        return self.validators[which](obj)
    def __call__(self, obj:Any)->tuple:
        return self.parse(obj)

class UnionDictTypeInfo(NamedTuple):
    validators: Dict[Any, Callable]
    def parse(self, obj:Any) -> dict[str, Any]:
        which = obj['type']
        return self.validators[which](obj)
    def __call__(self, obj:Any) -> dict[str, Any]:
        return self.parse(obj)
class ListTypeInfo(NamedTuple):
    validator: Callable
    def parse(self, obj:Any) -> list:
        return [self.validator(o) for o in obj]
    def __call__(self, obj:Any) -> list:
        return self.parse(obj)

def Float(o:Any) -> float:
    if isinstance(o, int):
        return o
    return float(o)

def Str(o:Any) -> str:
    if not isinstance(o, str):
        raise TypeError
    return str(o)


TYPES:Dict[str, Callable] = {
    'int': int,
    'float': Float,
    'str': Str,
}
def register_enum(name: str, enum: type) -> None:
    assert name not in TYPES
    TYPES[name] = enum

def register_dictstruct(name:str) -> None:
    assert name not in TYPES
    TYPES[name] = DictStructTypeInfo([]) # type: ignore

def register_dictstruct_field(structname:str, fieldname:str, fieldtypename:Any) -> None:
    if isinstance(fieldtypename, enum.Enum):
        fieldtype = type(fieldtypename)
    else:
        fieldtype = TYPES[fieldtypename] # type: ignore
    structtype = TYPES[structname]
    structtype.items.append((fieldname, fieldtype)) # type: ignore

def register_arraystruct(name:str) -> None:
    assert name not in TYPES
    TYPES[name] = ArrayStructTypeInfo([]) # type: ignore

def register_arraystruct_field(structname:str, fieldtypename:Any) -> None:
    if isinstance(fieldtypename, enum.Enum):
        fieldtype = type(fieldtypename)
    else:
        fieldtype = TYPES[fieldtypename] # type: ignore
    structtype = TYPES[structname]
    structtype.items.append(fieldtype) # type: ignore

def register_unionarray(name:str) -> None:
    assert name not in TYPES
    TYPES[name] = UnionArrayTypeInfo({}) # type: ignore

def register_uniondict(name:str) -> None:
    assert name not in TYPES
    TYPES[name] = UnionDictTypeInfo({}) # type: ignore

def register_union_variant(unionname:str, discriminant:Any, variantname:str) -> None:
    varianttype = TYPES[variantname]
    uniontype = TYPES[unionname]
    uniontype.validators[discriminant] = varianttype # type: ignore

def register_list(arrayname:str, typename:str) -> None:
    if arrayname in TYPES:
        return
    t = TYPES[typename]
    TYPES[arrayname]= ListTypeInfo(t) # type: ignore
    TYPES['List'+arrayname]= ListTypeInfo(t) # type: ignore
    TYPES['list'+arrayname]= ListTypeInfo(t) # type: ignore

def validate(name:str, obj:T) -> T:
    return TYPES[name](obj)

def try_validate(name:str, obj:T, default:T) -> T:
    try:
        return TYPES[name](obj)
    except Exception:
        return default

def validated(func:F) -> F:
    @functools.wraps(func)
    def wrapped(*args:Any, **kwargs:Any) -> Any:
        kwargs.update(dict(zip(func.__code__.co_varnames, args)))
        for k, t in func.__annotations__.items():
            if k == 'return': continue
            if k not in kwargs:
                return
            kwargs[k] = validate(t, kwargs[k])
        return func(**kwargs)

    return wrapped # type: ignore

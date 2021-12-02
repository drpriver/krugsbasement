from typing import NamedTuple, Tuple, Callable, Any, List, Dict, TypeVar
T = TypeVar('T')
import enum

class DictStructTypeInfo(NamedTuple):
    items: List[Tuple[str, Callable]]
    def parse(self, obj:Any):
        result = {}
        for key, converter in self.items:
            result[key] = converter(obj[key])
        return result
    def __call__(self, obj):
        return self.parse(obj)

class ArrayStructTypeInfo(NamedTuple):
    items: List[Callable]
    def parse(self, obj:Any):
        result = []
        if len(obj) != len(self.items):
            raise TypeError
        for o, item in zip(obj, self.items):
            result.append(item(o))
        return result
    def __call__(self, obj):
        return self.parse(obj)

class UnionArrayTypeInfo(NamedTuple):
    validators: Dict[Any, Callable]
    def parse(self, obj: Any):
        which = obj[0]
        return self.validators[which](obj)
    def __call__(self, obj):
        return self.parse(obj)

class UnionDictTypeInfo(NamedTuple):
    validators: Dict[Any, Callable]
    def parse(self, obj:Any):
        which = obj['type']
        return self.validators[which](obj)
    def __call__(self, obj):
        return self.parse(obj)
class ListTypeInfo(NamedTuple):
    validator: Callable
    def parse(self, obj:Any):
        return [self.validator(o) for o in obj]
    def __call__(self, obj):
        return self.parse(obj)

def Float(o):
    if isinstance(o, int):
        return o
    return float(o)

def Str(o):
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

def register_dictstruct(name:str):
    assert name not in TYPES
    TYPES[name] = DictStructTypeInfo([]) # type: ignore

def register_dictstruct_field(structname:str, fieldname:str, fieldtypename):
    if isinstance(fieldtypename, enum.Enum):
        fieldtype = type(fieldtypename)
    else:
        fieldtype = TYPES[fieldtypename] # type: ignore
    structtype = TYPES[structname]
    structtype.items.append((fieldname, fieldtype)) # type: ignore

def register_arraystruct(name:str):
    assert name not in TYPES
    TYPES[name] = ArrayStructTypeInfo([]) # type: ignore

def register_arraystruct_field(structname:str, fieldtypename):
    if isinstance(fieldtypename, enum.Enum):
        fieldtype = type(fieldtypename)
    else:
        fieldtype = TYPES[fieldtypename] # type: ignore
    structtype = TYPES[structname]
    structtype.items.append(fieldtype) # type: ignore

def register_unionarray(name:str):
    assert name not in TYPES
    TYPES[name] = UnionArrayTypeInfo({}) # type: ignore

def register_uniondict(name:str):
    assert name not in TYPES
    TYPES[name] = UnionDictTypeInfo({}) # type: ignore

def register_union_variant(unionname:str, discriminant:Any, variantname:str):
    varianttype = TYPES[variantname]
    uniontype = TYPES[unionname]
    uniontype.validators[discriminant] = varianttype # type: ignore

def register_list(arrayname:str, typename:str):
    if arrayname in TYPES:
        return
    t = TYPES[typename]
    TYPES[arrayname]= ListTypeInfo(t) # type: ignore

def validate(name:str, obj:T) -> T:
    return TYPES[name](obj)

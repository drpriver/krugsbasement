from typing import Callable, Optional, Dict, Tuple, List, NamedTuple, Union, Any, Sequence
from enum import IntEnum, IntFlag

class FileCache:
    def remove(self, /, path:str) -> None:
        ...
    def clear(self) -> None:
        ...
    def paths(self) -> List[str]:
        ...
    def store(self, path:str, data:str, overwrite:bool=True) -> bool:
        ...

class MsgType(IntEnum):
    ERROR: int
    WARNING: int
    NODELESS: int
    STATISTIC: int
    DEBUG: int
# Called with (type, filename, line, col, messsage)
ErrorReporter = Optional[Callable[[MsgType, str, int, int, str], None]]

class SynType(IntEnum):
    DOUBLE_COLON: int
    HEADER: int
    NODE_TYPE: int
    ATTRIBUTE: int
    DIRECTIVE: int
    ATTRIBUTE_ARGUMENT: int
    CLASS: int
    RAW_STRING: int
    JS_COMMENT: int
    JS_STRING: int
    JS_REGEX: int
    JS_NUMBER: int
    JS_KEYWORD:int
    JS_KEYWORD_VALUE: int
    JS_VAR: int
    JS_IDENTIFIER: int
    JS_BUILTIN: int
    JS_NODETYPE: int
    JS_BRACE: int

class Flags(IntFlag):
    NONE: int
    INPUT_IS_UNTRUSTED: int
    FRAGMENT_ONLY: int
    DONT_INLINE_IMAGES: int
    NO_THREADS: int
    USE_DND_URL_SCHEME: int
    STRIP_WHITESPACE: int
    DONT_READ: int
    PRINT_STATS: int
    DISALLOW_ATTRIBUTE_DIRECTIVE_OVERLAP: int

class SyntaxRegion(NamedTuple):
    type: SynType
    column: int
    offset: int
    length: int

def htmlgen(
    text:str,
    base_dir:str='.',
    error_reporter:Optional[ErrorReporter]=None,
    file_cache:Optional[FileCache]=None,
    flags:Flags=Flags.NONE,
    output_name:Optional[str] = None,
    jsargs:Optional[Union[dict, list, str]] = None,
) -> Tuple[str, List[str]]:
    ...

def expand(
    text:str,
    base_dir:str='.',
    error_reporter:Optional[ErrorReporter]=None,
    file_cache:Optional[FileCache]=None,
    flags:Flags=Flags.NONE,
    output_name:Optional[str] = None,
    jsargs:Optional[Union[dict, list, str]] = None
) -> str:
    ...

def reformat(text:str, error_reporter:Optional[ErrorReporter]=None) -> str:
    ...

# result is {line: [SyntaxRegion]}
def analyze_syntax_for_highlight(text:str) -> Dict[int, List[SyntaxRegion]]:
    ...

class NodeType(IntEnum):
    MD           =  0
    DIV          =  1
    STRING       =  2
    PARA         =  3
    TITLE        =  4
    HEADING      =  5
    TABLE        =  6
    TABLE_ROW    =  7
    STYLESHEETS  =  8
    LINKS        =  9
    SCRIPTS      = 10
    IMPORT       = 11
    IMAGE        = 12
    BULLETS      = 13
    RAW          = 14
    PRE          = 15
    LIST         = 16
    LIST_ITEM    = 17
    KEYVALUE     = 18
    KEYVALUEPAIR = 19
    IMGLINKS     = 20
    NAV          = 21
    DATA         = 22
    COMMENT      = 23
    CONTAINER    = 24
    QUOTE        = 25
    HR           = 26
    JS           = 27
    DETAILS      = 28
    META         = 29
    INVALID      = 30

class Context:
    def __new__(cls, filecache:Optional[FileCache]) -> Context:
        ...
    errors: List[str]
    filename: Optional[str]
    root: Node
    base_dir: str

    def node_from_int(self, handle:int) -> Node:
        ...
    def node_by_id(self, id:str) -> Optional[Node]:
        ...
    def format_tree(self) -> str:
        ...
    def expand(self) -> str:
        ...
    def render(self) -> str:
        ...
    def make_node(self, type:NodeType, header:Optional[str]=None) -> Node:
        ...
    def resolve_imports(self) -> None:
        ...
    def execute_js(self, jsargs:Any=None) -> None:
        ...
    def gather_links(self) -> None:
        ...
    def resolve_links(self) -> None:
        ...
    def build_nav(self) -> None:
        ...
    def resolve_data_blocks(self) -> None:
        ...
    def select_nodes(self, type:NodeType=None, attributes:Sequence[str]=None, classes:Sequence[str]=None) -> List[Node]:
        ...
    def clone(self) -> Context:
        ...
    def add_link(self, key:str, value:str) -> None:
        ...



class Location(NamedTuple):
    filename: str
    row: int
    column: int

class Node:
    header: str
    type: NodeType
    id: str
    parent: Node
    children: List[Node]
    location: Location
    classes: Tuple[str]
    attributes: Tuple[Tuple[str, str], ...]
    import_: bool
    noid: bool
    hide: bool
    noinline: bool
    ctx: Context
    handle: int
    def set_attribute(self, key:str, value:Optional[str]=None) -> None:
        ...
    def get_attribute(self, key:str) -> Optional[str]:
        ...
    def has_attribute(self, key:str) -> bool:
        ...
    def remove_class(self, cls:str) -> None:
        ...
    def add_class(self, cls:str) -> None:
        ...
    def execute_js(self) -> None:
        ...
    def parse(self, text:str, filename:Optional[str]=None) -> None:
        ...
    def parse_file(self, path:str) -> None:
        ...
    def format(self, indent:int) -> str:
        ...
    def render(self) -> str:
        ...
    def append_child(self, child:Union[Node, str]) -> None:
        ...
    def detach(self) -> None:
        ...
    def make_child(self, type:NodeType, header:Optional[str]=None) -> Node:
        ...
    def tree_repr(self) -> str:
        ...
    ...

__version__: str

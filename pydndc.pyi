from typing import Callable, Optional, Dict, Tuple, List, NamedTuple, Union
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

__version__: str

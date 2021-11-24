from typing import Callable, Optional, Dict, Tuple, List

ErrorReporter = Optional[Callable[[int, str, int, int, str], None]]
SyntaxRegion = Tuple[int, int, int, int]

class FileCache:
    def remove(self, /, path:str) -> None:
        ...
    def clear(self) -> None:
        ...
    def paths(self) -> List[str]:
        ...

def htmlgen(
    text:str,
    base_dir:str='.',
    error_reporter:ErrorReporter=None,
    file_cache:Optional[FileCache]=None,
    flags:int=0,
    ) -> Tuple[str, List[str]]:
    ...

def reformat(text:str, error_reporter:ErrorReporter=None) -> str:
    ...
def analyze_syntax_for_highlight(text:str) -> Dict[int, List[SyntaxRegion]]:
    ...

__version__: str
DOUBLE_COLON: int
HEADER: int
NODE_TYPE: int
ATTRIBUTE: int
ATTRIBUTE_ARGUMENT: int
CLASS: int
RAW_STRING: int
DONT_INLINE_IMAGES: int
NO_THREADS: int
USE_DND_URL_SCHEME: int
PRINT_STATS: int
STRIP_WHITESPACE: int
DONT_READ: int
ERROR_MESSAGE: int
WARNING_MESSAGE: int
NODELESS_MESSAGE: int
STATISTIC_MESSAGE: int
DEBUG_MESSAGE: int

JS_COMMENT: int
JS_STRING: int
JS_REGEX: int
JS_NUMBER: int
JS_KEYWORD: int
JS_KEYWORD_VALUE: int
JS_VAR: int
JS_IDENTIFIER: int
JS_BUILTIN: int
JS_NODETYPE: int
JS_BRACE: int

from typing import Callable, Union, Dict, Type
JSType = Union[str, int, float, dict, list]
def emit(event:str, *args:JSType, **kwargs) -> None:
    ...
SocketIO: Type

#
# Copyright © 2021-2026, David Priver <david@davidpriver.com>
#

from typing import Generic, TypeVar, Any, Union
import threading

T = TypeVar('T')
JsType = Union[str,dict,list,int,float]


class RepeatTimer(threading.Timer):
    def __init__(self, *args:Any, **kwargs:Any) -> None:
        super().__init__(*args, **kwargs)
        self.daemon = True
    def run(self) -> None:
        while not self.finished.wait(self.interval):
            self.function(*self.args, **self.kwargs)

class DirtyCell(Generic[T]):
    def __init__(self, value:T) -> None:
        self._value = value
        self.dirty = True
    @property
    def value(self) -> T:
        return self._value
    @value.setter
    def value(self, val:T) -> None:
        self._value = val
        self.dirty = True

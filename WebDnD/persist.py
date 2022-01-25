import json
import atexit
import os
from typing import Generic, TypeVar, Callable, Optional, Union, Any
import appconfig
import threading
import time
from .logs import logging
from . import db
from abc import abstractmethod

T = TypeVar('T')
JsType = Union[str, dict, list, int, float]


class RepeatTimer(threading.Timer):
    def run(self):
        while not self.finished.wait(self.interval):
            self.function(*self.args, **self.kwargs)
class Persister(Generic[T]):
    '''
    An object that handles saving and loading mutable objects.

    Note that this works its magic by relying on the fact that
    you are passing in an object that will get mutated.

    So, it doesn't work on like ints and shit, but works with
    dicts and lists.
    '''
    @abstractmethod
    def read_obj(self, obj):
        raise NotImplementedError
    @abstractmethod
    def write_obj(self, obj):
        raise NotImplementedError
    def __init__(self, obj:T, name:str, dont_persist=False) -> None:
        '''
        obj: the obj to be persisted.
        name: the name of the object for logging purposes
        dont_persist: don't save
        '''
        self.name = name
        logging.info('loading %s', name)
        self.obj = self.read_obj(obj)
        if dont_persist:
            return
        atexit.register(self.save)
        # RepeatTimer(6000, self.save).start()
        rt = RepeatTimer(60, self.save)
        rt.start()
    def save(self) -> None:
        if hasattr(self.obj, 'dirty') and not self.obj.dirty:
            return
        t0 = time.time()
        try:
            self.write_obj(self.obj)
        except Exception as e:
            logging.error('Error saving %r: %s', self.name, e)
            return
        t1 = time.time()
        logging.info('Saving %s took %.3fms', self.name, (t1-t0)*1000)
        if hasattr(self.obj, 'dirty'):
            self.obj.dirty = False

class Dummy(Generic[T]):
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

class AppKVPersister(Persister[Dummy[T]]):
    def read_obj(self, default:Dummy[T]) -> Dummy[T]:
        val = db.get_app_kv(self.name, default.value)
        return Dummy(val) if val is not None else default
    def write_obj(self, obj:Dummy[T]):
        db.store_app_kv(self.name, obj.value)
    def __init__(self, name:str, default:T):
        super().__init__(Dummy(default), name)



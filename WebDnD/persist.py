import json
import atexit
import os
from typing import Generic, TypeVar, Callable, Optional, Union, Any
from . import appconfig
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
    def __init__(self, obj:T, name:str, save_func:Optional[Callable[[T], JsType]]=None, load_func:Optional[Callable]=None, dont_persist=False) -> None:
        '''
        obj: the obj to be persisted.
        filepath: where to save/load the object.
        save_func: if given, a function that converts the object into something
                   that can be json serialized.
        load_func: if given, a function that converts the json object into the
                   real object.
        dont_persist: don't save
        '''
        self.name = name
        self.save_func = save_func
        logging.info('loading %s', name)
        self.obj = self.read_obj(obj)
        if dont_persist:
            return
        atexit.register(self.save)
        RepeatTimer(6000, self.save).start()
    def save(self) -> None:
        t0 = time.time()
        self.write_obj(self.obj)
        t1 = time.time()
        logging.info('Saving %s took %.3fms', self.name, (t1-t0)*1000)

class Dummy(Generic[T]):
    def __init__(self, value:T) -> None:
        self.value = value

class AppKVPersister(Persister[Dummy[T]]):
    def read_obj(self, default:Dummy[T]) -> Dummy[T]:
        val = db.get_app_kv(self.name, default)
        return Dummy(val) if val is not None else default
    def write_obj(self, obj:Dummy[T]):
        db.store_app_kv(self.name, obj.value)
    def __init__(self, name:str, default:T):
        super().__init__(Dummy(default), name)



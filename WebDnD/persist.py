import json
import atexit
import os
from typing import Generic, TypeVar, Callable, Optional, Union, Any
from . import appconfig
import threading
import time
import logging
logging.basicConfig(level=logging.INFO,format='[%(asctime)s][%(levelname)s] - %(funcName)s: %(message)s')

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
    def __init__(self, obj:T, filepath:str, save_func:Optional[Callable[[T], JsType]]=None, load_func:Optional[Callable[[JsType], T]]=None, dont_persist=False) -> None:
        '''
        obj: the obj to be persisted.
        filepath: where to save/load the object.
        save_func: if given, a function that converts the object into something
                   that can be json serialized.
        load_func: if given, a function that converts the json object into the
                   real object.
        dont_persist: don't save
        '''
        self.obj = obj
        self.filepath = filepath
        self.save_func = save_func
        logging.info(f'loading from {filepath}')
        try:
            with open(filepath, 'r') as fp:
                jsobj = json.load(fp)
                if load_func:
                    self.obj = load_func(jsobj)
                else:
                    self.obj = jsobj
        except Exception as e:
            logging.error(e)
        if dont_persist:
            return
        atexit.register(self.save)
        RepeatTimer(6000, self.save).start()
    def save(self) -> None:
        t0 = time.time()
        dirname = os.path.dirname(self.filepath)
        if dirname and dirname != '.':
            os.makedirs(dirname, exist_ok=True)
        try:
            obj = self.save_func(self.obj) if self.save_func else self.obj
            with open(self.filepath+'_', 'w') as fp:
                fp.write(json.dumps(obj, separators=(',',':')))
            os.rename(self.filepath+'_', self.filepath)
        except Exception as e:
            logging.error(e)
        t1 = time.time()
        logging.info(f'Saving {self.filepath} took {(t1-t0)*1000:.3}ms')

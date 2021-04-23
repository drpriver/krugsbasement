import json
import atexit
import os
class Persister:
    '''
    An object that handles saving and loading mutable objects.

    Note that this works its magic by relying on the fact that
    you are passing in an object that will get mutated.

    So, it doesn't work on like ints and shit, but works with
    dicts and lists.
    '''
    def __init__(self, obj, filepath):
        self.obj = obj
        self.filepath = filepath
        try:
            with open(filepath, 'r') as fp:
                self.obj = json.load(fp)
        except Exception as e:
            print(e)
        atexit.register(self.save)
    def save(self) -> None:
        dirname = os.path.dirname(self.filepath)
        if dirname and dirname != '.':
            os.makedirs(dirname, exist_ok=True)
        try:
            with open(self.filepath+'_', 'w') as fp:
                json.dump(self.obj, fp)
            os.rename(self.filepath+'_', self.filepath)
        except Exception as e:
            print(e)

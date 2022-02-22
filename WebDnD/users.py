from . import db
from typing import Optional, NamedTuple
from werkzeug.security import generate_password_hash, check_password_hash
import appconfig

class User(NamedTuple):
    userid: int
    name: str
    passhash: str
    is_authenticated:bool = True
    is_anonymous:bool = False
    is_active:bool = True

    @classmethod
    def lookup_by_id(cls, userid:int) -> Optional['User']:
        lookup = db.lookup_user_by_id(userid)
        if lookup is None: return None
        name, passhash = lookup
        return cls(userid, name, passhash)

    @classmethod
    def lookup_by_name(cls, name:str) -> Optional['User']:
        lookup = db.lookup_user_by_name(name)
        if lookup is None: return None
        userid, passhash = lookup
        return cls(userid, name, passhash)

    def get_id(self) -> str:
        return str(self.userid)

    def check_password(self, password:str) -> bool:
        if appconfig.DEV:
            return True
        return check_password_hash(self.passhash, password)

    @classmethod
    def create(cls, name:str, password:str, email:str) -> Optional['User']:
        passhash = generate_password_hash(password)
        userid = db.create_user(name, passhash, email)
        if userid is None: return None
        return cls(userid, name, passhash)
    
    def __repr__(self) -> str:
        return f'User(userid={self.userid!r}, name={self.name!r})'

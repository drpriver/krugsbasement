#
# Copyright © 2021-2024, David Priver
#
from __future__ import annotations
from . import db
from werkzeug.security import generate_password_hash, check_password_hash
import appconfig

ADMINS: set[str] = set(getattr(appconfig, 'ADMINS', []))

class User:
    def __init__(self,
        userid: int,
        name: str,
        passhash: str,
        is_authenticated:bool = True,
        is_anonymous:bool = False,
        is_active:bool = True,
    ) -> None:
        self.userid           = userid
        self.name             = name
        self.passhash         = passhash
        self.is_authenticated = is_authenticated
        self.is_anonymous     = is_anonymous
        self.is_active        = is_active

    @property
    def is_admin(self) -> bool:
        return self.name in ADMINS

    @classmethod
    def lookup_by_id(cls, userid:int) -> User | None:
        lookup = db.lookup_user_by_id(userid)
        if lookup is None: return None
        name, passhash = lookup
        return cls(userid, name, passhash)

    @classmethod
    def lookup_by_email(cls, email:str) -> User | None:
        if not email:
            return None
        lookup = db.lookup_user_by_email(email)
        if lookup is None: return None
        userid, name, passhash = lookup
        return cls(userid, name, passhash)

    @classmethod
    def lookup_by_name(cls, name:str) -> User | None:
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

    def change_password(self, password:str) -> bool:
        if not password:
            return False
        passhash = generate_password_hash(password)
        ok = db.change_user_password(self.userid, passhash)
        if not ok:
            return False
        self.passhash = passhash
        return ok

    def change_email(self, email:str) -> bool:
        if not email:
            return False
        ok = db.change_user_email(self.userid, email)
        return ok

    @classmethod
    def create(cls, name:str, password:str, email:str) -> User | None:
        passhash = generate_password_hash(password)
        userid = db.create_user(name, passhash, email)
        if userid is None: return None
        return cls(userid, name, passhash)

    def __repr__(self) -> str:
        return f'User(userid={self.userid!r}, name={self.name!r})'

import os
import threading
import sqlite3
from typing import Optional, Dict, Tuple, List, Any, NamedTuple
import json
import datetime
from .logs import logging
import atexit
from appconfig import DBNAME
conn = sqlite3.connect(DBNAME, check_same_thread=False)
atexit.register(lambda: (logging.info('closing db'), conn.close())) # type: ignore
# Make it threadsafe
# The R is for re-entrant
DBLOCK = threading.RLock()

DBVERSION = 13
with conn:
    conn.execute("PRAGMA encoding = 'UTF-8';")
    conn.execute('PRAGMA foreign_keys = ON;')
    conn.execute('PRAGMA synchronous = NORMAL;')
    conn.execute('PRAGMA journal_mode = WAL;')
def setup_tables() -> None:
    version = conn.execute('PRAGMA user_version;').fetchone()[0]
    if version == DBVERSION:
        return
    conn.execute(f'PRAGMA user_version = {DBVERSION};')
    # empty db
    if version == 0:
        # Key-value store for random app data
        conn.execute('''
            CREATE TABLE appdata (
                key STRING PRIMARY KEY UNIQUE,
                value ANY
            );
        ''')
        conn.execute('''
            CREATE TABLE users (
                userid INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                name TEXT NOT NULL UNIQUE, /* must be unique, but allowed to change */
                passhash TEXT NOT NULL,
                email TEXT /* may be null */
            );
        ''')
        conn.execute('''
            CREATE TABLE usercampprefs (
                userid INTEGER NOT NULL,
                campaignid INTEGER NOT NULL,
                data BLOB, /* json blob */
                PRIMARY KEY(userid, campaignid),
                FOREIGN KEY(campaignid) REFERENCES campaigns(id),
                FOREIGN KEY(userid) REFERENCES users(userid)
            );
        ''')
        conn.execute('''
            CREATE TABLE userglobprefs (
                userid INTEGER NOT NULL UNIQUE,
                data BLOB, /* json blob */
                FOREIGN KEY(userid) REFERENCES users(userid)
            );
        ''')
        conn.execute('''
            CREATE TABLE campaigns (
                id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                name TEXT NOT NULL,
                owner INTEGER,
                deleted INTEGER DEFAULT 0,
                public INTEGER DEFAULT 0,
                FOREIGN KEY(owner) REFERENCES users(userid)
            );
        ''')
        # What campaigns a user has joined
        conn.execute('''
            CREATE TABLE joinedcampaigns (
                userid INTEGER NOT NULL,
                campaignid INTEGER NOT NULL,
                FOREIGN KEY(userid) REFERENCES users(userid),
                FOREIGN KEY(campaignid) REFERENCES campaigns(id)
            );
        ''')
        conn.execute('''
            CREATE TABLE magicinvitations (
                campaignid INTEGER NOT NULL,
                magic INTEGER NOT NULL,
                created TEXT,
                FOREIGN KEY(campaignid) REFERENCES campaigns(id),
                PRIMARY KEY(campaignid, magic)
            );
        ''')
        # What private campaigns a user is allowed to join
        # key-value store for random campaign data
        conn.execute('''
            CREATE TABLE campkv (
                campaignid INTEGER NOT NULL,
                key STRING,
                value ANY,
                FOREIGN KEY(campaignid) REFERENCES campaigns(id),
                PRIMARY KEY(campaignid, key)
            );
        ''')
        # Each map is its own row. The objects on
        # that map are just stored as a json blob
        # for now. Idk if there should be a
        # separate table just for canvas objs.
        # My intuition about what is fast or slow
        # is lacking and this avoids extra selects?
        conn.execute('''
            CREATE TABLE maps (
                campaignid INTEGER NOT NULL,
                mapid INTEGER NOT NULL, /* generated in app layer */
                name TEXT NOT NULL,
                objects BLOB NOT NULL, /* json dump */
                flags INTEGER NOT NULL,
                grid_type INTEGER NOT NULL,
                FOREIGN KEY(campaignid) REFERENCES campaigns(id),
                PRIMARY KEY(campaignid, mapid)
            );
        ''')
        # Chats are append only.
        conn.execute('''
            CREATE TABLE chats (
                msgid INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                campaignid INTEGER NOT NULL,
                type INTEGER NOT NULL,
                chatname TEXT, /* display name, not unique identifier */
                created TEXT, /* UTC datetime */
                data BLOB, /* json dump */
                userid INTEGER, /* often NULL */
                FOREIGN KEY(userid) REFERENCES users(userid),
                FOREIGN KEY(campaignid) REFERENCES campaigns(id)
            );
        ''')
        conn.execute('''
            CREATE TABLE notes (
                campaignid INTEGER NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                flags INTEGER NOT NULL,
                noteid INTEGER NOT NULL,
                FOREIGN KEY(campaignid) REFERENCES campaigns(id),
                PRIMARY KEY(campaignid, noteid)
            );
        ''')
        conn.execute('''
            CREATE TABLE rolltables (
                campaignid INTEGER NOT NULL UNIQUE,
                data BLOB, /* json dump */
                FOREIGN KEY(campaignid) REFERENCES campaigns(id)
            );
        ''')
    if version < 2:
        conn.execute('''
            ALTER TABLE
                usercampprefs
            ADD COLUMN
                macros BLOB; /* json array blob */
        ''')
        conn.execute('''
            ALTER TABLE
                usercampprefs
            ADD COLUMN
                variables BLOB; /* json array blob */
        ''')
    if version < 5:
        # unreleased, so whatever
        try:
            conn.execute(''' DROP TABLE userglobprefs;''')
        except Exception as e:
            print(e)
        conn.execute('''
        CREATE TABLE
            userglobprefs(
                userid INTEGER NOT NULL,
                key TEXT NOT NULL,
                value ANY,
                PRIMARY KEY(userid, key),
                FOREIGN KEY(userid) REFERENCES users(userid)
            );
        ''')
    if version < 6:
        conn.execute('''
            DROP TABLE usercampprefs;
        ''')
        conn.execute('''
            CREATE TABLE usercampprefs (
                userid INTEGER NOT NULL,
                campaignid INTEGER NOT NULL,
                category TEXT NOT NULL,
                key TEXT NOT NULL,
                value BLOB, /* json blob */
                PRIMARY KEY(userid, campaignid, category, key),
                FOREIGN KEY(campaignid) REFERENCES campaigns(id),
                FOREIGN KEY(userid) REFERENCES users(userid)
            );
        ''')
    if version < 7:
        maps = conn.execute('''
        SELECT * FROM maps;
        ''').fetchall()
        for m in maps:
            campid, mapid, name, objects, flags, grid_type = m
            objs: List[list] = json.loads(objects)
            for o in objs:
                o.insert(5, 0) # hidinguser
            objs_ = json.dumps(objs)
            conn.execute('''
            UPDATE maps
            SET objects = ?
            WHERE campaignid = ? AND mapid = ?;
            ''',(objs_, campid, mapid))
    if version < 8:
        conn.execute('''
            CREATE TABLE privaterolltables (
                userid INTEGER NOT NULL,
                campaignid INTEGER NOT NULL,
                data BLOB, /* json dump */
                PRIMARY KEY(userid, campaignid),
                FOREIGN KEY(campaignid) REFERENCES campaigns(id),
                FOREIGN KEY(userid) REFERENCES users(userid)
            );
        ''')
    if version < 9:
        conn.execute('''
            CREATE TABLE privatechats (
                msgid INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                campaignid INTEGER NOT NULL,
                type INTEGER NOT NULL,
                chatname TEXT, /* display name, not unique identifier */
                created TEXT, /* UTC datetime */
                data BLOB, /* json dump */
                userid INTEGER NOT NULL,
                touserid INTEGER NOT NULL,
                FOREIGN KEY(userid) REFERENCES users(userid),
                FOREIGN KEY(touserid) REFERENCES users(userid),
                FOREIGN KEY(campaignid) REFERENCES campaigns(id)
            );
        ''')
    if version < 10:
        maps = conn.execute('''
        SELECT * FROM maps;
        ''').fetchall()
        for m in maps:
            campid, mapid, name, objects, flags, grid_type = m
            objs = json.loads(objects)
            for o in objs:
                o.insert(6, 0) # submap
            objs_ = json.dumps(objs)
            conn.execute('''
            UPDATE maps
            SET objects = ?
            WHERE campaignid = ? AND mapid = ?;
            ''',(objs_, campid, mapid))
    if version < 11:
        conn.execute('''
        ALTER TABLE
            maps
        ADD COLUMN
            grid_color TEXT
        DEFAULT ''
        ;
        ''')
    if version < 12:
        conn.execute('''
        ALTER TABLE
            maps
        ADD COLUMN
            bg_color TEXT
        DEFAULT ''
        ;
        ''')
    if version < 13:
        maps = conn.execute('''
        SELECT * FROM maps;
        ''').fetchall()
        for m in maps:
            campid, mapid, name, objects, flags, grid_type, grid_color, bg_color = m
            objs: List[list] = json.loads(objects) # type: ignore
            for o in objs:
                # add grid_color and bg_color to SUBMAP
                if o[0] == 18:
                    o.append('')
                    o.append('')
            objs_ = json.dumps(objs)
            conn.execute('''
            UPDATE maps
            SET objects = ?
            WHERE campaignid = ? AND mapid = ?;
            ''',(objs_, campid, mapid))



with conn:
    setup_tables()

def get_campaigns() -> Dict[str, int]:
    result = {}
    with DBLOCK:
        for row in conn.execute('''
            SELECT
                id, name
            FROM
                campaigns
            ;
            '''):
            result[row[1]] = row[0]
    return result

def get_users_campaigns(userid:int) -> List[Tuple[int, str]]:
    with DBLOCK:
        return conn.execute('''
        SELECT
            id, name
        FROM
            campaigns
        JOIN
            (SELECT
                campaignid
            FROM
                joinedcampaigns
            WHERE
                userid = ?
            )
        ON
            campaigns.id = campaignid
        UNION
            SELECT
                id, name
            FROM
                campaigns
            WHERE
                public = 1
            ;
        ''', (userid,)).fetchall()

def get_owned_campaigns(userid:int) -> List[Tuple[int, str, str]]:
    with DBLOCK:
        rows = conn.execute('''
        SELECT id, name, magic
        FROM
            campaigns
        LEFT JOIN
           magicinvitations
        ON
            campaigns.id = magicinvitations.campaignid
        WHERE
            owner = ?
        ;
        ''', (userid,)).fetchall()
        # logging.info('%r owns %r', userid, rows)
        return rows

def user_owns_campaign(userid:int, campaignid:int) -> bool:
    with DBLOCK:
        row = conn.execute('''
        SELECT 1
        FROM campaigns
        WHERE
            owner = ? AND id = ?
        ;
        ''', (userid, campaignid)).fetchone()
        return row is not None

def user_has_joined(userid:int, campaignid:int) -> bool:
    with DBLOCK:
        return conn.execute('''
        SELECT 1
        FROM joinedcampaigns
        WHERE
            userid = ? and campaignid = ?
        ;
        ''', (userid, campaignid)).fetchone() is not None

def user_may_access_campaign(userid:int, campaignid:int) -> bool:
    with DBLOCK:
        return conn.execute('''
            SELECT 1
            FROM joinedcampaigns
            WHERE
                userid = ? and campaignid = ?
        UNION
            SELECT 1
            FROM campaigns
            WHERE
                public = 1
            AND
                id = ?
        ;
        ''', (userid, campaignid, campaignid)).fetchone() is not None

def store_app_kv(key:str, value:Any) -> None:
    with DBLOCK, conn:
        conn.execute('''
        INSERT INTO
            appdata(key, value)
        VALUES
            (?, ?)
        ON CONFLICT(key)
            DO UPDATE SET value=excluded.value
        ;
        ''', (key, value))
def get_app_kv(key:str, default:Any=None) -> Optional[Any]:
    with DBLOCK:
        cur = conn.execute('''
        SELECT
            value
        FROM
            appdata
        WHERE
            key = ?
        ;
        ''', (key,))
        row = cur.fetchone()
        if row is None and default is not None:
            with conn:
                conn.execute('''
                    INSERT INTO
                        appdata(key, value)
                    VALUES
                        (?, ?)
                    ;
                ''', (key, default))
            return default
    return row[0] if row else None
def store_campaign_kv(id: int, key:str, value:Any) -> None:
    with DBLOCK, conn:
        conn.execute('''
        INSERT INTO
            campkv(campaignid, key, value)
        VALUES
            (?, ?, ?)
        ON CONFLICT(campaignid, key)
            DO UPDATE SET value=excluded.value
        ;
        ''', (id, key, value))
def get_campaign_kv(id:int, key:str, default:Any=None)->Optional[Any]:
    with DBLOCK:
        cur = conn.execute('''
        SELECT
            value
        FROM
            campkv
        WHERE
            campaignid = ? AND key = ?
        ;
        ''', (id, key,))
        row = cur.fetchone()
        if row is None and default is not None:
            with conn:
                conn.execute('''
                    INSERT INTO
                        campkv(campaignid, key, value)
                    VALUES
                        (?, ?, ?)
                    ;
                ''', (id, key, default))
            return default
    return row[0] if row else None

# I'm just always using the DBLOCK as it is not clear to me
# if it is safe to execute this code concurrently.
# Definitely isn't safe for writes, unclear for reads.
# Also unclear if the conn object itself is thread-safe.
def save_chat_msg(campaignid:int, msgtype:int, chatname:str, data:Any, created:Any=None, userid:int=None) -> None:
    data = json.dumps(data, separators=(',',':'))
    with DBLOCK, conn:
        conn.execute('''
        INSERT INTO
            chats(campaignid, type, chatname, created, data, userid)
        VALUES
            (?, ?, ?, ?, ?, ?)
        ;
        ''', (campaignid, msgtype, chatname, created, data, userid))

def save_private_chat_msg(campaignid:int, msgtype:int, chatname:str, data:Any, created:Any, userid:int, to:int) -> None:
    data = json.dumps(data, separators=(',',':'))
    with DBLOCK, conn:
        conn.execute('''
        INSERT INTO
            privatechats(campaignid, type, chatname, created, data, userid, touserid)
        VALUES
            (?, ?, ?, ?, ?, ?, ?)
        ;
        ''', (campaignid, msgtype, chatname, created, data, userid, to))

def save_map(id:int, map_id:int, map_name:str, objects:list, flags:int, grid_type:int, grid_color:str, bg_color:str) -> None:
    blob = json.dumps(objects, separators=(',',':'))
    with DBLOCK, conn:
        conn.execute('''
            INSERT INTO
                maps(campaignid, mapid, name, objects, flags, grid_type, grid_color, bg_color)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(campaignid, mapid)
            DO UPDATE SET
                name      = excluded.name,
                objects   = excluded.objects,
                flags     = excluded.flags,
                grid_type = excluded.grid_type,
                grid_color = excluded.grid_color,
                bg_color = excluded.bg_color
            ;
        ''', (id, map_id, map_name, blob, flags, grid_type, grid_color, bg_color))
def map_convert(row:tuple) -> dict:
    result = dict(
        map_id = row[1],
        map_name = row[2],
        objects = json.loads(row[3]),
        flags = row[4],
        grid_type = row[5],
        grid_color = row[6],
        bg_color = row[7],
    )
    return result

def get_map(id:int, mapid:int) -> Optional[dict]:
    with DBLOCK:
        cur = conn.execute('''
            SELECT
                *
            FROM
                maps
            WHERE
                campaignid = ? AND mapid = ?
            ;
        ''', (id, mapid))
        row = cur.fetchone()
        return map_convert(row) if row is not None else None
def get_maps(id:int) -> List[dict]:
    with DBLOCK, conn:
        cur = conn.execute('''
            SELECT
                *
            FROM
                maps
            WHERE
                campaignid = ?
            ;
        ''', (id, ))
        return [map_convert(row) for row in cur.fetchall()]

def get_rolltable(id:int) -> Optional[list]:
    with DBLOCK:
        cur = conn.execute('''
            SELECT
                data
            FROM
                rolltables
            WHERE
                campaignid = ?
        ''', (id,))
        row = cur.fetchone()
    return json.loads(row[0]) if row else None

def get_private_rolltable(userid:int, campaignid:int) -> Optional[list]:
    with DBLOCK:
        cur = conn.execute('''
            SELECT
                data
            FROM
                privaterolltables
            WHERE
                userid = ? AND campaignid = ?
        ''', (userid,campaignid))
        row = cur.fetchone()
    return json.loads(row[0]) if row else None

def save_rolltable(id:int, data:list) -> None:
    data_ = json.dumps(data, separators=(',',':'))
    with DBLOCK, conn:
        conn.execute('''
        INSERT INTO
            rolltables(campaignid, data)
        VALUES
            (?, ?)
        ON CONFLICT(campaignid)
            DO UPDATE SET data=excluded.data
        ;
        ''', (id, data_))

def save_private_rolltable(userid:int, campaignid:int, data:list) -> None:
    data_ = json.dumps(data, separators=(',',':'))
    with DBLOCK, conn:
        conn.execute('''
        INSERT INTO
            privaterolltables(userid, campaignid, data)
        VALUES
            (?, ?, ?)
        ON CONFLICT(userid,campaignid)
            DO UPDATE SET data=excluded.data
        ;
        ''', (userid, campaignid, data_))

def lookup_campaign(name:str) -> Optional[int]:
    with DBLOCK:
        cur = conn.execute('''
            SELECT
                id
            FROM
                campaigns
            WHERE
                name = ?
            ;
        ''', (name,))
        row = cur.fetchone()
    # logging.info('campaign: %r, row: %r', name, row)
    if row: return row[0]
    return None

class CampaignInfo(NamedTuple):
    id: int
    name: str
    owner: int
    deleted: int
    public: int


def campaign_info(campaignid:int) -> Optional[CampaignInfo]:
    with DBLOCK:
        row = conn.execute('''
        SELECT
            *
        FROM
            campaigns
        WHERE
            id = ?
        ;
        ''', (campaignid,)).fetchone()
    if row is not None:
        return CampaignInfo(*row)
    return None

def create_campaign(name:str, owner:int=None) -> int:
    with DBLOCK, conn:
        cur = conn.execute('''
        INSERT INTO
            campaigns(name, owner)
        VALUES
            (?, ?)
        ;
        ''', (name, owner))
        return cur.lastrowid


def get_chat(id:int) -> list:
    with DBLOCK:
        cur = conn.execute('''
            SELECT
                type, chatname, data
            FROM
                chats
            WHERE
                campaignid = ?
            ORDER BY
                msgid DESC
            LIMIT 100;
        ''', (id,))
        rows = cur.fetchall()
    result = [[row[0], row[1], json.loads(row[2])] for row in rows]
    result.reverse()
    return result

# gets all private chats in this campaign involving this user, separate them yourself
def get_private_chat(userid:int, campaignid:int) -> list:
    with DBLOCK:
        cur = conn.execute('''
        SELECT
            type, chatname, data, userid, touserid
        FROM
            privatechats
        WHERE
            campaignid = ? AND (userid = ? OR touserid = ?)
        ;
        ''', (campaignid, userid, userid))
        return cur.fetchall()

def save_note(campaignid:int, title:str, body:str, flags:int, noteid:int) -> None:
    # logging.info('saving note: %r/%r noteid: %r', campaignid, title, noteid)
    with DBLOCK, conn:
        conn.execute('''
        INSERT INTO
            notes(campaignid, title, body, flags, noteid)
        VALUES
            (?, ?, ?, ?, ?)
        ON CONFLICT(campaignid, noteid)
            DO UPDATE SET
                title = excluded.title,
                body = excluded.body,
                flags = excluded.flags
        ;
        ''', (campaignid, title, body, flags, noteid))

def get_notes(id:int) -> list:
    with DBLOCK:
        cur = conn.execute('''
            SELECT
                *
            FROM
                notes
            WHERE
                campaignid = ?
        ''', (id,))
        rows = cur.fetchall()
    return [
            dict(
                title = row[1],
                body = row[2],
                flags = row[3],
                id = row[4],
                ) for row in rows
            ]

def make_invite_link(campaignid:int) -> int:
    with DBLOCK, conn:
        # using urandom for this might be overkill, but whatever.
        magic = int.from_bytes(os.urandom(8), 'little', signed=False)
        # sqlite can't handle 64 bit unsigned, so just shift to 63 bits
        magic >>= 1
        now = datetime.datetime.utcnow()
        cur = conn.execute('''
            INSERT INTO
                magicinvitations(campaignid, magic, created)
            VALUES
                (?, ?, ?)
            ;
        ''', (campaignid, magic, now))
    return magic

def check_invite_link(campaignid:int, magic:int) -> bool:
    with DBLOCK:
        cur = conn.execute('''
        SELECT
            *
        FROM
            magicinvitations
        WHERE
            campaignid = ? AND magic = ?
        ;''', (campaignid, magic))
        return cur.fetchone() is not None

def revoke_invite_link(campaignid:int, magic:int) -> None:
    with DBLOCK, conn:
        conn.execute('''
        DELETE FROM
            magicinvitations
        WHERE
            campaignid = ? AND magic = ?
        ;''', (campaignid, magic))

def lookup_user_by_id(userid:int) -> Optional[Tuple[str, str]]:
    with DBLOCK:
        return conn.execute('''
            SELECT
                name, passhash
            FROM
                users
            WHERE
                userid = ?
            ;
        ''', (userid,)).fetchone()

def lookup_user_by_name(name:str) -> Optional[Tuple[int, str]]:
    with DBLOCK:
        return conn.execute('''
            SELECT
                userid, passhash
            FROM
                users
            WHERE
                name = ?
            ;
        ''', (name,)).fetchone()

def create_user(name:str, passhash:str, email:str) -> Optional[int]:
    with DBLOCK, conn:
        try:
            cur = conn.execute('''
            INSERT INTO
                users(name, passhash, email)
            VALUES
                (?, ?, ?)
            ;
            ''', (name, passhash, email))
            return cur.lastrowid
        except sqlite3.DatabaseError:
            return None

def join_campaign(userid:int, campaignid:int) -> None:
    with DBLOCK, conn:
        conn.execute('''
        INSERT INTO
            joinedcampaigns(userid, campaignid)
        VALUES
            (?, ?)
        ;
        ''', (userid, campaignid))

def get_global_settings(userid:int) -> Dict[str, object]:
    with DBLOCK:
        rows = conn.execute('''
            SELECT
                key, value
            FROM
                userglobprefs
            WHERE
                userid = ?
            ;''', (userid,)).fetchall()
        return dict(rows)

def store_global_settings(userid:int, key:str, value:str) -> None:
    with DBLOCK, conn:
        row = conn.execute('''
            INSERT INTO
                userglobprefs(userid, key, value)
            VALUES
                (?, ?, ?)
            ON CONFLICT(userid, key)
                DO UPDATE SET value = excluded.value
            ;''', (userid, key, value))
def store_local_setting(userid:int, campaign:int, category:str, key:str, value:str) -> None:
    with DBLOCK, conn:
        conn.execute('''
            INSERT INTO
                usercampprefs(userid, campaignid, category, key, value)
            VALUES
                (?, ?, ?, ?, ?)
            ON CONFLICT(userid, campaignid, category, key)
                DO UPDATE SET value = excluded.value
            ;''', (userid, campaign, category, key, value))

def get_local_settings(userid:int, campaign:int) -> dict:
    with DBLOCK:
        rows = conn.execute('''
        SELECT
            category, key, value
        FROM
            usercampprefs
        WHERE
            userid = ? AND campaignid = ?
        ;''', (userid, campaign)).fetchall()
    result = {} # type: Dict[str, Dict[str, Any]]
    for c, k, v in rows:
        if c not in result:
            result[c] = {}
        result[c][k] = json.loads(v)
    # logging.info('rows: %r, result: %r', rows, result)
    return result

def get_users_in_campaign(campaign:int) -> List[int]:
    with DBLOCK:
        rows = conn.execute('''
        SELECT userid
        FROM joinedcampaigns
        WHERE campaignid = ?
        ;
        ''', (campaign,)).fetchall()
        return [r[0] for r in rows]



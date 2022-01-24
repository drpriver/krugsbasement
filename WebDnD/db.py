import threading
import sqlite3
from typing import Optional, Dict
import json
import datetime
from .logs import logging
DBNAME = 'campaigns.db'
conn = sqlite3.connect(DBNAME, check_same_thread=False)
# Make it threadsafe
# The R is for re-entrant
DBLOCK = threading.RLock()

with conn:
    conn.execute("PRAGMA encoding = 'UTF-8';")
    conn.execute('PRAGMA foreign_keys = ON;')
    conn.execute('PRAGMA synchronous = NORMAL;')
    conn.execute('PRAGMA journal_mode = WAL;')
    # Key-value store for random app data
    conn.execute('''
        CREATE TABLE IF NOT EXISTS appdata (
            key STRING PRIMARY KEY UNIQUE,
            value ANY
        );
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS campaigns (
            id INTEGER PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            owner INTEGER  /* unused, in future will be userid */
        );
    ''')
    # key-value store for random campaign data
    conn.execute('''
        CREATE TABLE IF NOT EXISTS campkv (
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
        CREATE TABLE IF NOT EXISTS maps (
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
        CREATE TABLE IF NOT EXISTS chats (
            msgid INTEGER NOT NULL PRIMARY KEY,
            campaignid INTEGER NOT NULL,
            type INTEGER NOT NULL,
            chatname TEXT, /* display name, not unique identifier */
            timestamp REAL, /* seconds utc timestamp */
            data BLOB, /* json dump */
            FOREIGN KEY(campaignid) REFERENCES campaigns(id)
        );
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS notes (
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
        CREATE TABLE IF NOT EXISTS rolltables (
            campaignid INTEGER NOT NULL UNIQUE,
            data BLOB, /* json dump */
            FOREIGN KEY(campaignid) REFERENCES campaigns(id)
        );
    ''')

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

def store_app_kv(key:str, value) -> None:
    with DBLOCK:
        with conn:
            conn.execute('''
            INSERT INTO
                appdata(key, value)
            VALUES
                (?, ?)
            ON CONFLICT(key)
                DO UPDATE SET value=excluded.value
            ;
            ''', (key, value))
def get_app_kv(key:str, default=None):
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
def store_campaign_kv(id: int, key:str, value) -> None:
    with DBLOCK:
        with conn:
            conn.execute('''
            INSERT INTO
                campkv(campaignid, key, value)
            VALUES
                (?, ?, ?)
            ON CONFLICT(campaignid, key)
                DO UPDATE SET value=excluded.value
            ;
            ''', (id, key, value))
def get_campaign_kv(id:int, key:str, default=None):
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
def save_chat_msg(campaignid:int, msgtype:int, chatname:str, data) -> None:
    data = json.dumps(data, separators=(',',':'))
    timestamp = datetime.datetime.utcnow().timestamp()
    with DBLOCK:
        with conn:
            conn.execute('''
            INSERT INTO
                chats(campaignid, type, chatname, timestamp, data)
            VALUES
                (?, ?, ?, ?, ?)
            ;
            ''', (campaignid, msgtype, chatname, timestamp, data))

def save_map(id:int, map_id:int, map_name:str, objects:list, flags:int, grid_type:int):
    blob = json.dumps(objects, separators=(',',':'))
    with DBLOCK:
        with conn:
            conn.execute('''
                INSERT INTO
                    maps(campaignid, mapid, name, objects, flags, grid_type)
                VALUES
                    (?, ?, ?, ?, ?, ?)
                ON CONFLICT(campaignid, mapid)
                DO UPDATE SET
                    name      = excluded.name,
                    objects   = excluded.objects,
                    flags     = excluded.flags,
                    grid_type = excluded.grid_type
                ;
            ''', (id, map_id, map_name, blob, flags, grid_type))
def map_convert(row):
    return dict(
        map_id = row[1],
        map_name = row[2],
        objects = json.loads(row[3]),
        flags = row[4],
        grid_type = row[5],
    )

def get_map(id:int, mapid:int):
    with DBLOCK:
        with conn:
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
def get_maps(id:int):
    with DBLOCK:
        with conn:
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

def save_rolltable(id:int, data) -> None:
    if not isinstance(data, str):
        data = json.dumps(data, separators=(',',':'))
    with DBLOCK:
        with conn:
            conn.execute('''
            INSERT INTO
                rolltables(campaignid, data)
            VALUES
                (?, ?)
            ON CONFLICT(campaignid)
                DO UPDATE SET data=excluded.data
            ;
            ''', (id, data))
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
    if row: return row[0]
    return None

def create_campaign(name:str) -> int:
    with DBLOCK:
        with conn:
            cur = conn.execute('''
            INSERT INTO
                campaigns(name)
            VALUES
                (?)
            ;
            ''', (name,))
            return cur.lastrowid


def get_chat(id:int) -> list:
    with DBLOCK:
        cur = conn.execute('''
            SELECT
                *
            FROM
                chats
            WHERE
                campaignid = ?
            ORDER BY
                timestamp DESC
            LIMIT 100;
        ''', (id,))
        rows = cur.fetchall()
    result = [[row[2], row[3], json.loads(row[5])] for row in rows]
    result.reverse()
    return result;

def save_note(campaignid:int, title:str, body:str, flags:int, noteid:int):
    # logging.info('saving note: %r/%r noteid: %r', campaignid, title, noteid)
    with DBLOCK:
        with conn:
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

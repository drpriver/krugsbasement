import threading
import sqlite3
from typing import Optional, Dict
import json
DBNAME = 'campaigns.db'
conn = sqlite3.connect(DBNAME, check_same_thread=False)
# Make it threadsafe
# The R is for re-entrant
DBLOCK = threading.RLock()

with conn:
    # Key-value store for random app data
    conn.execute('''
        CREATE TABLE IF NOT EXISTS appdata (
            key STRING PRIMARY KEY UNIQUE,
            value ANY
        );
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS campaigns (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        owner INTEGER
        );
    ''')
    # we're just storing everything as blobs for now.
    # Before merging this in I'll move it out to not being a blob.
    conn.execute('''
        CREATE TABLE IF NOT EXISTS maps (
        campaignid INTEGER NOT NULL UNIQUE,
        data BLOB,
        FOREIGN KEY(campaignid) REFERENCES campaigns(id)
        );
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS chats (
        campaignid INTEGER NOT NULL UNIQUE,
        data BLOB,
        FOREIGN KEY(campaignid) REFERENCES campaigns(id)
        );
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS notes (
        campaignid INTEGER NOT NULL UNIQUE,
        data BLOB,
        FOREIGN KEY(campaignid) REFERENCES campaigns(id)
        );
    ''')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS rolltables (
        campaignid INTEGER NOT NULL UNIQUE,
        data BLOB,
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
                ''')
            return default
    return row[0] if row else None

# I'm just always using the DBLOCK as it is not clear to me
# if it is safe to execute this code concurrently.
# Definitely isn't safe for writes, unclear for reads.
# Also unclear if the conn object itself is thread-safe.
def save_chat(id:int, data) -> None:
    if not isinstance(data, str):
        data = json.dumps(data, separators=(',',':'))
    with DBLOCK:
        with conn:
            conn.execute('''
            INSERT INTO 
                chats(campaignid, data)
            VALUES 
                (?, ?)
            ON CONFLICT(campaignid)
                DO UPDATE SET data=excluded.data
            ;
            ''', (id, data))

def save_maps(id:int, data) -> None:
    if not isinstance(data, str):
        data = json.dumps(data, separators=(',',':'))
    with DBLOCK:
        with conn:
            conn.execute('''
            INSERT INTO 
                maps(campaignid, data)
            VALUES 
                (?, ?)
            ON CONFLICT(campaignid)
                DO UPDATE SET data=excluded.data
            ;
            ''', (id, data))

def save_notes(id:int, data) -> None:
    if not isinstance(data, str):
        data = json.dumps(data, separators=(',',':'))
    with DBLOCK:
        with conn:
            conn.execute('''
            INSERT INTO 
                notes(campaignid, data)
            VALUES 
                (?, ?)
            ON CONFLICT(campaignid)
                DO UPDATE SET data=excluded.data
            ;
            ''', (id, data))
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


def get_chat(id:int) -> Optional[list]:
    with DBLOCK:
        cur = conn.execute('''
            SELECT
                data
            FROM
                chats
            WHERE
                campaignid = ?
        ''', (id,))
        row = cur.fetchone()
    return json.loads(row[0]) if row else None

def get_maps(id:int) -> Optional[dict]:
    with DBLOCK:
        cur = conn.execute('''
            SELECT
                data
            FROM
                maps
            WHERE
                campaignid = ?
        ''', (id,))
        row = cur.fetchone()
    return json.loads(row[0]) if row else None
def get_notes(id:int) -> Optional[list]:
    with DBLOCK:
        cur = conn.execute('''
            SELECT
                data
            FROM
                notes
            WHERE
                campaignid = ?
        ''', (id,))
        row = cur.fetchone()
    return json.loads(row[0]) if row else None
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

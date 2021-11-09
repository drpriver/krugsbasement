import io
import shlex
from typing import List, Dict, Union, Any, Tuple
import random
from .dice import dice_from_string, roll_dice
from .persist import Persister
from flask_socketio import emit
from .logs import logging

from .messages import ToClient

from enum import IntEnum, IntFlag
class Msg(IntEnum):
    PLAIN = 0
    DICEROLL = 1
    ERROR = 2


def load_chat(data:Union[str, dict, list, int, float]) -> List[dict]:
    assert isinstance(data, list)
    result = [] # type: List[dict]
    d: Dict[str, object]
    for d in data:
        if 'type' not in d:
            continue
        if not isinstance(d['type'], int):
            continue
        if 'user' not in d:
            continue
        if not isinstance(d['user'], str):
            continue
        if 'data' not in d:
            continue
        datum = d['data']
        t: int = d['type']
        if t == Msg.PLAIN:
            if not isinstance(datum, str):
                continue
        elif t == Msg.ERROR:
            if not isinstance(datum, str):
                continue
        elif t == Msg.DICEROLL:
            if not isinstance(datum, dict):
                continue
            if 'total' not in datum:
                continue
            if 'roll' not in datum:
                continue
        result.append(d)
    return result


HISTORY = {'/':[]}  # type: Dict[str, List[dict]]
HISTORY['/'] = Persister(HISTORY['/'], 'BadDb/chat.json', dont_persist=True, load_func=load_chat).obj

class ROLLTABLEFLAGS(IntFlag):
    NONE = 0
    IS_TABLE = 1

ROLLTABLES = {'/':[]}  # type: Dict[str, List[dict]]
ROLLTABLES['/'] = Persister(ROLLTABLES['/'], 'BadDb/tables.json', dont_persist=True).obj

def get_roll_tables(room:str) -> list:
    if room in ROLLTABLES:
        return ROLLTABLES[room]
    ROLLTABLES[room] = Persister([], 'BadDb'+room+'/tables.json').obj # type: ignore
    return ROLLTABLES[room]

def update_roll_tables(room:str, data:list) -> None:
    for d in data:
        if not isinstance(d, dict):
            raise Exception
        if 'name' not in d or not isinstance(d['name'], str):
            raise Exception
        if 'id' not in d or not isinstance(d['id'], int):
            raise Exception
        if 'entries' not in d or not isinstance(d['entries'], list):
            raise Exception
        if set(d) != {'name', 'id', 'entries'}:
            raise Exception
        for entry in d['entries']:
            if not isinstance(entry, dict):
                raise Exception
            if 'weight' not in entry and not isinstance(entry['weight'], (int, float)):
                raise Exception
            if entry['weight'] < 0.5:
                raise Exception
            if entry['weight'] > 1e8:
                raise Exception
            if 'value' not in entry and not isinstance(entry['value'], str):
                raise Exception
            if 'flags' not in entry and not isinstance(entry['flags'], int):
                raise Exception
            if set(entry) != {'weight', 'value', 'flags'}:
                raise Exception
    ROLLTABLES[room] = data


def create_chat(room:str) -> None:
    if room in HISTORY:
        return
    HISTORY[room] = Persister([], 'BadDb'+room+'/chat.json', load_func=load_chat).obj  # type: ignore

def handle_input(room:str, data:str, user:str='anon', test:bool=False) -> List[dict]:
    apparent_user = user
    result = []
    for line in data.split('\n'):
        line = line.strip()
        if not line:
            continue
        if line.startswith('/name'):
            apparent_user = line[len('/name'):].strip()
            continue
        result.append({'user':apparent_user, 'data':line, 'type':Msg.PLAIN})

        try:
            dice = dice_from_string(line)
        except:
            pass
        else:
            roll_result = roll_dice(dice)
            if isinstance(roll_result, str):
                result.append({'user':'', 'data':roll_result, 'type':Msg.ERROR})
            else:
                result.append({'user':'', 'data':roll_result, 'type':Msg.DICEROLL})

        parts = line.split()
        if parts[0] in {'/shuffle', '/shuff', '/shuf', 'shuf', 'shuff', 'shuffle'}:
            try:
                shuffle_result = parse_and_shuffle(line[len(parts[0]):])
            except:
                pass
            result.append({'user':'', 'data':shuffle_result, 'type':Msg.PLAIN})
        elif parts[0] in {'/choose', 'choose'}:
            try:
                choose_result = parse_and_choose(line[len(parts[0]):])
            except:
                pass
            result.append({'user':'', 'data':choose_result, 'type':Msg.PLAIN})
        elif parts[0] in {'/gather'} and len(parts) == 3:
            try:
                x = int(parts[1])
                y = int(parts[2])
            except:
                pass
            else:
                if not test:
                    emit(ToClient.CANVAS_GATHER,{'x':x, 'y':y}, broadcast=True)
        elif parts[0] in {'/table', 'table'}:
            try:
                table_result, path = parse_and_roll_table(room, line[len(parts[0]):])
            except Exception as e:
                result.append({'user':'', 'data': str(e), 'type':Msg.ERROR})
            else:
                if not table_result:
                    table_result = '(No entry)'
                result.append({'user':'', 'data': path + ': '+table_result, 'type':Msg.PLAIN})


    if not test:
        HISTORY[room].extend(result)
    return result

DOUBLEQUOTE_TABLE = str.maketrans('\u201c\u201d', '""')
def parse_and_shuffle(line:str, table=DOUBLEQUOTE_TABLE) -> str:
    line = line.translate(table)
    parts = shlex.split(line)
    if not parts:
        raise Exception
    random.shuffle(parts)
    s = io.StringIO()
    for p in parts:
        if ' ' in p:
            s.write('\u201c')
            s.write(p)
            s.write('\u201d')
        else:
            s.write(p)
        s.write(' ')
    return s.getvalue()

def parse_and_choose(line:str, table=DOUBLEQUOTE_TABLE) -> str:
    line = line.translate(table)
    parts = shlex.split(line)
    if not parts:
        raise Exception
    return random.choice(parts)

def parse_and_roll_table(room:str, line:str) -> Tuple[str, str]:
    line = line.strip()
    tables = get_roll_tables(room)
    mapping = {d['name'].lower(): d for d in tables}
    return parse_and_roll_table_inner(mapping, line, line, 0)

def parse_and_roll_table_inner(mapping:dict, key:str, path:str, depth:int) -> Tuple[str, str]:
    if depth > 10:
        raise Exception('Maximum table depth reached for table path: {}.'.format(path))
    table = mapping.get(key.lower())
    if not table:
        raise Exception('"{}" is not the name of a table.'.format(key))
    weights = []
    values = []
    is_subtable = []
    for e in table['entries']:
        weights.append(e['weight'])
        values.append(e['value'])
        is_subtable.append(e['flags'] & ROLLTABLEFLAGS.IS_TABLE)
    indexes = list(range(len(weights)))
    index = random.choices(indexes, weights=weights, k=1)[0]
    value = values[index]
    if is_subtable[index]:
        return parse_and_roll_table_inner(mapping, value, path+'❯'+value, depth+1)
    return value, path


def get_history(room:str) -> List[dict]:
    return HISTORY[room][-100:]

def clear(room:str) -> None:
    HISTORY[room].clear()

def set_state(room:str, state:List[dict]) -> None:
    clear(room)
    HISTORY[room].extend(state)

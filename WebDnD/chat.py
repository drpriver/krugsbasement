import io
import shlex
from typing import List, Dict, Union, Any
import random
from .dice import dice_from_string, roll_dice
from .persist import Persister
from flask_socketio import emit
from .logs import logging

from enum import IntEnum
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

def create_chat(room:str) -> None:
    if room in HISTORY:
        return
    HISTORY[room] = Persister([], 'BadDb'+room+'/chat.json', load_func=load_chat).obj  # type: ignore

def handle_input(room:str, data:str, user:str='anon') -> List[dict]:
    result = []
    for line in data.split('\n'):
        line = line.strip()
        if not line:
            continue
        result.append({'user':user, 'data':line, 'type':Msg.PLAIN})

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
                emit('canvas-gather', {'x':x, 'y':y}, broadcast=True)

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


def get_history(room:str) -> List[dict]:
    return HISTORY[room][-100:]

def clear(room:str) -> None:
    HISTORY[room].clear()

def set_state(room:str, state:List[dict]) -> None:
    clear(room)
    HISTORY[room].extend(state)

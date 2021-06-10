from typing import List, Dict, Union, Any
import random
from .dice import dice_from_string, roll_dice
from .persist import Persister
from flask_socketio import emit

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

from enum import IntEnum
class Msg(IntEnum):
    PLAIN = 0
    DICEROLL = 1
    ERROR = 2

def create_chat(room:str) -> None:
    if room in HISTORY:
        return
    HISTORY[room] = Persister([], 'BadDb'+room+'/chat.json', load_func=load_chat).obj  # type: ignore

def handle_input(room:str, data:str, user:str='anon') -> List[dict]:
    result = []
    for line in data.split('\n'):
        if not line.strip():
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
        if parts[0] in {'/gather'} and len(parts) == 3:
            try:
                x = int(parts[1])
                y = int(parts[2])
            except:
                pass
            else:
                emit('canvas-gather', {'x':x, 'y':y}, broadcast=True)

    HISTORY[room].extend(result)
    return result

def get_history(room:str) -> List[dict]:
    return HISTORY[room][-100:]

def clear(room:str) -> None:
    HISTORY[room].clear()

def set_state(room:str, state:List[dict]) -> None:
    clear(room)
    HISTORY[room].extend(state)

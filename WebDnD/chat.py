from typing import List, Dict
import random
from .dice import dice_from_string, roll_and_format_dice_array, roll_dice_array
from .persist import Persister
from flask_socketio import emit
HISTORY = []  # type: List[dict]
HISTORY = Persister(HISTORY, 'BadDb/chat.json').obj

from enum import IntEnum
class Msg(IntEnum):
    PLAIN = 0
    DICEROLL = 1
    ERROR = 2


def handle_input(data:str, user:str='anon') -> List[dict]:
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
            roll_result = roll_dice_array(dice)
            if isinstance(roll_result, str):
                result.append({'user':'', 'data':roll_result, 'type':Msg.ERROR})
            else:
                # rollstr = roll_and_format_dice_array(dice)
                # result.append({'user':'', 'data':rollstr, 'type':Msg.DICEROLL})
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

    HISTORY.extend(result)
    return result

def get_history() -> List[dict]:
    return HISTORY[-100:]


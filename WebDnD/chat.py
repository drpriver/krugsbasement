from typing import List, Dict
import random
from .dice import dice_from_string
from .persist import Persister
from flask_socketio import emit
HISTORY = []  # type: List[dict]
HISTORY = Persister(HISTORY, 'BadDb/chat.json').obj

def handle_input(data:str, user:str='anon') -> List[dict]:
    result = []
    result.append({'user':user, 'text':data})
    lines = data.split('\n')
    for line in lines:
        if not line.strip():
            continue
        data = line
        parts = data.split()
        try:
            dice = dice_from_string(data)
        except:
            pass
        else:
            roll = dice.verbose_roll()
            rollstr = ''
            for r in roll.dice_outputs:
                rollstr += f'[{r}]+'
            rollstr = rollstr[:-1]
            rollstr += f' = {roll.sum}'
            result.append({'user':'server', 'text':rollstr})
        if parts[0] in {'/r', '/roll', 'roll', 'r'}:
            remainder = ''.join(parts[1:])
            try:
                dice = dice_from_string(remainder)
            except Exception as e:
                result.append({'user':'server', 'text':'error: ' + str(e)})
            else:
                roll = dice.verbose_roll()
                rollstr = ''
                for r in roll.dice_outputs:
                    rollstr += f'[{r}]+'
                rollstr = rollstr[:-1]
                rollstr += f' = {roll.sum}'
                result.append({'user':'server', 'text':rollstr})
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


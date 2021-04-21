from typing import List, Dict
import random
from .dice import dice_from_string

HISTORY = []  # type: List[dict]
def handle_input(data:str, user:str='anon') -> List[dict]:
    result = []
    result.append({'user':user, 'text':data})
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
    HISTORY.extend(result)
    return result

def get_history() -> List[dict]:
    return HISTORY[-100:]


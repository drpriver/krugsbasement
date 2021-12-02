import io
import shlex
from typing import List, Dict, Union, Any, Tuple
import random
from .dice import dice_from_string, roll_dice
from .persist import Persister
from flask_socketio import emit
from .logs import logging

from .messages import ToClient, ChatCommand, DieExprTypes, Msg, Command, ChatMsg, UnrolledDiceExpr, BINARY, UNARY, RolledExpr, ROLLTABLEFLAGS, RollTable

from enum import IntEnum, IntFlag

def load_chat(data) -> List[ChatMsg]:
    assert isinstance(data, list)
    if data and isinstance(data[0], dict): # old format
        return convert_old_format(data)
    else:
        return data

#TODO: delete this garbage once I've persisted everything to new format.
def convert_old_format(data:List[dict]) -> List[ChatMsg]:
    result = [] # type: List[ChatMsg]
    d: Dict[str, object]

    # old roll types
    DICE = 0
    PRODUCT = 1
    SUM = 2

    def convert(roll):
        type = roll['type']
        values = roll['values']
        result: 'RolledExpr'
        if type == DICE:
            if roll['base'] == 1:
                return (DieExprTypes.NUMBER, values[0])
            result = (DieExprTypes.DICE, len(values), roll['base'], values)
            if roll['negative']:
                result = (DieExprTypes.UNARY, UNARY.NEG, result)
            return result
        if type == PRODUCT:
            dice = [convert(v) for v in values]
            result = (DieExprTypes.BINARY, BINARY.MUL, dice[0], dice[1])
            for i in range(2, len(dice)):
                d = dice[i]
                result = (DieExprTypes.BINARY, BINARY.MUL, result, d)
            return result
        if type == SUM:
            dice = [convert(v) for v in values]
            result = (DieExprTypes.BINARY, BINARY.ADD, dice[0], dice[1])
            for i in range(2, len(dice)):
                d = dice[i]
                result = (DieExprTypes.BINARY, BINARY.ADD, result, d)
            return result
        assert 0
    def ancient_convert(roll):
        first = roll[0]
        if first['base'] == 1:
            result = (DieExprTypes.NUMBER, first['base'])
        else:
            result = (DieExprTypes.DICE, len(first['values']), first['base'], first['values'])
        for die in roll[1:]:
            if die['base'] == 1:
                d = (DieExprTypes.NUMBER, die['base'])
            else:
                result = (DieExprTypes.DICE, len(die['values']), die['base'], die['values'])
            result = (DieExprTypes.BINARY, BINARY.ADD, result, d)
        return result

    for i, d in enumerate(data):
        if 'type' not in d:
            continue
        if not isinstance(d['type'], int):
            continue
        if 'user' not in d:
            continue
        if not isinstance(d['user'], str):
            continue
        user: str = d['user']
        if 'data' not in d:
            continue
        datum = d['data']
        t: Msg = d['type'] # type: ignore
        if t == Msg.PLAIN:
            if not isinstance(datum, str):
                continue
            if i + 1 < len(data) and data[i+1]['type'] == Msg.DICEROLL:
                t = Msg.ECHOABLE_TEXT
            result.append((t, user, datum)) # type: ignore
        elif t == Msg.ERROR:
            if not isinstance(datum, str):
                continue
            result.append((t, user, datum)) # type: ignore
        elif t == Msg.DICEROLL:
            from pprint import pprint
            if not isinstance(datum, dict):
                roll = ancient_convert(datum)
                result.append((Msg.DICEROLL_NEW, user, roll)) # type: ignore
                continue
            if 'roll' not in datum:
                continue
            roll = convert(datum['roll'])
            result.append((Msg.DICEROLL_NEW, user, roll)) # type: ignore

    return result


HISTORY = {'/':[]}  # type: Dict[str, List[ChatMsg]]
HISTORY['/'] = Persister(HISTORY['/'], 'BadDb/chat.json', dont_persist=True, load_func=load_chat).obj

ROLLTABLES = {'/':[]}  # type: Dict[str, List[RollTable]]
ROLLTABLES['/'] = Persister(ROLLTABLES['/'], 'BadDb/tables.json', dont_persist=True).obj

def get_roll_tables(room:str) -> List[RollTable]:
    if room in ROLLTABLES:
        return ROLLTABLES[room]
    ROLLTABLES[room] = Persister([], 'BadDb'+room+'/tables.json').obj # type: ignore
    return ROLLTABLES[room]

def update_roll_tables(room:str, data:List[RollTable]) -> None:
    for d in data:
        for entry in d['entries']:
            if entry['weight'] < 0.5:
                raise Exception
            if entry['weight'] > 1e8:
                raise Exception
    ROLLTABLES[room] = data

def create_chat(room:str) -> None:
    if room in HISTORY:
        return
    HISTORY[room] = Persister([], 'BadDb'+room+'/chat.json', load_func=load_chat).obj  # type: ignore

def parse_and_roll_table(room:str, line:str) -> Tuple[str, str]:
    line = line.strip()
    tables = get_roll_tables(room)
    mapping = {d['name'].lower(): d for d in tables}
    return parse_and_roll_table_inner(mapping, line, line, 0)

def parse_and_roll_table_inner(mapping:Dict[str, RollTable], key:str, path:str, depth:int) -> Tuple[str, str]:
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


def get_history(room:str) -> List[ChatMsg]:
    return HISTORY[room][-100:]

def clear(room:str) -> None:
    HISTORY[room].clear()

def set_state(room:str, state:List[ChatMsg]) -> None:
    clear(room)
    HISTORY[room].extend(state)


def handle_structured_input(room:str, user:str, commands:List[Command], test:bool) -> List[ChatMsg]:
    def echo(user:str, text:str) -> ChatMsg:
        return (Msg.ECHOABLE_TEXT, user, text) # type: ignore
    def plain(user:str, text:str) -> ChatMsg:
        return (Msg.PLAIN, user, text) # type: ignore
    def dieroll(dice) -> ChatMsg:
        return (Msg.DICEROLL_NEW, '', dice) # type: ignore
    def error(e:str) -> ChatMsg:
        return (Msg.ERROR, '', e) # type: ignore
    apparent_user = user
    result = []
    for command in commands:
        cc = ChatCommand(command[0])
        if cc != ChatCommand.NAME:
            line = command[1]
            if cc != ChatCommand.SAY:
                result.append(echo(apparent_user, line))
            else:
                result.append(plain(apparent_user, line))
            del line

        if cc == ChatCommand.ROLL:
            dice: UnrolledDiceExpr = command[2] # type: ignore
            structured_roll_die(dice)
            result.append(dieroll(dice))
        elif cc == ChatCommand.SAY:
            pass
        elif cc == ChatCommand.NAME:
            apparent_user = command[1]
        elif cc == ChatCommand.SHUFFLE:
            stuff: List[str] = command[2] # type: ignore
            random.shuffle(stuff)
            result.append(plain('', ' '.join(stuff)))
        elif cc == ChatCommand.CHOOSE:
            options: List[str] = command[2] # type: ignore
            choice = random.choice(options)
            result.append(plain(apparent_user, choice))
        elif cc == ChatCommand.TABLE:
            table: str = command[2] # type: ignore
            try:
                table_result, path = parse_and_roll_table(room, table)
            except Exception as e:
                result.append(error(str(e)))
            else:
                if not table_result:
                    table_result = '(No entry)'
                result.append(plain('', path + ': '+table_result))
        else:
            raise Exception(cc)

    if not test:
        HISTORY[room].extend(result)
    return result

def structured_roll_die(die:UnrolledDiceExpr) -> None:
    t = die[0]
    if t == DieExprTypes.NUMBER:
        return
    if t == DieExprTypes.DICE:
        vals = []
        for _ in range(die[1]):
            vals.append(random.randint(1, die[2])) # type: ignore
        die.append(vals) # type: ignore
        return
    if t == DieExprTypes.GROUP:
        return structured_roll_die(die[1]) # type: ignore
    if t == DieExprTypes.UNARY:
        return structured_roll_die(die[2]) # type: ignore
    if t == DieExprTypes.BINARY:
        structured_roll_die(die[2]) # type: ignore
        structured_roll_die(die[3]) # type: ignore


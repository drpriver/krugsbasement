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
    return data

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
        return (Msg.DICEROLL, '', dice) # type: ignore
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


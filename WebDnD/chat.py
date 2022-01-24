import io
import shlex
from typing import List, Dict, Union, Any, Tuple, Optional
import random
from .persist import Persister
from flask_socketio import emit
from .logs import logging
from . import db

from .messages import ToClient, ChatCommand, DieExprTypes, Msg, Command, ChatMsg, UnrolledDiceExpr, BINARY, UNARY, RolledExpr, ROLLTABLEFLAGS, RollTable

from enum import IntEnum, IntFlag

class RollTablePersister(Persister[List[RollTable]]):
    def read_obj(self, obj):
        o = db.get_rolltable(self.campaign_id)
        return o if o is not None else obj
    def write_obj(self, obj):
        logging.info('write roll table: %r', obj)
        db.save_rolltable(self.campaign_id, obj)
    def __init__(self, campaign:str, dont_persist=False):
        name = f'{campaign!r}/rolltables'
        self.campaign_id = db.lookup_campaign(campaign)
        assert self.campaign_id is not None
        super().__init__([], name, dont_persist=dont_persist)

ROLLTABLES = {'': RollTablePersister('', dont_persist=True).obj}

def get_roll_tables(room:str) -> List[RollTable]:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    if campaign in ROLLTABLES:
        return ROLLTABLES[campaign]
    ROLLTABLES[campaign] = RollTablePersister(campaign).obj
    return ROLLTABLES[campaign]

def update_roll_tables(room:str, data:List[RollTable]) -> None:
    tables = get_roll_tables(room)
    highest = max(t['id'] for t in tables) if tables else 0
    if highest < 0:
        highest = 1
    for d in data:
        if d['id'] < 0:
            highest += 1
            d['id'] = highest
        for entry in d['entries']:
            if entry['weight'] < 0.5:
                raise Exception
            if entry['weight'] > 1e8:
                raise Exception
    tables.clear()
    tables.extend(data)
    logging.info('tables: %r', tables)

def upload_roll_table(room:str, data:RollTable) -> Optional[RollTable]:
    tables = get_roll_tables(room)
    highest = max(t['id'] for t in tables) if tables else 0
    data['id'] = highest + 1
    tables.append(data)
    return data

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
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
    campaign_id = db.lookup_campaign(campaign)
    if campaign_id is None:
        return []
    return db.get_chat(campaign_id)

def handle_structured_input(room:str, user:str, commands:List[Command], test:bool) -> List[ChatMsg]:
    # FIXME: do room to campaign parsing in app.py
    campaign  = room.split('/')[-1] if '/' in room else ''
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
        campaign_id = db.lookup_campaign(campaign)
        assert campaign_id
        for msg in result:
            db.save_chat_msg(campaign_id, msg[0], msg[1], msg[2])
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


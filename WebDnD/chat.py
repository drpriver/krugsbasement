from typing import List, Dict, Union, Any, Tuple, Optional
import random
from .persist import Persister, Dummy
from .logs import logging
from . import db
import datetime
import json

from .messages import ToClient, ChatCommand, DieExprTypes, Msg, Command, ChatMsg, UnrolledDiceExpr, Binary, Unary, RolledExpr, RollTableFlags, RollTable, RollTables, ChatHistory

from enum import IntEnum, IntFlag

class RollTablePersister(Persister[Dummy[List[RollTable]]]):
    def read_obj(self, obj:Dummy[list])->Dummy[list]:
        o = db.get_rolltable(self.campaign_id)
        return Dummy(o) if o is not None else obj
    def write_obj(self, obj:Dummy[list])->None:
        # logging.info('write roll table: %r', obj)
        db.save_rolltable(self.campaign_id, obj.value)
    def __init__(self, campaignid:int)->None:
        name = f'{campaignid!r}/rolltables'
        self.campaign_id = campaignid
        assert self.campaign_id is not None
        dont_persist = campaignid == 1
        super().__init__(Dummy([]), name, dont_persist=dont_persist)

class PrivateRollTablePersister(Persister[Dummy[List[RollTable]]]):
    def read_obj(self, obj:Dummy[list])->Dummy[list]:
        o = db.get_private_rolltable(self.userid, self.campaign_id)
        return Dummy(o) if o is not None else obj
    def write_obj(self, obj:Dummy[list])->None:
        # logging.info('write roll table: %r', obj)
        db.save_private_rolltable(self.userid, self.campaign_id, obj.value)
    def __init__(self, userid:int, campaignid:int)->None:
        name = f'{userid!r}:{campaignid!r}/rolltables'
        self.campaign_id = campaignid
        self.userid = userid
        assert self.campaign_id is not None
        dont_persist = campaignid == 1
        super().__init__(Dummy([]), name, dont_persist=dont_persist)

ROLLTABLES = {} # type: Dict[int, Dummy[List[RollTable]]]
PRIVATEROLLTABLES = {} # type: Dict[Tuple[int, int], Dummy[List[RollTable]]]

def get_roll_tables(campaign:int) -> Dummy[List[RollTable]]:
    if campaign in ROLLTABLES:
        return ROLLTABLES[campaign]
    ROLLTABLES[campaign] = RollTablePersister(campaign).obj
    return ROLLTABLES[campaign]

def get_private_tables(user:int, campaign:int) -> Dummy[List[RollTable]]:
    if (user, campaign) in PRIVATEROLLTABLES:
        return PRIVATEROLLTABLES[(user, campaign)]
    PRIVATEROLLTABLES[(user, campaign)] = PrivateRollTablePersister(user, campaign).obj
    return PRIVATEROLLTABLES[(user, campaign)]

def get_both_tables(user:int, campaign:int) -> RollTables:
    return [get_roll_tables(campaign).value, get_private_tables(user, campaign).value] # type: ignore

def update_roll_table(tables:Dummy[List[RollTable]], data:List[RollTable]) -> None:
    highest = max(t['id'] for t in tables.value) if tables.value else 0
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
    tables.value.clear()
    tables.value.extend(data)
    tables.dirty = True

def update_roll_tables(user:int, campaign:int, data:RollTables) -> None:
    tables = get_roll_tables(campaign)
    update_roll_table(get_roll_tables(campaign), data[0])
    update_roll_table(get_private_tables(user, campaign), data[1])
    # logging.info('tables: %r', tables)

def parse_and_roll_table(campaign:int, line:str) -> Tuple[str, str]:
    line = line.strip()
    tables = get_roll_tables(campaign).value
    mapping = {d['name'].lower(): d for d in tables}
    return parse_and_roll_table_inner(mapping, line, line, 0)

def parse_and_roll_private_table(user:int, campaign:int, line:str) -> Tuple[str, str]:
    line = line.strip()
    tables = get_private_tables(user, campaign).value
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
        is_subtable.append(e['flags'] & RollTableFlags.IS_TABLE)
    indexes = list(range(len(weights)))
    index = random.choices(indexes, weights=weights, k=1)[0]
    value = values[index]
    if is_subtable[index]:
        return parse_and_roll_table_inner(mapping, value, path+'❯'+value, depth+1)
    return value, path


def get_history(campaign:int) -> List[ChatMsg]:
    if campaign is None:
        return []
    return db.get_chat(campaign)

def get_private_history(userid:int, campaign:int) -> List[ChatHistory]:
    allmsgs = db.get_private_chat(userid, campaign)
    by_chat = {} # type: Dict[int, List[ChatMsg]]
    for type, chatname, data, uid, touserid in allmsgs:
        group = touserid if uid == userid else uid
        if group not in by_chat:
            by_chat[group] = []
        by_chat[group].append([type, chatname, json.loads(data)]) # type: ignore
    # FIXME: this means we are building potentially large list in memory
    # instead of limiting this at the DB level.
    result = [[k, v[-100:]] for k, v in by_chat.items()]
    return result # type: ignore

def handle_structured_input(userid:int, campaign:int, user:str, commands:List[Command], private:bool, to:int=None) -> List[ChatMsg]:
    def echo(user:str, text:str) -> ChatMsg:
        return (Msg.ECHOABLE_TEXT, user, text) # type: ignore
    def plain(user:str, text:str) -> ChatMsg:
        return (Msg.PLAIN, user, text) # type: ignore
    def dieroll(dice:Any) -> ChatMsg:
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
                table_result, path = parse_and_roll_table(campaign, table)
            except Exception as e:
                result.append(error(str(e)))
            else:
                if not table_result:
                    table_result = '(No entry)'
                result.append(plain('', path + ': '+table_result))
        elif cc == ChatCommand.MYTABLE:
            table: str = command[2] # type: ignore
            try:
                table_result, path = parse_and_roll_private_table(userid, campaign, table)
            except Exception as e:
                result.append(error(str(e)))
            else:
                if not table_result:
                    table_result = '(No entry)'
                result.append(plain('', path + ': '+table_result))
        else:
            raise Exception(cc)

    if not private:
        utcnow = datetime.datetime.utcnow()
        if to is not None:
            for msg in result:
                db.save_private_chat_msg(campaign, msg[0], msg[1], msg[2], created=utcnow, userid=userid, to=to)
        else:
            for msg in result:
                db.save_chat_msg(campaign, msg[0], msg[1], msg[2], created=utcnow, userid=userid)
    return result

def structured_roll_die(die:UnrolledDiceExpr) -> None:
    t = die[0]
    if t == DieExprTypes.NUMBER:
        return
    if t == DieExprTypes.DICE:
        vals = []
        for _ in range(die[1]):
            hi = die[2] # type: ignore
            if hi < 1:
                vals.append(0)
            else:
                vals.append(random.randint(1, die[2])) # type: ignore
        die.append(vals) # type: ignore
        return
    if t == DieExprTypes.GROUP:
        return structured_roll_die(die[1]) # type: ignore
    if t == DieExprTypes.Unary:
        return structured_roll_die(die[2]) # type: ignore
    if t == DieExprTypes.Binary:
        structured_roll_die(die[2]) # type: ignore
        structured_roll_die(die[3]) # type: ignore


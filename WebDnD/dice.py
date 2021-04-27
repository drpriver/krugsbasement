#!/usr/bin/env python3
from __future__ import annotations
import random
from typing import NamedTuple, List, DefaultDict, Tuple
from collections import defaultdict
import re
from io import StringIO
MINUS = '\u2212'
NBSPACE='&nbsp;'
class Die:
    def __init__(self, base:int, count:int=1, negative:bool=False):
        self.base     = base
        self.count    = count
        self.negative = negative
    def __eq__(self, other:object)->bool:
        if not isinstance(other, Die):
            return False
        return (self.base, self.count, self.negative) == (other.base, other.count, other.negative)
    def roll(self) -> DieRoll:
        if self.base == 1:
            return DieRoll(self, [self.count])
        return DieRoll(self, [random.randint(1, self.base) for _ in range(self.count)])

class DieRoll(NamedTuple):
    die: Die
    value: List[int]

def format_die_roll_results(results:List[DieRoll]) -> str:
    if not results:
        return '<span class="dice-constant">0</span><br> = <span class="dice-total">0</span>'
    buff = StringIO()
    
    val = 0
    first = results[0]
    def write_die(roll:DieRoll):
        nonlocal val
        if roll.die.base == 1:
            if roll.die.negative:
                buff.write(' '+MINUS+NBSPACE)
            elif buff.tell() != 0:
                buff.write(' +'+NBSPACE)
            else:
                buff.write(NBSPACE*2)
            buff.write('<span class="dice-constant">'+str(abs(roll.die.count))+'</span>')
            val += roll.die.count
            return
        for v in roll.value:
            if roll.die.negative:
                buff.write(' '+MINUS+NBSPACE)
            elif buff.tell() != 0:
                buff.write(' +'+NBSPACE)
            else:
                buff.write(NBSPACE*2)
            buff.write('[')
            if v == roll.die.base:
                buff.write('<span class="dice-roll dice-roll-max">')
            elif v == 1:
                buff.write('<span class="dice-roll dice-roll-min">')
            else:
                buff.write('<span class="dice-roll">')
            if roll.die.negative:
                val -= v
            else:
                val += v
            buff.write(str(v))
            buff.write('</span>')
            buff.write(']')
    for r in results:
        write_die(r)
    buff.write('<br> = ')
    buff.write('<span class="dice-total">')
    buff.write(str(val))
    buff.write('</span>')
    return buff.getvalue()

def dice_tokenizer(dicestring:str) -> List[str]:
    if len(dicestring) > 256:
        raise ValueError
    # This is super silly, but parsing strings will be short.
    dicestring = dicestring.replace(MINUS, '-')
    dicestring =  re.sub(r'\s+', '', dicestring)
    while '++' in dicestring or '+-' in dicestring or '-+' in dicestring or '--' in dicestring:
        dicestring = re.sub(r'\+\+', '+', dicestring)
        dicestring = re.sub(r'\+-',  '-', dicestring)
        dicestring = re.sub(r'-\+',  '-', dicestring)
        dicestring = re.sub(r'--',   '+', dicestring)
    tokens = []
    this_tok = ''
    for c in dicestring:
        if c == '+':
            if not this_tok:
                continue
            tokens.append(this_tok)
            this_tok =''
            continue
        if c == '-':
            if not this_tok:
                continue
            tokens.append(this_tok)
            this_tok ='-'
            continue
        this_tok += c
    if not this_tok:
        raise ValueError
    tokens.append(this_tok)
    return tokens

def token_normalize(token:str) -> str:
    if 'd' not in token:
        return token
    if token[0] == '-':
        if token[1] == 'd':
            return '-1' + token[1:]
        else:
            return token
    elif token[0] == 'd':
        return '1' + token
    else:
        return token

def dice_from_token(token:str) -> Die:
    if token[0] == '-':
        negative = True
        token = token[1:]
    else:
        negative = False
    if not token:
        raise ValueError('Cannot parse die from empty string')
    if 'd' not in token:
        base = 1
        count = int(token)
    else:
        count_token, base_token = token.split('d')
        count = int(count_token)
        base = int(base_token)
    if base == 1:
        return Die(base=base, count=-count if negative else count, negative=False)
    if negative:
        return Die(base=base, count=count, negative=True)
    else:
        return Die(base=base, count=count, negative=False)

def simplify_dice_array(dice: List[Die]) -> List[Die]:
    counts = defaultdict(int)  # type: DefaultDict[Tuple[int, bool], int]
    for d in dice:
        if not d.count:
            continue
        if not d.base:
            continue
        counts[(d.base, d.negative)] += d.count
    result = []
    for (base, negative), count in counts.items():
        if count == 0:
            continue
        result.append(Die(base=base, count=count, negative=negative))
    result.sort(key = lambda x: (-x.base, x.negative))
    return result

def dice_from_string(dicestring:str) -> List[Die]:
    # if dicestring.strip() == '0':
        # return [Die(0, 0, negative=False)]
    dice = [dice_from_token(token_normalize(token)) for token in dice_tokenizer(dicestring)]
    dice = simplify_dice_array(dice)
    return dice

def roll_and_format_dice_array(dice:List[Die]) -> str:
    ndice = sum(d.count for d in dice)
    if ndice > 64:
        return 'Too many dice'
    rolls = [d.roll() for d in dice]
    return format_die_roll_results(rolls)

if __name__ == '__main__':
    from unittest import TestCase, main
    class TestDiceParsing(TestCase):
        def test_dice_parses(self) -> None:
            cases = [
                ('d6', [Die(6)]),
                ('1', [Die(1, 1)]),
                ('1+4', [Die(1, 5)]),
                ('d6+3', [Die(6), Die(1,3)]),
                ('2d6', [Die(6,2)]),
                ('2d6+3', [Die(6,2), Die(1,3)]),
                ('1d6', [Die(6)]),
                ('1d6-3', [Die(6), Die(1,-3)]),
                ('3-1d6', [Die(6, 1, True), Die(1,3)]),
                ('d6-1d6', [Die(6, 1, False), Die(6,1, True)]),
                ('d4-8+2d6-d20', [Die(20, 1, True), Die(6,2), Die(4), Die(1, -8)]),
                ('d4'+MINUS+'8+2d6-d20', [Die(20, 1, True), Die(6,2), Die(4), Die(1, -8)]),
                ('0', []),
                ('1-1', []),
                ]
            for string, gt_dice in cases:
                dice = dice_from_string(string)
                self.assertEqual(dice, gt_dice)
        def test_rejects_invalid(self) -> None:
            cases = ['', '-', MINUS, '++', 'd20-', 'asd', '2&2', 'akjsdkl;as9283', '0b1', '0x3', '-+']
            for case in cases:
                try:
                    x = dice_from_string(case)
                except Exception:
                    self.assertTrue(True)
                else:
                    self.fail(f'dice_from_string({case!r}) = {x}, should\'ve thrown')


    main()

#!/usr/bin/env python3
import random
from collections import namedtuple
verbose_roll_result = namedtuple('verbose_roll', ['sum', 'dice_size','dice_outputs'])
class Dice:
    def verbose_roll(self):
        assert(len(self._dice) == 1)
        base, count = next(iter(self._dice.items()))
        dice_outputs = [random.randint(1,base) for _ in range(count)]
        result= sum(dice_outputs)
        return verbose_roll_result(sum = result, dice_size = base, dice_outputs = dice_outputs )
    def roll(self):
        result = 0
        for base, count in self._dice.items():
            if abs(base) == 1:
                result += count * base
                continue
            if base < 0:
                c = -1
                base = -base
            else:
                c = 1
            if count < 0:
                result -= c * sum( random.randint(1, base) for _ in range(-count))
            else:
                result += c * sum( random.randint(1, base) for _ in range(count))
        return result
    def __call__(self):
        return self.roll()
    def __init__(self, dice = {}):
        """Dice are mapped die_size: count"""
        self._dice = dict(dice)
        self._trim()
    def _clone(self):
        clone = Dice(self._dice)
        return clone
    def _trim(self):
        dice = {k: n for k,n in self._dice.items() if n and k}
        self._dice = dice
    def _add_int(self, integer):
        new = self._clone()
        new._dice[1] = self._dice.get(1, 0) + integer
        new._trim()
        return new
    def _add_Dice(self, dice):
        new = Dice( { k: self._dice.get(k, 0) + dice._dice.get(k, 0) for k in set(self._dice).union(set(dice._dice)) } )
        return new
    def _int_mul(self, integer):
        if integer > 0:
            new = Dice( {k:integer*n for k,n in self._dice.items() } )
        elif integer == 0:
            new = Dice()
        else:
            new = Dice( {-1*k:integer*n*-1 for k,n in self._dice.items() } )
            if new._dice.get(-1, 0):
                new._dice[1] = new._dice.pop(-1)*-1
        return new
    def __str__(self):
        result = ''
        n = 0
        for k in reversed(sorted(self._dice.keys())):
            if not n:
                if k == 1:
                    result += f'{self._dice[k]}'
                elif k < 0:
                    result += f'-{self._dice[k]}d{-k}'
                else:
                    result += f'{self._dice[k]}d{k}'
                n = 1
            else:
                if k == 1:
                    result += f'{self._dice[k]:+}'
                elif k < 0:
                    result += f'-{self._dice[k]}d{-k}'
                else:
                    result += f'{self._dice[k]:+}d{k}'
        if not result:
            result = '0'
        return result
    def __repr__(self):
        return 'Dice('+repr(self._dice)+')'
    def __add__(self, other):
        if isinstance(other, int):
            return self._add_int(other)
        elif isinstance(other, Dice):
            return self._add_Dice(other)
        else:
            raise TypeError(other)
    def __radd__(self, other):
        return self.__add__(other)
    def __mul__(self, integer):
        if not isinstance(integer, int):
            raise TypeError(integer)
        else:
            return self._int_mul(integer)
    def __rmul__(self, integer):
        return self.__mul__(integer)
    def m(self, integer):
        return self.__mul__(integer)
    def __sub__(self, other):
        return self.__add__(-1 * other)
    def __neg__(self):
        return self.__mul__(-1)
    def __eq__(self, other):
        if type(other) != Dice:
            return False
        self_bases = set(self._dice)
        other_bases = set(other._dice)
        if self_bases != other_bases:
            return False
        for base in self_bases:
            if self._dice[base] != other._dice[base]:
                return False
        return True
    @property
    def mean(self):
        result = sum(count * (base+1)/2 for base, count in self._dice.items())
        return result
roll = Dice.roll
def PMF(integer):
    return Dice({integer:1})
def constant(integer):
    return Dice({1:integer})
import re
def dice_tokenizer(dicestring):
    dicestring =  re.sub(r'\s+', '', dicestring)
    while '++' in dicestring or '+-' in dicestring or '-+' in dicestring or '--' in dicestring:
        dicestring = re.sub(r'\+\+', '+', dicestring)
        dicestring = re.sub(r'\+-',  '-', dicestring)
        dicestring = re.sub(r'-\+',  '-', dicestring)
        dicestring = re.sub(r'--',   '+', dicestring)
    tokens = re.findall(r'\+*(-*\w+)', dicestring)
    return tokens
def token_normalize(token):
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
def dice_from_token(token):
    if token[0] == '-':
        negative = True
        token = token[1:]
    else:
        negative = False
    if 'd' not in token:
        base = 1
        count = int(token)
    else:
        count_token, base_token = token.split('d')
        count = int(count_token)
        base = int(base_token)
    if negative:
        if base == 1:
            return Dice({base:-count})
        else:
            return Dice({-base:count})
    else:
        return Dice({base:count})
def dice_from_string(dicestring):
    return sum(dice_from_token(token_normalize(token)) for token in dice_tokenizer(dicestring))

test_dice_strings=[
    'd6',
    '1',
    '1+4',
    'd6+3',
    '2d6',
    '2d6+3',
    '2d6+1d8',
    '1d6',
    '1d6-3',
    '3-1d6',
    'd6-1d6',
    'd4-8+2d6-d20',
    ]
def test():
    for ds in test_dice_strings:
        die = dice_from_string(ds)
        print(die, '->', die.roll())
if __name__=='__main__':
    import sys
    args = sys.argv[1:]
    if args:
        dice = dice_from_string(' '.join(args))
        print('  ', dice, '-> ', dice.roll())
    else:
        import platform
        windows = (platform.system().lower()=='windows')
        print('ctrl-d to exit')
        print('enter rerolls last die')
        print('"v" or "verbose" toggles verbose mode')
        dice = None
        verbose = False
        while True:
            try:
                r = input('>> ')
            except EOFError:
                print()
                break
            r = r.replace('roll','')
            r = r.replace('r','')
            r = r.replace('/','')
            r = r.strip().lower()
            if r =='v' or r == 'verbose':
                verbose = not verbose
                continue
            if r=='q' or r=='quit':
                print()
                break
            if not r and not dice:
                if not windows:
                    print("\033[F", end='')
                    continue
            if r:
                try:
                    dice = dice_from_string(r)
                except ValueError:
                    print("   Error in parsing input")
                    continue
            else:
                if not windows:
                    print("\033[F", end='')
            if verbose:
                try:
                    verbose_result = dice.verbose_roll()
                except AssertionError:
                    pass
                else:
                    print('  ', dice, '->', ','.join(f'[{num}]' for num in verbose_result.dice_outputs), '->', verbose_result.sum)
                    continue
            print('  ', dice, '->', dice.roll())
            


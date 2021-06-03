from enum import IntEnum
import random

from typing import NamedTuple, Union, List, TYPE_CHECKING, cast, Dict, Any, Optional
if TYPE_CHECKING:
    from typing_extensions import Protocol
else:
    Protocol = object

class Roll(Protocol):
    def total(self) -> int:
        ...
    def as_jsonable(self) -> Dict[str, Any]:
        ...

class Value(Protocol):
    def roll(self) -> Roll:
        ...
    isgroup: bool

class DiceExpression(Protocol):
    def roll(self) -> Roll:
        ...

MINUS = '\u2212'
class Die:
    __slots__ = ('count', 'base')
    def __init__(self, count:int, base:int) -> None:
        self.count = count
        self.base = base
    def __str__(self) -> str:
        if self.base == 1:
            return str(self.count)
        if self.count == 1:
            if self.base < 0:
                return f'-d{-self.base}'
            return f'd{self.base}'
        if self.base < 0:
            return f'-{self.count}d{-self.base}'
        return f'{self.count}d{self.base}'
    def __repr__(self) -> str:
        return self.__str__()
    def __eq__(self, other:object) -> bool:
        if isinstance(other, Die):
            return (self.count, self.base) == (other.count, other.base)
        return False
    def roll(self) -> 'DieRoll':
        if self.base == 1:
            return DieRoll(self.base, self.count < 0, [self.count])
        negative = self.base < 0
        base = abs(self.base)
        values = [random.randint(1, base) for _ in range(self.count)]
        return DieRoll(base, negative, values)
    def neg(self) -> 'Die':
        if self.base == 1:
            return Die(-self.count, 1)
        return Die(self.count, -self.base)
    isgroup = False

class RollType(IntEnum):
    DICE = 0
    PRODUCT = 1
    SUM = 2


class DieRoll(NamedTuple):
    base: int
    negative: bool
    value: List[int]
    def total(self) -> int:
        sum_ = sum(self.value)
        if self.base == 1:
            return sum_
        if self.negative:
            sum_ = -sum_
        return sum_
    def as_jsonable(self) -> Dict[str, Any]:
        return {
            'type': RollType.DICE,
            'base':self.base,
            'negative':self.negative,
            'values':self.value,
            }

class Group:
    __slots__ = ('contents', 'op')
    isgroup = True
    def __init__(self, op:str):
        self.contents = []  # type: List[Value]
        self.op = op
    def __repr__(self) -> str:
        return f'Group(op={self.op}, {self.contents})'
    def __str__(self) -> str:
        filling = self.op.join(str(c) for c in self.contents)
        if self.op == '*': return filling
        return '(' +filling+ ')'
    def add(self, thing:'Value') -> None:
        if thing.isgroup and thing.op == self.op: # type: ignore
            self.contents.extend(thing.contents) # type: ignore
            return
        self.contents.append(thing)
    def roll(self) -> 'GroupRoll':
        values = [v.roll() for v in self.contents]
        type = {
                '+': RollType.SUM,
                '*': RollType.PRODUCT,
            }[self.op]
        return GroupRoll(type, values)
    def __eq__(self, other:object) -> bool:
        if isinstance(other, Group):
            return self.op == other.op and self.contents == other.contents
        return False

class GroupRoll(NamedTuple):
    type: RollType
    values: List[Roll]
    def as_jsonable(self) -> Dict[str, Any]:
        return {
                'type':self.type,
                'values': [v.as_jsonable() for v in self.values]
                }
    def total(self) -> int:
        if self.type == RollType.PRODUCT:
            val = 1
            for v  in self.values:
                val *= v.total()
            return val
        if self.type == RollType.SUM:
            val = 0
            for v in self.values:
                val += v.total()
            return val
        raise AssertionError

def roll_dice(group:Value) -> Dict[str, Any]:
    roll = group.roll()
    total = roll.total()
    return {'total':total, 'roll':roll.as_jsonable()}

def roll_and_print(group:Value) -> None:
    roll = group.roll()
    import io
    s = io.StringIO()
    format_(roll, s)
    print(s.getvalue())

def format_(roll, s, need_paren=False):
    if isinstance(roll, DieRoll):
        format_die_roll(roll, s, need_paren)
    else:
        assert isinstance(roll, GroupRoll)
        if roll.type == RollType.PRODUCT:
            format_product_roll(roll, s, need_paren)
        else:
            format_sum_roll(roll, s, need_paren)

def format_die_roll(roll, s, need_paren):
    if need_paren:
        s.write('(')
    if roll.base == 1:
        assert len(roll.value) == 1
        s.write(f'{roll.value[0]}')
    elif roll.negative:
        for v in roll.value:
            s.write(f'-{v}/{roll.base}')
    else:
        v = roll.value[0]
        s.write(f'{v}/{roll.base}')
        for v in roll.value[1:]:
            s.write(f'+{v}/{roll.base}')
    if need_paren:
        s.write(')')

def format_product_roll(roll, s, need_paren):
    if need_paren:
        s.write('(')
    v = roll.values[0]
    subparen = False
    if isinstance(v, DieRoll):
        if len(v.value) > 1:
            subparen = True
    else:
        if v.type == RollType.SUM:
            subparen = True
    format_(v, s, subparen)
    for v in roll.values[1:]:
        s.write('*')
        subparen = False
        if isinstance(v, DieRoll):
            if len(v.value) > 1:
                subparen = True
        else:
            if v.type == RollType.SUM:
                subparen = True
        format_(v, s, subparen)
    if need_paren:
        s.write(')')
def format_sum_roll(roll, s, need_paren):
    if need_paren:
        s.write('(')
    format_(roll.values[0], s, False)
    for v in roll.values[1:]:
        s.write('+')
        format_(v, s, False)
    if need_paren:
        s.write(')')

def normalize(s:str) -> str:
    s = s.lower()
    s = s.replace(' ', '')
    while True:
        l = len(s)
        s = s.replace('-+', '-')
        s = s.replace('+-', '-')
        s = s.replace('--', '+')
        s = s.replace('++', '+')
        if len(s) == l:
            break
    return s

def parse_die(s:str, negative:bool=False) -> Die:
    if 'd' in s:
        count, base = s.split('d')
        count = int(count) if count else 1
        base = int(base)
        if negative:
            base *= -1
        if count == 0:
            return Die(0, 1)
        if base == 0:
            return Die(0, 1)
        if base == -1:
            return Die(-count, 1)
        return Die(count, base)
    return Die(-int(s) if negative else int(s), 1)

def tokenize(s:str) -> List[Union[Value, str, List[Any]]]:
    '''

    For the real return value:
    NodeGroup = Node (op Node)*
        Stored as a list

    Node = Die | NodeGroup

    Returns the toplevel NodeGroup
    '''
    stack = []
    b = ''
    current = [] # type: List[Union[Value, str, List[Any]]]
    negative = False
    def do_die() -> None:
        nonlocal negative
        nonlocal b
        # print('do_die:', repr(b))
        if b:
            current.append(parse_die(b, negative))
            negative = False
        else:
            if negative: raise Exception
        b = ''
    closed = False
    for c in s:
    # for i, c in enumerate(s):
        # print('c:', repr(c))
        if c == '(':
            if closed: raise Exception
            if not b and negative:
                negative = False
                current.append(parse_die('1', True))
                current.append('*')
            else:
                do_die()
            stack.append(current)
            current.append([])
            current = current[-1] # type: ignore
            continue
        if c == ')':
            do_die()
            assert len(current) & 1
            current = stack.pop()
            closed = True
            continue
        if c == '*':
            closed = False
            # No unary star
            if not b and not current: raise Exception
            do_die()
            current.append('*')
            continue
        # ban / for now
        if 0 and c == '/':
            closed = False
            # No unary slash
            if not b and not current: raise Exception
            do_die()
            current.append('/')
            continue
        if c == '+':
            closed = False
            do_die()
            if current and current[-1] != '*': current.append('+')
            continue
        if c == '-':
            closed = False
            do_die()
            if current and current[-1] != '*': current.append('+')
            negative = True
            continue
        if closed: raise Exception
        b += c
    do_die()
    if stack: raise Exception
    # print(len(current))
    assert len(current) & 1
    return current

def _group(tokens:List[Union[str, Value, List[Any]]]) -> Value:
    if not tokens:
        raise Exception
    if len(tokens) == 1:
        tok = tokens[0]
        if isinstance(tok, list):
            return _group(tok)
        assert not isinstance(tok, str)
        return tok 
    op = None
    outer = Group('+')
    current:Optional[Group] = None
    assert len(tokens) & 1
    N = len(tokens)-1
    i = 0
    while i < N:
        tok = tokens[i]
        assert not isinstance(tok, str)
        if isinstance(tok, list):
            tok = _group(tok)
        op = tokens[i+1]
        assert isinstance(op, str)
        i += 2
        assert op in '+*'
        if current is not None:
            current.add(tok)
            if op == '+':
                current = None
            continue
        if op == '*':
            current = Group('*')
            current.add(tok)
            outer.add(current)
            continue
        if op == '+':
            assert current is None
            outer.add(tok)
            continue
        raise Exception(op)
    # handle the last one
    tok = tokens[-1]
    if isinstance(tok, list):
        tok = _group(tok)
    assert not isinstance(tok, str)
    if current is None:
        outer.add(tok)
    else:
        current.add(tok)
    if len(outer.contents) == 1:
        return outer.contents[0]
    return outer

def group(tokens:List[Union[str, Value, List[Any]]]) -> Value:
    result = _group(tokens)
    if result.isgroup:
        result = cast(Group, result)
        result = simplify(result)
    return result

def simplify(group:Group) -> Value:
    if len(group.contents) == 1:
        c = group.contents[0]
        if c.isgroup:
            return simplify(c) # type: ignore
        return c
    assert group.op in '+*'
    if group.op == '+':
        contents = group.contents
        groups = [] # type: List[Value]
        dice_by_base = {}
        for c in contents:
            if c.isgroup:
            # if isinstance(c, Group):
                c = cast(Group, c)
                c = simplify(c)
            if c.isgroup:
            # if isinstance(c, Group):
                c = cast(Group, c)
                groups.append(c)
                continue
            # assert isinstance(c, Die)
            else:
                c = cast(Die, c)
                # assert isinstance(c, Die)
                if c.base not in dice_by_base:
                    dice_by_base[c.base] = c.count
                else:
                    dice_by_base[c.base] += c.count
        contents = [Die(count, base) for base, count in dice_by_base.items() if count and base] # type: List[Value]
        contents.extend(groups)
        if not contents:
            contents.append(Die(0, 1))
        if len(contents) == 1:
            return contents[0]
        g = Group('+')
        g.contents = contents
        return g
        # print(f'+ {group.contents=}')
        # print(f'+ {contents=}')
        # group.contents = contents
        # return

    if group.op == '*':
        contents = group.contents
        groups = []
        dice = [] # type: List[Die]
        base1 = 1
        for c in contents:
            if c.isgroup:
            # if isinstance(c, Group):
                c = cast(Group, c)
                c = simplify(c)
            if c.isgroup:
            # if isinstance(c, Group):
                c = cast(Group, c)
                groups.append(c)
                continue
            else:
                # assert isinstance(c, Die)
                c = cast(Die, c)
                if c.base == 0 or c.count == 0:
                    return Die(0,1)
                if c.base == 1:
                    base1 *= c.count
                else:
                    dice.append(c)
        if base1 < 0 and dice:
            dice = [d.neg() for d in dice]
            base1 = -base1
        contents = dice + groups # type: ignore
        if base1 != 1:
            contents.append(Die(base1, 1))
        # print(f'* {group.contents=}')
        # print(f'* {contents=}')
        if not contents:
            return Die(1, 1)
        if len(contents) == 1:
            return contents[0]
        g = Group('*')
        g.contents = contents
        return g
    raise AssertionError


def transform(text:str) -> Value:
    n = normalize(text)
    t = tokenize(n)
    g = group(t)
    return g

def timing() -> None:
    import time
    for _ in range(10):
        t0 = time.time()
        # text = '0d30 - 3d0 - 3d1 + (3+3)*3-3d6+3*-3d6*3+(9-9)+3d6 + 2 + 3d6 ------------- 2'
        # text = '3*-3d6'
        # text = '-(3*3)'
        # text = 'd20+2+2'
        text = '('*2000 + '1' + ')'*2000
        # text = 'd6+d6+d6+d6+d6+d6+d6-2-2-2+3-2+3'
        tree = dice_from_string(text)
        t1 = time.time()
        print(f'{(t1-t0)*1000:.3f}ms')

def dice_from_string(dicestring:str) -> DiceExpression:
    if len(dicestring) > 128:
        raise Exception('string too long')
    while dicestring.startswith('/'):
        dicestring = dicestring[1:]
    if dicestring.startswith('roll'):
        dicestring = dicestring[4:]
    elif dicestring.startswith('r'):
        dicestring = dicestring[1:]
    dicestring = dicestring.replace(MINUS, '-')
    return transform(dicestring)

def ex(foo:str) -> None:
    t = transform(foo)
    r = str(t)
    print(r)
    t2 = transform(r)
    assert t == t2
    assert str(t2) == r
    from pprint import pprint
    pprint(roll_dice(transform(foo)))

if __name__ == '__main__':
    if 0:
        timing()
        exit()
    if 0:

        # ex('(1d6)-4d4 -1d8+ (1d3 + 2d9 * (3d7+4d5)) -- -- -- -- -- 4d6 * d3')
        ex('+----------+++-3')
        ex('2*3-3')
        ex('1-2*3-4*5')
        ex('0d30 - 3d0 - 3d1 + (3+3)*3-3d6+3*-3d6*3+(9-9)+3d6 + 2 + 3d6 ------------- 2')
        ex('d6+d6+d6+d6+d6+d6+d6-2-2-2+3-2+3')
        exit()
    if 0:
        while True:
            try:
                ex(input('>>> ').strip())
            except EOFError:
                break
        exit()
    if 0:
        ex('d10*+d10')
        exit()
    if 0:
        while True:
            try:
                roll_and_print(transform(input('>>> ')))
            except EOFError:
                break
            except Exception as e:
                print(e)
                continue
        exit()
    from unittest import TestCase, main
    class TestDiceParsing(TestCase):
        def test_dice_parses(self) -> None:
            def die(base:int, count:int=1) -> Die:
                return Die(count, base)
            def sum_(*die:Value) -> Group:
                g = Group('+')
                g.contents = list(die)
                return g
            def prod(*die:Value) -> Group:
                g = Group('*')
                g.contents = list(die)
                return g
            cases = [
                ('roll d6', die(6)),
                ('rolld6', die(6)),
                ('r d6', die(6)),
                ('rd6', die(6)),
                ('//////roll d6', die(6)),
                ('/roll d6', die(6)),
                ('/rolld6', die(6)),
                ('/r d6', die(6)),
                ('/rd6', die(6)),
                ('d6', die(6)),
                ('1', die(1, 1)),
                ('1+4', die(1, 5)),
                ('d6+3', sum_(die(6), die(1,3))),
                ('2d6', die(6,2)),
                ('2d6+3', sum_(die(6,2), die(1,3))),
                ('1d6', die(6)),
                ('1d6-3', sum_(die(6), die(1,-3))),
                ('3-1d6', sum_(die(1, 3), die(-6, 1), )),
                ('0-1d6', die(-6,1)),
                ('-1d6', die(-6,1)),
                ('d6-1d6', sum_(die(6, 1), die(-6,1))),
                ('d4-8+2d6-d20', sum_(die(4), die(1,-8), die(6, 2), die(-20, 1))),
                ('d4'+MINUS+'8+2d6-d20', sum_(die(4), die(1,-8), die(6, 2), die(-20, 1))),
                ('0', die(1, 0)),
                ('1-1', die(1, 0)),
                ('1d1-1', die(1, 0)),
                ('(1-1)', die(1, 0)),
                ('(1)-(1)', die(1, 0)),
                ('(d6)', die(6)),
                ('(1d6)', die(6)),
                ('-(1d6)', die(-6)),
                ('(d6)-(1d6)', sum_(die(6), die(-6))),
                ('-3*d6', prod(die(-6), die(1, 3))),
                ('(-3)*d6', prod(die(-6), die(1, 3))),
                ('((-3)*(d6))', prod(die(-6), die(1, 3))),
                ('d10*d10', prod(die(10), die(10))),
                ('d10*+d10', prod(die(10), die(10))),
                ('d10*(+d10)', prod(die(10), die(10))),
                ('d10++(d8)', sum_(die(10), die(8))),
                ]
            for string, gt_dice in cases:
                dice = dice_from_string(string)
                if dice != gt_dice:
                    print(dice, gt_dice, string)
                self.assertEqual(dice, gt_dice)
                dice = dice_from_string(string.replace('d', 'D'))
                self.assertEqual(dice, gt_dice)
                dice = dice_from_string(str(dice))
                self.assertEqual(dice, gt_dice)
        def test_rejects_invalid(self) -> None:
            cases = ['', '-', MINUS, '++', 'd20-', 'asd', '2&2', 'akjsdkl;as9283', '0b1', '0x3', '-+', '1dd3', '1dD3', 'd', 'D', '1D', '1d', ')', '(', 'd6)', 'd6**d6', 'd6+*d6']
            for case in cases:
                try:
                    x = dice_from_string(case)
                except Exception:
                    self.assertTrue(True)
                else:
                    self.fail(f'dice_from_string({case!r}) = {x}, should\'ve thrown')


    main()

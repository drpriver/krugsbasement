from typing import List, Tuple, Union
KVS = List[Union[str, Tuple[str, str]]]
def get_values() -> Tuple[KVS, KVS]:
    fp = open('message-enum.txt', encoding='utf-8')
    firstline = next(fp).strip()
    assert firstline == 'FromClient'
    FromClient = []
    ToClient = []
    container = FromClient
    for line in fp:
        line = line.strip()
        if not line: continue
        if line == '---': continue
        if line.startswith('#'):
            container.append(line[1:])
            continue
        if line == 'ToClient': 
            container = ToClient
            continue
        caps, string  = line.split('=')
        caps = caps.strip()
        string = string.strip()
        container.append((caps, string))

    fp.close()
    return FromClient, ToClient

def make_python(fc:KVS, tc:KVS) -> None:
    fp = open('WebDnD/messages.py', 'w', encoding='utf-8')
    print('from enum import Enum', file = fp)
    print('', file=fp)
    print('class FromClient(str, Enum):', file=fp)
    for item in fc:
        if isinstance(item, tuple):
            key, value = item
            print(f"    {key} = '{value}'", file=fp)
        else:
            print(f"    #{item}", file=fp)
    print('', file=fp)
    print('class ToClient(str, Enum):', file=fp)
    for item in tc:
        if isinstance(item, tuple):
            key, value = item
            print(f"    {key} = '{value}'", file=fp)
        else:
            print(f"    #{item}", file=fp)
    fp.flush()
    fp.close()

def make_ts(fc:KVS, tc:KVS) -> None:
    fp = open('messages.ts', 'w', encoding='utf-8')
    print('const enum FromClient {', file=fp)
    for item in fc:
        if isinstance(item, tuple):
            key, value = item
            print(f"    {key} = '{value}',", file=fp)
        else:
            print(f"    //{item}", file=fp)
    print('}', file=fp)
    print('', file=fp)
    print('const enum ToClient {', file=fp)
    for item in tc:
        if isinstance(item, tuple):
            key, value = item
            print(f"    {key} = '{value}',", file=fp)
        else:
            print(f"    //{item}", file=fp)
    print('}', file=fp)
    fp.flush()
    fp.close()

if __name__ == '__main__':
    FromClient, ToClient = get_values()
    make_python(FromClient, ToClient)
    make_ts(FromClient, ToClient)

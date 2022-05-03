import glob
files = glob.glob('*/*.bug') + glob.glob('*.bug')
for f in files:
    with open(f) as fp:
        text = fp.read().strip()
    if text.startswith('Changelog::kv'): continue
    outlines = []
    saw_magic = False
    outlines.append('Changelog::kv')
    for line in text.split('\n'):
        if saw_magic:
            outlines.append(line)
        elif 'bugmagic' in line:
            saw_magic = True
            continue
        else:
            outlines.append('  '+line)
    if not saw_magic:
        with open(f, 'w') as fp:
            print('Changelog::kv', file=fp)
            print(text.strip(), file=fp)
    else:
        with open(f, 'w') as fp:
            for line in outlines:
                print(line, file=fp)



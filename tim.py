import json
import time
data = json.load(open('BadDb/canvas.json'))

def ser():
    t0 = time.time()
    # json.dump(data, open('lmao', 'w'))
    open('lmao', 'w').write(json.dumps(data))
    t1 = time.time()
    return t1 - t0

times = [ser() for _ in range(100)]
print(f'{sum(times)/len(times)*1000:.3f}ms')

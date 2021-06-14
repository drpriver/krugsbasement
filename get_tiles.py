import os
import shutil
import json
data = json.load(open('terrain.json'))
shutil.rmtree('tiles')
os.mkdir('tiles')
for d in data:
    if 'path' in d:
        path  = d['path']
        shutil.copy(os.path.join('tilesorig', path), os.path.join('tiles', path))

import PIL
from PIL import Image
import os
TOKENDIR = 'tokens'
ICONDIR = 'icons'
TILEDIR = 'tiles'
def do_it(directory:str, size:int) -> None:
    tokens = os.listdir(directory)
    for token in tokens:
        path = os.path.join(directory, token)
        if path.endswith('.DS_Store'):
            os.unlink(path)
            continue
        img = Image.open(path)
        bigger = max(img.size)
        head, tail = os.path.splitext(path)
        savepath = head + '.png'
        if os.path.isfile(savepath):
            continue
        if bigger > size:
            img.thumbnail((size, size))
            img.save(savepath)
        elif not path.endswith('.png'):
            img.save(savepath)
            os.unlink(path)
def main() -> None:
    do_it(TOKENDIR, 256)
    do_it(ICONDIR, 32)
    do_it(TILEDIR, 250)

if __name__ == '__main__':
    main()

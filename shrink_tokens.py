import PIL
from PIL import Image
import os
TOKENDIR = 'tokens'
ICONDIR = 'icons'
def do_tokens() -> None:
    tokens = os.listdir(TOKENDIR)
    for token in tokens:
        path = os.path.join(TOKENDIR, token)
        if path.endswith('.DS_Store'):
            os.unlink(path)
            continue
        img = Image.open(path)
        bigger = max(img.size)
        head, tail = os.path.splitext(path)
        savepath = head + '.png'
        if bigger > 256:
            img.thumbnail((256, 256))
            img.save(savepath)
        elif not path.endswith('.png'):
            img.save(savepath)
            os.unlink(path)

def do_icons() -> None:
    icons = os.listdir(ICONDIR)
    for icon in icons:
        path = os.path.join(ICONDIR, icon)
        if path.endswith('.DS_Store'):
            os.unlink(path)
            continue
        img = Image.open(path)
        bigger = max(img.size)
        head, tail = os.path.splitext(path)
        savepath = head + '.png'
        if bigger > 32:
            img.thumbnail((32, 32))
            img.save(savepath)
        elif not path.endswith('.png'):
            img.save(savepath)
            os.unlink(path)
def main():
    do_tokens()
    do_icons()

if __name__ == '__main__':
    main()

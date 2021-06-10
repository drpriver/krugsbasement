import PIL
from PIL import Image
import os
TOKENDIR = 'tokens'
def main():
    tokens = os.listdir(TOKENDIR)
    for token in tokens:
        path = os.path.join(TOKENDIR, token)
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

if __name__ == '__main__':
    main()

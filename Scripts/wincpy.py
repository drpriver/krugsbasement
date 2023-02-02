import argparse
import shutil

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('f', nargs='+')
    args = parser.parse_args()

    run(**vars(args))

def run(f:list[str]) -> None:
    if len(f) < 2: return
    dst = f[-1]
    for p in f[:-1]:
        shutil.copy(p, dst)

if __name__ == '__main__':
    main()


import argparse
import os

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('f', nargs='+')
    args = parser.parse_args()

    run(**vars(args))

def run(f:list[str]) -> None:
    for p in f:
        os.makedirs(p, exist_ok=True)

if __name__ == '__main__':
    main()


%.js: %.ts
	docker run --rm -it -v "$$PWD:/WebDnD" tsc bash -c "cd /WebDnD && make docker-make SOURCE=$< OUT=$@"

TSCFLAGS:=--noImplicitAny --strict --noUnusedLocals --noImplicitReturns --noFallthroughCasesInSwitch --removeComments --target es6

.PHONY: docker-make
docker-make:
	tsc $(SOURCE) $(TSCFLAGS) --outfile $(OUT) | cat

.DEFAULT_GOAL:=all
all: chat.js canvas.js

.PHONY: run
run: all
	. venv/bin/activate && python3 -m WebDnD.app


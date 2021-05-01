canvas.js: canvas.ts
	docker run --rm -it -v $$(pwd):/WebDnD tsc bash -c "cd /WebDnD && make docker-make"

.PHONY: docker-make
docker-make: 
	tsc canvas.ts --noImplicitAny --strict --noUnusedLocals --noImplicitReturns --noFallthroughCasesInSwitch --removeComments --target es6 --outFile canvas.js | cat

.DEFAULT_GOAL: canvas.js

.PHONY: run
run: canvas.js
	. venv/bin/activate && python3 -m WebDnD.app


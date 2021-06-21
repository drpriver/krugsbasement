Depends: ; mkdir -p $@
DEPFILES:= $(wildcard Depends/*.dep)
include $(DEPFILES)
TSCFLAGS:=--noImplicitAny --strict --noUnusedLocals --noImplicitReturns --noFallthroughCasesInSwitch --removeComments --target es2020 --noEmitOnError
TSFILES:= toplevel.ts chat.ts canvas.ts notes.ts
combined.js: $(TSFILES)
	docker run --rm -it -v "$$PWD:/WebDnD" tsc bash -c "cd /WebDnD && tsc $^ $(TSCFLAGS) --outFile $@ | cat"

.PHONY: watcher
watcher:
	docker run --rm -it -v "$$PWD:/WebDnD" tsc bash -c "cd /WebDnD && tsc -w $(TSFILES) $(TSCFLAGS) --outFile combined.js"
.DEFAULT_GOAL:=combined.js

.PHONY: run
run: combined.js token-list
	. venv/bin/activate && python3 -m WebDnD.app

screen.html: screen.dnd combined.js | Depends
	dndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces

.PHONY: dist.zip
dist.zip: screen.html
	rm -rf dist dist.zip
	mkdir -p dist
	cp screen.html dist
	mkdir -p dist/WebDnD
	mkdir -p dist/BadDb
	cp WebDnD/*.py dist/WebDnD
	cp DemoDb/*.json dist/BadDb
	cp requirements.txt dist
	cp setup.py dist
	echo "DEV=False" > dist/WebDnD/appconfig.py
	zip -r dist dist
	rm -rf dist

.PHONY: token-list
token-list:
	ls tokens > token-list.txt
.PHONY: shrink-tokens
shrink-tokens:
	python3 shrink_tokens.py

ship-it: dist.zip
	scp dist.zip david@droplet:/home/david
	ssh david@droplet "make backup && rm -rf dist && unzip dist && make restore && make token-list"

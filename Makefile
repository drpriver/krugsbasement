Depends: ; mkdir -p $@
DEPFILES:= $(wildcard Depends/*.dep)
include $(DEPFILES)
TSCFLAGS:=--noImplicitAny --strict --noUnusedLocals --noImplicitReturns --noFallthroughCasesInSwitch --removeComments --target es2020 --noEmitOnError
TSFILES:= toplevel.ts chat.ts canvas.ts notes.ts utils.ts messages.ts interp.ts storage.ts nodes.ts dialogs.ts
TSC:=/Users/drpriver/External/quickjs-typescript-4.0.0-linux-x86/lib/tsc
ifneq ($(LOCALTSC),)
combined.js: $(TSFILES)
	$(TSC) $^ $(TSCFLAGS) --outFile $@
else
combined.js: $(TSFILES)
	docker run --rm -it -v "$$PWD:/WebDnD" tsc bash -c "cd /WebDnD && tsc $(TSFILES) $(TSCFLAGS) --outFile $@ | cat"
endif

.PHONY: watcher
watcher:
	docker run --rm -it -v "$$PWD:/WebDnD" tsc bash -c "cd /WebDnD && tsc -w $(TSFILES) $(TSCFLAGS) --outFile combined.js"
.DEFAULT_GOAL:=combined.js

.PHONY: run
run: combined.js token-list WebDnD/messages.py
	. venv/bin/activate && python3 -m WebDnD.app

screen.html: screen.dnd combined.js | Depends
	dndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces

macro-doc.html: Docs/macro-doc.dnd
	dndc $< --output $@

messages.ts WebDnD/messages.py: types.shared Scripts/make_enums.py
	python3 Scripts/make_enums.py

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
.PHONY: backup
backup:
	ssh david@droplet "make backup"
	-mv BadDb.tar.gz BadDb.tar.gz.bak
	scp "david@droplet:/home/david/BadDb.tar.gz" .
	rm -rf BadDb
	tar xzf BadDb.tar.gz
tags: *.ts Scripts/tag_ts.py
	python3 -m Scripts.tag_ts

DOCS=macro-doc.html

.PHONY: ship-docs
ship-docs: $(DOCS)
	scp $< david@droplet:/home/david/docs/docs

.PHONY: mypy
mypy:
	mypy -p WebDnD.app --namespace-packages --ignore-missing-imports

Bin/meta: meta.c
	$(CC) $< -o $@
# there should be a rule that this generates dialogs.ts
screen.temp.html: screen.dnd
	dndc $< --output $@ --strip-spaces --allow-js-write

nodes.ts: Bin/meta screen.temp.html
	Bin/meta > nodes.ts

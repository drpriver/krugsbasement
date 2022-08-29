Depends: ; mkdir -p $@
Depends/Generated: ; mkdir -p $@
Depends/Bin: ; mkdir -p $@
Generated: ; mkdir -p $@
Bin: ; mkdir -p $@
Archives: ; mkdir -p $@
DEPFILES:= $(wildcard Depends/*.dep Depends/Generated/*.dep Depends/Bin/*.dep)
include $(DEPFILES)
TSCFLAGS:=--noImplicitAny --strict --noUnusedLocals --noImplicitReturns --noFallthroughCasesInSwitch --removeComments --target es2020 --noEmitOnError --strictFunctionTypes
TSFILES:= internal_listeners.ts toplevel.ts chat.ts canvas.ts notes.ts utils.ts Generated/messages.ts \
	  interp.ts storage.ts Generated/nodes.ts dialogs.ts \
	  Generated/dialogdefs.ts subwindows.ts Generated/subwindowdefs.ts macros.ts \
	  Generated/packed.ts geometry.ts
ifneq ($(LOCALTSC),)
Generated/combined.js: $(TSFILES) | Generated
	$(LOCALTSC) $^ $(TSCFLAGS) --outFile $@
Generated/demo.js: demo.ts Generated/messages.ts | Generated
	$(LOCALTSC) $^ $(TSCFLAGS) --outFile $@
else
Generated/combined.js: $(TSFILES) | Generated
	docker run --rm -it -v "$$PWD:/WebDnD" tsc bash -c "cd /WebDnD && tsc $(TSFILES) $(TSCFLAGS) --outFile $@ | cat"
Generated/demo.js: demo.ts Generated/messages.ts | Generated
	docker run --rm -it -v "$$PWD:/WebDnD" tsc bash -c "cd /WebDnD && tsc demo.ts Generated/messages.ts $(TSCFLAGS) --outFile $@ | cat"
endif

.PHONY: watcher
watcher:
	docker run --rm -it -v "$$PWD:/WebDnD" tsc bash -c "cd /WebDnD && tsc -w $(TSFILES) $(TSCFLAGS) --outFile Generated/combined.js"
.DEFAULT_GOAL:=Generated/dungeon.html

appconfig.py:
	@echo "# this config is for development." > appconfig.py
	@echo "# Use different settings on the server" >> appconfig.py
	@echo "# This should be False on the server" >> appconfig.py
	@echo "DEV = True " >> appconfig.py
	@echo "# Where the database is" >> appconfig.py
	@echo "DBNAME = 'campaigns.db'" >> appconfig.py
	@echo "# Where static files are" >> appconfig.py
	@echo "STATICDIR = 'Generated'" >> appconfig.py
	@echo "# DON'T USE THIS ON THE HOST. SET IT TO AN ACTUAL RANDOM KEY" >> appconfig.py
	@echo "# VIA os.urandom." >> appconfig.py
	@echo "SECRET_KEY = 'dev'" >> appconfig.py
	@echo "# set to blank to disable invite codes" >> appconfig.py
	@echo "INVITE_CODE = 'dev'" >> appconfig.py


.PHONY: run
run: Generated/dungeon.html Generated/demo.html WebDnD/messages.py | appconfig.py
	. venv/bin/activate && python3 -m WebDnD.app

Generated/dungeon.html: client.dnd Generated/combined.js | Depends Depends/Generated
	. venv/bin/activate && python3 -m pydndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces
Generated/demo.html: demo.dnd Generated/demo.js | Depends Depends/Generated
	. venv/bin/activate && python3 -m pydndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces

Generated/%.html: Docs/%.dnd | Generated Depends/Generated
	. venv/bin/activate && python3 -m pydndc $< --output $@ --depends-path Depends/$@.dep
# This is so that the dev server can serve things from the Generated folder.
Generated/%.dnd: %.dnd
	cp $< $@
Generated/%.css: %.css
	cp $< $@
Generated/%.js: %.js
	cp $< $@

Generated/messages.ts WebDnD/messages.py flask_socketio.pyi: types.shared Scripts/make_enums.py | Generated
	python3 Scripts/make_enums.py

.PHONY: dist.zip
dist.zip: Generated/dungeon.html Generated/demo.html Generated/packed.webp Generated/packed.png Generated/toks.webp Generated/toks.png Generated/packed.json
	rm -rf dist dist.zip
	mkdir -p dist/packed dist/WebDnD
	cp server.mak dist
	cp Generated/dungeon.html Generated/demo.html register.dnd home.dnd login.dnd login.css darkmode.js dist
	cp Generated/packed.json Generated/packed.png Generated/packed.webp Generated/toks.png Generated/toks.webp dist/packed
	cp WebDnD/*.py dist/WebDnD
	cp requirements.txt dist
	cp setup.py dist
	cat .git/refs/heads/master > dist/githash
	zip -r dist dist
	rm -rf dist

.PHONY: shrink-tokens
shrink-tokens:
	python3 shrink_tokens.py

ship-it: dist.zip
	scp dist.zip david@website:/home/david/dist.zip
	ssh david@website "cd ~webdnd && bash unpack.sh"
.PHONY: backup
backup: | Archives
	ssh david@website "cd ~webdnd && bash backup.sh"
	scp "david@website:~webdnd/data/campaigns.db.bak" campaigns.db
	cp campaigns.db Archives/campaigns.db.$$(date '+%Y-%m-%d-%T').bak
tags: *.ts Scripts/tag_ts.py types.shared
	python3 -m Scripts.tag_ts

DOCS=Generated/macro-doc.html Generated/tables.html

.PHONY: ship-docs
ship-docs: $(DOCS)
	scp $(DOCS) david@website:/home/david/docs/docs

.PHONY: mypy
mypy: flask_socketio.pyi
	mypy -p WebDnD.app --namespace-packages --ignore-missing-imports --disallow-untyped-defs

Bin/%: C/%.c | Bin Depends/Bin
	$(CC) -O3 $< -o $@ -IC -Wall -Wextra -MT $@ -MMD -MP -MF Depends/$@.dep
Bin/pack:
Bin/meta:

Generated/subwindowdefs.ts Generated/dialogdefs.ts Generated/dungeon.temp.html: dungeon.dnd | Generated
	. venv/bin/activate && python3 -m pydndc $< --output Generated/dungeon.temp.html --strip-spaces --allow-js-write --jsargs '{"temp":true}'

Generated/nodes.ts: Bin/meta Generated/dungeon.temp.html | Generated
	Bin/meta Generated/dungeon.temp.html $@
.PHONY: clean
clean:
	$(RM) $(wildcard Generated/*) Generated/dungeon.html

.PHONY: pack
pack: Generated/packed.json Generated/packed.webp Generated/packed.png Generated/toks.png Generated/toks.webp
Generated/packed.json Generated/packed.webp Generated/packed.png Generated/toks.webp Generated/toks.png Generated/packed.ts: Scripts/pack.py Bin/pack | Generated
	python3 Scripts/pack.py
.PHONY: echo-deployed-hash
echo-deployed-hash:
	ssh website "cd ~webdnd && cat dist/githash"

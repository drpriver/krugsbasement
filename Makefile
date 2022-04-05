Depends: ; mkdir -p $@
Depends/Generated: ; mkdir -p $@
Generated: ; mkdir -p $@
Bin: ; mkdir -p $@
Archives: ; mkdir -p $@
DEPFILES:= $(wildcard Depends/*.dep Depends/Generated/*.dep)
include $(DEPFILES)
TSCFLAGS:=--noImplicitAny --strict --noUnusedLocals --noImplicitReturns --noFallthroughCasesInSwitch --removeComments --target es2020 --noEmitOnError --strictFunctionTypes
TSFILES:= internal_listeners.ts toplevel.ts chat.ts canvas.ts notes.ts utils.ts Generated/messages.ts \
	  interp.ts storage.ts Generated/nodes.ts dialogs.ts \
	  Generated/dialogdefs.ts subwindows.ts Generated/subwindowdefs.ts macros.ts \
	  Generated/packed.ts
ifneq ($(LOCALTSC),)
Generated/combined.js: $(TSFILES) | Generated
	$(LOCALTSC) $^ $(TSCFLAGS) --outFile $@
else
Generated/combined.js: $(TSFILES) | Generated
	docker run --rm -it -v "$$PWD:/WebDnD" tsc bash -c "cd /WebDnD && tsc $(TSFILES) $(TSCFLAGS) --outFile $@ | cat"
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


.PHONY: run
run: Generated/dungeon.html token-list WebDnD/messages.py | appconfig.py
	. venv/bin/activate && python3 -m WebDnD.app

Generated/dungeon.html: client.dnd Generated/combined.js | Depends Depends/Generated
	dndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces

Generated/%.html: Docs/%.dnd | Generated
	dndc $< --output $@

Generated/%.dnd: %.dnd
	cp $< $@
Generated/%.css: %.css
	cp $< $@
Generated/%.js: %.js
	cp $< $@

Generated/messages.ts WebDnD/messages.py flask_socketio.pyi: types.shared Scripts/make_enums.py | Generated
	python3 Scripts/make_enums.py

.PHONY: dist.zip
dist.zip: Generated/dungeon.html Generated/packed.webp Generated/packed.png Generated/packed.json
	rm -rf dist dist.zip
	mkdir -p dist
	mkdir -p dist/packed
	cp pydndc.cpython-38-x86_64-linux-gnu.so dist
	cp server.mak dist
	cp Generated/dungeon.html dist
	cp register.dnd dist
	cp home.dnd dist
	cp login.dnd dist
	cp login.css dist
	cp darkmode.js dist
	cp Generated/packed.json Generated/packed.png Generated/packed.webp dist/packed
	cat .git/refs/heads/master > dist/githash
	mkdir -p dist/WebDnD
	cp WebDnD/*.py dist/WebDnD
	cp requirements.txt dist
	cp setup.py dist
	zip -r dist dist
	rm -rf dist

.PHONY: token-list
token-list:
	ls tokens > Generated/token-list.txt
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

Bin/meta: C/meta.c | Bin
	$(CC) $< -o $@ -IC -Wall -Wextra
# there should be a rule that this generates dialogdefs.ts
Generated/subwindowdefs.ts Generated/dialogdefs.ts Generated/dungeon.temp.html: dungeon.dnd | Generated
	dndc $< --output Generated/dungeon.temp.html --strip-spaces --allow-js-write

Generated/nodes.ts: Bin/meta Generated/dungeon.temp.html | Generated
	Bin/meta Generated/dungeon.temp.html $@
.PHONY: clean
clean:
	$(RM) $(wildcard Generated/*) Generated/dungeon.html

.PHONY: pack
pack: Generated/packed.json Generated/packed.webp Generated/packed.ts
Generated/packed.ts Generated/packed.json Generated/packed.webp Generated/packed.png: Scripts/pack.py Bin/pack | Generated
	python3 Scripts/pack.py
Bin/pack: C/pack.c C/stb_rect_pack.h | Bin
	$(CC) -O3 C/pack.c -o $@ -IC -Wall -Wextra

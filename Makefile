Depends: ; mkdir -p $@
Generated: ; mkdir -p $@
Bin: ; mkdir -p $@
DEPFILES:= $(wildcard Depends/*.dep)
include $(DEPFILES)
TSCFLAGS:=--noImplicitAny --strict --noUnusedLocals --noImplicitReturns --noFallthroughCasesInSwitch --removeComments --target es2020 --noEmitOnError
TSFILES:= toplevel.ts chat.ts canvas.ts notes.ts utils.ts Generated/messages.ts \
	  interp.ts storage.ts Generated/nodes.ts dialogs.ts \
	  Generated/dialogdefs.ts subwindows.ts Generated/subwindowdefs.ts macros.ts
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
.DEFAULT_GOAL:=screen.html

appconfig.py:
	echo "# this config is for development." > appconfig.py
	@echo "# Use different settings on the server" >> appconfig.py
	@echo "# This should be False on the server" >> appconfig.py
	@echo "DEV = True " >> appconfig.py
	@echo "# Where the database is" >> appconfig.py
	@echo "DBNAME = 'campaigns.db'" >> appconfig.py


.PHONY: run
run: screen.html token-list WebDnD/messages.py | appconfig.py
	. venv/bin/activate && python3 -m WebDnD.app

screen.html: client.dnd Generated/combined.js | Depends
	dndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces

Generated/%.html: Docs/%.dnd | Generated
	dndc $< --output $@

Generated/messages.ts WebDnD/messages.py: types.shared Scripts/make_enums.py | Generated
	python3 Scripts/make_enums.py

.PHONY: dist.zip
dist.zip: screen.html
	rm -rf dist dist.zip
	mkdir -p dist
	cp screen.html dist
	mkdir -p dist/WebDnD
	cp WebDnD/*.py dist/WebDnD
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
	-mv campaigns.db campaigns.db.bak
	scp "david@droplet:/home/david/campaigns.db" .
tags: *.ts Scripts/tag_ts.py
	python3 -m Scripts.tag_ts

DOCS=Generated/macro-doc.html Generated/tables.html

.PHONY: ship-docs
ship-docs: $(DOCS)
	scp $(DOCS) david@droplet:/home/david/docs/docs

.PHONY: mypy
mypy:
	mypy -p WebDnD.app --namespace-packages --ignore-missing-imports

Bin/meta: meta.c | Bin
	$(CC) $< -o $@
# there should be a rule that this generates dialogdefs.ts
Generated/subwindowdefs.ts Generated/dialogdefs.ts Generated/screen.temp.html: screen.dnd | Generated
	dndc $< --output Generated/screen.temp.html --strip-spaces --allow-js-write

Generated/nodes.ts: Bin/meta Generated/screen.temp.html | Generated
	Bin/meta $@
.PHONY: clean
clean:
	$(RM) $(wildcard Generated/*) screen.html

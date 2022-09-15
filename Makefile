Depends: ; mkdir $@
Depends/Generated: | Depends
	mkdir $@
Generated: ; mkdir $@
Archives: ; mkdir $@
DEPFILES:= $(wildcard Depends/*.dep Depends/Generated/*.dep)
ifneq ($(OS),Windows_NT)
PY?=python3
CP?=cp
ZIP?=zip
ACTIVATE?=. venv/bin/activate
TSC?=tsc
RMRF?=rm -rf
else
PY?=py
CP?=copy
ZIP?=
ACTIVATE?=venv\Scripts\activate
TSC?=tsc
RMRF?=del /q
endif
include $(DEPFILES)
venv:
	$(PY) -m venv venv
	$(ACTIVATE) && $(PY) -m pip install wheel
	$(ACTIVATE) && $(PY) -m pip install -r requirements.txt
	$(ACTIVATE) && $(PY) -m pip install -r dev_requirements.txt
TSCFLAGS:=--noImplicitAny \
	  --strict \
	  --noUnusedLocals \
	  --noImplicitReturns \
	  --noFallthroughCasesInSwitch \
	  --removeComments \
	  --target es2020 \
	  --noEmitOnError \
	  --strictFunctionTypes
TSFILES:= internal_listeners.ts toplevel.ts chat.ts canvas.ts notes.ts utils.ts \
	  Generated/messages.ts interp.ts storage.ts Generated/nodes.ts dialogs.ts \
	  Generated/dialogdefs.ts subwindows.ts Generated/subwindowdefs.ts macros.ts \
	  Generated/packed.ts geometry.ts
Generated/combined.js: $(TSFILES) | Generated
	$(TSC) $^ $(TSCFLAGS) --outFile $@
Generated/demo.js: demo.ts Generated/messages.ts | Generated
	$(TSC) $^ $(TSCFLAGS) --outFile $@

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
run: Generated/dungeon.html Generated/demo.html WebDnD/messages.py | appconfig.py venv
	$(ACTIVATE) && $(PY) -m WebDnD.app

Generated/dungeon.html: client.dnd Generated/combined.js | Depends Depends/Generated venv
	$(ACTIVATE) && $(PY) -m pydndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces
Generated/demo.html: demo.dnd Generated/demo.js Generated/combined.js | Depends Depends/Generated venv
	$(ACTIVATE) && $(PY) -m pydndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces

Generated/%.html: Docs/%.dnd | Generated Depends/Generated venv
	$(ACTIVATE) && $(PY) -m pydndc $< --output $@ --depends-path Depends/$@.dep
# This is so that the dev server can serve things from the Generated folder.
Generated/%.dnd: %.dnd
	$(CP) $< $@
Generated/%.css: %.css
	$(CP) $< $@
Generated/%.js: %.js
	$(CP) $< $@

Generated/messages.ts WebDnD/messages.py flask_socketio.pyi: types.shared Scripts/make_enums.py | Generated
	$(PY) Scripts/make_enums.py

PACKEDFILES=\
	  Generated/packed.json \
	  Generated/packed.png \
	  Generated/packed.webp \
	  Generated/toks.webp \
	  Generated/toks.png \

DISTFILES=\
	  Generated/dungeon.html \
	  Generated/demo.html \
	  register.dnd \
	  home.dnd \
	  login.dnd \
	  login.css \
	  darkmode.js \

WEBDNDFILES=\
	    WebDnD/app.py \
	    WebDnD/canvas.py \
	    WebDnD/chat.py \
	    WebDnD/db.py \
	    WebDnD/forms.py \
	    WebDnD/logs.py \
	    WebDnD/messages.py \
	    WebDnD/notes.py \
	    WebDnD/persist.py \
	    WebDnD/settings.py \
	    WebDnD/users.py \
	    WebDnD/validator.py \

ZIPFILES=$(PACKEDFILES) $(DISTFILES) $(WEBDNDFILESS) \
	 requirements.txt setup.py server.mak

dist.zip: $(ZIPFILES)
	$(RMRF) dist dist.zip
	mkdir dist dist/packed dist/WebDnD
	$(CP) server.mak dist
	$(CP) $(DISTFILES) dist
	$(CP) $(PACKEDFILES) dist/packed
	$(CP) $(WEBDNDFILES) dist/WebDnD
	$(CP) requirements.txt dist
	$(CP) setup.py dist
	$(CP) .git/refs/heads/master dist/githash
	$(PY) -m zipfile -c dist.zip dist
	$(RMRF) dist

# I don't think I use this anymore?
.PHONY: shrink-tokens
shrink-tokens:
	$(PY) shrink_tokens.py

tags: *.ts Scripts/tag_ts.py types.shared
	$(PY) -m Scripts.tag_ts

DOCS=Generated/macro-doc.html Generated/tables.html

.PHONY: mypy
mypy: flask_socketio.pyi
	$(PY) -m mypy -p WebDnD.app --namespace-packages --ignore-missing-imports --disallow-untyped-defs

Generated/subwindowdefs.ts Generated/dialogdefs.ts Generated/dungeon.temp.html: dungeon.dnd | Generated venv
	$(ACTIVATE) && $(PY) -m pydndc $< --output Generated/dungeon.temp.html --strip-spaces --allow-js-write --jsargs '{"temp":true}'

Generated/nodes.ts: Generated/dungeon.temp.html | Generated Depends
	$(PY) Scripts/meta.py $< $@

.PHONY: clean
clean:
	$(RMRF) Generated Depends dist.zip

.PHONY: pack
pack: Generated/packed.json Generated/packed.webp Generated/packed.png Generated/toks.png Generated/toks.webp
Generated/packed.json Generated/packed.webp Generated/packed.png Generated/toks.webp Generated/toks.png Generated/packed.ts: Scripts/pack.py | Generated venv Depends
	$(ACTIVATE) && $(PY) Scripts/pack.py
ifneq ($(OS),Windows_NT) # shells out to unix commands
.PHONY: list
list:
	@LC_ALL=C $(MAKE) -npRrq : 2>/dev/null \
		| awk -v RS= -F: '{if ($$1 !~ "^[#.]") {print $$1}}' \
		| sort \
		| uniq \
		| egrep -v \
			-e '^[^[:alnum:]]' \
			-e '^$@$$' \
			-e '%' \
			-e '.(dnd|dep|[ch]|css|ts|png|webp|json|temp.html)$$' \
			-e '^(Generated|Depends|Objs|VendObjs|Archives|Docs|WebDnD)' \
			-e '^(tokens|tilesorig|miscimgs|iconorig)' \
			-e '^(conn.js|appconfig.py)'

endif
include $(wildcard private.mak)

.PHONY: all
all: dist.zip

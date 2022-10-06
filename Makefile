# directories
Depends: ; mkdir $@
Depends/Generated: | Depends
	mkdir $@
Generated: ; mkdir $@
Archives: ; mkdir $@

# Include make-style dependency files
DEPFILES:= $(wildcard Depends/*.dep Depends/Generated/*.dep)
include $(DEPFILES)

# paper over OS difference in shell commands
ifneq ($(OS),Windows_NT)
# linux/macos
PY?=python3
CP=cp
# using `.` is the portable way to source a shell file
DEV_ACTIVATE=. dev_venv/bin/activate
SERV_ACTIVATE=. serv_venv/bin/activate
TSC?=tsc
RMRF=rm -rf

else
# Windows
PY?=py
CP=copy
DEV_ACTIVATE=dev_venv\Scripts\activate
SERV_ACTIVATE=serv_venv\Scripts\activate
TSC?=tsc
RMRF=del /q

endif

SERVPY=$(SERV_ACTIVATE) && $(PY)
DEVPY=$(DEV_ACTIVATE) && $(PY)

# To try to prevent accidental dependency on dev tools in the server,
# we use two separate venvs.

serv_venv:
	$(PY) -m venv $@
	$(SERVPY) -m pip install -U pip
	$(SERVPY) -m pip install wheel
	$(SERVPY) -m pip install -r requirements.txt

dev_venv:
	$(PY) -m venv $@
	$(DEVPY) -m pip install -U pip
	$(DEVPY) -m pip install wheel
	$(DEVPY) -m pip install -r dev_requirements.txt

TSCFLAGS:=--noImplicitAny \
	  --strict \
	  --noUnusedLocals \
	  --noImplicitReturns \
	  --noFallthroughCasesInSwitch \
	  --removeComments \
	  --target es2020 \
	  --noEmitOnError \
	  --strictFunctionTypes
TSFILES:= socket.d.ts settings.ts internal_listeners.ts\
	  toplevel.ts darkmode.ts \
	  touch.ts chat.ts \
	  canvas.ts notes.ts utils.ts \
	  Generated/messages.ts interp.ts storage.ts Generated/nodes.ts dialogs.ts \
	  Generated/dialogdefs.ts subwindows.ts Generated/subwindowdefs.ts macros.ts \
	  Generated/packed.ts geometry.ts options.ts \
	  rolltables.ts dms.ts chat-ui.ts macros-ui.ts \
	  rolltables-ui.ts chat-input.ts \
	  list-view.ts tab-view.ts \
	  table-view.ts
Generated/combined.js: $(TSFILES) | Generated
	$(TSC) $^ $(TSCFLAGS) --outFile $@
Generated/demo.js: demo.ts Generated/messages.ts | Generated
	$(TSC) $^ $(TSCFLAGS) --outFile $@

.DEFAULT_GOAL:=Generated/dungeon.html

appconfig.py:
	$(CP) defaultconfig.py $@

.PHONY: run
run: Generated/dungeon.html Generated/demo.html WebDnD/messages.py | appconfig.py serv_venv
	$(SERVPY) -m WebDnD.app

Generated/dungeon.html: client.dnd Generated/combined.js dungeon.css | Depends/Generated dev_venv
	$(DEVPY) -m pydndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces
Generated/demo.html: demo.dnd Generated/demo.js Generated/combined.js dungeon.css | Depends/Generated dev_venv
	$(DEVPY) -m pydndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces

Generated/%.html: Docs/%.dnd | Generated Depends/Generated dev_venv
	$(DEVPY) -m pydndc $< --output $@ --depends-path Depends/$@.dep
# This is so that the dev server can serve things from the Generated folder.
Generated/%.dnd: %.dnd
	$(CP) $< $@
Generated/%.css: %.css
	$(CP) $< $@
Generated/%.js: %.js
	$(CP) $< $@

Generated/messages.ts WebDnD/messages.py flask_socketio.pyi: types.shared Scripts/make_enums.py | Generated dev_venv
	$(DEVPY) Scripts/make_enums.py

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

tags: *.ts Scripts/tag_ts.py types.shared | dev_venv
	$(DEVPY) -m Scripts.tag_ts

.PHONY: mypy
mypy: flask_socketio.pyi | dev_venv
	$(DEVPY) -m mypy -p WebDnD.app --namespace-packages --ignore-missing-imports --disallow-untyped-defs

Generated/subwindowdefs.ts Generated/dialogdefs.ts \
Generated/dungeon.temp.html: dungeon.dnd | Generated dev_venv
	$(DEVPY) -m pydndc $< --output Generated/dungeon.temp.html --strip-spaces --allow-js-write --jsargs '{"temp":true}'

Generated/nodes.ts: Generated/dungeon.temp.html | Generated Depends dev_venv
	$(DEVPY) Scripts/meta.py $< $@

.PHONY: clean
clean:
	$(RMRF) Generated Depends dist.zip

.PHONY: pack
pack: Generated/packed.json Generated/packed.webp \
	Generated/packed.png Generated/toks.png \
	Generated/toks.webp

Generated/packed.json Generated/packed.webp \
Generated/packed.png Generated/toks.webp \
Generated/toks.png Generated/packed.ts: Scripts/pack.py | Generated dev_venv Depends
	$(DEVPY) Scripts/pack.py

DOCS=Generated/macro-doc.html \
     Generated/tables.html \
     Generated/index.html
.PHONY: docs
docs: $(DOCS)

# bug tracking
.PHONY: bug
bug: | dev_venv
	$(DEVPY) Scripts/bug.py

.PHONY: all
all: dist.zip

include decls.mak

# For private operations like server admin
include $(wildcard private.mak)

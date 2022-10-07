# directories
Depends: ; mkdir $@
Depends/Generated: | Depends
	mkdir $@
Depends/WebClient: | Depends
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
# NOTE(dpriver): the order does matter (but this is not the only valid order).
TSFILES:= WebClient/socket.d.ts \
	  WebClient/settings.ts \
	  WebClient/options.ts \
	  WebClient/storage.ts \
	  WebClient/internal_listeners.ts\
	  WebClient/toplevel.ts \
	  WebClient/darkmode.ts \
	  WebClient/touch.ts \
	  Generated/messages.ts \
	  WebClient/chat.ts \
	  WebClient/canvas.ts \
	  WebClient/notes.ts \
	  WebClient/utils.ts \
	  WebClient/interp.ts \
	  Generated/nodes.ts \
	  WebClient/dialogs.ts \
	  Generated/dialogdefs.ts \
	  WebClient/subwindows.ts \
	  Generated/subwindowdefs.ts \
	  WebClient/macros.ts \
	  Generated/packed.ts \
	  WebClient/geometry.ts \
	  WebClient/rolltables.ts \
	  WebClient/dms.ts \
	  WebClient/chat-ui.ts \
	  WebClient/macros-ui.ts \
	  WebClient/rolltables-ui.ts \
	  WebClient/chat-input.ts \
	  WebClient/list-view.ts \
	  WebClient/tab-view.ts \
	  WebClient/table-view.ts
Generated/combined.js: $(TSFILES) | Generated
	$(TSC) $^ $(TSCFLAGS) --outFile $@
Generated/demo.js: WebClient/demo.ts Generated/messages.ts | Generated
	$(TSC) $^ $(TSCFLAGS) --outFile $@

.DEFAULT_GOAL:=Generated/dungeon.html

appconfig.py:
	$(CP) defaultconfig.py $@

.PHONY: run
run: Generated/dungeon.html Generated/demo.html Server/WebDnD/messages.py | appconfig.py serv_venv
	$(SERVPY) -m Server.WebDnD.app

Generated/dungeon.html: WebClient/client.dnd Generated/combined.js WebClient/dungeon.css | Depends/Generated dev_venv
	$(DEVPY) -m pydndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces
Generated/demo.html: WebClient/demo.dnd Generated/demo.js Generated/combined.js WebClient/dungeon.css | Depends/Generated dev_venv
	$(DEVPY) -m pydndc $< --output $@ --depends-path Depends/$@.dep --strip-spaces

Generated/%.html: Docs/%.dnd | Generated Depends/Generated dev_venv
	$(DEVPY) -m pydndc $< --output $@ --depends-path Depends/$@.dep
# This is so that the dev server can serve things from the Generated folder.
Generated/%.dnd: WebSite/%.dnd
	$(CP) $< $@
Generated/%.css: WebSite/%.css
	$(CP) $< $@
Generated/%.js: WebSite/%.js
	$(CP) $< $@

Generated/messages.ts Server/WebDnD/messages.py flask_socketio.pyi: types.shared Scripts/make_enums.py | Generated dev_venv
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
	  WebSite/register.dnd \
	  WebSite/home.dnd \
	  WebSite/login.dnd \
	  WebSite/login.css \
	  WebSite/darkmode.js \

WEBDNDFILES=\
	    Server/WebDnD/app.py \
	    Server/WebDnD/canvas.py \
	    Server/WebDnD/chat.py \
	    Server/WebDnD/db.py \
	    Server/WebDnD/forms.py \
	    Server/WebDnD/logs.py \
	    Server/WebDnD/messages.py \
	    Server/WebDnD/notes.py \
	    Server/WebDnD/persist.py \
	    Server/WebDnD/settings.py \
	    Server/WebDnD/users.py \
	    Server/WebDnD/validator.py \

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

tags: WebClient/*.ts Scripts/tag_ts.py types.shared | dev_venv
	$(DEVPY) -m Scripts.tag_ts

.PHONY: mypy
mypy: flask_socketio.pyi Server/WebDnD/messages.py | dev_venv
	$(DEVPY) -m mypy -p Server.WebDnD.app --namespace-packages --ignore-missing-imports --disallow-untyped-defs

Generated/subwindowdefs.ts Generated/dialogdefs.ts \
Generated/dungeon.temp.html: WebClient/dungeon.dnd | Generated dev_venv
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
# Hack so that make doesn't try to build each of these,
# instead builds them at once
Generated/packed.json: pack_
Generated/packed.webp: pack_
Generated/packed.png: pack_
Generated/toks.webp: pack_
Generated/toks.png: pack_
Generated/packed.ts: pack_
.INTERMEDIATE: pack_
pack_: Scripts/pack.py | Generated dev_venv Depends
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

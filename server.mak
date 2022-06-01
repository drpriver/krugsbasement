# This is for commands that run on the host.
.PHONY: backup
backup:
	-mv data/campaigns.db.bak data/campaigns.db.bak.bak
	sqlite3 data/campaigns.db '.backup data/campaigns.db.bak'

restore:
	rm -f data/campaigns.db
	cp data/campaigns.db.bak data/campaigns.db

.PHONY: unpack
unpack: static/dungeon.html WebDnD imgs/tiles/packed demos

.PHONY: imgs/tiles/packed
imgs/tiles/packed:
	cp dist/packed/* imgs/tiles/

.PHONY: static/dungeon.html
static/dungeon.html:
	cp dist/dungeon.html static/dungeon.html
	cp dist/*.dnd static
	cp dist/*.css static
	cp dist/*.js static
	cp dist/pydndc.cpython-38-x86_64-linux-gnu.so .

.PHONY: demos
demos:
	cp dist/demo.html demos/demos/dungeon.html

.PHONY: WebDnD
WebDnD:
	rm -rf WebDnD
	cp -r dist/WebDnD WebDnD

.PHONY: run-app
run-app:
	python3 -m WebDnD.app

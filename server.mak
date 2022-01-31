# This is for commands that run on the host.
.PHONY: backup
backup:
	-mv data/campaigns.db.bak data/campaigns.db.bak.bak
	sqlite3 data/campaigns.db '.backup data/campaigns.db.bak'

restore:
	rm -f data/campaigns.db
	cp data/campaigns.db.bak data/campaigns.db

.PHONY: unpack
unpack: static/token-list static/dungeon.html WebDnD

.PHONY: static/token-list
static/token-list:
	ls imgs/tokens > static/token-list.txt

.PHONY: static/dungeon.html
static/dungeon.html:
	cp dist/dungeon.html static/dungeon.html
	cp dist/*.dnd static
	cp dist/*.css static
	cp dist/*.js static

.PHONY: WebDnD
WebDnD:
	rm -rf WebDnD
	cp -r dist/WebDnD WebDnD

.PHONY: run-app
run-app:
	python3 -m WebDnD.app

# This doesn't currently do much of interest, but it does show the current
# dependencies between the files.
Decls: ; mkdir $@

DECL=$(TSC) $(TSCFLAGS) --declaration --emitDeclarationOnly $^ --outFile $@


Decls/messages.d.ts: Generated/messages.ts socket.d.ts
	$(DECL)

Decls/settings.d.ts: settings.ts Decls/messages.d.ts
	$(DECL)

Decls/storage.d.ts: storage.ts Decls/settings.d.ts Decls/messages.d.ts
	$(DECL)

Decls/utils.d.ts: utils.ts Decls/storage.d.ts
	$(DECL)

Decls/dialogs.d.ts: Generated/dialogdefs.ts dialogs.ts Decls/utils.d.ts
	$(DECL)

Decls/nodes.d.ts: Generated/nodes.ts
	$(DECL)

Decls/packed.d.ts: Generated/packed.ts
	$(DECL)

Decls/subwindows.d.ts: subwindows.ts Generated/subwindowdefs.ts \
  Decls/utils.d.ts
	$(DECL)

Decls/internal_listeners.d.ts: internal_listeners.ts
	$(DECL)

Decls/geometry.d.ts: geometry.ts
	$(DECL)

Decls/touch.d.ts: touch.ts Decls/nodes.d.ts
	$(DECL)

Decls/toplevel.d.ts: toplevel.ts socket.d.ts \
  Decls/messages.d.ts Decls/nodes.d.ts
	$(DECL)

Decls/darkmode.d.ts: darkmode.ts Decls/messages.d.ts \
  Decls/settings.d.ts Decls/internal_listeners.d.ts
	$(DECL)

Decls/options.d.ts: options.ts Decls/storage.d.ts \
  Decls/internal_listeners.d.ts Decls/darkmode.d.ts \
  Decls/settings.d.ts Decls/touch.d.ts \
  Decls/nodes.d.ts Decls/messages.d.ts \
  Decls/dialogs.d.ts
	$(DECL)

Decls/canvas.d.ts: canvas.ts Decls/nodes.d.ts \
  Decls/messages.d.ts Decls/dialogs.d.ts \
  Decls/settings.d.ts Decls/internal_listeners.d.ts \
  Decls/geometry.d.ts Decls/touch.d.ts \
  Decls/storage.d.ts Decls/utils.d.ts \
  Decls/packed.d.ts Decls/toplevel.d.ts \
  Decls/options.d.ts Decls/darkmode.d.ts
	$(DECL)

Decls/chat-input.d.ts: chat-input.ts
	$(DECL)

Decls/interp.d.ts: interp.ts Decls/messages.d.ts
	$(DECL)

Decls/macros.d.ts: macros.ts Decls/messages.d.ts \
  Decls/internal_listeners.d.ts Decls/storage.d.ts \
  Decls/settings.d.ts
	$(DECL)

Decls/chat.d.ts: chat.ts Decls/messages.d.ts Decls/macros.d.ts \
  Decls/utils.d.ts Decls/interp.d.ts
	$(DECL)

Decls/chat-ui.d.ts: chat-ui.ts Decls/messages.d.ts \
  Decls/nodes.d.ts Decls/storage.d.ts \
  Decls/chat.d.ts Decls/utils.d.ts \
  Decls/settings.d.ts Decls/chat-input.d.ts
	$(DECL)

Decls/dms.d.ts: dms.ts Decls/messages.d.ts \
  Decls/settings.d.ts Decls/nodes.d.ts \
  Decls/touch.d.ts Decls/utils.d.ts \
  Decls/chat.d.ts Decls/list-view.d.ts \
  Decls/subwindows.d.ts Decls/chat-input.d.ts \
  Decls/internal_listeners.d.ts Decls/rolltables.d.ts \
  Decls/tab-view.d.ts
	$(DECL)

Decls/list-view.d.ts: list-view.ts Decls/utils.d.ts \
  Decls/touch.d.ts Decls/dialogs.d.ts
	$(DECL)

Decls/tab-view.d.ts: tab-view.ts
	$(DECL)

Decls/rolltables.d.ts: rolltables.ts Decls/messages.d.ts \
  Decls/internal_listeners.d.ts
	$(DECL)

Decls/macros-ui.d.ts: macros-ui.ts Decls/messages.d.ts \
  Decls/touch.d.ts Decls/dialogs.d.ts \
  Decls/macros.d.ts Decls/internal_listeners.d.ts \
  Decls/settings.d.ts Decls/chat-ui.d.ts \
  Decls/nodes.d.ts Decls/utils.d.ts \
  Decls/subwindows.d.ts Decls/list-view.d.ts \
  Decls/chat.d.ts Decls/tab-view.d.ts
	$(DECL)

Decls/notes.d.ts: notes.ts Decls/messages.d.ts \
  Decls/subwindows.d.ts Decls/nodes.d.ts \
  Decls/list-view.d.ts Decls/dialogs.d.ts \
  Decls/darkmode.d.ts
	$(DECL)

Decls/rolltables-ui.d.ts: rolltables-ui.ts Decls/rolltables.d.ts \
	Decls/messages.d.ts Decls/internal_listeners.d.ts \
	Decls/touch.d.ts Decls/utils.d.ts \
	Decls/dialogs.d.ts Decls/nodes.d.ts \
	Decls/list-view.d.ts Decls/subwindows.d.ts \
	Decls/table-view.d.ts
	$(DECL)

Decls/table-view.d.ts: table-view.ts
	$(DECL)

Decls/messages.d.ts: | Decls
Decls/nodes.d.ts: | Decls
Decls/packed.d.ts: | Decls
Decls/canvas.d.ts: | Decls
Decls/chat-input.d.ts: | Decls
Decls/chat-ui.d.ts: | Decls
Decls/chat.d.ts: | Decls
Decls/darkmode.d.ts: | Decls
Decls/dialogs.d.ts: | Decls
Decls/dms.d.ts: | Decls
Decls/geometry.d.ts: | Decls
Decls/internal_listeners.d.ts: | Decls
Decls/interp.d.ts: | Decls
Decls/list-view.d.ts: | Decls
Decls/macros-ui.d.ts: | Decls
Decls/macros.d.ts: | Decls
Decls/notes.d.ts: | Decls
Decls/options.d.ts: | Decls
Decls/rolltables-ui.d.ts: | Decls
Decls/rolltables.d.ts: | Decls
Decls/settings.d.ts: | Decls
Decls/storage.d.ts: | Decls
Decls/subwindows.d.ts: | Decls
Decls/tab-view.d.ts: | Decls
Decls/table-view.d.ts: | Decls
Decls/toplevel.d.ts: | Decls
Decls/touch.d.ts: | Decls
Decls/utils.d.ts: | Decls


decls: Decls/messages.d.ts
decls: Decls/nodes.d.ts 
decls: Decls/packed.d.ts
decls: Decls/canvas.d.ts
decls: Decls/chat-input.d.ts
decls: Decls/chat-ui.d.ts
decls: Decls/chat.d.ts
decls: Decls/darkmode.d.ts
decls: Decls/dialogs.d.ts
decls: Decls/dms.d.ts
decls: Decls/geometry.d.ts
decls: Decls/internal_listeners.d.ts
decls: Decls/interp.d.ts
decls: Decls/list-view.d.ts
decls: Decls/macros-ui.d.ts
decls: Decls/macros.d.ts
decls: Decls/notes.d.ts
decls: Decls/options.d.ts
decls: Decls/rolltables-ui.d.ts
decls: Decls/rolltables.d.ts
decls: Decls/settings.d.ts
decls: Decls/storage.d.ts
decls: Decls/subwindows.d.ts
decls: Decls/tab-view.d.ts
decls: Decls/table-view.d.ts
decls: Decls/toplevel.d.ts
decls: Decls/touch.d.ts
decls: Decls/utils.d.ts

.PHONY: decls

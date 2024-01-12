//
// Copyright © 2021-2024, David Priver
//

const ROLLTABLES: {shared:Array<RollTable>, private:Array<RollTable>} = {
    shared: [],
    private: []
};

// TAG handleROLL_TABLES
ONRECV(ToClient.ROLL_TABLES, function(tables:RollTables):void{
    ROLLTABLES.shared = tables[0];
    ROLLTABLES.private = tables[1];
    signal_for(ListenEvent.ROLLTABLES_RECEIVED);
    signal_for(ListenEvent.ROLLTABLES_RENAMED);
});

// TAG handleROLL_TABLE_NAMES
ONRECV(ToClient.ROLL_TABLE_NAMES, function(data:RollTableNames):void{
    // hack;
    let old_shared = ROLLTABLES.shared;
    let old_priv = ROLLTABLES.private;
    ROLLTABLES.shared = [];
    ROLLTABLES.private = [];
    for(let s of data.shared)
        ROLLTABLES.shared.push({name:s, id:0, entries:[]});
    for(let s of data.private)
        ROLLTABLES.private.push({name:s, id:0, entries:[]});
    signal_for(ListenEvent.ROLLTABLES_RENAMED);
    ROLLTABLES.shared = old_shared;
    ROLLTABLES.private = old_priv;
});

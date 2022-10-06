//
// Copyright © 2021-2022, David Priver
//
(function(){
// TAG chat
document.addEventListener('DOMContentLoaded', function(){
    let USERS: Map<number, string> = new Map();
    let privateroll = get_window('privateroll');
    let targets = by_id('privateroll-targets');
    let lv = make_list_view<number>(targets, ListViewFlags.NONE);
    let shtbs = by_id('privateroll-tables-shared');
    let prtbs = by_id('privateroll-tables-private');
    by_id('privateroll-button').addEventListener('click', function(){
        privateroll.show();
    });
    privateroll.outer.style.width = '30em';
    privateroll.outer.style.height = '400px';
    let log = by_id('privateroll-history');
    let chats: Map<number, Array<ChatMsg>> = new Map();
    let histories: Map<number, Array<string>> = new Map();
    // NOTE: for now this is the only producer/consumer of notifications, so
    // all the logic is localized here. If I come up with another reasonable
    // use case for notifications, I should move it out and come up with an
    // interface for it that allows removing several notifications at once (not
    // just your notification).
    let notifications: Array<HTMLElement> = [];

    function preproc_func(text:string, _:number, __:number){
        let commands: Array<Command> = [];
        let error = evaluate(text, -1, -1, commands);
        if(error){
            const log = by_id('privateroll-history');
            const errmess: ChatErrorMsg = [Msg.ERROR, '', error];
            add_chat_msgs(log, [errmess], undefined);
            log.scrollTo({behavior:'smooth', top:log.scrollHeight});
            return;
        }
        if(commands.length){
            let to_send: ChatDirectCommandMessage = {chatname:SETTINGS.chat.name, to:lv.active?lv.active:SETTINGS.userid, commands:commands};
            EMIT(FromClient.CHAT_DM, to_send);
        }
    }
    lv.activate_handler = function(k:number|undefined){
        if(k === undefined) return;
        log.innerHTML = '';
        let msgs = chats.get(k);
        if(k !== SETTINGS.userid){
            let name = USERS.get(k);
            if(!name) name = "anon";
            lv.rename(name, k);
        }
        if(msgs){
            add_chat_msgs(log, msgs, preproc_func);
            log.scrollTo({top:log.scrollHeight});
        }
        let h = histories.get(k);
        hist.set_history(h?h:[]);
        if(!IS_TOUCH)chat.focus();
    };
    ONRECV(ToClient.CHAT_DIRECT_MSG, function(msg:ChatDirectResponse){
        let from = msg.users[0];
        let to   = msg.users[1];
        let user = (from == SETTINGS.userid)? to : from;
        if(msg.msgs){
            let prev = chats.get(user);
            if(prev !== undefined){
                for(let m of msg.msgs)
                    prev.push(m);
            }
        }
        if(lv.active !== user || privateroll.hidden){
            if(user !== SETTINGS.userid){
                let name = USERS.get(user);
                if(!name) name = "anon";
                lv.rename(`(*)\u00A0${name}`, user);
            }
            if(privateroll.hidden){
                let noti = by_id('notifications');
                let name = USERS.get(user);
                if(!name) name = "anon";
                let text = `${name} has messaged you.`;
                let should_add = true;
                for(let e of notifications){
                    if(e.firstChild!.textContent == text){
                        should_add = false;
                        break;
                    }
                }
                if(should_add){
                    let d = elem_with_parent(noti, 'div');
                    let i_el = elem_parent_text(d, 'i', text);
                    i_el.onclick = function(){
                        lv.make_active(user);
                        privateroll.show();
                    }
                    i_el.style.cursor = 'pointer';
                    notifications.push(d);
                }
            }
            return;
        }
        add_chat_msgs(log, msg.msgs, preproc_func);
        log.scrollTo({behavior:'smooth', top:log.scrollHeight});
    });
    let chat = by_id('privateroll-input');
    let hist = setup_chat(chat, preproc_func);
    privateroll.show_handler = function(){
        EMIT(FromClient.GET_ROLL_TABLE_NAMES);
        for(let e of notifications)
            e.remove()
        notifications = [];
        lv.make_active(lv.active);
        if(!IS_TOUCH)chat.focus();
    };
    make_tab_view(
        [
            by_id('privateroll-tables-tab'),
            by_id('privateroll-mytables-tab'),
        ],
        [
            shtbs,
            prtbs,
        ]
    );
    listen_for(ListenEvent.ROLLTABLES_RENAMED, function(){
        shtbs.innerHTML = '';
        prtbs.innerHTML = '';
        for(let tb of ROLLTABLES.shared){
            let name = tb.name;
            let b = elem_parent_text(shtbs, 'button', name);
            b.addEventListener('click', function(){
                preproc_func(`table ${name}`, -1, -1);
            });
        }
        for(let tb of ROLLTABLES.private){
            let name = tb.name;
            let b = elem_parent_text(prtbs, 'button', name);
            b.addEventListener('click', function(){
                preproc_func(`mytable ${name}`, -1, -1);
            });
        }
    });
    ONRECV(ToClient.USER_LIST, function(users:Array<UserListItem>){
        lv.clear();
        log.innerHTML = '';
        for(let [uid, _] of users){
            if(!chats.has(uid))
                chats.set(uid, []);
            histories.set(uid, []);
        }
        for(let [uid, chatname] of users){
            lv.add_item(uid == SETTINGS.userid?`${chatname} (Me)` : chatname, uid);
            USERS.set(uid, chatname);
        }
        lv.make_active(users[0][0]);
    });
    ONRECV(ToClient.USER_RENAME, function(user:UserListItem){
        let [uid, chatname] = user;
        if(!chats.has(uid)){
            chats.set(uid, []);
            histories.set(uid, []);
            lv.add_item(chatname, uid);
        }
        USERS.set(uid, chatname);
        lv.rename(uid == SETTINGS.userid?`${chatname} (Me) `: chatname, uid);
    });
    ONRECV(ToClient.CHAT_PRIVATE_CREATE, function(data:Array<ChatHistory>){
        for(let [uid, msgs] of data){
            chats.set(uid, msgs);
        }
        if(lv.active !== undefined)
            lv.activate_handler!(lv.active);
    });
});
}());

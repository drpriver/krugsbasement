//
// Copyright © 2021-2023, David Priver
//


const {
    preprocess_and_send_chat,
} = (function():{preprocess_and_send_chat:(text:string, character_id:number, macro_id:number)=>void}{
ONRECV(ToClient.CHAT_STRUCTURED_MSG, function(msgs:Array<ChatMsg>):void{
    const log = by_id('chat-history');
    add_chat_msgs(log, msgs, preprocess_and_send_chat);
    log.scrollTo({behavior:'smooth', top:log.scrollHeight});
});

ONRECV(ToClient.CHAT_CREATE, function(msgs:Array<ChatMsg>):void{
    const log = by_id('chat-history');
    add_chat_msgs(log, msgs, preprocess_and_send_chat);
    log.scrollTop = log.scrollHeight;
});

function clear_chat():void{
    const log = by_id('chat-history');
    log.innerHTML = '';
}

ONRECV(ToClient.CHAT_CLEAR, function():void{
    clear_chat();
});
function resize_chat():void{
    const hist = by_id('chat-history');
    hist.scrollTo({top:hist.scrollHeight});
}

const enum RECENT_DIEROLLS {
    MAX = 4,
}

const DIEROLL_HISTORY:Array<string> = [];
document.addEventListener('DOMContentLoaded', function():void{
    let pastrolls = get_local(StorageCategory.MACROS, 'dieroll-history');
    if(!pastrolls) pastrolls = [];
    else pastrolls = JSON.parse(pastrolls);
    const log = by_id('dice-history');
    for(let dieroll of pastrolls){
        add_dice_history_command(log, dieroll);
    }
});


function add_dice_history_command(log:HTMLDivElement, text:string):number {
    for(let prev of DIEROLL_HISTORY){
        if(prev == text) return 0;
    }
    DIEROLL_HISTORY.push(text);
    const entry = elem_with_parent(log, 'div');
    entry.style.width = '100%';
    entry.style.display = 'flex';
    const span = elem_with_text('span', text);
    span.style.cursor = 'pointer';
    span.setAttribute('role', 'button');
    entry.appendChild(span);
    span.addEventListener('click', function(e):void{
        e.stopPropagation();
        e.preventDefault();
        preprocess_and_send_chat(text, -1, -1);
    });
    span.addEventListener('contextmenu', function(e):void{
        if(e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.stopPropagation();
        e.preventDefault();
        by_id('chatinput').value = text;
    });
    const button = elem_with_parent(entry, 'button');
    button.textContent = 'X';
    button.style.marginLeft = 'auto';
    button.addEventListener('click', function():void{
        entry.remove();
        const index = DIEROLL_HISTORY.indexOf(text);
        if(index !== -1){
            DIEROLL_HISTORY.splice(index, 1)
            store_local(StorageCategory.MACROS, 'dieroll-history', JSON.stringify(DIEROLL_HISTORY));
        }
    });
    while(log.children.length > RECENT_DIEROLLS.MAX){
        log.children[0].remove()
        DIEROLL_HISTORY.shift();
    }
    return 1;
}

function add_dice_history_commands(commands: Array<Command>):void{
    const log = by_id('dice-history');
    let added = 0;
    for(let command of commands){
        if(command[0] != ChatCommand.ROLL)
            continue;
        // hack...
        let original = command[1];
        original = original.replace(/^\//, '');
        original = original.replace(/^roll/,'')
        original = original.replace(/^r/,'')
        original = original.replace(/\s/g, '');
        added += add_dice_history_command(log, original);
    }
    if(added){
        log.scrollTo({top:log.scrollHeight});
        store_local(StorageCategory.MACROS, 'dieroll-history', JSON.stringify(DIEROLL_HISTORY));
    }
}

function preprocess_and_send_chat(text:string, character_id:number, macro_id:number):void{
    let commands: Array<Command> = [];
    let error = evaluate(text, character_id, macro_id, commands);
    if(error.length){
        const log = by_id('chat-history');
        const errmess: ChatErrorMsg = [Msg.ERROR, '', error];
        add_chat_msgs(log, [errmess], undefined);
        log.scrollTo({behavior:'smooth', top:log.scrollHeight});
        return;
    }
    if(commands.length){
        let to_send: ChatCommandMessage = {chatname:SETTINGS.chat.name, commands:commands};
        add_dice_history_commands(commands);
        EMIT(FromClient.CHAT_STRUCTURED_INPUT, to_send);
    }
}

document.addEventListener('DOMContentLoaded', function():void{
    resize_chat();
    window.addEventListener('resize', resize_chat);
    const ta = by_id('chatinput');
    setup_chat(ta, preprocess_and_send_chat);
    if(SETTINGS.uimode == UiMode.CHAT){
        const chat = by_id('chat');
        chat.classList.add('fullscreen');
    }
});
return {
    preprocess_and_send_chat,
};
}());


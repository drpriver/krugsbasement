//
// Copyright © 2021-2026, David Priver <david@davidpriver.com>
//


const {
    preprocess_and_send_chat,
    preprocess_and_send_chat3,
} = (function():{
  preprocess_and_send_chat:(text:string, character_id:number, macro_id:number)=>Promise<void>;
  preprocess_and_send_chat3:(text:string, vars:Map<string,string>)=>Promise<void>;
}{
let following_chat = true;
function update_chat_position(follow:boolean):void{
    const log = by_id('chat-history');
    if(!log.clientHeight) return;
    if(follow)
        log.scrollTop = log.scrollHeight;
    following_chat = log.scrollHeight - log.clientHeight - log.scrollTop <= 2;
}

ONRECV(ToClient.CHAT_STRUCTURED_MSG, function(msgs:Array<ChatMsg>):void{
    add_chat_msgs(by_id('chat-history'), msgs, preprocess_and_send_chat);
    update_chat_position(following_chat);
});

ONRECV(ToClient.CHAT_CREATE, function(msgs:Array<ChatMsg>):void{
    following_chat = true;
    add_chat_msgs(by_id('chat-history'), msgs, preprocess_and_send_chat);
    update_chat_position(following_chat);
});

ONRECV(ToClient.CHAT_CLEAR, function():void{
    by_id('chat-history').replaceChildren();
    following_chat = true;
    update_chat_position(following_chat);
});

const enum RECENT_DIEROLLS {
    MAX = 4,
}

const DIEROLL_HISTORY:Array<string> = [];
let help_tv:TabView|null = null;
function show_help(tab:number):void{
    const win = get_window('help');
    win.show();
    if(help_tv)
        help_tv.change_tab(tab);
}
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

async function preprocess_and_send_chat(text:string, character_id:number, macro_id:number):Promise<void>{
    const request = text.trim().toLowerCase();
    if(request == '/help' || request == '/help chat'){
        show_help(0);
        return;
    }
    if(request == '/help sheets' || request == '/help sheet'){
        show_help(2);
        return;
    }
    if(request == '/help macros' || request == '/help macro'){
        show_help(1);
        return;
    }
    if(request == '/help shortcuts'){
        show_help(3);
        return;
    }
    let commands: Array<Command> = [];
    let error = await evaluate(text, character_id, macro_id, commands);
    if(error.length){
        const log = by_id('chat-history');
        const errmess: ChatErrorMsg = [Msg.ERROR, '', error];
        add_chat_msgs(log, [errmess], undefined);
        update_chat_position(following_chat);
        return;
    }
    if(commands.length){
        let to_send: ChatCommandMessage = {chatname:SETTINGS.chat.name, commands:commands};
        add_dice_history_commands(commands);
        EMIT(FromClient.CHAT_STRUCTURED_INPUT, to_send);
    }
}
async function preprocess_and_send_chat3(text:string, vars:Map<string,string>):Promise<void>{
    let commands: Array<Command> = [];
    let error = await evaluate3(text, vars, commands);
    if(error.length){
        const log = by_id('chat-history');
        const errmess: ChatErrorMsg = [Msg.ERROR, '', error];
        add_chat_msgs(log, [errmess], undefined);
        update_chat_position(following_chat);
        return;
    }
    if(commands.length){
        let to_send: ChatCommandMessage = {chatname:SETTINGS.chat.name, commands:commands};
        add_dice_history_commands(commands);
        EMIT(FromClient.CHAT_STRUCTURED_INPUT, to_send);
    }
}

document.addEventListener('DOMContentLoaded', function():void{
    const log = by_id('chat-history');
    log.addEventListener('scroll', ()=>update_chat_position(false));
    new ResizeObserver(()=>update_chat_position(following_chat)).observe(log);
    const ta = by_id('chatinput');
    setup_chat(ta, preprocess_and_send_chat, by_id('phone-chat-send'));
    const shortcuts = by_id('help-shortcuts');
    if(IS_MAC){
        for(const label of shortcuts.querySelectorAll<HTMLElement>('[data-mac-keys]'))
            label.textContent = label.dataset.macKeys!;
        for(const row of shortcuts.querySelectorAll<HTMLElement>('[data-mac-only]'))
            row.hidden = false;
    }
    help_tv = make_tab_view(
        [
            by_id('help-chat-tab'),
            by_id('help-macros-tab'),
            by_id('help-sheets-tab'),
            by_id('help-shortcuts-tab'),
        ],
        [
            by_id('help-chat'),
            by_id('help-macros'),
            by_id('help-sheets'),
            shortcuts,
        ]
    );
    by_id('help-button').onclick = function():void{
        show_help(0);
    };
    reopen_window(()=>get_window('help'), NormalWindow.GLOBAL, 'help/open');
    if(SETTINGS.uimode == UiMode.CHAT){
        const chat = by_id('chat');
        chat.classList.add('fullscreen');
    }
});
return {
    preprocess_and_send_chat,
    preprocess_and_send_chat3,
};
}());

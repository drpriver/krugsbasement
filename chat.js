"use strict";
var MSG;
(function (MSG) {
    MSG[MSG["PLAIN"] = 0] = "PLAIN";
    MSG[MSG["DICEROLL"] = 1] = "DICEROLL";
    MSG[MSG["ERROR"] = 2] = "ERROR";
})(MSG || (MSG = {}));
let chatname = localStorage.getItem('chatname') ?? "anon";
function setchatname(name) {
    if (name)
        name = name.trim();
    if (!name)
        name = 'anon';
    chatname = name;
    localStorage.setItem('chatname', name);
}
function add_chat_msgs(log, msgs) {
    for (let i = 0; i < msgs.length; i++) {
        const msg = msgs[i];
        const entry = document.createElement('div');
        switch (msg.type) {
            case MSG.PLAIN:
                {
                    if (msg.user) {
                        const user = document.createElement('b');
                        user.appendChild(document.createTextNode(msg.user + ': '));
                        entry.appendChild(user);
                    }
                    const text = document.createTextNode(msg.data);
                    entry.appendChild(text);
                }
                break;
            case MSG.DICEROLL:
                {
                    entry.classList.add('dice-roll-msg');
                    const formatted = format_dice_roll(msg.data);
                    entry.innerHTML += formatted;
                }
                break;
            case MSG.ERROR:
                {
                    const error = document.createElement('span');
                    error.classList.add('chat-error');
                    const text = document.createTextNode(msg.data);
                    error.appendChild(text);
                    entry.appendChild(error);
                }
                break;
        }
        log.appendChild(entry);
    }
}
socket.on('chat-msg', function (msgs) {
    const log = document.getElementById('chat-history');
    add_chat_msgs(log, msgs);
    log.scrollTo({ behavior: 'smooth', top: log.scrollHeight });
});
socket.on('chat-create', function (msgs) {
    const log = document.getElementById('chat-history');
    add_chat_msgs(log, msgs);
    log.scrollTop = log.scrollHeight;
});
function clear_chat() {
    const log = document.getElementById('chat-history');
    log.innerHTML = '';
}
socket.on('chat-clear', function () {
    clear_chat();
});
function resize_chat() {
    const hist = document.getElementById('chat-history');
    hist.style.height = window.innerHeight - 12 - 100 + 'px';
    hist.scrollTo({ top: hist.scrollHeight });
}
const MACROS = new Map(Object.entries(JSON.parse(localStorage.getItem('MACROS') ?? "{}")));
document.addEventListener('DOMContentLoaded', function () {
    for (let key of MACROS.keys()) {
        add_macro_button(key);
    }
});
function set_macro(name, body) {
    MACROS.set(name, body);
    localStorage.setItem('MACROS', JSON.stringify(Object.fromEntries(MACROS.entries())));
}
function add_macro_button(name) {
    const macro_button = document.createElement('button');
    macro_button.classList.add('macro-button');
    macro_button.innerText = name;
    macro_button.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        const text = MACROS.get(name) ?? "(invalid macro): " + name;
        socket.emit('chat-input', { chatname: chatname, text: text });
    });
    const macros = document.getElementById('macros');
    const add_macro = document.getElementById('add-macro');
    macros.insertBefore(macro_button, add_macro);
}
function clear_macro_buttons() {
    const macro_buttons = Array.from(document.getElementsByClassName('macro-button'));
    for (let mb of macro_buttons) {
        mb.remove();
    }
}
function add_macro_and_button(name, body) {
    set_macro(name, body);
    add_macro_button(name);
}
function add_macro_dialog() {
    const html = `
    <h2>Enter Macro</h2>
    <table class="input-container">
        <tr>
            <td><label for="hover-macro-name">Name:</label>
            <td><input type="text" id="hover-macro-name" >
        </tr>
        <tr>
            <td><label for="hover-macro-body">Body:</label>
            <td><textarea id="hover-macro-body" cols="30" rows="5"></textarea>
        </tr>
    </table>
    `;
    make_ok_dialog(html, function (unused) {
        const body_el = document.getElementById('hover-macro-body');
        const name_el = document.getElementById('hover-macro-name');
        if (!name_el.value)
            return;
        if (!body_el.value)
            return;
        add_macro_and_button(name_el.value, body_el.value);
    });
}
function export_settings(e) {
    e.stopPropagation();
    e.preventDefault();
    const macros = Object.fromEntries(MACROS.entries());
    const settings = { macros: macros, chatname: chatname };
    const s = JSON.stringify(settings);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([s], { type: 'text/plain' }));
    a.download = "krugsbasementsettings.json";
    a.click();
}
function import_settings(e) {
    e.stopPropagation();
    e.preventDefault();
    const inp = document.createElement('input');
    inp.type = 'file';
    function handlefiles() {
        const files = inp.files;
        if (!files)
            return;
        if (!files.length)
            return;
        const file = files[0];
        const fr = new FileReader();
        fr.addEventListener('load', function () {
            try {
                if (!fr.result)
                    return;
                const new_settings = JSON.parse(fr.result);
                if (new_settings.chatname && typeof new_settings.chatname !== 'string')
                    return;
                if (new_settings.macros) {
                    if (typeof new_settings.macros !== 'object')
                        return;
                    for (let [key, value] of Object.entries(new_settings.macros)) {
                        if (typeof key !== 'string')
                            return;
                        if (typeof value !== 'string')
                            return;
                    }
                }
                if (new_settings.macros) {
                    clear_macro_buttons();
                    MACROS.clear();
                    for (let [key, value] of Object.entries(new_settings.macros)) {
                        add_macro_and_button(key, value);
                    }
                }
                if (new_settings.chatname) {
                    setchatname(new_settings.chatname);
                    const name = document.getElementById('hover-chatname');
                    if (name) {
                        name.value = new_settings.chatname;
                    }
                }
            }
            catch (err) {
                console.log(err);
                return;
            }
        });
        fr.readAsText(file);
    }
    inp.addEventListener('change', handlefiles, false);
    inp.click();
}
function chat_options_dialog() {
    const html = `
    <h2>Options</h2>
    <table class="input-container">
        <tr>
            <td><label for="hover-chatname">Chat Name:</label>
            <td><input type="text" id="hover-chatname" value="${chatname}">
        </tr>
    </table>
    <div class="hover-button-container">
        <button id="export-settings" onclick="export_settings(event)">Export Settings and Macros</button>
        <button id="import-settings" onclick="import_settings(event)">Import Settings and Macros</button>
    </div>
    `;
    make_ok_dialog(html, function (unused) {
        const chatname_el = document.getElementById('hover-chatname');
        setchatname(chatname_el.value);
    });
}
document.addEventListener('DOMContentLoaded', function () {
    resize_chat();
    const macro_button = document.getElementById('add-macro');
    macro_button.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        add_macro_dialog();
    });
    const options_button = document.getElementById('chat-options');
    options_button.addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        chat_options_dialog();
    });
    window.addEventListener('resize', resize_chat);
    const ta = document.getElementById('chatinput');
    const history = [];
    let history_index = 0;
    let current_text = "";
    ta.addEventListener('keydown', function (e) {
        e.stopPropagation();
        let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
        if (!modified && e.key == "Enter") {
            e.stopPropagation();
            e.preventDefault();
            const value = ta.value;
            if (value.length) {
                ta.value = "";
                if (maybe_handle_command(value)) {
                }
                else {
                    socket.emit('chat-input', { chatname: chatname, text: value });
                }
                if (!(history.length && value == history[history.length - 1])) {
                    history.push(value);
                }
                history_index = history.length;
                current_text = "";
            }
        }
        else if (!modified && e.key == "ArrowUp") {
            e.stopPropagation();
            e.preventDefault();
            if (history_index > 0 && history_index <= history.length) {
                if (history_index == history.length) {
                    current_text = ta.value;
                }
                history_index--;
                ta.value = history[history_index];
            }
        }
        else if (!modified && e.key == "ArrowDown") {
            e.stopPropagation();
            e.preventDefault();
            if (history_index >= 0 && history_index < history.length) {
                history_index++;
                if (history_index == history.length) {
                    ta.value = current_text;
                }
                else {
                    ta.value = history[history_index];
                }
            }
        }
    });
});
function maybe_handle_command(value) {
    let splitted = value.split(" ");
    let split = [];
    for (let s of splitted) {
        if (!s)
            continue;
        split.push(s);
    }
    if (split.length) {
        if (split[0] === "/get-state") {
            if (split.length > 1) {
                get(split[1]);
            }
            else {
                get('');
            }
            return true;
        }
        if (split[0] == '/clear') {
            clear_chat();
            return true;
        }
        if (split[0] == '/upload') {
            upload();
            return true;
        }
    }
    return false;
}
function format_dice_roll(roll_result) {
    if (!roll_result.length)
        return '<span class="dice-constant">0</span><br> = <span class="dice-total">0</span>';
    let result = '';
    let value = 0;
    const MINUS = '\u2212';
    const NBSPACE = '&nbsp;';
    function write_die(roll, i) {
        if (roll.base == 1) {
            if (roll.values[0] < 0) {
                result += ' ' + MINUS;
            }
            else if (i == 0) {
                result += NBSPACE + NBSPACE + NBSPACE;
            }
            else {
                result += ' +';
            }
            result += '<span class="dice-constant">' + Math.abs(roll.values[0]) + '</span>';
            value += roll.values[0] | 0;
            return;
        }
        const length = roll.values.length;
        for (let j = 0; j < length; ++j) {
            const v = roll.values[j] | 0;
            if (roll.negative) {
                result += ' ' + MINUS;
            }
            else if (j == 0 && i == 0) {
                result += NBSPACE + NBSPACE + NBSPACE;
            }
            else {
                result += ' +';
            }
            result += '[';
            if (v == roll.base) {
                result += '<span class="dice-roll dice-roll-max">';
            }
            else if (v == 1) {
                result += '<span class="dice-roll dice-roll-min">';
            }
            else {
                result += '<span class="dice-roll">';
            }
            if (roll.negative) {
                value -= v;
            }
            else {
                value += v;
            }
            result += v;
            result += '</span>';
            result += ']';
        }
    }
    const length = roll_result.length;
    for (let i = 0; i < length; ++i) {
        const roll = roll_result[i];
        write_die(roll, i);
    }
    result += '<br> = ';
    result += '<span class="dice-total">';
    result += value;
    result += '</span>';
    return result;
}

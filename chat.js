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
function set_macros(pairs) {
    for (let [name, body] of pairs) {
        MACROS.set(name, body);
    }
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
    const options = document.getElementById('chat-options');
    macros.insertBefore(macro_button, options);
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
function add_macros_and_buttons(pairs) {
    set_macros(pairs);
    for (let pair of pairs) {
        add_macro_button(pair[0]);
    }
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
function chat_options_dialog() {
    if (hover_is_open)
        return;
    hover_is_open = true;
    const hoverpop = document.createElement('section');
    hoverpop.classList.add('hover');
    let html = `
    <h2>Options</h2>
    <table class="input-container">
        <tr>
            <td><label for="hover-chatname">Chat Name:</label>
            <td><input type="text" id="hover-chatname" value="${chatname}">
        </tr>
    </table>
    <div style="max-height: 500px; overflow-y:scroll; padding: 2em;">
    <table class="input-container" id="hover-macro-table">
    `;
    for (let [key, value] of MACROS.entries()) {
        html += `
        <tr>
            <td><input type="text" value="${key}">
            <td><textarea rows="3" cols="40">${value}</textarea>
            <td><button class="delete-macro-button">Delete</button>
        </tr>
        `;
    }
    html += `
    </table>
    </div>
    <div class="hover-button-container">
        <button id="hover-add-macro">+ Add Macro</button>
        <button id="export-settings">Export</button>
        <button id="import-settings">Import</button>
    </div>
    <div class="hover-button-container">
        <button type="button" id="hoverpop-ok">Ok</button>
        <button type="button" id="hoverpop-cancel">Cancel</button>
    </div>
    `;
    hoverpop.innerHTML = html;
    for (let button of hoverpop.getElementsByClassName('delete-macro-button')) {
        button.addEventListener('click', delete_macro);
    }
    document.body.appendChild(hoverpop);
    function delete_macro(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.parentNode.parentNode.remove();
    }
    const hover_macro_table = document.getElementById('hover-macro-table');
    ;
    document.getElementById('hover-add-macro').addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="">
            <td><textarea rows="3" cols="40"></textarea>
            <td><button class="delete-macro-button">Delete</button>
        `;
        const button = tr.getElementsByClassName('delete-macro-button')[0];
        button.addEventListener('click', delete_macro);
        const body = hover_macro_table.getElementsByTagName('tbody');
        if (body.length) {
            body[0].appendChild(tr);
        }
        else {
            const tbody = document.createElement('tbody');
            tbody.appendChild(tr);
            hover_macro_table.appendChild(tbody);
        }
    });
    document.getElementById('export-settings').addEventListener('click', export_settings);
    document.getElementById('import-settings').addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        const inp = document.createElement('input');
        inp.type = 'file';
        function show_err(err) {
            console.log(err);
            err_dialog(`
                <div style="max-width:600px; margin:auto; padding:2em;">
                <h1>Unable to load settings</h1>
                <p> There was a problem loading the settings. Good luck!
                <br>
                <code>
                ${err}
                </code>
                </div>
                `);
        }
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
                    if (new_settings.chatname && typeof new_settings.chatname !== 'string') {
                        show_err('Non string chatname.');
                        return;
                    }
                    if (new_settings.macros) {
                        if (typeof new_settings.macros !== 'object') {
                            show_err('Invalid macros.');
                            return;
                        }
                        for (let [key, value] of Object.entries(new_settings.macros)) {
                            if (typeof key !== 'string') {
                                show_err('Nonstring key.');
                                return;
                            }
                            if (typeof value !== 'string') {
                                show_err('Nonstring macro body');
                                return;
                            }
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
                    remove_hoverpop();
                }
                catch (err) {
                    remove_hoverpop();
                    show_err(err);
                    return;
                }
            });
            fr.readAsText(file);
        }
        inp.addEventListener('change', handlefiles, false);
        inp.click();
    });
    function remove_hoverpop() {
        document.body.removeChild(hoverpop);
        hover_is_open = false;
    }
    const ok = document.getElementById('hoverpop-ok');
    function submit() {
        const chatname_el = document.getElementById('hover-chatname');
        setchatname(chatname_el.value);
        const trs = hover_macro_table.getElementsByTagName('tr');
        const macros = [];
        for (let tr of trs) {
            const name = tr.children[0].children[0].value;
            const body = tr.children[1].children[0].value;
            if (!name || !body)
                continue;
            macros.push([name, body]);
        }
        clear_macro_buttons();
        MACROS.clear();
        add_macros_and_buttons(macros);
        remove_hoverpop();
    }
    ok.addEventListener('click', function () {
        submit();
    });
    const cancel = document.getElementById('hoverpop-cancel');
    cancel.addEventListener('click', function () {
        remove_hoverpop();
    });
    const text_inputs = hoverpop.getElementsByTagName('input');
    let did_focus = false;
    for (let i = 0; i < text_inputs.length; i++) {
        const text_input = text_inputs[i];
        if (text_input.type == 'text' || text_input.type == 'url') {
            if (!did_focus) {
                text_input.focus();
                did_focus = true;
            }
            text_input.addEventListener('keydown', function (e) {
                let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
                if (!modified && e.key == "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    ok.click();
                }
            });
        }
    }
}
document.addEventListener('DOMContentLoaded', function () {
    resize_chat();
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
function err_dialog(html) {
    console.log(html);
    const errpop = document.createElement('section');
    errpop.classList.add('hover');
    html += `
        <div class="hover-button-container">
            <button type="button" class="errpop-ok">Ok</button>
        </div>
        `;
    errpop.innerHTML = html;
    document.body.appendChild(errpop);
    function remove_errpop() {
        document.body.removeChild(errpop);
    }
    const oks = document.getElementsByClassName('errpop-ok');
    if (oks.length) {
        oks[oks.length - 1].addEventListener('click', function () {
            remove_errpop();
        });
    }
    console.log(oks);
}

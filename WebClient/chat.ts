//
// Copyright © 2021-2024, David Priver
//

// Where should this go?
function prompt_variable(variable:Variable):Promise<string|null>{
    return new Promise(function(resolve:(value:string|null)=>void):void{
        const dialog = get_dialog('prompt-variable');
        dialog.title.textContent = 'Prompt Variable';
        dialog.f["prompt-label"].textContent = variable[1];
        dialog.f["number-label"].textContent = variable[1];
        dialog.f["checkbox-label"].textContent = variable[1];
        dialog.f["choice-label"].textContent = variable[1];
        const textrow = dialog.f.value.closest('tr') as HTMLTableRowElement;
        const numberrow = get_by_id<HTMLTableRowElement>('prompt-variable-number-row');
        const checkboxrow = get_by_id<HTMLTableRowElement>('prompt-variable-checkbox-row');
        const choicerow = get_by_id<HTMLTableRowElement>('prompt-variable-choice-row');
        textrow.style.display = 'none';
        numberrow.style.display = 'none';
        checkboxrow.style.display = 'none';
        choicerow.style.display = 'none';
        dialog.f.value.value = variable[3];
        dialog.f.number.value = variable[3];
        dialog.f.checkbox.checked = variable[3] == "1";
        switch(variable[2]){
            case ScriptVariableType.NUMBER:
            case ScriptVariableType.ABILITY_SCORE:
                numberrow.style.display = 'table-row';
                break;
            case ScriptVariableType.BOOLEAN:
                checkboxrow.style.display = 'table-row';
                break;
            case ScriptVariableType.CHOICE:
                dialog.f.choice.replaceChildren();
                for(const choice of variable[5]){
                    const option = elem_with_parent(dialog.f.choice, 'option');
                    option.value = choice;
                    option.textContent = choice;
                }
                dialog.f.choice.value = variable[3];
                choicerow.style.display = 'table-row';
                break;
            case ScriptVariableType.STRING:
                textrow.style.display = 'table-row';
                break;
        }
        dialog.show_handler = function():void{
            if(IS_TOUCH) return;
            switch(variable[2]){
                case ScriptVariableType.NUMBER:
                case ScriptVariableType.ABILITY_SCORE:
                    dialog.f.number.focus();
                    break;
                case ScriptVariableType.STRING:
                    dialog.f.value.focus();
                    break;
                case ScriptVariableType.CHOICE:
                    dialog.f.choice.focus();
                    break;
                case ScriptVariableType.BOOLEAN:
                    dialog.f.checkbox.focus();
                    break;
            }
        };
        dialog.ok_handler = function():void{
            let value = '';
            switch(variable[2]){
                case ScriptVariableType.NUMBER:
                case ScriptVariableType.ABILITY_SCORE:
                    value = dialog.f.number.value;
                    break;
                case ScriptVariableType.BOOLEAN:
                    value = dialog.f.checkbox.checked?"1":"0";
                    break;
                case ScriptVariableType.CHOICE:
                    value = dialog.f.choice.value;
                    break;
                case ScriptVariableType.STRING:
                    value = dialog.f.value.value;
                    break;
            }
            variable[3] = value;
            save_mcv_and_signal();
            resolve(value);
        };
        dialog.cancel_handler = function():void{
            resolve(null);
        };
        dialog.show();
    });
}

async function evaluate(text:string, character_id:number, macro_id:number, outarray:Array<Command>):Promise<string>{
    let [ns, vars] = get_script_variables(character_id, macro_id);
    try{
        let result = await evaluate_script(text, vars, ns, sheetname_to_id(get_active_char_name()), prompt_variable);
        if(typeof result == 'string')
            return result;
        if(result.length > 25)
            return "Your command results in too much output. Do less.";
        for(let c of result) outarray.push(c);
    }catch(e){
        return ""+e;
    }
    return "";
}
async function evaluate3(text:string, vars: Map<string, string>, outarray:Array<Command>):Promise<string>{
    try{
        let result = await evaluate_script(text, vars, new Map(), SHEET.NULL, null);
        if(typeof result == 'string')
            return result;
        if(result.length > 25)
            return "Your command results in too much output. Do less.";
        for(let c of result) outarray.push(c);
    }catch(e){
        return ""+e;
    }
    return "";
}

const {
    add_chat_msgs,
} = (function():{
    add_chat_msgs:(log:HTMLElement, msgs:Array<ChatMsg>, label_target?:(_:string, __:number, ___:number)=>void)=>void;
}{


function add_chat_msgs(log:HTMLElement, msgs:Array<ChatMsg>, label_target?:(_:string, __:number, ___:number)=>void):void{
    for(let i = 0; i < msgs.length; i++){
        const msg = msgs[i];
        const entry = elem_with_parent(log, 'div');
        const type_ = msg[0];
        const user_ = msg[1];
        switch(type_){
            case Msg.PLAIN:{
                const data = msg[2];
                if(user_){
                    const user = elem_with_text('b', user_+': ');
                    entry.appendChild(user);
                }
                const text = document.createTextNode(data);
                entry.appendChild(text);

            }break;
            case Msg.STYLED_TEXT:{
                const data = msg[2];
                const text = data[0]
                const flags = data[1];
                const color = data[2];
                if(user_ && !(flags & StyleFlags.ANON)){
                    const user = elem_with_text('b', user_+': ');
                    entry.appendChild(user);
                }
                const sp = elem_parent_text(entry,'span', text)
                if(flags & StyleFlags.BOLD)
                    sp.style.fontWeight = 'bold';
                if(flags & StyleFlags.ITALIC)
                    sp.style.fontStyle = 'italic';
                if(flags & StyleFlags.COLORED)
                    sp.style.color = color;
                if(flags & StyleFlags.UNDERLINE)
                    sp.style.textDecoration = 'underline';
                if(flags & StyleFlags.BOXED){
                    sp.style.border = '1px solid';
                    sp.style.padding = '4px 8px';
                    sp.style.display = 'inline-block';
                }
                if(flags & StyleFlags.BIG){
                    sp.style.fontSize = '150%';
                }
            }break;
            case Msg.ECHOABLE_TEXT:{
                if(user_){
                    const user = elem_with_text('b', user_+': ');
                    entry.appendChild(user);
                }
                const data = msg[2];
                const span = elem_with_text('span', data);
                entry.appendChild(span);
                span.style.cursor = 'pointer';
                span.setAttribute('role', 'button');
                if(label_target){
                    entry.classList.add('clickable');
                    let msg_data = data;
                    span.addEventListener('click', function(e):void{
                        e.stopPropagation();
                        e.preventDefault();
                        label_target(msg_data, -1, -1);
                    });
                }
            }break;
            case Msg.ERROR:{
                const data = msg[2];
                const error = elem_with_text('span', data);
                error.classList.add('chat-error');
                entry.appendChild(error);
            }break;
            case Msg.DICEROLL:{
                const data = msg[2];
                entry.classList.add('dice-roll-msg');
                const r = data;
                const formatted = format_new_die_roll_result(r);
                entry.innerHTML += formatted;
            }break;
        }
    }
}


function format_new_die_roll_result(roll_result:RolledExpr):string{
    let [total, text] = format_new_die_roll(roll_result, false);
    total = rounddown(total);
    // Don't do the total, more useful for mass rolling
    if(roll_result[0] == DieExprTypes.NGROUP)
        return text;
    return text + `<br> = <span class="dice-total">${total}</span>`;
}

function rounddown(a:number):number{
    return Math.trunc(a) | 0;
}
const enum MINUS {m = '\u2212'};
function format_new_die_roll(roll_result:RolledExpr, tight:boolean):[number, string]{
    switch(roll_result[0]){
        case DieExprTypes.NUMBER:
            return [roll_result[1], `<span class="dice-constant">${roll_result[1]}</span>`];
        case DieExprTypes.DICE:{
            let text = tight && roll_result[1] > 1 ?'( ':'';
            let max = roll_result[2];
            let first = true;
            let total = 0;
            for(let v of roll_result[3]){
                if(first)
                    first = false;
                else
                    text += ' + ';
                total += v;
                text += '[';
                if(v == max){
                    text += '<span class="dice-roll dice-roll-max">';
                }
                else if(v == 1){
                    text += '<span class="dice-roll dice-roll-min">';
                }
                else {
                    text += '<span class="dice-roll">';
                }
                text += `${v}</span>]`;
            }
            if(tight && roll_result[1] > 1) text += ' )';
            return [total, text];
        }
        case DieExprTypes.GROUP:{
            let [total, text] = format_new_die_roll(roll_result[1], false);
            return [total, '( ' + text + ' )'];
        }
        case DieExprTypes.NGROUP:{
            let total = 0;
            let text = '';
            for(let subexpr of roll_result[1]){
                let [subtotal, subtext] = format_new_die_roll(subexpr, false);
                total += subtotal;
                text += '<tr><td>'+subtext + '</td><td>→</td><td>' + subtotal + '</td></tr>';
            }
            text = '<table class="ngroup">' + text + '</table>';
            if(tight) text = '(<br>' + text + ')';
            return [total, text];
        }
        case DieExprTypes.Unary:{
            let [total, text] = format_new_die_roll(roll_result[2], true);
            switch(roll_result[1]){
                case Unary.PLUS:
                    text = '+' + text;
                    return [total, text];
                case Unary.NEG:
                    text = MINUS.m + text;
                    return [-total, text];
                case Unary.NOT:
                    text = '!' + text;
                    return [+!total, text];
            }
        }
        case DieExprTypes.Binary:{
            let op = roll_result[1];
            let [ltotal, ltext] = format_new_die_roll(roll_result[2], op == Binary.MUL || op == Binary.DIV);
            let [rtotal, rtext] = format_new_die_roll(roll_result[3], op == Binary.MUL || op == Binary.DIV);
            let result: [number, string];
            switch(op){
                case Binary.ADD:
                    result = [rounddown(ltotal)+rounddown(rtotal), `${ltext} + ${rtext}`];
                    break;
                case Binary.SUB:
                    result = [rounddown(ltotal)-rounddown(rtotal), `${ltext} ${MINUS.m} ${rtext}`];
                    break;
                case Binary.MUL:
                    result = [ltotal*rtotal, `${ltext} &times; ${rtext}`];
                    break;
                case Binary.DIV:
                    result = [rtotal?ltotal/rtotal:0, `${ltext} &divide; ${rtext}`];
                    break;
                case Binary.EQ:
                    result = [+(rounddown(ltotal)==rounddown(rtotal)), `${ltext} ＝ ${rtext}`];
                    break;
                case Binary.NE:
                    result = [+(rounddown(ltotal)!=rounddown(rtotal)), `${ltext} &ne; ${rtext}`];
                    break;
                case Binary.GT:
                    result = [+(rounddown(ltotal) > rounddown(rtotal)), `${ltext} &gt; ${rtext}`];
                    break;
                case Binary.GE:
                    result = [+(rounddown(ltotal) >= rounddown(rtotal)), `${ltext} &geq; ${rtext}`];
                    break;
                case Binary.LT:
                    result = [+(rounddown(ltotal) < rounddown(rtotal)), `${ltext} &lt; ${rtext}`];
                    break;
                case Binary.LE:
                    result = [+(rounddown(ltotal) <= rounddown(rtotal)), `${ltext} &leq; ${rtext}`];
                    break;
            }
            return result;
        }
    }
}

return {
    add_chat_msgs,
};
}());

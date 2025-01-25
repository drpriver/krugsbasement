//
// Copyright © 2021-2024, David Priver
//

// Where should this go?
function evaluate(text:string, character_id:number, macro_id:number, outarray:Array<Command>):string{
    let [ns, vars] = get_script_variables(character_id, macro_id);
    try{
        let result = evaluate_script(text, vars, ns, get_active_char_name());
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

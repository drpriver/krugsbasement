//
// Copyright © 2021-2024, David Priver
//

const {
    get_script_variables,
    reg_var_input,
    update_var_value,
    set_active_char,
    get_active_char,
    save_variables,
    save_macros,
    save_characters,
    save_mcv_and_signal,
    CHARACTERS,
    MACROS,
    VARIABLES,
    alloc_macro,
    alloc_character,
    alloc_variable,
    del_macro,
    del_character,
    del_variable,
} = (function(){
const CHARACTERS: Map<number, Character> = new Map();
let charactercounter = 0;
const MACROS: Map<number, Macro> = new Map();
let macrocounter = 0;
const VARIABLES: Map<number, Variable> = new Map();
let variablecounter = 0;
let active_character = 0;
function set_active_char(n:number):void{
    active_character = n;
}
function get_active_char():number{
    return active_character;
}
const VARINPUTS:Map<number, Map<string, HTMLInputElement>> = new Map();

function get_script_variables(character_id:number, macro_id:number):[Map<string, Map<string, string>>, Map<string, string>]{
    let namespaces:Map<string, Map<string, string>> = new Map();
    let vars:Map<string, string> = new Map();
    // This is kind of hacky.
    if(character_id == -1)
        character_id = active_character;
    for(let ch of CHARACTERS.values()){
        let ns = new Map();
        for(let vid of ch[3]){
            let v = VARIABLES.get(vid)!;
            let value = v[3];
            if(v[2] == ScriptVariableType.ABILITY_SCORE)
                value = ""+ability_score_to_modifier(+value);
            ns.set(v[1].toLowerCase(), value);
        }
        namespaces.set(ch[1].toLowerCase(), ns);
    }
    // First, globals
    for(let key of ['global', 'globals']){
        let ns = namespaces.get(key)!;
        if(ns === undefined)
            continue;
        for(let[k, v] of ns.entries())
            vars.set(k, v);
    }
    // Then, the current character
    if(character_id > 0){
        let ch = CHARACTERS.get(character_id)!;
        for(let vid of ch[3]){
            let v = VARIABLES.get(vid)!;
            let value = v[3];
            if(v[2] == ScriptVariableType.ABILITY_SCORE)
                value = ""+ability_score_to_modifier(+value);
            vars.set(v[1].toLowerCase(), value);
        }
    }
    // Then, the macro's variables
    if(macro_id > 0){
        let mac = MACROS.get(macro_id)!;
        for(let vid of mac[3]){
            let v = VARIABLES.get(vid)!;
            let value = v[3];
            if(v[2] == ScriptVariableType.ABILITY_SCORE)
                value = ""+ability_score_to_modifier(+value);
            vars.set(v[1].toLowerCase(), value);
        }
    }
    return [namespaces, vars];
}


function alloc_macro():Macro{
    const id = ++macrocounter;
    const result: Macro = [id, "Untitled", "", []];
    MACROS.set(id, result);
    return result;
}

function del_macro(id:number):void{
    const m = MACROS.get(id)!;
    MACROS.delete(id);
    for(const c of CHARACTERS.values()){
        const idx = c[2].indexOf(id);
        if(idx > -1){
            c[2].splice(idx, 1);
        }
    }
    for(const v of m[3])
        del_variable(v);
}

function alloc_variable():Variable {
    const id = ++variablecounter;
    const result: Variable = [id, "", ScriptVariableType.NUMBER, "0", 0];
    VARIABLES.set(id, result);
    return result;
}

function del_variable(id:number):void{
    VARIABLES.delete(id);
    for(const c of CHARACTERS.values()){
        const idx = c[3].indexOf(id);
        if(idx > -1)
            c[3].splice(idx, 1);
    }
    for(const m of MACROS.values()){
        const idx = m[3].indexOf(id);
        if(idx > -1)
            m[3].splice(idx, 1);
    }
    if(VARINPUTS.has(id))
        VARINPUTS.delete(id);
}

function alloc_character():Character{
    const id = ++charactercounter;
    const result: Character = [id, "", [], []];
    CHARACTERS.set(id, result);
    return result;
}

function del_character(id:number):void{
    const c = CHARACTERS.get(id)!;
    CHARACTERS.delete(id);
    for(const v of c[3])
        del_variable(v);
    for(const m of c[2])
        del_macro(m);
}

function save_macros():void{
    const to_save: Array<Macro> = Array.from(MACROS.values());
    sync_local(StorageCategory.MACROS, 'macros', to_save);
}
function save_characters():void{
    const to_save: Array<Character> = Array.from(CHARACTERS.values());
    sync_local(StorageCategory.MACROS, 'characters', to_save);
}
function save_variables():void{
    const to_save: Array<Variable> = Array.from(VARIABLES.values());
    sync_local(StorageCategory.MACROS, 'variables', to_save);
}

function save_mcv_and_signal():void{
    save_macros();
    save_characters();
    save_variables();
    signal_for(ListenEvent.MACROS_RENAMED);
}

function reg_var_input(vid:number, name:string, inp:HTMLInputElement):void{
    if(!VARINPUTS.has(vid))
        VARINPUTS.set(vid, new Map());
    VARINPUTS.get(vid)!.set(name, inp);
}

function update_var_value(vid:number, val:string):void{
    if(!val.length) return;
    if(VARINPUTS.has(vid)){
        const vs = VARINPUTS.get(vid)!;
        for(const v of vs.values()){
            if(v.type == 'checkbox')
                v.checked = val == "1";
            v.value = val;
        }
    }
    VARIABLES.get(vid)![3] = val;
    save_variables();
}


(function():void{
    for(const m of SETTINGS.macros.macros){
        MACROS.set(m[0], m);
        if(m[0] > macrocounter) macrocounter = m[0];
    }
    for(const v of SETTINGS.macros.variables){
        VARIABLES.set(v[0], v);
        if(v[0] > variablecounter) variablecounter = v[0];
    }
    let first = true;
    for(const c of SETTINGS.macros.characters){
        if(first) active_character = c[0];
        first = false;
        CHARACTERS.set(c[0], c);
        if(c[0] > charactercounter) charactercounter = c[0];
    }
}());

function ability_score_to_modifier(score:number):number{
    return Math.floor((score-10)/2);
}

return {
    get_script_variables,
    reg_var_input,
    update_var_value,
    set_active_char,
    get_active_char,
    save_variables,
    save_macros,
    save_characters,
    save_mcv_and_signal,
    CHARACTERS,
    MACROS,
    VARIABLES,
    alloc_macro,
    alloc_character,
    alloc_variable,
    del_macro,
    del_character,
    del_variable,
};
}());

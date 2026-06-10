//
// Copyright © 2021-2026, David Priver <david@davidpriver.com>
//
type ChatInput = {
    index: number;
    current_text: string
    set_text: string;
    history: Array<string>;
    enter_func: (_:string, __:number, ___:number)=>void;
    set_history: (_:Array<string>)=>void;
};
function setup_chat(chat:HTMLTextAreaElement, enter_func:(_:string, __:number, ___:number)=>void):ChatInput{
    const hist: ChatInput = {
        index: 0,
        current_text: "",
        set_text: "",
        history: [],
        enter_func:enter_func,
        set_history: function(newhistory:Array<string>):void{
            hist.history = newhistory;
            hist.index = newhistory.length;
            hist.current_text = "";
            hist.set_text = "";
            chat.value = "";
        },
    };
    chat.addEventListener('keydown', function(e):void{
        e.stopPropagation();
        if(IS_MAC && e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey){
            // cut-n-paste from below
            switch(e.key){
                case 'p':{
                    if(chat.value && chat.value != hist.set_text) break;
                    e.preventDefault();
                    if(hist.index > 0 && hist.index <= hist.history.length){
                        if(hist.index == hist.history.length){
                            hist.current_text = chat.value;
                        }
                        hist.index--;
                        chat.value = hist.history[hist.index];
                        hist.set_text = chat.value;
                    }
                }return;
                case 'n':{
                    if(chat.value && chat.value != hist.set_text) break;
                    e.preventDefault();
                    if(hist.index >= 0 && hist.index < hist.history.length){
                        hist.index++;
                        if(hist.index == hist.history.length)
                            chat.value = hist.current_text;
                        else
                            chat.value = hist.history[hist.index];
                        hist.set_text = chat.value;
                    }
                }return;
                case 'j':{
                    e.preventDefault();
                    const value = chat.value;
                    if(value.length){
                        chat.value = "";
                        hist.enter_func(value, -1, -1);
                        if(!(hist.history.length && value == hist.history[hist.history.length-1])){
                            hist.history.push(value);
                        }
                        hist.index = hist.history.length;
                        hist.current_text = "";
                        hist.set_text = "";
                    }
                }return;
            }
        }
        let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
        if(modified) return;
        switch(e.key){
            case 'Enter':{
                e.preventDefault();
                const value = chat.value;
                if(value.length){
                    chat.value = "";
                    hist.enter_func(value, -1, -1);
                    if(!(hist.history.length && value == hist.history[hist.history.length-1])){
                        hist.history.push(value);
                    }
                    hist.index = hist.history.length;
                    hist.current_text = "";
                    hist.set_text = "";
                }
            }break;
            case 'ArrowUp':{
                if(chat.value && chat.value != hist.set_text) break;
                e.preventDefault();
                if(hist.index > 0 && hist.index <= hist.history.length){
                    if(hist.index == hist.history.length){
                        hist.current_text = chat.value;
                    }
                    hist.index--;
                    chat.value = hist.history[hist.index];
                    hist.set_text = chat.value;
                }
            }break;
            case 'ArrowDown':{
                if(chat.value && chat.value != hist.set_text) break;
                e.preventDefault();
                if(hist.index >= 0 && hist.index < hist.history.length){
                    hist.index++;
                    if(hist.index == hist.history.length)
                        chat.value = hist.current_text;
                    else
                        chat.value = hist.history[hist.index];
                    hist.set_text = chat.value;
                }
            }break;
            case 'Escape':{
                remove_ctx_menu();
                chat.blur();
            }break;
        }
    });
    return hist;
}


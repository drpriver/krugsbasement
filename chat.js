socket.on('chat-msg', function(msgs){
  const log = document.getElementById('chat-history');
  for(let i = 0; i < msgs.length; i++){
    const msg = msgs[i];
    const entry = document.createElement('div');
    if(msg.user){
      const user = document.createElement('b');
      user.appendChild(document.createTextNode(msg.user+': '));
      entry.appendChild(user);
    }
    const text = document.createTextNode(msg.text);
    entry.appendChild(text);
    log.appendChild(entry);
  }
  log.scrollTo({behavior:'smooth', top:log.scrollHeight});
});
function resize_chat(){
    const hist = document.getElementById('chat-history');
    const ta = document.getElementById('chatinput');
    hist.style.height = window.innerHeight-12-100 + 'px';
    hist.scrollTo({top:hist.scrollHeight});
}

document.addEventListener('DOMContentLoaded', function(){
  resize_chat();
  window.addEventListener('resize', resize_chat);
  const ta = document.getElementById('chatinput');
  const history = [];
  let history_index = 0;
  let current_text = "";
  ta.addEventListener('keydown', function(e){
    e.stopPropagation();
    let modified = e.ctrlKey || e.altKey || e.metaKey || e.shiftKey;
    if(!modified && e.key == "Enter"){
      e.stopPropagation();
      e.preventDefault();
      const entry = document.createElement('div');
      const value = ta.value;
      if(value.length){
        ta.value = "";
        socket.emit('chat-input', value);
        if(!(history.length && value == history[history.length-1])){
          history.push(value);
        }
        history_index = history.length;
        current_text = "";
      }
    }
    else if(!modified && e.key == "ArrowUp"){
      e.stopPropagation();
      e.preventDefault();
      if(history_index > 0 && history_index <= history.length){
        if(history_index == history.length){
          current_text = ta.value;
        }
        history_index--;
        ta.value = history[history_index];
      }
    }
    else if(!modified && e.key == "ArrowDown"){
      e.stopPropagation();
      e.preventDefault();
      if(history_index >= 0 && history_index < history.length){
        history_index++;
        if(history_index == history.length){
          ta.value = current_text;
        }
        else{
          ta.value = history[history_index];
        }
      }
    }
  });
});
//endjs

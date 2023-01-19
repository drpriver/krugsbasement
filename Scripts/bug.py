import sys
import pydndc
import flask
import glob
import webbrowser
import threading
import os
import datetime
import textwrap
import time
BUGS = glob.glob('Bugs/**/*.bug', recursive=True)
BUGS = [b.replace('\\', '/') for b in BUGS]
BUGS = [b[5:] for b in BUGS]
BUGS.sort()
app = flask.Flask('Bug')
PORT=2471

def textopen(*args, **kwargs):
    return open(*args, **kwargs, encoding='utf-8')

def getbuglist():
    result = {
        'buglist':'',
        'rbuglist':'',
        'puntbuglist':'',
        'wfbuglist':'',
        'links': '::links\n',
    }
    for i, bug in enumerate(BUGS):
        parts = bug.split('/')
        if len(parts) == 2:
            p = parts[0]
            if p == 'Resolved':
                key = 'rbuglist'
            elif p == 'WontFix':
                key = 'wfbuglist'
            elif p == 'Punted':
                key = 'puntbuglist'
            else:
                key = 'buglist'
        else:
            key = 'buglist'
        result[key] += '* [' + parts[-1][:-4] + ' | ' + str(i) + ']\n'
        result['links'] += '  ' + str(i) + ' = /' + str(i) + '\n'
        result['links'] += '  ' + parts[-1] + ' = /' + str(i) + '\n'
        result['links'] += '  ' + parts[-1][:-4] + ' = /' + str(i) + '\n'
    return result


@app.route('/')
def root():
    jsargs = {
        'thisbugname':'Welcome!',
        'thisbug':'',
        **getbuglist(),
        'bugid': -1,
        'bugkind': 0,
        'noshutdown': False,
    }
    ctx = CTX.pseudo_clone()
    ctx.execute_js(jsargs)
    ctx.resolve_links()
    html = ctx.render()
    return html
    return 'ello'

@app.route('/<int:bugid>', methods=['GET'])
def gethandler(bugid:int):
    if bugid < 0 or bugid >= len(BUGS):
        return flask.abort(404)
    bug = BUGS[bugid]
    parts = bug.split('/')
    bugkind = 0
    if len(parts) == 2:
        p = parts[0]
        if p == 'Resolved':
            bugkind = 1
        elif p == 'WontFix':
            bugkind = 2
        elif p == 'Punted':
            bugkind = 3
        else:
            bugkind = 0
    try:
        with textopen('Bugs/'+bug, 'r') as fp:
            text = fp.read()
    except IOError:
        return flask.abort(404)

    bugname = parts[-1]
    jsargs = {
        'thisbugname':bugname[:-4],
        'thisbug':text,
        **getbuglist(),
        'bugid': bugid,
        'bugkind':bugkind,
        'noshutdown': False,
    }
    ctx = CTX.pseudo_clone()
    ctx.execute_js(jsargs)
    ctx.resolve_links()
    html = ctx.render()
    return html

@app.route('/new', methods=['POST'])
def newhandler():
    t = flask.request.data.decode('utf-8')
    title, content = t.split('\n\n', 1)
    title = title.lower().replace(' ', '-') + '.bug'
    if title in BUGS:
        flask.abort(404)
    ctx = pydndc.Context(flags=pydndc.Flags.INPUT_IS_UNTRUSTED)
    ctx.logger = pydndc.stderr_logger
    ctx.root.parse(
        'Changelog::kv\n'+
        '  created: ' + datetime.datetime.utcnow().isoformat()+'\n'
        'Created ' + datetime.datetime.now().strftime("%b %d, %Y, %I:%M%p") + '::md.update\n' +
        'Summary::md.summary\n' + 
        textwrap.indent(content, '  ') + '\n'
    )
    with textopen('Bugs/' + title, 'w') as fp:
        fp.write(ctx.format_tree())
    BUGS.append(title)
    return {'bugid':len(BUGS)-1}

@app.route('/<action>/<int:bugid>', methods=['POST'])
def appendhandler(action:str, bugid:int):
    if bugid < 0 or bugid >= len(BUGS):
        return flask.abort(404)
    bug = BUGS[bugid]
    parts = bug.split('/')
    fromfolder = parts[0] if len(parts) == 2 else ''
    name = parts[1] if len(parts) == 2 else parts[0]
    TOFOLDER = {
        'append': fromfolder,
        'resolve': 'Resolved',
        'wontfix': 'WontFix',
        'punt': 'Punted',
        'reopen': '',
    }
    if action not in TOFOLDER:
        return flask.abort(404)
    tofolder = TOFOLDER[action]
    if tofolder == fromfolder and action != 'append':
        return flask.abort(404)
    title = {
        'resolve' : 'Resolved',
        'wontfix' : 'WontFix',
        'punt'    : 'Punted',
        'reopen'  : 'Reopened',
        'append'  : 'Updated',
    }[action]
    key = {
        'resolve' : 'resolved',
        'wontfix' : 'wontfix',
        'punt'    : 'punted',
        'reopen'  : 'reopened',
        'append'  : 'updated',
    }[action]
    fromfolder = os.path.normpath('Bugs/'+fromfolder).replace('\\', '/')
    tofolder = os.path.normpath('Bugs/'+tofolder).replace('\\', '/')
    content = flask.request.data.decode('utf-8')
    src = fromfolder + '/' + name

    with textopen(src, 'r') as fp:
        body = fp.read()
    ctx = pydndc.Context(flags = 
            pydndc.Flags.INPUT_IS_UNTRUSTED
          | pydndc.Flags.SUPPRESS_WARNINGS)
    ctx.logger = pydndc.stderr_logger
    ctx.root.parse(body)
    changelog = ctx.node_by_id('changelog')
    if changelog is None:
        changelog = ctx.make_node(pydndc.NodeType.KEYVALUE, 'changelog')
        ctx.root.insert_child(0, changelog)
    changelog.parse(key + ': ' + datetime.datetime.utcnow().isoformat())
    title = title + ' ' + datetime.datetime.now().strftime("%b %d, %Y, %I:%M%p")
    new_entry = ctx.root.make_child(pydndc.NodeType.MD, title)
    new_entry.classes.add('update')
    new_entry.parse(content)
    text = ctx.format_tree()
    dst = tofolder + '/' + name
    with textopen(src, 'w') as fp:
        fp.write(text)
    if src != dst:
        os.replace(src, dst)
    BUGS[bugid] = dst[5:]
    return 'OK'

@app.route('/shutdown', methods=['POST'])
def shutdown():
    os._exit(0)


BUG=r'''
::div #id(middle)
  ::div #id(tabs)
    ::js
      let raw = node.parent.make_child(NodeType.RAW);
      raw.add_child(`
        <span id="bugtab" class="active">${Args.thisbugname.replace(/-/g, ' ')}</span>
        <span id="newtab">New Bug</span>
      `);
    ::css
      #tabs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        max-width: 44em;
      }
      #bugname {
        text-transform: capitalize;
      }
      #tabs span {
        border: 1px solid black;
        padding: 1em;
        text-transform: capitalize;
        background-color: #aaa;
        cursor: pointer;
        text-align: center;
      }
      #tabs span.active {
        background-color: #fff;
        border-bottom: 1px solid #fff;
      }
      #tabs span:hover {
        background-color: #eee;
        border-bottom: 1px solid #eee;
      }
      body.darkmode #tabs span {
        background-color: #222;
      }
      body.darkmode #tabs span.active {
        background-color: #333;
        border-bottom: 1px solid #333;
      }
      body.darkmode #tabs span:hover {
        background-color: #444;
      }
  Bugs -::title #hide
  ::h #id(bugname)
  ::js
    let title = ctx.select_nodes({type:NodeType.TITLE})[0];
    title.header = `Bugs - WebDnD`
    if(Args.links)
      ctx.root.parse(Args.links);
    let bugname = ctx.select_nodes({id:'bugname'})[0];
    bugname.header = Args.thisbugname.replace(/-/g, ' ');
  ::md #id(thisbug)
    ::js
      if(Args.thisbug){
        node.parent.parse(Args.thisbug);
        let changelog = ctx.select_nodes({id:'Changelog'})[0];
        if(changelog){
          changelog.detach();
          let right = ctx.select_nodes({id:'right'})[0];
          right.add_child(changelog);
        }
      }
      else
        node.parent.parse(`
          Click a bug on the left to view its description.

          If there are no bugs, then I guess your software is bug-free!

          Congratulations!
          `);
  ::md #id(update-inputs)
    ::raw
      <textarea></textarea>
      <div>
        <button id="reopen-button">Reopen</button>
        <button id="update-button">Update</button>
        <button id="resolve-button">Resolve</button>
        <button id="wontfix-button">WontFix</button>
        <button id="punt-button">Punt</button>
      </div>
  ::div #id(newbug)
    ::raw
      <label><input id="new-bug-title" type="text"></label>
      <textarea id="new-bug-text"></textarea>
      <button id="new-submit">Submit</button>
::div #id(left)
  Bugs::details
    ::js
      node.parent.parse(Args.buglist.replace(/-/g, ' '));
  Resolved::details
    ::js
      node.parent.parse(Args.rbuglist.replace(/-/g, ' '));
  WontFix::details
    ::js
      node.parent.parse(Args.wfbuglist.replace(/-/g, ' '));
  Punted::details
    ::js
      node.parent.parse(Args.puntbuglist.replace(/-/g, ' '));
::div #id(right)
  ::raw #id(shutraw)
    <button id="shutdown">Shutdown</button>
  ::js
    if(Args.noshutdown){
      let shutdown = ctx.select_nodes({id:'shutraw'})[0];
      shutdown.detach();
    }
  ::raw
    <div>
    <label><input type="radio" id="dm-sys" name="dm" onchange="change_dark_mode(0)" checked style="width:initial; margin-top:initial;"> System</label>
    <br>
    <label><input type="radio" id="dm-dark" name="dm" onchange="change_dark_mode(1)" style="width:initial; margin-top:initial;"> Dark</label>
    <br>
    <label><input type="radio" id="dm-light" name="dm" onchange="change_dark_mode(2)" style="width:initial; margin-top:initial;"> Light</label>
    </div>
::js
  let sc = ctx.root.make_child(NodeType.SCRIPTS)
  sc.add_child(`let bugid=${Args.bugid};`);
  sc.add_child(`let bugkind=${Args.bugkind};`);
::script
  function system_prefers_darkmode(){
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  let current_dark_mode = 0;
  let DARKMODE = false;
  function change_dark_mode(mode){
    switch(mode){
      case 1:
        DARKMODE = true;
        document.body.classList.add('darkmode');
        document.documentElement.style.colorScheme = 'dark';
        break;
      case 2:
        DARKMODE = false;
        document.body.classList.remove('darkmode');
        document.documentElement.style.colorScheme = 'light';
        break;
      case 0:
      default:
        DARKMODE = system_prefers_darkmode();
        if(DARKMODE){
          document.body.classList.add('darkmode');
          document.documentElement.style.colorScheme = 'dark';
        }
        else{
          document.body.classList.remove('darkmode');
          document.documentElement.style.colorScheme = 'light';
        }
        break;
    }
    current_dark_mode = mode;
    localStorage.setItem('dm', mode);
  }

  document.addEventListener('DOMContentLoaded', function(){
    const dm = localStorage.getItem('dm') | 0;
    change_dark_mode(dm);
    switch(dm){
      case 0:
        document.getElementById('dm-sys').checked = true;
        break;
      case 1:
        document.getElementById('dm-dark').checked = true;
        break;
      case 2:
        document.getElementById('dm-light').checked = true;
        break;
    }
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e){
      change_dark_mode(current_dark_mode);
    });
    const shut = document.getElementById('shutdown');
    if(shut)
      shut.addEventListener('click', function(){
        fetch('/shutdown', {method:'POST'});
        document.body.innerHTML = 'Close this window.';
      });
    const ta = document.querySelector('textarea');

    let buttonids = ['update-button', 'resolve-button', 'wontfix-button', 'punt-button', 'reopen-button'];
    let actions = ['append', 'resolve', 'wontfix', 'punt', 'reopen']
    for(let i = 0; i < buttonids.length; i++){
      if(bugid < 0) break;
      const but = document.getElementById(buttonids[i]);
      let action = actions[i];
      but.addEventListener('click', function(){
        const text = ta.value.trim();
        if(!text)
          return;
        ta.value = '';
        const path = `/${action}/${bugid}`;
        fetch(path, {
          method: 'POST',
          body: text,
        })
          .then(response => {
            if(response.ok){
              location.reload();
            }
            else {
              alert('bad update');
            }
          });
      });
    }
    switch(bugkind){
      case 0: // open
        document.getElementById('reopen-button').remove();
        break;
      case 1: // resolved
        document.getElementById('resolve-button').remove();
        document.getElementById('wontfix-button').remove();
        document.getElementById('punt-button').remove();
        break;
      case 2: // wontfix
        document.getElementById('wontfix-button').remove();
        break;
      case 3: // punted
        document.getElementById('punt-button').remove();
        break;
    }
    for(let b of document.querySelectorAll('details')){
      b.open = +localStorage.getItem(b.id);
      b.addEventListener('toggle', function(){localStorage.setItem(b.id, b.open?'1':'0')});
    }
    let newbug = document.getElementById('newtab');
    let bugtab = document.getElementById('bugtab');
    bugtab.addEventListener('click', function(e){
      e.stopPropagation();
      e.preventDefault();
      newbug.classList.remove('active');
      bugtab.classList.add('active');
      document.getElementById('thisbug').style.display = 'block';
      document.getElementById('update-inputs').style.display = 'block';
      document.getElementById('newbug').style.display = 'none';
      document.getElementById('bugname').style.display = 'block';
    });
    newbug.addEventListener('click', function(e){
      e.stopPropagation();
      e.preventDefault();
      bugtab.classList.remove('active');
      newbug.classList.add('active');
      document.getElementById('thisbug').style.display = 'none';
      document.getElementById('update-inputs').style.display = 'none';
      document.getElementById('newbug').style.display = 'block';
      document.getElementById('bugname').style.display = 'none';
    });
    let newbugtitle = document.getElementById('new-bug-title');
    let newbugtext = document.getElementById('new-bug-text');
    newbugtitle.addEventListener('keydown', function(e){
      if(e.keyCode == 'Enter'){
        e.stopPropagation();
        e.preventDefault();
        newbugtext.focus();
      }
    });
    let newsubmit = document.getElementById('new-submit');
    newsubmit.addEventListener('click', function(){
      let title = newbugtitle.value.trim();
      let text = newbugtext.value.trim();
      if(!title || !text)
        return;
      fetch('/new', {method:'POST', body:`${title}\n\n${text}`})
      .then(response => {
        if(response.ok){
          response.json().then(data=>window.location.href=data.bugid);
        }
        else{
          alert('bad new bug');
        }
      });
    });
    for(let a of document.getElementsByTagName('a')){
      a.addEventListener('click', function(e){
        e.stopPropagation();
        e.preventDefault();
        window.location.replace(a.href);
      });
    }
  });
::css
  * {
    box-sizing: border-box;
  }
  body.darkmode {
    background-color: #333;
  }
  body.darkmode textarea {
    color: #eee;
    background-color: rgb(60, 60, 60);
  }
  /* firefox is garbage */
  @supports (-moz-appearance:none) {
    body.darkmode {
      color: #fff;
    }
    body.darkmode button {
      border-radius: 4px;
      appearance: none;
      align-items: flex-start;
      text-align: center;
      padding-top: 1px;
      padding-right: 8px;
      padding-bottom: 1px;
      padding-left: 8px;
      border-top-width: 0px;
      border-right-width: 2px;
      border-bottom-width: 0px;
      border-left-width: 2px;
      border-top-style: outset;
      border-right-style: none;
      border-bottom-style: outset;
      border-left-style: outset;
      border-top-color: rgb(101, 101, 101);
      border-right-color: rgb(101, 101, 101);
      border-bottom-color: rgb(101, 101, 101);
      border-left-color: rgb(101, 101, 101);
      border-image-source: initial;
      border-image-slice: initial;
      border-image-width: initial;
      border-image-outset: initial;
      border-image-repeat: initial;
      color: rgb(232, 232, 232);
      background-color: rgb(101, 101, 101);
      margin-top: 0em;
      font-style: normal;
      font-weight: 400;
      font-size: 11px;
      font-family: -apple-button;
      font-variant-caps: normal;
      letter-spacing: normal;
      word-spacing: normal;
      line-height: normal;
      text-transform: none;
      text-indent: 0px;
      text-shadow: none;
      display: inline-block;
      text-align: start;
    }
    body.darkmode textarea {
      color: #eee;
      background-color: rgb(60, 60, 60);
    }
    body.darkmode input {
      color: #eee;
      background-color: #1e1e1e;
    }
    body.darkmode label {
      color: #fff;
    }
  }

  button {
    cursor: pointer;
  }
  body {
    display: grid;
    grid-template-columns: 18em auto 18em;
    grid-template-rows: 100%;
    height: 100vh;
    margin: 0;
    padding: 0.5em;
  }
  #left {
    grid-column: 1;
    grid-row: 1;
    height: 100%;
    overflow-y: auto;
    padding: 0.5em;
  }
  #left  li a {
    text-transform: capitalize;
  }
  a {
    color: #333;
  }
  body.darkmode a {
    color: #ccc;
  }
  .update, .summary {
    border: 1px solid gray;
    border-top: none;
    border-right: none;
    padding: 0 1em 1em 1em;
    border-collapse: collapse;
    margin-top: -1px;
  }
  .update > h2 {
    font-style: italic;
    font-weight: normal;
    font-size: 100%;
  }
  #thisbug {
    max-width: 44em;
  }
  #update-inputs, #newbug{
    max-width: 44em;
  }

  #middle {
    grid-column: 2;
    grid-row: 1;
    height: 100%;
    display: grid;
    grid-template-rows: max-content max-content max-content;
    grid-template-columns: 100%;
    overflow-y: auto;
  }
  #right {
    grid-row: 1;
    grid-column: 3;
    height: 100%;
  }
  textarea {
    margin: auto;
    width: 100%;
    height: 300px;
    display: block;
    margin-top: 1em;
  }
  body {
    font-family: -apple-system, "Segoe UI", sans;
  }
  * {
    box-sizing: border-box;
  }
  table {
    border-spacing: 0;
    border-collapse: collapse;
  }
  th, td {
    border: 1px solid black;
    padding: 6px 13px;
  }
  #update-inputs {
    width: 100%;
  }
  #newbug {
    display: none;
  }
  label, label input {
    font-size: 32px;
    width: 100%;
    margin-top: 1em;
  }
  #right label {
    font-size: 1rem;
  }
  #changelog + table {
    font-size: 70%;
    font-style: italic;
    border: none;
  }
'''

CTX = pydndc.Context()
CTX.root.parse(BUG)
CTX.logger = pydndc.stderr_logger

if __name__ == '__main__':
    from gevent.pywsgi import WSGIServer
    from gevent.pywsgi import WSGIServer
    http_server = WSGIServer(("127.0.0.1", PORT), app)
    threading.Thread(target=lambda:( print(f'http://localhost:{PORT}'),webbrowser.open(f'http://localhost:{PORT}'))).start()
    try:
        http_server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)

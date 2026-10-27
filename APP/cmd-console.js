// app/cmd-console.js — 命令窗口（JS 控制台 + 自定义命令）
// 用法：
//   以 / 开头 → 命令：/help  /state  /style 星空  /dev fps on  /uispd 1.5
//   其它输入 → 当作 JavaScript 在全局执行，支持 await；$_ 是上一次的结果
//   __openCmdConsole()  /  Ctrl|Cmd + Shift + K  /  设置 → 开发者选项 → 命令窗口
//   自己加命令：
//     CmdConsole.register('hi', { group:'其他', desc:'打招呼', usage:'/hi [名字]',
//       run:function(args, ctx){ return 'hi ' + (args[0] || '') } })
(function () {
  'use strict';
  if (window.__cmdConsoleInstalled) return;
  window.__cmdConsoleInstalled = true;

  var $id = function (id) { return document.getElementById(id); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) {} }

  /* 读全局名字（core.js 里的 var / function 都挂在 window 上；let / const 用间接 eval 兜底） */
  function g(name) {
    if (name in window) return window[name];
    try { return (0, eval)(name); } catch (_) { return undefined; }
  }

  /* ============================== 输出格式化 ============================== */
  function short(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + '…(+' + (s.length - n) + ')' : s; }
  function elTag(el) {
    var s = '<' + el.nodeName.toLowerCase();
    if (el.id) s += '#' + el.id;
    if (el.classList && el.classList.length) s += '.' + Array.prototype.join.call(el.classList, '.');
    return s + '>';
  }
  function wrap(open, items, close, d) {
    var one = open + ' ' + items.join(', ') + ' ' + close;
    if (one.length <= 80 && one.indexOf('\n') < 0) return one;
    var pad = new Array(d + 2).join('  '), padc = new Array(d + 1).join('  ');
    return open + '\n' + items.map(function (s) { return pad + s; }).join(',\n') + '\n' + padc + close;
  }
  function fmt(v, d, seen) {
    d = d || 0; seen = seen || [];
    var t = typeof v;
    if (v === null) return 'null';
    if (t === 'undefined') return 'undefined';
    if (t === 'string') return d ? JSON.stringify(short(v, 200)) : v;
    if (t === 'number' || t === 'boolean') return String(v);
    if (t === 'bigint') return v + 'n';
    if (t === 'symbol') return v.toString();
    if (t === 'function') {
      var m = /^[^{=]*?\(([^)]*)\)/.exec(Function.prototype.toString.call(v));
      return 'ƒ ' + (v.name || 'anonymous') + '(' + (m ? m[1] : '') + ')';
    }
    if (v instanceof Error) return v.stack ? v.stack.split('\n').slice(0, 4).join('\n') : v.name + ': ' + v.message;
    if (v === window) return '[Window]';
    if (v.nodeType === 1) return elTag(v);
    if (v.nodeType === 3) return '#text ' + JSON.stringify(short(v.data, 60));
    if (v.nodeType === 9) return '#document';
    if (seen.indexOf(v) >= 0) return '[Circular]';
    var isArr = Array.isArray(v);
    var isList = !isArr && typeof v.length === 'number' && typeof v.item === 'function';
    var isMap = v instanceof Map, isSet = v instanceof Set;
    if (d >= 3) return isArr ? 'Array(' + v.length + ')' : isList ? 'NodeList(' + v.length + ')' : isMap ? 'Map(' + v.size + ')' : isSet ? 'Set(' + v.size + ')' : '{…}';
    seen = seen.concat([v]);
    var items = [], i, MAX = 40;
    if (isArr || isList) {
      var n = v.length;
      for (i = 0; i < Math.min(n, MAX); i++) items.push(fmt(v[i], d + 1, seen));
      if (n > MAX) items.push('…(+' + (n - MAX) + ')');
      return (isArr ? '' : 'NodeList(' + n + ') ') + (n ? wrap('[', items, ']', d) : '[]');
    }
    if (isSet) {
      v.forEach(function (x) { if (items.length < MAX) items.push(fmt(x, d + 1, seen)); });
      return 'Set(' + v.size + ') ' + (items.length ? wrap('{', items, '}', d) : '{}');
    }
    if (isMap) {
      v.forEach(function (x, k) { if (items.length < MAX) items.push(fmt(k, d + 1, seen) + ' => ' + fmt(x, d + 1, seen)); });
      return 'Map(' + v.size + ') ' + (items.length ? wrap('{', items, '}', d) : '{}');
    }
    if (ArrayBuffer.isView(v)) return v.constructor.name + '(' + v.length + ')';
    var keys = [];
    try { keys = Object.keys(v); } catch (_) {}
    for (i = 0; i < Math.min(keys.length, MAX); i++) {
      var k = keys[i], val;
      try { val = fmt(v[k], d + 1, seen); } catch (e) { val = '[读取失败]'; }
      items.push((/^[\w$]+$/.test(k) ? k : JSON.stringify(k)) + ': ' + val);
    }
    if (keys.length > MAX) items.push('…(+' + (keys.length - MAX) + ')');
    var cn = v.constructor && v.constructor.name;
    var head = (cn && cn !== 'Object') ? cn + ' ' : '';
    return head + (items.length ? wrap('{', items, '}', d) : '{}');
  }
  function fmtTop(x) { var s = fmt(x); return s.length > 20000 ? s.slice(0, 20000) + '\n…(已截断)' : s; }
  function preview(v) {
    var t = typeof v;
    if (v === null || t === 'undefined' || t === 'number' || t === 'boolean') return String(v);
    if (t === 'string') return short(JSON.stringify(v), 40);
    if (Array.isArray(v)) return 'Array(' + v.length + ')';
    if (v && v.nodeType === 1) return elTag(v);
    return '{…}';
  }

  /* ============================== 命令注册表 ============================== */
  var cmds = {}, alias = {};
  function register(name, def) {
    name = String(name).toLowerCase();
    def = def || {};
    def.name = name;
    cmds[name] = def;
    (def.alias || []).forEach(function (a) { alias[String(a).toLowerCase()] = name; });
  }
  function tokenize(s) {
    var out = [], re = /"([^"]*)"|'([^']*)'|(\S+)/g, m;
    while ((m = re.exec(s))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
    return out;
  }

  /* /goto /prev /style /theme 默认直接调播放器和渲染器。
     /bind 仍可改成别的全局函数（存在 localStorage 的 cmd_bind），用来临时替换。 */
  var BINDABLE = { goto: '跳到第 n 句（传入从 0 开始的下标）', prev: '上一句', style: '切换文字动画风格（传入风格 key）', theme: '切换主题（传入主题下标）' };
  var binds = {};
  try { binds = JSON.parse(lsGet('cmd_bind') || '{}') || {}; } catch (_) { binds = {}; }
  function callBound(what, args) {
    var fn = binds[what];
    if (!fn) return null;
    if (typeof window[fn] !== 'function') { throw new Error('绑定的函数 ' + fn + ' 不存在，/bind -d ' + what + ' 可解除'); }
    return { name: fn, value: window[fn].apply(window, args) };
  }

  /* ============================== 界面 ============================== */
  var CSS = ''
    + '#cmRoot{position:fixed;inset:0;z-index:99992;visibility:hidden;pointer-events:none;'
    +   'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"PingFang SC",monospace;color:#e8e8ea;'
    +   'transition:visibility 0s linear calc(.3s/var(--ui-spd,1))}'
    + '#cmRoot.show{visibility:visible;pointer-events:auto;transition:visibility 0s}'
    + '#cmRoot .cm-mask{position:absolute;inset:0;background:rgba(0,0,0,.42);opacity:0;transition:opacity calc(.28s/var(--ui-spd,1)) ease}'
    + '#cmRoot.show .cm-mask{opacity:1}'
    + '#cmRoot .cm-card{position:absolute;left:0;right:0;bottom:0;top:calc(env(safe-area-inset-top,0px) + 34px);'
    +   'background:rgba(18,20,26,.94);-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);'
    +   'border-radius:22px 22px 0 0;display:flex;flex-direction:column;transform:translateY(30px);opacity:0;'
    +   'transition:transform calc(.35s/var(--ui-spd,1)) cubic-bezier(.32,.72,0,1),opacity calc(.25s/var(--ui-spd,1)) ease}'
    + '#cmRoot.show .cm-card{transform:none;opacity:1}'
    + '#cmRoot .cm-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 14px 8px;border-bottom:1px solid rgba(255,255,255,.08)}'
    + '#cmRoot .cm-title{font-size:14px;font-weight:800;letter-spacing:.5px}'
    + '#cmRoot .cm-spacer{flex:1}'
    + '#cmRoot .cm-btn{flex:none;height:28px;min-width:28px;padding:0 10px;border:none;border-radius:8px;background:rgba(255,255,255,.1);'
    +   'color:#e8e8ea;font:inherit;font-size:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .15s}'
    + '#cmRoot .cm-btn:active{background:rgba(255,255,255,.24)}'
    + '#cmRoot .cm-out{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:8px 12px;'
    +   'scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent;-webkit-user-select:text;user-select:text}'
    + '#cmRoot .cm-out::-webkit-scrollbar{width:6px}'
    + '#cmRoot .cm-out::-webkit-scrollbar-thumb{background:rgba(255,255,255,.28);border-radius:3px}'
    + '#cmRoot .cm-ln{font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-word;padding:1px 0}'
    + '#cmRoot .cm-ln+.cm-ln{margin-top:1px}'
    + '#cmRoot .cm-in{color:#8fb0ff;font-weight:700;margin-top:8px}'
    + '#cmRoot .cm-in:first-child{margin-top:0}'
    + '#cmRoot .cm-out-k{color:#e8e8ea}'
    + '#cmRoot .cm-info{color:#8e8e93}'
    + '#cmRoot .cm-ok{color:#30d158}'
    + '#cmRoot .cm-err{color:#ff6b61}'
    + '#cmRoot .cm-warn{color:#ffd60a}'
    + '#cmRoot .cm-log{color:#64d2ff}'
    + '#cmRoot .cm-dots{display:inline-flex;gap:3px;vertical-align:-1px;margin-right:6px}'
    + '#cmRoot .cm-dots i{width:11px;height:11px;border-radius:50%;display:block}'
    + '#cmRoot .cm-sug{flex:none;display:flex;gap:6px;padding:6px 12px 0;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}'
    + '#cmRoot .cm-sug::-webkit-scrollbar{display:none}'
    + '#cmRoot .cm-sug:empty{display:none}'
    + '#cmRoot .cm-chip{flex:none;height:26px;padding:0 10px;border:none;border-radius:8px;background:rgba(255,255,255,.08);'
    +   'color:#c9d6f5;font:inherit;font-size:12px;cursor:pointer;-webkit-tap-highlight-color:transparent;white-space:nowrap}'
    + '#cmRoot .cm-chip:active{background:rgba(143,176,255,.45)}'
    + '#cmRoot .cm-bar{flex:none;display:flex;align-items:flex-end;gap:6px;padding:8px 12px calc(env(safe-area-inset-bottom,0px) + 8px)}'
    + '#cmRoot.kb .cm-bar{padding-bottom:8px}'
    + '#cmRoot .cm-prompt{flex:none;height:34px;line-height:34px;color:#8fb0ff;font-weight:800}'
    + '#cmRoot .cm-input{flex:1;min-width:0;height:34px;max-height:110px;padding:7px 10px;border:none;border-radius:10px;resize:none;'
    +   'background:rgba(255,255,255,.08);color:#e8e8ea;font:inherit;font-size:16px;line-height:20px;outline:none;box-sizing:border-box}'
    + '#cmRoot .cm-input::placeholder{color:#5a5a60}'
    + '#cmRoot .cm-input:focus{background:rgba(255,255,255,.11)}'
    + '#cmRoot .cm-hbtn{flex:none;width:30px;height:34px;padding:0;border:none;border-radius:10px;background:rgba(255,255,255,.08);color:#c9d6f5;'
    +   'font:inherit;font-size:14px;cursor:pointer;-webkit-tap-highlight-color:transparent}'
    + '#cmRoot .cm-hbtn:active{background:rgba(255,255,255,.22)}'
    + '#cmRoot .cm-run{flex:none;height:34px;padding:0 14px;border:none;border-radius:10px;background:rgba(143,176,255,.65);color:#fff;'
    +   'font:inherit;font-size:13px;font-weight:700;cursor:pointer;-webkit-tap-highlight-color:transparent}'
    + '#cmRoot .cm-run:active{background:rgba(143,176,255,.9)}';

  var root, card, out, input, sugEl, built = false, openState = false;
  var MAX_LINES = 600;
  var hist = [], hIdx = 0, draft = '';
  try { hist = JSON.parse(lsGet('cmd_hist') || '[]') || []; } catch (_) { hist = []; }
  hIdx = hist.length;

  function build() {
    if (built) return;
    built = true;
    var st = document.createElement('style');
    st.id = 'cmdConsoleStyle';
    st.textContent = CSS;
    document.head.appendChild(st);

    root = document.createElement('div');
    root.id = 'cmRoot';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML =
      '<div class="cm-mask"></div>' +
      '<div class="cm-card" role="dialog" aria-label="命令窗口">' +
        '<div class="cm-head">' +
          '<div class="cm-title">命令窗口</div><div class="cm-spacer"></div>' +
          '<button type="button" class="cm-btn" data-act="copy">复制</button>' +
          '<button type="button" class="cm-btn" data-act="clear">清空</button>' +
          '<button type="button" class="cm-btn" data-act="close" aria-label="关闭">✕</button>' +
        '</div>' +
        '<div class="cm-out" id="cmOut"></div>' +
        '<div class="cm-sug" id="cmSug"></div>' +
        '<div class="cm-bar">' +
          '<span class="cm-prompt">&gt;</span>' +
          '<textarea class="cm-input" id="cmInput" rows="1" placeholder="/help 或 JavaScript" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="send"></textarea>' +
          '<button type="button" class="cm-hbtn" data-act="hup" aria-label="上一条历史">↑</button>' +
          '<button type="button" class="cm-hbtn" data-act="hdown" aria-label="下一条历史">↓</button>' +
          '<button type="button" class="cm-run" data-act="run">执行</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(root);
    card = root.querySelector('.cm-card');
    out = root.querySelector('#cmOut');
    input = root.querySelector('#cmInput');
    sugEl = root.querySelector('#cmSug');

    root.querySelector('.cm-mask').addEventListener('click', close);
    // 点按钮时不要让输入框失焦（手机上键盘会收起）
    root.addEventListener('mousedown', function (e) { if (e.target.closest && e.target.closest('button')) e.preventDefault(); });
    root.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'close') close();
      else if (act === 'clear') clearOut();
      else if (act === 'copy') copyOut();
      else if (act === 'run') { submit(); input.focus(); }
      else if (act === 'hup') { histMove(-1); input.focus(); }
      else if (act === 'hdown') { histMove(1); input.focus(); }
    });
    sugEl.addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('.cm-chip');
      if (!c) return;
      if (c.dataset.run) { input.value = ''; autosize(); exec(c.dataset.run); }
      else { input.value = c.dataset.fill; autosize(); }
      updateSug();
      input.focus();
    });

    input.addEventListener('input', function () { autosize(); updateSug(); });
    input.addEventListener('keydown', function (e) {
      if (e.isComposing || e.keyCode === 229) return;          // 输入法选字时的回车不执行
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return; }
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') { e.preventDefault(); tabComplete(); return; }
      if (e.key === 'ArrowUp' && input.value.indexOf('\n') < 0) { e.preventDefault(); histMove(-1); return; }
      if (e.key === 'ArrowDown' && input.value.indexOf('\n') < 0) { e.preventDefault(); histMove(1); return; }
    });

    // 软键盘：只补上「真的被键盘挡住」的那一截。
    // 旧算法用 innerHeight - visualViewport 直接抬 bottom，iOS 上会和系统自己的上移叠在一起，
    // 面板底边离键盘空出一条，舞台从遮罩里露出来。
    var vv = window.visualViewport;
    function fitKb() {
      if (!card || !root) return;
      if (!vv) { card.style.bottom = '0px'; root.classList.remove('kb'); return; }
      var cur = parseFloat(card.style.bottom) || 0;
      var hidden = card.getBoundingClientRect().bottom + cur - vv.height;
      if (hidden < 1) hidden = 0;
      card.style.bottom = (hidden ? Math.round(hidden) : 0) + 'px';
      root.classList.toggle('kb', hidden > 1);
    }
    if (vv) { vv.addEventListener('resize', fitKb); vv.addEventListener('scroll', fitKb); }
    input.addEventListener('focus', fitKb);
    input.addEventListener('blur', function () { setTimeout(fitKb, 80); });

    print('命令窗口 · 输入 /help 查看命令', 'info');
    print('不带 / 的内容当 JavaScript 执行，支持 await，$_ 是上一次的结果', 'info');
    updateSug();
  }

  function autosize() {
    input.style.height = '34px';
    input.style.height = Math.min(110, Math.max(34, input.scrollHeight)) + 'px';
  }

  /* ---------- 输出 ---------- */
  function lineEl(kind) {
    var d = document.createElement('div');
    d.className = 'cm-ln cm-' + kind;
    return d;
  }
  function addLine(d) {
    var near = out.scrollHeight - out.scrollTop - out.clientHeight < 60;
    out.appendChild(d);
    while (out.childElementCount > MAX_LINES) out.removeChild(out.firstElementChild);
    if (near || d.classList.contains('cm-in')) out.scrollTop = out.scrollHeight;
  }
  function print(text, kind) {
    if (!built) build();
    var d = lineEl(kind === 'out' || !kind ? 'out-k' : kind);
    d.textContent = String(text);
    addLine(d);
  }
  function printDots(colors, text) {
    if (!built) build();
    var d = lineEl('out-k');
    var dots = document.createElement('span');
    dots.className = 'cm-dots';
    colors.forEach(function (c) { var i = document.createElement('i'); i.style.background = c; dots.appendChild(i); });
    d.appendChild(dots);
    d.appendChild(document.createTextNode(text));
    addLine(d);
  }
  function clearOut() { out.innerHTML = ''; }
  function copyOut() {
    var text = Array.prototype.map.call(out.children, function (n) { return n.textContent; }).join('\n');
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;left:-999px;top:0;';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove();
      print(ok ? '已复制 ' + out.childElementCount + ' 行' : '复制失败，请长按输出区手动选择', ok ? 'ok' : 'err');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { print('已复制 ' + out.childElementCount + ' 行', 'ok'); }, fallback);
    } else fallback();
  }

  /* ---------- 历史 / 补全 ---------- */
  function pushHist(line) {
    if (line.length > 500) return;
    if (hist[hist.length - 1] !== line) hist.push(line);
    if (hist.length > 60) hist = hist.slice(-60);
    hIdx = hist.length;
    lsSet('cmd_hist', JSON.stringify(hist));
  }
  function histMove(dir) {
    if (!hist.length) return;
    if (hIdx === hist.length) draft = input.value;
    hIdx = Math.max(0, Math.min(hist.length, hIdx + dir));
    input.value = hIdx === hist.length ? draft : hist[hIdx];
    autosize(); updateSug();
    var n = input.value.length; try { input.setSelectionRange(n, n); } catch (_) {}
  }
  var QUICK = ['help', 'state', 'play', 'pause', 'next', 'style', 'theme', 'fps', 'log', 'clear'];
  function cmdNames() { return Object.keys(cmds).sort(); }
  function suggestions() {
    var v = input.value, list = [];
    if (!v) {
      QUICK.forEach(function (n) { if (cmds[n]) list.push({ text: '/' + n, run: cmds[n].tapRun ? '/' + n : '', fill: '/' + n + ' ' }); });
      return list;
    }
    var m = /^([\s\S]*?)(\S*)$/.exec(v), head = m[1], last = m[2];
    if (v.charAt(0) !== '/') return list;
    if (!head) {                                                    // 正在输入命令名
      var q = last.slice(1).toLowerCase();
      cmdNames().forEach(function (n) { if (n.indexOf(q) === 0 && n !== q) list.push({ text: '/' + n, fill: '/' + n + ' ' }); });
      return list.slice(0, 12);
    }
    var tk = tokenize(head.replace(/^\//, ''));
    var name = (tk.shift() || '').toLowerCase();
    var def = cmds[alias[name] || name];
    if (def && def.complete) {
      var lq = last.toLowerCase();
      (def.complete(tk) || []).forEach(function (c) { if (String(c).toLowerCase().indexOf(lq) === 0 && String(c) !== last) list.push({ text: String(c), fill: head + c + ' ' }); });
    }
    return list.slice(0, 14);
  }
  function updateSug() {
    if (!sugEl) return;
    var list = suggestions(), html = '';
    list.forEach(function (s) {
      html += '<button type="button" class="cm-chip" data-fill="' + esc(s.fill) + '"' + (s.run ? ' data-run="' + esc(s.run) + '"' : '') + '>' + esc(s.text) + '</button>';
    });
    sugEl.innerHTML = html;
  }
  function tabComplete() {
    var list = suggestions();
    if (list.length) { input.value = list[0].fill; autosize(); updateSug(); }
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  /* ============================== 执行 ============================== */
  function submit() {
    var v = input.value;
    if (!v.trim()) return;
    input.value = ''; autosize(); updateSug();
    exec(v);
  }
  var busy = Promise.resolve();
  function exec(line) {
    busy = busy.then(function () { return execNow(line); });   // 串行：先输入的先跑完
    return busy;
  }
  async function execNow(line) {
    line = line.replace(/^\s+|\s+$/g, '');
    if (!line) return;
    pushHist(line);
    print('> ' + line, 'in');
    try {
      if (line.charAt(0) === '/' && !/^\/[\/*]/.test(line)) await runCmd(line);
      else await runJS(line);
    } catch (e) {
      print(errText(e), 'err');
    }
  }
  function errText(e) {
    if (e instanceof Error) return e.name + ': ' + e.message;
    return '抛出：' + fmt(e);
  }

  async function runCmd(line) {
    var tk = tokenize(line.slice(1));
    var name = (tk.shift() || '').toLowerCase();
    if (!name) { print('输入 /help 查看命令', 'info'); return; }
    name = alias[name] || name;
    var def = cmds[name];
    if (!def) {
      var near = cmdNames().filter(function (n) { return n.indexOf(name) === 0; });
      print('未知命令 /' + name + (near.length ? '，是不是想输入：' + near.map(function (n) { return '/' + n; }).join(' ') : '，输入 /help 查看全部'), 'err');
      return;
    }
    var r = def.run(tk, { print: print, printDots: printDots, raw: line });
    if (r && typeof r.then === 'function') r = await r;
    if (r !== undefined) print(fmtTop(r), 'out');
  }

  /* 执行 JS：先当表达式，其次当语句；有 await 时包进 async 函数。
     用 new Function 只做“语法检查”，所以代码不会被执行两次。 */
  function canParse(body) { try { new Function(body); return true; } catch (_) { return false; } }
  function evalJS(src) {
    var G = eval;                                                   // 间接 eval：在全局作用域运行
    if (canParse('return (' + src + '\n)')) return G('(' + src + '\n)');
    if (canParse('return (async function(){return (' + src + '\n)})')) return G('(async function(){return (' + src + '\n)})()');
    var st = src.replace(/^(\s*)(?:let|const)\s+/gm, '$1var ');     // 顶层 let/const 改成 var，变量才能留在全局
    if (canParse(st)) return G(st);
    if (canParse('return (async function(){' + st + '\n})')) return G('(async function(){' + st + '\n})()');
    return G(st);                                                   // 语法不通过，eval 会在执行前抛出原生的 SyntaxError
  }
  function hookConsole() {
    var names = ['log', 'info', 'warn', 'error', 'debug'], saved = {};
    names.forEach(function (k) {
      var o = console[k];
      if (typeof o !== 'function') return;
      saved[k] = o;
      try {
        console[k] = function () {
          var a = Array.prototype.slice.call(arguments);
          try { print(a.map(function (x) { return typeof x === 'string' ? x : fmt(x); }).join(' '), k === 'error' ? 'err' : k === 'warn' ? 'warn' : 'log'); } catch (_) {}
          return o.apply(console, arguments);
        };
      } catch (_) {}
    });
    return function () { names.forEach(function (k) { if (saved[k]) { try { console[k] = saved[k]; } catch (_) {} } }); };
  }
  async function runJS(src) {
    var restore = hookConsole();
    try {
      var r = evalJS(src);
      if (r && typeof r.then === 'function') r = await r;
      window.$_ = r;
      print(r === undefined ? 'undefined' : fmtTop(r), r === undefined ? 'info' : 'out');
    } finally { restore(); }
  }

  /* ============================== 内置命令 ============================== */
  var GROUPS = ['播放', '外观', '开发者', '存储', '其他'];

  register('help', {
    group: '其他', desc: '列出命令，或查看某个命令的用法', usage: '/help [命令]', tapRun: true, alias: ['h', '?'],
    complete: function () { return cmdNames(); },
    run: function (a, c) {
      if (a[0]) {
        var n = a[0].replace(/^\//, '').toLowerCase(); n = alias[n] || n;
        var d = cmds[n];
        if (!d) return c.print('没有 /' + n, 'err');
        return c.print((d.usage || '/' + n) + '\n' + (d.desc || '') + (d.alias && d.alias.length ? '\n别名：' + d.alias.map(function (x) { return '/' + x; }).join(' ') : ''), 'out');
      }
      GROUPS.forEach(function (gp) {
        var rows = cmdNames().filter(function (k) { return (cmds[k].group || '其他') === gp; });
        if (!rows.length) return;
        c.print('— ' + gp, 'info');
        c.print(rows.map(function (k) { return '/' + k + '  ' + (cmds[k].desc || ''); }).join('\n'), 'out');
      });
      c.print('其它输入当 JavaScript 执行；/help 命令名 看详细用法', 'info');
    }
  });

  register('clear', { group: '其他', desc: '清空输出', alias: ['cls'], tapRun: true, run: function () { clearOut(); } });
  register('exit', { group: '其他', desc: '关闭命令窗口', alias: ['quit'], run: function () { close(); } });
  register('reload', { group: '其他', desc: '普通刷新页面（不清缓存；清缓存用设置里的“强制刷新”）', run: function () { location.reload(); } });
  register('copy', { group: '其他', desc: '复制全部输出', run: function () { copyOut(); } });
  register('history', {
    group: '其他', desc: '查看输入历史；/history clear 清空', usage: '/history [clear]',
    complete: function () { return ['clear']; },
    run: function (a, c) {
      if (a[0] === 'clear') { hist = []; hIdx = 0; lsSet('cmd_hist', '[]'); return c.print('历史已清空', 'ok'); }
      if (!hist.length) return c.print('还没有历史', 'info');
      c.print(hist.slice(-20).map(function (h, i, arr) { return (hist.length - arr.length + i + 1) + '  ' + h.replace(/\n/g, ' ⏎ '); }).join('\n'), 'out');
    }
  });

  /* ---- 播放 ---- */
  function ppBtn() { return document.querySelector('.ppb'); }
  function nxBtn() { return document.querySelector('.nxb'); }
  register('state', {
    group: '播放', desc: '当前播放 / 风格 / 主题 / 速度等状态', tapRun: true,
    run: function () {
      var STYALL = [].concat(g('STY') || [], g('STY2') || [], g('STY3') || [], g('STY4') || []);
      var sk = g('style'), sl = '';
      STYALL.forEach(function (p) { if (p[0] === sk) sl = p[1]; });
      var th = g('THEMES'), ti = g('theme'), tn = th && th[ti] ? th[ti][0] : '?';
      var LN = g('LN');
      return [
        '歌词句数  ' + (LN && LN.length != null ? LN.length : '?'),
        '当前句    ' + g('idx') + '    进度 ' + (typeof g('prog') === 'number' ? Math.round(g('prog') * 1000) / 1000 : g('prog')),
        '播放中    ' + g('playing'),
        '文字风格  ' + sk + (sl ? '（' + sl + '）' : ''),
        '主题      ' + ti + '（' + tn + '）',
        '背景模式  ' + g('bgMode'),
        '界面速度  ' + g('UISPD') + '×    动效速度 ' + g('ASPD') + '×',
        '性能优化  ' + document.body.classList.contains('performance-mode'),
        '屏幕      ' + innerWidth + '×' + innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x'
      ].join('\n');
    }
  });
  function lineNo() {
    var i = g('idx'), n = (g('LN') || []).length;
    return '第 ' + ((+i || 0) + 1) + (n ? ' / ' + n : '') + ' 句';
  }
  /* 播放 / 暂停：直接调 setPlay，不再去点页面上第一颗 .ppb（那颗在隐藏的播放页里） */
  function setPlaying(v) {
    var fn = g('setPlay');
    if (typeof fn === 'function') { fn(!!v); return; }
    var b = ppBtn();
    if (!b) throw new Error('找不到 setPlay，也找不到播放按钮');
    if (!!g('playing') !== !!v) b.click();
  }
  register('play', {
    group: '播放', desc: '开始播放（已在播放则不动）', tapRun: true,
    run: function () { if (!g('playing')) setPlaying(true); return '播放中：' + g('playing'); }
  });
  register('pause', {
    group: '播放', desc: '暂停', tapRun: true,
    run: function () { if (g('playing')) setPlaying(false); return '播放中：' + g('playing'); }
  });
  register('toggle', {
    group: '播放', desc: '播放 / 暂停切换', alias: ['pp'],
    run: function () { setPlaying(!g('playing')); return '播放中：' + g('playing'); }
  });
  register('next', {
    group: '播放', desc: '下一句（可连续 n 次）。音乐模式且歌单多于一首时，和底栏按钮一样切下一首', usage: '/next [n]', tapRun: true,
    run: function (a) {
      var n = Math.max(1, Math.min(100, parseInt(a[0], 10) || 1));
      var go = g('goNext');
      if (typeof go === 'function') { for (var i = 0; i < n; i++) go(); }
      else {
        var b = nxBtn(); if (!b) throw new Error('找不到 goNext，也找不到下一句按钮');
        for (var j = 0; j < n; j++) b.click();
      }
      return '已下一句 ×' + n + '，' + lineNo();
    }
  });
  register('prev', {
    group: '播放', desc: '上一句（到第一句再往前会回到最后一句）', tapRun: true,
    run: function () {
      var r = callBound('prev', []);
      if (r) return '已调用 ' + r.name + '()，' + lineNo();
      var go = g('gotoIdx');
      if (typeof go !== 'function') return unbound('prev');
      var LN = g('LN') || [];
      if (!LN.length) throw new Error('没有歌词');
      var i = (+g('idx') || 0) - 1;
      if (i < 0) i = LN.length - 1;
      go(i, false);
      return '上一句，' + lineNo();
    }
  });
  register('goto', {
    group: '播放', desc: '跳到第 n 句（从 1 数起），并按歌词时间对齐音频', usage: '/goto <n>',
    run: function (a) {
      var n = parseInt(a[0], 10);
      if (!(n >= 1)) throw new Error('用法：/goto <第几句，从 1 开始>');
      var r = callBound('goto', [n - 1]);
      if (r) return '已调用 ' + r.name + '(' + (n - 1) + ')，' + lineNo();
      var go = g('gotoIdx');
      if (typeof go !== 'function') return unbound('goto');
      var LN = g('LN') || [];
      if (LN.length && n > LN.length) throw new Error('只有 ' + LN.length + ' 句');
      go(n - 1, false);
      return '已跳到' + lineNo();
    }
  });

  /* 找不到可绑定函数时，列出名字里带关键词的全局函数，方便用 /bind 绑定 */
  var HINT = { goto: /goto|jump|seek|go[A-Z_]|line|sent|idx|show/i, prev: /prev|back|last/i, style: /style|fx|anim/i, theme: /theme|palette|color/i };
  function unbound(what) {
    var cand = appGlobals(true).filter(function (k) { return HINT[what].test(k); }).slice(0, 30);
    return '还没绑定「' + BINDABLE[what] + '」的函数。\n'
      + (cand.length ? '名字相近的全局函数：' + cand.join('  ') + '\n' : '')
      + '绑定：/bind ' + what + ' 函数名      （/fn 关键字 可继续搜索）';
  }
  register('bind', {
    group: '播放', desc: '用别的全局函数替换 /goto /prev /style /theme 的默认行为', usage: '/bind [项目 函数名]  |  /bind -d 项目',
    complete: function (tk) { return tk.length ? appGlobals(true) : Object.keys(BINDABLE).concat(['-d']); },
    run: function (a, c) {
      if (!a.length) {
        return Object.keys(BINDABLE).map(function (k) { return k.padEnd(6) + (binds[k] ? binds[k] + '()  （已替换默认）' : '（默认）') + '   ' + BINDABLE[k]; }).join('\n');
      }
      if (a[0] === '-d') { if (!BINDABLE[a[1]]) throw new Error('项目：' + Object.keys(BINDABLE).join(' / ')); delete binds[a[1]]; lsSet('cmd_bind', JSON.stringify(binds)); return '已解除 ' + a[1]; }
      if (!BINDABLE[a[0]]) throw new Error('项目：' + Object.keys(BINDABLE).join(' / '));
      if (typeof window[a[1]] !== 'function') throw new Error('全局里没有函数 ' + a[1] + '，用 /fn 搜一下');
      binds[a[0]] = a[1]; lsSet('cmd_bind', JSON.stringify(binds));
      return a[0] + ' → ' + a[1] + '()';
    }
  });

  /* ---- 外观 ---- */
  function allStyles() { return [].concat(g('STY') || [], g('STY2') || [], g('STY3') || [], g('STY4') || []); }
  register('style', {
    group: '外观', desc: '查看 / 切换文字动画风格（key 或中文名）', usage: '/style [key|名称]', tapRun: false,
    complete: function () { return allStyles().map(function (p) { return p[1]; }); },
    run: function (a, c) {
      var list = allStyles(), cur = g('style');
      if (!list.length) throw new Error('没读到 STY 风格列表');
      if (!a.length) return list.map(function (p) { return (p[0] === cur ? '● ' : '  ') + p[0].padEnd(8) + p[1]; }).join('\n');
      var q = a.join(' ').toLowerCase(), hit = null;
      list.forEach(function (p) { if (!hit && (p[0].toLowerCase() === q || p[1].toLowerCase() === q)) hit = p; });
      list.forEach(function (p) { if (!hit && (p[0].toLowerCase().indexOf(q) >= 0 || p[1].toLowerCase().indexOf(q) >= 0)) hit = p; });
      if (!hit) throw new Error('没有叫「' + q + '」的风格，/style 看列表');
      var r = callBound('style', [hit[0]]);
      if (r) return '已调用 ' + r.name + '("' + hit[0] + '") → ' + hit[1];
      /* 不走 setStyle：那个会把句子重置到第 1 句。这里只换风格并重绘当前句。 */
      window.style = hit[0];
      var mark = g('markStyles'); if (typeof mark === 'function') mark();
      var req = g('reqRender');
      if (typeof req === 'function') req();
      else { var up = g('update'); if (typeof up === 'function') up(); }
      return '风格已切到 ' + hit[0] + '（' + hit[1] + '），当前句已重绘';
    }
  });
  register('theme', {
    group: '外观', desc: '查看 / 切换主题（序号或名称）', usage: '/theme [序号|名称]',
    complete: function () { return (g('THEMES') || []).map(function (t) { return t[0]; }); },
    run: function (a, c) {
      var th = g('THEMES') || [], cur = g('theme');
      if (!th.length) throw new Error('没读到 THEMES');
      if (!a.length) { th.forEach(function (t, i) { c.printDots(t[1], (i === cur ? '● ' : '') + i + '  ' + t[0]); }); return; }
      var q = a.join(' '), idx = -1;
      if (/^\d+$/.test(q) && +q < th.length) idx = +q;
      else th.forEach(function (t, i) { if (idx < 0 && t[0] === q) idx = i; });
      th.forEach(function (t, i) { if (idx < 0 && t[0].indexOf(q) >= 0) idx = i; });
      if (idx < 0) throw new Error('没有这个主题，/theme 看列表');
      var r = callBound('theme', [idx]);
      if (r) return '已调用 ' + r.name + '(' + idx + ') → ' + th[idx][0];
      window.theme = idx;
      var preset = g('applyPreset'); if (typeof preset === 'function') preset(idx);
      var box = $id('themes');
      if (box) Array.prototype.forEach.call(box.children, function (c, i) { c.classList.toggle('on', i === idx); });
      var bg = g('reqBg');
      if (typeof bg === 'function') bg(true);
      else { var apply = g('applyBg'); if (typeof apply === 'function') apply(); }
      return '主题已换为 ' + idx + '（' + th[idx][0] + '）';
    }
  });
  register('uispd', {
    group: '外观', desc: '界面动画速度（0.25–3，和设置里的滑块同步）', usage: '/uispd [倍率]',
    run: function (a) {
      if (!a.length) return '界面速度 ' + g('UISPD') + '×';
      var x = parseFloat(a[0]);
      if (!(x > 0)) throw new Error('用法：/uispd 1.5');
      if (typeof g('setUiSpdPct') !== 'function') throw new Error('找不到 setUiSpdPct');
      g('setUiSpdPct')(x * 100);
      return '界面速度 ' + g('UISPD') + '×';
    }
  });

  /* ---- 开发者 ---- */
  var DEV = {
    perf: ['performanceMode', '性能优化'], jank: ['devJank', '卡顿检测'], fps: ['devFps', '实时帧率显示'],
    floatlog: ['devFloatLogChk', '悬浮窗日志'], pauselog: ['devPauseLogChk', '暂停抓取日志']
  };
  function setSwitch(el, val) { el.checked = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
  register('dev', {
    group: '开发者', desc: '开发者选项开关：perf jank fps floatlog pauselog', usage: '/dev [项目] [on|off]（省略 on/off 为切换）',
    complete: function (tk) { return tk.length ? ['on', 'off'] : Object.keys(DEV); },
    run: function (a) {
      if (!a.length) {
        return Object.keys(DEV).map(function (k) { var el = $id(DEV[k][0]); return k.padEnd(9) + (el ? (el.checked ? '开' : '关') : '（设置页还没生成）') + '   ' + DEV[k][1]; }).join('\n');
      }
      var d = DEV[a[0].toLowerCase()];
      if (!d) throw new Error('项目：' + Object.keys(DEV).join(' / '));
      var el = $id(d[0]);
      if (!el) throw new Error('找不到 #' + d[0] + '，先打开一次设置页');
      var v = a[1] === 'on' || a[1] === '1' ? true : a[1] === 'off' || a[1] === '0' ? false : !el.checked;
      setSwitch(el, v);
      return d[1] + '：' + (el.checked ? '开' : '关');
    }
  });
  register('fps', {
    group: '开发者', desc: '帧率悬浮窗：on / off / 采样间隔毫秒（50–2000）', usage: '/fps [on|off|毫秒]', tapRun: false,
    complete: function () { return ['on', 'off', '100', '500', '1000']; },
    run: function (a) {
      var sw = $id('devFps');
      if (!a.length) return '帧率悬浮窗：' + (sw ? (sw.checked ? '开' : '关') : '（设置页还没生成）') + '，采样间隔 ' + (lsGet('dev_fps_interval') || 500) + 'ms';
      if (!sw) throw new Error('找不到 #devFps，先打开一次设置页');
      if (a[0] === 'on' || a[0] === 'off') { setSwitch(sw, a[0] === 'on'); return '帧率悬浮窗：' + (sw.checked ? '开' : '关'); }
      var ms = parseInt(a[0], 10);
      if (!(ms >= 50 && ms <= 2000)) throw new Error('用法：/fps on | off | 50–2000 的毫秒数');
      var sl = document.querySelector('#fpsIndicator .fpsSlider');
      if (!sl) throw new Error('找不到采样间隔滑块');
      if (!sw.checked) setSwitch(sw, true);
      sl.value = ms; sl.dispatchEvent(new Event('input', { bubbles: true }));
      return '采样间隔 ' + sl.value + 'ms';
    }
  });
  register('log', {
    group: '开发者', desc: '看最近的系统日志（SysLog）', usage: '/log [条数=20] [trace|debug|info|warn|error|fatal]',
    complete: function (tk) { return tk.length ? ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] : ['20', '50']; },
    run: function (a, c) {
      if (!window.SysLog) throw new Error('SysLog 没加载');
      var n = 20, lv = '';
      a.forEach(function (x) { if (/^\d+$/.test(x)) n = +x; else lv = x.toLowerCase(); });
      var RANK = { trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5 };
      var rows = SysLog.entries().filter(function (e) { return !lv || RANK[e.level] >= RANK[lv]; }).slice(-n);
      if (!rows.length) return c.print('没有日志', 'info');
      function p2(x, l) { x = String(x); while (x.length < (l || 2)) x = '0' + x; return x; }
      rows.forEach(function (e) {
        var d = new Date(e.t);
        var t = p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds()) + '.' + p2(d.getMilliseconds(), 3);
        var kind = e.level === 'error' || e.level === 'fatal' ? 'err' : e.level === 'warn' ? 'warn' : e.level === 'info' ? 'ok' : 'info';
        c.print(t + ' ' + e.level.toUpperCase().padEnd(5) + ' [' + e.ns + '] ' + e.msg + (e.data !== undefined ? ' ' + fmt(e.data, 1) : ''), kind);
      });
    }
  });
  register('syslog', { group: '开发者', desc: '打开系统日志面板', run: function () { if (!window.__openSysLog) throw new Error('SysLog 没加载'); window.__openSysLog(); } });
  register('logpanel', { group: '开发者', desc: '打开全屏日志面板', run: function () { if (!window.__openLogPanel) throw new Error('日志面板没加载'); window.__openLogPanel(); } });
  register('perf', {
    group: '开发者', desc: '采样 1 秒帧率，并显示内存 / DOM 节点数',
    run: function (a, c) {
      c.print('采样 1 秒…', 'info');
      return new Promise(function (res) {
        var n = 0, t0 = 0;
        requestAnimationFrame(function f(t) {
          if (!t0) t0 = t; else n++;
          if (t - t0 < 1000) return requestAnimationFrame(f);
          var m = performance.memory;
          res('FPS ≈ ' + Math.round(n * 1000 / (t - t0))
            + (m ? '\n堆内存 ' + Math.round(m.usedJSHeapSize / 1048576) + ' / ' + Math.round(m.jsHeapSizeLimit / 1048576) + ' MB' : '')
            + '\nDOM 节点 ' + document.getElementsByTagName('*').length);
        });
      });
    }
  });

  /* 页面里 app 自己定义的全局：跟一个空 iframe 的全局对比，剩下的就是 app 的 */
  var baseNames = null;
  function appGlobals(onlyFn) {
    if (!baseNames) {
      baseNames = {};
      try {
        var f = document.createElement('iframe');
        f.style.display = 'none';
        document.body.appendChild(f);
        Object.getOwnPropertyNames(f.contentWindow).forEach(function (k) { baseNames[k] = 1; });
        f.remove();
      } catch (_) {}
    }
    var res = [];
    Object.getOwnPropertyNames(window).forEach(function (k) {
      if (baseNames[k] || k.indexOf('__') === 0 || /^(CmdConsole|SysLog|\$_)$/.test(k)) return;
      var desc = Object.getOwnPropertyDescriptor(window, k);
      if (!desc || !('value' in desc)) return;                      // 跳过 getter，避免触发副作用
      var isFn = typeof desc.value === 'function';
      if (onlyFn ? isFn : !isFn) res.push(k);
    });
    return res.sort();
  }
  register('fn', {
    group: '开发者', desc: '列出 app 定义的全局函数，可按关键字过滤', usage: '/fn [关键字]',
    run: function (a) {
      var kw = (a[0] || '').toLowerCase();
      var list = appGlobals(true).filter(function (k) { return !kw || k.toLowerCase().indexOf(kw) >= 0; });
      return list.length ? list.length + ' 个\n' + list.join('  ') : '没有匹配的函数';
    }
  });
  register('vars', {
    group: '开发者', desc: '列出 app 定义的全局变量和当前值，可按关键字过滤', usage: '/vars [关键字]',
    run: function (a) {
      var kw = (a[0] || '').toLowerCase();
      var list = appGlobals(false).filter(function (k) { return !kw || k.toLowerCase().indexOf(kw) >= 0; });
      if (!list.length) return '没有匹配的变量';
      return list.length + ' 个\n' + list.map(function (k) { var v; try { v = preview(window[k]); } catch (_) { v = '?'; } return k + ' = ' + v; }).join('\n');
    }
  });
  register('q', {
    group: '开发者', desc: '按 CSS 选择器查元素：数量、位置、尺寸', usage: '/q <选择器>', alias: ['dom'],
    run: function (a, c) {
      var sel = a.join(' ');
      if (!sel) throw new Error('用法：/q #stage');
      var list = document.querySelectorAll(sel);
      c.print('匹配 ' + list.length + ' 个', 'info');
      Array.prototype.slice.call(list, 0, 8).forEach(function (el) {
        var r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        c.print(elTag(el) + '  ' + Math.round(r.width) + '×' + Math.round(r.height) + ' @' + Math.round(r.left) + ',' + Math.round(r.top)
          + '  display:' + cs.display + (cs.visibility !== 'visible' ? ' visibility:' + cs.visibility : '') + (cs.opacity !== '1' ? ' opacity:' + cs.opacity : ''), 'out');
      });
      if (list.length > 8) c.print('…还有 ' + (list.length - 8) + ' 个', 'info');
    }
  });

  /* ---- 存储 ---- */
  function lsKeys() { var ks = []; try { for (var i = 0; i < localStorage.length; i++) ks.push(localStorage.key(i)); } catch (_) {} return ks.sort(); }
  function kb(n) { return n >= 1024 ? (n / 1024).toFixed(1) + 'KB' : n + 'B'; }
  register('ls', {
    group: '存储', desc: '列出 localStorage 的 key 和大小，可按关键字过滤', usage: '/ls [关键字]',
    run: function (a) {
      var kw = (a[0] || '').toLowerCase(), total = 0;
      var rows = lsKeys().filter(function (k) { return !kw || k.toLowerCase().indexOf(kw) >= 0; }).map(function (k) {
        var n = (lsGet(k) || '').length; total += n; return k + '  ' + kb(n);
      });
      return rows.length ? rows.length + ' 项，共 ' + kb(total) + '\n' + rows.join('\n') : '没有匹配的 key';
    }
  });
  register('get', {
    group: '存储', desc: '读取一个 localStorage 值（超长只显示开头）', usage: '/get <key>',
    complete: function (tk) { return tk.length ? [] : lsKeys(); },
    run: function (a) {
      if (!a[0]) throw new Error('用法：/get <key>');
      var v = lsGet(a[0]);
      if (v === null) return '（不存在）';
      return (v.length > 1500 ? v.slice(0, 1500) + '\n…共 ' + kb(v.length) : v);
    }
  });
  register('set', {
    group: '存储', desc: '写入 localStorage（值里可以有空格）', usage: '/set <key> <值>',
    complete: function (tk) { return tk.length ? [] : lsKeys(); },
    run: function (a) {
      if (!a[0] || a.length < 2) throw new Error('用法：/set <key> <值>');
      var v = a.slice(1).join(' ');
      lsSet(a[0], v);
      return a[0] + ' = ' + short(v, 80) + '（刷新后生效的设置需要 /reload）';
    }
  });
  register('rm', {
    group: '存储', desc: '删除一个 localStorage key', usage: '/rm <key>',
    complete: function (tk) { return tk.length ? [] : lsKeys(); },
    run: function (a) {
      if (!a[0]) throw new Error('用法：/rm <key>');
      if (lsGet(a[0]) === null) return '（不存在）';
      try { localStorage.removeItem(a[0]); } catch (_) {}
      return '已删除 ' + a[0];
    }
  });

  /* ============================== 打开 / 关闭 ============================== */
  function open() {
    if (openState) { if (input) input.focus(); return; }
    openState = true;
    build();
    root.classList.add('show');
    root.setAttribute('aria-hidden', 'false');
    out.scrollTop = out.scrollHeight;
    try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
  }
  function close() {
    if (!openState) return;
    openState = false;
    if (input) input.blur();
    if (card) card.style.bottom = '0px';
    if (root) root.classList.remove('kb');
    root.classList.remove('show');
    root.setAttribute('aria-hidden', 'true');
  }
  function toggle() { openState ? close() : open(); }

  window.CmdConsole = { open: open, close: close, toggle: toggle, register: register, run: exec, print: print, fmt: fmt, commands: function () { return cmdNames(); } };
  window.__openCmdConsole = open;
  window.__closeCmdConsole = close;

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'K' || e.key === 'k')) { e.preventDefault(); toggle(); }
  });
})();

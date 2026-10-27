// app/mode-pref.js — 启动默认模式：音乐模式（默认）/ 文字模式 / 记住上次
// 开关放在底部「···」→「其他选项」里。靠「点一下模式按钮」来切换，所以原有的模式切换逻辑（动画、迷你播放器同步）完全照常运行。
(function(){
  'use strict';
  var PREF = 'ui_mode_pref', LAST = 'ui_mode_last';
  var $ = function(id){ return document.getElementById(id); };
  var touched = false;
  function get(k, d){ try{ return localStorage.getItem(k) || d; }catch(_){ return d; } }
  function set(k, v){ try{ localStorage.setItem(k, v); }catch(_){} }
  function cur(){ var b = $('btnModeMusic'), m = $('modeSlider'); return ((b && b.classList.contains('on')) || (m && m.classList.contains('is-music'))) ? 'music' : 'text'; }
  function want(){ var p = get(PREF, 'music'); return p === 'last' ? get(LAST, 'music') : p; }
  function apply(){
    if(touched) return true;
    var w = want();
    if(cur() === w) return true;
    var b = $(w === 'music' ? 'btnModeMusic' : 'btnModeText');
    if(b) b.click();
    return false;
  }

  ['btnModeMusic', 'btnModeText'].forEach(function(id){
    var b = $(id);
    if(b) b.addEventListener('click', function(e){ if(e.isTrusted) touched = true; setTimeout(function(){ set(LAST, cur()); }, 60); });
  });
  [0, 300, 900, 1800].forEach(function(t){ setTimeout(apply, t); });     // 其他脚本可能稍后才绑好按钮，多试几次

  // 设置界面：插进「其他选项」二级页
  var p2 = $('qpP2');
  if(p2 && !$('mpSeg')){
    var st = document.createElement('style');
    st.textContent =
      '.mp-seg{display:flex;gap:6px;margin-top:8px}' +
      '.mp-seg button{flex:1;height:34px;border:0;border-radius:12px;font:inherit;font-size:13px;font-weight:600;color:rgba(255,255,255,.72);background:rgba(255,255,255,.1);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .2s ease,color .2s ease,box-shadow .2s ease,transform .15s ease}' +
      '.mp-seg button:active{transform:scale(.96)}' +
      '.mp-seg button.on{color:#d6e3ff;background:rgba(143,176,255,.3);box-shadow:inset 0 0 0 1px rgba(143,176,255,.42)}';
    document.head.appendChild(st);
    var wrap = document.createElement('div');
    wrap.innerHTML = '<div class="qh" style="margin-top:14px"><b>启动时的模式</b></div>' +
      '<div class="mp-seg" id="mpSeg"><button type="button" data-v="music">音乐模式</button><button type="button" data-v="text">文字模式</button><button type="button" data-v="last">记住上次</button></div>';
    var anchor = p2.querySelector('.qg');
    while(wrap.firstChild) anchor ? p2.insertBefore(wrap.firstChild, anchor) : p2.appendChild(wrap.firstChild);
    var seg = $('mpSeg');
    function paint(){ var p = get(PREF, 'music'); Array.prototype.forEach.call(seg.children, function(b){ b.classList.toggle('on', b.getAttribute('data-v') === p); }); }
    seg.addEventListener('click', function(e){
      var b = e.target.closest && e.target.closest('button'); if(!b) return;
      set(PREF, b.getAttribute('data-v')); if(b.getAttribute('data-v') === 'last') set(LAST, cur()); paint();
    });
    paint();
  }
})();

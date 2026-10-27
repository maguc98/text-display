// app/ios-music.js — iOS 版：扫描 Documents/Music，自动配对同名 LRC，交给歌曲库入库
/* 设计要点
   1. 只在 iOS 原生壳里运行：靠 window.webkit.messageHandlers.yiuMusic 判断（TextDisplayApp.swift 里注册的 MusicBridge），
      浏览器 / PWA 里没有它，直接 return，不影响现有的「选择音频」流程。
   2. 歌曲库（song-library.js）存的是音频 Blob，所以这里通过桥分块读文件（每块 3MB，base64）拼成 Blob，
      交给 SongLibrary.importScanned，由它去重、提取封面、读时长、存进 IndexedDB。已经入库的（同名同大小）不会重复读取。
   3. LRC 由原生读成文本（依次尝试 UTF-8 / UTF-16 / GB18030），网页端去掉 BOM。
   4. 触发时机：启动时一次；App 从后台回到前台时（用户刚在「文件」App 里拖了歌进来）再扫一次；设置里的按钮；
      也可以手动调 window.__iosMusicRefresh()。
   依赖：song-library.js 要先加载（index.html 里本文件放在 boot.js 之后）。 */
(function(){
  'use strict';

  var H = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.yiuMusic;
  if(!H) return;
  function call(msg){ return H.postMessage(msg); }       // 带回复的消息：返回 Promise

  var CHUNK = window.__iosMusicChunk || 3 * 1024 * 1024;   // 每次向原生要多少字节
  var AUDIO_RE = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;  // 和 song-library.js 里的 MIME 表一致
  var running = false, lastDone = 0, btn = null, btnTxt = '', btnTimer = 0;

  function nfc(t){ try{ return String(t).normalize('NFC'); }catch(_){ return String(t); } }
  function baseKey(n){ return nfc(n.replace(/\.[^.]+$/, '')).toLowerCase(); }   // iOS 文件名可能是 NFD，统一成 NFC 再比

  function b64ToBytes(b64){
    var bin = atob(b64), n = bin.length, u = new Uint8Array(n);
    for(var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function readBlob(name){                                // 分块读，拼成 Blob
    var parts = [], offset = 0;
    function next(){
      return call({op: 'read', name: name, offset: offset, length: CHUNK}).then(function(r){
        var bytes = r.data ? b64ToBytes(r.data) : new Uint8Array(0);
        if(bytes.length) parts.push(bytes);
        offset += bytes.length;
        if(bytes.length === 0 || offset >= r.size) return new Blob(parts);
        return next();
      });
    }
    return next();
  }
  function readText(name){
    return call({op: 'text', name: name}).then(function(r){
      return String((r && r.text) || '').replace(/^\uFEFF/, '');
    });
  }

  function scan(){
    return call({op: 'list'}).then(function(r){
      var entries = ((r && r.files) || [])
        .filter(function(f){ return f && f.name && !f.dir && f.name.charAt(0) !== '.'; });
      var lrcMap = {};
      entries.forEach(function(f){ if(/\.lrc$/i.test(f.name)) lrcMap[baseKey(f.name)] = f.name; });
      return entries.filter(function(f){ return AUDIO_RE.test(f.name); }).map(function(f){
        var lrcName = lrcMap[baseKey(f.name)];
        var item = {name: f.name, size: typeof f.size === 'number' ? f.size : null, getBlob: function(){ return readBlob(f.name); }};
        if(lrcName) item.getLrc = function(){ return readText(lrcName); };
        return item;
      });
    });
  }

  /* ---------- 设置里的「刷新音乐目录」按钮 ---------- */
  function setBtn(txt){
    if(!btn) return;
    var span = btn.querySelector('span');
    if(span) span.textContent = txt;
  }
  function buildBtn(){
    var anchor = document.getElementById('btnPickLrc');
    if(!anchor || document.getElementById('btnIosRefresh')) return;
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'btnIosRefresh'; btn.className = anchor.className;
    btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4"/></svg> <span>刷新音乐目录</span>';
    btnTxt = '刷新音乐目录';
    btn.addEventListener('click', function(){ refresh({manual: true}); });
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }

  /* ---------- 刷新 ---------- */
  function refresh(opts){
    opts = opts || {};
    if(running) return Promise.resolve(null);
    if(!window.SongLibrary || !window.SongLibrary.importScanned) return Promise.resolve(null);
    running = true;
    clearTimeout(btnTimer);
    setBtn('扫描中…');
    return scan().then(function(items){
      return window.SongLibrary.importScanned(items, {
        all: !!opts.all,
        onProgress: function(i, n){ setBtn('导入中 ' + i + ' / ' + n); }
      }).then(function(stat){ stat.total = items.length; return stat; });
    }).then(function(stat){
      window.dispatchEvent(new CustomEvent('ios-music-ready', {detail: stat}));
      console.log('[ios-music] 扫描完成', stat);
      var msg = stat.total === 0 ? '目录里还没有歌' : (stat.added || stat.updated) ? ('新增 ' + stat.added + ' 首' + (stat.updated ? '，补歌词 ' + stat.updated + ' 首' : '')) : '没有新歌';
      if(stat.failed) msg += '（' + stat.failed + ' 首失败）';
      setBtn(msg);
      return stat;
    }).catch(function(e){
      console.warn('[ios-music] 扫描失败', e);
      setBtn('扫描失败');
      return null;
    }).then(function(stat){
      running = false; lastDone = Date.now();
      btnTimer = setTimeout(function(){ setBtn(btnTxt); }, 2500);
      return stat;
    });
  }

  window.__iosMusicRefresh = refresh;     // refresh({all:true}) 会忽略并清空「已删除的歌不再加回」记录

  buildBtn();
  refresh();
  // 回到前台时再扫一次：用户刚在「文件」App 里往 Music 文件夹里拖了歌（至少隔 3 秒，避免反复触发）
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible' && Date.now() - lastDone > 3000) refresh();
  });
})();

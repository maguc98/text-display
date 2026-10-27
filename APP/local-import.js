// app/local-import.js — 批量导入：从「文件」App 多选 音频 + 同名 LRC + 同名封面图 + 同名 .meta.json，自动配对后交给歌曲库入库
/* 设计要点
   1. 不另建数据库：持久化、去重、封面提取、播放、删除都由 song-library.js（IndexedDB yiufm-songs）负责，
      本文件只做「多选 → 按文件名分类配对 → 交给 SongLibrary.importScanned」。所以播放层不用改，blob URL 的释放也沿用 song-library 里的 freeURL。
   2. 文件名配对：去扩展名（.meta.json 当一个整体去掉）、统一成 NFC、忽略大小写，iOS 文件名可能是 NFD。
   3. 不设 accept：iOS 文件选择器对 .lrc / .json 这类没有系统类型的扩展名，加了 accept 反而会灰掉，所以选完再自己过滤。
   4. 选择器的 <input> 一直留在页面里，导入完成后才清空，避免 iOS 上 File 提前失效。
   API（和原需求保持同名）：
     LocalImport.pick()    → Promise<{added, updated, skipped, failed, total, ignored:[文件名]}>
     LocalImport.all()     → 歌曲信息数组    LocalImport.remove(id)  LocalImport.clear()    LocalImport.quota() → {used, quota} | null
   事件：'local-import-ready'  detail = {added, updated, skipped, failed, total, ignored} */
(function(){
  'use strict';

  var AUDIO_RE = /\.(mp3|m4a|flac|wav|aac|ogg|opus)$/i;
  var IMG_RE   = /\.(jpe?g|png|webp)$/i;
  var LRC_RE   = /\.lrc$/i;
  var META_RE  = /\.json$/i;

  function nfc(t){ try{ return String(t).normalize('NFC'); }catch(_){ return String(t); } }
  function baseOf(name){ return nfc(name).replace(/\.meta\.json$/i, '').replace(/\.[^.]+$/, '').toLowerCase(); }

  /* ---------- 读文本：UTF-8 / UTF-16 BOM / GB18030 依次尝试，去掉 BOM ---------- */
  function readBytes(f){
    if(f.arrayBuffer) return f.arrayBuffer();
    return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); }; r.readAsArrayBuffer(f); });
  }
  function decode(buf){
    var u = new Uint8Array(buf), t;
    if(u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder('utf-16le').decode(u.subarray(2));
    if(u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder('utf-16be').decode(u.subarray(2));
    try{ t = new TextDecoder('utf-8', {fatal: true}).decode(u); }
    catch(_){ try{ t = new TextDecoder('gb18030').decode(u); }catch(__){ t = new TextDecoder('utf-8').decode(u); } }
    return t.replace(/^\uFEFF/, '');
  }
  function readText(f){ return readBytes(f).then(decode); }

  /* ---------- 分类配对 ---------- */
  function classify(files){
    var groups = {}, order = [], ignored = [];
    function g(b){ if(!groups[b]){ groups[b] = {names: []}; order.push(b); } return groups[b]; }
    files.forEach(function(f){
      var n = f.name || '', x;
      if(n.indexOf('._') === 0 || n.charAt(0) === '.') return;                 // 隐藏文件
      if(AUDIO_RE.test(n)){ var a = g(baseOf(n)); if(a.audio) ignored.push(n); else a.audio = f; }   // 同名不同格式只收第一个
      else if(LRC_RE.test(n)){ x = g(baseOf(n)); x.lrc = f; x.names.push(n); }
      else if(IMG_RE.test(n)){ x = g(baseOf(n)); x.cover = f; x.names.push(n); }
      else if(META_RE.test(n)){ x = g(baseOf(n)); x.metaFile = f; x.names.push(n); }
      else ignored.push(n);                                                     // PPT / PDF 等其他文件：直接筛除
    });
    var list = [], orphans = [];
    order.forEach(function(b){
      if(groups[b].audio) list.push(groups[b]);
      else groups[b].names.forEach(function(n){ orphans.push(n); });            // 没有同名音频的歌词 / 封面 / meta
    });
    return {groups: list, ignored: ignored, orphans: orphans};
  }

  // meta.json 里的 coverPath 是带 App 安装 UUID 的绝对路径，不可信：只取文件名，去本批文件里找
  function resolveMeta(group, files){
    if(!group.metaFile) return Promise.resolve();
    return readText(group.metaFile).then(function(txt){
      var meta = JSON.parse(txt);
      if(!meta || typeof meta !== 'object') return;
      group.meta = meta;
      if(!group.cover && meta.coverPath){
        var cn = nfc(String(meta.coverPath).split('/').pop()).toLowerCase();
        for(var i = 0; i < files.length; i++){
          if(IMG_RE.test(files[i].name) && nfc(files[i].name).toLowerCase() === cn){ group.cover = files[i]; break; }
        }
      }
    }).catch(function(){});                                                      // meta 坏了就当没有
  }

  function toItem(g){
    var it = {name: g.audio.name, size: g.audio.size, src: 'local', getBlob: function(){ return Promise.resolve(g.audio); }};
    if(g.lrc) it.getLrc = function(){ return readText(g.lrc); };
    if(g.cover) it.getCover = function(){ return Promise.resolve(g.cover); };
    if(g.meta) it.meta = g.meta;
    return it;
  }

  /* ---------- 选择器 ---------- */
  var inp = null, pending = null;
  function ensureInput(){
    if(inp) return inp;
    inp = document.createElement('input');
    inp.type = 'file'; inp.multiple = true; inp.className = 'hide';
    inp.setAttribute('aria-hidden', 'true');
    document.body.appendChild(inp);
    inp.addEventListener('change', function(){
      var files = Array.prototype.slice.call(inp.files || []), done = pending;
      pending = null;
      if(!done) return;
      run(files, done.onProgress).then(function(r){ inp.value = ''; done.resolve(r); });   // 全部入库完才清空 input
    });
    return inp;
  }

  function empty(ignored){ return {added: 0, updated: 0, skipped: 0, failed: 0, total: 0, ignored: ignored || [], noLrc: []}; }

  function run(files, onProgress){
    if(!files.length) return Promise.resolve(empty());
    var c = classify(files);
    if(!window.SongLibrary || !window.SongLibrary.importScanned){
      var r0 = empty(c.ignored); r0.failed = c.groups.length; return Promise.resolve(r0);
    }
    var pg = window.YDialog && window.YDialog.progress ? window.YDialog.progress({title: '正在导入音乐'}) : null;     // 统一风格进度条
    function op(i, n){
      if(pg) pg.set(i - 1, n, c.groups[i - 1] && c.groups[i - 1].audio.name);
      if(onProgress) try{ onProgress(i, n); }catch(_){}
    }
    return Promise.all(c.groups.map(function(g){ return resolveMeta(g, files); })).then(function(){
      return window.SongLibrary.importScanned(c.groups.map(toItem), {manual: true, onProgress: op});
    }).then(function(stat){ return pg ? pg.done().then(function(){ return stat; }) : stat; }).then(function(stat){
      var used = {}, byFn = {};      // meta 里指向的封面算「用上了」，不算筛除
      c.groups.forEach(function(g){ if(g.cover) used[nfc(g.cover.name)] = 1; });
      window.SongLibrary.list().forEach(function(x){ byFn[nfc(x.fn)] = x; });
      stat.total = c.groups.length;
      stat.ignored = c.ignored.concat(c.orphans.filter(function(n){ return !used[nfc(n)]; }));
      stat.noLrc = c.groups.filter(function(g){ var x = byFn[nfc(g.audio.name)]; return x ? !x.lrc : !g.lrc; })
        .map(function(g){ var x = byFn[nfc(g.audio.name)]; return x ? x.name : g.audio.name.replace(/\.[^.]+$/, ''); });
      window.dispatchEvent(new CustomEvent('local-import-ready', {detail: stat}));
      return stat;
    }).catch(function(e){
      console.warn('[local-import] 导入失败', e);
      if(pg) pg.close();
      var r = empty(c.ignored); r.failed = c.groups.length; r.total = c.groups.length; return r;
    });
  }

  var api = {};
  api.pick = function(opts){
    opts = opts || {};
    var i = ensureInput();
    if(pending){ pending.resolve(empty()); pending = null; }                    // 上一次选了一半取消的
    return new Promise(function(resolve){
      pending = {resolve: resolve, onProgress: opts.onProgress};
      i.click();
    });
  };
  api.all    = function(){ return window.SongLibrary ? window.SongLibrary.list() : []; };
  api.remove = function(id){ return window.SongLibrary ? window.SongLibrary.remove(id) : undefined; };
  api.clear  = function(){ return window.SongLibrary && window.SongLibrary.clearAll ? window.SongLibrary.clearAll() : Promise.resolve(); };
  api.quota  = function(){
    if(!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().then(function(e){ return {used: e.usage || 0, quota: e.quota || 0}; }, function(){ return null; });
  };
  window.LocalImport = api;

  /* ---------- 设置 → 数据备份 → 本地导入管理 ---------- */
  var $ = function(id){ return document.getElementById(id); };
  var btnTimer = 0;
  function ask(o){ return window.YDialog ? window.YDialog.confirm(o) : Promise.resolve(window.confirm(o.msg || o.title)); }
  function tell(o){ return window.YDialog ? window.YDialog.alert(o) : Promise.resolve(window.alert(o.msg || o.title)); }
  function eh(t){ return String(t).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function stat(k, v, cls){ return '<div class="yd-stat' + (cls ? ' ' + cls : '') + '"><span>' + k + '</span><b>' + v + '</b></div>'; }
  function nameList(a, max){ return '<div class="yd-list">' + a.slice(0, max).map(eh).join('<br>') + (a.length > max ? '<br>…等共 ' + a.length + ' 个' : '') + '</div>'; }

  // 导入完成后的结果弹窗：导入几首 / 哪些没有歌词 / 筛除了多少文件
  function showResult(r){
    var h = '', title = r.total ? '导入完成' : '没有可导入的音频';
    if(r.total){
      h += stat('导入歌曲', r.added + ' 首');
      if(r.updated) h += stat('补充歌词', r.updated + ' 首');
      if(r.skipped) h += stat('已存在，跳过', r.skipped + ' 首');
      if(r.failed) h += stat('导入失败', r.failed + ' 首', 'bad');
      h += stat('没有歌词', r.noLrc.length + ' 首', r.noLrc.length ? 'warn' : '');
      if(r.noLrc.length) h += nameList(r.noLrc, 12);
    }
    h += stat('筛除文件', r.ignored.length + ' 个');
    if(r.ignored.length) h += nameList(r.ignored, 6);
    return tell({title: title, html: h});
  }

  // 底部「···」菜单里的「选择音频」→ 改成「音乐导入」（批量）。原来的逻辑是 audioFile.click()，这里把它改道到批量选择器
  function relabel(b){ for(var n = b.lastChild; n; n = n.previousSibling){ if(n.nodeType === 3 && n.nodeValue.trim()){ n.nodeValue = ' 音乐导入'; return; } } }
  function rewire(){
    var af = $('audioFile');
    if(af && !af.__batch){ af.__batch = true; af.click = function(){ api.pick(); }; }
    var b = $('btnPickAudio'); if(b) relabel(b);
    var p = $('pickAudio'); if(p) p.textContent = '音乐导入';
  }
  function mb(n){ return (n / 1048576).toFixed(1) + ' MB'; }
  function showQuota(){
    var el = $('localQuota'); if(!el) return;
    api.quota().then(function(q){
      var n = api.all().length;
      el.textContent = q ? ('已导入 ' + n + ' 首 · 已用 ' + mb(q.used) + ' / 可用 ' + mb(q.quota)) : ('已导入 ' + n + ' 首 · 当前环境不支持查询存储空间');
    });
  }
  function setBtn(t){ var b = $('localImportBtn'); if(b) b.textContent = t; }
  function summary(r){
    if(!r.total) return r.ignored.length ? '没有可导入的音频' : '未选择文件';
    var m = r.added || r.updated ? ('新增 ' + r.added + ' 首' + (r.updated ? '，补歌词 ' + r.updated + ' 首' : '')) : '没有新歌（已存在）';
    if(r.failed) m += '（' + r.failed + ' 首失败）';
    return m;
  }

  function bindUI(){
    var bi = $('localImportBtn'), bc = $('localClearBtn');
    if(bi) bi.addEventListener('click', function(){
      if(bi.disabled) return;
      api.quota().then(function(q){
        return (q && q.quota && q.quota - q.used < 500 * 1048576) ? ask({title: '存储空间不足', msg: '剩余存储空间不足 500MB，继续导入可能失败。是否继续？', ok: '继续'}) : true;
      }).then(function(go){
        if(!go) return;
        bi.disabled = true; clearTimeout(btnTimer);
        return api.pick({onProgress: function(i, n){ setBtn('导入中 ' + i + ' / ' + n); }}).then(function(r){
          console.log('[local-import] 完成', r);
          setBtn(summary(r) + (r.ignored.length ? ' · 忽略 ' + r.ignored.length + ' 个' : ''));
          showQuota();
        }).then(function(){ bi.disabled = false; btnTimer = setTimeout(function(){ setBtn('批量导入'); }, 3000); });
      });
    });
    if(bc) bc.addEventListener('click', function(){
      if(!api.all().length){ tell({title: '还没有导入的歌曲'}); return; }
      ask({title: '清空所有导入？', msg: '音频和歌词都会从应用里移除，此操作不可恢复。\n（文件 App 里的原文件不受影响。）', ok: '清空', danger: true}).then(function(yes){
        if(yes) api.clear().then(showQuota, function(e){ console.error(e); tell({title: '清空失败', msg: '请重试。'}); });
      });
    });
    showQuota();
    window.addEventListener('local-import-ready', showQuota);
    window.addEventListener('local-import-ready', function(e){ showResult(e.detail); });
    rewire();
    window.addEventListener('ios-music-ready', showQuota);
    // 请求持久化存储，降低被系统清理的概率
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function(ok){ console.log('[storage] 持久化:', ok ? '已授予' : '被拒绝'); }); }catch(_){}
  }
  bindUI();
  if(window.SongLibrary === undefined) setTimeout(showQuota, 1500);
})();

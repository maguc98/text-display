// app/song-library.js — 歌曲库：把导入的音频 + LRC 存进 IndexedDB，重开应用自动恢复，音乐面板里显示歌曲列表
/* 设计要点
   1. 不改 player.js：包一层 #audioFile / #lrcFile 的 onchange，原有导入流程照常执行，我们只是“顺手存一份”。
   2. 数据库 yiufm-songs：songs 仓库放歌曲信息（很小，列表只读这个），files 仓库放音频本体（只在播放时才读）。
   3. 当前歌曲的 id 存在 localStorage（song_cur），启动时据此恢复音频；不会自动播放（iOS 不允许）。
   4. 依赖 player.js 里的全局：audio、TS、WT、LRC_META、karaCur、AUDIO_ON、parseLRC、applyLRC、setPlay、updateAudioInfo。 */
(function(){
  'use strict';

  var DB_NAME = 'yiufm-songs', CUR_KEY = 'song_cur';
  var $ = function(id){ return document.getElementById(id); };
  var songs = [];          // 歌曲信息列表（按添加时间从新到旧）
  var curId = null;        // 当前歌曲 id
  var dbp = null;          // 数据库 Promise
  var ready = Promise.resolve();   // 歌曲列表读完 + 上次歌曲恢复完之后才 resolve（外部批量导入要等它）
  var myURL = null;        // 本模块创建的音频临时链接
  var curOrig = '';        // 当前歌曲音频自带的封面（用户自选封面被恢复默认时退回到它）
  var curCover = '';       // 当前歌曲的封面（dataURL；音频里没有内嵌封面则为空）

  /* ---------------- 统一弹窗（确认 / 提示） ----------------
     外观照抄面板：--p-bg 玻璃底 + 高斯模糊 + 封面光晕；带弹入 / 弹出动画。
     window.YDialog.confirm({title, msg, html, ok, cancel, danger}) → Promise<boolean>
     window.YDialog.alert({title, msg, html, ok}) → Promise<void>
     原生 confirm() / alert() 在 iOS 的 WebView 里经常被吞掉（点了没反应），所以全部换成这个。 */
  var YD = (function(){
    var chain = Promise.resolve(), styled = false;
    function eh(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
    function css(){
      if(styled) return; styled = true;
      var st = document.createElement('style');
      st.textContent = [
        '.yd-mask{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;opacity:0;background:rgba(0,0,0,0);-webkit-backdrop-filter:blur(0);backdrop-filter:blur(0);-webkit-tap-highlight-color:transparent;transition:opacity .24s ease,background .24s ease,-webkit-backdrop-filter .24s ease,backdrop-filter .24s ease}',
        '.yd-mask.in{opacity:1;background:rgba(0,0,0,.4);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}',
        'body.performance-mode .yd-mask,body.performance-mode .yd-mask.in{-webkit-backdrop-filter:none;backdrop-filter:none}',
        '.yd-card{position:relative;z-index:1;width:min(100%,320px);max-height:78vh;display:flex;flex-direction:column;box-sizing:border-box;padding:22px 18px 16px;border-radius:26px;overflow:hidden;color:#fff;text-align:center;font-family:inherit;',
          'background:var(--p-bg,rgba(34,36,44,.78));-webkit-backdrop-filter:var(--g-blur,blur(23px));backdrop-filter:var(--g-blur,blur(23px));box-shadow:0 18px 48px rgba(0,0,0,.42),inset 0 0 0 1px rgba(255,255,255,.16);',
          'opacity:0;transform:translateY(16px) scale(.9);transition:opacity .22s ease,transform .38s cubic-bezier(.2,1.1,.3,1)}',
        '.yd-card::before{content:"";position:absolute;inset:-60px;z-index:-1;pointer-events:none;background:var(--cover,linear-gradient(135deg,#3a3f55,#1c1c24)) center/cover no-repeat;filter:blur(44px) saturate(1.6);opacity:.4;transform:translateZ(0)}',
        '.yd-mask.in .yd-card{opacity:1;transform:none}',
        '.yd-mask:not(.in) .yd-card{transition:opacity .18s ease,transform .2s ease-in}',
        '.yd-t{flex:none;font-size:17px;font-weight:700;line-height:1.35}',
        '.yd-body{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;margin-top:8px}',
        '.yd-m{font-size:14px;line-height:1.55;color:rgba(255,255,255,.72);overflow-wrap:anywhere}',
        '.yd-b{flex:none;display:flex;gap:10px;margin-top:18px}',
        '.yd-btn{flex:1;height:44px;border:0;border-radius:14px;font:inherit;font-size:15px;font-weight:600;color:#fff;background:rgba(255,255,255,.14);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .15s ease,background .2s ease}',
        '.yd-btn:active{transform:scale(.96);background:rgba(255,255,255,.22)}',
        '.yd-btn.ok{background:rgba(143,176,255,.34);color:#d6e3ff}',
        '.yd-btn.danger{background:rgba(255,69,58,.82);color:#fff}',
        '.yd-stat{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:9px 12px;margin-top:6px;border-radius:12px;background:rgba(255,255,255,.07);font-size:14px;text-align:left}',
        '.yd-stat span{color:rgba(255,255,255,.7)}',
        '.yd-stat b{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}',
        '.yd-stat.warn b{color:#ffd48a}.yd-stat.bad b{color:#ff8b82}',
        '.yd-list{margin:6px 0 0;padding:8px 12px;border-radius:12px;background:rgba(0,0,0,.14);font-size:12.5px;line-height:1.7;color:rgba(255,255,255,.62);text-align:left;max-height:22vh;overflow-y:auto;overflow-wrap:anywhere}',
        '.yd-bar{position:relative;height:8px;margin-top:16px;border-radius:4px;background:rgba(255,255,255,.12);overflow:hidden}',
        '.yd-fill{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:4px;background:linear-gradient(90deg,#8fb0ff,#c4d6ff);transition:width .32s cubic-bezier(.3,.8,.3,1)}',
        '.yd-bar.ind .yd-fill{width:38%!important;transition:none;animation:ydInd 1.1s ease-in-out infinite}',
        '@keyframes ydInd{0%{transform:translateX(-100%)}100%{transform:translateX(265%)}}',
        '.yd-pr{display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-top:10px;font-size:13px;color:rgba(255,255,255,.72);font-variant-numeric:tabular-nums}',
        '.yd-pr b{color:#fff;font-weight:700}',
        '.yd-pn{margin-top:6px;min-height:18px;font-size:12px;line-height:1.5;color:rgba(255,255,255,.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left}',
        '@media (prefers-reduced-motion:reduce){.yd-mask,.yd-card,.yd-btn,.yd-fill{transition-duration:.01s!important}.yd-bar.ind .yd-fill{animation:none}}'
      ].join('');
      document.head.appendChild(st);
    }
    function show(o){
      css();
      return new Promise(function(res){
        var mask = document.createElement('div'), card = document.createElement('div'), done = false;
        mask.className = 'yd-mask';
        var hub = document.getElementById('hub');
        if(hub){          // 把面板上的玻璃底 / 模糊 / 封面变量带过来，保证和面板同一个样子
          var cs = getComputedStyle(hub);
          ['--p-bg', '--g-blur', '--cover'].forEach(function(k){ var v = cs.getPropertyValue(k); if(v && v.trim()) mask.style.setProperty(k, v.trim()); });
        }
        card.className = 'yd-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true');
        card.innerHTML = (o.title ? '<div class="yd-t">' + eh(o.title) + '</div>' : '') +
          ((o.msg || o.html) ? '<div class="yd-body">' + (o.msg ? '<div class="yd-m">' + eh(o.msg).replace(/\n/g, '<br>') + '</div>' : '') + (o.html || '') + '</div>' : '') +
          '<div class="yd-b">' + (o.cancel ? '<button type="button" class="yd-btn" data-r="0">' + eh(o.cancel) + '</button>' : '') +
          '<button type="button" class="yd-btn ' + (o.danger ? 'danger' : 'ok') + '" data-r="1">' + eh(o.ok) + '</button></div>';
        mask.appendChild(card);
        document.body.appendChild(mask);
        function close(v){
          if(done) return; done = true;
          document.removeEventListener('keydown', key, true);
          mask.classList.remove('in');
          setTimeout(function(){ if(mask.parentNode) mask.parentNode.removeChild(mask); }, 260);
          res(v);
        }
        function key(e){ if(e.key === 'Escape'){ e.preventDefault(); close(false); } }
        mask.addEventListener('click', function(e){
          var b = e.target.closest ? e.target.closest('[data-r]') : null;
          if(b) close(b.getAttribute('data-r') === '1'); else if(e.target === mask) close(false);
        });
        document.addEventListener('keydown', key, true);
        void mask.offsetWidth;
        requestAnimationFrame(function(){ mask.classList.add('in'); });
      });
    }
    // 进度条：不进队列、不可关闭（导入期间挡住操作）。set(已完成数, 总数, 当前文件名)；done() 拉满后淡出；close() 直接关
    function progress(o){
      o = o || {}; css();
      var mask = document.createElement('div'), card = document.createElement('div'), closed = false;
      mask.className = 'yd-mask';
      var hub = document.getElementById('hub');
      if(hub){ var cs = getComputedStyle(hub); ['--p-bg', '--g-blur', '--cover'].forEach(function(k){ var v = cs.getPropertyValue(k); if(v && v.trim()) mask.style.setProperty(k, v.trim()); }); }
      card.className = 'yd-card'; card.setAttribute('role', 'progressbar');
      card.innerHTML = '<div class="yd-t">' + eh(o.title || '处理中') + '</div><div class="yd-bar ind"><div class="yd-fill"></div></div>' +
        '<div class="yd-pr"><span class="yd-pc">' + eh(o.text || '正在整理文件…') + '</span><b class="yd-pp"></b></div><div class="yd-pn"></div>';
      mask.appendChild(card); document.body.appendChild(mask);
      var bar = card.querySelector('.yd-bar'), fill = card.querySelector('.yd-fill'), pc = card.querySelector('.yd-pc'), pp = card.querySelector('.yd-pp'), pn = card.querySelector('.yd-pn');
      void mask.offsetWidth;
      requestAnimationFrame(function(){ mask.classList.add('in'); });
      function close(){ if(closed) return; closed = true; mask.classList.remove('in'); setTimeout(function(){ if(mask.parentNode) mask.parentNode.removeChild(mask); }, 260); }
      return {
        set: function(i, n, name){
          if(closed || !n) return;
          var f = Math.max(0, Math.min(1, i / n));
          bar.classList.remove('ind'); fill.style.width = (f * 100) + '%';
          pc.textContent = '第 ' + Math.min(n, i + 1) + ' / ' + n + ' 首'; pp.textContent = Math.round(f * 100) + '%'; pn.textContent = name || '';
        },
        done: function(){
          if(closed) return Promise.resolve();
          bar.classList.remove('ind'); fill.style.width = '100%'; pc.textContent = '完成'; pp.textContent = '100%'; pn.textContent = '';
          return new Promise(function(res){ setTimeout(function(){ close(); res(); }, 380); });
        },
        close: close
      };
    }
    function open(o){ var p = chain.then(function(){ return show(o); }); chain = p.then(function(){}, function(){}); return p; }
    return {
      progress: progress,
      confirm: function(o){ o = o || {}; return open({title: o.title, msg: o.msg, html: o.html, ok: o.ok || '确定', cancel: o.cancel === undefined ? '取消' : o.cancel, danger: !!o.danger}); },
      alert: function(o){ o = o || {}; return open({title: o.title, msg: o.msg, html: o.html, ok: o.ok || '好的', cancel: null}).then(function(){}); }
    };
  })();
  window.YDialog = YD;

  var ORD_KEY = 'song_order', ordLoaded = false;     // 手动排序：只存 id 顺序
  var openItem = null, G = null, D = null, suppress = false, renderLater = false;   // 手势状态（render 要用，所以放前面）

  if(!window.indexedDB){ buildPanel(); render('当前环境不支持保存歌曲'); return; }

  /* ---------------- IndexedDB 小工具 ---------------- */
  function openDB(){
    if(dbp) return dbp;
    dbp = new Promise(function(res, rej){
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function(){
        var d = r.result;
        if(!d.objectStoreNames.contains('songs')) d.createObjectStore('songs', {keyPath: 'id', autoIncrement: true});
        if(!d.objectStoreNames.contains('files')) d.createObjectStore('files', {keyPath: 'id'});
      };
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
    });
    return dbp;
  }
  function wrap(r){ return new Promise(function(res, rej){ r.onsuccess = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); }; }); }
  function txDone(tx){ return new Promise(function(res, rej){ tx.oncomplete = function(){ res(); }; tx.onerror = tx.onabort = function(){ rej(tx.error); }; }); }

  function loadList(){
    return openDB().then(function(db){ return wrap(db.transaction('songs').objectStore('songs').getAll()); })
      .then(function(list){ songs = (list || []).sort(function(a, b){ return b.added - a.added; }); applyOrder(); ordLoaded = true; });
  }
  function saveOrder(){ try{ localStorage.setItem(ORD_KEY, JSON.stringify(songs.map(function(x){ return x.id; }))); }catch(_){} }
  function applyOrder(){        // 按上次手动排的顺序摆；没记录过的新歌放最前（新到旧）
    try{
      var o = JSON.parse(localStorage.getItem(ORD_KEY) || '[]'), pos = {};
      o.forEach(function(id, i){ pos[id] = i; });
      var known = songs.filter(function(x){ return pos[x.id] != null; }).sort(function(a, b){ return pos[a.id] - pos[b.id]; });
      var fresh = songs.filter(function(x){ return pos[x.id] == null; });
      songs = fresh.concat(known);
    }catch(_){}
  }
  function putMeta(s){ return openDB().then(function(db){ var tx = db.transaction('songs', 'readwrite'); tx.objectStore('songs').put(s); return txDone(tx); }); }
  function getFile(id){ return openDB().then(function(db){ return wrap(db.transaction('files').objectStore('files').get(id)); }); }
  function find(id){ for(var i = 0; i < songs.length; i++) if(songs[i].id === id) return songs[i]; return null; }

  function saveCur(){ try{ if(curId == null) localStorage.removeItem(CUR_KEY); else localStorage.setItem(CUR_KEY, String(curId)); }catch(_){} }
  function loadCur(){ try{ var v = localStorage.getItem(CUR_KEY); return v ? +v : null; }catch(_){ return null; } }


  /* ---------------- 内嵌封面：从音频文件里读出来 ----------------
     支持 mp3（ID3v2.2/2.3/2.4 的 APIC）、m4a/mp4（covr）、flac（PICTURE）。读不到就返回空字符串。 */
  function readBuf(blob, a, b){
    var part = blob.slice(a, b);
    if(part.arrayBuffer) return part.arrayBuffer();
    return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ res(r.result); }; r.onerror = function(){ rej(r.error); }; r.readAsArrayBuffer(part); });
  }
  function ascii(u, s, n){ var o = ''; for(var i = s; i < s + n && i < u.length; i++) o += String.fromCharCode(u[i]); return o; }
  function be32(u, p){ return u[p] * 16777216 + ((u[p + 1] << 16) | (u[p + 2] << 8) | u[p + 3]); }
  function syncsafe(u, p){ return ((u[p] & 0x7f) << 21) | ((u[p + 1] & 0x7f) << 14) | ((u[p + 2] & 0x7f) << 7) | (u[p + 3] & 0x7f); }
  function sniff(d){
    if(d[0] === 0xFF && d[1] === 0xD8) return 'image/jpeg';
    if(d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4E && d[3] === 0x47) return 'image/png';
    if(ascii(d, 0, 4) === 'GIF8') return 'image/gif';
    return '';
  }

  function parseAPIC(body, isV2){
    var enc = body[0], q = 1, mime;
    if(isV2){ mime = ascii(body, 1, 3).toLowerCase() === 'png' ? 'image/png' : 'image/jpeg'; q = 4; }
    else { var e = body.indexOf(0, 1); if(e < 0) return null; mime = ascii(body, 1, e - 1); q = e + 1; }
    var type = body[q]; q++;
    if(enc === 1 || enc === 2){ while(q + 1 < body.length && !(body[q] === 0 && body[q + 1] === 0)) q += 2; q += 2; }
    else { while(q < body.length && body[q] !== 0) q++; q++; }
    var data = body.subarray(q);
    return data.length > 8 ? {type: type, bytes: data, mime: sniff(data) || mime} : null;
  }
  function scanID3(u, ver, flags){
    var p = 0, best = null, hdr = ver === 2 ? 6 : 10;
    if(ver >= 3 && (flags & 0x40)) p = ver === 4 ? syncsafe(u, 0) : be32(u, 0) + 4;      // 跳过扩展头
    while(p + hdr <= u.length){
      var id, sz, fl = 0;
      if(ver === 2){ id = ascii(u, p, 3); sz = (u[p + 3] << 16) | (u[p + 4] << 8) | u[p + 5]; }
      else { id = ascii(u, p, 4); sz = ver === 4 ? syncsafe(u, p + 4) : be32(u, p + 4); fl = u[p + 9]; }
      if(!/^[A-Z0-9]{3,4}$/.test(id) || sz <= 0 || p + hdr + sz > u.length) break;       // 遇到填充区或坏数据就停
      if(id === 'APIC' || id === 'PIC'){
        var body = u.subarray(p + hdr, p + hdr + sz);
        if(ver === 4 && (fl & 0x01)) body = body.subarray(4);                              // 数据长度指示符
        var pic = parseAPIC(body, ver === 2);
        if(pic && (!best || (pic.type === 3 && best.type !== 3))) best = pic;
        if(best && best.type === 3) break;
      }
      p += hdr + sz;
    }
    return best;
  }
  function parseID3(blob){
    return readBuf(blob, 0, 10).then(function(b){
      var v = new Uint8Array(b);
      if(ascii(v, 0, 3) !== 'ID3') return null;
      var size = syncsafe(v, 6);
      return readBuf(blob, 10, 10 + Math.min(size, 16 * 1048576)).then(function(buf){ return scanID3(new Uint8Array(buf), v[3], v[5]); });
    });
  }

  function parseFlacPic(u){
    var type = be32(u, 0), ml = be32(u, 4), mime = ascii(u, 8, ml), p = 8 + ml;
    p += 4 + be32(u, p);                 // 描述
    p += 16;                             // 宽 高 色深 颜色数
    var n = be32(u, p); p += 4;
    var data = u.subarray(p, p + n);
    return data.length > 8 ? {type: type, bytes: data, mime: sniff(data) || mime} : null;
  }
  function flacWalk(blob, off, best){
    return readBuf(blob, off, off + 4).then(function(b){
      var h = new Uint8Array(b);
      if(h.length < 4) return best;
      var last = h[0] & 0x80, type = h[0] & 0x7f, len = (h[1] << 16) | (h[2] << 8) | h[3];
      function next(){ return (last || (best && best.type === 3)) ? best : flacWalk(blob, off + 4 + len, best); }
      if(type === 6 && len <= 16 * 1048576){
        return readBuf(blob, off + 4, off + 4 + len).then(function(bb){
          var pic = parseFlacPic(new Uint8Array(bb));
          if(pic && (!best || pic.type === 3)) best = pic;
          return next();
        });
      }
      return next();
    });
  }

  function mp4Walk(u, s, e, out){
    var p = s;
    while(p + 8 <= e){
      var sz = be32(u, p), t = ascii(u, p + 4, 4), hs = 8;
      if(sz === 1){ sz = be32(u, p + 8) * 4294967296 + be32(u, p + 12); hs = 16; } else if(sz === 0) sz = e - p;
      if(sz < 8 || p + sz > e) break;
      var bs = p + hs, be = p + sz;
      if(t === 'udta' || t === 'ilst') mp4Walk(u, bs, be, out);
      else if(t === 'meta') mp4Walk(u, bs + 4, be, out);
      else if(t === 'covr'){
        var q = bs;
        while(q + 16 <= be){
          var ds = be32(u, q);
          if(ds < 16 || q + ds > be) break;
          if(ascii(u, q + 4, 4) === 'data' && !out.pic){ var img = u.subarray(q + 16, q + ds); if(img.length > 8) out.pic = {type: 3, bytes: img, mime: sniff(img) || 'image/jpeg'}; }
          q += ds;
        }
      }
      p += sz;
    }
  }
  function mp4Top(blob, off){
    return readBuf(blob, off, off + 16).then(function(b){
      var v = new Uint8Array(b);
      if(v.length < 8) return null;
      var size = be32(v, 0), type = ascii(v, 4, 4), hdr = 8;
      if(size === 1){ size = be32(v, 8) * 4294967296 + be32(v, 12); hdr = 16; } else if(size === 0) size = blob.size - off;
      if(size < 8) return null;
      if(type === 'moov'){
        if(size > 64 * 1048576) return null;
        return readBuf(blob, off + hdr, off + size).then(function(bb){ var out = {}; mp4Walk(new Uint8Array(bb), 0, bb.byteLength, out); return out.pic || null; });
      }
      if(off + size >= blob.size) return null;
      return mp4Top(blob, off + size);
    });
  }

  function toDataURL(pic){
    return new Promise(function(res){
      var url = URL.createObjectURL(new Blob([pic.bytes], {type: pic.mime || 'image/jpeg'})), im = new Image();
      im.onload = function(){
        var out = '';
        try{
          var sc = Math.min(1, 640 / Math.max(im.width, im.height)), c = document.createElement('canvas'), x;
          c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc));
          x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', 0.86);
        }catch(_){}
        URL.revokeObjectURL(url); res(out);
      };
      im.onerror = function(){ URL.revokeObjectURL(url); res(''); };
      im.src = url;
    });
  }
  // 返回封面 dataURL；没有内嵌封面或解析失败都返回 ''
  function extractCover(blob){
    return readBuf(blob, 0, 12).then(function(b){
      var v = new Uint8Array(b);
      if(ascii(v, 0, 3) === 'ID3') return parseID3(blob);
      if(ascii(v, 0, 4) === 'fLaC') return flacWalk(blob, 4, null);
      if(ascii(v, 4, 4) === 'ftyp') return mp4Top(blob, 0);
      return null;
    }).then(function(pic){ return pic ? toDataURL(pic) : ''; }).catch(function(){ return ''; });
  }
  window.__extractCover = extractCover;       // 方便单独测试
  // 外部封面图文件（jpg/png/webp，批量导入时用户一起选的）→ 640px 以内的 JPEG dataURL；失败返回 ''
  function coverFromImage(blob){
    return readBuf(blob, 0, blob.size).then(function(buf){
      var u = new Uint8Array(buf);
      return toDataURL({bytes: u, mime: sniff(u) || blob.type || 'image/jpeg'});
    }).catch(function(){ return ''; });
  }

  // 老版本存进去的歌没有 cover 字段：第一次用到时补提取并存回
  function ensureCover(id, rec){
    if(typeof rec.cover === 'string') return Promise.resolve(rec.cover);
    return extractCover(rec.blob).then(function(c){
      return openDB().then(function(db){ var tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put({id: id, blob: rec.blob, cover: c, ucover: rec.ucover}); return txDone(tx); })
        .then(function(){ return c; }, function(){ return c; });
    });
  }
  // 列表用的小封面：居中裁成正方形，96px，存进歌曲信息里（几 KB），列表不用读音频本体
  function makeThumb(src){
    return new Promise(function(res){
      if(!src) return res('');
      var im = new Image();
      im.onload = function(){
        try{
          var n = 96, c = document.createElement('canvas'), m = Math.min(im.width, im.height);
          c.width = c.height = n;
          c.getContext('2d').drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, n, n);
          res(c.toDataURL('image/jpeg', 0.8));
        }catch(_){ res(''); }
      };
      im.onerror = function(){ res(''); };
      im.src = src;
    });
  }
  var thumbBusy = false;
  function fillThumbs(){        // 老歌没有缩略图：一首一首补，补完存回
    if(thumbBusy) return;
    thumbBusy = true;
    (function next(){
      var s = null;
      for(var i = 0; i < songs.length; i++) if(typeof songs[i].thumb !== 'string'){ s = songs[i]; break; }
      if(!s){ thumbBusy = false; return; }
      getFile(s.id).then(function(rec){ return (rec && rec.blob && find(s.id)) ? ensureCover(s.id, rec) : ''; })
        .then(makeThumb)
        .then(function(t){ if(!find(s.id)) return; s.thumb = t; return putMeta(s); })
        .catch(function(){ if(typeof s.thumb !== 'string') s.thumb = ''; })
        .then(function(){ render(); next(); });
    })();
  }

  function loadCover(id, rec){
    return (rec ? Promise.resolve(rec) : getFile(id))
      .then(function(r){ if(!r) return ['', '']; return ensureCover(id, r).then(function(c){ return [c, r.ucover || '']; }); })
      .then(function(a){ if(curId === id){ curOrig = a[0] || ''; curCover = a[1] || curOrig; syncNow(); } })
      .catch(function(){});
  }

  /* ---------------- 音乐模式：把歌名和封面交给迷你播放器 ----------------
     mini-player.js 每 200ms 读 window.__musicTitle / __musicCover：有值就显示歌名和封面，空就按原样（歌词句 + 自选封面）。 */
  function isMusicMode(){
    var b = $('btnModeMusic'), m = $('modeSlider');
    return !!((b && b.classList.contains('on')) || (m && m.classList.contains('is-music')));
  }
  function syncNow(){
    var s = curId != null ? find(curId) : null, on = isMusicMode() && !!s;
    window.__musicTitle = on ? s.name : '';
    window.__musicCover = on ? curCover : '';
    syncNextLabel();
  }
  /* 音乐模式下，"下一个"按钮是切下一首：同步按钮的提示文字（title / aria-label） */
  function syncNextLabel(){
    var song = isMusicMode() && songs.length > 1 && curId != null;
    [['.nxb, .np-b[data-a="next"]', song ? '下一首' : '下一句'], ['.np-b[data-a="prev"]', song ? '上一首' : '上一句']].forEach(function(p){
      [].forEach.call(document.querySelectorAll(p[0]), function(b){
        if(b.getAttribute('aria-label') !== p[1]){ b.setAttribute('aria-label', p[1]); b.title = p[1]; }
      });
    });
  }
  /* ---------------- 下一首是谁 / 自动连播 ----------------
     播放模式 window.playMode（播放卡片右下角的按钮切换）：0 顺序播放 · 1 随机播放 · 2 重复播放（单曲循环）。
     「下一首」按钮、一首播完后的自动连播、播放卡片里的「下一首 · xxx」提示，三处用同一个答案：
     随机模式下，下一首在这首开始播的时候就定好（rndNext），所以提示和实际切到的一定是同一首。 */
  /*AUTONEXT-BEGIN*/
  var rndNext = null;
  function idxOf(id){ for(var k = 0; k < songs.length; k++) if(songs[k].id === id) return k; return -1; }
  function pickRandom(){            // 随机挑一首，不等于当前这首
    var n = songs.length, i = idxOf(curId);
    if(n < 2) return null;
    var j = Math.floor(Math.random() * (n - 1));
    if(i >= 0 && j >= i) j++;
    return songs[j].id;
  }
  function peekNext(){              // 现在切下一首会切到谁（id）；不在音乐模式 / 只有一首 / 没有当前歌 → null
    if(!isMusicMode() || curId == null || songs.length < 2 || idxOf(curId) < 0) return null;
    if(window.playMode === 1){
      if(rndNext == null || rndNext === curId || !find(rndNext)) rndNext = pickRandom();
      return rndNext;
    }
    return songs[(idxOf(curId) + 1) % songs.length].id;
  }
  /* 音乐模式下切歌：dir = 1 下一首，-1 上一首；顺序 = 歌单里看到的顺序，到头回绕。
     返回 true 表示已处理（调用方就不要再切歌词了）。 */
  function stepSong(dir){
    if(!isMusicMode() || curId == null || songs.length < 2) return false;
    var i = idxOf(curId);
    if(i < 0) return false;
    var id = dir > 0 ? peekNext() : songs[(i - 1 + songs.length) % songs.length].id;
    if(id == null) return false;
    selectSong(id, true);
    return true;
  }
  /* 一首播完（player.js 的 ended 里调用）：顺序 / 随机 → 切到下一首并继续播，返回 true；
     返回 false = 没处理，由 player.js 走原来的逻辑（重复播放、只有一首、不是音乐模式、顺序播到最后一首且「循环播放」关着 → 停） */
  function autoNext(){
    if(!isMusicMode() || curId == null || songs.length < 2) return false;
    var mode = window.playMode | 0;
    if(mode === 2) return false;
    var i = idxOf(curId);
    if(i < 0) return false;
    if(mode === 0 && i === songs.length - 1 && window.__noLoop) return false;
    var id = peekNext();
    if(id == null) return false;
    selectSong(id, true);
    return true;
  }
  /*AUTONEXT-END*/
  function watchMode(){
    var nodes = [$('modeSlider'), $('btnModeMusic'), $('btnModeText')].filter(Boolean);
    if(window.MutationObserver && nodes.length){
      var mo = new MutationObserver(syncNow);
      nodes.forEach(function(n){ mo.observe(n, {attributes: true, attributeFilter: ['class']}); });
    }
    ['btnModeMusic', 'btnModeText'].forEach(function(id){
      var b = $(id);
      if(b) b.addEventListener('click', function(){ setTimeout(syncNow, 0); setTimeout(syncNow, 450); });
    });
    syncNow();
  }

  /* ---------------- 界面 ---------------- */
  var listEl = null, footEl = null;
  function buildPanel(){
    var panel = $('musicPanel');
    if(!panel || $('songLib')) return;
    var st = document.createElement('style');
    st.textContent =
      '#musicPanel{padding:2px 0 6px!important;text-align:left!important}' +
      '#musicPanel>:not(#songLib){display:none!important}' +
      '#songLib{margin:0;text-align:left;color:#fff}' +
      '#songLib .sl-head{margin:0 2px 8px;font-size:12px;color:rgba(255,255,255,.5);letter-spacing:.2px}' +
      '#songLib .sl-head:empty{display:none}' +
      '#songLib .sl-list{display:flex;flex-direction:column;gap:6px}' +
      '#songLib .sl-item{position:relative;border-radius:16px;overflow:hidden;touch-action:pan-y;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;transition:height .3s cubic-bezier(.3,.8,.3,1),margin .3s cubic-bezier(.3,.8,.3,1),opacity .24s ease,transform .26s cubic-bezier(.3,.8,.3,1)}' +
      '#songLib .sl-item.drag{overflow:visible;z-index:3;transition:none}' +
      '#songLib .sl-item.removing{height:0!important;margin-bottom:-6px;opacity:0;pointer-events:none}' +
      '#songLib .sl-item.removing .sl-row{transform:translateX(-26px)!important;transition:transform .3s ease}' +
      '#songLib .sl-row{position:relative;display:flex;align-items:center;gap:11px;padding:8px;border-radius:16px;background:rgba(255,255,255,.07);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .2s ease,transform .55s cubic-bezier(.34,1.56,.64,1),box-shadow .2s ease}' +
      '#songLib .sl-item.sw .sl-row{transition:background .2s ease}' +
      '#songLib .sl-item.sw .sl-act{transition:none}' +
      '#songLib .sl-item.drag .sl-row{transform:scale(1.03);background:rgba(255,255,255,.18);box-shadow:0 14px 30px rgba(0,0,0,.36),inset 0 0 0 1px rgba(255,255,255,.22)}' +
      '#songLib .sl-row:active{background:rgba(255,255,255,.12)}' +
      '#songLib .sl-row.on{background:rgba(143,176,255,.22);box-shadow:inset 0 0 0 1px rgba(143,176,255,.38)}' +
      '#songLib .sl-cov{flex:none;width:44px;height:44px;border-radius:11px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:rgba(255,255,255,.92);text-shadow:0 1px 3px rgba(0,0,0,.25)}' +
      '#songLib .sl-cov img{width:100%;height:100%;object-fit:cover;display:block}' +
      '#songLib .sl-info{flex:1;min-width:0}' +
      '#songLib .sl-t{font-size:15px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#songLib .sl-row.on .sl-t{color:#b7ccff}' +
      '#songLib .sl-s{margin-top:2px;display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,255,255,.55);white-space:nowrap;overflow:hidden}' +
      '#songLib .sl-s span{overflow:hidden;text-overflow:ellipsis}' +
      '#songLib .sl-tag{flex:none;padding:0 5px;border-radius:5px;font-size:10px;line-height:15px;font-style:normal;background:rgba(255,255,255,.14);color:rgba(255,255,255,.7)}' +
      '#songLib .sl-eq{flex:none;display:flex;align-items:flex-end;gap:2px;width:16px;height:14px}' +
      '#songLib .sl-eq i{flex:1;height:30%;border-radius:1px;background:#8fb0ff}' +
      '#songLib.playing .sl-eq i{animation:slEq .9s ease-in-out infinite}' +
      '#songLib.playing .sl-eq i:nth-child(2){animation-delay:-.3s;animation-duration:.75s}' +
      '#songLib.playing .sl-eq i:nth-child(3){animation-delay:-.6s;animation-duration:1.05s}' +
      '@keyframes slEq{0%,100%{height:25%}50%{height:100%}}' +
      'body.performance-mode #songLib .sl-eq i{animation:none!important}' +
      '@media (prefers-reduced-motion:reduce){#songLib .sl-eq i{animation:none!important}}' +
      '#songLib .sl-act{position:absolute;right:0;top:0;bottom:0;width:0;opacity:0;overflow:hidden;border-radius:16px;background:linear-gradient(135deg,#ff6a5f,#e5362d);color:#fff;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:width .55s cubic-bezier(.34,1.56,.64,1),opacity .2s ease}' +
      '#songLib .sl-act:active{filter:brightness(.92)}' +
      '#songLib .sl-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 14px;font-size:13px;line-height:1.6;text-align:center;color:rgba(255,255,255,.55)}' +
      '#songLib .sl-empty svg{width:34px;height:34px;color:#8fb0ff;opacity:.8}';
    document.head.appendChild(st);
    var box = document.createElement('div');
    box.id = 'songLib';
    box.innerHTML = '<div class="sl-head" id="slFoot"></div><div class="sl-list" id="slList"></div>';
    panel.appendChild(box);
    listEl = $('slList'); footEl = $('slFoot');
    listEl.addEventListener('click', onListClick);
    listEl.addEventListener('pointerdown', gDown);
    listEl.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    document.addEventListener('pointerdown', function(e){ if(openItem && !(e.target.closest && e.target.closest('.sl-item'))) closeIt(openItem); }, true);
    document.addEventListener('touchmove', function(e){ if(D) e.preventDefault(); }, {passive: false});     // 排序时不让页面跟着滚
  }

  function fmtT(s){ if(!s || !isFinite(s)) return ''; var m = Math.floor(s / 60), x = Math.floor(s % 60); return m + ':' + (x < 10 ? '0' : '') + x; }
  function fmtSize(b){ return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }

  var NOTE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
  var DEL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  function coverHTML(s){
    var src = s.thumb || (s.id === curId ? curCover : '');
    if(src) return '<div class="sl-cov"><img alt="" src="' + src + '"></div>';
    var h = (s.id * 47) % 360, ch = Array.from(String(s.name || '♪'))[0] || '♪';
    return '<div class="sl-cov" style="background:linear-gradient(135deg,hsl(' + h + ',42%,48%),hsl(' + ((h + 40) % 360) + ',46%,30%))">' + esc(ch.toUpperCase()) + '</div>';
  }
  function syncPlaying(){
    var box = $('songLib');
    if(box) box.classList.toggle('playing', typeof audio !== 'undefined' && !!audio && !audio.paused && !audio.ended);
  }

  function render(msg){
    syncNow();
    offSync();
    if(D || (G && G.mode === 'swipe')){ renderLater = true; return; }      // 手势进行中不重建列表
    if(!listEl) buildPanel();
    if(!listEl) return;
    if(msg){ listEl.innerHTML = '<div class="sl-empty">' + esc(msg) + '</div>'; footEl.textContent = ''; return; }
    if(ordLoaded) saveOrder();
    if(!songs.length){
      listEl.innerHTML = '<div class="sl-empty">' + NOTE_SVG + '<div>还没有保存的歌曲<br>点底部「···」菜单里的「音乐导入」<br>可一次选多首，也可在「设置 → 数据备份」里批量导入</div></div>';
      footEl.textContent = '';
      return;
    }
    var total = 0;
    listEl.innerHTML = songs.map(function(s){
      total += s.size || 0;
      var on = s.id === curId;
      var sub = [s.artist, fmtT(s.dur)].filter(Boolean).join(' · ') || fmtSize(s.size || 0);
      return '<div class="sl-item" data-id="' + s.id + '"><div class="sl-act" data-del="' + s.id + '" role="button" aria-label="删除">删除</div><div class="sl-row' + (on ? ' on' : '') + '">' + coverHTML(s) +
        '<div class="sl-info"><div class="sl-t">' + esc(s.name) + '</div><div class="sl-s"><span>' + esc(sub) + '</span>' + (s.lrc ? '<em class="sl-tag">词</em>' : '') + '</div></div>' +
        (on ? '<span class="sl-eq"><i></i><i></i><i></i></span>' : '') + '</div></div>';
    }).join('');
    footEl.textContent = '共 ' + songs.length + ' 首 · 占用 ' + fmtSize(total) + ' · 左滑删除 · 长按排序';
    syncPlaying();
  }

  /* ---------------- 手势：左滑删除 / 长按上下拖动排序 ----------------
     每行结构：.sl-item（裁切容器，带删除动画）> .sl-act（露出的「删除」）+ .sl-row（跟手平移的内容）
     · 水平拖动超过 8px：左滑，露出删除；松手时按速度 / 位置决定展开还是收回
     · 按住不动 360ms：进入排序，行浮起跟手，其他行让位；松手后落位并保存顺序
     · 竖直拖动：交给浏览器正常滚动 */
  var ACT_W = 84, ROW_GAP = 6, LONG_MS = 360;

  function setTx(item, tx){
    var row = item.querySelector('.sl-row'), act = item.querySelector('.sl-act');
    if(!row || !act) return;
    row.style.transform = tx ? 'translateX(' + tx + 'px)' : '';
    var w = Math.max(0, -tx - 8);
    act.style.width = w + 'px';
    act.style.opacity = Math.min(1, w / 40);
  }
  function openIt(item){ if(openItem && openItem !== item) closeIt(openItem); openItem = item; setTx(item, -ACT_W); }
  function closeIt(item){
    setTx(item, 0);
    if(openItem === item){ openItem = null; if(renderLater && !G && !D){ renderLater = false; setTimeout(function(){ if(!G && !D && !openItem) render(); }, 300); } }
  }

  function gDown(e){
    if(G || D || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var item = e.target.closest ? e.target.closest('.sl-item') : null;
    if(!item || e.target.closest('.sl-act')) return;
    G = {item: item, x0: e.clientX, y0: e.clientY, mode: '', base: item === openItem ? -ACT_W : 0, tx: 0, vx: 0, lastX: e.clientX, lastT: e.timeStamp};
    G.timer = setTimeout(dragStart, LONG_MS);
    document.addEventListener('pointermove', gMove);
    document.addEventListener('pointerup', gUp);
    document.addEventListener('pointercancel', gUp);
  }
  function gMove(e){
    if(!G) return;
    var dx = e.clientX - G.x0, dy = e.clientY - G.y0;
    if(!G.mode){
      if(Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)){
        G.mode = 'swipe'; clearTimeout(G.timer);
        G.item.classList.add('sw');
        if(openItem && openItem !== G.item) closeIt(openItem);
      } else if(Math.abs(dy) > 8){ clearTimeout(G.timer); G.mode = 'scroll'; return; }
      else return;
    }
    if(G.mode === 'swipe'){
      var raw = G.base + dx;
      if(raw < -ACT_W) raw = -ACT_W + (raw + ACT_W) * 0.55;       // 越过按钮宽度后带阻尼继续往左，不会停住
      else if(raw > 0) raw = raw * 0.3;                            // 往右拉一点点橡皮筋
      G.tx = Math.max(-(G.item.offsetWidth - 24), Math.min(48, raw));
      var dt = Math.max(1, e.timeStamp - G.lastT);
      G.vx = 0.6 * G.vx + 0.4 * ((e.clientX - G.lastX) / dt); G.lastX = e.clientX; G.lastT = e.timeStamp;
      setTx(G.item, G.tx);
    } else if(G.mode === 'drag' && D){ D.cy = e.clientY; dragUpdate(); }
  }
  function gUp(e){
    if(!G) return;
    var g = G; G = null; clearTimeout(g.timer);
    document.removeEventListener('pointermove', gMove);
    document.removeEventListener('pointerup', gUp);
    document.removeEventListener('pointercancel', gUp);
    if(g.mode === 'swipe'){
      suppress = true; setTimeout(function(){ suppress = false; }, 80);
      g.item.classList.remove('sw');
      if(g.vx < -0.35 || (g.vx < 0.35 && g.tx < -ACT_W / 2)) openIt(g.item); else closeIt(g.item);
    } else if(g.mode === 'drag'){ dragEnd(e.type === 'pointercancel'); }
  }

  function scroller(el){
    for(var p = el.parentElement; p && p !== document.documentElement; p = p.parentElement){
      var o = getComputedStyle(p).overflowY;
      if((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return null;
  }
  function dragStart(){
    var g = G;
    if(!g || g.mode) return;
    var items = Array.prototype.slice.call(listEl.querySelectorAll('.sl-item')), idx = items.indexOf(g.item);
    if(items.length < 2 || idx < 0){ g.mode = 'none'; return; }
    g.mode = 'drag'; suppress = true;
    if(openItem) closeIt(openItem);
    var sc = scroller(listEl);
    D = {items: items, from: idx, to: idx, slot: items[1].offsetTop - items[0].offsetTop || (g.item.offsetHeight + ROW_GAP), el: g.item, sc: sc, sc0: sc ? sc.scrollTop : 0, y0: g.y0, cy: g.y0, raf: 0};
    g.item.classList.add('drag');
    try{ if(navigator.vibrate) navigator.vibrate(12); }catch(_){}
    dragUpdate();
    D.raf = requestAnimationFrame(autoScroll);
  }
  function dragUpdate(){
    if(!D || D.ending) return;
    var dy = D.cy - D.y0 + (D.sc ? D.sc.scrollTop - D.sc0 : 0);
    dy = Math.max(-D.from * D.slot - 8, Math.min((D.items.length - 1 - D.from) * D.slot + 8, dy));
    D.el.style.transform = 'translateY(' + dy + 'px)';
    D.to = Math.max(0, Math.min(D.items.length - 1, Math.round(D.from + dy / D.slot)));
    D.items.forEach(function(it, i){
      if(it === D.el) return;
      var t = 0;
      if(D.from < D.to && i > D.from && i <= D.to) t = -D.slot;
      else if(D.from > D.to && i >= D.to && i < D.from) t = D.slot;
      it.style.transform = t ? 'translateY(' + t + 'px)' : '';
    });
  }
  function autoScroll(){
    if(!D || D.ending) return;
    if(D.sc){
      var r = D.sc.getBoundingClientRect(), sp = 0;
      if(D.cy < r.top + 56) sp = -Math.ceil((r.top + 56 - D.cy) / 6);
      else if(D.cy > r.bottom - 56) sp = Math.ceil((D.cy - (r.bottom - 56)) / 6);
      if(sp){ D.sc.scrollTop += Math.max(-14, Math.min(14, sp)); dragUpdate(); }
    }
    D.raf = requestAnimationFrame(autoScroll);
  }
  function dragEnd(cancelled){
    var d = D;
    if(!d) return;
    d.ending = true; cancelAnimationFrame(d.raf);
    var to = cancelled ? d.from : d.to;
    d.el.classList.remove('drag');                                   // 浮起效果收回，同时滑入最终位置
    d.el.style.transform = 'translateY(' + (to - d.from) * d.slot + 'px)';
    d.items.forEach(function(it, i){ if(it === d.el) return; var t = 0; if(d.from < to && i > d.from && i <= to) t = -d.slot; else if(d.from > to && i >= to && i < d.from) t = d.slot; it.style.transform = t ? 'translateY(' + t + 'px)' : ''; });
    setTimeout(function(){
      D = null;
      if(to !== d.from){ var s = songs.splice(d.from, 1)[0]; songs.splice(to, 0, s); saveOrder(); }
      renderLater = false; render();
      setTimeout(function(){ suppress = false; }, 120);
    }, 280);
  }

  function collapse(item){                                           // 删除动画：高度收拢 + 淡出 + 向左滑出
    return new Promise(function(res){
      if(!item){ res(); return; }
      if(openItem === item) openItem = null;
      item.style.height = item.offsetHeight + 'px';
      void item.offsetHeight;
      item.classList.add('removing');
      setTimeout(res, 330);
    });
  }

  function onListClick(e){
    if(suppress) return;
    var act = e.target.closest && e.target.closest('.sl-act');
    if(act){ e.stopPropagation(); removeSong(+act.getAttribute('data-del'), act.closest('.sl-item')); return; }
    var item = e.target.closest && e.target.closest('.sl-item');
    if(!item) return;
    if(openItem){ closeIt(openItem); return; }                       // 有展开的行：先收回，不当作点歌
    selectSong(+item.getAttribute('data-id'), true);
  }


  /* ---------------- 歌词偏移尺（每首歌各记一个） ----------------
     竖向刻度尺挂在 #hub 左侧、和面板底边对齐：拖动尺子，指针处的数值就是偏移（毫秒）。
     偏移写进 player.js 的全局 LYR_OFF（秒）：歌词用的时间 = 音频时间 − 偏移，所以正值 = 歌词延后，负值 = 提前。
     数值存在歌曲信息的 off 字段里，换歌自动换成那首歌自己的值。不动 TS / WT，随时可归零。 */
  var OFF_MAX = 1000, OFF_STEP = 10, PPM = 0.4;     // 范围 ±1000ms，每 10ms 一格，每 1ms 占 0.4px（一格 4px）
  var offMs = 0, offCur = 0, offId, offBox = null, offCv = null, offValEl = null;
  var offDown = false, offLastY = 0, offLastT = 0, offVel = 0, offRaf = 0, offTarget = null, offSaveT = 0;
  var offTapT = 0, offDownY = 0, offDownT = 0, offMoved = false;
  /* 隐藏 / 显示：在尺子上向右滑 = 隐藏（尺子向右滑进面板后面），隐藏后面板左边留一个小把手，向左滑（或轻点）= 重新显示；状态记在 localStorage */
  var HIDE_X = 76;                                  // 隐藏时向右平移的距离 = 尺宽 64 + 与面板的间距 8 + 余量 4
  var offX = 0, offHidden = false, offTab = null;   // offX：尺子当前向右偏了多少 px（0 = 正常显示，HIDE_X = 完全藏起来）
  var offMode = null, offDownX = 0, offHx0 = 0, offHLastX = 0, offHLastT = 0, offHVel = 0;   // offMode：这次触摸是 'v' 竖拖调数值 / 'h' 横滑隐藏
  var offTargetX = 0, offSlideRaf = 0, offTabDown = false, offTabX = 0, offTabY = 0, offTabT = 0, offTabDone = false;
  var offLockOn = false, offLockWant = null, offLockA = [];   // 全局时间轴开关：.lo-lock 类是否已加上 / 最近一次处理的开关状态 / 正在播的动画

  function clampOff(v){ return Math.max(-OFF_MAX, Math.min(OFF_MAX, v)); }
  function fmtOff(v){ return (v > 0 ? '+' : '') + v; }

  function offBuild(){
    var hub = $('hub');
    if(!hub || $('lyOff')) return;
    var st = document.createElement('style');
    st.textContent =
      '#lyOff{position:absolute;right:calc(100% + 8px);bottom:0;width:64px;height:clamp(200px,34vh,300px);display:none;flex-direction:column;border-radius:22px;overflow:hidden;' +
        'background:var(--p-bg,rgba(30,30,34,.7));-webkit-backdrop-filter:var(--g-blur,blur(23px));backdrop-filter:var(--g-blur,blur(23px));box-shadow:0 10px 30px rgba(0,0,0,.36);' +
        'touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;color:#fff;z-index:2}' +
      '#lyOff.show{display:flex}' +
      '#lyOff.lo-hid{visibility:hidden;pointer-events:none}' +
      /* 隐藏后留在面板左边的小把手：可见的只是一根细竖条，触摸区 28px 宽、和尺子一样高 */
      '#lyOffTab{position:absolute;right:100%;bottom:0;width:28px;height:clamp(200px,34vh,300px);display:none;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;z-index:2}' +
      '#lyOffTab.on{display:block}' +
      '#lyOffTab{transform-origin:19px 50%}' +
      /* 全局时间轴开关 = 关：尺子（已向左滑出屏幕、淡出）和小白条一起锁住；动画靠 WAAPI，这里只管最终状态 */
      '#lyOff.lo-lock{visibility:hidden!important;pointer-events:none!important;opacity:0!important;translate:var(--lo-dx,-140px) 0}' +
      '#lyOffTab.lo-lock{display:none!important}' +
      '#lyOffTab::before{content:"";position:absolute;right:7px;top:50%;width:4px;height:46px;margin-top:-23px;border-radius:2px;background:rgba(255,255,255,.55);box-shadow:0 0 8px rgba(0,0,0,.25);animation:loTabIn .25s ease both}' +
      '@keyframes loTabIn{from{opacity:0}to{opacity:1}}' +
      /* 和面板一样：深色玻璃底（--p-bg + 高斯模糊）上面，再叠一层当前封面放大后的模糊光晕（同 #hubGlow::before） */
      '#lyOff::before{content:"";position:absolute;inset:-60px;z-index:-1;pointer-events:none;background:var(--cover,linear-gradient(135deg,#3a3f55,#1c1c24)) center/cover no-repeat;filter:blur(44px) saturate(1.6);opacity:.4;transform:translateZ(0)}' +
      /* 阴影 / 高光：照抄 #hubGlass 的各档（柔和阴影、高光描边、浅色背景、性能模式） */
      'html body.ui-glow #lyOff{box-shadow:0 10px 28px rgba(0,0,0,.32),inset 0 0 0 1px rgba(255,255,255,.2)!important}' +
      'html body.light-bg.ui-glow #lyOff{box-shadow:0 8px 20px rgba(0,0,0,.10),inset 0 0 0 1px rgba(255,255,255,.2)!important}' +
      'html body.ui-shadow #lyOff{box-shadow:0 14px 34px rgba(0,0,0,.26)!important}' +
      'html body.light-bg.ui-shadow #lyOff{box-shadow:0 12px 28px rgba(0,0,0,.10)!important}' +
      'html body.ui-glow.ui-shadow #lyOff{box-shadow:0 12px 30px rgba(0,0,0,.34),0 4px 12px rgba(0,0,0,.16),inset 0 0 0 1px rgba(255,255,255,.2)!important}' +
      'html body.light-bg.ui-glow.ui-shadow #lyOff{box-shadow:0 10px 24px rgba(0,0,0,.10),0 3px 10px rgba(0,0,0,.06),inset 0 0 0 1px rgba(255,255,255,.2)!important}' +
      'html body.performance-mode.ui-shadow #lyOff{box-shadow:0 8px 22px rgba(0,0,0,.18)!important}' +
      'html body.performance-mode.ui-glow #lyOff{box-shadow:0 8px 22px rgba(0,0,0,.18),inset 0 0 0 1px rgba(255,255,255,.2)!important}' +
      '#lyOff .lo-v{flex:none;padding:10px 0 0;text-align:center;line-height:1.1}' +
      '#lyOff .lo-v b{display:block;font:700 14px/1.15 ui-monospace,SFMono-Regular,Menlo,monospace;font-variant-numeric:tabular-nums;transition:color .2s ease}' +
      '#lyOff.nz .lo-v b{color:#b7ccff}' +
      '#lyOff .lo-v em{font-style:normal;font-size:10px;color:rgba(255,255,255,.5)}' +
      '#lyOff canvas{flex:1;min-height:0;width:100%;display:block;-webkit-mask-image:linear-gradient(transparent,#000 18%,#000 82%,transparent);mask-image:linear-gradient(transparent,#000 18%,#000 82%,transparent)}';
    document.head.appendChild(st);
    offBox = document.createElement('div');
    offBox.id = 'lyOff';
    offBox.setAttribute('aria-label', '歌词时间偏移');
    offBox.innerHTML = '<div class="lo-v"><b id="loV">0</b><em>ms</em></div><canvas id="loC"></canvas>';
    hub.appendChild(offBox);
    offCv = $('loC'); offValEl = $('loV');
    offBox.addEventListener('pointerdown', offDownH);
    offBox.addEventListener('pointermove', offMoveH);
    offBox.addEventListener('pointerup', offUpH);
    offBox.addEventListener('pointercancel', offUpH);
    offTab = document.createElement('div');
    offTab.id = 'lyOffTab';
    offTab.setAttribute('aria-label', '显示歌词偏移尺');
    hub.appendChild(offTab);
    offTab.addEventListener('pointerdown', offTabDownH);
    offTab.addEventListener('pointermove', offTabMoveH);
    offTab.addEventListener('pointerup', offTabUpH);
    offTab.addEventListener('pointercancel', offTabUpH);
    offHidden = offLoadHidden();
    if(offHidden){ offX = HIDE_X; offBox.classList.add('lo-hid'); offXApply(); }
    if(window.ResizeObserver) new ResizeObserver(offDraw).observe(offCv);
    offLockApply(false);               // 开关在尺子建好之前就已经是「关」时，直接摆成关的样子（不播动画）
  }

  /* ---- 隐藏 / 显示 ---- */
  function offLoadHidden(){ try{ return localStorage.getItem('lyoff_hidden') === '1'; }catch(_){ return false; } }
  function offSaveHidden(){ try{ localStorage.setItem('lyoff_hidden', offHidden ? '1' : '0'); }catch(_){} }
  function offXApply(){                // 按 offX 摆放：右移 + 在面板左边缘处裁掉（看起来是滑进面板后面）+ 渐隐
    if(!offBox) return;
    var st = offBox.style;
    if(offX < 0.01){ st.transform = ''; st.clipPath = ''; st.webkitClipPath = ''; st.opacity = ''; return; }
    var cp = 'inset(-40px ' + (offX - 8) + 'px -40px -40px)';      // 上 / 下 / 左留出阴影的位置；右边在面板左边缘（比尺子右边多 8px）处裁掉
    st.transform = 'translateX(' + offX + 'px)';
    st.webkitClipPath = cp; st.clipPath = cp;
    st.opacity = String(Math.max(0, 1 - offX / HIDE_X * 1.15));
  }
  function offTabUpdate(){ if(offTab) offTab.classList.toggle('on', offHidden && !offLockOn && !!offBox && offBox.classList.contains('show')); }
  function offSlideTo(t){              // 平滑滑到目标位置（0 = 显示，HIDE_X = 隐藏）
    offTargetX = t;
    if(!offSlideRaf) offSlideRaf = requestAnimationFrame(offSlideStep);
  }
  function offSlideStep(){
    offSlideRaf = 0;
    var d = offTargetX - offX;
    if(Math.abs(d) < 0.4){ offX = offTargetX; offXApply(); offXDone(); return; }
    offX += d * 0.28; offXApply();
    offSlideRaf = requestAnimationFrame(offSlideStep);
  }
  function offXDone(){
    if(offX >= HIDE_X - 0.5){
      if(!offHidden){ offHidden = true; offSaveHidden(); }
      offBox.classList.add('lo-hid');                    // 完全藏起来后不再接收触摸
    }
    offTabUpdate();
  }
  function offReveal(){                // 重新显示：从右边滑回来
    if(window.__tlOn === false) return;          // 全局时间轴开关关着：不能再滑出来
    if(!offHidden && offX < 0.5) return;
    offHidden = false; offSaveHidden();
    offBox.classList.remove('lo-hid');
    if(offTab) offTab.classList.remove('on');
    offX = Math.max(offX, 0.5); offXApply();
    offSlideTo(0);
  }
  function offHMove(e){                // 横滑中：尺子跟着手指向右走（只能往右，最多 HIDE_X）
    var dt = Math.max(1, e.timeStamp - offHLastT);
    offHVel = 0.7 * offHVel + 0.3 * ((e.clientX - offHLastX) / dt);
    offHLastX = e.clientX; offHLastT = e.timeStamp;
    offX = Math.max(0, Math.min(HIDE_X, e.clientX - offHx0));
    offXApply();
  }
  function offTabDownH(e){
    if(window.__tlOn === false) return;          // 开关关着：小白条不接收手势
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try{ offTab.setPointerCapture(e.pointerId); }catch(_){}
    offTabDown = true; offTabDone = false;
    offTabX = e.clientX; offTabY = e.clientY; offTabT = e.timeStamp;
  }
  function offTabMoveH(e){             // 在把手上向左滑 = 显示
    if(!offTabDown || offTabDone) return;
    var dx = e.clientX - offTabX, dy = e.clientY - offTabY;
    if(dx < -14 && -dx > Math.abs(dy) * 1.2){ offTabDone = true; offReveal(); }
  }
  function offTabUpH(e){
    if(!offTabDown) return;
    offTabDown = false;
    try{ offTab.releasePointerCapture(e.pointerId); }catch(_){}
    if(!offTabDone && e.type !== 'pointercancel' && Math.abs(e.clientX - offTabX) < 8 && Math.abs(e.clientY - offTabY) < 8 && e.timeStamp - offTabT < 400) offReveal();   // 轻点也能显示
  }

  function offDraw(){
    var c = offCv; if(!c) return;
    var w = c.clientWidth, h = c.clientHeight;
    if(!w || !h) return;
    var dpr = Math.min(3, window.devicePixelRatio || 1), pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if(c.width !== pw || c.height !== ph){ c.width = pw; c.height = ph; }
    var x = c.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, w, h);
    var cy = h / 2, half = cy / PPM, v, y;
    var v0 = Math.ceil((offCur - half) / OFF_STEP) * OFF_STEP, v1 = Math.floor((offCur + half) / OFF_STEP) * OFF_STEP;
    x.font = '10px ui-monospace,SFMono-Regular,Menlo,monospace';
    x.textBaseline = 'middle';
    for(v = v0; v <= v1; v += OFF_STEP){
      if(v < -OFF_MAX || v > OFF_MAX) continue;
      y = Math.round(cy - (v - offCur) * PPM) - 0.5;
      var big = v % 100 === 0, mid = v % 50 === 0;
      x.fillStyle = 'rgba(255,255,255,' + (big ? 0.7 : mid ? 0.5 : 0.3) + ')';
      x.fillRect(12, y, big ? 16 : mid ? 11 : 7, 1);
      if(v % 200 === 0){ x.fillStyle = 'rgba(255,255,255,.55)'; x.fillText(v === 0 ? '0' : fmtOff(v), 34, y + 0.5); }
    }
    // 中间固定的指针：左边一个小三角 + 一条亮线
    x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(0, cy - 5); x.lineTo(7, cy); x.lineTo(0, cy + 5); x.closePath(); x.fill();
    x.fillRect(8, cy - 1, 22, 2);
  }

  function offApply(){                 // 把 offCur 取整到 10ms，变了就生效 + 防抖保存
    var m = clampOff(Math.round(offCur / OFF_STEP) * OFF_STEP);
    if(m === offMs) return;
    offMs = m;
    LYR_OFF = m / 1000;
    offLabel();
    if(typeof startTick === 'function') startTick();       // 暂停时也让歌词立刻按新偏移刷新
    clearTimeout(offSaveT);
    offSaveT = setTimeout(function(){
      var s = find(offId);
      if(s && (s.off || 0) !== offMs){ s.off = offMs; putMeta(s).catch(function(){}); }
    }, 500);
  }
  function offLabel(){
    if(offValEl) offValEl.textContent = fmtOff(offMs);
    if(offBox) offBox.classList.toggle('nz', offMs !== 0);
  }
  function offStop(){ if(offRaf){ cancelAnimationFrame(offRaf); offRaf = 0; } offTarget = null; }
  function offLoop(){                  // 松手后：先惯性滑行，速度小了再吸附到最近的一格
    offRaf = 0;
    if(offOwnerGone()) return;
    if(offTarget == null){
      offCur = clampOff(offCur + offVel * 16);
      offVel *= 0.94;
      if(Math.abs(offCur) >= OFF_MAX) offVel = 0;
      if(Math.abs(offVel) < 0.01) offTarget = Math.round(offCur / OFF_STEP) * OFF_STEP;
    } else {
      var d = offTarget - offCur;
      if(Math.abs(d) < 0.05){ offCur = offTarget; offTarget = null; offVel = 0; offApply(); offDraw(); return; }
      offCur += d * 0.3;
    }
    offApply(); offDraw();
    offRaf = requestAnimationFrame(offLoop);
  }
  function offOwnerGone(){ return !offBox || !offBox.classList.contains('show'); }

  function offDownH(e){
    if(window.__tlOn === false) return;          // 开关关着：尺子不接收手势（竖拖调数值 / 横滑隐藏都不行）
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try{ offBox.setPointerCapture(e.pointerId); }catch(_){}
    offStop();
    offDown = true; offMoved = false; offVel = 0;
    offMode = null; offDownX = e.clientX;
    offLastY = offDownY = e.clientY; offLastT = offDownT = e.timeStamp;
  }
  function offMoveH(e){
    if(!offDown) return;
    if(offMode === 'h'){ offHMove(e); return; }
    if(offMode === null){                // 先看这次是横滑还是竖拖：动够 8px 再判断，横向明显大于竖向才算横滑
      var ax = Math.abs(e.clientX - offDownX), ay = Math.abs(e.clientY - offDownY);
      if(ax < 8 && ay < 8) return;       // 没更新 offLastY：判成竖拖后，这一小段位移也会算进去，不会丢
      if(ax > ay * 1.4){ offMode = 'h'; offMoved = true; offVel = 0; offHx0 = offHLastX = e.clientX; offHLastT = e.timeStamp; offHVel = 0; return; }
      offMode = 'v';
    }
    var dy = e.clientY - offLastY, dt = Math.max(1, e.timeStamp - offLastT);
    if(Math.abs(e.clientY - offDownY) > 6) offMoved = true;
    // 尺子跟着手指走：手指往下，尺子往下，指针处的数值变大（上面是正值）
    offCur = clampOff(offCur + dy / PPM);
    offVel = 0.7 * offVel + 0.3 * (dy / PPM / dt);
    offLastY = e.clientY; offLastT = e.timeStamp;
    offApply(); offDraw();
  }
  function offUpH(e){
    if(!offDown) return;
    offDown = false;
    try{ offBox.releasePointerCapture(e.pointerId); }catch(_){}
    if(offMode === 'h'){                 // 横滑结束：滑过一定距离或甩得够快就藏起来，否则弹回
      offMode = null;
      if(e.timeStamp - offHLastT > 80) offHVel = 0;
      var hide = e.type !== 'pointercancel' && (offX > 28 || (offHVel > 0.5 && offX > 8));
      offSlideTo(hide ? HIDE_X : 0);
      return;
    }
    offMode = null;
    if(!offMoved && e.timeStamp - offDownT < 300){        // 轻点：连点两下归零
      if(e.timeStamp - offTapT < 320){ offTapT = 0; offVel = 0; offTarget = 0; offRaf = requestAnimationFrame(offLoop); return; }
      offTapT = e.timeStamp;
    }
    if(e.timeStamp - offLastT > 80) offVel = 0;           // 停了一会儿再松手：不滑行
    offRaf = requestAnimationFrame(offLoop);
  }

  /* ---------------- 全局时间轴开关（index.html 工具栏里的竖尺子按钮） ----------------
     开关由 index.html 维护：window.__tlOn（false = 关）+ window 上的 'tlswitch' 事件（detail.on / detail.animate）。
     关：偏移尺向左滑出屏幕并淡出；隐藏后留在面板左边的小白条缩小淡出；尺子 / 小白条的手势全部屏蔽。
     开：尺子 / 小白条弹簧弹回「关之前」的样子（用户自己横滑藏起来的状态 offHidden 保持不变）。
     动画用 Web Animations API，最终状态靠 .lo-lock 类（!important）锁住，所以：关 = 先播动画、结束再加类；开 = 先去类、再播动画。 */
  var LO_SPRING = 'cubic-bezier(.34,1.56,.64,1)', LO_OUT = 'cubic-bezier(.4,0,.6,1)';
  function offSpd(){ return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-spd')) || 1; }
  function offFxCancel(){ offLockA.forEach(function(a){ try{ a.cancel(); }catch(_){} }); offLockA = []; }
  function offLockApply(animate){
    if(!offBox) return;
    var want = window.__tlOn === false;
    if(want === offLockWant) return;
    offLockWant = want;
    offFxCancel();
    var k = offSpd(), ok = !!animate && !!offBox.animate;
    if(want){
      /* 先收掉进行中的手势 / 惯性 / 横滑动画，免得和锁定动画打架 */
      offDown = false; offTabDown = false; offMode = null; offStop();
      if(offSlideRaf){ cancelAnimationFrame(offSlideRaf); offSlideRaf = 0; offX = offTargetX; offXApply(); offXDone(); }
      var boxVis = offBox.classList.contains('show') && !offHidden;          // 尺子此刻看得见
      var tabVis = !!offTab && offTab.classList.contains('on');              // 小白条此刻看得见
      var dx = -(offBox.getBoundingClientRect().right + 24);                 // 向左滑到屏幕外所需的距离
      offBox.style.setProperty('--lo-dx', dx + 'px');
      var left = 0;
      var fin = function(){
        offBox.classList.add('lo-lock'); if(offTab) offTab.classList.add('lo-lock');
        offLockOn = true; offTabUpdate();
        offFxCancel();                                                       // 类已经锁住最终状态，动画可以撤了
      };
      var one = function(){ if(--left <= 0) fin(); };
      if(ok && boxVis){
        left++;
        var a = offBox.animate([{translate: '0px 0px', opacity: 1}, {translate: dx + 'px 0px', opacity: 0}], {duration: 420 / k, easing: LO_OUT, fill: 'forwards'});
        a.onfinish = one; offLockA.push(a);
      }
      if(ok && tabVis){
        left++;
        var b = offTab.animate([{scale: 1, opacity: 1}, {scale: .2, opacity: 0}], {duration: 320 / k, easing: LO_OUT, fill: 'forwards'});
        b.onfinish = one; offLockA.push(b);
      }
      if(left === 0) fin();
    } else {
      offLockOn = false;
      offBox.classList.remove('lo-lock'); if(offTab) offTab.classList.remove('lo-lock');
      offTabUpdate();                                                        // 小白条按 offHidden 恢复
      if(!ok) return;
      var dx2 = parseFloat(offBox.style.getPropertyValue('--lo-dx')) || -140;
      if(offBox.classList.contains('show') && !offHidden)
        offLockA.push(offBox.animate([{translate: dx2 + 'px 0px', opacity: 0}, {translate: '0px 0px', opacity: 1}], {duration: 560 / k, easing: LO_SPRING}));
      if(offTab && offTab.classList.contains('on'))
        offLockA.push(offTab.animate([{scale: .2, opacity: 0}, {scale: 1, opacity: 1}], {duration: 520 / k, easing: LO_SPRING}));
    }
  }
  window.addEventListener('tlswitch', function(e){ offLockApply(!!(e.detail && e.detail.animate)); });

  // 当前歌曲变了：换成这首歌自己的偏移；没有当前歌曲就藏起来
  function offSync(){
    if(!offBox) return;
    var s = curId != null ? find(curId) : null;
    if(curId !== offId){
      offStop(); clearTimeout(offSaveT);
      offId = curId;
      offMs = 0; LYR_OFF = 0;
      offCur = s ? clampOff(s.off || 0) : 0;
      offApply();                          // 取整并写入 LYR_OFF（这时不会触发保存：值没变化时直接返回；变了也只是写回同一个值）
    }
    offBox.classList.toggle('show', !!s);
    offTabUpdate();
    offLabel();
    if(s) offDraw();
  }

  /* ---------------- 外部来源批量导入（iOS 版 Documents/Music 扫描，扫描端见 ios-music.js） ----------------
     和 addSong 的区别：addSong 是「用户刚选了这首歌」，会把它设成当前歌曲；这里是后台批量入库，
     不碰当前歌曲、不动正在播放的音频。已经在库里的（同名同大小）不重复保存；已在库里但还没有歌词、
     这次扫到了同名 LRC 的，只补歌词。用户在应用里删掉的扫描歌曲会记进 localStorage，下次扫描不再加回。 */
  var SKIP_KEY = 'ios_music_skip';
  function nfc(t){ try{ return String(t).normalize('NFC'); }catch(_){ return String(t); } }
  function skipKey(fn, size){ return nfc(fn) + '|' + size; }
  function loadSkip(){ try{ return JSON.parse(localStorage.getItem(SKIP_KEY) || '[]'); }catch(_){ return []; } }
  function saveSkip(a){ try{ localStorage.setItem(SKIP_KEY, JSON.stringify(a.slice(-500))); }catch(_){} }

  function lrcToMeta(m, txt){          // 把 LRC 原文和里面的标题 / 歌手写进歌曲信息（和 attachLrc 一致）
    var tag = {};
    try{ tag = (parseLRC(txt) || {}).meta || {}; }catch(_){}
    m.lrc = txt;
    if(tag.ti) m.name = tag.ti;
    if(tag.ar) m.artist = tag.ar;
  }
  function probeDur(blob){             // 临时挂一个 Audio 读时长，最多等 4 秒
    return new Promise(function(res){
      var a = new Audio(), u = URL.createObjectURL(blob), done = false, t;
      function fin(d){
        if(done) return; done = true; clearTimeout(t);
        try{ a.removeAttribute('src'); a.load(); }catch(_){}
        URL.revokeObjectURL(u); res(d > 0 && isFinite(d) ? d : 0);
      }
      t = setTimeout(fin, 4000);
      a.preload = 'metadata';
      a.onloadedmetadata = function(){ fin(a.duration); };
      a.onerror = function(){ fin(0); };
      a.src = u;
    });
  }
  function findDup(name, size){
    for(var i = 0; i < songs.length; i++){
      if(nfc(songs[i].fn) === nfc(name) && (size == null || songs[i].size === size)) return songs[i];
    }
    return null;
  }

  function importOne(it, skip, stat){
    var dup = findDup(it.name, it.size);
    if(dup){
      if(dup.lrc || !it.getLrc){ stat.skipped++; return Promise.resolve(); }
      return it.getLrc().catch(function(){ return ''; }).then(function(txt){
        if(!txt){ stat.skipped++; return; }
        lrcToMeta(dup, txt);
        return putMeta(dup).then(function(){ stat.updated++; });
      });
    }
    if(it.size != null && skip.indexOf(skipKey(it.name, it.size)) >= 0){ stat.skipped++; return Promise.resolve(); }
    var ext = (it.name.split('.').pop() || '').toLowerCase(), mime = MIME[ext] || 'audio/mpeg';
    var blob, lrc = '', cover = '', thumb = '', dur = 0;
    return it.getBlob().then(function(b){
      blob = (b.type === mime) ? b : b.slice(0, b.size, mime);
      return it.getLrc ? it.getLrc().catch(function(){ return ''; }) : '';
    }).then(function(txt){ lrc = txt || ''; return extractCover(blob); })
      .then(function(c){
        cover = c;
        // 批量导入时同名封面图优先于音频内嵌封面
        if(!it.getCover) return;
        return Promise.resolve(it.getCover()).then(function(img){ return img ? coverFromImage(img) : ''; })
          .then(function(ext){ if(ext) cover = ext; }, function(){});
      })
      .then(function(){ return makeThumb(cover); })
      .then(function(t){ thumb = t; return probeDur(blob); })
      .then(function(d){
        dur = d;
        var meta = {name: it.name.replace(/\.[^.]+$/, ''), fn: it.name, artist: '', size: blob.size, dur: dur, added: Date.now(), lrc: '', mime: mime, thumb: thumb, src: it.src || 'ios'};
        if(lrc) lrcToMeta(meta, lrc);
        if(it.meta){                    // 同名 .meta.json：标题 / 歌手 / 专辑优先于 LRC 标签
          if(it.meta.title) meta.name = String(it.meta.title);
          if(it.meta.artist) meta.artist = String(it.meta.artist);
          if(it.meta.album) meta.album = String(it.meta.album);
        }
        return openDB().then(function(db){
          var tx = db.transaction(['songs', 'files'], 'readwrite');
          var rq = tx.objectStore('songs').add(meta);
          rq.onsuccess = function(){ meta.id = rq.result; tx.objectStore('files').put({id: meta.id, blob: blob, cover: cover}); };
          return txDone(tx);
        }).then(function(){ songs.unshift(meta); stat.added++; });
      });
  }

  /* items: [{name, size, getBlob(): Promise<Blob>, getLrc(): Promise<string>（可选）}]
     opts:  {onProgress(i, n), all: true 表示忽略并清空「已删除」记录, manual: true 表示用户手动选的（忽略「已删除」记录，但不清空它）}
     item 可选字段: src（来源标记，默认 'ios'）、getCover(): Promise<Blob|null>（同名封面图）、meta（{title, artist, album}）
     返回:  Promise<{added, updated, skipped, failed}> */
  function importScanned(items, opts){
    opts = opts || {};
    var stat = {added: 0, updated: 0, skipped: 0, failed: 0};
    if(!window.indexedDB) return Promise.resolve(stat);
    if(opts.all) saveSkip([]);
    var skip = (opts.all || opts.manual) ? [] : loadSkip(), i = 0;
    function next(){
      if(i >= items.length) return Promise.resolve();
      var it = items[i++];
      if(opts.onProgress) try{ opts.onProgress(i, items.length); }catch(_){}
      return importOne(it, skip, stat).catch(function(err){ stat.failed++; console.warn('[song-library] 导入失败', it.name, err); })
        .then(function(){ if(stat.added || stat.updated) render(); return next(); });
    }
    return ready.then(next).then(function(){ render(); return stat; });
  }

  /* ---------------- 导入：包一层原有的 onchange ---------------- */
  var MIME = {mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg'};

  function addSong(f){
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    var mime = f.type || MIME[ext] || 'audio/mpeg';
    var blob = (f.type === mime) ? f : f.slice(0, f.size, mime);
    var dup = null;
    for(var i = 0; i < songs.length; i++) if(songs[i].fn === f.name && songs[i].size === f.size){ dup = songs[i]; break; }
    if(dup){                                   // 同名同大小：不重复保存，直接指向已有的那首
      curId = dup.id; curCover = ''; saveCur(); render(); watchDuration(dup.id); loadCover(dup.id); return Promise.resolve(dup);
    }
    var meta = {name: f.name.replace(/\.[^.]+$/, ''), fn: f.name, artist: '', size: f.size, dur: 0, added: Date.now(), lrc: '', mime: mime};
    var cover = '';
    return extractCover(blob).then(function(c){ cover = c; return makeThumb(c); }).then(function(t){ meta.thumb = t; return openDB(); }).then(function(db){
      var tx = db.transaction(['songs', 'files'], 'readwrite');
      var rq = tx.objectStore('songs').add(meta);
      rq.onsuccess = function(){ meta.id = rq.result; tx.objectStore('files').put({id: meta.id, blob: blob, cover: cover}); };
      return txDone(tx);
    }).then(function(){
      songs.unshift(meta); curId = meta.id; curCover = cover; saveCur(); render(); watchDuration(meta.id);
      try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(_){}
      return meta;
    }).catch(function(err){
      console.error('保存歌曲失败', err);
      YD.alert({title: '保存失败', msg: '存储空间可能不足。这首歌这次仍可播放，但下次打开需要重新导入。'});
    });
  }

  // 记下这首歌的时长（元数据读出来之后）
  function watchDuration(id){
    function save(){
      var s = find(id);
      if(!s || !isFinite(audio.duration) || audio.duration <= 0) return;
      if(Math.abs((s.dur || 0) - audio.duration) > 0.5){ s.dur = audio.duration; putMeta(s); render(); }
    }
    if(audio.readyState >= 1 && curId === id) { save(); return; }
    var h = function(){ audio.removeEventListener('loadedmetadata', h); if(curId === id) save(); };
    audio.addEventListener('loadedmetadata', h);
  }

  function readText(f){
    return new Promise(function(res, rej){
      var r = new FileReader();
      r.onload = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
      r.readAsText(f, 'utf-8');
    });
  }

  function attachLrc(txt){
    var s = find(curId);
    if(!s) return;                              // 还没有当前歌曲，没法绑定
    var meta = parseLRC(txt).meta || {};
    s.lrc = txt;
    if(meta.ti) s.name = meta.ti;
    if(meta.ar) s.artist = meta.ar;
    putMeta(s).then(render).catch(function(err){ console.error('保存歌词失败', err); });
  }

  function hookInputs(){
    var a = $('audioFile'), l = $('lrcFile');
    if(a){
      var origA = a.onchange;
      a.onchange = function(){
        var f = this.files && this.files[0];
        var ret = origA ? origA.apply(this, arguments) : undefined;   // 原流程会清空 input，所以先把文件取出来
        if(f) addSong(f);
        return ret;
      };
    }
    if(l){
      var origL = l.onchange;
      l.onchange = function(){
        var f = this.files && this.files[0];
        var ret = origL ? origL.apply(this, arguments) : undefined;
        if(f) readText(f).then(attachLrc).catch(function(err){ console.error('读取歌词失败', err); });
        return ret;
      };
    }
  }

  /* ---------------- 切歌 / 删除 / 启动恢复 ---------------- */
  function freeURL(){
    if(myURL){ URL.revokeObjectURL(myURL); myURL = null; }
    if(typeof releaseAudioObjectURL === 'function') releaseAudioObjectURL();   // player.js 自己创建的那个
  }

  function clearLyrics(){
    TS = []; WT = []; karaCur = null;
    LRC_META = {ti: '', ar: '', al: '', by: ''};
  }

  function selectSong(id, autoPlay){
    var s = find(id);
    if(!s) return Promise.resolve();
    return getFile(id).then(function(rec){
      if(!rec || !rec.blob){ YD.alert({title: '无法播放', msg: '这首歌的音频数据找不到了，建议删除后重新导入。'}); return; }
      // 先换歌词（此时旧音频还在，不会被 applyLRC 里的 currentTime 误伤），再换音频
      if(s.lrc){
        var parsed = parseLRC(s.lrc);
        if(parsed.items.length) applyLRC(parsed); else clearLyrics();
      } else clearLyrics();
      freeURL();
      myURL = URL.createObjectURL(rec.blob);
      curId = id; curCover = ''; rndNext = null; saveCur(); render(); loadCover(id, rec);
      if(autoPlay){
        var h = function(){ audio.removeEventListener('loadedmetadata', h); if(curId === id && typeof setPlay === 'function') setPlay(true); };
        audio.addEventListener('loadedmetadata', h);
      }
      audio.src = myURL;
      audio.load();
      watchDuration(id);
      if(window.updateMusicPanel) window.updateMusicPanel();
    }).catch(function(err){
      console.error('切换歌曲失败', err);
      YD.alert({title: '切换失败', msg: '请重试。'});
    });
  }

  function removeSong(id, el){                 // 弹确认框 → 删除动画 → 真正删除
    var s = find(id);
    if(!s) return Promise.resolve();
    var fromIos = s.src === 'ios';
    return YD.confirm({
      title: '删除这首歌？',
      msg: '「' + s.name + '」的音频和歌词都会从应用里移除。' + (fromIos ? '\n文件 App 里 Music 文件夹中的原文件不会被删除，也不会再被自动加回来。' : ''),
      ok: '删除', cancel: '取消', danger: true
    }).then(function(yes){
      var item = el || (listEl && listEl.querySelector('.sl-item[data-id="' + id + '"]'));
      if(!yes){ if(item && item === openItem) closeIt(item); return; }
      return collapse(item).then(function(){ return doRemove(id, s, fromIos); });
    });
  }
  function doRemove(id, s, fromIos){
    if(fromIos){ var sk = loadSkip(); sk.push(skipKey(s.fn, s.size)); saveSkip(sk); }
    return openDB().then(function(db){
      var tx = db.transaction(['songs', 'files'], 'readwrite');
      tx.objectStore('songs').delete(id);
      tx.objectStore('files').delete(id);
      return txDone(tx);
    }).then(function(){
      songs = songs.filter(function(x){ return x.id !== id; });
      if(curId === id){                         // 删的是正在播放的：停掉并清空音频（歌词卡片保留）
        try{ audio.pause(); }catch(_){}
        freeURL();
        audio.removeAttribute('src'); audio.load();
        AUDIO_ON = false;
        curId = null; curCover = ''; saveCur();
        updateAudioInfo();
      }
      render();
      if(window.updateMusicPanel) window.updateMusicPanel();
    }).catch(function(err){ console.error('删除失败', err); render(); YD.alert({title: '删除失败', msg: '请重试。'}); });
  }

  // 清空整个歌曲库（设置 → 本地导入管理 → 清空导入）。扫描来的歌记进「已删除」，避免下次扫描马上又加回来
  function clearAll(){
    var sk = loadSkip();
    songs.forEach(function(x){ if(x.src === 'ios') sk.push(skipKey(x.fn, x.size)); });
    saveSkip(sk);
    return openDB().then(function(db){
      var tx = db.transaction(['songs', 'files'], 'readwrite');
      tx.objectStore('songs').clear();
      tx.objectStore('files').clear();
      return txDone(tx);
    }).then(function(){
      songs = [];
      try{ audio.pause(); }catch(_){}
      freeURL();
      audio.removeAttribute('src'); audio.load();
      AUDIO_ON = false;
      curId = null; curCover = ''; saveCur();
      updateAudioInfo();
      render();
      if(window.updateMusicPanel) window.updateMusicPanel();
    });
  }

  // 启动：恢复上次播放的歌曲（只装载，不自动播放）
  function restore(){
    var id = loadCur();
    var s = id != null ? find(id) : null;
    if(!s){ curId = null; render(); return Promise.resolve(); }
    return getFile(id).then(function(rec){
      if(!rec || !rec.blob){ curId = null; saveCur(); render(); return; }
      curId = id; curCover = ''; render(); loadCover(id, rec);
      // 自动保存已经恢复了歌词文字和时间轴，这里只补回“逐字时间”（它没被自动保存），不去动卡片内容
      if(s.lrc){
        try{
          var p = parseLRC(s.lrc);
          if(p.items.length && p.items.length === TS.length){
            WT = p.items.map(function(x){ return x.wt || null; });
            karaCur = null;
          }
        }catch(_){}
      }
      // 启动恢复不走 applyLRC：这里补告诉商籁一次当前歌词（否则商籁只会显示「加载中...」，要切歌才恢复）
      try{ if(window.SonnetAdapter && SonnetAdapter.syncLyrics) SonnetAdapter.syncLyrics(); }catch(_){}
      myURL = URL.createObjectURL(rec.blob);
      audio.src = myURL;
      audio.load();
      watchDuration(id);
      if(window.updateMusicPanel) window.updateMusicPanel();
    });
  }

  window.addEventListener('pagehide', function(){ if(myURL) URL.revokeObjectURL(myURL); });

  /* ---------------- 启动 ---------------- */
  buildPanel();
  offBuild();
  if(typeof audio !== 'undefined' && audio){ ['play', 'playing', 'pause', 'ended', 'emptied'].forEach(function(ev){ audio.addEventListener(ev, syncPlaying); }); }
  hookInputs();
  watchMode();
  render('正在读取…');
  ready = loadList().then(function(){ fillThumbs(); return restore().catch(function(err){ console.error('恢复上次歌曲失败', err); render(); }); }).catch(function(err){
    console.error('歌曲库初始化失败', err);
    render('歌曲库无法使用（可能是当前环境不允许保存数据）');
  });

  /* ---------------- 每首歌自选封面（mini-player.js 的换封面 / 长按恢复默认会调这三个函数） ----------------
     音乐模式 + 有当前歌曲时，换的封面存给这首歌（优先于音频自带封面）；其他情况返回 null / false，mini-player 回退到全局自选封面。 */
  function patchFile(id, ucover){
    return getFile(id).then(function(rec){
      if(!rec) return;
      var n = {id: id, blob: rec.blob};
      if(rec.cover !== undefined) n.cover = rec.cover;
      if(ucover) n.ucover = ucover;
      return openDB().then(function(db){ var tx = db.transaction('files', 'readwrite'); tx.objectStore('files').put(n); return txDone(tx); });
    });
  }
  function setThumb(id, src){
    makeThumb(src).then(function(t){ var s = find(id); if(!s) return; s.thumb = t; return putMeta(s).then(function(){ render(); }); }).catch(function(){});
  }
  window.__musicCoverTarget = function(){ return (isMusicMode() && curId != null && find(curId)) ? curId : null; };
  window.__musicCoverSet = function(url, id){
    var s = find(id);
    if(!s || !url) return false;
    s.hasU = true;
    if(id === curId){ curCover = url; syncNow(); }
    patchFile(id, url).then(function(){ return putMeta(s); }).catch(function(err){ console.error('保存封面失败', err); });
    setThumb(id, url);
    return true;
  };
  window.__musicCoverReset = function(){
    var s = curId != null ? find(curId) : null;
    if(!isMusicMode() || !s) return null;
    if(!s.hasU) return 'none';
    s.hasU = false;
    curCover = curOrig; syncNow();
    patchFile(curId, '').then(function(){ return putMeta(s); }).catch(function(){});
    setThumb(curId, curOrig);
    return 'reset';
  };

  function coverOf(id){
    return getFile(id).then(function(rec){
      if(!rec) return '';
      if(typeof rec.ucover === 'string' && rec.ucover) return rec.ucover;
      return ensureCover(id, rec);
    }).catch(function(){ return ''; });
  }

  window.SongLibrary = {list: function(){ return songs.slice(); }, select: selectSong, step: stepSong, autoNext: autoNext, peekNext: peekNext, isMusic: isMusicMode, remove: removeSong, current: function(){ return curId; }, cover: coverOf, importScanned: importScanned, clearAll: clearAll};
})();

// app/player.js — 音频、LRC、播放循环
/* ===== 音乐播放器核心状态 ===== */
var audio = document.getElementById('audio');
var AUDIO_ON = false;
var LYR_OFF = 0;   /* 歌词时间偏移（秒，每首歌各记一个，由 song-library.js 的偏移尺设置）：正值 = 歌词延后出现，负值 = 提前 */
function lyrSeekTime(i){ return Math.max(0, (TS[i] || 0) + LYR_OFF); }   /* 跳到第 i 句时音频应该走到的位置 */
var TS = [];
var WT = []; // 逐字歌词：WT[i] = 第 i 句每个字的开始时间（秒）；没有逐字时间则为 null
// 逐字歌词：字按歌词时间一个个出现（.ki = 这个字已经到点）。
// 规则和 style.css 里的 ".one.in .c" 等价；插在 style.css 之前，这样"落下(.out)"的规则仍然优先。
(function(){
  var st = document.createElement('style');
  st.textContent =
    '.one .c.ki{opacity:1;filter:none;transform:none}' +
    '.one.m-wave .c.ki{animation:wavy calc(2.4s/var(--aspd,1)) ease-in-out infinite;animation-delay:calc(var(--i,0)*-.17s)}' +
    '.one.m-glitch .c.ki{animation:glitchfx var(--kad,.5s) steps(1,end) 1 backwards;animation-delay:calc(var(--dl,0s)/var(--aspd,1))}' +
    // 间隔太短的字：把入场时长压缩到"下一个字出现之前"一定播完（落下 .out 时不生效，落下动画照旧）
    '.one:not(.out) .c.ki[data-kd]{transition-duration:var(--kd)!important}';
  var first = document.querySelector('link[rel="stylesheet"]');
  if(first && first.parentNode) first.parentNode.insertBefore(st, first); else document.head.appendChild(st);
})();
var LRC_META = {ti:'',ar:'',al:'',by:''};
var bag=null,shown="",txtT=0,curMode="";
function shuf(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}}
function nextIdx(auto){
  if (window.playMode === 2) return idx; // 单曲循环模式，不切下一句
  if(auto&&window.__noLoop&&LN.length>1&&idx>=LN.length-1&&!$("shuf").checked){setPlay(false);return idx}
  var n=LN.length;
  if(!$("shuf").checked||n<2)return (idx+1)%n;
  if(bag===null){bag=[];for(var i=0;i<n;i++)if(i!==idx)bag.push(i);shuf(bag)}
  else if(!bag.length){bag=[];for(var j=0;j<n;j++)bag.push(j);shuf(bag);if(bag[bag.length-1]===idx)bag.unshift(bag.pop())}
  return bag.pop();
}
// 主播放循环只在播放期间持续运行；暂停时停止逐帧回调，恢复播放时再启动。
var tickRaf = 0;
var lastUiPaint = 0;  // UI 绘制节流
var lastTickTime = 0; // 上一次真正执行 tick 逻辑的时间，用于限制到约 30 FPS
var updatePending = false; // 切句渲染已排队、尚未执行
/* 切句渲染 update() 很重：不在 tick（rAF 回调）里同步执行，而是排到下一个任务。
   排队期间 idx 已经改了、但画面还是旧句，所以 tick 在此期间暂停推进，
   避免重复切句，也避免海报模式的旧 box 被误取消 out 状态而闪回。 */
function deferUpdate(){
  if(updatePending)return;
  updatePending=true;
  setTimeout(function(){updatePending=false;update();},0);
}

/* ---- 逐字出现：到了某个字的时间，就给它加 .ki，它才用当前文字动画样式出现 ---- */
var karaCur = null, karaSpans = null, karaN = 0;
/* 保证每个字在"下一个字出现"之前已经完整显示：入场时长超过间隔的，压缩到间隔的 90% */
function karaFit(box, spans, w){
  var end = (idx + 1 < TS.length) ? TS[idx + 1] : (audio.duration || (w[w.length - 1] + 1));
  var gaps = [], base = [], k, j;
  for(k = 0; k < spans.length; k++){            // 先全部读取（避免读写交替造成反复重算样式）
    j = k + 1; while(j < w.length && w[j] <= w[k]) j++;
    gaps.push({gap: (j < w.length ? w[j] : end) - w[k], isLast: j >= w.length});
    var b = 0;
    getComputedStyle(spans[k]).transitionDuration.split(',').forEach(function(v){ var x = parseFloat(v) || 0; if(x > b) b = x; });
    base.push(b);
  }
  var lastDur = 0;
  for(k = 0; k < spans.length; k++){            // 再统一写入
    var cap = Math.max(0.05, gaps[k].gap * 0.9), d = base[k];
    if(base[k] > cap){
      d = cap;
      spans[k].style.setProperty('--kd', cap.toFixed(3) + 's');
      spans[k].setAttribute('data-kd', '1');
    }
    spans[k].style.setProperty('--kad', Math.min(0.5, cap).toFixed(3) + 's'); // 故障闪烁样式的动画时长
    if(gaps[k].isLast && d > lastDur) lastDur = d;
  }
  box._kd = lastDur;                             // 最后一个字完全显示所需时间，供"落下"时机使用
}
function karaPaint(ct){
  var w = WT[idx];
  if(!w || !cur || !cur._kara || !cur._kgo) return;   // _kara/_kgo 由 renderer.js 的 update() 设置
  if(cur !== karaCur){
    karaCur = cur; karaN = 0;
    karaSpans = cur.querySelectorAll('.c');
    if(karaSpans.length !== w.length){ karaSpans = null; cur.classList.add('in'); return; } // 对不上就整句直接显示
    karaFit(cur, karaSpans, w);
  }
  if(!karaSpans) return;
  var n = 0;
  while(n < w.length && w[n] <= ct) n++;
  if(n === karaN) return;
  var k;
  if(n > karaN){ for(k = karaN; k < n; k++) karaSpans[k].classList.add('ki'); }
  else { for(k = n; k < karaN; k++) karaSpans[k].classList.remove('ki'); }
  karaN = n;
}

function startTick(){
  if(!tickRaf) tickRaf = requestAnimationFrame(tick);
}
function tick(ts){
  tickRaf = 0;
  if(playing) startTick();
  // Bravais 墙面打开时，舞台被完全挡住：停掉歌词/商籁的逐帧更新，把主线程和 GPU 让给墙面。
  // 关掉墙面后下一帧会按 audio.currentTime 重新对齐（见 bravais.js 的 deferUpdate）。
  if(window.__bravaisOpen){ last = ts; return; }

  // 降频：播放中最高约 30 FPS（间隔不足 30ms 的帧直接跳过）。
  // 暂停时不跳过，保证暂停那一帧的状态/时间轴一定会被绘制。
  if(playing && ts - lastTickTime < 30) return;
  lastTickTime = ts;

  if(!last)last=ts;
  var dt=Math.min(.1,(ts-last)/1000);last=ts;
  if(updatePending)return; // 等排队的 update() 执行完再继续

  if(AUDIO_ON && audio && audio.duration && LN.length){
    var ct = audio.currentTime - LYR_OFF;   // 歌词用的时间 = 音频时间 − 偏移
    var lo = 0, hi = Math.min(TS.length, LN.length) - 1, i = 0;
    while(lo <= hi){
      var mid = (lo + hi) >> 1;
      if((TS[mid] || 0) <= ct){ i = mid; lo = mid + 1; }
      else { hi = mid - 1; }
    }
    if(i !== idx){ idx = i; prog = 0; deferUpdate(); return; }
    var start = TS[idx] || 0;
    var end = (idx+1 < TS.length) ? TS[idx+1] : ((audio.duration || start + 5) - LYR_OFF);
    prog = Math.min(1, Math.max(0, (ct - start) / Math.max(0.1, end - start)));
    karaPaint(ct);
    if (curMode === 'sonnet' && window.SonnetAdapter && typeof window.SonnetAdapter.drive === 'function') {
        window.SonnetAdapter.drive(ct, TS, WT, LN);
    }
    // 逐字歌词：最后一个字完全显示后再停留一小会儿，然后整句落下；尽量赶在下一句开始前落完
    if(WT[idx] && cur && cur._kara && curMode !== 'pan'){
      var wl = WT[idx], lastT = wl[wl.length - 1];
      var perf = document.body.classList.contains('performance-mode'); // 性能模式下落下动画很短
      var goOut = ct >= Math.max(lastT + (cur._kd || 0.25) + 0.1, end - (perf ? 0.5 : 1.0));
      if(goOut && !cur._ko){ cur._ko = 1; cur.classList.add('out'); }
      else if(!goOut && cur._ko){ cur._ko = 0; cur.classList.remove('out'); }
    }
    if(!playing){
      var now = performance.now();
      if(now - lastUiPaint > 100) { paintStat(); paintTL(); lastUiPaint = now; }
      return;
    }
  } else {
    if(!playing){
      var now = performance.now();
      if(now - lastUiPaint > 100) { paintStat(); paintTL(); lastUiPaint = now; }
      return;
    }
    prog += dt / secOf(idx);
    if(prog >= 1){ prog = 0; idx = nextIdx(true); deferUpdate(); return; }
  }

  if(curMode==="poster"&&cur){
    var _d=secOf(idx),_l=Math.min(.4,_d*.15),_o=prog*_d>=_d-_l;
    if(_o&&!cur._po){cur._po=1;cur.classList.add("out")}
    else if(!_o&&cur._po&&prog<1){cur._po=0;cur.classList.remove("out")}
  }

  // 节流：每 100ms 更新一次 UI 状态，降低重排压力
  var now = performance.now();
  if(now - lastUiPaint > 100) {
    paintStat();
    paintTL();
    lastUiPaint = now;
  }
}

var IC={
 pause:'<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="2.1" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="2.1" fill="currentColor"/></svg>',
 play:'<svg viewBox="0 0 24 24"><path d="M8.4 6.4v11.2L17.6 12z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>',
 next:'<svg viewBox="0 0 24 24"><path d="M5.5 6.6v10.8L14.8 12z" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M18.8 6.2v11.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>'};
[].forEach.call(document.querySelectorAll(".ppb"),function(b){b.innerHTML=IC.pause});
[].forEach.call(document.querySelectorAll(".nxb"),function(b){b.innerHTML=IC.next});
function setPlay(v){
  playing=v;stage.classList.toggle("paused",!v);
  if(v) startTick();
  if(AUDIO_ON && audio){
    if(v) audio.play().catch(function(){
      // Safari may reject playback (for example, after a source or permission error).
      // Keep the UI and animation loop in sync with the actual playback state.
      if(playing && audio.paused) setPlay(false);
    });
    else audio.pause();
  }
  [].forEach.call(document.querySelectorAll(".ppb"),function(b){b.innerHTML=v?IC.pause:IC.play});
}
function gotoIdx(i, playNow){
  idx = i; prog = 0;
  if(AUDIO_ON && audio && TS.length) audio.currentTime = lyrSeekTime(i);
  update();
  if(playNow && !playing) setPlay(true);
}
/* ---- LRC 解析 ---- */
function parseLRC(txt){
  var lines = String(txt).replace(/^\uFEFF/, '').split(/\r?\n/), out = [], meta = {};
  var re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  function tv(m){ return +m[1]*60 + +m[2] + (m[3] ? parseFloat('0.' + m[3]) : 0); }
  lines.forEach(function(line){
    var m = line.match(/^\[(ti|ar|al|by|offset):(.*)\]\s*$/i);
    if(m){ meta[m[1].toLowerCase()] = m[2].trim(); return; }
    // 切成「时间标签 + 其后的文字」若干段
    var segs = [], last = 0, mm;
    re.lastIndex = 0;
    while((mm = re.exec(line))){
      if(segs.length) segs[segs.length-1].text = line.slice(last, mm.index);
      segs.push({t: tv(mm), text: ''});
      last = re.lastIndex;
    }
    if(!segs.length) return;
    segs[segs.length-1].text = line.slice(last);
    var filled = segs.filter(function(g){ return g.text.trim(); }).length;

    if(filled <= 1){
      // 普通 LRC：标签都在行首，一句歌词可对应多个时间
      var text = line.replace(re, '').trim();
      if(!text) return;
      segs.forEach(function(g){ out.push({t: g.t, text: text}); });
      return;
    }

    // 逐字 LRC：[时间]字[时间]字…  每个标签对应它后面的文字
    var chars = [], wt = [];
    segs.forEach(function(g, k){
      var chs = Array.prototype.slice.call(g.text); // 与渲染器按同样方式拆字，保证数量一致
      if(!chs.length) return;
      // 同一个时间标签后面的字（如英文单词 Oh）视为一个整体，同一时刻一起出现
      chs.forEach(function(c){ chars.push(c); wt.push(g.t); });
    });
    while(chars.length && /\s/.test(chars[0])){ chars.shift(); wt.shift(); }
    while(chars.length && /\s/.test(chars[chars.length-1])){ chars.pop(); wt.pop(); }
    if(!chars.length) return;
    out.push({t: segs[0].t, text: chars.join(''), wt: wt});
  });
  out.sort(function(a,b){ return a.t - b.t; });
  return {items: out, meta: meta};
}

function applyLRC(lrc) {
  var its = lrc.items;
  if(!its.length){ alert('这个 LRC 里没有解析到歌词'); return; }
  LRC_META = lrc.meta || {};
  var cards = document.querySelectorAll('#cards .card');
  if(cards.length === its.length){
    cards.forEach(function(c, i){
      var ta = c.querySelector('textarea');
      if(ta){ ta.value = its[i].text; ta.dispatchEvent(new Event('input')); }
    });
  } else {
    window.__setCards(its.map(function(x){ return {t: x.text}; }));
  }
  TS = its.map(function(x){ return x.t; });
  WT = its.map(function(x){ return x.wt || null; });
  karaCur = null;
  idx = 0; prog = 0;
  if(AUDIO_ON && audio && TS.length) audio.currentTime = lyrSeekTime(0);
  refreshAll();
  if (window.SonnetAdapter && typeof window.SonnetAdapter.loadLyrics === 'function') {
      window.SonnetAdapter.loadLyrics(TS, WT, LN);
  }
  updateAudioInfo();
  if(window.updateMusicPanel) window.updateMusicPanel();
}

function fmtDur(s){
  if(!s || !isFinite(s)) return '--:--';
  var m = Math.floor(s/60), sec = Math.floor(s%60);
  return m + ':' + (sec<10?'0':'') + sec;
}
function updateAudioInfo(){
  var el = document.getElementById('audioInfo');
  if(!el) return;
  if(!audio.src){ el.textContent = '未加载音频 · 当前为固定时长模式'; return; }
  var name = LRC_META.ti || decodeURIComponent((audio.src.split('/').pop()||'音频').split('?')[0]);
  var ar = LRC_META.ar ? ' · ' + LRC_META.ar : '';
  el.textContent = name + ar + ' · ' + fmtDur(audio.duration);
}

document.getElementById('pickAudio').onclick = function(){ document.getElementById('audioFile').click(); };
// 记录本页创建的音频临时 URL；重复选择音频时释放旧 URL，避免长期使用时积累资源。
var audioObjectURL = null;
function releaseAudioObjectURL(){
  if(audioObjectURL){
    URL.revokeObjectURL(audioObjectURL);
    audioObjectURL = null;
  }
}
document.getElementById('audioFile').onchange = function(){
  var f = this.files[0]; this.value = ''; if(!f) return;
  releaseAudioObjectURL();
  // iOS WKWebView：原生选择器给出的 File 可能没有 MIME 类型，Safari 会只解码一小段就结束。
  // 这里按扩展名补上明确的 MIME（slice 不会复制数据）。
  var ext = (f.name.split('.').pop() || '').toLowerCase();
  var mimeMap = {mp3:'audio/mpeg', m4a:'audio/mp4', aac:'audio/aac', wav:'audio/wav', flac:'audio/flac', ogg:'audio/ogg', opus:'audio/ogg'};
  var mime = f.type || mimeMap[ext] || 'audio/mpeg';
  var blob = (f.type === mime) ? f : f.slice(0, f.size, mime);
  audioObjectURL = URL.createObjectURL(blob);
  audio.src = audioObjectURL;
  audio.load();
};
window.addEventListener('pagehide', releaseAudioObjectURL);
document.getElementById('pickLrc').onclick = function(){ document.getElementById('lrcFile').click(); };
document.getElementById('lrcFile').onchange = function(){
  var f = this.files[0]; this.value = ''; if(!f) return;
  var r = new FileReader();
  r.onload = function(){ applyLRC(parseLRC(r.result)); };
  r.readAsText(f, 'utf-8');
};

audio.addEventListener('loadedmetadata', function(){
  AUDIO_ON = true;
  // 音频已加载但没在播放：playing / 按钮图标 / 舞台暂停态必须和真实状态一致。
  // 否则默认的 playing=true 会让按钮一开始就显示「暂停」图标，要点两下才能播放。
  // （若随后有人调用 audio.play()，下面的 'play' 事件会再把状态改回播放）
  if(audio.paused && playing){
    playing = false;
    stage.classList.add('paused');
    [].forEach.call(document.querySelectorAll('.ppb'),function(b){b.innerHTML=IC.play});
    startTick();   // 再画一帧，让进度 / 时间轴按暂停状态刷新
  }
  if(LN.length && TS.length !== LN.length){
    var d = audio.duration || 0, n = LN.length;
    if(d > 0 && isFinite(d)){
      TS = [];
      for(var k = 0; k < n; k++) TS.push(d * k / n);
    }
  }
  updateAudioInfo();
  refreshAll();
});
audio.addEventListener('play',  function(){ playing = true; startTick(); stage.classList.remove('paused'); [].forEach.call(document.querySelectorAll('.ppb'),function(b){b.innerHTML=IC.pause}); });
audio.addEventListener('pause', function(){ playing = false; stage.classList.add('paused');    [].forEach.call(document.querySelectorAll('.ppb'),function(b){b.innerHTML=IC.play});  });
audio.addEventListener('ended', function(){
  // 诊断信息：记录"结束"时的真实位置，方便判断是不是提前结束
  var endInfo = '结束于 ' + audio.currentTime.toFixed(1) + 's / 总长 ' + fmtDur(audio.duration) +
                ' (' + (audio.duration && isFinite(audio.duration) ? audio.duration.toFixed(1) : '?') + 's)';
  var infoEl = document.getElementById('audioInfo');
  /* 音乐模式：按播放模式连播。顺序 / 随机 → 切到下一首继续播；重复播放 → 这首从头再来（不受「循环播放」开关影响） */
  var SL = window.SongLibrary;
  if(SL && SL.isMusic && SL.isMusic()){
    if(window.playMode === 2){
      gotoIdx(0, false); audio.currentTime = 0; setPlay(true);
      if(infoEl) infoEl.textContent = endInfo; return;
    }
    if(SL.autoNext && SL.autoNext()){ if(infoEl) infoEl.textContent = endInfo; return; }
  }
  if(window.__noLoop){ setPlay(false); if(infoEl) infoEl.textContent = endInfo; return; }
  if(document.getElementById('shuf').checked){ gotoIdx(nextIdx(true), true); }
  else { gotoIdx(0, true); }
  if(infoEl) infoEl.textContent = endInfo;
});
audio.addEventListener('error', function(){
  AUDIO_ON = false;
  updateAudioInfo();
  var infoEl = document.getElementById('audioInfo');
  if(infoEl && audio.error) infoEl.textContent = '音频错误 code=' + audio.error.code + ' @' + audio.currentTime.toFixed(1) + 's';
});
/* 已取消：点击屏幕暂停/播放
stage.addEventListener("click",function(e){
  setPlay(!playing);
});
*/
[].forEach.call(document.querySelectorAll(".ppb"),function(b){b.onclick=function(e){e.stopPropagation();setPlay(!playing)}});
/* 下一个：音乐模式（且歌单里有 2 首以上）→ 切下一首歌；否则照旧切下一句歌词。mini-player.js 的播放卡片也用它 */
function goNext(){
  if(window.SongLibrary && SongLibrary.step && SongLibrary.step(1)) return;
  gotoIdx(nextIdx(),false);
}
[].forEach.call(document.querySelectorAll(".nxb"),function(b){b.onclick=function(e){e.stopPropagation();goNext()}});

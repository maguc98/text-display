// app/nolyric-note.js — 没有歌词的歌曲：舞台上显示一个会呼吸的发光音符
/* 说明
   1. 完全独立，不改 player.js / renderer.js / song-library.js。
   2. 判断规则：音乐模式 + 已选中一首歌 + 这首歌没有 LRC（或 LRC 里没解析出歌词）→ 显示音符，
      同时把舞台上残留的上一首歌的歌词（#one / #sonnetHost）淡出藏起来。
   3. 依赖：window.SongLibrary（song-library.js）、parseLRC（player.js）、#stage。
   4. 暂停时（#stage.paused）光环和涟漪停住；性能模式、减弱动态效果时自动简化。 */
(function(){
  'use strict';
  var stage = document.getElementById('stage');
  if(!stage || document.getElementById('noLyr')) return;

  /* ---------------- 样式 ---------------- */
  var st = document.createElement('style');
  st.textContent =
    '#noLyr{position:absolute;left:0;right:0;top:0;bottom:100px;padding-bottom:7vh;display:flex;align-items:center;justify-content:center;' +
      'pointer-events:none;z-index:3;opacity:0;visibility:hidden;transform:scale(.86);' +
      'transition:opacity .8s ease,transform 1s var(--spring,cubic-bezier(.32,.72,0,1)),visibility 0s .8s}' +
    '#stage.nolyr #noLyr{opacity:1;visibility:visible;transform:none;transition-delay:.15s,.15s,0s}' +
    /* 旧歌词淡出（商籁画布也一并藏起来） */
    '#stage.nolyr #one{opacity:0!important;visibility:hidden;transition:opacity .45s ease,visibility 0s .45s}' +
    '#stage.nolyr #sonnetHost{visibility:hidden!important}' +

    '#noLyr .nl-box{position:relative;width:min(46vw,190px);aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}' +
    /* 背后的柔光：颜色跟随主题强调色 */
    '#noLyr .nl-halo{position:absolute;inset:6%;border-radius:50%;background:var(--ac,#8fb0ff);opacity:.26;filter:blur(38px);' +
      'animation:nlHalo 4.2s ease-in-out infinite}' +
    /* 向外扩散的涟漪 */
    '#noLyr .nl-ring{position:absolute;inset:14%;border-radius:50%;border:1px solid var(--ac,#8fb0ff);opacity:0;' +
      'animation:nlRing 5.4s cubic-bezier(.2,.6,.3,1) infinite}' +
    '#noLyr .nl-ring.r2{animation-delay:1.8s}' +
    '#noLyr .nl-ring.r3{animation-delay:3.6s}' +
    /* 音符本体：漂浮 + 轻微摇摆 */
    '#noLyr .nl-float{position:relative;width:62%;height:62%;animation:nlFloat 6s ease-in-out infinite}' +
    '#noLyr svg{display:block;width:100%;height:100%;overflow:visible;' +
      'filter:drop-shadow(0 0 14px rgba(170,196,255,.5)) drop-shadow(0 10px 22px rgba(0,0,0,.45))}' +
    '#noLyr .nl-sheen{animation:nlSheen 4.8s ease-in-out infinite}' +
    /* 零星的小光点 */
    '#noLyr .nl-spark{position:absolute;width:5px;height:5px;border-radius:50%;background:#fff;opacity:0;' +
      'box-shadow:0 0 8px 2px var(--ac,#8fb0ff);animation:nlSpark 4.6s ease-in-out infinite}' +
    '#noLyr .nl-spark.s1{left:14%;top:30%;animation-delay:.4s}' +
    '#noLyr .nl-spark.s2{right:12%;top:20%;width:4px;height:4px;animation-delay:2s}' +
    '#noLyr .nl-spark.s3{right:22%;bottom:18%;width:3px;height:3px;animation-delay:3.2s}' +

    '@keyframes nlFloat{0%,100%{transform:translateY(0) rotate(-2.5deg) scale(1)}50%{transform:translateY(-9px) rotate(2.5deg) scale(1.035)}}' +
    '@keyframes nlHalo{0%,100%{opacity:.2;transform:scale(.92)}50%{opacity:.36;transform:scale(1.08)}}' +
    '@keyframes nlRing{0%{opacity:0;transform:scale(.55)}18%{opacity:.34}100%{opacity:0;transform:scale(1.55)}}' +
    '@keyframes nlSheen{0%{transform:translateX(-80px)}55%,100%{transform:translateX(200px)}}' +
    '@keyframes nlSpark{0%,100%{opacity:0;transform:translateY(6px) scale(.5)}45%{opacity:.9;transform:translateY(-6px) scale(1)}70%{opacity:0}}' +

    /* 暂停：动画全部停住（歌曲没在播，音符也安静下来） */
    '#stage.paused #noLyr .nl-halo,#stage.paused #noLyr .nl-ring,#stage.paused #noLyr .nl-float,' +
    '#stage.paused #noLyr .nl-sheen,#stage.paused #noLyr .nl-spark{animation-play-state:paused}' +
    '#stage.paused #noLyr .nl-ring{opacity:0}' +
    /* 性能模式：去掉大面积模糊和涟漪 */
    'body.performance-mode #noLyr .nl-halo{filter:none;opacity:.14;animation:none}' +
    'body.performance-mode #noLyr .nl-ring,body.performance-mode #noLyr .nl-spark{display:none}' +
    'body.performance-mode #noLyr svg{filter:none}' +
    '@media (prefers-reduced-motion:reduce){#noLyr .nl-halo,#noLyr .nl-ring,#noLyr .nl-float,#noLyr .nl-sheen,#noLyr .nl-spark{animation:none}#noLyr .nl-ring{display:none}}';
  document.head.appendChild(st);

  /* ---------------- 结构 ---------------- */
  /* 音符：一对用横梁相连的八分音符（♫）。符头略倾斜，带高光；整体是白→淡蓝的渐变，上面有一道缓慢扫过的光泽。 */
  var NOTE =
    '<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg" focusable="false">' +
      '<defs>' +
        '<linearGradient id="nlG" x1="0" y1="0" x2="1" y2="1">' +
          '<stop offset="0" stop-color="#ffffff"/>' +
          '<stop offset=".55" stop-color="#e9efff"/>' +
          '<stop offset="1" stop-color="#a9bff5"/>' +
        '</linearGradient>' +
        '<linearGradient id="nlS" x1="0" y1="0" x2="1" y2="0">' +
          '<stop offset="0" stop-color="#fff" stop-opacity="0"/>' +
          '<stop offset=".5" stop-color="#fff" stop-opacity=".85"/>' +
          '<stop offset="1" stop-color="#fff" stop-opacity="0"/>' +
        '</linearGradient>' +
        '<g id="nlShape">' +
          '<ellipse cx="33" cy="101" rx="17" ry="12.5" transform="rotate(-22 33 101)"/>' +
          '<ellipse cx="91" cy="85" rx="17" ry="12.5" transform="rotate(-22 91 85)"/>' +
          '<rect x="44" y="24" width="6.5" height="77" rx="3.2"/>' +
          '<rect x="102" y="8" width="6.5" height="77" rx="3.2"/>' +
          '<path d="M44 23 L108.5 6 L108.5 22 L44 39.5 Z" stroke-linejoin="round" stroke="currentColor" stroke-width="1.2"/>' +
        '</g>' +
        '<clipPath id="nlClip"><use href="#nlShape"/></clipPath>' +
      '</defs>' +
      '<g color="#dfe8ff"><use href="#nlShape" fill="url(#nlG)"/></g>' +
      /* 符头高光 */
      '<ellipse cx="27" cy="97" rx="6.5" ry="3" fill="#fff" opacity=".55" transform="rotate(-30 27 97)"/>' +
      '<ellipse cx="85" cy="81" rx="6.5" ry="3" fill="#fff" opacity=".55" transform="rotate(-30 85 81)"/>' +
      /* 扫过的光泽，被音符轮廓裁剪 */
      '<g clip-path="url(#nlClip)"><rect class="nl-sheen" x="-40" y="-10" width="36" height="150" fill="url(#nlS)" transform="skewX(-18)"/></g>' +
    '</svg>';

  var box = document.createElement('div');
  box.id = 'noLyr';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML =
    '<div class="nl-box">' +
      '<div class="nl-halo"></div>' +
      '<div class="nl-ring"></div><div class="nl-ring r2"></div><div class="nl-ring r3"></div>' +
      '<div class="nl-float">' + NOTE + '</div>' +
      '<i class="nl-spark s1"></i><i class="nl-spark s2"></i><i class="nl-spark s3"></i>' +
    '</div>';
  stage.appendChild(box);

  /* ---------------- 判断：当前这首歌有没有歌词 ---------------- */
  var cacheKey = '', cacheVal = true;
  function curHasLyrics(){
    var SL = window.SongLibrary;
    if(!SL || typeof SL.current !== 'function') return true;
    var id = SL.current();
    if(id == null) return true;                                   // 还没选歌：不打扰
    if(typeof SL.isMusic === 'function' && !SL.isMusic()) return true;   // 文字模式：用户自己写的卡片照常显示
    var s = null, list = SL.list();
    for(var i = 0; i < list.length; i++){ if(list[i].id === id){ s = list[i]; break; } }
    if(!s) return true;
    var lrc = s.lrc || '';
    var key = id + ':' + lrc.length;
    if(key !== cacheKey){
      cacheKey = key;
      var ok = false;
      if(lrc){
        try{ ok = parseLRC(lrc).items.length > 0; }catch(_){ ok = true; }
      }
      cacheVal = ok;
    }
    return cacheVal;
  }

  var shown = false;
  function sync(){
    var want = !curHasLyrics();
    if(want === shown) return;
    shown = want;
    stage.classList.toggle('nolyr', want);
  }

  /* 轮询足够轻（只读内存里的歌曲列表）；再配合几个事件让切歌、导入 LRC 后反应更快 */
  setInterval(sync, 300);
  ['loadedmetadata', 'emptied', 'play', 'pause'].forEach(function(ev){
    if(window.audio && audio.addEventListener) audio.addEventListener(ev, sync);
  });
  ['btnModeMusic', 'btnModeText'].forEach(function(id){
    var b = document.getElementById(id);
    if(b) b.addEventListener('click', function(){ setTimeout(sync, 0); setTimeout(sync, 450); });
  });
  sync();
})();

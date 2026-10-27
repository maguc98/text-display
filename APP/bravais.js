// APP/bravais.js — Bravais 墙面（Folia 海报墙风格：大小不一的拼贴磁贴 · 点开放大 · 与播放器联动）
(function() {
try {
  var wall = document.getElementById('bravais-wall');
  var canvas = document.getElementById('bravais-canvas');
  if (!wall || !canvas) return;

  function $(id) { return document.getElementById(id); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  var btnClose = $('bravais-close'), scrim = $('bravais-scrim'), pop = $('bravais-pop');
  var popImg = $('bravais-pop-img'), popTitle = $('bravais-pop-title'), popSub = $('bravais-pop-sub');
  var popPlay = $('bravais-pop-play'), popNext = $('bravais-pop-next');
  var tCur = $('bravais-t-cur'), tDur = $('bravais-t-dur'), track = $('bravais-track');
  var trackFill = track ? track.querySelector('i') : null;
  var fabLocate = $('bravais-locate'), fabPlay = $('bravais-fplay');
  var audioEl = $('audio');

  /* ---------- 可调参数 ---------- */
  var TAP_AUTOPLAY = true;   // 点开磁贴时是否直接播放这首歌（false：只放大，点卡片里的“播放”才播）
  var COLS = 6;              // 拼贴总列数（一屏约显示 3 列，可左右拖动看到其余）
  var GAP = 2;               // 磁贴间距 px
  var ZMIN = 0.55, ZMAX = 2.2;   // 捏合缩放范围（1 = 一屏约 3 列；<1 缩小看更多，>1 放大）
  // 「按 id 切歌」候选方法名（song-library.js 未提供，找到真实名字后放第一位）
  var PLAY_FNS = ['playId', 'playById', 'playSong', 'select', 'selectById', 'switchTo', 'setCurrent', 'goTo', 'goto', 'jumpTo', 'go'];

  var ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8.4 6.4v11.2L17.6 12z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="2.1" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="2.1" fill="currentColor"/></svg>';

  /* ==========================================================
   * 一、物理引擎（无边界：拖拽 + 惯性滑行，没有尽头也不回弹）
   * ========================================================== */
  var isDragging = false, hasMoved = false, captured = false;
  var startX = 0, startY = 0, downX = 0, downY = 0;
  var currentX = 0, currentY = 0;            // 墙面在“无限世界”里的偏移（可以无限增大/减小）
  var lastX = 0, lastY = 0, lastTime = 0;
  var velocityX = 0, velocityY = 0;          // 单位：px / 16ms
  var rafId = null, animId = null, lastFrame = 0;
  var moving = false, applyQueued = false, pumpT = 0;   // moving：墙面正在被拖动 / 惯性滑行 / 定位动画
  var FRICTION = 0.955;                      // 每 16ms 的速度保留比例，越大滑得越远

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // 滑动期间：给画布打 .moving 标记（CSS 里据此关掉封面淡入过渡），并暂停封面队列；停下后再继续
  function setMoving(v) {
    if (moving === v) return;
    moving = v;
    canvas.classList.toggle('moving', v);
    if (!v) pumpCover();
  }
  // pointermove 可能一帧来好几次：只记坐标，每帧最多写一次 transform
  function scheduleApply() {
    if (applyQueued) return;
    applyQueued = true;
    requestAnimationFrame(function() { applyQueued = false; applyTransform(); });
  }

  var cullQueued = false, lastCullX = 1e9, lastCullY = 1e9;
  var VW = 0, VH = 0;
  function measure() {
    VW = wall.clientWidth || window.innerWidth;
    VH = wall.clientHeight || window.innerHeight;
  }
  function scheduleCull() {
    if (cullQueued) return;
    cullQueued = true;
    requestAnimationFrame(function() { cullQueued = false; cull(false); });
  }

  function applyTransform() {
    // 画布只做“小范围”平移：偏移超过一个周期就换锚点并重排现有磁贴，
    // 这样不管滑多远，数值都不会无限变大。
    // 用 transform（合成层）而不是 left/top：拖动时只走合成，不触发布局重排。
    var nkx = Math.floor(-currentX / Wp), nky = Math.floor(-currentY / Hp);
    if (nkx !== anchorKx || nky !== anchorKy) {
      anchorKx = nkx; anchorKy = nky;
      repositionAll();
    }
    canvas.style.transform = 'translate3d(' + Math.round(currentX + anchorKx * Wp) + 'px, ' + Math.round(currentY + anchorKy * Hp) + 'px, 0)';
    scheduleCull();
  }

  function cancelAnim() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (animId) { cancelAnimationFrame(animId); animId = null; }
  }

  function animateTo(tx, ty) {
    cancelAnim();
    var sx = currentX, sy = currentY, t0 = performance.now(), dur = 600;
    setMoving(true);
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      currentX = sx + (tx - sx) * e;
      currentY = sy + (ty - sy) * e;
      applyTransform();
      animId = p < 1 ? requestAnimationFrame(step) : null;
      if (p >= 1) setMoving(false);
    })(t0);
  }

  // 惯性：按真实时间步进，60Hz / 120Hz 屏滑动距离一致
  function inertia(ts) {
    rafId = null;
    if (isDragging) return;
    var dt = lastFrame ? Math.min(3, (ts - lastFrame) / 16.667) : 1;
    lastFrame = ts;
    currentX += velocityX * dt;
    currentY += velocityY * dt;
    var f = Math.pow(FRICTION, dt);
    velocityX *= f; velocityY *= f;
    applyTransform();
    if (Math.abs(velocityX) > 0.08 || Math.abs(velocityY) > 0.08) {
      rafId = requestAnimationFrame(inertia);
    } else {
      velocityX = 0; velocityY = 0; lastFrame = 0;
      if (!animId) setMoving(false);
    }
  }

  wall.addEventListener('pointerdown', function(e) {
    if (e.target.closest('#bravais-close, #bravais-dock, #bravais-fab, #bravais-pop')) return;
    flushSettle();
    if (!isDragging && !pinching) pts = {};                 // 没有进行中的手势时，残留的触点一定是过期的（pointerup 丢失），清掉，避免下一次单指滑动被当成捏合
    pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinching) return;
    if (countPts() >= 2) { startPinch(); return; }          // 第二根手指落下：进入捏合
    isDragging = true; hasMoved = false; captured = false;
    downX = e.clientX; downY = e.clientY;
    startX = e.clientX - currentX; startY = e.clientY - currentY;
    lastX = e.clientX; lastY = e.clientY; lastTime = performance.now();
    velocityX = 0; velocityY = 0;
    cancelAnim();
    // 不在这里 setPointerCapture：否则 click 会被改派给 wall，磁贴点不到
  });

  wall.addEventListener('pointermove', function(e) {
    if (pts[e.pointerId]) { pts[e.pointerId].x = e.clientX; pts[e.pointerId].y = e.clientY; }
    if (pinching) { updatePinch(); return; }
    if (!isDragging) return;
    if (!hasMoved) {
      if (Math.abs(e.clientX - downX) <= 5 && Math.abs(e.clientY - downY) <= 5) return;
      hasMoved = true;
      setMoving(true);
      try { wall.setPointerCapture(e.pointerId); captured = true; } catch (_) {}
      startX = e.clientX - currentX; startY = e.clientY - currentY;
      lastX = e.clientX; lastY = e.clientY; lastTime = performance.now();
      if (popKey) closePop();                    // 拖动墙面 = 收起放大卡片
    }
    currentX = e.clientX - startX;
    currentY = e.clientY - startY;
    var now = performance.now(), dt = now - lastTime;
    if (dt > 0) {
      velocityX = (e.clientX - lastX) / dt * 16;
      velocityY = (e.clientY - lastY) / dt * 16;
    }
    lastX = e.clientX; lastY = e.clientY; lastTime = now;
    scheduleApply();
  });

  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    if (captured) { try { wall.releasePointerCapture(e.pointerId); } catch (_) {} captured = false; }
    if (performance.now() - lastTime > 80) { velocityX = 0; velocityY = 0; }   // 停住再松手：不甩出去
    velocityX = clamp(velocityX, -80, 80);
    velocityY = clamp(velocityY, -80, 80);
    lastFrame = 0;
    rafId = requestAnimationFrame(inertia);
    if (hasMoved) {
      var stopClick = function(ev) { ev.stopPropagation(); };
      wall.addEventListener('click', stopClick, true);
      setTimeout(function() { wall.removeEventListener('click', stopClick, true); }, 0);
    }
  }
  function upPtr(e) {
    delete pts[e.pointerId];
    if (pinching) { if (countPts() < 2) endPinch(); return; }
    endDrag(e);
  }
  wall.addEventListener('pointerup', upPtr);
  wall.addEventListener('pointercancel', upPtr);

  /* ----------------------------------------------------------
   * 捏合缩放：手势期间只对画布做 transform: scale（纯合成层，跟手）；
   * 松手时把缩放"落实"为新的单元格大小并重排磁贴，保证清晰、且指尖下的内容不动。
   * ---------------------------------------------------------- */
  var pts = {}, pinching = false, pinch = null, noClickUntil = 0, settleFn = null, settleRaf = 0;
  canvas.style.transformOrigin = '0 0';
  function onTouchEnd(e) {
    if (e.touches.length === 0) pts = {};
    if (pinching && e.touches.length < 2) endPinch();
  }
  wall.addEventListener('touchend', onTouchEnd, { passive: true });
  wall.addEventListener('touchcancel', onTouchEnd, { passive: true });
  function countPts() { var n = 0; for (var k in pts) n++; return n; }
  function twoPts() { var ks = Object.keys(pts); return ks.length >= 2 ? [pts[ks[0]], pts[ks[1]]] : null; }

  function startPinch() {
    var p = twoPts(); if (!p) return;
    isDragging = false; hasMoved = false; captured = false;
    cancelAnim(); velocityX = 0; velocityY = 0; lastFrame = 0;
    if (popKey) closePop(true);
    setMoving(true);
    var mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
    pinching = true;
    canvas.classList.add('pinching');                       // 捏合期间隐藏歌曲信息（避免文字跟着画布一起被放大 / 缩小）
    pinch = { d0: Math.max(10, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)), mx: mx, my: my, cx: mx, cy: my, s: 1,
              tx0: currentX + anchorKx * Wp, ty0: currentY + anchorKy * Hp, raf: 0 };
  }
  function updatePinch() {
    var p = twoPts(); if (!p || !pinch) return;
    var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    pinch.cx = (p[0].x + p[1].x) / 2; pinch.cy = (p[0].y + p[1].y) / 2;
    // 超出范围时允许多拉一点（带阻力感），松手后弹回
    pinch.s = clamp(d / pinch.d0, ZMIN * 0.85 / zoom, ZMAX * 1.15 / zoom);
    if (!pinch.raf) pinch.raf = requestAnimationFrame(pinchFrame);
  }
  function pinchFrame() {
    if (!pinch) return;
    pinch.raf = 0;
    var s = pinch.s;
    var a = pinch.cx + s * (pinch.tx0 - pinch.mx), b = pinch.cy + s * (pinch.ty0 - pinch.my);
    canvas.style.transform = 'translate3d(' + a.toFixed(2) + 'px,' + b.toFixed(2) + 'px,0) scale(' + s.toFixed(4) + ')';
    var W = VW || wall.clientWidth, H = VH || wall.clientHeight;
    // 缩小时可见的世界范围变大：按当前缩放算出需要的磁贴范围，边走边补，不留空白
    cull(true, { x0: -a / s + anchorKx * Wp - MARGIN, x1: (W - a) / s + anchorKx * Wp + MARGIN,
                 y0: -b / s + anchorKy * Hp - MARGIN, y1: (H - b) / s + anchorKy * Hp + MARGIN });
  }
  function commitZoom(r, newCell, P) {
    // 世界坐标整体乘以 r；让指尖下的内容保持在原处
    currentX = P.cx + r * (currentX - P.mx);
    currentY = P.cy + r * (currentY - P.my);
    zoom = newCell / cell0;
    setCell(newCell);
    anchorKx = Math.floor(-currentX / Wp); anchorKy = Math.floor(-currentY / Hp);
    // 网格坐标没变，现有磁贴的 key 依然有效：只改尺寸和位置，不重建 DOM、不重新设图，落实几乎瞬间完成
    for (var k in live) {
      var el = live[k], t = el._t;
      el.style.width = el.style.height = t.w + 'px';
      placeEl(el);
    }
    lastCullX = 1e9; lastCullY = 1e9;
    applyTransform();
    cull(true);
    canvas.classList.remove('pinching');                    // 新尺寸落实后，歌曲信息以原字号淡入
    // 还有一根手指没抬起：直接接着单指拖动，不用等它抬起再重新按下
    var ks = Object.keys(pts);
    if (ks.length === 1 && !pinching) {
      var q = pts[ks[0]];
      isDragging = true; hasMoved = true; captured = false;
      startX = q.x - currentX; startY = q.y - currentY;
      lastX = q.x; lastY = q.y; lastTime = performance.now();
      velocityX = 0; velocityY = 0;
      try { wall.setPointerCapture(+ks[0]); captured = true; } catch (_) {}
    } else {
      setMoving(false);
    }
  }
  function flushSettle() { if (settleFn) { var f = settleFn; settleFn = null; cancelAnimationFrame(settleRaf); f(); } }
  function endPinch() {
    if (!pinching) return;
    pinching = false;
    var P = pinch; pinch = null;
    if (P.raf) cancelAnimationFrame(P.raf);
    noClickUntil = Date.now() + 400;                         // 捏合结束时抬手不算点击磁贴
    var target = clamp(zoom * P.s, ZMIN, ZMAX);
    var newCell = Math.round(cell0 * target), r = newCell / cell;
    var s0 = P.s, t0 = performance.now(), DUR = 110;
    settleFn = function() { commitZoom(r, newCell, P); };
    if (Math.abs(s0 - r) < 0.015) { var f0 = settleFn; settleFn = null; f0(); return; }   // 已经到位：立刻落实，手指接着滑
    (function step(now) {                                    // 把画布缩放平滑收敛到取整后的 r，再落实
      var q = Math.min(1, (now - t0) / DUR), e = 1 - Math.pow(1 - q, 3), s = s0 + (r - s0) * e;
      var a = P.cx + s * (P.tx0 - P.mx), b = P.cy + s * (P.ty0 - P.my);
      canvas.style.transform = 'translate3d(' + a.toFixed(2) + 'px,' + b.toFixed(2) + 'px,0) scale(' + s.toFixed(4) + ')';
      if (q < 1) settleRaf = requestAnimationFrame(step);
      else { var f = settleFn; settleFn = null; if (f) f(); }
    })(t0);
  }

  /* ==========================================================
   * 二、与播放器的对接
   *   已确认（player.js / mini-player.js）：SongLibrary.list()/current()/step(±1)，
   *   全局 playing、setPlay(v)、goNext()、#audio。
   *   未确认（song-library.js 未提供）：按 id 切到某一首 → playSong()
   * ========================================================== */
  function lib() {
    return (window.SongLibrary && typeof window.SongLibrary.list === 'function') ? window.SongLibrary : null;
  }
  function getCurrentId() {
    var s = lib();
    try { return s && typeof s.current === 'function' ? s.current() : null; } catch (_) { return null; }
  }
  function isPlaying() {
    try { if (typeof playing !== 'undefined') return !!playing; } catch (_) {}
    return audioEl ? !audioEl.paused : false;
  }
  function setPlayState(v) {
    try { if (typeof setPlay === 'function') { setPlay(v); return; } } catch (_) {}
    if (!audioEl) return;
    if (v) { var p = audioEl.play(); if (p && p.catch) p.catch(function() {}); }
    else audioEl.pause();
  }
  function togglePlay() { setPlayState(!isPlaying()); setTimeout(tick, 60); }
  function nextSong() {
    try { if (typeof goNext === 'function') { goNext(); setTimeout(tick, 120); return; } } catch (_) {}
    var s = lib();
    if (s && typeof s.step === 'function') s.step(1);
    setTimeout(tick, 120);
  }

  var playToken = 0;
  function playSong(it) {
    var s = lib();
    if (!s) return;
    var token = ++playToken, name = null, i;
    for (i = 0; i < PLAY_FNS.length; i++) {
      if (typeof s[PLAY_FNS[i]] === 'function') { name = PLAY_FNS[i]; break; }
    }
    if (!name) return failPlay('noapi');
    try { s[name](it.id); } catch (err) { return failPlay('err', err); }
    var t0 = Date.now();
    (function wait() {
      if (token !== playToken) return;
      if (getCurrentId() === it.id) {
        setTimeout(function() { if (token === playToken && !isPlaying()) setPlayState(true); tick(); }, 150);
        return;
      }
      if (Date.now() - t0 > 2000) return failPlay('nochange');
      setTimeout(wait, 100);
    })();
  }
  function failPlay(why, err) {
    var s = lib();
    try { console.warn('[Bravais] 没能切到这首歌（' + why + '）。SongLibrary 现有成员：', s ? Object.keys(s) : '(无)', err || ''); } catch (_) {}
    if (popSub && popKey) popSub.textContent = '无法切歌：曲库里没找到按 id 播放的方法（详见控制台）';
  }

  /* ==========================================================
   * 三、无限拼贴：一块“周期图案”上下左右无限重复，只渲染屏幕附近的磁贴
   * ========================================================== */
  function pad3(n) { n = String(n); return n.length >= 3 ? n : ('000' + n).slice(-3); }
  function fmt(sec) {
    if (!sec || !isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  var items = [], itemsById = {};
  var base = [], tilesById = {};              // base：周期图案里的所有磁贴（按 y 排序）
  var Wp = 1, Hp = 1, cell = 1, cell0 = 1, zoom = 1, shiftRows = 0, ROWS = 1;
  var anchorKx = 0, anchorKy = 0;
  var live = Object.create(null), pool = [];  // 当前在 DOM 里的磁贴 / 回收池
  var demoMode = false, selKey = null, popKey = null, popTile = null, popKx = 0, popKy = 0;
  var lastCur, lastPlay, lastCover, tickTimer = null;
  var switchedAt = 0, staleCover = '';
  var MARGIN = 380;                           // 视口外预先生成的范围

  /* ---- 封面来源 ----
   * 曲库条目里的 thumb 是很小的缩略图（放大到磁贴会发糊）。优先级：
   *   ① 正在播放的歌：window.__musicCover（完整封面）
   *   ② 本次会话里这首歌播过一次后记下的完整封面
   *   ③ 条目里其它“图片类”字段中最大的一张（data:image 或名字带 cover/pic/img 的地址）
   *   ④ 实在没有才用 thumb
   */
  var coverCache = Object.create(null);
  var coverLogged = false;
  function isImgLike(k, v) {
    if (typeof v !== 'string' || !v) return false;
    if (/^data:image\//.test(v)) return true;
    return /cover|pic|img|image|art|poster|photo/i.test(k) && /^(blob:|https?:\/\/|\.{0,2}\/)/.test(v);
  }
  function bestCoverInfo(x, curId) {
    if (x.id === curId && window.__musicCover) return { src: window.__musicCover, field: '__musicCover' };
    if (coverCache[x.id]) return { src: coverCache[x.id], field: '会话缓存' };
    var best = '', field = '';
    for (var k in x) {
      var v = x[k];
      if (k === 'thumb' || !isImgLike(k, v)) continue;
      if (v.length > best.length) { best = v; field = k; }
    }
    if (best) return { src: best, field: field };
    return { src: x.thumb || '', field: x.thumb ? 'thumb' : '' };
  }
  function coverOf(x, curId) { return bestCoverInfo(x, curId).src; }

  /* 列表里的 thumb 只有 96px，磁贴放大后会糊。可见磁贴按队列去 IndexedDB 取完整封面（640px）。 */
  var coverLoading = Object.create(null);
  var coverTried = Object.create(null);
  var coverQueue = [];
  var coverInflight = 0;
  var COVER_MAX = 3;
  function applyCover(id, src) {
    if (!id || !src) return;
    coverCache[id] = src;
    var cu = itemsById[id];
    if (cu) { cu.img = src; cu.hasCover = true; }
    for (var k in live) {
      var x = live[k]._t && live[k]._t.it;
      if (x && x.id === id) { x.img = src; x.hasCover = true; setImg(live[k], x); }
    }
    if (popTile && popTile.it && popTile.it.id === id) popImg.setAttribute('src', src);
  }
  function pumpCover() {
    var s = lib();
    if (!s || typeof s.cover !== 'function') return;
    if (moving) { clearTimeout(pumpT); pumpT = setTimeout(pumpCover, 200); return; }   // 滑动中不去解码 / 换大图，停下再取
    while (coverInflight < COVER_MAX && coverQueue.length) {
      var it = coverQueue.shift();
      if (!it) continue;
      if (coverCache[it.id] || coverTried[it.id]) { coverLoading[it.id] = false; continue; }
      coverInflight++;
      (function(id) {
        s.cover(id).then(function(src) {
          coverInflight--;
          coverLoading[id] = false;
          coverTried[id] = true;
          applyCover(id, src);
          pumpCover();
        }).catch(function() {
          coverInflight--;
          coverLoading[id] = false;
          coverTried[id] = true;
          pumpCover();
        });
      })(it.id);
    }
  }
  function requestFullCover(it) {
    if (!it || !it.id || demoMode) return;
    if (coverCache[it.id]) { applyCover(it.id, coverCache[it.id]); return; }
    if (it.img && it.thumb && it.img !== it.thumb) { coverCache[it.id] = it.img; return; }
    if (coverLoading[it.id] || coverTried[it.id]) return;
    var s = lib();
    if (!s || typeof s.cover !== 'function') return;
    coverLoading[it.id] = true;
    coverQueue.push(it);
    pumpCover();
  }

  // 只打一次：把曲库条目有哪些字段、封面取自哪里、缩略图实际多少像素写进日志，方便排查
  function logCoverInfo(sample, curId) {
    if (coverLogged || !sample) return;
    coverLogged = true;
    try {
      var info = bestCoverInfo(sample, curId);
      var line = '[Bravais] 曲库条目字段：' + Object.keys(sample).join(',') + '｜首条封面取自：' + (info.field || '无');
      if (sample.thumb) {
        var im = new Image();
        im.onload = function() { console.info(line + '｜thumb 实际像素：' + im.naturalWidth + '×' + im.naturalHeight); };
        im.onerror = function() { console.info(line + '｜thumb 读取失败'); };
        im.src = sample.thumb;
      } else console.info(line + '｜该条目没有 thumb');
    } catch (_) {}
  }

  function buildItems() {
    items = []; itemsById = {}; demoMode = false;
    var s = lib();
    if (s) {
      var curId = getCurrentId(), list = [];
      try { list = s.list() || []; } catch (_) {}
      logCoverInfo(list[0], curId);
      items = list.map(function(x) {
        return { id: x.id, title: x.name || '未知歌曲', desc: x.artist || '未知歌手',
                 album: x.album || '', img: coverOf(x, curId), thumb: x.thumb || '' };
      });
    }
    if (!items.length) {
      demoMode = true;
      items = Array.from({ length: 30 }, function(_, i) {
        return { id: 'demo-' + i, title: '示例歌曲 ' + (i + 1), desc: '示例歌手', album: '',
                 img: 'https://picsum.photos/400/400?random=' + i };
      });
    }
    items.forEach(function(it) { it.hasCover = !!it.img; itemsById[it.id] = it; });
  }

  // 磁贴尺寸：1 / 2 / 3 个单元，按序号确定性地“随机”，同一曲库每次排版一致
  function sizeFor(i) {
    var r = (((i + 1) * 2654435761) >>> 0) % 100;
    return r < 60 ? 1 : (r < 90 ? 2 : 3);
  }

  // 第 kx 列周期相对第 0 列整体向下错开若干行，让重复出现的歌不会横向对齐
  function shiftOf(kx) {
    return ((((kx * shiftRows) % ROWS) + ROWS) % ROWS) * cell;
  }

  // 排出一块 COLS × ROWS 的矩形，要求：每个格子都被占满（没有洞），
  // 这样上下左右复制出去才能严丝合缝。歌不够时按顺序循环补满。
  function layout(W, H) {
    var u0 = Math.floor((W - 2 * GAP) / 3);
    cell0 = u0 + GAP;                                     // zoom = 1 时的单元格大小
    cell = Math.round(cell0 * zoom);
    var n = items.length, area = 0, i;
    for (i = 0; i < n; i++) { var sz = sizeFor(i); area += sz * sz; }
    var minRows = Math.ceil((2 * H) / (cell0 * ZMIN));     // 周期至少 2 屏高（按最小缩放算，缩放时网格行数不变，图案才不会跳）
    ROWS = Math.max(minRows, Math.ceil(area / COLS));

    var occ = [], r;
    for (r = 0; r < ROWS; r++) occ.push(new Uint8Array(COLS));
    var rowPtr = 0, freeCells = ROWS * COLS;
    base = []; tilesById = {};

    function isFree(r0, c0, s) {
      for (var dr = 0; dr < s; dr++) for (var dc = 0; dc < s; dc++) if (occ[r0 + dr][c0 + dc]) return false;
      return true;
    }
    function rowFull(row) { for (var k = 0; k < COLS; k++) if (!row[k]) return false; return true; }
    // 尽量放原尺寸，放不下就缩小，直到 1×1（只要还有空格，1×1 一定放得下）
    function place(idx, s) {
      for (; s >= 1; s--) {
        for (var r0 = rowPtr; r0 <= ROWS - s; r0++) {
          for (var c0 = 0; c0 <= COLS - s; c0++) {
            if (!isFree(r0, c0, s)) continue;
            for (var dr = 0; dr < s; dr++) for (var dc = 0; dc < s; dc++) occ[r0 + dr][c0 + dc] = 1;
            var t = { it: items[idx], idx: idx, s: s, gx: c0, gy: r0, x: c0 * cell, y: r0 * cell, w: s * cell - GAP };
            base.push(t);
            (tilesById[t.it.id] || (tilesById[t.it.id] = [])).push(t);
            freeCells -= s * s;
            while (rowPtr < ROWS && rowFull(occ[rowPtr])) rowPtr++;
            return true;
          }
        }
      }
      return false;
    }

    for (i = 0; i < n && freeCells > 0; i++) place(i, sizeFor(i));
    var j = 0, guard = 0;
    while (freeCells > 0 && guard++ < ROWS * COLS * 2) {   // 歌曲没占满（或被缩小）时，循环补满
      place(j % n, sizeFor(n + j)); j++;
    }
    base.sort(function(a, b) { return a.y - b.y || a.x - b.x; });
    shiftRows = Math.max(1, Math.round(ROWS * 0.37));
    setCell(cell);
  }

  // 改单元格大小：磁贴按网格坐标重新算像素位置（缩放只改这一个数）
  function setCell(c) {
    cell = c;
    for (var i = 0; i < base.length; i++) {
      var t = base[i];
      t.x = t.gx * cell; t.y = t.gy * cell; t.w = t.s * cell - GAP;
    }
    Wp = COLS * cell; Hp = ROWS * cell;
    // 歌曲信息的缩放系数：缩小时跟着磁贴等比变小（相对磁贴的大小和缩小前一致）；放大时保持原字号，不跟着变大
    canvas.style.setProperty('--bw-t', String(Math.min(1, cell / (cell0 || cell))));
  }

  function renderWall() {
    buildItems();
    measure();
    layout(VW, VH);
    Object.keys(live).forEach(function(k) { if (live[k].parentNode) live[k].parentNode.removeChild(live[k]); });
    live = Object.create(null); pool = [];
    canvas.innerHTML = '';
    anchorKx = 0; anchorKy = 0;
    selKey = null; popKey = null; popTile = null;
    lastCur = undefined; lastPlay = undefined; lastCover = undefined;
    lastCullX = 1e9; lastCullY = 1e9;
    pop.classList.remove('show', 'anim', 'open');
    wall.classList.remove('has-pop');
  }

  /* ---- 磁贴元素：创建 / 绑定 / 回收 ---- */
  function makeTile() {
    var el = document.createElement('div');
    el.className = 'bw-tile';
    el.innerHTML = '<img alt="" decoding="async"><span class="bw-no"></span>' +
      '<span class="bw-eq"><i></i><i></i><i></i></span>' +
      '<div class="bw-meta"><b></b><span></span></div>';
    el._img = el.children[0]; el._no = el.children[1];
    el._tt = el.querySelector('.bw-meta b'); el._ar = el.querySelector('.bw-meta span');
    canvas.appendChild(el);
    return el;
  }
  function placeEl(el) {
    var t = el._t;
    el.style.left = (t.x + el._kx * Wp - anchorKx * Wp) + 'px';
    el.style.top = (t.y + el._ky * Hp + shiftOf(el._kx) - anchorKy * Hp) + 'px';
  }
  function repositionAll() { for (var k in live) placeEl(live[k]); }
  function stateClasses(el) {
    var id = el._t.it.id, isCur = id === lastCur;
    el.classList.toggle('now', isCur);
    el.classList.toggle('playing', isCur && !!lastPlay);
    el.classList.toggle('sel', el._key === selKey);
    el.classList.toggle('lift', el._key === popKey);
  }
  function setImg(el, it) {
    var im = el._img, src = it.hasCover ? it.img : '';
    el._wantSrc = src;
    if (!src) {
      if (im.hasAttribute('src')) { im.removeAttribute('src'); im.classList.remove('ld'); }
      return;
    }
    if (im.getAttribute('src') === src) return;
    if (im.getAttribute('src')) {
      var pre = new Image();
      pre.onload = function() {
        if (el._wantSrc !== src) return;
        im.setAttribute('src', src);
        im.classList.add('ld');
      };
      pre.src = src;
    } else {
      im.classList.remove('ld');
      im.setAttribute('src', src);
    }
  }
  function bindTile(el, t, kx, ky, key) {
    el._t = t; el._kx = kx; el._ky = ky; el._key = key;
    el.className = 'bw-tile s' + t.s;
    el.style.display = '';
    el.style.width = el.style.height = t.w + 'px';
    placeEl(el);
    el._no.textContent = pad3(t.idx + 1);
    el._tt.textContent = t.it.title;
    el._ar.textContent = t.it.desc;
    setImg(el, t.it);
    requestFullCover(t.it);
    stateClasses(el);
  }
  function restyleAll() { for (var k in live) stateClasses(live[k]); }

  // 二分查找：base 按 y 升序，找第一个 y >= v 的下标
  function lowerBound(v) {
    var lo = 0, hi = base.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (base[mid].y < v) lo = mid + 1; else hi = mid; }
    return lo;
  }

  // 只保留视口附近的磁贴：新进入范围的创建/复用，离开范围的回收
  function cull(force, rect) {
    if (!base.length) return;
    if (!rect && !force && Math.abs(currentX - lastCullX) < 60 && Math.abs(currentY - lastCullY) < 60) return;
    if (!rect) { lastCullX = currentX; lastCullY = currentY; }
    var W = VW || wall.clientWidth, H = VH || wall.clientHeight;
    var x0 = rect ? rect.x0 : -currentX - MARGIN, x1 = rect ? rect.x1 : -currentX + W + MARGIN;
    var y0 = rect ? rect.y0 : -currentY - MARGIN, y1 = rect ? rect.y1 : -currentY + H + MARGIN;
    var maxH = 3 * cell, need = Object.create(null);

    for (var kx = Math.floor(x0 / Wp), kxe = Math.floor(x1 / Wp); kx <= kxe; kx++) {
      var sh = shiftOf(kx);
      for (var ky = Math.floor((y0 - sh) / Hp), kye = Math.floor((y1 - sh) / Hp); ky <= kye; ky++) {
        var ox = kx * Wp, oy = ky * Hp + sh;
        var lx0 = x0 - ox, lx1 = x1 - ox, ly0 = y0 - oy, ly1 = y1 - oy;
        for (var i = lowerBound(ly0 - maxH); i < base.length && base[i].y <= ly1; i++) {
          var t = base[i];
          if (t.x > lx1 || t.x + t.w < lx0 || t.y + t.w < ly0) continue;
          var key = kx + ',' + ky + ',' + i;
          need[key] = true;
          if (!live[key]) {
            var el = pool.pop() || makeTile();
            live[key] = el;
            bindTile(el, t, kx, ky, key);
          }
        }
      }
    }
    for (var k in live) {
      if (need[k]) continue;
      var old = live[k];
      old.style.display = 'none';
      old.classList.remove('lift');
      pool.push(old);
      delete live[k];
    }
  }

  canvas.addEventListener('load', function(e) {
    if (e.target && e.target.tagName === 'IMG') e.target.classList.add('ld');
  }, true);

  canvas.addEventListener('error', function(e) {
    var im = e.target;
    if (!im || im.tagName !== 'IMG') return;
    var el = im.parentNode, it = el && el._t && el._t.it;
    if (!it || !it.thumb || im.getAttribute('src') === it.thumb) return;
    it.img = it.thumb;                       // 大图读不出来：退回缩略图，不留破图
    im.setAttribute('src', it.thumb);
  }, true);

  canvas.addEventListener('click', function(e) {
    if (Date.now() < noClickUntil) return;
    var t = e.target.closest ? e.target.closest('.bw-tile') : null;
    if (t && t._t) onTileTap(t);
  });

  /* ==========================================================
   * 四、点开磁贴 → 原地放大成卡片
   * ========================================================== */
  function onTileTap(el) {
    var it = el._t.it;
    openPop(el);
    if (TAP_AUTOPLAY && !demoMode && it.id !== getCurrentId()) playSong(it);
  }

  function tileScreenRect(t, kx, ky) {
    return { l: t.x + kx * Wp + currentX, t: t.y + ky * Hp + shiftOf(kx) + currentY, w: t.w };
  }
  function setPopRect(l, t, w, h) {
    pop.style.left = l + 'px'; pop.style.top = t + 'px';
    pop.style.width = w + 'px'; pop.style.height = h + 'px';
  }

  function openPop(el) {
    var t = el._t, it = t.it, key = el._key;
    if (popKey === key) return;
    if (popKey) closePop(true);
    var oldSel = live[selKey];
    selKey = key; popKey = key; popTile = t; popKx = el._kx; popKy = el._ky;
    if (oldSel) stateClasses(oldSel);
    stateClasses(el);

    popTitle.textContent = it.title;
    var src = el._img.getAttribute('src');
    if (src) popImg.setAttribute('src', src);
    else if (it.hasCover) popImg.setAttribute('src', it.img);
    else popImg.removeAttribute('src');
    syncPop(getCurrentId(), isPlaying());

    var r = tileScreenRect(t, popKx, popKy);
    pop.classList.remove('anim', 'open');
    setPopRect(r.l, r.t, r.w, r.w);                          // 从磁贴自己的位置出发
    pop.classList.add('show');
    wall.classList.add('has-pop');
    void pop.offsetWidth;

    var W = VW || wall.clientWidth, H = VH || wall.clientHeight;
    var w = Math.min(W - 36, 360), h = Math.min(Math.round(w * 1.2), Math.round(H * 0.64));
    pop.classList.add('anim', 'open');
    setPopRect(Math.round((W - w) / 2), Math.round((H - h) / 2 - 24), w, h);
  }

  function closePop(instant) {
    if (!popKey) return;
    var key = popKey, t = popTile, kx = popKx, ky = popKy;
    popKey = null;
    wall.classList.remove('has-pop');
    pop.classList.remove('open');
    var restore = function() { var el = live[key]; if (el) stateClasses(el); };
    if (instant) { pop.classList.remove('show', 'anim'); restore(); return; }
    var r = tileScreenRect(t, kx, ky);
    setPopRect(r.l, r.t, r.w, r.w);                          // 缩回磁贴
    setTimeout(function() {
      restore();
      if (!popKey) pop.classList.remove('show', 'anim');
    }, 480);
  }
  on(scrim, 'click', function() { closePop(); });

  on(popPlay, 'click', function(e) {
    e.stopPropagation();
    if (!popTile || demoMode) return;
    if (popTile.it.id === getCurrentId()) togglePlay(); else playSong(popTile.it);
  });
  on(popNext, 'click', function(e) { e.stopPropagation(); if (!demoMode) nextSong(); });

  function syncPop(cur, pl) {
    if (!popKey || !popTile) return;
    var it = popTile.it;
    var isCur = !demoMode && it.id === cur;
    var sub = it.desc + (it.album ? ' · ' + it.album : '');
    if (isCur && audioEl && audioEl.duration && isFinite(audioEl.duration)) sub += ' · ' + fmt(audioEl.duration);
    popSub.textContent = sub;
    if (popPlay) {
      popPlay.querySelector('.ic').innerHTML = (isCur && pl) ? ICON_PAUSE : ICON_PLAY;
      popPlay.querySelector('.tx').textContent = (isCur && pl) ? '暂停' : '播放';
    }
  }

  /* ==========================================================
   * 五、底部进度胶囊 / 悬浮按钮 / 定位
   * ========================================================== */
  function syncDock() {
    var d = audioEl && audioEl.duration, t = audioEl ? audioEl.currentTime : 0;
    var ok = d && isFinite(d);
    if (tCur) tCur.textContent = fmt(t);
    if (tDur) tDur.textContent = fmt(ok ? d : 0);
    if (trackFill) trackFill.style.transform = 'scaleX(' + (ok ? clamp(t / d, 0, 1) : 0) + ')';
  }
  function seekFrom(e) {
    var d = audioEl && audioEl.duration;
    if (!d || !isFinite(d)) return;
    var r = track.getBoundingClientRect();
    audioEl.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * d;
    syncDock();
  }
  if (track) {
    var seeking = false;
    track.addEventListener('pointerdown', function(e) {
      seeking = true; try { track.setPointerCapture(e.pointerId); } catch (_) {}
      if (trackFill) trackFill.style.transition = 'none';
      seekFrom(e);
    });
    track.addEventListener('pointermove', function(e) { if (seeking) seekFrom(e); });
    var endSeek = function() { seeking = false; if (trackFill) trackFill.style.transition = ''; };
    track.addEventListener('pointerup', endSeek);
    track.addEventListener('pointercancel', endSeek);
  }

  // 世界是无限重复的，同一首歌有很多“分身”；找离屏幕中心最近的那一个
  function nearestCopy(id) {
    var list = tilesById[id];
    if (!list || !list.length) return null;
    var W = VW || wall.clientWidth, H = VH || wall.clientHeight;
    var cx = -currentX + W / 2, cy = -currentY + H * 0.44, best = null;
    list.forEach(function(t) {
      var kx = Math.round((cx - (t.x + t.w / 2)) / Wp);
      var ky = Math.round((cy - (t.y + t.w / 2) - shiftOf(kx)) / Hp);
      var wx = t.x + kx * Wp + t.w / 2, wy = t.y + ky * Hp + shiftOf(kx) + t.w / 2;
      var d = (wx - cx) * (wx - cx) + (wy - cy) * (wy - cy);
      if (!best || d < best.d) best = { t: t, kx: kx, ky: ky, wx: wx, wy: wy, d: d };
    });
    return best;
  }
  function copyTarget(c) {
    var W = VW || wall.clientWidth, H = VH || wall.clientHeight;
    return { x: W / 2 - c.wx, y: H * 0.44 - c.wy };
  }
  function copyVisible(c) {
    var W = VW || wall.clientWidth, H = VH || wall.clientHeight;
    var sx = c.wx - c.t.w / 2 + currentX, sy = c.wy - c.t.w / 2 + currentY;
    return !(sx + c.t.w < 10 || sx > W - 10 || sy + c.t.w < 70 || sy > H - 90);
  }
  function locateCurrent() {
    var c = demoMode ? null : nearestCopy(getCurrentId());
    if (!c) return;
    closePop();
    var g = copyTarget(c);
    animateTo(g.x, g.y);
  }
  on(fabLocate, 'click', function(e) { e.stopPropagation(); locateCurrent(); });
  on(fabPlay, 'click', function(e) {
    e.stopPropagation();
    if (!demoMode && getCurrentId() != null) togglePlay();
  });
  on(btnClose, 'click', function() { window.closeBravaisWall(); });

  /* ==========================================================
   * 六、与播放器对账（每 300ms + 音频事件触发；只在状态变化时才动 DOM）
   * ========================================================== */
  function tick() {
    if (!wall.classList.contains('show')) return;
    var cur = getCurrentId(), pl = isPlaying();

    if (cur !== lastCur) {                         // 换歌了（墙内点的、迷你播放器切的、自动下一首）
      switchedAt = (lastCur === undefined) ? 0 : Date.now();
      staleCover = window.__musicCover || '';      // 刚切歌时它可能还是上一首的封面
      lastCur = cur; lastPlay = pl; lastCover = undefined;
      restyleAll();
      var c = (!demoMode && !popKey && !isDragging) ? nearestCopy(cur) : null;
      if (c && !copyVisible(c)) { var g = copyTarget(c); animateTo(g.x, g.y); }
    }
    if (pl !== lastPlay) {
      lastPlay = pl;
      restyleAll();
    }
    if (fabPlay) {
      var want = pl ? 'p' : 'a';
      if (fabPlay._s !== want) { fabPlay._s = want; fabPlay.innerHTML = pl ? ICON_PAUSE : ICON_PLAY; }
    }
    var cv = window.__musicCover || '';
    var fresh = cv && (cv !== staleCover || Date.now() - switchedAt > 1500);
    if (cv !== lastCover && fresh) {               // 当前歌的完整封面就位：磁贴和放大卡片一起换成清晰图
      lastCover = cv;
      var cu = itemsById[cur];
      if (cu && cv) {
        coverCache[cur] = cv;
        cu.img = cv; cu.hasCover = true;
        for (var k in live) if (live[k]._t.it === cu) setImg(live[k], cu);
        if (popTile && popTile.it === cu) popImg.setAttribute('src', cv);
      }
    }
    syncPop(cur, pl);
    syncDock();
  }
  ['play', 'pause', 'ended', 'loadedmetadata', 'emptied', 'durationchange'].forEach(function(ev) {
    if (audioEl) audioEl.addEventListener(ev, function() { setTimeout(tick, 30); });
  });
  if (audioEl) audioEl.addEventListener('timeupdate', function() { if (wall.classList.contains('show')) syncDock(); });

  /* ==========================================================
   * 七、开关 API
   * ========================================================== */
  window.openBravaisWall = function() {
    renderWall();
    velocityX = 0; velocityY = 0;
    var c = demoMode ? null : nearestCopy(getCurrentId());
    if (c) { var g = copyTarget(c); currentX = g.x; currentY = g.y; }   // 直接定位到正在播放的歌
    else { currentX = 0; currentY = 0; }
    applyTransform();
    cull(true);
    wall.classList.remove('settled');
    wall.classList.add('show');
    wall.setAttribute('aria-hidden', 'false');
    // 墙面挡住整个舞台：暂停背后的渲染（歌词/商籁 Pixi），把 GPU 全留给墙面拖动
    window.__bravaisOpen = true;
    try { if (window.SonnetAdapter && SonnetAdapter.setSuspended) SonnetAdapter.setSuspended(true); } catch (_) {}
    clearInterval(tickTimer);
    tickTimer = setInterval(tick, 300);
    tick();
    var settleMs = (typeof uiT === 'function') ? uiT(650) : 650;
    setTimeout(function() {
      if (!wall.classList.contains('show')) return;
      wall.classList.add('settled');
      document.body.classList.add('bravais-open');   // 入场淡入结束后再藏舞台，避免黑闪
    }, settleMs);
  };

  window.closeBravaisWall = function() {
    cancelAnim();
    pinching = false; pinch = null; pts = {}; flushSettle();
    canvas.classList.remove('pinching');
    setMoving(false);
    clearInterval(tickTimer); tickTimer = null;
    playToken++;
    isDragging = false;
    closePop(true);
    wall.classList.remove('settled', 'show');
    wall.setAttribute('aria-hidden', 'true');
    window.__bravaisOpen = false;
    document.body.classList.remove('bravais-open');
    try { if (window.SonnetAdapter && SonnetAdapter.setSuspended) SonnetAdapter.setSuspended(false); } catch (_) {}
    try { if (typeof deferUpdate === 'function') deferUpdate(); } catch (_) {}
  };

  window.addEventListener('resize', function() {
    if (!wall.classList.contains('show')) return;
    closePop(true);
    measure();
    layout(VW, VH);
    Object.keys(live).forEach(function(k) { live[k].style.display = 'none'; pool.push(live[k]); });
    live = Object.create(null);
    applyTransform();
    cull(true);
  });
} catch (err) {
  // file:// 预览里全局报错常只显示 "Script error."，这里把真实原因打出来
  console.error('[Bravais] 初始化失败：' + (err && err.message), err && err.stack);
}
})();

// 注入 Beta 选项
(function injectBravaisBetaEntry() {
  function checkAndInject() {
    var betaBody = document.getElementById('betaBody');
    if (!betaBody || document.getElementById('btnOpenBravais')) return false;

    var btn = document.createElement('button');
    btn.id = 'btnOpenBravais';
    btn.type = 'button';
    btn.className = 'chip';
    btn.style.cssText = 'width: 100%; padding: 11px 0; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 600;';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" style="width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;">' +
        '<rect x="3" y="3" width="7" height="7" rx="1"></rect>' +
        '<rect x="14" y="3" width="7" height="7" rx="1"></rect>' +
        '<rect x="14" y="14" width="7" height="7" rx="1"></rect>' +
        '<rect x="3" y="14" width="7" height="7" rx="1"></rect>' +
      '</svg>Bravais 墙面';

    btn.addEventListener('click', function(e) {
      e.preventDefault(); e.stopPropagation();
      if (typeof qOpen === 'function') qOpen(false);
      if (window.openBravaisWall) window.openBravaisWall();
    });

    var tip = betaBody.querySelector('.qtip');
    if (tip && tip.nextSibling) betaBody.insertBefore(btn, tip.nextSibling);
    else betaBody.appendChild(btn);
    return true;
  }

  if (!checkAndInject()) {
    var mo = new MutationObserver(function() { if (checkAndInject()) mo.disconnect(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }
})();

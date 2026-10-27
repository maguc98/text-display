/*!
 * beat.js · 节拍检测 + 律动联动
 * ---------------------------------------------------------------------------
 * 功能：
 *   1. 实时分析 <audio id="audio">，用低频能量（底鼓/贝斯频段 ~43–258Hz）
 *      + 自适应阈值 + 动态冷却检测节拍（onset detection）
 *   2. 每拍出 'beat' 事件（window 级 CustomEvent），供其它模块复用
 *   3. 内置联动：
 *      · 控制栏音符按钮 #cfs 跟着节拍跳动
 *      · AI 灵动岛胶囊（.aiui-pill）跟着节拍呼吸
 *      · 小眼睛每拍轻轻压弹（squash & stretch），每 4 拍眨一次
 *      · 每 8 拍彩虹圆球（.aiui-orb）星芒迸发
 *
 * 用法：在 index.html 的脚本区（ai-ui.js 之后）加一行：
 *     <script src="./APP/beat.js?v=1"></script>
 *
 * 对外接口（可选）：
 *   window.Beat.on(cb)   订阅节拍，cb(strength 0.35~2)
 *   window.Beat.bpm      估算的当前 BPM（0 = 还没积累够）
 *   window.Beat.beating  是否正在出拍
 * ---------------------------------------------------------------------------
 */
;(function () {
  'use strict';
  if (window.__beatLoaded) return;
  window.__beatLoaded = true;

  var audio = document.getElementById('audio');
  if (!audio) { console.warn('[Beat] 找不到 #audio'); return; }

  /* =========================================================================
   * 1. Web Audio 分析链路
   * ========================================================================= */
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, analyser = null, freq = null, ready = false;

  function ensureCtx() {
    if (ctx) return ready;
    if (!AC) { console.warn('[Beat] 当前环境不支持 Web Audio'); return false; }
    try {
      ctx = new AC();
      var src = ctx.createMediaElementSource(audio);   // 注意：一个 audio 元素只能接一次
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;                         // @44.1kHz 每档 ≈ 43Hz
      analyser.smoothingTimeConstant = 0.45;           // 低一点，响应更跟手
      freq = new Uint8Array(analyser.frequencyBinCount);
      src.connect(analyser);
      analyser.connect(ctx.destination);
      ready = true;
    } catch (e) {
      ready = false;
      console.warn('[Beat] 创建 MediaElementSource 失败：', e);
    }
    return ready;
  }

  // iOS：AudioContext 可能被创建在 gesture 之外而 suspended，这里兜底
  ['pointerdown', 'touchend', 'keydown'].forEach(function (n) {
    document.addEventListener(n, function () {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(function () {});
    }, { capture: true, passive: true });
  });

  /* =========================================================================
   * 2. 节拍检测：低频能量 + 滑动平均自适应阈值 + 动态冷却
   * ========================================================================= */
  var HIST = 45;                 // 历史窗口（帧），约 0.7s
  var hist = [], hSum = 0;
  var lastBeat = 0, lastInterval = 400;
  var intervals = [];            // 最近若干拍间隔，用来估 BPM
  var beatCount = 0;
  var running = false, raf = 0;
  var cbs = [];

  function median(a) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; });
    return s[Math.floor(s.length / 2)];
  }

  function bassEnergy() {
    // ~43–258Hz：底鼓 / 贝斯所在频段，节拍最稳，人声干扰小
    var e = 0;
    for (var i = 1; i <= 5; i++) e += freq[i];
    return e / 5 / 255;
  }

  function reset() {             // 切歌 / 重新加载时清状态，阈值重新自适应
    hist.length = 0; hSum = 0;
    intervals.length = 0;
    lastBeat = 0; lastInterval = 400;
  }

  function loop() {
    raf = 0;
    if (!running) return;
    if (audio.paused || audio.ended) { running = false; return; }
    raf = requestAnimationFrame(loop);

    analyser.getByteFrequencyData(freq);
    var e = bassEnergy();

    var avg = hist.length ? hSum / hist.length : e;
    var now = performance.now();
    var since = now - lastBeat;
    // 冷却时间跟随最近节拍间距：快歌防连发，慢歌不漏拍
    var cool = Math.max(210, Math.min(480, lastInterval * 0.55));

    if (hist.length >= 12 && e > avg * 1.38 + 0.015 && e > 0.10 && since > cool) {
      if (lastBeat) {
        var itv = now - lastBeat;
        if (itv > 240 && itv < 2000) {
          intervals.push(itv);
          if (intervals.length > 10) intervals.shift();
          lastInterval = median(intervals);
        }
      }
      lastBeat = now;
      beatCount++;
      var strength = Math.min(2, Math.max(0.35, (e - avg) / Math.max(avg, 0.02)));
      fire(strength);
    }

    hist.push(e); hSum += e;
    if (hist.length > HIST) hSum -= hist.shift();
  }

  function start() {
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') { ctx.resume().catch(function () {}); }
    if (running) return;
    running = true;
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; }

  /* =========================================================================
   * 3. 视觉联动：音符按钮 + AI 灵动岛
   * ========================================================================= */
  var pillEl = null, eyesEl = null, eyeEls = null, cfsEl = null, orbEl = null;
  function findEls() {           // 惰性查找 + 断线重连（ai-ui 的节点是运行时生成的）
    if (!pillEl || !pillEl.isConnected) pillEl = document.querySelector('.aiui-pill');
    if (!eyesEl || !eyesEl.isConnected) eyesEl = document.querySelector('.aiui-eyes');
    if (!eyeEls || !eyeEls[0] || !eyeEls[0].isConnected)
      eyeEls = [].slice.call(document.querySelectorAll('.aiui-eye'));
    if (!cfsEl || !cfsEl.isConnected) cfsEl = document.getElementById('cfs');
    if (!orbEl || !orbEl.isConnected) orbEl = document.querySelector('.aiui-orb');
  }

  function lowPower() { return document.body.classList.contains('low-power'); }

  // 用独立的 scale 属性做脉冲：不和 qPress 的 transform、ai-ui 舞步的 transform 冲突
  function scalePulse(el, sx, sy, dur) {
    if (!el || !el.animate) return;
    if (el.__beatA) { try { el.__beatA.cancel(); } catch (_) {} }
    el.__beatA = el.animate(
      [{ scale: '1 1' }, { scale: sx + ' ' + sy, offset: 0.32 }, { scale: '1 1' }],
      { duration: dur, easing: 'cubic-bezier(.3,1.5,.5,1)' }
    );
  }

  function blinkEyes() {
    if (!eyeEls) return;
    eyeEls.forEach(function (el) {
      if (!el.animate) return;
      el.animate(
        [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.1)', offset: 0.45 }, { transform: 'scaleY(1)' }],
        { duration: 220, easing: 'ease-in-out' }
      );
    });
  }

  function popOrb() {            // 复用 ai-ui 已有的星芒迸发动画
    if (!orbEl || !orbEl.classList.contains('is-on')) return;
    orbEl.classList.remove('do-pop');
    void orbEl.offsetWidth;
    orbEl.classList.add('do-pop');
    setTimeout(function () { orbEl.classList.remove('do-pop'); }, 650);
  }

  function fire(s) {
    findEls();
    var amp = Math.min(0.30, 0.10 + s * 0.12);   // 节拍越强跳得越高

    // ① 音符按钮 #cfs：每拍都跳
    if (cfsEl && cfsEl.getClientRects().length) scalePulse(cfsEl, String(1 + amp * 1.25), String(1 + amp * 1.25), 240);

    // ② AI 灵动岛：只在唤醒且面板收起时律动，不打扰操作
    var awake = pillEl && pillEl.classList.contains('is-awake');
    if (awake && !document.body.classList.contains('open')) {
      if (!lowPower()) scalePulse(pillEl, String(1 + amp), String(1 + amp), 300);   // 胶囊跟着节拍呼吸
      if (eyesEl && !lowPower()) {                                                // 小眼睛每拍压弹（squash & stretch）
        var sq = Math.min(0.22, 0.07 + s * 0.08);
        scalePulse(eyesEl, String(1 + sq), String(1 - sq), 200);
      }
      if (beatCount % 4 === 0) blinkEyes();      // 每 4 拍眨一次眼
      if (beatCount % 8 === 0) popOrb();         // 每 8 拍彩虹圆球星芒迸发
    }

    // ③ 对外广播
    for (var i = 0; i < cbs.length; i++) { try { cbs[i](s); } catch (e) {} }
    try {
      window.dispatchEvent(new CustomEvent('beat', { detail: { strength: s, count: beatCount } }));
    } catch (_) {}
  }

  /* =========================================================================
   * 4. 事件接线 + 对外接口
   * ========================================================================= */
  // 媒体事件不冒泡，在 document 捕获阶段接；audio 换 src 也不丢
  ['play', 'playing'].forEach(function (n) {
    document.addEventListener(n, function (e) {
      if (e.target && e.target.id === 'audio') start();
    }, true);
  });
  ['pause', 'ended'].forEach(function (n) {
    document.addEventListener(n, function (e) {
      if (e.target && e.target.id === 'audio') stop();
    }, true);
  });
  ['emptied', 'loadstart'].forEach(function (n) {
    document.addEventListener(n, function (e) {
      if (e.target && e.target.id === 'audio') { stop(); reset(); }
    }, true);
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else if (!audio.paused) start();
  });

  window.Beat = {
    on: function (cb) { if (typeof cb === 'function') cbs.push(cb); return window.Beat; },
    get bpm()     { return intervals.length ? Math.round(60000 / (median(intervals) || 500)) : 0; },
    get beating() { return running && !!lastBeat && (performance.now() - lastBeat < 1200); },
    start: start,
    stop: stop
  };
})();

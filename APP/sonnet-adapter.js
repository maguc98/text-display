// APP/sonnet-adapter.js
// 商籁（Sonnet）适配器：把 SonnetPixiRuntime 接到业务代码上。
//
// 生命周期（由 renderer.js 的 sonnetEnter / sonnetLeave 驱动）：
//   init()      启动时调用一次，只登记宿主元素、绑定音频事件，不创建 WebGL
//   show()      切到商籁风格：第一次才创建运行时（画布挂进 #sonnetHost），之后只是恢复 Ticker
//   hide()      离开商籁风格：立刻停掉 Ticker；创建到一半的话直接取消
//   destroy()   销毁运行时、释放 WebGL（renderer.js 在离开 15 秒后调用）
//   loadLyrics  任何时候都只缓存最新歌词，显示中才真正编译；show() 时补上
//   drive(ct)   每帧由 player.js 传入歌词时间（仅商籁风格下才会被调用）
//
// Ticker 只在「商籁正在显示 且 音频在播放」时运行；暂停播放时停下并只在拖动进度时补画一帧。
(function () {
  'use strict';

  var runtime = null;          // SonnetPixiRuntime 实例
  var creating = null;         // 创建中：{ ctrl: AbortController }
  var hostElement = null;      // 画布挂载点（#sonnetHost）
  var active = false;          // 商籁风格是否正在显示
  var playing = false;         // 音频是否在播放
  var suspended = false;       // 被全屏页面（Bravais 墙面）挡住时临时挂起，省 GPU
  var pendingLyrics = null;    // 最近一次歌词 { TS, WT, LN }（副本）
  var lyricsDirty = false;     // 运行时里的歌词是否落后于 pendingLyrics
  var lastRenderedCt = NaN;    // 暂停状态下上一次补画的时间点
  var segmenter = null;

  var valueOf = function (initial) { var v = initial; return { get: function () { return v; }, set: function (n) { v = n; return n; } }; };
  var emptySpectrum = new Uint8Array(64);

  // ---------- 平滑时钟 ----------
  // 引擎每个渲染帧（60fps）直接读 currentTime，而 player.js 只约 30 次/秒、且 audio.currentTime 本身更新很粗，
  // 镜头位置按「时间」算，时间一格一格地走镜头就跟着一格一格地抽。
  // 这里让时间在两次喂入之间按真实时间匀速前进；喂入的时间只做轻微校正，差得多（拖进度 / 切歌）才直接跳过去。
  var clock = (function () {
    var t0 = 0, w0 = 0;
    function now() { return performance.now(); }
    function rate() { var a = document.getElementById('audio'); var r = a && a.playbackRate; return (isFinite(r) && r > 0) ? r : 1; }
    function running() { return !!(active && playing); }
    function est() { return running() ? t0 + (now() - w0) / 1000 * rate() : t0; }
    return {
      get: function () { return est(); },
      set: function (n) { t0 = n; w0 = now(); return n; },          // 硬对时：换歌 / 暂停 / 拖进度
      feed: function (ct) {                                          // 软对时：播放中每次 drive 喂入
        if (!running()) { t0 = ct; w0 = now(); return; }
        var p = est(), err = ct - p;
        t0 = (Math.abs(err) > 0.3) ? ct : p + err * 0.2;             // 差太多就直接跳；否则只吸收 20% 的误差，保证不回退不抖
        w0 = now();
      },
      resync: function () { w0 = now(); }                            // 恢复播放时重置起点
    };
  })();

  var defaultTheme = { name: 'Default', backgroundColor: 0x000000, primaryColor: 0xffffff, secondaryColor: 0x8899ff, accentColor: 0xffcc44, fontStyle: 'sans', fontFamilyStack: [], fontWeight: 800, animationIntensity: 'normal', wordColors: [], lyricsIcons: [] };

  var defaultTuning = {
    typographyMotion: 1, cameraIntensity: 1, mgDensity: 0.5,
    showBackgroundMg: true, showFixedGeo: true, showBackgroundDecor: true,
    showGuide: true, showOnlyText: false, showGiantDecorativeText: true,
    outerFrameMode: 'full', postProcessEnabled: false,
    edgeDispersion: 0.8, edgeDispersionBand: 0.7,    // 上下两端 RGB 色散：强度 0..2；范围 0.1..1（从上下边往里延伸多远，占半屏高度）
    textureResolution: Math.min(2, window.devicePixelRatio || 1), // 适配 Retina，防模糊
    enableTransitions: true, staticMode: false
  };

  // ---------- 实时配置（UI 面板 → 引擎） ----------
  var STORE_KEY = 'sonnetCfg.v1';
  var THEME_COLORS = { backgroundColor: 1, primaryColor: 1, secondaryColor: 1, accentColor: 1 };
  var THEME_OTHER  = { fontWeight: 1, animationIntensity: 1 };
  var EXTRA_DEFAULT = { lyricsFontScale: 1, smartBeatEnabled: false, interludeDots: true };   // interludeDots：长间奏里用圆点代替“傻等”
  // 全程原地修改（Object.assign）：若引擎持有同一个对象引用，改动会直接生效
  var curTuning = Object.assign({}, defaultTuning);
  var curTheme  = Object.assign({}, defaultTheme);
  var curExtra  = Object.assign({}, EXTRA_DEFAULT);
  // 边缘 RGB 色闪：由适配器自己画的叠加层，不经过引擎
  var FX_DEFAULT = { rgbEdge: true, rgbEdgeIntensity: 0.7, rgbEdgeWidth: 0.14, rgbEdgeRate: 1 };
  var curFx = Object.assign({}, FX_DEFAULT);
  var lastProgram = null, lastSeed = null, swapT = 0, warned = false;
  var builtWithDots = null;    // 上一次编译歌词时，间奏圆点是否开着（null = 还没编译过）

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function toInt(v) {
    if (typeof v === 'string') { var n = parseInt(v.replace('#', ''), 16); return isFinite(n) ? n : 0; }
    return v;
  }
  function splitPatch(p) {
    var out = { tuning: {}, theme: {}, extra: {}, fx: {} }, k, v;
    for (k in p) {
      if (!has(p, k)) continue;
      if (k === 'edgeDispersionCurve') continue;   // 旧版本存过的键（已改成 edgeDispersionBand），直接忽略
      v = p[k];
      if (has(curTuning, k)) out.tuning[k] = v;
      else if (THEME_COLORS[k]) out.theme[k] = toInt(v);      // '#rrggbb' → 0xrrggbb
      else if (THEME_OTHER[k]) out.theme[k] = v;
      else if (has(curExtra, k)) out.extra[k] = v;
      else if (has(curFx, k)) out.fx[k] = v;
      else console.warn('[Sonnet] updateConfig 未知键：' + k);
    }
    return out;
  }
  function getConfig() {
    var c = Object.assign({}, curTuning, curExtra, curFx);
    Object.keys(THEME_COLORS).concat(Object.keys(THEME_OTHER)).forEach(function (k) { c[k] = curTheme[k]; });
    return c;
  }
  function saveConfig() { try { localStorage.setItem(STORE_KEY, JSON.stringify(getConfig())); } catch (_) {} }
  function loadConfig() {
    try {
      var raw = localStorage.getItem(STORE_KEY); if (!raw) return;
      var s = splitPatch(JSON.parse(raw));
      Object.assign(curTuning, s.tuning); Object.assign(curTheme, s.theme); Object.assign(curExtra, s.extra); Object.assign(curFx, s.fx);
    } catch (_) {}
  }
  loadConfig();

  // 兜底：主题颜色改了但引擎没有 updateConfig 时，用已确认存在的 swapSong 带新 theme 重建
  function scheduleThemeSwap() {
    clearTimeout(swapT);
    swapT = setTimeout(function () {
      var rt = runtime; if (!rt || !lastProgram) return;
      rt.swapSong({ seed: lastSeed, program: lastProgram, theme: curTheme })
        .then(function () { if (runtime === rt) applyRunState(); })
        .catch(function (e) { console.warn('[Sonnet] 换主题失败', e); });
    }, 200);
  }

  // 色散参数是烧进每个场景的滤镜里的：改了要让引擎重建场景才生效（防抖，拖滑块时不会每帧重建）
  var tuneT = 0;
  function scheduleTuningRebuild() {
    clearTimeout(tuneT);
    tuneT = setTimeout(function () {
      var rt = runtime; if (!rt || typeof rt.setTuning !== 'function') return;
      try { rt.setTuning(Object.assign({}, curTuning)); if (rt.options && rt.options.paused) rt.renderOnce(); }
      catch (e) { console.warn('[Sonnet] 应用色散参数失败', e); }
    }, 120);
  }

  function pushConfig(s) {
    rgbSync();                             // 色闪开关 / 参数改了：立刻生效
    // 间奏圆点开关改了：歌词要重新编译才生效（和上次编译时的开关状态比较，没变就不动）
    if (builtWithDots !== null && builtWithDots !== !!curExtra.interludeDots && pendingLyrics) {
      lyricsDirty = true;
      if (runtime && active) applyLyrics();
    }
    if (s && (s.fx.rgbEdge || s.fx.rgbEdgeIntensity != null || s.fx.rgbEdgeWidth != null || s.fx.rgbEdgeRate != null)) rgbPreview();
    var rt = runtime; if (!rt) return;     // 还没创建：create() 时直接用 cur*
    try {
      if (typeof rt.updateConfig === 'function') {            // 路径 1：在引擎里补的 updateConfig
        rt.updateConfig({ tuning: curTuning, theme: curTheme, lyricsFontScale: curExtra.lyricsFontScale });
      } else {                                                 // 路径 2/3：兜底
        var o = rt.options || {};
        if (Object.keys(s.tuning).length && o.tuning) {
          if (typeof o.tuning.set === 'function') o.tuning.set(curTuning); else Object.assign(o.tuning, s.tuning);
        }
        if (s.extra.lyricsFontScale != null && o.lyricsFontScale && typeof o.lyricsFontScale.set === 'function')
          o.lyricsFontScale.set(s.extra.lyricsFontScale);
        if (Object.keys(s.theme).length) scheduleThemeSwap();
        if (!warned) { warned = true; console.info('[Sonnet] runtime 无 updateConfig，走兜底路径；控制台执行 SonnetAdapter.probe() 查看接口'); }
      }
      if (s && (has(s.tuning, 'edgeDispersion') || has(s.tuning, 'edgeDispersionBand'))) scheduleTuningRebuild();
      if (rt.options && rt.options.paused) rt.renderOnce();    // 暂停中也立刻看到效果
    } catch (e) { console.warn('[Sonnet] 应用配置失败', e); }
  }

  function updateConfig(patch) {
    if (!patch || typeof patch !== 'object') return getConfig();
    var s = splitPatch(patch);
    Object.assign(curTuning, s.tuning); Object.assign(curTheme, s.theme); Object.assign(curExtra, s.extra); Object.assign(curFx, s.fx);
    saveConfig(); pushConfig(s);
    return getConfig();
  }
  function resetConfig() {
    var s = { tuning: Object.assign({}, defaultTuning), theme: Object.assign({}, defaultTheme), extra: Object.assign({}, EXTRA_DEFAULT), fx: Object.assign({}, FX_DEFAULT) };
    Object.assign(curTuning, s.tuning); Object.assign(curTheme, s.theme); Object.assign(curExtra, s.extra); Object.assign(curFx, s.fx);
    saveConfig(); pushConfig(s);
  }
  // 在 Web Inspector 控制台执行，直接看运行时暴露了哪些接口
  function probe() {
    var rt = runtime; if (!rt) return 'runtime 未创建（先切到商籁风格）';
    var info = { own: Object.keys(rt), proto: Object.getOwnPropertyNames(Object.getPrototypeOf(rt)), options: Object.keys(rt.options || {}) };
    console.log('[Sonnet probe]', JSON.stringify(info)); return info;
  }

  function getHost() {
    return hostElement || (hostElement = document.getElementById('sonnetHost'));
  }


  // ---------- 屏幕边缘 RGB 色闪（独立叠加层，不依赖引擎） ----------
  var rgb = { cv: null, cx: null, timer: 0, raf: 0, endAt: 0, lastDraw: 0, running: false, line: -1, boost: 1 };

  function rgbEnsure() {
    if (rgb.cv) return rgb.cv;
    var host = getHost(); if (!host || !host.parentNode) return null;
    var cv = document.createElement('canvas'); cv.id = 'sonnetRgb';
    host.parentNode.insertBefore(cv, host.nextSibling);   // 放在 #sonnetHost 后面（不放里面，destroy 清空 host 时不会被删）
    rgb.cv = cv; rgb.cx = cv.getContext('2d');
    return cv;
  }
  function rgbClear() { if (rgb.cx && rgb.cv) rgb.cx.clearRect(0, 0, rgb.cv.width, rgb.cv.height); }
  function rgbFit() {                                      // 半分辨率：够用，也省电
    var cv = rgb.cv, w = Math.max(2, Math.round(cv.clientWidth / 2)), h = Math.max(2, Math.round(cv.clientHeight / 2));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  function rgbDraw() {
    var cx = rgb.cx, cv = rgb.cv, W, H, i;
    rgbFit(); W = cv.width; H = cv.height;
    // #stage 底部比屏幕多出一截（bottom:-100px）：只在真正看得见的区域里放色闪
    var top = cv.getBoundingClientRect().top;
    var VH = Math.max(8, Math.min(H, Math.round((window.innerHeight - top) / 2)));
    cx.clearRect(0, 0, W, H);
    cx.globalCompositeOperation = 'lighter';               // 红+绿+蓝叠在一起会变白，和截图里的白条一致
    var k = Math.max(0, Math.min(1, curFx.rgbEdgeIntensity)) * rgb.boost;
    var band = Math.max(0.03, Math.min(0.4, curFx.rgbEdgeWidth));
    var n = 4 + Math.floor(Math.random() * (3 + 4 * k));
    for (i = 0; i < n; i++) {
      var edge = Math.floor(Math.random() * 4), t = Math.random(), d = Math.random() * band, x, y, w, h, r = Math.random();
      if (edge === 0) { x = t * W; y = d * VH; } else if (edge === 1) { x = t * W; y = VH - d * VH; }
      else if (edge === 2) { x = d * W; y = t * VH; } else { x = W - d * W; y = t * VH; }
      if (r < 0.5) { w = W * (0.08 + Math.random() * 0.32); h = 2 + Math.random() * 5; }              // 横条
      else if (r < 0.85) { w = h = 8 + Math.random() * 16; }                                           // 方块
      else { w = 2 + Math.random() * 2; h = VH * (0.08 + Math.random() * 0.25); }                     // 竖线
      var sp = (0.8 + Math.random() * 2.2) * (0.6 + k), vertical = Math.random() < 0.5;
      var a0 = Math.min(1, (0.5 + 0.5 * Math.random()) * k * 1.4);
      var dx = vertical ? 0 : sp, dy = vertical ? sp : 0;
      cx.fillStyle = 'rgba(255,30,60,' + a0.toFixed(3) + ')';  cx.fillRect(x - w / 2 - dx, y - h / 2 - dy, w, h);
      cx.fillStyle = 'rgba(0,255,150,' + (a0 * 0.7).toFixed(3) + ')'; cx.fillRect(x - w / 2, y - h / 2, w, h);
      cx.fillStyle = 'rgba(40,80,255,' + a0.toFixed(3) + ')';  cx.fillRect(x - w / 2 + dx, y - h / 2 + dy, w, h);
    }
  }
  function rgbFrame(now) {
    rgb.raf = 0;
    if (!rgb.running) return;
    if (now >= rgb.endAt) { rgbClear(); return; }
    if (now - rgb.lastDraw >= 45) { rgb.lastDraw = now; rgbDraw(); }   // 约 22fps，故意抖一点
    rgb.raf = requestAnimationFrame(rgbFrame);
  }
  function rgbBurst(boost) {
    if (!rgb.running || !rgbEnsure()) return;
    rgb.boost = boost || 1;
    rgb.endAt = performance.now() + 90 + Math.random() * 140;
    if (!rgb.raf) rgb.raf = requestAnimationFrame(rgbFrame);
  }
  function rgbNext() {
    clearTimeout(rgb.timer);
    if (!rgb.running) return;
    var rate = Math.max(0.2, +curFx.rgbEdgeRate || 1);
    rgb.timer = setTimeout(function () { rgbBurst(1); rgbNext(); }, (400 + Math.random() * 1400) / rate);
  }
  function rgbStart() { if (rgb.running) return; if (!rgbEnsure()) return; rgb.running = true; rgb.line = -1; rgbNext(); }
  function rgbStop() {
    rgb.running = false; clearTimeout(rgb.timer);
    if (rgb.raf) { cancelAnimationFrame(rgb.raf); rgb.raf = 0; }
    rgbClear();
  }
  // 不绑定音频播放状态：音乐可能不是走 <audio>（比如 ios-music），只要商籁在显示、开关开着、页面可见就闪
  function rgbSync() { if (active && !suspended && curFx.rgbEdge && !document.hidden) rgbStart(); else rgbStop(); }
  document.addEventListener('visibilitychange', function () { rgbSync(); });
  // 面板里改色闪参数时，立刻预览一次
  function rgbPreview() { rgbSync(); rgbBurst(1.2); }
  // 换句时额外闪一下（每帧由 drive() 调用）
  function rgbOnTime(ct) {
    if (!rgb.running || !pendingLyrics || !pendingLyrics.TS) return;
    var TS = pendingLyrics.TS, i = rgb.line;
    if (i < 0 || i >= TS.length || ct < TS[i]) i = 0;
    while (i + 1 < TS.length && ct >= TS[i + 1]) i++;
    if (i !== rgb.line) { var first = rgb.line < 0; rgb.line = i; if (!first) rgbBurst(1.4); }
  }

  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  // 歌词时间 = 音频时间 − 偏移（与 player.js 的 tick 一致）；没有 LYR_OFF 时按 0 算
  function audioTime() {
    var a = document.getElementById('audio');
    var off = (typeof LYR_OFF === 'number') ? LYR_OFF : 0;
    return a ? ((a.currentTime || 0) - off) : 0;
  }

  // 拆字素簇，防止 Emoji / 组合符号错位；旧 iOS 没有 Intl.Segmenter 时退回按码点拆
  function splitGraphemes(text) {
    try {
      if (window.Intl && typeof Intl.Segmenter === 'function') {
        if (!segmenter) segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(segmenter.segment(text), function (s) { return s.segment; });
      }
    } catch (_) { /* 退回下面的拆法 */ }
    return Array.from(text);
  }

  // ---------- 间奏圆点 ----------
  // 上一句唱完之后，如果离下一句还有很久，引擎只会让上一句一直留在屏幕上“干等”。
  // 这里在空档里补一句只含圆点的“虚拟歌词”：圆点按时间一个一个飞进来（商籁自己的排版 / 镜头 / 转场），
  // 下一句快开始时整排收走。虚拟句用 blockIndex 与真实歌词隔开，所以前后各自成一个场景。
  var INTERLUDE = {
    minGap: 5,         // 上一句唱完 → 下一句开始，空档 ≥ 这么多秒才出圆点
    lead: 0.5,         // 上一句唱完后，隔多久出第一个圆点
    tail: 1.5,         // 最后一个圆点出现的时间点，距下一句开始还有多久
    step: 2.6,         // 相邻两个圆点大约隔多少秒（空档越长圆点越多）
    minDots: 2,
    maxDots: 6,
    char: '\u2022'     // 圆点字符：• 最接近原作者；想更大换成 ●，更小换成 ·
  };

  function lineIsBlank(LN, i) { return i >= 0 && i < LN.length && String(LN[i] == null ? '' : LN[i]).trim() === ''; }

  // 估算第 i 句「实际唱完」的时间点（LRC 里没有单独的结束时间，只有下一句的开始时间）
  //   1) 后面紧跟一个空行：空行的时间就是这一句的结束（最准）
  //   2) 有逐字时间：最后一个字的开始 + 估算的一个字时长
  //   3) 都没有：按字数保守估算（宁可估长，避免句子还在唱就出圆点）
  function sungEndOf(i, TS, WT, LN, startTime, endTime, text) {
    var n = i + 1, t;
    while (n < LN.length && lineIsBlank(LN, n)) {
      if (isNum(TS[n])) return Math.max(startTime, Math.min(TS[n], endTime));
      n++;
    }
    var wt = WT && WT[i];
    if (wt && wt.length > 1) {
      var first = wt[0], last = wt[wt.length - 1];
      if (isNum(first) && isNum(last) && last >= first) {
        var avg = (last - first) / (wt.length - 1);
        t = last + Math.max(0.3, Math.min(1.5, avg * 1.2));
        return Math.max(startTime, Math.min(t, endTime));
      }
    }
    var chars = Array.from(text.replace(/\s+/g, '')).length;
    t = startTime + Math.min(10, chars * 0.5 + 2);
    return Math.max(startTime, Math.min(t, endTime));
  }

  // lines 已按时间排好；sung[k] 是第 k 句的估算结束时间。返回插入了圆点句的新数组
  function withInterludes(lines, sung) {
    var I = INTERLUDE, res = [];
    for (var k = 0; k < lines.length; k++) {
      var cur = lines[k], nx = lines[k + 1];
      res.push(cur);
      if (!nx) break;
      var from = Math.max(cur.startTime + 0.3, Math.min(sung[k], nx.startTime));
      if (nx.startTime - from < I.minGap) continue;
      var s0 = from + I.lead, avail = nx.startTime - I.tail - s0;
      if (avail < 1) continue;
      // 第一个点在 s0，最后一个点正好在「下一句开始 − tail」，中间等距
      var count = Math.max(I.minDots, Math.min(I.maxDots, Math.round(avail / I.step) + 1));
      var d = avail / (count - 1);
      // 上一句在它唱完的时候就收尾（原来的结束时间是“下一句开始”，会一直撑着）
      if (from < cur.endTime) {
        cur.endTime = from;
        if (cur.words.length) {
          var lw = cur.words[cur.words.length - 1];
          lw.endTime = Math.max(lw.startTime, Math.min(lw.endTime, from));
        }
      }
      var words = [], text = '';
      for (var j = 0; j < count; j++) {
        words.push({ text: I.char, startTime: s0 + j * d, endTime: j + 1 < count ? s0 + (j + 1) * d : nx.startTime });
        text += I.char;
      }
      res.push({ fullText: text, startTime: s0, endTime: nx.startTime, words: words, blockIndex: 1 });
    }
    return res;
  }

  function toSonnetLines(TS, WT, LN) {
    if (!TS || !LN || !LN.length) return [];
    var out = [], sung = [];
    var prevEnd = 0;
    var dots = !!curExtra.interludeDots;
    builtWithDots = dots;
    for (var i = 0; i < LN.length; i++) {
      var text = String(LN[i] == null ? '' : LN[i]);
      var startTime = isNum(TS[i]) ? TS[i] : prevEnd;
      var endTime = isNum(TS[i + 1]) ? TS[i + 1] : startTime + 5;
      if (endTime < startTime) endTime = startTime;
      prevEnd = endTime;
      if (text.trim() === '') continue;

      var words = [];
      var wt = WT && WT[i];
      if (wt && wt.length > 0) {
        var chars = splitGraphemes(text);
        // WT 长度和拆出来的字数对不上，回退到按码点拆
        var finalChars = (chars.length === wt.length) ? chars : Array.from(text);
        for (var j = 0; j < finalChars.length; j++) {
          words.push({
            text: finalChars[j],
            startTime: isNum(wt[j]) ? wt[j] : startTime,
            endTime: (j + 1 < wt.length && isNum(wt[j + 1])) ? wt[j + 1] : endTime
          });
        }
      }
      var line = { fullText: text, startTime: startTime, endTime: endTime, words: words };
      if (dots) {
        line.blockIndex = 0;           // 真实歌词都是 0，圆点句是 1：引擎看到“块”变了就会另起一个场景
        sung.push(sungEndOf(i, TS, WT, LN, startTime, endTime, text));
      }
      out.push(line);
    }
    return dots ? withInterludes(out, sung) : out;
  }

  function reportFailure() {
    // renderer.js 里定义：商籁起不来时退回默认风格，免得一片空白
    try { if (typeof window.__sonnetFailed === 'function') window.__sonnetFailed(); } catch (_) {}
  }

  function abortCreating() {
    if (!creating) return;
    try { creating.ctrl.abort(); } catch (_) {}
    creating = null;
  }

  // Ticker 只在「显示中 且 在播放」时运行；其余时间停掉（setPaused(true) 会再补画一帧）
  function applyRunState() {
    rgbSync();
    if (!runtime) return;
    try { runtime.setPaused(!(active && playing && !suspended)); } catch (e) { console.warn('[Sonnet] setPaused 失败', e); }
  }

  // 全屏墙面打开时挂起：停 Ticker、停 RGB 边缘色闪，不动 active / 歌词状态，关掉后原样恢复
  function setSuspended(v) {
    v = !!v;
    if (v === suspended) return;
    suspended = v;
    applyRunState();
    if (!v && runtime) {
      syncTime();
      if (!playing) { try { runtime.renderOnce(); } catch (_) {} }
    }
  }

  function syncTime() {
    if (!runtime) return;
    try { runtime.options.currentTime.set(audioTime()); } catch (_) {}
  }

  // 把 pendingLyrics 编译成 program，交给运行时平滑切换
  function applyLyrics() {
    if (!runtime || !pendingLyrics) return;
    try {
      var lines = toSonnetLines(pendingLyrics.TS, pendingLyrics.WT, pendingLyrics.LN);
      lyricsDirty = false;
      if (lines.length === 0) return;
      var seed = 'song_' + Date.now();
      var program = window.SonnetRuntime.compileSonnetProgram(lines, seed);
      lastProgram = program; lastSeed = seed;
      var rt = runtime;
      rt.swapSong({ seed: seed, program: program, theme: curTheme })
        .then(function () { if (runtime === rt) applyRunState(); })
        .catch(function (err) { console.error('[Sonnet] swapSong 失败:', err); });
    } catch (e) {
      console.error('[Sonnet] 编译歌词失败', e);
    }
  }

  function createRuntime() {
    if (runtime || creating) return;
    var host = getHost();
    var RT = window.SonnetRuntime;
    if (!host || !RT || !RT.SonnetPixiRuntime || !RT.compileSonnetProgram) {
      console.error('[Sonnet] 无法创建：' + (!host ? '找不到 #sonnetHost' : 'window.SonnetRuntime 不存在（检查 sonnet.js 是否加载）'));
      reportFailure();
      return;
    }

    var ctrl = new AbortController();
    var token = { ctrl: ctrl };
    creating = token;

    var seed = 'seed_init';
    var program;
    try {
      var lines = pendingLyrics ? toSonnetLines(pendingLyrics.TS, pendingLyrics.WT, pendingLyrics.LN) : [];
      if (lines.length) {
        seed = 'song_' + Date.now();
        program = RT.compileSonnetProgram(lines, seed);
        lyricsDirty = false;               // 首帧就用最新歌词，不用再 swap
      } else {
        program = RT.compileSonnetProgram([{ fullText: '加载中...', startTime: 0, endTime: 999, words: [] }], seed);
      }
    } catch (e) {
      console.error('[Sonnet] 编译初始歌词失败', e);
      if (creating === token) creating = null;
      reportFailure();
      return;
    }

    lastProgram = program; lastSeed = seed;

    RT.SonnetPixiRuntime.create({
      host: host,
      signal: ctrl.signal,
      currentTime: (clock.set(audioTime()), clock),
      audioBands: { bass: valueOf(0), lowMid: valueOf(0), mid: valueOf(0), vocal: valueOf(0), treble: valueOf(0), spectrum: { get: function () { return emptySpectrum; } } },
      audioPower: valueOf(0),
      program: program,
      songSeed: seed,
      theme: curTheme,
      tuning: curTuning,
      smartBeatEnabled: false,
      staticMode: false,
      transparentBackground: true,
      lyricsFontScale: curExtra.lyricsFontScale,
      paused: !(active && playing),        // 音频没在播放就不启动 Ticker，只画首帧
      modulation: {}
    }).then(function (rt) {
      if (creating !== token) {            // 创建期间被 hide() / destroy() 取消了
        try { rt.destroy(); } catch (_) {}
        return;
      }
      creating = null;
      runtime = rt;
      if (lyricsDirty) applyLyrics();      // 创建期间又来了新歌词
      syncTime();
      applyRunState();
    }).catch(function (err) {
      if (creating === token) creating = null;
      if (err && err.name === 'AbortError') return;   // 主动取消，不算失败
      console.error('[Sonnet] create 失败:', err);
      reportFailure();
    });
  }

  function bindAudio() {
    var a = document.getElementById('audio');
    if (!a || a.__sonnetBound) return;
    a.__sonnetBound = true;
    playing = !a.paused;
    a.addEventListener('play', function () { clock.set(audioTime()); playing = true; applyRunState(); });
    a.addEventListener('pause', function () { clock.set(audioTime()); playing = false; applyRunState(); });
    a.addEventListener('seeked', function () { clock.set(audioTime()); });   // 播放结束也会先触发 pause
  }

  // ---------------- 对外接口 ----------------

  function init(hostEl) {
    hostElement = hostEl || hostElement || document.getElementById('sonnetHost');
    bindAudio();
    return Promise.resolve();            // 不在这里创建 WebGL：等用户真的切到商籁再 show()
  }

  function show() {
    bindAudio();
    syncFromGlobals();                   // 先把当前歌词补齐，再创建 / 恢复运行时
    active = true;
    rgbSync();
    if (runtime) {
      if (lyricsDirty) applyLyrics();
      syncTime();                        // 暂停状态下切回来，位置也要对
      applyRunState();                   // 在播放就恢复 Ticker；暂停就停着并补画一帧
    } else {
      createRuntime();
    }
  }

  function hide() {
    active = false;
    abortCreating();                     // 还在创建就取消，省掉后面的着色器编译
    applyRunState();                     // 停 Ticker
  }

  function destroy() {
    active = false;
    rgbStop();
    abortCreating();
    if (runtime) {
      try { runtime.destroy(); } catch (e) { console.warn('[Sonnet] destroy 失败', e); }
      runtime = null;
    }
    var host = getHost();
    if (host) host.innerHTML = '';       // 保险：清掉残留画布
    lastRenderedCt = NaN;
  }

  function loadLyrics(TS, WT, LN) {
    try {
      pendingLyrics = {
        TS: TS ? TS.slice() : [],
        WT: WT ? WT.map(function (w) { return w ? w.slice() : w; }) : [],
        LN: LN ? LN.slice() : []
      };
      lyricsDirty = true;
      if (runtime && active) applyLyrics();   // 不在显示就等 show() 再编译
    } catch (e) {
      console.error('[Sonnet] loadLyrics 失败', e);
    }
  }

  // 兜底：启动时歌词是从自动保存里恢复的，没经过 player.js 的 applyLRC，所以 loadLyrics 一次都没被调用过，
  // 此时切到商籁就只会看到「加载中...」。show() 时对一下全局的 TS / WT / LN，缺了或不一样就补上（一样就不动，免得白白重编译）。
  function syncFromGlobals() {
    try {
      if (typeof LN === 'undefined' || !LN || !LN.length) return;
      var T = (typeof TS !== 'undefined' && TS) ? TS : [];
      var W = (typeof WT !== 'undefined' && WT) ? WT : [];
      var p = pendingLyrics;
      if (p && p.LN.length === LN.length && p.TS.length === T.length &&
          p.LN.join('\n') === LN.join('\n') && p.TS.join(',') === T.join(',') &&
          JSON.stringify(p.WT) === JSON.stringify(W)) return;
      loadLyrics(T, W, LN);
    } catch (e) { console.warn('[Sonnet] 同步歌词失败', e); }
  }

  function drive(ct) {
    if (!runtime || !active || suspended) return;
    try {
      rgbOnTime(ct);
      var o = runtime.options;
      if (o.paused) clock.set(ct); else clock.feed(ct);
      // 暂停播放时 Ticker 是停的：拖动进度（时间变了）才补画一帧
      if (o.paused && ct !== lastRenderedCt) {
        lastRenderedCt = ct;
        runtime.renderOnce();
      }
    } catch (_) {}
  }

  function state() {
    return { active: active, playing: playing, hasRuntime: !!runtime, creating: !!creating, hasLyrics: !!pendingLyrics, lyricsDirty: lyricsDirty };
  }

  window.SonnetAdapter = { init: init, show: show, hide: hide, destroy: destroy, drive: drive, loadLyrics: loadLyrics, state: state, syncLyrics: syncFromGlobals, setSuspended: setSuspended,
                           updateConfig: updateConfig, getConfig: getConfig, resetConfig: resetConfig, probe: probe,
                           interlude: INTERLUDE, buildLines: function (T, W, L) { return toSonnetLines(T, W, L); }, burst: function () { rgbBurst(1.6); } };
})();

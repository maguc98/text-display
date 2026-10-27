/*!
 * ai-ui.js · AI 陪聊 UI 模块（iOS WebView / 本地音乐 App）
 * ---------------------------------------------------------------------------
 * 用法：在 index.html 末尾（其它脚本之后）加一行
 *     <script src="./APP/ai-ui.js"></script>
 * 之后无需任何改动：本脚本自行注入 CSS、向 body 追加 DOM。
 *
 * 层级：全部 z-index 落在 2147482000 ~ 2147482020，低于启动封面 #splash(2147483000)。
 * 对外接口（可选）：
 *     window.AIUI.wake() / sleep() / openHistory() / closeHistory() / say(text)
 *
 * 代码分区（全局搜索对应标记即可跳转）：
 *   [0] 常量与状态          [1] 工具函数          [2] CSS（含全部动画）
 *   [3] DOM 构建            [4] 目光追随          [5] 音乐状态联动
 *   [6] 随机微表情          [7] 唤醒 / 休眠       [8] 历史窗口 + 消息
 *   [9] 手势判定            [10] 键盘处理          [11] 输入框与伪回复
 *   [12] 启动
 * ---------------------------------------------------------------------------
 */
;(function () {
  'use strict';

  if (window.__aiUILoaded) return;           // 防止重复加载
  window.__aiUILoaded = true;

  /* =========================================================================
   * [0] 常量与状态
   * ========================================================================= */
  var Z            = 2147482000;  // 基础层级；历史窗口 = Z，胶囊/输入框/气泡 = Z+10
  var PULL_PX      = 30;          // 按住下拉多少像素后展开历史窗口
  var TAP_SLOP     = 8;           // 位移小于该值视为"点按"，否则视为拖动
  var EYE_RX       = 2.4;         // 瞳孔横向最大位移（px）
  var EYE_RY       = 3;           // 瞳孔纵向最大位移（px）
  var GAZE_RANGE   = 120;         // 手指距离超过该值时瞳孔偏移达到最大
  var GAZE_IDLE_MS = 3500;        // 手指静止多久后瞳孔慢慢回正
  var LIFE_MS      = 5000;        // 随机微表情的触发间隔
  var TA_MAX_H     = 112;         // 输入框最多长到多高（约 5 行）
  var KB_MIN       = 80;          // 视口缩小超过该值才认为键盘弹出了

  var S = {
    awake: false,       // 是否处于唤醒态
    history: false,     // 历史窗口是否展开
    playing: false,     // <audio id="audio"> 是否在播放
    wakeBoost: false,   // 刚唤醒的一小段时间内，眼睛保持睁大
    wakeAt: 0,          // 最近一次唤醒的时间（防止刚唤醒就被"点外面"关掉）
    composing: false,   // 中文输入法组字中
    pending: 0          // 还没回复的消息数
  };

  // DOM 引用（在 buildDOM 里赋值）
  var root, hist, list, listIn, closeBtn, bubble, bubbleT, pill, body,
      eyesEl, eyeEls, pupils, orb, bar, barIn, ta, sendBtn, probe;

  /* =========================================================================
   * [1] 工具函数
   * ========================================================================= */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  // 重新触发一次 CSS 动画：移除 → 强制回流 → 添加 → 到点清理
  function playClass(el, cls, ms) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, ms);
  }

  /* =========================================================================
   * [2] CSS（动态注入，所有选择器带 aiui- 前缀，不污染外部样式）
   * ========================================================================= */
  function bf(v) { return '-webkit-backdrop-filter:' + v + ';backdrop-filter:' + v; }

  function buildCSS() {
    var zTop = Z + 10;
    return [

      /* ---------- 根节点：只承载 CSS 变量，自身不占位 ---------- */
      '#aiui-root{--aiui-px:16px;--aiui-py:calc(env(safe-area-inset-top,0px) + 68px);--aiui-hl:16px;--aiui-dx:0px;--aiui-vvt:0px;--aiui-lift:0px;--aiui-bar-h:50px;--aiui-ink:#f5f6fb;--aiui-accent:#8fb0ff;' +
        'font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Helvetica Neue",Arial,sans-serif;' +
        '-webkit-text-size-adjust:100%}',
      '#aiui-root *,#aiui-root *::before,#aiui-root *::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent}',
      '.aiui-probe{position:fixed;left:0;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none}',

      /* =====================================================================
       * 【动画实现 A】悬浮胶囊：外层负责位移（下拉跟手），内层负责缩放（挤压回弹）
       * ===================================================================== */
      '.aiui-pill{position:fixed;left:var(--aiui-px);top:calc(var(--aiui-py) + var(--aiui-vvt));width:64px;height:34px;z-index:' + zTop + ';' +
        'touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;cursor:pointer;outline:none;' +
        'transition:transform .5s cubic-bezier(.34,1.56,.64,1),left .4s cubic-bezier(.22,1,.36,1),top .4s cubic-bezier(.22,1,.36,1)}',
      '.aiui-pill.is-dragging{transition:none;animation:none !important}',
      // 性能：滑动页面期间只暂停最耗 GPU 的圆球流光（模糊滤镜）；小眼睛/胶囊的舞蹈很轻，切换页面、滚动时也照常舞动
      '#aiui-root.is-scrolling .aiui-swirl,#aiui-root.is-scrolling .aiui-halo,#aiui-root.is-scrolling .aiui-glow,#aiui-root.is-scrolling .aiui-spark{animation-play-state:paused !important}',
      '#aiui-root.is-wall .aiui-swirl,#aiui-root.is-wall .aiui-halo,#aiui-root.is-wall .aiui-glow,#aiui-root.is-wall .aiui-spark{animation-play-state:paused !important}',                       // 手指拖动时去掉过渡，保证跟手
      '.aiui-pill::after{content:"";position:absolute;left:-12px;right:-12px;top:-12px;bottom:-12px}',  // 扩大点击热区
      '.aiui-pill:focus-visible{outline:2px solid rgba(143,176,255,.9);outline-offset:4px;border-radius:999px}',

      '.aiui-body{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:999px;overflow:hidden;transform-origin:50% 50%;' +
        'transition:transform .12s ease-out}',
      '.aiui-body.is-press{transform:scale(.9,.86)}',                  // 按下：挤压
      '.aiui-body.is-jelly{animation:aiui-jelly .55s cubic-bezier(.25,.8,.3,1)}',        // 点按松手：回弹
      '.aiui-body.is-jelly-pull{animation:aiui-jelly-pull .6s cubic-bezier(.25,.8,.3,1)}', // 下拉松手：从拉长状态回弹
      '@keyframes aiui-jelly{0%{transform:scale(.9,.86)}32%{transform:scale(1.1,1.14)}58%{transform:scale(.97,.96)}' +
        '80%{transform:scale(1.02,1.02)}100%{transform:scale(1,1)}}',
      '@keyframes aiui-jelly-pull{0%{transform:scale(.95,1.14)}28%{transform:scale(1.1,.88)}55%{transform:scale(.97,1.05)}' +
        '80%{transform:scale(1.015,.99)}100%{transform:scale(1,1)}}',

      /* =====================================================================
       * 【动画实现 B】Siri 式彩虹流光：conic-gradient + 旋转
       *   .aiui-halo 是模糊后的外发光；.aiui-glow 是清晰的 2px 彩虹边 + 反向旋转的高光
       * ===================================================================== */
      '.aiui-halo,.aiui-glow{position:absolute;border-radius:999px;overflow:hidden;pointer-events:none;' +
        'transition:opacity .6s ease,visibility 0s linear 0s}',
      '.aiui-halo{left:-3px;right:-3px;top:-3px;bottom:-3px;-webkit-filter:blur(9px);filter:blur(9px);opacity:.8}',
      '.aiui-glow{left:-2px;right:-2px;top:-2px;bottom:-2px;isolation:isolate;' +
        '-webkit-mask-image:-webkit-radial-gradient(white,black)}',    // iOS：让旋转的子元素也被圆角裁切
      '.aiui-halo::before,.aiui-glow::before,.aiui-glow::after{content:"";position:absolute;left:50%;top:50%;' +
        'width:160px;height:160px;margin:-80px 0 0 -80px;will-change:transform}',
      '.aiui-halo::before,.aiui-glow::before{' +
        'background:conic-gradient(from 0deg,#ff4f8b,#ff9e3d,#ffe45c,#59f2a0,#3fd2ff,#5b6dff,#b25cff,#ff4f8b);' +
        'animation:aiui-spin 3.6s linear infinite}',
      '.aiui-glow::after{' +
        'background:conic-gradient(from 90deg,rgba(255,255,255,0),rgba(255,255,255,.8) 12%,rgba(255,255,255,0) 30%,' +
        'rgba(255,255,255,0) 60%,rgba(255,255,255,.55) 72%,rgba(255,255,255,0) 90%);' +
        'animation:aiui-spin 5.4s linear infinite reverse}',
      '@keyframes aiui-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
      /* 毛玻璃底 */
      '.aiui-glass{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:999px;' +
        'background:linear-gradient(180deg,rgba(255,255,255,.18) 0%,rgba(255,255,255,.04) 100%),rgba(16,18,30,.52);' +
        bf('blur(14px) saturate(1.8)') + ';' +
        'box-shadow:inset 0 0 0 .5px rgba(255,255,255,.24),inset 0 1px 0 rgba(255,255,255,.28);' +
        'transition:box-shadow .5s ease}',
      '.aiui-pill.is-awake .aiui-glass{box-shadow:inset 0 0 0 .5px rgba(255,255,255,.24),' +
        'inset 0 1px 0 rgba(255,255,255,.28),0 8px 22px rgba(0,0,0,.34)}',

      /* =====================================================================
       * 【动画实现 C】极简表情：只用「点」和「线」
       *   .aiui-eyes[data-f=表情名]  整体表情；.aiui-eye 负责眨眼（scaleY）；
       *   .aiui-pupil 由 JS 设置 transform（目光追随）；<b> 是真正的形状，按表情变形
       *   表情：neutral 圆点 / calm 小点 / sleep 横线 / happy ∩ / content ∪ /
       *         surprised 圆环 / worried 八字线 / wink 单眼 ∩ / hmm 一点一线
       * ===================================================================== */
      '.aiui-eyes{position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;' +
        'gap:12px;pointer-events:none;transition:transform .6s ease}',
      '.aiui-eye{position:relative;width:12px;height:12px}',
      '.aiui-pupil{position:absolute;left:0;top:0;width:12px;height:12px;display:flex;align-items:center;justify-content:center;' +
        'transition:transform .16s cubic-bezier(.2,.8,.2,1);will-change:transform}',
      '.aiui-pupil b{display:block;box-sizing:border-box;width:7px;height:7px;--c:#f3f5fb;position:relative;border:0 solid var(--c);border-radius:50%;' +
        'background:var(--c);opacity:1;' +
        'transition:width .28s cubic-bezier(.3,1.5,.5,1),height .28s cubic-bezier(.3,1.5,.5,1),border-radius .28s ease,' +
        'background-color .2s ease,border-width .2s ease,transform .28s cubic-bezier(.3,1.5,.5,1),opacity .3s ease}',

      // 播放：轻微上下呼吸/跳动
      // 播放音乐时小眼睛跳舞：几种舞步轮流换（脚本每隔几秒切换 data-d）
      '.aiui-pill.is-dancing,.aiui-eyes.is-dancing{will-change:transform}',
      // 不舞动时胶囊也保持轻微呼吸（用独立的 translate 属性，避免和 transform 的舞步 / 拖动冲突）
      '.aiui-pill:not(.is-dancing):not(.is-dragging){animation:aiui-pill-idle 4s ease-in-out infinite}',
      '#aiui-root.is-still .aiui-pill{animation:none !important}',
      '.aiui-eyes.is-dancing[data-d=bob]{animation:aiui-bob .62s ease-in-out infinite}',
      '.aiui-eyes.is-dancing[data-d=sway]{animation:aiui-dsway .86s ease-in-out infinite}',
      '.aiui-eyes.is-dancing[data-d=hop]{animation:aiui-dhop .52s ease-in-out infinite}',
      '.aiui-eyes.is-dancing[data-d=tilt]{animation:aiui-dtilt 1s ease-in-out infinite}',
      '.aiui-eyes.is-dancing[data-d=swing]{animation:aiui-dswing .72s ease-in-out infinite}',
      '.aiui-eyes.is-dancing[data-d=twirl]{animation:aiui-dtwirl 1.9s cubic-bezier(.5,0,.3,1) both}',
      '.aiui-eyes.is-dancing[data-d=wave] .aiui-eye{animation:aiui-hop .6s ease-in-out infinite}',
      '.aiui-eyes.is-dancing[data-d=wave] .aiui-eye:nth-child(2){animation-delay:.3s}',
      '@keyframes aiui-dsway{0%,100%{transform:none}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}',
      '@keyframes aiui-dhop{0%,100%{transform:none}45%{transform:translateY(-4px) scale(.94,1.1)}}',
      '@keyframes aiui-dtilt{0%,100%{transform:none}50%{transform:translateY(-1.5px)}}',
      '@keyframes aiui-dswing{0%,100%{transform:none}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}',
      '@keyframes aiui-dtwirl{0%,100%{transform:none}50%{transform:scale(.9)}}',
      '@keyframes aiui-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.8px)}}',
      // 跟随音乐：在这一行里「移动 / 翻越 / 跳跃 / 旋转」的舞步
      '.aiui-eyes.is-dancing[data-d=run]{animation:aiui-drun 1.1s ease-in-out infinite}',
      '.aiui-eyes.is-dancing[data-d=flip]{animation:aiui-dflip 1.5s cubic-bezier(.4,.1,.3,1) both}',
      '.aiui-eyes.is-dancing[data-d=leap]{animation:aiui-dleap .8s ease-in-out infinite}',
      '.aiui-eyes.is-dancing[data-d=roll]{animation:aiui-droll 1.3s ease-in-out both}',
      '.aiui-eyes.is-dancing[data-d=spin]{animation:aiui-dspin 1s cubic-bezier(.25,.1,.3,1) both}',
      '.aiui-eyes.is-dancing[data-d=bounce]{animation:aiui-dbounce .55s ease-in-out infinite}',
      '@keyframes aiui-drun{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}',
      '@keyframes aiui-dflip{0%,100%{transform:none}50%{transform:scale(.88,.9)}}',
      '@keyframes aiui-dleap{0%,100%{transform:none}25%{transform:translateX(-4px) translateY(-2px)}50%{transform:translateX(0) translateY(-6px) scale(.94,1.08)}75%{transform:translateX(4px) translateY(-2px)}}',
      '@keyframes aiui-droll{0%,100%{transform:none}50%{transform:scale(.9)}}',
      '@keyframes aiui-dspin{0%,100%{transform:none}50%{transform:scale(.9)}}',
      '@keyframes aiui-dbounce{0%,100%{transform:none}50%{transform:translateY(-6px) scale(.94,1.06)}}',
      // 整个胶囊也跟着舞动（作用在 .aiui-pill 上，幅度比眼睛大一圈）
      '.aiui-pill.is-dancing[data-d=bob]{animation:aiui-pbob .62s ease-in-out infinite}',
      '.aiui-pill.is-dancing[data-d=sway]{animation:aiui-psway .86s ease-in-out infinite}',
      '.aiui-pill.is-dancing[data-d=hop]{animation:aiui-phop .52s ease-in-out infinite}',
      '.aiui-pill.is-dancing[data-d=tilt]{animation:aiui-ptilt 1s ease-in-out infinite}',
      '.aiui-pill.is-dancing[data-d=swing]{animation:aiui-pswing .72s ease-in-out infinite}',
      '.aiui-pill.is-dancing[data-d=twirl]{animation:aiui-ptwirl 1.9s cubic-bezier(.5,0,.3,1) both}',
      '.aiui-pill.is-dancing[data-d=wave]{animation:aiui-pwave .9s ease-in-out infinite}',
      '.aiui-pill.is-dancing[data-d=run]{animation:aiui-prun 1.1s ease-in-out infinite}',
      '.aiui-pill.is-dancing[data-d=flip]{animation:aiui-pflip 1.5s cubic-bezier(.4,.1,.3,1) both}',
      '.aiui-pill.is-dancing[data-d=leap]{animation:aiui-pleap .8s ease-in-out infinite}',
      '.aiui-pill.is-dancing[data-d=roll]{animation:aiui-proll 1.3s ease-in-out both}',
      '.aiui-pill.is-dancing[data-d=spin]{animation:aiui-pspin 1s cubic-bezier(.25,.1,.3,1) both}',
      '.aiui-pill.is-dancing[data-d=bounce]{animation:aiui-pbounce .55s ease-in-out infinite}',
      '@keyframes aiui-pbob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
      '@keyframes aiui-psway{0%,100%{transform:none}25%{transform:translateX(-5px) rotate(-10deg)}75%{transform:translateX(5px) rotate(10deg)}}',
      '@keyframes aiui-phop{0%,100%{transform:none}45%{transform:translateY(-7px) scale(.95,1.08)}}',
      '@keyframes aiui-ptilt{0%,100%{transform:none}25%{transform:rotate(-16deg)}75%{transform:rotate(16deg)}}',
      '@keyframes aiui-pswing{0%,100%{transform:none}25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}',
      '@keyframes aiui-ptwirl{0%,55%{transform:rotate(0)}100%{transform:rotate(var(--aiui-spin,360deg))}}',
      '@keyframes aiui-pwave{0%,100%{transform:none}25%{transform:translateY(-5px) rotate(-7deg)}50%{transform:none}75%{transform:translateY(-5px) rotate(7deg)}}',
      '@keyframes aiui-prun{0%,100%{transform:none}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}',
      '@keyframes aiui-pflip{0%,55%{transform:perspective(180px) rotateX(0)}100%{transform:perspective(180px) rotateX(var(--aiui-spin,360deg))}}',
      '@keyframes aiui-pleap{0%,100%{transform:none}25%{transform:translateX(-7px) translateY(-3px)}50%{transform:translateX(0) translateY(-12px) scale(.92,1.1)}75%{transform:translateX(7px) translateY(-3px)}}',
      '@keyframes aiui-proll{0%{transform:none}25%{transform:translateX(-6px) rotate(calc(var(--aiui-spin,360deg)/4))}75%{transform:translateX(6px) rotate(calc(var(--aiui-spin,360deg)/4*3))}100%{transform:none}}',
      '@keyframes aiui-pspin{from{transform:rotate(0)}to{transform:rotate(var(--aiui-spin,360deg))}}',
      '@keyframes aiui-pbounce{0%,100%{transform:none}50%{transform:translateY(-10px) scale(.92,1.08)}}',
      '@keyframes aiui-pill-idle{0%,100%{translate:0 0}50%{translate:0 -2.5px}}',
      // ---- 表情库（由脚本生成）----
'.aiui-pupil b::before,.aiui-pupil b::after{content:"";position:absolute;opacity:0;pointer-events:none;transition:opacity .25s ease}',
'@keyframes aiui-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}',
'@keyframes aiui-hop{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
'@keyframes aiui-sway{0%,100%{transform:translateX(-2px) rotate(-6deg)}50%{transform:translateX(2px) rotate(6deg)}}',
'@keyframes aiui-beat{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}',
'@keyframes aiui-tear{0%{transform:translateY(-1px);opacity:0}25%{opacity:1}100%{transform:translateY(5px);opacity:0}}',
'@keyframes aiui-breathe{0%,100%{transform:translateY(0) scaleX(1)}50%{transform:translateY(1px) scaleX(1.06)}}',
'@keyframes aiui-zz{0%{transform:translate(0,2px) scale(.6);opacity:0}25%{opacity:.85}100%{transform:translate(7px,-13px) scale(1.15);opacity:0}}',
'.aiui-eyes[data-f=sleep],.aiui-eyes[data-f=sleepy],.aiui-eyes[data-f=dreamy],.aiui-eyes[data-f=peek]{animation:aiui-breathe 4s ease-in-out infinite}',
'.aiui-z{position:absolute;right:9px;top:5px;font:700 9px/1 -apple-system,system-ui,sans-serif;color:rgba(243,245,251,.85);opacity:0;pointer-events:none}',
'.aiui-z.b{right:4px;top:9px;font-size:7px}',
'.aiui-eyes[data-f=sleep] .aiui-z,.aiui-eyes[data-f=sleepy] .aiui-z,.aiui-eyes[data-f=dreamy] .aiui-z{animation:aiui-zz 3.2s ease-out infinite}',
'.aiui-eyes .aiui-z.b{animation-delay:1.5s}',
      '.aiui-eyes[data-f=calm] .aiui-pupil b{width:6px;height:6px;border-radius:50%;background:var(--c);border-width:0;opacity:.9;}',
      '.aiui-eyes[data-f=calm]{transform:translateY(1px)}',
      '.aiui-eyes[data-f=sleep] .aiui-pupil b{width:11px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;opacity:.6;}',
      '.aiui-eyes[data-f=sleepy] .aiui-pupil b{width:9px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;opacity:.8;}',
      '.aiui-eyes[data-f=dreamy] .aiui-pupil b{width:10px;height:5px;background:transparent;border-width:0 2.4px 2.4px;border-radius:0 0 8px 8px;opacity:.75;}',
      '.aiui-eyes[data-f=peek] .aiui-eye:first-child .aiui-pupil b{width:11px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;opacity:.6;}',
      '.aiui-eyes[data-f=peek] .aiui-eye:nth-child(2) .aiui-pupil b{width:5px;height:5px;border-radius:50%;background:var(--c);border-width:0;opacity:.85;}',
      '.aiui-eyes[data-f=happy] .aiui-pupil b{width:11px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0;}',
      '.aiui-eyes[data-f=content] .aiui-pupil b{width:11px;height:6px;background:transparent;border-width:0 2.4px 2.4px;border-radius:0 0 8px 8px;}',
      '.aiui-eyes[data-f=surprised] .aiui-pupil b{width:10px;height:10px;background:transparent;border-width:2.2px;border-radius:50%;}',
      '.aiui-eyes[data-f=wow] .aiui-pupil b{width:11px;height:11px;background:transparent;border-width:2.2px;border-radius:50%;}',
      '.aiui-eyes[data-f=wow]{animation:aiui-pulse .8s ease-in-out infinite}',
      '.aiui-eyes[data-f=worried] .aiui-eye:first-child .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:rotate(-18deg);}',
      '.aiui-eyes[data-f=worried] .aiui-eye:nth-child(2) .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:rotate(18deg);}',
      '.aiui-eyes[data-f=angry] .aiui-eye:first-child .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:rotate(18deg);}',
      '.aiui-eyes[data-f=angry] .aiui-eye:nth-child(2) .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:rotate(-18deg);}',
      '.aiui-eyes[data-f=cry] .aiui-eye:first-child .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:rotate(-18deg);}',
      '.aiui-eyes[data-f=cry] .aiui-eye:nth-child(2) .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:rotate(18deg);}',
      '.aiui-eyes[data-f=cry] .aiui-pupil b::after{opacity:1;left:50%;top:100%;margin:1px 0 0 -1.5px;width:3px;height:4px;border-radius:50%;background:#8ccfff;animation:aiui-tear 1.3s ease-in infinite;}',
      '.aiui-eyes[data-f=wink] .aiui-eye:nth-child(2) .aiui-pupil b{width:11px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0;}',
      '.aiui-eyes[data-f=wink2] .aiui-eye:first-child .aiui-pupil b{width:11px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0;}',
      '.aiui-eyes[data-f=hmm] .aiui-eye:first-child .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=excited] .aiui-pupil b{width:9px;height:9px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=excited]{animation:aiui-hop .5s ease-in-out infinite}',
      '.aiui-eyes[data-f=shy] .aiui-pupil b{width:5px;height:5px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=shy]{transform:translateY(2px)}',
      '.aiui-eyes[data-f=deadpan] .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=dazed] .aiui-eye:first-child .aiui-pupil b{width:9px;height:9px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=dazed] .aiui-eye:nth-child(2) .aiui-pupil b{width:5px;height:5px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=smug] .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:rotate(-8deg);}',
      '.aiui-eyes[data-f=curious] .aiui-pupil b{width:7px;height:7px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=curious]{transform:rotate(-8deg)}',
      '.aiui-eyes[data-f=dizzy] .aiui-pupil b{width:9px;height:9px;background:transparent;border-width:2.2px;border-radius:50%;}',
      '.aiui-eyes[data-f=dizzy]{animation:aiui-sway 1s ease-in-out infinite}',
      '.aiui-eyes[data-f=stare] .aiui-pupil b{width:10px;height:10px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=star] .aiui-pupil b{width:11px;height:11px;border-radius:0;border-width:0;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);-webkit-clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:aiui-twinkle 1.6s ease-in-out infinite;}',
      '.aiui-eyes[data-f=xx] .aiui-pupil b{width:10px;height:10px;background:transparent;border-width:0;border-radius:0;}',
      '.aiui-eyes[data-f=xx] .aiui-pupil b::before{opacity:1;left:0;top:50%;width:10px;height:2.4px;margin-top:-1.2px;border-radius:2px;background:var(--c);transform:rotate(45deg);}',
      '.aiui-eyes[data-f=xx] .aiui-pupil b::after{opacity:1;left:0;top:50%;width:10px;height:2.4px;margin-top:-1.2px;border-radius:2px;background:var(--c);transform:rotate(-45deg);}',
      '.aiui-eyes[data-f=squint] .aiui-pupil b{width:10px;height:10px;background:transparent;border-width:0;border-radius:0;}',
      '.aiui-eyes[data-f=squint] .aiui-eye:first-child .aiui-pupil b::before{opacity:1;left:0;width:9.6px;height:2.4px;border-radius:2px;background:var(--c);transform-origin:0 50%;top:0;transform:rotate(23deg);}',
      '.aiui-eyes[data-f=squint] .aiui-eye:first-child .aiui-pupil b::after{opacity:1;left:0;width:9.6px;height:2.4px;border-radius:2px;background:var(--c);transform-origin:0 50%;top:7.6px;transform:rotate(-23deg);}',
      '.aiui-eyes[data-f=squint] .aiui-eye:nth-child(2) .aiui-pupil b::before{opacity:1;left:.4px;width:9.6px;height:2.4px;border-radius:2px;background:var(--c);transform-origin:100% 50%;top:0;transform:rotate(-23deg);}',
      '.aiui-eyes[data-f=squint] .aiui-eye:nth-child(2) .aiui-pupil b::after{opacity:1;left:.4px;width:9.6px;height:2.4px;border-radius:2px;background:var(--c);transform-origin:100% 50%;top:7.6px;transform:rotate(23deg);}',
      '.aiui-eyes[data-f=love] .aiui-pupil b{--c:#ff7a9c;width:10px;height:10px;background:transparent;border-width:0;border-radius:0;animation:aiui-beat .9s ease-in-out infinite;}',
      '.aiui-eyes[data-f=love] .aiui-pupil b::before{opacity:1;top:1px;width:5px;height:8px;border-radius:5px 5px 0 0;background:var(--c);left:5px;transform:rotate(-45deg);transform-origin:0 100%;}',
      '.aiui-eyes[data-f=love] .aiui-pupil b::after{opacity:1;top:1px;width:5px;height:8px;border-radius:5px 5px 0 0;background:var(--c);left:0;transform:rotate(45deg);transform-origin:100% 100%;}',
      '@keyframes aiui-shake{0%,100%{transform:translateX(-1px)}50%{transform:translateX(1px)}}',
      '@keyframes aiui-scan{0%,100%{transform:translateX(-3px)}50%{transform:translateX(3px)}}',
      '.aiui-eyes[data-f=tired] .aiui-pupil b{width:10px;height:3px;background:transparent;border-width:0 2.4px 2.4px;border-radius:0 0 8px 8px;opacity:.85;}',
      '.aiui-eyes[data-f=tired]{transform:translateY(2px)}',
      '.aiui-eyes[data-f=bored] .aiui-eye:first-child .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=bored] .aiui-eye:nth-child(2) .aiui-pupil b{width:6px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=laugh] .aiui-pupil b{width:11px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0;}',
      '.aiui-eyes[data-f=laugh]{animation:aiui-hop .35s ease-in-out infinite}',
      '.aiui-eyes[data-f=giggle] .aiui-pupil b{width:11px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0;}',
      '.aiui-eyes[data-f=giggle]{animation:aiui-shake .28s linear infinite}',
      '.aiui-eyes[data-f=sob] .aiui-pupil b{width:11px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0;}',
      '.aiui-eyes[data-f=sob] .aiui-pupil b::after{opacity:1;left:50%;top:100%;margin:1px 0 0 -1.5px;width:3px;height:4px;border-radius:50%;background:#8ccfff;animation:aiui-tear 1.3s ease-in infinite;}',
      '.aiui-eyes[data-f=lookup] .aiui-pupil b{width:7px;height:7px;border-radius:50%;background:var(--c);border-width:0;transform:translate(0px,-3px);}',
      '.aiui-eyes[data-f=lookdown] .aiui-pupil b{width:7px;height:7px;border-radius:50%;background:var(--c);border-width:0;transform:translate(0px,3px);}',
      '.aiui-eyes[data-f=lookleft] .aiui-pupil b{width:7px;height:7px;border-radius:50%;background:var(--c);border-width:0;transform:translate(-3px,0px);}',
      '.aiui-eyes[data-f=lookright] .aiui-pupil b{width:7px;height:7px;border-radius:50%;background:var(--c);border-width:0;transform:translate(3px,0px);}',
      '.aiui-eyes[data-f=tiny] .aiui-pupil b{width:4px;height:4px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=oval] .aiui-pupil b{width:6px;height:11px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=chill] .aiui-pupil b{width:11px;height:6px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=woozy] .aiui-eye:first-child .aiui-pupil b{width:9px;height:9px;background:transparent;border-width:2.2px;border-radius:50%;}',
      '.aiui-eyes[data-f=woozy] .aiui-eye:nth-child(2) .aiui-pupil b{width:5px;height:5px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=plus] .aiui-pupil b{width:10px;height:10px;background:transparent;border-width:0;border-radius:0;}',
      '.aiui-eyes[data-f=plus] .aiui-pupil b::before{opacity:1;border-radius:2px;background:var(--c);left:0;top:50%;width:10px;height:2.4px;margin-top:-1.2px;}',
      '.aiui-eyes[data-f=plus] .aiui-pupil b::after{opacity:1;border-radius:2px;background:var(--c);left:50%;top:0;width:2.4px;height:10px;margin-left:-1.2px;}',
      '.aiui-eyes[data-f=diamond] .aiui-pupil b{width:7px;height:7px;border-radius:1px;background:var(--c);border-width:0;transform:rotate(45deg);}',
      '.aiui-eyes[data-f=wink-flat] .aiui-eye:first-child .aiui-pupil b{width:7px;height:7px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=wink-flat] .aiui-eye:nth-child(2) .aiui-pupil b{width:11px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=serene] .aiui-pupil b{width:12px;height:4px;background:transparent;border-width:0 2.4px 2.4px;border-radius:0 0 8px 8px;opacity:.9;}',
      '.aiui-eyes[data-f=pout] .aiui-eye:first-child .aiui-pupil b{width:7px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:rotate(-12deg);}',
      '.aiui-eyes[data-f=pout] .aiui-eye:nth-child(2) .aiui-pupil b{width:7px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:rotate(12deg);}',
      '.aiui-eyes[data-f=scan] .aiui-pupil b{width:7px;height:7px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=scan]{animation:aiui-scan 1.6s ease-in-out infinite}',
      '.aiui-eyes[data-f=spin] .aiui-pupil b{width:6px;height:6px;border-radius:50%;background:var(--c);border-width:0;}',
      '.aiui-eyes[data-f=spin]{animation:aiui-spin 1.4s linear infinite}',
      '.aiui-eyes[data-f=glance] .aiui-pupil b{width:8px;height:8px;border-radius:50%;background:var(--c);border-width:0;transform:translate(2px,-2px);}',
      '.aiui-eyes[data-f=shiny] .aiui-pupil b{width:11px;height:11px;background:transparent;border-width:2.2px;border-radius:50%;border-width:2px;}',
      '.aiui-eyes[data-f=shiny] .aiui-pupil b::before{opacity:1;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:var(--c);}',
      // ---- 表情库 · 追加 50 种（含 neutral 共 100 种）----
      '.aiui-eyes[data-f=sparkle] .aiui-pupil b{width:10px;height:10px;border-radius:0;border-width:0;background:var(--c);clip-path:polygon(50% 0,63% 50%,50% 100%,37% 50%);-webkit-clip-path:polygon(50% 0,63% 50%,50% 100%,37% 50%);animation:aiui-twinkle 1.4s ease-in-out infinite}',
      '.aiui-eyes[data-f=starstruck] .aiui-pupil b{width:11px;height:11px;border-radius:0;border-width:0;background:var(--c);clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);-webkit-clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:aiui-pulse .7s ease-in-out infinite}',
      '.aiui-eyes[data-f=heartbeat] .aiui-pupil b{--c:#ff4f8b;width:10px;height:10px;background:transparent;border-width:0;border-radius:0;animation:aiui-heartbeat 1s ease-in-out infinite}',
      '.aiui-eyes[data-f=heartbeat] .aiui-pupil b::before{opacity:1;top:1px;width:5px;height:8px;border-radius:5px 5px 0 0;background:var(--c);left:5px;transform:rotate(-45deg);transform-origin:0 100%}',
      '.aiui-eyes[data-f=heartbeat] .aiui-pupil b::after{opacity:1;top:1px;width:5px;height:8px;border-radius:5px 5px 0 0;background:var(--c);left:0;transform:rotate(45deg);transform-origin:100% 100%}',
      '@keyframes aiui-heartbeat{0%,100%{transform:scale(1)}10%{transform:scale(1.25)}20%{transform:scale(1)}30%{transform:scale(1.18)}45%{transform:scale(1)}}',
      '.aiui-eyes[data-f=pulse] .aiui-pupil b{width:8px;height:8px;border-radius:50%;background:var(--c);border-width:0;animation:aiui-pulse .6s ease-in-out infinite}',
      '.aiui-eyes[data-f=moon] .aiui-pupil b{width:10px;height:10px;background:transparent;border-width:2.4px;border-radius:50%;border-right-color:transparent;transform:rotate(-18deg)}',
      '.aiui-eyes[data-f=halfmoon] .aiui-pupil b{width:10px;height:10px;border-radius:50%;background:var(--c);border-width:0;clip-path:polygon(0 0,52% 0,52% 100%,0 100%);-webkit-clip-path:polygon(0 0,52% 0,52% 100%,0 100%);transform:rotate(-12deg)}',
      '.aiui-eyes[data-f=sun] .aiui-pupil b{width:7px;height:7px;border-radius:50%;background:var(--c);border-width:0;animation:aiui-twinkle 2s ease-in-out infinite}',
      '.aiui-eyes[data-f=sun] .aiui-pupil b::before{opacity:1;left:50%;top:50%;width:3px;height:13px;margin:-6.5px 0 0 -1.5px;border-radius:1.5px;background:var(--c);transform:rotate(45deg)}',
      '.aiui-eyes[data-f=sun] .aiui-pupil b::after{opacity:1;left:50%;top:50%;width:3px;height:13px;margin:-6.5px 0 0 -1.5px;border-radius:1.5px;background:var(--c);transform:rotate(-45deg)}',
      '.aiui-eyes[data-f=glow] .aiui-pupil b{width:9px;height:9px;background:transparent;border-width:2px;border-radius:50%;box-shadow:0 0 6px 1px rgba(143,176,255,.9)}',
      '.aiui-eyes[data-f=ring] .aiui-pupil b{width:10px;height:10px;background:transparent;border-width:2.2px;border-radius:50%}',
      '.aiui-eyes[data-f=target] .aiui-pupil b{width:11px;height:11px;background:transparent;border-width:2px;border-radius:50%}',
      '.aiui-eyes[data-f=target] .aiui-pupil b::before{opacity:1;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:var(--c)}',
      '.aiui-eyes[data-f=crosshair] .aiui-pupil b{width:10px;height:10px;background:transparent;border-width:2px;border-radius:50%}',
      '.aiui-eyes[data-f=crosshair] .aiui-pupil b::before{opacity:1;left:0;top:50%;width:10px;height:2px;margin-top:-1px;background:var(--c)}',
      '.aiui-eyes[data-f=crosshair] .aiui-pupil b::after{opacity:1;left:50%;top:0;width:2px;height:10px;margin-left:-1px;background:var(--c)}',
      '.aiui-eyes[data-f=flash] .aiui-pupil b{width:10px;height:10px;border-radius:0;border-width:0;background:var(--c);clip-path:polygon(60% 0,20% 55%,45% 55%,40% 100%,85% 40%,55% 40%);-webkit-clip-path:polygon(60% 0,20% 55%,45% 55%,40% 100%,85% 40%,55% 40%)}',
      '.aiui-eyes[data-f=bolt] .aiui-pupil b{width:10px;height:10px;border-radius:0;border-width:0;background:var(--c);clip-path:polygon(60% 0,20% 55%,45% 55%,40% 100%,85% 40%,55% 40%);-webkit-clip-path:polygon(60% 0,20% 55%,45% 55%,40% 100%,85% 40%,55% 40%);animation:aiui-pulse .5s ease-in-out infinite}',
      '.aiui-eyes[data-f=rainy] .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=rainy] .aiui-pupil b::after{opacity:1;left:50%;top:120%;margin:-1px 0 0 -1.5px;width:3px;height:5px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:#8ccfff;animation:aiui-tear 1.1s ease-in infinite}',
      '.aiui-eyes[data-f=snow] .aiui-pupil b{width:5px;height:5px;border-radius:50%;background:#fff;border-width:0;animation:aiui-pulse 1.8s ease-in-out infinite}',
      '.aiui-eyes[data-f=wind] .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:translate(-2px,0)}',
      '.aiui-eyes[data-f=wind] .aiui-pupil b::before{opacity:1;left:4px;top:6px;width:7px;height:2.4px;border-radius:2px;background:var(--c);opacity:.6}',
      '.aiui-eyes[data-f=wind] .aiui-pupil b::after{opacity:1;left:0;top:-6px;width:5px;height:2.4px;border-radius:2px;background:var(--c);opacity:.4}',
      '.aiui-eyes[data-f=hypno] .aiui-pupil b{width:11px;height:11px;background:transparent;border-width:2px;border-radius:50%}',
      '.aiui-eyes[data-f=hypno] .aiui-pupil b::before{opacity:1;left:50%;top:50%;width:4px;height:4px;margin:-3px 0 0 -3px;border-radius:50%;border:1.5px solid var(--c);background:transparent}',
      '.aiui-eyes[data-f=swirl] .aiui-pupil b{width:6px;height:6px;border-radius:50%;background:var(--c);border-width:0;transform:translate(2px,-2px)}',
      '.aiui-eyes[data-f=swirl] .aiui-pupil b::after{opacity:1;left:-4px;top:2px;width:6px;height:6px;border-radius:50%;border-width:2px;border-right-color:transparent;border-bottom-color:transparent;background:transparent}',
      '.aiui-eyes[data-f=arrowup] .aiui-pupil b{width:9px;height:9px;border-radius:0;border-width:0;background:var(--c);clip-path:polygon(50% 0,100% 55%,65% 55%,65% 100%,35% 100%,35% 55%,0 55%);-webkit-clip-path:polygon(50% 0,100% 55%,65% 55%,65% 100%,35% 100%,35% 55%,0 55%)}',
      '.aiui-eyes[data-f=arrowdown] .aiui-pupil b{width:9px;height:9px;border-radius:0;border-width:0;background:var(--c);clip-path:polygon(50% 100%,100% 45%,65% 45%,65% 0,35% 0,35% 45%,0 45%);-webkit-clip-path:polygon(50% 100%,100% 45%,65% 45%,65% 0,35% 0,35% 45%,0 45%)}',
      '.aiui-eyes[data-f=arrowleft] .aiui-pupil b{width:9px;height:9px;border-radius:0;border-width:0;background:var(--c);clip-path:polygon(0 50%,45% 0,45% 35%,100% 35%,100% 65%,45% 65%,45% 100%);-webkit-clip-path:polygon(0 50%,45% 0,45% 35%,100% 35%,100% 65%,45% 65%,45% 100%)}',
      '.aiui-eyes[data-f=arrowright] .aiui-pupil b{width:9px;height:9px;border-radius:0;border-width:0;background:var(--c);clip-path:polygon(100% 50%,55% 0,55% 35%,0 35%,0 65%,55% 65%,55% 100%);-webkit-clip-path:polygon(100% 50%,55% 0,55% 35%,0 35%,0 65%,55% 65%,55% 100%)}',
      '.aiui-eyes[data-f=check] .aiui-pupil b{width:10px;height:10px;border-radius:0;border-width:0;background:var(--c);clip-path:polygon(15% 55%,40% 82%,88% 22%,88% 42%,40% 100%,15% 75%);-webkit-clip-path:polygon(15% 55%,40% 82%,88% 22%,88% 42%,40% 100%,15% 75%)}',
      '.aiui-eyes[data-f=question] .aiui-pupil b{width:5px;height:5px;border-radius:50%;background:var(--c);border-width:0;transform:translate(-1px,-2px)}',
      '.aiui-eyes[data-f=question] .aiui-pupil b::after{opacity:1;left:-2px;top:2px;width:5px;height:5px;border-radius:0 0 6px 6px;border:0;border-bottom:2.4px solid var(--c);border-left:2.4px solid var(--c);background:transparent}',
      '.aiui-eyes[data-f=exclaim] .aiui-pupil b{width:3px;height:7px;border-radius:1.5px;background:var(--c);border-width:0;transform:translate(0,-1.5px)}',
      '.aiui-eyes[data-f=exclaim] .aiui-pupil b::after{opacity:1;left:50%;top:9px;width:3px;height:3px;margin-left:-1.5px;border-radius:50%;background:var(--c)}',
      '.aiui-eyes[data-f=doubt] .aiui-eye:first-child .aiui-pupil b{width:9px;height:2.4px;border-radius:2px;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=doubt] .aiui-eye:nth-child(2) .aiui-pupil b{width:5px;height:5px;border-radius:50%;background:var(--c);border-width:0;transform:translate(0,-2px)}',
      '.aiui-eyes[data-f=suspicious] .aiui-eye:first-child .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:translateY(-2px) rotate(14deg)}',
      '.aiui-eyes[data-f=suspicious] .aiui-eye:nth-child(2) .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:translateY(1px) rotate(-14deg)}',
      '.aiui-eyes[data-f=sideeye] .aiui-pupil b{width:6px;height:8px;border-radius:50%;background:var(--c);border-width:0;transform:translate(3px,0)}',
      '.aiui-eyes[data-f=judgy] .aiui-eye:first-child .aiui-pupil b{width:10px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0}',
      '.aiui-eyes[data-f=judgy] .aiui-eye:nth-child(2) .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=unimpressed] .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:translateY(2px) rotate(-6deg)}',
      '.aiui-eyes[data-f=smirk] .aiui-eye:first-child .aiui-pupil b{width:10px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0}',
      '.aiui-eyes[data-f=smirk] .aiui-eye:nth-child(2) .aiui-pupil b{width:6px;height:6px;border-radius:50%;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=grin] .aiui-pupil b{width:12px;height:7px;background:transparent;border-width:2.6px 2.6px 0;border-radius:9px 9px 0 0}',
      '.aiui-eyes[data-f=beam] .aiui-pupil b{width:11px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0}',
      '.aiui-eyes[data-f=beam] .aiui-pupil b::before{opacity:1;right:-1px;top:-3px;width:3.5px;height:3.5px;border-radius:0;background:var(--c);clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);-webkit-clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:aiui-twinkle 1.2s ease-in-out infinite}',
      '.aiui-eyes[data-f=blush] .aiui-pupil b{width:6px;height:6px;border-radius:50%;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=blush] .aiui-pupil b::before{opacity:1;left:-2px;top:5px;width:5px;height:2.4px;border-radius:2px;background:#ff9db6}',
      '.aiui-eyes[data-f=blush] .aiui-pupil b::after{opacity:1;left:-2px;top:9px;width:3px;height:2.4px;border-radius:2px;background:#ff9db6}',
      '.aiui-eyes[data-f=flirty] .aiui-eye:first-child .aiui-pupil b{width:11px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0}',
      '.aiui-eyes[data-f=flirty] .aiui-eye:nth-child(2) .aiui-pupil b{--c:#ff7a9c;width:10px;height:10px;background:transparent;border-width:0;border-radius:0;animation:aiui-beat .9s ease-in-out infinite}',
      '.aiui-eyes[data-f=flirty] .aiui-eye:nth-child(2) .aiui-pupil b::before{opacity:1;top:1px;width:5px;height:8px;border-radius:5px 5px 0 0;background:var(--c);left:5px;transform:rotate(-45deg);transform-origin:0 100%}',
      '.aiui-eyes[data-f=flirty] .aiui-eye:nth-child(2) .aiui-pupil b::after{opacity:1;top:1px;width:5px;height:8px;border-radius:5px 5px 0 0;background:var(--c);left:0;transform:rotate(45deg);transform-origin:100% 100%}',
      '.aiui-eyes[data-f=naughty] .aiui-eye:first-child .aiui-pupil b{width:9px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;transform:translate(-1px,-2px) rotate(-14deg)}',
      '.aiui-eyes[data-f=naughty] .aiui-eye:nth-child(2) .aiui-pupil b{width:6px;height:6px;border-radius:50%;background:var(--c);border-width:0;transform:translate(1px,0)}',
      '.aiui-eyes[data-f=sly] .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=sly] .aiui-pupil b::after{opacity:1;left:6px;top:3px;width:3px;height:3px;border-radius:50%;background:var(--c)}',
      '.aiui-eyes[data-f=mischief] .aiui-eye:first-child .aiui-pupil b{width:11px;height:6px;background:transparent;border-width:2.4px 2.4px 0;border-radius:8px 8px 0 0}',
      '.aiui-eyes[data-f=mischief] .aiui-eye:nth-child(2) .aiui-pupil b{width:10px;height:10px;border-radius:0;border-width:0;background:var(--c);clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);-webkit-clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:aiui-twinkle 1.2s ease-in-out infinite}',
      '.aiui-eyes[data-f=focus] .aiui-pupil b{width:8px;height:2px;border-radius:1px;background:var(--c);border-width:0;opacity:1}',
      '.aiui-eyes[data-f=laser] .aiui-pupil b{width:9px;height:2px;border-radius:1px;background:#ff5a6a;border-width:0;box-shadow:0 0 4px 1px rgba(255,90,106,.8)}',
      '.aiui-eyes[data-f=robot] .aiui-pupil b{width:9px;height:9px;border-radius:2px;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=glitch] .aiui-pupil b{width:10px;height:2.4px;border-radius:2px;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=glitch] .aiui-pupil b::before{opacity:.7;left:1px;top:-1px;width:8px;height:2.4px;border-radius:2px;background:#8ccfff}',
      '.aiui-eyes[data-f=glitch] .aiui-pupil b::after{opacity:.7;left:-1px;top:1px;width:8px;height:2.4px;border-radius:2px;background:#ff5a6a}',
      '.aiui-eyes[data-f=static] .aiui-pupil b{width:10px;height:2.4px;border-radius:0;background:transparent;border-width:0;background-image:repeating-linear-gradient(90deg,var(--c) 0 3px,transparent 3px 5px)}',
      '.aiui-eyes[data-f=droopy] .aiui-pupil b{width:11px;height:5px;background:transparent;border-width:0 2.4px 2.4px;border-radius:0 0 8px 8px;opacity:.8;transform:translateY(2px)}',
      '.aiui-eyes[data-f=owlish] .aiui-pupil b{width:12px;height:12px;background:transparent;border-width:2.4px;border-radius:50%}',
      '.aiui-eyes[data-f=puppy] .aiui-pupil b{width:10px;height:10px;border-radius:50%;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=puppy] .aiui-pupil b::before{opacity:1;left:2px;top:2px;width:3px;height:3px;border-radius:50%;background:#fff}',
      '.aiui-eyes[data-f=cat] .aiui-pupil b{width:4px;height:11px;border-radius:50%;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=derp] .aiui-eye:first-child .aiui-pupil b{width:7px;height:7px;border-radius:50%;background:var(--c);border-width:0;transform:translate(3px,0)}',
      '.aiui-eyes[data-f=derp] .aiui-eye:nth-child(2) .aiui-pupil b{width:7px;height:7px;border-radius:50%;background:var(--c);border-width:0;transform:translate(-3px,0)}',
      '.aiui-eyes[data-f=sparking] .aiui-pupil b{width:6px;height:6px;border-radius:50%;background:var(--c);border-width:0}',
      '.aiui-eyes[data-f=sparking] .aiui-pupil b::before{opacity:1;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:transparent;box-shadow:0 0 0 0 var(--c);animation:aiui-spark-ring 1.2s ease-out infinite}',
      '.aiui-eyes[data-f=sparking] .aiui-pupil b::after{opacity:1;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;border-radius:50%;background:transparent;box-shadow:0 0 0 0 var(--c);animation:aiui-spark-ring 1.2s ease-out .6s infinite}',
      '@keyframes aiui-spark-ring{0%{box-shadow:0 0 0 0 var(--c)}70%{opacity:.9}100%{box-shadow:0 0 0 5px transparent;opacity:0}}',
      '.aiui-eyes[data-f=peekaboo] .aiui-eye:first-child .aiui-pupil b{width:5px;height:5px;border-radius:50%;background:var(--c);border-width:0;opacity:.85}',
      '.aiui-eyes[data-f=peekaboo] .aiui-eye:nth-child(2) .aiui-pupil b{width:11px;height:2.4px;border-radius:2px;background:var(--c);border-width:0;opacity:.6}',
      // 眨眼 / 睁眼
      '.aiui-eye.do-blink{animation:aiui-blink .24s ease-in-out}',
      '.aiui-eye.do-blink-slow{animation:aiui-blink .56s ease-in-out}',
      '.aiui-eye.do-open{animation:aiui-open .5s cubic-bezier(.3,1.4,.5,1) .12s backwards}',
      '@keyframes aiui-blink{0%,100%{transform:scaleY(1)}45%,55%{transform:scaleY(.08)}}',
      '@keyframes aiui-open{0%{transform:scaleY(.08)}60%{transform:scaleY(1.18)}100%{transform:scaleY(1)}}',

      /* =====================================================================
       * 【动画实现 D】灵动岛式彩虹圆球：在胶囊右边「分裂」出来，大小 = 胶囊高度
       * ===================================================================== */
      '.aiui-orb{position:fixed;left:calc(var(--aiui-px) + 92px);top:calc(var(--aiui-py) + var(--aiui-vvt) + 2px);width:30px;height:30px;border-radius:50%;' +
        'z-index:' + (zTop - 1) + ';visibility:hidden;opacity:0;pointer-events:none;cursor:pointer;' +
        '-webkit-tap-highlight-color:transparent;touch-action:none;transform:translate3d(-34px,0,0) scale(.35);' +
        'transition:transform .32s cubic-bezier(.5,0,.75,0),opacity .22s ease .08s,visibility 0s linear .32s,left .4s cubic-bezier(.22,1,.36,1),top .4s cubic-bezier(.22,1,.36,1)}',
      '.aiui-orb.is-on{visibility:visible;opacity:1;pointer-events:auto;transform:none;' +
        'transition:transform .62s cubic-bezier(.34,1.56,.64,1),opacity .18s ease,visibility 0s,left .4s cubic-bezier(.22,1,.36,1),top .4s cubic-bezier(.22,1,.36,1)}',
      '.aiui-orb::after{content:"";position:absolute;left:-8px;right:-8px;top:-8px;bottom:-8px}',
      '.aiui-orb .aiui-halo{left:-1px;right:-1px;top:-1px;bottom:-1px;-webkit-filter:blur(6px);filter:blur(6px);opacity:.55}',
      '.aiui-orb .aiui-glow{left:-1px;right:-1px;top:-1px;bottom:-1px}',
      // 球芯：深色底 + 两层反向旋转的彩色光斑 + 居中的 AI 星芒
      '.aiui-core{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:50%;overflow:hidden;isolation:isolate;' +
        'background:radial-gradient(circle at 50% 30%,#23264a 0%,#0b0c16 78%);' +
        '-webkit-mask-image:-webkit-radial-gradient(white,black)}',
      '.aiui-swirl{position:absolute;left:50%;top:50%;width:0;height:0;animation:aiui-spin 6.5s linear infinite}',
      '.aiui-swirl.r{animation-duration:9s;animation-direction:reverse}',
      '.aiui-swirl i{position:absolute;left:0;top:0;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;' +
        '-webkit-filter:blur(5px);filter:blur(5px);opacity:.92}',
      '.aiui-swirl:not(.r) i:nth-child(1){background:#ff4f8b;transform:translate(7px,0)}',
      '.aiui-swirl:not(.r) i:nth-child(2){background:#3fd2ff;transform:translate(-4px,6px)}',
      '.aiui-swirl:not(.r) i:nth-child(3){background:#b25cff;transform:translate(-4px,-6px)}',
      '.aiui-swirl.r i:nth-child(1){background:#ffe45c;transform:translate(0,-7px);opacity:.75}',
      '.aiui-swirl.r i:nth-child(2){background:#59f2a0;transform:translate(0,7px);opacity:.7}',
      '.aiui-spark{position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;fill:#fff;' +
        '-webkit-filter:drop-shadow(0 0 3px rgba(255,255,255,.85));filter:drop-shadow(0 0 3px rgba(255,255,255,.85));' +
        'animation:aiui-twinkle 2.4s ease-in-out infinite}',
      '.aiui-spark.s1{left:73%;top:27%;width:6px;height:6px;margin:-3px 0 0 -3px;animation-delay:-.8s}',
      '.aiui-spark.s2{left:26%;top:74%;width:4.5px;height:4.5px;margin:-2.25px 0 0 -2.25px;animation-delay:-1.6s}',
      '@keyframes aiui-twinkle{0%,100%{transform:scale(.8) rotate(0deg);opacity:.75}50%{transform:scale(1.12) rotate(45deg);opacity:1}}',
      '.aiui-orb.do-pop .aiui-spark:not(.s1):not(.s2){animation:aiui-spark-pop .55s cubic-bezier(.3,1.5,.5,1)}',
      '.aiui-orb.do-pop .aiui-swirl{animation-duration:1.4s}',
      '@keyframes aiui-spark-pop{0%{transform:scale(.8) rotate(0)}40%{transform:scale(1.7) rotate(120deg)}100%{transform:scale(1) rotate(180deg)}}',

      // 胶囊本体：纯黑灵动岛质感（彩虹已移到圆球里）
      '.aiui-pill .aiui-glass{background:rgba(8,9,12,.92);-webkit-backdrop-filter:none;backdrop-filter:none;' +
        'box-shadow:inset 0 0 0 .5px rgba(255,255,255,.14)}',
      '.aiui-pill.is-awake .aiui-glass{box-shadow:inset 0 0 0 .5px rgba(255,255,255,.18),0 8px 22px rgba(0,0,0,.34)}',

      /* =====================================================================
       * 底部输入胶囊
       *   .aiui-bar     负责键盘抬升（translateY(-lift)，由 [10] 键盘处理 写入 --aiui-lift）
       *   .aiui-bar-in  负责出现 / 消失动画 + 毛玻璃外观
       * ===================================================================== */
      '.aiui-bar{position:fixed;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);' +
        'width:calc(100% - 24px);max-width:560px;margin:0 auto;z-index:' + zTop + ';pointer-events:none;' +
        'transform:translate3d(0,calc(var(--aiui-lift) * -1),0);' +
        'transition:transform .62s cubic-bezier(.3,1.3,.4,1)}',                    // 键盘弹出：弹簧上顶，略过冲再回落
      '.aiui-bar.kb-down{transition:transform .44s cubic-bezier(.32,.72,0,1)}',      // 键盘收起：顺滑落下（iOS 风格减速）
      '.aiui-bar.is-instant{transition:none !important}',
      // 落点"果冻感"：上顶到位时输入栏被轻轻压扁再弹回；收起时被拉长再复位
      '.aiui-bar-in.do-kb-up{transform-origin:50% 100%;animation:aiui-kb-up .6s cubic-bezier(.3,1.2,.4,1)}',
      '.aiui-bar-in.do-kb-down{transform-origin:50% 100%;animation:aiui-kb-down .5s cubic-bezier(.3,1.2,.4,1)}',
      '@keyframes aiui-kb-up{0%{transform:none}38%{transform:scale(1.025,.93)}72%{transform:scale(.994,1.03)}100%{transform:none}}',
      '@keyframes aiui-kb-down{0%{transform:none}30%{transform:scale(.985,1.06)}100%{transform:none}}',
      '.aiui-bar-in{display:flex;height:auto;min-height:0;align-items:flex-end;gap:8px;padding:6px 6px 6px 18px;border-radius:26px;' +
        'background:rgba(30,32,48,.55);' + bf('blur(26px) saturate(1.9)') + ';' +
        'box-shadow:inset 0 0 0 .5px rgba(255,255,255,.2),inset 0 1px 0 rgba(255,255,255,.18),0 14px 36px rgba(0,0,0,.38);' +
        'opacity:0;visibility:hidden;pointer-events:none;transform:translate3d(0,calc(100% + 40px),0) scale(.96);' +
        'transition:transform .5s cubic-bezier(.22,1,.36,1),opacity .28s ease,visibility 0s linear .5s}',
      '.aiui-bar.is-on .aiui-bar-in{opacity:1;visibility:visible;pointer-events:auto;transform:none;' +
        'transition:transform .55s cubic-bezier(.22,1,.36,1) .06s,opacity .3s ease .06s,visibility 0s}',
      '.aiui-ta{flex:1;min-width:0;box-sizing:border-box;display:block;height:38px;min-height:38px;max-height:' + TA_MAX_H + 'px;margin:0;padding:8px 0;border:0;outline:0;' +
        'resize:none;background:transparent;color:var(--aiui-ink);font-family:inherit;font-size:16px;line-height:22px;' +
        '-webkit-appearance:none;appearance:none;border-radius:0;overflow-y:hidden;caret-color:var(--aiui-accent);' +
        '-webkit-user-select:text;user-select:text}',
      '.aiui-ta::placeholder{color:rgba(245,246,251,.42)}',
      '.aiui-send{flex:none;width:38px;height:38px;margin:0;padding:0;border:0;border-radius:50%;display:flex;' +
        'align-items:center;justify-content:center;color:#fff;cursor:pointer;touch-action:manipulation;' +
        '-webkit-appearance:none;appearance:none;background:linear-gradient(135deg,#7f9fff,#9b7dff);' +
        'box-shadow:0 4px 12px rgba(120,130,255,.4);' +
        'transition:transform .18s cubic-bezier(.3,1.6,.5,1),opacity .2s ease,filter .2s ease,box-shadow .2s ease}',
      '.aiui-send svg{width:18px;height:18px;display:block}',
      '.aiui-send:not(:disabled):active{transform:scale(.86)}',
      '.aiui-send:disabled{opacity:.32;transform:scale(.88);box-shadow:none;-webkit-filter:saturate(.4);filter:saturate(.4);cursor:default}',

      /* =====================================================================
       * 【动画实现 E】历史窗口：胶囊下方的悬浮小窗（按草图：左上角，AI 在左、用户在右）
       *   从胶囊位置弹簧缩放展开；高度随键盘自动收缩，保证输入栏和小窗都看得见
       * ===================================================================== */
      '.aiui-hist{position:fixed;left:var(--aiui-hl);top:calc(var(--aiui-py) + 34px + 12px + var(--aiui-vvt));z-index:' + Z + ';' +
        'box-sizing:border-box;width:min(78vw,330px);height:min(46vh,400px);min-height:150px;' +
        'max-height:calc(100vh - var(--aiui-py) - 46px - var(--aiui-lift) - var(--aiui-bar-h) - env(safe-area-inset-bottom,0px) - 44px);' +
        'border-radius:26px;overflow:hidden;' +
        'background:linear-gradient(180deg,rgba(255,255,255,.1) 0%,rgba(255,255,255,.03) 100%),rgba(18,20,34,.66);' +
        bf('blur(26px) saturate(1.6)') + ';' +
        'box-shadow:inset 0 0 0 .5px rgba(255,255,255,.22),inset 0 1px 0 rgba(255,255,255,.26),0 18px 50px rgba(0,0,0,.45);' +
        'clip-path:inset(0 calc(100% - 64px - var(--aiui-dx)) calc(100% - 34px) var(--aiui-dx) round 17px);-webkit-clip-path:inset(0 calc(100% - 64px - var(--aiui-dx)) calc(100% - 34px) var(--aiui-dx) round 17px);' +
        'transform:translate3d(0,-46px,0);opacity:0;visibility:hidden;pointer-events:none;' +
        // 收起：先向下"蓄力"一点点（easeInBack），再缩回胶囊
        'transition:clip-path .46s cubic-bezier(.36,0,.66,-.4),-webkit-clip-path .46s cubic-bezier(.36,0,.66,-.4),' +
        'transform .46s cubic-bezier(.36,0,.66,-.5),opacity .22s ease .22s,visibility 0s linear .46s,' +
        'max-height .5s cubic-bezier(.3,1.2,.4,1)}',
      // 展开：先是胶囊大小的一小块，从胶囊处"长"成小窗（clip-path + 位移，灵动岛式）
      '.aiui-hist.is-open{clip-path:inset(0 0 0 0 round 26px);-webkit-clip-path:inset(0 0 0 0 round 26px);' +
        'transform:none;opacity:1;visibility:visible;pointer-events:auto;' +
        'transition:clip-path .62s cubic-bezier(.22,1,.36,1),-webkit-clip-path .62s cubic-bezier(.22,1,.36,1),' +
        'transform .66s cubic-bezier(.34,1.35,.64,1),opacity .15s ease,visibility 0s,max-height .5s cubic-bezier(.3,1.2,.4,1)}',
      // 内容稍晚淡入；× 旋转弹入；AI 思考时顶边有一道彩虹光扫过
      '.aiui-list{opacity:0;transition:opacity .15s ease}',
      '.aiui-hist:not(.is-open) .aiui-close{transform:rotate(100deg) scale(.3);opacity:0;transition:transform .28s ease-in,opacity .2s ease}',
      '.aiui-hist.is-open .aiui-list{opacity:1;transition:opacity .35s ease .2s}',
      '.aiui-hist.is-open .aiui-close{animation:aiui-close-in .55s cubic-bezier(.3,1.6,.5,1) .26s backwards}',
      '@keyframes aiui-close-in{from{opacity:0;transform:rotate(-120deg) scale(.3)}to{opacity:1;transform:none}}',
      '.aiui-hist::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;z-index:3;opacity:0;pointer-events:none;' +
        'background:linear-gradient(90deg,#ff4f8b,#ffe45c,#59f2a0,#3fd2ff,#b25cff) 0 0 / 60% 100% no-repeat;transition:opacity .3s ease}',
      '.aiui-hist.is-busy::before{opacity:.95;animation:aiui-sweep 1.4s ease-in-out infinite}',
      '@keyframes aiui-sweep{0%{background-position:-150% 0}100%{background-position:250% 0}}',
      '.aiui-msg.do-in{animation-name:aiui-msg-in2}',
      '@keyframes aiui-msg-in2{from{opacity:0;transform:translate3d(0,12px,0) scale(.94)}to{opacity:1;transform:none}}',
      // 滚动区：顶部给 × 留位置，上下边缘做渐隐
      '.aiui-list{position:absolute;left:0;top:0;right:0;bottom:0;overflow-y:auto;-webkit-overflow-scrolling:touch;' +
        'overscroll-behavior:contain;touch-action:pan-y;padding:40px 0 16px;' +
        '-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 34px,#000 calc(100% - 14px),transparent 100%);' +
        'mask-image:linear-gradient(to bottom,transparent 0,#000 34px,#000 calc(100% - 14px),transparent 100%)}',
      '.aiui-list-in{margin:0 auto;padding:0 12px}',
      '.aiui-hist-title{display:none}',
      '.aiui-close{position:absolute;right:10px;top:10px;width:26px;height:26px;margin:0;padding:0;' +
        'border:0;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--aiui-ink);' +
        'background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.25);cursor:pointer;z-index:2;' +
        'touch-action:manipulation;-webkit-appearance:none;appearance:none;' +
        'transition:transform .18s cubic-bezier(.3,1.6,.5,1),background .2s ease}',
      '.aiui-close::after{content:"";position:absolute;left:-8px;right:-8px;top:-8px;bottom:-8px}',
      '.aiui-close:active{transform:scale(.86);background:rgba(255,255,255,.26)}',
      '.aiui-close svg{width:12px;height:12px;display:block}',

      /* 消息气泡 */
      '.aiui-msg{display:flex;margin:0 0 10px;animation:aiui-msg-in .38s cubic-bezier(.22,1,.36,1) both}',
      '.aiui-msg.is-user{justify-content:flex-end}',
      '.aiui-msg-b{max-width:86%;padding:8px 12px;border-radius:17px;font-size:14px;line-height:1.5;color:var(--aiui-ink);' +
        'white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;-webkit-user-select:text;user-select:text}',
      '.aiui-msg.is-ai .aiui-msg-b{background:rgba(255,255,255,.13);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.16);' +
        'border-bottom-left-radius:7px}',
      '.aiui-msg.is-user .aiui-msg-b{background:linear-gradient(135deg,#7f9fff,#9b7dff);border-bottom-right-radius:7px}',
      '@keyframes aiui-msg-in{from{opacity:0;transform:translate3d(0,10px,0) scale(.96)}to{opacity:1;transform:none}}',
      // "正在输入"三个点
      '.aiui-dots{display:inline-flex;align-items:center;gap:4px;height:22px}',
      '.aiui-dots i{display:block;width:6px;height:6px;border-radius:50%;background:rgba(245,246,251,.75);' +
        'animation:aiui-dot 1.1s ease-in-out infinite}',
      '.aiui-dots i:nth-child(2){animation-delay:.16s}',
      '.aiui-dots i:nth-child(3){animation-delay:.32s}',
      '@keyframes aiui-dot{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-4px);opacity:1}}',

      /* 悬浮回复气泡：历史窗口没打开时，让用户也能看到回复（点它可展开历史） */
      '.aiui-bubble{position:fixed;left:var(--aiui-hl);top:calc(var(--aiui-py) + 34px + 10px + var(--aiui-vvt));box-sizing:border-box;max-width:calc(min(74vw,320px) + 28px);' +
        'padding:10px 14px;border-radius:7px 20px 20px 20px;font-size:14px;line-height:1.5;color:var(--aiui-ink);' +
        'background:rgba(30,32,48,.62);' + bf('blur(22px) saturate(1.8)') + ';' +
        'box-shadow:inset 0 0 0 .5px rgba(255,255,255,.2),0 12px 30px rgba(0,0,0,.35);z-index:' + zTop + ';cursor:pointer;' +
        'transform-origin:14px 0;transform:scale(.6) translate3d(0,-6px,0);opacity:0;visibility:hidden;' +
        '-webkit-user-select:none;user-select:none;' +
        'transition:transform .4s cubic-bezier(.3,1.4,.5,1),opacity .25s ease,visibility 0s linear .4s}',
      '.aiui-bubble.is-show{transform:none;opacity:1;visibility:visible;' +
        'transition:transform .4s cubic-bezier(.3,1.4,.5,1),opacity .25s ease,visibility 0s}',
      // 弹窗动画：①弹簧弹出（上面的 transform 过渡）②回复到达时蓝色光晕扩散一圈 ③文字逐字淡入
      '.aiui-bubble.do-glint{animation:aiui-glint .95s ease-out}',
      '@keyframes aiui-glint{0%{box-shadow:inset 0 0 0 .5px rgba(255,255,255,.5),0 12px 30px rgba(0,0,0,.35),0 0 0 0 rgba(130,165,255,.6)}' +
        '100%{box-shadow:inset 0 0 0 .5px rgba(255,255,255,.2),0 12px 30px rgba(0,0,0,.35),0 0 0 14px rgba(130,165,255,0)}}',
      '.aiui-ch{opacity:0;animation:aiui-ch .32s ease-out forwards}',
      '@keyframes aiui-ch{from{opacity:0}to{opacity:1}}',
      '.aiui-bubble-t{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;' +
        'white-space:pre-wrap;word-break:break-word}',

      /* 减弱动态效果：彩虹放慢、取消跳动，但保留（品牌动效不直接砍掉） */
      '@media (prefers-reduced-motion:reduce){' +
        '.aiui-bubble.do-glint{animation:none}.aiui-ch{animation-duration:.01s}' +
        '.aiui-halo::before,.aiui-glow::before,.aiui-glow::after{animation-duration:16s}' +
        '.aiui-eyes.is-dancing,.aiui-eyes.is-dancing .aiui-eye,.aiui-pill.is-dancing{animation:none !important}' +
        '.aiui-body.is-jelly,.aiui-body.is-jelly-pull{animation-duration:.01s}}'

    ].join('\n');
  }

  function injectStyle() {
    if (document.getElementById('aiui-style')) return;
    var st = document.createElement('style');
    st.id = 'aiui-style';
    st.appendChild(document.createTextNode(buildCSS()));
    (document.head || document.documentElement).appendChild(st);
  }

  /* =========================================================================
   * [3] DOM 构建（只向 body 追加一个 #aiui-root，不碰任何外部节点）
   * ========================================================================= */
  function buildDOM() {
    var eye = '<div class="aiui-eye"><i class="aiui-pupil"><b></b></i></div>';

    root = document.createElement('div');
    root.id = 'aiui-root';
    root.innerHTML =
      // 历史窗口（含标题与 × 关闭按钮）
      '<div class="aiui-hist" role="dialog" aria-modal="true" aria-label="对话记录" aria-hidden="true">' +
        '<div class="aiui-list"><div class="aiui-list-in"></div></div>' +
        '<div class="aiui-hist-title">对话记录</div>' +
        '<button class="aiui-close" type="button" aria-label="关闭">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
      '</div>' +
      // 悬浮回复气泡
      '<div class="aiui-bubble" role="status" aria-live="polite"><div class="aiui-bubble-t"></div></div>' +
      // 悬浮胶囊
      '<div class="aiui-pill" role="button" tabindex="0" aria-label="AI 陪聊">' +
        '<div class="aiui-body">' +
          '<div class="aiui-glass"></div>' +
          '<div class="aiui-eyes" data-f="sleep">' + eye + eye + '<i class="aiui-z">z</i><i class="aiui-z b">z</i></div>' +
        '</div>' +
      '</div>' +
      // 彩虹圆球（右滑胶囊时弹出）
      '<div class="aiui-orb" role="button" aria-label="AI 光环" aria-hidden="true">' +
        '<div class="aiui-halo"></div><div class="aiui-glow"></div>' +
        '<div class="aiui-core">' +
          '<div class="aiui-swirl"><i></i><i></i><i></i></div><div class="aiui-swirl r"><i></i><i></i></div>' +
          '<svg class="aiui-spark" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C12.6 7.4 16.6 11.4 22 12C16.6 12.6 12.6 16.6 12 22C11.4 16.6 7.4 12.6 2 12C7.4 11.4 11.4 7.4 12 2Z"/></svg><svg class="aiui-spark s1" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C12.6 7.4 16.6 11.4 22 12C16.6 12.6 12.6 16.6 12 22C11.4 16.6 7.4 12.6 2 12C7.4 11.4 11.4 7.4 12 2Z"/></svg><svg class="aiui-spark s2" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C12.6 7.4 16.6 11.4 22 12C16.6 12.6 12.6 16.6 12 22C11.4 16.6 7.4 12.6 2 12C7.4 11.4 11.4 7.4 12 2Z"/></svg>' +
        '</div>' +
      '</div>' +
      // 底部输入胶囊
      '<div class="aiui-bar" aria-hidden="true"><div class="aiui-bar-in">' +
        '<textarea class="aiui-ta" rows="1" placeholder="和我说点什么…" enterkeyhint="send" ' +
          'autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" aria-label="消息"></textarea>' +
        '<button class="aiui-send" type="button" aria-label="发送" disabled>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>' +
        '</button>' +
      '</div></div>' +
      // 用来读取 safe-area-inset-bottom 的探针
      '<div class="aiui-probe"></div>';

    document.body.appendChild(root);

    hist     = root.querySelector('.aiui-hist');
    list     = root.querySelector('.aiui-list');
    listIn   = root.querySelector('.aiui-list-in');
    closeBtn = root.querySelector('.aiui-close');
    bubble   = root.querySelector('.aiui-bubble');
    bubbleT  = root.querySelector('.aiui-bubble-t');
    pill     = root.querySelector('.aiui-pill');
    orb      = root.querySelector('.aiui-orb');
    body     = root.querySelector('.aiui-body');
    eyesEl   = root.querySelector('.aiui-eyes');
    eyeEls   = [].slice.call(root.querySelectorAll('.aiui-eye'));
    pupils   = [].slice.call(root.querySelectorAll('.aiui-pupil'));
    bar      = root.querySelector('.aiui-bar');
    barIn    = root.querySelector('.aiui-bar-in');
    ta       = root.querySelector('.aiui-ta');
    sendBtn  = root.querySelector('.aiui-send');
    probe    = root.querySelector('.aiui-probe');
  }

  /* =========================================================================
   * [4] 目光追随：监听屏幕 pointermove，按角度让瞳孔在 2~3px 内移动
   * ========================================================================= */
  var gaze = { x: 0, y: 0, t: 0, has: false };   // 最近一次手指位置
  var lock = { x: 0, y: 0, until: 0 };            // 表情强制的目光（看左 / 看右 / 思考），优先级高于追随
  var centers = null;                             // 两只眼睛的屏幕中心坐标缓存（null = 需要重新测量）
  var gazeRaf = 0, idleTimer = 0, lockTimer = 0;

  function measureEyes() {
    centers = eyeEls.map(function (el) {
      var r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  }

  function scheduleGaze() { if (!gazeRaf) gazeRaf = requestAnimationFrame(updateGaze); }

  function updateGaze() {
    gazeRaf = 0;
    if (!centers) measureEyes();
    var now = Date.now();
    var locked = now < lock.until;
    var tracking = !locked && S.awake && gaze.has && (now - gaze.t) < GAZE_IDLE_MS;

    for (var i = 0; i < pupils.length; i++) {
      var vx = 0, vy = 0;
      if (locked) {
        vx = lock.x; vy = lock.y;
      } else if (tracking) {
        // 每只眼睛各自朝手指方向算角度 → 两只瞳孔角度略有差异，更有"立体感"
        var dx = gaze.x - centers[i].x, dy = gaze.y - centers[i].y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0.5) {
          var m = Math.min(1, Math.pow(d / GAZE_RANGE, 0.7));   // 离得越远偏得越多，且有上限
          vx = dx / d * EYE_RX * m;
          vy = dy / d * EYE_RY * m;
        }
      }
      pupils[i].style.transform = 'translate3d(' + vx.toFixed(2) + 'px,' + vy.toFixed(2) + 'px,0)';
    }
  }

  function lookAt(x, y) {
    gaze.x = x; gaze.y = y; gaze.t = Date.now(); gaze.has = true;
    if (!idleTimer) idleTimer = setTimeout(idleCheck, GAZE_IDLE_MS + 40);
    if (S.awake && !root.classList.contains('is-scrolling')) scheduleGaze();   // 页面滑动期间不追手指，省掉每帧的瞳孔更新
  }
  function idleCheck() {                            // 手指静止一段时间后，瞳孔回正
    idleTimer = 0;
    var rest = gaze.t + GAZE_IDLE_MS - Date.now();
    if (rest > 0) { idleTimer = setTimeout(idleCheck, rest + 40); return; }
    scheduleGaze();
  }

  // 强制看向某个方向 ux/uy ∈ [-1,1]，持续 ms 毫秒（ms=0 取消）
  function lookDir(ux, uy, ms) {
    lock.x = ux * EYE_RX; lock.y = uy * EYE_RY; lock.until = Date.now() + ms;
    scheduleGaze();
    clearTimeout(lockTimer);
    lockTimer = setTimeout(scheduleGaze, ms + 40);
  }

  function bindLook() {
    var opt = { passive: true, capture: true };
    window.addEventListener('pointermove', function (e) { lookAt(e.clientX, e.clientY); }, opt);
    window.addEventListener('pointerdown', function (e) { lookAt(e.clientX, e.clientY); }, opt);
    // iOS 上手指一旦开始滚动页面，pointer 事件会被 cancel，这里用 touchmove 兜底继续追随
    window.addEventListener('touchmove', function (e) {
      var t = e.touches && e.touches[0];
      if (t) lookAt(t.clientX, t.clientY);
    }, opt);

    // 页面正在滑动 / 拖动时（比如 Bravais 墙面），暂停 AI 层的所有装饰动画和轮询，把每一帧都让给页面
    var scrollT = 0;
    function noteScroll() {
      if (!root.classList.contains('is-scrolling')) root.classList.add('is-scrolling');
      clearTimeout(scrollT);
      scrollT = setTimeout(function () { root.classList.remove('is-scrolling'); }, 180);
    }
    window.addEventListener('touchmove', noteScroll, opt);
    window.addEventListener('wheel', noteScroll, opt);
    document.addEventListener('scroll', noteScroll, { passive: true, capture: true });
  }

  /* =========================================================================
   * [5] 音乐状态联动：监听 <audio id="audio"> 的 play / pause
   * ========================================================================= */
  function getAudio() { return document.getElementById('audio'); }

  function syncMusic() {
    var a = getAudio();
    S.playing = !!(a && !a.paused && !a.ended);
    applyMood();
  }

  // 播放 → 上下呼吸；暂停 → 半闭慵懒。刚唤醒的 2.6 秒内先睁大眼睛，再慢慢困下去
  var DANCE_MOVES = ['bob', 'sway', 'hop', 'tilt', 'swing', 'twirl', 'wave', 'run', 'flip', 'leap', 'roll', 'spin', 'bounce'];
  var DANCE_FACES = ['neutral', 'happy', 'content', 'squint', 'star', 'love', 'excited', 'laugh', 'shiny', 'starstruck', 'heartbeat', 'sparkle', 'grin', 'beam', 'glow'];
  var danceTimer = 0, danceFace = 'neutral';

  var DANCE_DUR = { bob: 620, sway: 860, hop: 520, tilt: 1000, swing: 720, twirl: 1900, wave: 600, run: 1100, flip: 1500, leap: 800, roll: 1300, spin: 1000, bounce: 550 };
  var DANCE_TURN = { twirl: 1, flip: 1, roll: 1, spin: 1 };      // 旋转类动作：只转 1 或 2 圈，转完停一下再换

  function setDance(m, total) {
    eyesEl.setAttribute('data-d', m);
    pill.setAttribute('data-d', m);                                // 整个胶囊也跟着跳同一套舞步
    danceFace = pick(DANCE_FACES);
    renderFace();
    clearTimeout(danceTimer);
    danceTimer = setTimeout(danceStep, total + 60);                // 兜底：万一 animationend 没触发，也能按时进入下一套
  }

  function danceStep() {
    var m = pick(DANCE_MOVES);
    var dur = DANCE_DUR[m] || 1000;
    if (DANCE_TURN[m]) {                                           // 旋转类：转 1~2 圈，靠 animationend 在循环边界切换，衔接最顺
      root.style.setProperty('--aiui-spin', (Math.random() < 0.5 ? 360 : 720) + 'deg');
      setDance(m, dur);
      return;
    }
    var cycles = Math.max(1, Math.round(rand(2200, 4200) / dur));  // 摇摆类动作完整跳完 N 个循环
    setDance(m, dur * cycles);
  }

  function bindDanceEnd() {
    pill.addEventListener('animationend', function (e) {
      if (!S.playing || document.hidden) return;
      var m = pill.getAttribute('data-d');
      if (DANCE_TURN[m] && /^aiui-p/.test(e.animationName || '')) danceStep();
    });
  }

  function applyMood() {
    var still = !!(document.body && document.body.classList.contains('open'));   // 设置 / 歌曲面板打开：小眼睛保持不动
    root.classList.toggle('is-still', still);
    var dancing = S.playing && !document.hidden && !still;
    eyesEl.classList.toggle('is-dancing', dancing);
    pill.classList.toggle('is-dancing', dancing);
    if (dancing && !danceTimer) danceStep();
    else if (!dancing && danceTimer) {
      clearTimeout(danceTimer); danceTimer = 0;
      eyesEl.removeAttribute('data-d');
      pill.removeAttribute('data-d');
    }
    renderFace();
  }

  // 表情：基础表情由状态决定（休眠=横线，播放/刚唤醒=圆点，暂停=小点）；setFace 临时覆盖一段时间
  var faceTimer = 0, faceOverride = '';
  function baseFace() {
    if (S.playing && danceTimer) return danceFace;                            // 播放音乐：不管休眠还是唤醒，都跳舞
    if (!S.awake) return 'sleep';
    return S.wakeBoost ? 'neutral' : 'calm';
  }
  function renderFace() {
    var f = faceOverride || baseFace();
    if (eyesEl.getAttribute('data-f') !== f) eyesEl.setAttribute('data-f', f);
  }
  function setFace(name, ms) {
    faceOverride = name; renderFace();
    clearTimeout(faceTimer);
    faceTimer = setTimeout(function () { faceOverride = ''; renderFace(); }, ms || 1600);
  }
  function clearFace() { clearTimeout(faceTimer); faceOverride = ''; renderFace(); }

  function bindMusic() {
    // 媒体事件不冒泡，但可以在 document 上用捕获阶段接收；这样 audio 元素被替换也不会丢
    ['play', 'playing', 'pause', 'ended', 'emptied', 'abort', 'error'].forEach(function (name) {
      document.addEventListener(name, function (e) {
        var t = e.target;
        if (!t || t.id !== 'audio') return;
        if (e.type === 'error') { setFace('worried', 1800); return; }
        var was = S.playing;
        syncMusic();
        if (S.awake && !was && S.playing) setFace(pick(FACES_JOY), 1600);   // 开始播放：开心一下
        if (S.awake && e.type === 'ended') setFace('dazed', 1500);          // 播完了：愣一下
      }, true);
    });
    document.addEventListener('visibilitychange', function () { syncMusic(); });
    // 面板开 / 关（body.open 变化）时立即切换 舞动 ↔ 静止
    try { new MutationObserver(function () { applyMood(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (_) {}
    syncMusic();
  }

  /* =========================================================================
   * [6] 随机微表情：每 5 秒左右，随机眨眼 / 看左右 / 笑眼
   * ========================================================================= */
  var lifeTimer = 0;

  function blink(double) {
    var slow = /^(calm|sleep|sleepy|dreamy)$/.test(eyesEl.getAttribute('data-f'));        // 犯困时眨得更慢
    eyeEls.forEach(function (el) { playClass(el, slow ? 'do-blink-slow' : 'do-blink', slow ? 600 : 260); });
    if (double && !slow) setTimeout(function () { if (S.awake) blink(false); }, 320);
  }

  function smile(ms) {                                       // 弯弯的笑眼 ∩ ∩
    if (!S.awake) return;
    setFace('happy', ms || 1600);
  }

  function lookSide() {
    lookDir(Math.random() < 0.5 ? -1 : 1, rand(-0.2, 0.35), rand(1100, 1900));
  }

  // 表情库分组
  var FACES_LIVELY = ['happy', 'content', 'wink', 'wink2', 'hmm', 'curious', 'star', 'squint', 'shy', 'smug', 'love', 'excited', 'stare', 'wow',
                      'laugh', 'giggle', 'tiny', 'chill', 'serene', 'scan', 'glance', 'shiny', 'lookup', 'lookleft', 'lookright',
                      'lookdown', 'wink-flat', 'diamond', 'plus', 'oval', 'bored',
                      'sparkle', 'starstruck', 'heartbeat', 'pulse', 'moon', 'halfmoon', 'sun', 'glow', 'ring', 'target',
                      'crosshair', 'flash', 'bolt', 'rainy', 'snow', 'wind', 'hypno', 'swirl', 'arrowup', 'arrowdown',
                      'arrowleft', 'arrowright', 'check', 'question', 'exclaim', 'doubt', 'suspicious', 'sideeye', 'judgy',
                      'unimpressed', 'smirk', 'grin', 'beam', 'blush', 'flirty', 'naughty', 'sly', 'mischief', 'focus',
                      'laser', 'robot', 'glitch', 'static', 'droopy', 'owlish', 'puppy', 'cat', 'derp', 'sparking', 'peekaboo'];
  var FACES_POKED  = ['happy', 'wink', 'wink2', 'surprised', 'wow', 'content', 'hmm', 'squint', 'love', 'excited', 'shy', 'dazed',
                      'curious', 'star', 'deadpan', 'smug', 'angry', 'xx', 'dizzy', 'cry', 'worried', 'stare',
                      'tired', 'bored', 'laugh', 'giggle', 'sob', 'tiny', 'oval', 'chill', 'woozy', 'plus', 'diamond', 'wink-flat',
                      'serene', 'pout', 'scan', 'spin', 'glance', 'shiny',
                      'heartbeat', 'starstruck', 'sparkle', 'suspicious', 'judgy', 'sideeye', 'smirk', 'sly', 'mischief', 'flirty',
                      'laser', 'robot', 'glitch', 'derp', 'puppy', 'cat', 'question', 'exclaim', 'doubt', 'check',
                      'target', 'crosshair', 'flash', 'sun', 'glow', 'ring', 'hypno', 'swirl', 'grin', 'beam',
                      'blush', 'naughty', 'focus', 'droopy', 'owlish', 'static', 'rainy', 'snow', 'wind', 'arrowup',
                      'arrowdown', 'arrowleft', 'arrowright', 'pulse', 'moon', 'halfmoon', 'peekaboo', 'sparking', 'bolt'];
  var FACES_JOY    = ['happy', 'love', 'excited', 'star', 'wink', 'squint', 'laugh', 'giggle', 'shiny', 'starstruck', 'heartbeat', 'sparkle', 'grin', 'beam', 'sun', 'puppy'];
  var FACES_DREAM  = ['dreamy', 'peek', 'sleepy', 'dreamy'];
  var sleepSkip = 0;

  // 两种常态：活跃（唤醒）= 眨眼、东张西望、随机换表情；休眠 = 慢呼吸、飘 z、偶尔做梦 / 睁一只眼偷看
  function lifeTick() {
    if (document.hidden) return;
    if (!S.awake) {                                           // —— 休眠态 ——
      if (S.playing || faceOverride || (++sleepSkip % 2)) return;          // 休眠时节奏放慢一倍
      setFace(pick(FACES_DREAM), rand(1800, 3000));
      return;
    }
    if (S.pending > 0) return;                                // —— 活跃态 ——
    var r = Math.random();
    setTimeout(function () {                                  // 加一点随机延迟，避免节奏像机器
      if (!S.awake || faceOverride) return;
      if (r < 0.34) blink(Math.random() < 0.25);
      else if (r < 0.54) lookSide();
      else if (!S.playing) setFace(pick(FACES_LIVELY), rand(1300, 2200));
    }, rand(0, 1500));
  }

  function startLife() { if (!lifeTimer) lifeTimer = setInterval(lifeTick, LIFE_MS); }
  function stopLife()  { clearInterval(lifeTimer); lifeTimer = 0; }

  /* =========================================================================
   * [7] 唤醒 / 休眠
   * ========================================================================= */
  var boostTimer = 0;

  function setAwake(on) {
    if (on === S.awake) return;
    S.awake = on;
    pill.classList.toggle('is-awake', on);
    orb.classList.toggle('is-on', on);                                     // 唤醒 = 圆球弹出
    orb.setAttribute('aria-hidden', on ? 'false' : 'true');
    bar.classList.toggle('is-on', on);
    bar.setAttribute('aria-hidden', on ? 'false' : 'true');
    centers = null;

    if (on) {
      S.wakeAt = Date.now();
      S.wakeBoost = true;
      applyMood();
      eyeEls.forEach(function (el) { playClass(el, 'do-open', 700); });    // 眼睛"啪"地睁开
      setTimeout(function () { setFace(pick(FACES_JOY), 1400); }, 520);   // 打个招呼
      clearTimeout(boostTimer);
      boostTimer = setTimeout(function () { S.wakeBoost = false; applyMood(); }, 2600);
      startLife();
      measureBar();
      scheduleGaze();
    } else {
      clearTimeout(boostTimer);
      S.wakeBoost = false;
      clearFace();
      applyMood();
      hideBubble();
      ta.blur();
      lock.until = 0; gaze.has = false;                                    // 瞳孔回正
      scheduleGaze();
    }
  }

  /* =========================================================================
   * [8] 历史窗口 + 消息列表
   * ========================================================================= */
  function openHistory() {
    if (S.history) return;
    setAwake(true);                      // 展开历史时同时唤醒（需要眼睛和输入框）
    S.history = true;
    hideBubble();
    hist.classList.add('is-open');
    hist.setAttribute('aria-hidden', 'false');
    var rows = [].slice.call(listIn.children), start = Math.max(0, rows.length - 8);   // 最近 8 条依次弹入
    rows.slice(start).forEach(function (row, i) {
      row.style.animationDelay = (240 + i * 60) + 'ms';
      playClass(row, 'do-in', 1400);
      setTimeout(function () { row.style.animationDelay = ''; }, 1500);
    });
    scrollToEnd(false);
    setTimeout(function () { scrollToEnd(false); }, 80);
    measureBar();
  }

  function closeHistory() {
    if (!S.history) return;
    S.history = false;
    hist.classList.remove('is-open');
    hist.setAttribute('aria-hidden', 'true');
    ta.blur();
  }

  var scrollTok = 0;
  function scrollToEnd(animated) {
    var target = list.scrollHeight - list.clientHeight;
    var tok = ++scrollTok;
    if (!animated || !S.history) { list.scrollTop = target; return; }
    var from = list.scrollTop, dist = target - from, t0 = Date.now(), dur = 320;
    if (dist <= 0) return;
    (function step() {
      if (tok !== scrollTok) return;
      var p = Math.min(1, (Date.now() - t0) / dur);
      list.scrollTop = from + dist * (1 - Math.pow(1 - p, 3));
      if (p < 1) requestAnimationFrame(step);
    })();
  }

  // 追加一条消息；返回气泡节点（用于把"正在输入"替换成正式回复）
  function addMsg(role, text, typing) {
    var row = document.createElement('div');
    row.className = 'aiui-msg ' + (role === 'user' ? 'is-user' : 'is-ai');
    var b = document.createElement('div');
    b.className = 'aiui-msg-b';
    if (typing) b.innerHTML = '<span class="aiui-dots"><i></i><i></i><i></i></span>';
    else b.textContent = text;                                  // textContent：不会解析 HTML，杜绝注入
    row.appendChild(b);
    listIn.appendChild(row);
    scrollToEnd(true);
    return b;
  }

  /* 悬浮回复气泡 */
  var bubbleTimer = 0;
  var morphT = 0;

  // 逐字淡入：返回整段文字显示完需要的毫秒数
  function fillText(text, target) {
    target = target || bubbleT;
    target.textContent = '';
    var chars = Array.from(text);
    var step = Math.min(34, 1500 / Math.max(1, chars.length));
    var frag = document.createDocumentFragment();
    chars.forEach(function (c, i) {
      var sp = document.createElement('span');
      sp.className = 'aiui-ch';
      sp.style.animationDelay = (i * step).toFixed(0) + 'ms';
      sp.textContent = c;                                       // textContent：不会解析 HTML
      frag.appendChild(sp);
    });
    target.appendChild(frag);
    return chars.length * step + 320;
  }

  // 弹窗已经显示时换内容（"…" → 回复）：宽高平滑过渡，而不是瞬间跳变
  function morphBubble(w0, h0) {
    bubble.style.width = ''; bubble.style.height = '';
    var w1 = bubble.offsetWidth, h1 = bubble.offsetHeight;
    if (Math.abs(w1 - w0) < 2 && Math.abs(h1 - h0) < 2) return;
    bubble.style.transition = 'none';
    bubble.style.width = w0 + 'px'; bubble.style.height = h0 + 'px'; bubble.style.overflow = 'hidden';
    void bubble.offsetWidth;
    bubble.style.transition = 'width .42s cubic-bezier(.3,1.35,.5,1),height .42s cubic-bezier(.3,1.35,.5,1)';
    bubble.style.width = w1 + 'px'; bubble.style.height = h1 + 'px';
    clearTimeout(morphT);
    morphT = setTimeout(function () {
      bubble.style.transition = ''; bubble.style.width = ''; bubble.style.height = ''; bubble.style.overflow = '';
    }, 460);
  }

  function showBubble(text, typing) {
    clearTimeout(bubbleTimer);
    var was = bubble.classList.contains('is-show');
    var w0 = was ? bubble.offsetWidth : 0, h0 = was ? bubble.offsetHeight : 0;
    var reveal = 0;
    if (typing) bubbleT.innerHTML = '<span class="aiui-dots"><i></i><i></i><i></i></span>';
    else reveal = fillText(text);
    bubble.classList.add('is-show');
    if (was) morphBubble(w0, h0);
    if (!typing) {
      playClass(bubble, 'do-glint', 1000);
      bubbleTimer = setTimeout(hideBubble, clamp(2800 + text.length * 120, 3200, 7000) + reveal);
    }
  }
  function hideBubble() { clearTimeout(bubbleTimer); bubble.classList.remove('is-show'); }

  // 点击任意空白处：收起键盘 + 关闭输入窗口（圆球收回、回到休眠）。对话小窗开着时，第一下只收小窗
  function bindOutsideTap() {
    document.addEventListener('pointerdown', function (e) {
      if (!S.awake) return;
      if (Date.now() - S.wakeAt < 500) return;                 // 刚滑出来的那一下不算
      if (root.contains(e.target)) return;                     // 点在胶囊 / 圆球 / 输入栏 / 气泡 / 小窗上：不关
      ta.blur();
      if (S.history) { setTimeout(closeHistory, 90); return; } // 小窗开着：键盘和输入栏先落下，90ms 后小窗再收（错落感）
      showOrb(false);
    }, true);                                                  // 捕获阶段：不影响 App 自己的点击
  }

  function bindHistory() {
    closeBtn.addEventListener('click', closeHistory);
    // 圆球：点按 = 互动（星芒迸发）；向左滑 = 收回
    var og = { id: null, x: 0, y: 0 };
    orb.addEventListener('pointerdown', function (e) { og.id = e.pointerId; og.x = e.clientX; og.y = e.clientY; });
    orb.addEventListener('pointercancel', function () { og.id = null; });
    orb.addEventListener('pointerup', function (e) {
      if (e.pointerId !== og.id) return;
      og.id = null;
      var dx = e.clientX - og.x, dy = e.clientY - og.y;
      if (dx < -22 && Math.abs(dx) > Math.abs(dy)) { showOrb(false); return; }
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
        playClass(orb, 'do-pop', 600);
        setFace(pick(FACES_JOY), 1400);
      }
    });
    bubble.addEventListener('click', openHistory);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeHistory(); });

    // 历史窗口打开时，禁止手势穿透到下面的 App 页面（只允许消息列表自己滚动）
    hist.addEventListener('touchmove', function (e) {
      if (!list.contains(e.target) || list.scrollHeight <= list.clientHeight + 1) e.preventDefault();
    }, { passive: false });
  }

  /* =========================================================================
   * [9] 手势判定（pointerdown / pointermove / pointerup）
   *   · 位移 < TAP_SLOP 松手        → 点按：唤醒 / 休眠
   *   · 按住向下滑动 > PULL_PX(30)   → 立即展开历史窗口（手指不用抬起）
   *   · 其它拖动 / 被系统打断        → 回弹，不触发任何功能
   * ========================================================================= */
  var SWIPE_PX = 26;                              // 横向滑动多少像素触发圆球
  var G = { id: null, sx: 0, sy: 0, moved: false, fired: false };

  // 右滑 = 弹出圆球并唤醒（出现输入框）；左滑 = 收回圆球并休眠
  function showOrb(on) {
    if (on === S.awake) return;
    setAwake(on);
    if (!on) setFace('sleepy', 1200);                                 // 收回去：打个哈欠，然后睡着
  }

  // 点按：只是和它互动（换个表情），不会唤醒 / 弹输入框
  var lastFace = '';
  function interact() {
    var f;
    do { f = pick(FACES_POKED); } while (f === lastFace);
    lastFace = f;
    setFace(f, 1300);
    eyeEls.forEach(function (el) { playClass(el, 'do-blink', 260); });
  }

  var jellyTimer = 0;                                   // 果冻回弹的清理计时器（原先漏了声明，严格模式下点按会抛 ReferenceError）
  function clearJelly() {
    clearTimeout(jellyTimer);
    body.classList.remove('is-jelly', 'is-jelly-pull');
  }
  function jelly(cls) {
    clearJelly();
    void body.offsetWidth;
    body.classList.add(cls);
    jellyTimer = setTimeout(clearJelly, 700);
  }

  function onTap() {
    interact();
  }

  function bindGesture() {
    pill.addEventListener('pointerdown', function (e) {
      if (G.id !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      G.id = e.pointerId; G.sx = e.clientX; G.sy = e.clientY; G.moved = false; G.fired = false;
      try { pill.setPointerCapture(e.pointerId); } catch (_) {}   // 手指滑出胶囊范围也继续收事件
      clearJelly();
      pill.classList.add('is-dragging');
      body.classList.add('is-press');                              // 按下：挤压
    });

    pill.addEventListener('pointermove', function (e) {
      if (e.pointerId !== G.id) return;
      var dx = e.clientX - G.sx, dy = e.clientY - G.sy;
      if (!G.moved && dx * dx + dy * dy > TAP_SLOP * TAP_SLOP) G.moved = true;
      if (G.fired || !G.moved) return;

      if (Math.abs(dx) > Math.abs(dy)) {
        // 横滑反馈：胶囊被"拽"着横向走（带阻尼）并横向拉长
        var kx = clamp(dx / SWIPE_PX, -1, 1);
        pill.style.transform = 'translate3d(' + (kx * 8).toFixed(2) + 'px,0,0)';
        body.style.transform = 'scale(' + (1 + Math.abs(kx) * 0.12).toFixed(3) + ',' + (1 - Math.abs(kx) * 0.07).toFixed(3) + ')';
        if (dx > SWIPE_PX)       { G.fired = 'h'; showOrb(true); }    // 右滑：弹出圆球
        else if (dx < -SWIPE_PX) { G.fired = 'h'; showOrb(false); }   // 左滑：收回圆球
        return;
      }

      // 下拉过程的视觉反馈：胶囊被"拽"着往下走（带阻尼）并纵向拉长
      var k = clamp(dy / PULL_PX, 0, 1);
      pill.style.transform = 'translate3d(0,' + (k * 10).toFixed(2) + 'px,0)';
      body.style.transform = 'scale(' + (1 - k * 0.06).toFixed(3) + ',' + (1 + k * 0.16).toFixed(3) + ')';

      // 判定：向下 > 30px，且以纵向为主（避免斜着划误触）
      if (dy > PULL_PX && dy > Math.abs(dx)) {
        G.fired = 'v';
        openHistory();
      }
    });

    function finish(e, cancelled) {
      if (e.pointerId !== G.id) return;
      try { pill.releasePointerCapture(e.pointerId); } catch (_) {}
      var tap = !cancelled && !G.moved && !G.fired;
      G.id = null;
      pill.classList.remove('is-dragging');
      pill.style.transform = '';                                   // 位移弹簧回位
      body.classList.remove('is-press');
      body.style.transform = '';
      if (cancelled) return;
      if (tap) { onTap(); jelly('is-jelly'); }                     // 点按：回弹
      else jelly(G.fired === 'h' ? 'is-jelly' : 'is-jelly-pull');                                 // 下拉：从拉长状态果冻回弹
    }
    pill.addEventListener('pointerup', function (e) { finish(e, false); });
    pill.addEventListener('pointercancel', function (e) { finish(e, true); });
    pill.addEventListener('lostpointercapture', function (e) { finish(e, true); });

    // 无障碍：键盘 / 读屏器操作
    pill.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); jelly('is-jelly'); }
    });
  }

  /* =========================================================================
   * [10] 键盘处理（iOS）：用 window.visualViewport 抬高输入框
   *
   * 原理：iOS 弹出键盘时，布局视口（layout viewport）不变，只有可视视口
   *   （visual viewport）缩小，甚至整体被平移（offsetTop > 0）。
   *   键盘遮住布局视口底部的高度 = innerHeight - vv.height - vv.offsetTop。
   *   把这个值写入 --aiui-lift，输入框就 translateY(-lift) 贴到键盘上沿；
   *   同时把 --aiui-vvt（= vv.offsetTop）加到顶部元素上，让胶囊 / × 始终留在可视区内。
   * ========================================================================= */
  var vpRaf = 0, focusScrollY = 0;

  function scheduleVP() { if (!vpRaf) vpRaf = requestAnimationFrame(syncViewport); }
  function burstVP() { [0, 100, 250, 450, 800].forEach(function (d) { setTimeout(scheduleVP, d); }); }

  var lastLift = 0, closeUntil = 0;
  function getLift() { return parseFloat(root.style.getPropertyValue('--aiui-lift')) || 0; }
  function kbDir(dir) {                                        // 键盘上顶 / 收起：切换缓动曲线 + 播放果冻动画
    bar.classList.toggle('kb-down', dir === 'down');
    if (S.awake) playClass(barIn, dir === 'up' ? 'do-kb-up' : 'do-kb-down', 640);
  }

  function syncViewport() {
    vpRaf = 0;
    var vv = window.visualViewport;
    var kb = 0;
    if (vv) {
      kb = Math.max(0, document.documentElement.clientHeight - vv.height - vv.offsetTop);
    }
    var vvTop = (vv && vv.offsetTop > 0) ? vv.offsetTop : 0;

    if (kb > 100 && (window.pageYOffset || 0) !== focusScrollY) {
      window.scrollTo(0, focusScrollY);
    }

    var sab = probe.offsetHeight || 0;
    var lift = kb > KB_MIN ? Math.max(0, kb - sab) : 0;
    var currentLift = getLift();
    if (Date.now() < closeUntil && document.activeElement !== ta) lift = 0;   // 收起过程中别被残留的视口高度拉回去
    if (lift > KB_MIN) lastLift = lift;
    if (lift > currentLift + 1) kbDir('up'); else if (lift < currentLift - 1) kbDir('down');

    root.style.setProperty('--aiui-lift', lift + 'px');
    root.style.setProperty('--aiui-vvt', vvTop + 'px');
    
    centers = null;
    scheduleGaze();
  }

  function restoreScroll() {                                  // 修复 iOS 键盘收起后页面偶发残留位移
    if (Math.abs((window.pageYOffset || 0) - focusScrollY) > 1) window.scrollTo(0, focusScrollY);
  }

  // 默认位置：左上角返回键的正下方（左 14px，顶部 = 安全区 + 68px），不管返回键显不显示都固定在这里。
  // 只有 Bravais 墙面的 #bravais-close、「其他选项」的 .qp-back 出现在顶部时，才回到并排右移的旧做法。
  var BACK_SEL = '#bravais-close,.qp-back', curKey = '';
  function isShown(el) {
    for (var n = el, i = 0; n && n !== document.body && i < 8; n = n.parentElement, i++) {
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) return false;
    }
    return true;
  }
  function avoidBack() {
    if (document.hidden || root.classList.contains('is-scrolling')) return;   // 滑动中不测量布局，避免强制回流
    var wall = document.getElementById('bravais-wall');
    var wallOn = !!(wall && wall.getAttribute('aria-hidden') !== 'true');
    if (wallOn !== root.classList.contains('is-wall')) root.classList.toggle('is-wall', wallOn);
    var px = 0, top = 70, bottom = 104;
    var list = document.querySelectorAll(BACK_SEL);
    for (var i = 0; i < list.length; i++) {
      var el = list[i], r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      if (r.bottom <= top - 4 || r.top >= bottom + 4 || r.left >= 140 || r.right <= 0) continue;   // 不在胶囊所在的左上角
      if (!isShown(el)) continue;
      px = Math.max(px, Math.round(r.right + 10));
    }
    var key = px ? String(Math.min(px, 132)) : 'default';
    if (key === curKey) return;
    curKey = key;
    if (!px) {                                               // 默认：清掉内联覆盖，用 CSS 里的默认位置
      ['--aiui-px', '--aiui-py', '--aiui-hl', '--aiui-dx'].forEach(function (k) { root.style.removeProperty(k); });
    } else {
      px = Math.min(px, 132);
      root.style.setProperty('--aiui-px', px + 'px');
      root.style.setProperty('--aiui-py', '70px');
      root.style.setProperty('--aiui-hl', '24px');
      root.style.setProperty('--aiui-dx', (px - 24) + 'px');
    }
    centers = null; scheduleGaze();
  }

  function bindViewport() {
    var vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', scheduleVP);
      vv.addEventListener('scroll', scheduleVP);
    }
    window.addEventListener('resize', scheduleVP);
    window.addEventListener('orientationchange', function () { setTimeout(scheduleVP, 300); });

    // iOS 的 visualViewport 事件有时来得晚甚至不来，聚焦 / 失焦后补几次主动同步
    // 根因：输入框在屏幕底部，iOS 聚焦时发现它会被键盘盖住，于是把整页（含原生 scrollView）往上顶。
    // 对策：拦截首次点击，用 focus({preventScroll:true}) 聚焦，iOS 就不会做 scroll-into-view；
    function tapFocus(e) {
      if (document.activeElement === ta) return;               // 已聚焦：放行，保留原生选词 / 光标
      e.preventDefault();
      try { ta.focus({ preventScroll: true }); } catch (_) { ta.focus(); }
      var n = ta.value.length;
      try { ta.setSelectionRange(n, n); } catch (_) {}
    }
    ta.addEventListener('touchstart', tapFocus, { passive: false });
    barIn.addEventListener('touchstart', function (e) {         // 点到输入栏空白处也直接聚焦
      if (e.target === ta || sendBtn.contains(e.target)) return;
      tapFocus(e);
    }, { passive: false });

    var guarding = false, guardRaf = 0;
    function guardScroll() {                                   // 聚焦期间持续把页面钉在原位，避免 iOS 自动上顶
      if (!guarding) return;
      if (Math.abs((window.pageYOffset || 0) - focusScrollY) > 0) window.scrollTo(0, focusScrollY);
      guardRaf = requestAnimationFrame(guardScroll);
    }
    ta.addEventListener('focus', function () {
      closeUntil = 0;
      if (lastLift > 0 && getLift() < 1) {                     // 不等 iOS 的 resize 事件：用上次的键盘高度提前上顶，和键盘同步起步
        kbDir('up');
        root.style.setProperty('--aiui-lift', lastLift + 'px');
      }
      focusScrollY = window.pageYOffset || 0;
      guarding = true; cancelAnimationFrame(guardRaf); guardScroll();
      setTimeout(function () { guarding = false; }, 900);
      burstVP();
      setTimeout(function () { if (S.history) scrollToEnd(true); }, 380);   // 键盘到位后，最新消息保持可见
    });
    ta.addEventListener('blur', function () {
      guarding = false;
      closeUntil = Date.now() + 700;
      if (getLift() > 1) {                                     // 键盘开始收起：输入栏立刻跟着落下
        kbDir('down');
        root.style.setProperty('--aiui-lift', '0px');
      }
      burstVP();
      setTimeout(restoreScroll, 90);
    });
    scheduleVP();
  }

  /* =========================================================================
   * [11] 输入框 + 伪智能回复
   * ========================================================================= */
  function measureBar() {                                     // 把输入框当前高度告诉历史列表，让它留出底部空间
    root.style.setProperty('--aiui-bar-h', (barIn.offsetHeight || 50) + 'px');
  }

  function autosize() {
    // border-box：先缩到 1px 再读 scrollHeight（= 内容高 + 上下内边距），最少 38px（单行）
    ta.style.height = '1px';
    var sh = Math.max(38, ta.scrollHeight);
    ta.style.height = Math.min(sh, TA_MAX_H) + 'px';
    ta.style.overflowY = sh > TA_MAX_H ? 'auto' : 'hidden';
    if (sh <= TA_MAX_H) ta.scrollTop = 0;                    // 防止文字被内部滚动顶出可视区（占位符被裁掉一半的原因）
    measureBar();
  }

  function syncSendBtn() { sendBtn.disabled = !ta.value.replace(/\s+/g, ''); }

  function doSend() {
    var text = ta.value.replace(/^\s+|\s+$/g, '');
    if (!text) return;
    addMsg('user', text);
    ta.value = '';
    autosize();
    syncSendBtn();
    botReply(text);
  }

  // —— 伪回复：关键词规则 + 音乐状态 —— //
  var RULES = [
    { k: 'greet',  re: /^(hi|hello|hey|嗨|你好|哈喽|哈啰|在吗|在不在)|早上好|下午好|晚上好/ },
    { k: 'thanks', re: /谢谢|多谢|感谢|thanks|thx/ },
    { k: 'night',  re: /晚安|睡了|睡觉|good ?night/ },
    { k: 'sad',    re: /难过|伤心|不开心|心烦|好烦|累了|好累|失眠|焦虑|压力|孤单|想哭/ },
    { k: 'happy',  re: /开心|高兴|快乐|太棒|哈哈|嘻嘻|好耶/ },
    { k: 'who',    re: /你是谁|你叫什么|你是什么|介绍.*自己/ },
    { k: 'time',   re: /几点|什么时间|现在.*(点|时)/ },
    { k: 'now',    re: /在放什么|什么歌|歌名|正在播/ },
    { k: 'rec',    re: /推荐|听什么|听点什么|放什么|来点|随便放/ },
    { k: 'next',   re: /下一首|切歌|换一首|换歌|next/ },
    { k: 'pause',  re: /暂停|停一下|停止|别放|安静|pause|stop/ },
    { k: 'play',   re: /播放|放歌|放首|来一首|听歌|play/ },
    { k: 'bye',    re: /再见|拜拜|bye/ }
  ];

  var POOL = {
    greet:  ['嗨～我在呢。', '你好呀，今天想听点什么？', '来啦。想聊聊，还是想听歌？'],
    thanks: ['不客气～', '小事一桩 ♪', '能陪你听歌我也很开心。'],
    night:  ['晚安，愿你梦里也有好听的旋律。', '晚安～睡前记得把音量调小一点。'],
    sad:    ['听起来有点辛苦。要不要放一首慢一点的歌，让它陪你一会儿？',
             '我在这儿。先深呼吸一下，音乐会接着替你说话。',
             '不用急着变好，先安静地听一首歌也可以。'],
    happy:  ['太好了！这种心情配一首节奏轻快的歌刚刚好～', '听到你开心，我的眼睛都弯起来了 ^_^'],
    who:    ['我是住在播放器里的小家伙，负责陪你听歌，也陪你发呆。'],
    rec:    ['不如随机一首？有时候惊喜比计划更好听。',
             '夜里适合钢琴，路上适合节奏，发呆什么都适合。',
             '去翻翻很久没听的歌，说不定有老朋友在等你。'],
    play:   ['点一下播放键就好，我会在旁边跟着节奏晃。', '我还不能替你按播放，不过我会一直听着～'],
    pause:  ['好，那就安静一会儿。', '想停就停，我陪你听听周围的声音。'],
    next:   ['想换就换～新的一首总会遇到。', '切歌键就在下面，我给你加油。'],
    bye:    ['下次见～', '拜拜，记得回来听歌。'],
    nowOn:  ['正在播放呢，歌名我还看不到，不过节奏已经跟上啦。'],
    nowOff: ['现在是安静的，要不要放点什么？'],
    fbOn:   ['嗯嗯，我在听，你继续说。', '这首歌配现在的气氛刚刚好。', '然后呢？我一边听歌一边听你说。'],
    fbOff:  ['嗯，我在听。', '现在有点安静，要不要放点音乐？', '有意思，再多说一点？']
  };

  var lastReply = '';
  function pickFresh(pool) {                                  // 尽量不连续说同一句
    if (pool.length === 1) return pool[0];
    var s, n = 0;
    do { s = pick(pool); n++; } while (s === lastReply && n < 6);
    return s;
  }

  function makeReply(q) {
    var s = q.toLowerCase(), kind = 'fb', out, i;
    for (i = 0; i < RULES.length; i++) {
      if (RULES[i].re.test(s)) { kind = RULES[i].k; break; }
    }
    if (kind === 'time') {
      var d = new Date();
      out = '现在是 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '。';
    } else if (kind === 'now') {
      out = pickFresh(S.playing ? POOL.nowOn : POOL.nowOff);
    } else if (kind === 'fb') {
      out = pickFresh(S.playing ? POOL.fbOn : POOL.fbOff);
    } else {
      out = pickFresh(POOL[kind]);
    }
    lastReply = out;
    return out;
  }

  function botReply(q) {
    S.pending++;
    hist.classList.add('is-busy');
    var node = addMsg('ai', '', true);                        // 历史窗口里先放一个"正在输入"
    if (!S.history) showBubble('', true);                     // 历史没打开：悬浮气泡里也显示
    lookDir(0.7, -1, 20000);                                  // 思考中：眼睛看向右上方
    setFace('hmm', 20000);                                    // 一点一线：嗯……
    var delay = rand(800, 1500) + Math.min(q.length * 25, 800);

    setTimeout(function () {
      var a = makeReply(q);
      fillText(a, node);                                      // 点点点 → 正式回复：逐字淡入
      S.pending = Math.max(0, S.pending - 1);
      if (S.pending === 0) { lock.until = 0; scheduleGaze(); hist.classList.remove('is-busy'); }
      if (S.history) scrollToEnd(true); else showBubble(a, false);
      if (S.awake) setFace(pick(FACES_JOY), 1600);
    }, delay);
  }

  function bindInput() {
    ta.addEventListener('input', function () {
      autosize();
      syncSendBtn();
      var r = bar.getBoundingClientRect();                    // 打字时，眼睛朝输入框看
      lookAt(r.left + r.width * 0.5, r.top + r.height * 0.5);
    });

    // 中文输入法：组字过程中的回车是"确认候选词"，不能当成发送
    ta.addEventListener('compositionstart', function () { S.composing = true; });
    ta.addEventListener('compositionend', function () { setTimeout(function () { S.composing = false; }, 30); });
    ta.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey) return;            // Shift+Enter 换行
      if (e.isComposing || e.keyCode === 229 || S.composing) return;
      e.preventDefault();
      doSend();
    });

    // 点发送按钮时不让输入框失焦，键盘保持展开、可以连续发送
    // iOS 上 pointerdown 的 preventDefault 拦不住失焦，必须拦 touchstart / mousedown；
    // 而拦了 touchstart 之后系统不再合成 click，所以改在 touchend 里发送。
    var touchSentAt = 0, touchOnSend = false;
    function keepFocus() { if (document.activeElement !== ta) { try { ta.focus({ preventScroll: true }); } catch (_) { ta.focus(); } } }
    sendBtn.addEventListener('touchstart', function (e) {
      e.preventDefault(); touchOnSend = true;
    }, { passive: false });
    sendBtn.addEventListener('touchend', function (e) {
      e.preventDefault();
      if (!touchOnSend) return;
      touchOnSend = false;
      var t = e.changedTouches && e.changedTouches[0];
      if (t) {                                                // 手指还在按钮范围内才算点击
        var r = sendBtn.getBoundingClientRect();
        if (t.clientX < r.left - 8 || t.clientX > r.right + 8 || t.clientY < r.top - 8 || t.clientY > r.bottom + 8) return;
      }
      touchSentAt = Date.now();
      doSend(); keepFocus();
    }, { passive: false });
    sendBtn.addEventListener('touchcancel', function () { touchOnSend = false; });
    sendBtn.addEventListener('mousedown', function (e) { e.preventDefault(); });    // 桌面 / 调试：同样不抢焦点
    sendBtn.addEventListener('click', function () {
      if (Date.now() - touchSentAt < 600) return;             // 已在 touchend 里发送过，避免重复
      doSend(); keepFocus();
    });
  }

  /* =========================================================================
   * [12] 启动
   * ========================================================================= */
  // 启动封面（#splash）消失后，胶囊"啵"地弹一下，当作登场
  function whenSplashGone(cb) {
    var done = false;
    function fire() { if (done) return; done = true; cb(); }
    if (!document.getElementById('splash')) { fire(); return; }
    var mo = new MutationObserver(function () {
      if (!document.getElementById('splash')) { mo.disconnect(); fire(); }
    });
    mo.observe(document.body, { childList: true });
    setTimeout(function () { mo.disconnect(); fire(); }, 12000);
  }

  function init() {
    if (document.getElementById('aiui-root')) return;
    injectStyle();
    buildDOM();

    bindGesture();
    bindLook();
    bindMusic();
    bindDanceEnd();
    startLife();                                              // 休眠 / 活跃两种常态的随机表情，一直在跑
    bindHistory();
    bindOutsideTap();
    bindInput();
    bindViewport();
    setInterval(avoidBack, 400);                              // 返回键出现 / 消失时自动让位
    avoidBack();

    // 欢迎语：放进历史窗口，用户第一次展开时就能看到
    addMsg('ai', '嗨，我在这里。点我唤醒，按住胶囊往下拉就能看到聊天记录～');
    measureBar();

    whenSplashGone(function () { jelly('is-jelly'); });

    window.AIUI = {
      wake: function () { setAwake(true); },
      sleep: function () { closeHistory(); setAwake(false); },
      openHistory: openHistory,
      closeHistory: closeHistory,
      say: function (text) {                                  // 外部（真实 AI 接入后）主动说一句
        text = String(text);
        addMsg('ai', text);
        if (!S.history) showBubble(text, false);
      }
    };
  }

  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);

})();

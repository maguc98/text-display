// app/sys-log.js — 专业级系统日志
// 功能：分级日志 / 命名空间 / 环形缓冲 / 实时面板 / 搜索过滤 / 性能监控 / 全局错误捕获 / 导出
// 用法：
//   SysLog.info('播放器', '已加载', { 时长: 213 })
//   SysLog.ns('player').warn('切句', { idx: 5 })
//   SysLog.error(new Error('boom'))
//   __openSysLog()        // 打开面板
//   Ctrl / Cmd + Shift + L // 打开 / 关闭面板
(function () {
  'use strict';
  if (window.__sysLogInstalled) return;
  window.__sysLogInstalled = true;

  /* ============================== 配置 ============================== */
  var CFG = {
    maxEntries: 3000,       // 环形缓冲上限
    domLimit: 800,          // 面板 DOM 上限
    stackLevel: 3,          // >= warn 时自动记录调用栈
    consoleMirror: true,    // 同时输出到浏览器 console
    captureStack: true
  };

  var LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  var LV = {
    trace: { rank: 0, label: 'TRACE', color: '#8e8e93' },
    debug: { rank: 1, label: 'DEBUG', color: '#64d2ff' },
    info:  { rank: 2, label: 'INFO',  color: '#30d158' },
    warn:  { rank: 3, label: 'WARN',  color: '#ffd60a' },
    error: { rank: 4, label: 'ERROR', color: '#ff453a' },
    fatal: { rank: 5, label: 'FATAL', color: '#ff2d55' }
  };
  function rankOf(lv) { return (LV[lv] || LV.info).rank; }

  /* ============================== 核心引擎 ============================== */
  var Engine = (function () {
    var buf = [];                 // 环形缓冲 { id, t, level, ns, msg, data, stack }
    var seq = 0;
    var subs = new Set();
    var minLevel = 'trace';
    var paused = false;

    function push(level, ns, msg, data) {
      if (paused) return;
      if (rankOf(level) < rankOf(minLevel)) return;
      var entry = {
        id: ++seq,
        t: Date.now(),
        level: level,
        ns: ns || 'app',
        msg: safeStr(msg),
        data: data,
        stack: (CFG.captureStack && rankOf(level) >= CFG.stackLevel) ? captureStack() : ''
      };
      buf.push(entry);
      if (buf.length > CFG.maxEntries) buf.splice(0, buf.length - CFG.maxEntries);
      if (CFG.consoleMirror) mirror(entry);
      subs.forEach(function (fn) { try { fn(entry); } catch (_) {} });
    }

    function mirror(e) {
      var fn = console[e.level] || console.log;
      var tag = '%c' + LV[e.level].label + '%c [' + e.ns + ']';
      var s1 = 'color:#fff;background:' + LV[e.level].color + ';padding:0 5px;border-radius:3px;font-weight:700';
      var s2 = 'color:#888';
      try {
        if (e.data !== undefined) fn.call(console, tag, s1, s2, e.msg, e.data);
        else fn.call(console, tag, s1, s2, e.msg);
        if (e.stack) fn.call(console, '%c' + e.stack, 'color:#666;font-size:11px');
      } catch (_) {
        try { console.log('[SysLog]', e.level, e.ns, e.msg, e.data); } catch (__) {}
      }
    }

    function safeStr(v) {
      if (v instanceof Error) return v.message;
      if (typeof v === 'string') return v;
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
      try { return JSON.stringify(v); } catch (_) { return String(v); }
    }

    function captureStack() {
      try {
        var lines = (new Error()).stack.split('\n');
        var out = [];
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim();
          if (!line || line.indexOf('Error') === 0) continue;
          if (line.indexOf('sys-log') >= 0 || line.indexOf('SysLog') >= 0 || line.indexOf('captureStack') >= 0) continue;   // 跳过本模块自己的内部帧
          out.push(line.replace(/\s+at\s+/, '@'));
          if (out.length >= 3) break;
        }
        return out.join('\n');
      } catch (_) { return ''; }
    }

    return {
      log: function (level, ns, msg, data) { push(level, ns, msg, data); },
      entries: function () { return buf.slice(); },
      clear: function () {
        buf.length = 0;
        subs.forEach(function (fn) { try { fn(null); } catch (_) {} });
      },
      subscribe: function (fn) { subs.add(fn); return function () { subs.delete(fn); }; },
      setLevel: function (lv) { if (LV[lv]) minLevel = lv; },
      setPaused: function (v) { paused = !!v; },
      isPaused: function () { return paused; },
      stats: function () {
        var s = { total: buf.length, trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0 };
        for (var i = 0; i < buf.length; i++) s[buf[i].level]++;
        return s;
      }
    };
  })();

  /* ============================== 对外 Logger ============================== */
  function makeLogger(defaultNs) {
    return {
      ns: function (n) { return makeLogger(n || defaultNs); },
      trace: function (msg, data) { Engine.log('trace', defaultNs, msg, data); },
      debug: function (msg, data) { Engine.log('debug', defaultNs, msg, data); },
      info:  function (msg, data) { Engine.log('info',  defaultNs, msg, data); },
      warn:  function (msg, data) { Engine.log('warn',  defaultNs, msg, data); },
      error: function (msg, data) { Engine.log('error', defaultNs, msg, data); },
      fatal: function (msg, data) { Engine.log('fatal', defaultNs, msg, data); }
    };
  }
  var root = makeLogger('app');

  /* ============================== 性能监控 ============================== */
  (function () {
    // FPS 采样（每 2 秒）
    var last = performance.now(), frames = 0;
    function fpsLoop(t) {
      frames++;
      if (t - last >= 2000) {
        var fps = Math.round(frames * 1000 / (t - last));
        if (fps < 40) Engine.log('warn', 'perf', '低帧率', { fps: fps });
        last = t; frames = 0;
      }
      requestAnimationFrame(fpsLoop);
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fpsLoop);

    // 长任务
    if (window.PerformanceObserver) {
      try {
        new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (en) {
            if (en.duration >= 100) {
              Engine.log('warn', 'perf', '长任务阻塞', { ms: Math.round(en.duration), type: en.name });
            }
          });
        }).observe({ entryTypes: ['longtask'] });
      } catch (_) {}

      // 布局偏移
      try {
        new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (en) {
            if (!en.hadRecentInput && en.value > 0.1) {
              Engine.log('warn', 'perf', '布局偏移', { score: +en.value.toFixed(3) });
            }
          });
        }).observe({ type: 'layout-shift', buffered: true });
      } catch (_) {}
    }

    // 内存（如可用）
    if (performance && performance.memory) {
      setInterval(function () {
        var m = performance.memory;
        var used = Math.round(m.usedJSHeapSize / 1048576);
        var total = Math.round(m.jsHeapSizeLimit / 1048576);
        if (used / total > 0.85) {
          Engine.log('warn', 'perf', '内存占用偏高', { usedMB: used, limitMB: total });
        }
      }, 30000);
    }

    // 页面加载完成
    if (document.readyState === 'complete') {
      Engine.log('info', 'perf', '页面加载完成', pageTiming());
    } else {
      window.addEventListener('load', function () {
        Engine.log('info', 'perf', '页面加载完成', pageTiming());
      });
    }
    function pageTiming() {
      try {
        var nav = performance.getEntriesByType('navigation')[0];
        if (!nav) return null;
        return {
          dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
          connect: Math.round(nav.connectEnd - nav.connectStart),
          domReady: Math.round(nav.domContentLoadedEventEnd),
          load: Math.round(nav.loadEventEnd)
        };
      } catch (_) { return null; }
    }
  })();

  /* ============================== 全局错误捕获 ============================== */
  window.addEventListener('error', function (e) {
    if (e.target && e.target !== window && e.target.nodeType === 1) {
      var src = e.target.src || e.target.href || '';
      if (src) Engine.log('error', 'resource', '资源加载失败', { url: src, tag: e.target.nodeName });
      return;
    }
    Engine.log('error', 'global', e.message || 'Unknown error', {
      file: e.filename ? e.filename.split('/').pop() : '',
      line: e.lineno || 0,
      col: e.colno || 0
    });
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    var msg = (r && r.stack) ? r.stack : (r && r.message) ? r.message : String(r);
    Engine.log('error', 'promise', '未处理的 Promise 拒绝', { message: msg });
  });

  /* ============================== 面板样式 ============================== */
  var CSS = ''
    + '#slRoot{position:fixed;inset:0;z-index:99990;visibility:hidden;pointer-events:none;'
    +   'font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"PingFang SC",monospace;color:#e8e8ea;'
    +   'transition:visibility 0s linear calc(.3s/var(--ui-spd,1))}'
    + '#slRoot.show{visibility:visible;pointer-events:auto;transition:visibility 0s}'
    + '#slRoot .sl-mask{position:absolute;inset:0;background:rgba(0,0,0,.42);opacity:0;'
    +   'transition:opacity calc(.28s/var(--ui-spd,1)) ease}'
    + '#slRoot.show .sl-mask{opacity:1}'
    + '#slRoot .sl-card{position:absolute;left:0;right:0;bottom:0;top:calc(env(safe-area-inset-top,0px) + 34px);'
    +   'background:rgba(18,20,26,.92);-webkit-backdrop-filter:blur(22px) saturate(1.4);backdrop-filter:blur(22px) saturate(1.4);'
    +   'border-radius:22px 22px 0 0;display:flex;flex-direction:column;'
    +   'transform:translateY(30px);opacity:0;'
    +   'transition:transform calc(.35s/var(--ui-spd,1)) cubic-bezier(.32,.72,0,1),opacity calc(.25s/var(--ui-spd,1)) ease}'
    + '#slRoot.show .sl-card{transform:none;opacity:1}'
    + '#slRoot .sl-head{flex:none;display:flex;align-items:center;gap:8px;padding:10px 14px 8px;'
    +   'border-bottom:1px solid rgba(255,255,255,.08)}'
    + '#slRoot .sl-title{font-size:14px;font-weight:800;letter-spacing:.5px}'
    + '#slRoot .sl-title em{font-style:normal;font-size:11px;font-weight:500;color:#8e8e93;margin-left:6px}'
    + '#slRoot .sl-spacer{flex:1}'
    + '#slRoot .sl-btn{flex:none;height:28px;min-width:28px;padding:0 10px;border:none;border-radius:8px;'
    +   'background:rgba(255,255,255,.1);color:#e8e8ea;font:inherit;font-size:12px;cursor:pointer;'
    +   '-webkit-tap-highlight-color:transparent;transition:background .15s}'
    + '#slRoot .sl-btn:active{background:rgba(255,255,255,.24)}'
    + '#slRoot .sl-btn.on{background:rgba(143,176,255,.65);color:#fff}'
    + '#slRoot .sl-tools{flex:none;display:flex;flex-wrap:wrap;gap:6px;padding:8px 14px;'
    +   'border-bottom:1px solid rgba(255,255,255,.06)}'
    + '#slRoot .sl-search{flex:1;min-width:120px;height:30px;padding:0 10px;border:none;border-radius:8px;'
    +   'background:rgba(255,255,255,.08);color:#e8e8ea;font:inherit;font-size:12px;outline:none}'
    + '#slRoot .sl-search::placeholder{color:#5a5a60}'
    + '#slRoot .sl-lv{flex:none;height:26px;padding:0 10px;border:none;border-radius:8px;'
    +   'background:rgba(255,255,255,.06);color:#8e8e93;font:inherit;font-size:11px;font-weight:700;cursor:pointer;'
    +   'transition:all .15s}'
    + '#slRoot .sl-lv.on{color:#fff;background:rgba(143,176,255,.5)}'
    + '#slRoot .sl-lv[data-lv="error"].on{background:rgba(255,69,58,.7)}'
    + '#slRoot .sl-lv[data-lv="warn"].on{background:rgba(255,214,10,.65);color:#1a1a1a}'
    + '#slRoot .sl-ns{flex:none;height:26px;padding:0 8px;border:none;border-radius:8px;'
    +   'background:rgba(255,255,255,.06);color:#e8e8ea;font:inherit;font-size:11px;outline:none}'
    + '#slRoot .sl-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;'
    +   'padding:6px 8px 10px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent}'
    + '#slRoot .sl-body::-webkit-scrollbar{width:6px}'
    + '#slRoot .sl-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.28);border-radius:3px}'
    + '#slRoot .sl-row{display:flex;flex-wrap:wrap;gap:6px;padding:4px 6px;border-radius:6px;'
    +   'font-size:11.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;'
    +   'border-left:2px solid transparent}'
    + '#slRoot .sl-row+.sl-row{margin-top:1px}'
    + '#slRoot .sl-time{flex:none;color:#5a5a60;font-variant-numeric:tabular-nums}'
    + '#slRoot .sl-lvtag{flex:none;min-width:44px;font-weight:700;letter-spacing:.3px}'
    + '#slRoot .sl-nstag{flex:none;color:#8e8e93;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '#slRoot .sl-nsclick{cursor:pointer}'
    + '#slRoot .sl-msg{flex:1;min-width:0}'
    + '#slRoot .sl-data{color:#64d2ff;opacity:.85}'
    + '#slRoot .sl-stack{display:none;flex:0 0 100%;margin:4px 0 0 0;padding:6px 8px;border-radius:6px;'
    +   'background:rgba(0,0,0,.35);color:#8e8e93;font-size:10.5px;line-height:1.5;white-space:pre-wrap}'
    + '#slRoot .sl-row.expanded .sl-stack{display:block}'
    + '#slRoot .sl-row.lv-trace{border-left-color:#4a4a52}'
    + '#slRoot .sl-row.lv-debug{border-left-color:#64d2ff;background:rgba(100,210,255,.04)}'
    + '#slRoot .sl-row.lv-info{border-left-color:#30d158}'
    + '#slRoot .sl-row.lv-warn{border-left-color:#ffd60a;background:rgba(255,214,10,.06)}'
    + '#slRoot .sl-row.lv-error{border-left-color:#ff453a;background:rgba(255,69,58,.08)}'
    + '#slRoot .sl-row.lv-fatal{border-left-color:#ff2d55;background:rgba(255,45,85,.12);font-weight:600}'
    + '#slRoot .sl-foot{flex:none;display:flex;align-items:center;gap:8px;padding:8px 14px;'
    +   'border-top:1px solid rgba(255,255,255,.08);font-size:11.5px;color:#8e8e93}'
    + '#slRoot .sl-stat{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '#slRoot .sl-empty{padding:40px 0;text-align:center;color:#5a5a60;font-size:12px}';

  var styleEl = document.createElement('style');
  styleEl.id = 'sysLogStyle';
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ============================== 面板 UI ============================== */
  var Panel = (function () {
    var mount = null;
    var bodyEl = null;
    var searchEl = null;
    var lvFilters = {};
    var nsFilter = '';
    var autoScroll = true;
    var filterDirty = true;
    var openState = false;

    /* ---------- 构建 DOM ---------- */
    function build() {
      mount = document.createElement('div');
      mount.id = 'slRoot';
      mount.setAttribute('aria-hidden', 'true');
      mount.innerHTML =
        '<div class="sl-mask"></div>' +
        '<div class="sl-card" role="dialog" aria-label="系统日志">' +
          '<div class="sl-head">' +
            '<div class="sl-title">系统日志 <em id="slCount">0</em></div>' +
            '<div class="sl-spacer"></div>' +
            '<button type="button" class="sl-btn" data-act="pause" title="暂停/继续">⏸</button>' +
            '<button type="button" class="sl-btn" data-act="export" title="导出">导出</button>' +
            '<button type="button" class="sl-btn" data-act="clear" title="清空">清空</button>' +
            '<button type="button" class="sl-btn" data-act="close" title="关闭">✕</button>' +
          '</div>' +
          '<div class="sl-tools" id="slTools"></div>' +
          '<div class="sl-body" id="slBody"></div>' +
          '<div class="sl-foot">' +
            '<span class="sl-stat" id="slStat">—</span>' +
            '<span id="slScroll">自动滚动</span>' +
          '</div>' +
        '</div>';
      document.body.appendChild(mount);

      bodyEl = mount.querySelector('#slBody');
      searchEl = document.createElement('input');
      searchEl.className = 'sl-search';
      searchEl.placeholder = '搜索关键字…';
      searchEl.addEventListener('input', function () { filterDirty = true; rebuild(); });

      var tools = mount.querySelector('#slTools');
      tools.appendChild(searchEl);

      LEVELS.forEach(function (lv) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'sl-lv on';
        b.dataset.lv = lv;
        b.textContent = LV[lv].label;
        lvFilters[lv] = true;
        b.addEventListener('click', function () {
          lvFilters[lv] = !lvFilters[lv];
          b.classList.toggle('on', lvFilters[lv]);
          filterDirty = true; rebuild();
        });
        tools.appendChild(b);
      });

      var nsSel = document.createElement('select');
      nsSel.className = 'sl-ns';
      nsSel.id = 'slNsSel';
      nsSel.innerHTML = '<option value="">全部命名空间</option>';
      nsSel.addEventListener('change', function () { nsFilter = this.value; filterDirty = true; rebuild(); });
      tools.appendChild(nsSel);

      mount.querySelector('.sl-mask').addEventListener('click', close);
      mount.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-act]');
        if (!b) return;
        var act = b.dataset.act;
        if (act === 'close') close();
        else if (act === 'clear') { Engine.clear(); rebuild(); }
        else if (act === 'pause') {
          var p = !Engine.isPaused();
          Engine.setPaused(p);
          b.classList.toggle('on', p);
          b.textContent = p ? '▶' : '⏸';
          b.title = p ? '继续' : '暂停';
        }
        else if (act === 'export') exportLogs();
      });

      bodyEl.addEventListener('click', function (e) {
        var nsClick = e.target.closest && e.target.closest('.sl-nsclick');
        if (nsClick) {
          nsFilter = nsClick.dataset.ns || '';
          var s = mount.querySelector('#slNsSel');
          if (s) s.value = nsFilter;
          filterDirty = true; rebuild();
          return;
        }
        var row = e.target.closest && e.target.closest('.sl-row');
        if (!row) return;
        if (row.querySelector('.sl-stack')) row.classList.toggle('expanded');
      });

      bodyEl.addEventListener('scroll', function () {
        var atBottom = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight < 40;
        if (atBottom !== autoScroll) {
          autoScroll = atBottom;
          updateStat();
        }
      }, { passive: true });

      Engine.subscribe(function (entry) {
        if (!openState) return;
        if (entry === null) { filterDirty = true; rebuild(); return; }
        if (!match(entry)) return;
        appendOne(entry);
        updateStat();
      });

      setInterval(updateStat, 1000);
    }

    /* ---------- 匹配 ---------- */
    function match(e) {
      if (!lvFilters[e.level]) return false;
      if (nsFilter && e.ns !== nsFilter) return false;
      var q = searchEl && searchEl.value.trim().toLowerCase();
      if (q) {
        var hay = (e.level + ' ' + e.ns + ' ' + e.msg + ' ' + (e.data !== undefined ? safe(e.data) : '')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }
    function safe(v) { try { return JSON.stringify(v); } catch (_) { return String(v); } }

    /* ---------- 渲染 ---------- */
    function buildRow(e) {
      var row = document.createElement('div');
      row.className = 'sl-row lv-' + e.level;
      var time = fmtTime(e.t);
      var data = (e.data !== undefined) ? ' <span class="sl-data">' + esc(safe(e.data)) + '</span>' : '';
      row.innerHTML =
        '<span class="sl-time">' + time + '</span>' +
        '<span class="sl-lvtag" style="color:' + LV[e.level].color + '">' + LV[e.level].label + '</span>' +
        '<span class="sl-nstag sl-nsclick" data-ns="' + esc(e.ns) + '">' + esc(e.ns) + '</span>' +
        '<span class="sl-msg">' + esc(e.msg) + data + '</span>' +
        (e.stack ? '<div class="sl-stack">' + esc(e.stack) + '</div>' : '');
      return row;
    }

    function appendOne(e) {
      if (!bodyEl) return;
      if (filterDirty) { rebuild(); return; }
      var wasBottom = autoScroll;
      // 列表里还是「暂无日志」占位时，先移除
      var ph = bodyEl.firstElementChild;
      if (ph && ph.classList.contains('sl-empty')) bodyEl.removeChild(ph);
      bodyEl.appendChild(buildRow(e));
      if (bodyEl.childElementCount > CFG.domLimit) {
        while (bodyEl.childElementCount > CFG.domLimit) bodyEl.removeChild(bodyEl.firstElementChild);
      }
      if (wasBottom) bodyEl.scrollTop = bodyEl.scrollHeight;
    }

    function rebuild() {
      if (!bodyEl) return;
      var all = Engine.entries();
      var frag = document.createDocumentFragment();
      var shown = 0;
      var start = Math.max(0, all.length - CFG.domLimit);
      for (var i = start; i < all.length; i++) {
        if (match(all[i])) { frag.appendChild(buildRow(all[i])); shown++; }
      }
      bodyEl.innerHTML = '';
      if (shown === 0) {
        var empty = document.createElement('div');
        empty.className = 'sl-empty';
        empty.textContent = '暂无日志';
        bodyEl.appendChild(empty);
      } else {
        bodyEl.appendChild(frag);
      }
      filterDirty = false;
      if (autoScroll) bodyEl.scrollTop = bodyEl.scrollHeight;
      refreshNsOptions();
      updateStat();
    }

    function refreshNsOptions() {
      var s = mount && mount.querySelector('#slNsSel');
      if (!s) return;
      var seen = {};
      Engine.entries().forEach(function (e) { seen[e.ns] = 1; });
      var cur = nsFilter;
      var names = Object.keys(seen).sort();
      var html = '<option value="">全部命名空间</option>';
      names.forEach(function (n) {
        html += '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
      });
      if (s.innerHTML !== html) s.innerHTML = html;
    }

    function updateStat() {
      if (!mount) return;
      var st = Engine.stats();
      var total = mount.querySelector('#slCount');
      var stat = mount.querySelector('#slStat');
      var sc = mount.querySelector('#slScroll');
      if (total) total.textContent = st.total + ' 条';
      if (stat) {
        var parts = [];
        if (st.warn) parts.push('警告 ' + st.warn);
        if (st.error) parts.push('错误 ' + st.error);
        if (st.fatal) parts.push('致命 ' + st.fatal);
        stat.textContent = parts.length ? parts.join(' · ') : '暂无异常';
      }
      if (sc) sc.textContent = autoScroll ? '自动滚动' : '已暂停滚动';
    }

    /* ---------- 导出 ---------- */
    function exportLogs() {
      var all = Engine.entries();
      var text = all.map(function (e) {
        return '[' + fmtTime(e.t) + '][' + LV[e.level].label + '][' + e.ns + '] ' + e.msg
          + (e.data !== undefined ? ' ' + safe(e.data) : '');
      }).join('\n');

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { toast('已复制 ' + all.length + ' 条日志'); },
          function () { showTextFallback(text); }
        );
      } else {
        showTextFallback(text);
      }
    }

    function showTextFallback(text) {
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.88);display:flex;flex-direction:column;padding:20px;';
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.readOnly = true;
      ta.style.cssText = 'flex:1;width:100%;margin-bottom:10px;padding:12px;border-radius:10px;border:none;background:#fff;color:#000;font-family:ui-monospace,monospace;font-size:12px;resize:none;';
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;';
      var closeBtn = document.createElement('button');
      closeBtn.textContent = '关闭';
      closeBtn.style.cssText = 'flex:1;padding:12px;border-radius:10px;border:none;background:rgba(255,255,255,.2);color:#fff;font-size:15px;font-weight:600;';
      closeBtn.onclick = function () { document.body.removeChild(ov); };
      var copyBtn = document.createElement('button');
      copyBtn.textContent = '复制';
      copyBtn.style.cssText = 'flex:1;padding:12px;border-radius:10px;border:none;background:#8fb0ff;color:#fff;font-size:15px;font-weight:600;';
      copyBtn.onclick = function () {
        ta.select();
        try { document.execCommand('copy'); copyBtn.textContent = '已复制'; } catch (_) {}
      };
      row.appendChild(closeBtn); row.appendChild(copyBtn);
      ov.appendChild(ta); ov.appendChild(row);
      document.body.appendChild(ov);
      setTimeout(function () { ta.focus(); ta.select(); }, 100);
    }

    function toast(msg) {
      var t = document.getElementById('slToast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'slToast';
        t.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 80px);transform:translateX(-50%);'
          + 'z-index:100001;background:rgba(30,32,40,.95);color:#fff;padding:9px 16px;border-radius:12px;'
          + 'font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.4);opacity:0;transition:opacity .2s;pointer-events:none;';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      requestAnimationFrame(function () { t.style.opacity = '1'; });
      clearTimeout(toast._t);
      toast._t = setTimeout(function () { t.style.opacity = '0'; }, 1500);
    }

    /* ---------- 工具 ---------- */
    function fmtTime(t) {
      var d = new Date(t);
      function p(n, l) { n = String(n); while (n.length < (l || 2)) n = '0' + n; return n; }
      return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.' + p(d.getMilliseconds(), 3);
    }
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
    }

    /* ---------- 打开 / 关闭 ---------- */
    function open() {
      if (openState) return;
      openState = true;
      if (!mount) build();
      mount.classList.add('show');
      mount.setAttribute('aria-hidden', 'false');
      filterDirty = true;
      rebuild();
    }
    function close() {
      if (!openState) return;
      openState = false;
      mount.classList.remove('show');
      mount.setAttribute('aria-hidden', 'true');
    }
    function toggle() { openState ? close() : open(); }

    return { open: open, close: close, toggle: toggle, build: build };
  })();

  /* ============================== 对外暴露 ============================== */
  var api = {
    ns: function (n) { return root.ns(n); },
    trace: function (m, d) { root.trace(m, d); },
    debug: function (m, d) { root.debug(m, d); },
    info:  function (m, d) { root.info(m, d); },
    warn:  function (m, d) { root.warn(m, d); },
    error: function (m, d) { root.error(m, d); },
    fatal: function (m, d) { root.fatal(m, d); },
    open: function () { Panel.open(); },
    close: function () { Panel.close(); },
    toggle: function () { Panel.toggle(); },
    clear: function () { Engine.clear(); },
    setLevel: function (lv) { Engine.setLevel(lv); },
    entries: function () { return Engine.entries(); },
    stats: function () { return Engine.stats(); }
  };
  window.SysLog = api;
  window.__openSysLog = function () { Panel.open(); };
  window.__closeSysLog = function () { Panel.close(); };

  // 快捷键：Ctrl / Cmd + Shift + L
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault();
      Panel.toggle();
    }
  });

  // 初始化一条启动日志
  api.info('启动完成', {
    ua: navigator.userAgent.slice(0, 80),
    t: new Date().toISOString()
  });
})();

// app/pkg-manager.js — 文件包（横向胶囊）、历史栈、文字页底栏三键（撤回 / 粘贴 / 加包）
(function(){
  function __pkgMain() {
  var $ = function(i){ return document.getElementById(i); };
  var HISTORY = [], HISTORY_IDX = -1, MAX_HISTORY = 50;
  var isRestoring = false, histTimer = 0;

  var cUndo = $("cUndo"), cPaste = $("cPaste"), cNewPkg = $("cNewPkg"),
      viewHorizontal = $("viewHorizontal"), cbar = $("cbar"), pg0 = $("pg0");
  var shufChk = $("shuf"), syncingShuf = false;   // 播放页"随机显示"复选框：player.js 的 nextIdx() 直接读它
  if (!cUndo || !cPaste || !cNewPkg || !viewHorizontal) return;

  // 改了包结构后触发一次自动保存（storage.js 监听 document 上的 change）
  function touchSave() { try { document.dispatchEvent(new Event("change")); } catch(_) {} }

  // 自制弹窗：WKWebView 里原生 confirm()/alert() 没有实现时会直接返回 false / 什么都不显示（这就是"删除无反应"的原因）
  function showDialog(msg, buttons) {
    var mask = document.createElement("div");
    mask.className = "pkg-dlg-mask";
    var box = document.createElement("div");
    box.className = "pkg-dlg"; box.setAttribute("role", "alertdialog");
    var p = document.createElement("p"); p.textContent = msg;       // 一律 textContent，包名里有 < > 也安全
    var row = document.createElement("div"); row.className = "row";
    function close(fn) {
      mask.classList.remove("show");
      setTimeout(function() { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 220);
      if (fn) fn();
    }
    buttons.forEach(function(b) {
      var el = document.createElement("button");
      el.type = "button"; el.textContent = b.text; if (b.cls) el.className = b.cls;
      el.onclick = function(e) { e.stopPropagation(); close(b.fn); };
      row.appendChild(el);
    });
    box.appendChild(p); box.appendChild(row); mask.appendChild(box);
    document.body.appendChild(mask);
    void mask.offsetWidth;                                           // 强制回流，保证淡入 / 弹簧动画会播
    mask.classList.add("show");
  }
  function askConfirm(msg, okText, onOk) {
    showDialog(msg, [{ text: "取消" }, { text: okText || "确定", cls: "danger", fn: onOk }]);
  }
  function notice(msg) { showDialog(msg, [{ text: "好", cls: "primary" }]); }

  /* ================= 包内随机 ↔ #shuf 同步 / 播放位置 ================= */
  function curPkg() { return window.PACKAGES && window.PACKAGES[window.ACTIVE_PKG]; }
  // #shuf 始终 = 当前包的 shuffle（player.js 不用改）；bag 里存的是旧顺序，换了设置就作废
  function syncShuf() {
    var p = curPkg();
    if (!p || !shufChk) return;
    if (typeof bag !== "undefined") bag = null;
    if (shufChk.checked === !!p.shuffle) return;
    syncingShuf = true;
    try { shufChk.checked = !!p.shuffle; shufChk.dispatchEvent(new Event("change")); } catch(_) {}
    syncingShuf = false;
  }
  // 播放位置：换了包 → 回到第一句；包没换但句数变少 → 只在越界时回到第一句；随机袋（bag）里的下标一律作废
  function fixPlayPos(full) {
    try {
      if (typeof bag !== "undefined") bag = null;
      if (typeof idx !== "undefined") {
        var n = (window.ITEMS || []).length;
        if (full || idx >= n) { idx = 0; if (typeof prog !== "undefined") prog = 0; }
      }
    } catch(_) {}
  }
  // 用户在播放页（或迷你播放器的模式按钮）改了"随机显示" → 写回当前包
  if (shufChk) shufChk.addEventListener("change", function() {
    if (syncingShuf || isRestoring) return;
    var p = curPkg();
    if (!p || !!p.shuffle === shufChk.checked) return;
    flushHistory(); p.shuffle = shufChk.checked; pushHistory();
  });

  /* ================= 历史栈 (Undo / Redo) ================= */
  function snap() { return JSON.stringify({ packages: window.PACKAGES, active: window.ACTIVE_PKG }); }
  function updateUndoUI() {
    cUndo.classList.toggle("off", !(HISTORY_IDX > 0));                       // 没有可撤回的：图标变淡
    cUndo.classList.toggle("has-redo", HISTORY_IDX < HISTORY.length - 1);    // 有可重做的：右上角亮点
  }
  function pushHistory() {
    if (isRestoring || !window.PACKAGES) return;
    clearTimeout(histTimer); histTimer = 0;
    var s = snap();
    if (HISTORY_IDX >= 0 && HISTORY[HISTORY_IDX] === s) { updateUndoUI(); return; }   // 和上一步一样，不存
    HISTORY = HISTORY.slice(0, HISTORY_IDX + 1);                                       // 截断前进记录
    HISTORY.push(s);
    if (HISTORY.length > MAX_HISTORY) HISTORY.shift();
    HISTORY_IDX = HISTORY.length - 1;
    updateUndoUI();
  }
  // 还有"打字节流中、没来得及入栈"的改动时，先把它入栈；换包 / 增删 / 撤回前都要先调用，保证每步是独立的一步
  function flushHistory() { if (histTimer) pushHistory(); }
  window.pushHistory = pushHistory;

  // 清空历史并以当前数据为起点：storage.js 恢复存档 / 导入备份后调用
  window.resetHistory = function() {
    clearTimeout(histTimer); histTimer = 0;
    HISTORY = []; HISTORY_IDX = -1;
    syncShuf(); renderPkgUI(); pushHistory();
  };

  // cards.js 的 commit() 在用户编辑后调用：打字不会每个字符都入栈，停 800ms 才记一步
  window.__onCardsEdited = function() {
    if (isRestoring) return;
    fixPlayPos(false);
    clearTimeout(histTimer);
    histTimer = setTimeout(pushHistory, 800);
  };

  // 把当前激活包渲染到卡片区，并刷新各处显示
  function activateCurrent(newPos) {
    window.ITEMS = window.PACKAGES[window.ACTIVE_PKG].items;
    if (window.__setCards) window.__setCards(window.ITEMS);
    fixPlayPos(!!newPos);              // 必须在 onItemsChanged 之前：刷新播放画面时用的就是新的位置
    syncShuf();
    renderPkgUI();
    if (window.onItemsChanged) window.onItemsChanged();
  }

  function restoreSnapshot(str) {
    var data; try { data = JSON.parse(str); } catch(_) { return; }
    if (!data || !Array.isArray(data.packages) || !data.packages.length) return;
    isRestoring = true;
    try {
      var prevActive = window.ACTIVE_PKG;
      window.PACKAGES = data.packages;
      window.ACTIVE_PKG = (data.active >= 0 && data.active < data.packages.length) ? data.active : 0;
      activateCurrent(window.ACTIVE_PKG !== prevActive);
    } finally { isRestoring = false; }
    touchSave();
  }

  function doUndo() {
    flushHistory();
    if (HISTORY_IDX > 0) { HISTORY_IDX--; restoreSnapshot(HISTORY[HISTORY_IDX]); }
    updateUndoUI();
  }
  function doRedo() {
    flushHistory();
    if (HISTORY_IDX < HISTORY.length - 1) { HISTORY_IDX++; restoreSnapshot(HISTORY[HISTORY_IDX]); }
    updateUndoUI();
  }

  /* ================= 文件包操作 ================= */
  function switchPkg(idx) {
    if (!window.PACKAGES || idx === window.ACTIVE_PKG || !window.PACKAGES[idx]) return;
    flushHistory();
    window.ACTIVE_PKG = idx;
    activateCurrent(true);
    pushHistory(); touchSave();
  }

  function deletePkg(i) {
    if (!window.PACKAGES || !window.PACKAGES[i]) return;
    if (window.PACKAGES.length <= 1) { notice("至少保留一个包"); return; }
    var target = window.PACKAGES[i], name = target.name;
    askConfirm("确定删除「" + name + "」吗？\n删除后可以点撤回恢复。", "删除", function() {
      // 弹窗开着的时候用户可能点了撤回 / 重做，PACKAGES 会被整体换掉：按对象引用找，找不到就按"原位置 + 原名字"认
      var P = window.PACKAGES, idx = P.indexOf(target);
      if (idx < 0 && P[i] && P[i].name === name) idx = i;
      if (idx < 0 || P.length <= 1) return;
      var tabEl = viewHorizontal.children[idx];
      if (tabEl) tabEl.classList.add("removing");                  // 先播收缩淡出动画
      setTimeout(function() { doDelete(target, name, idx); }, tabEl ? 260 : 0);
    });
  }

  function doDelete(target, name, hint) {
    var P = window.PACKAGES;
    if (!P || P.length <= 1) { renderPkgUI(); return; }
    var idx = P.indexOf(target);                                    // 动画期间也可能点了撤回：再认一次
    if (idx < 0 && P[hint] && P[hint].name === name) idx = hint;
    if (idx < 0) { renderPkgUI(); return; }
    flushHistory();
    var wasActive = (idx === window.ACTIVE_PKG);
    P.splice(idx, 1);
    if (idx < window.ACTIVE_PKG) window.ACTIVE_PKG--;                                  // 删的是前面的包：当前包下标要跟着前移
    else if (wasActive) window.ACTIVE_PKG = Math.min(idx, P.length - 1);               // 删的是当前包：落到后一个（没有就前一个）
    if (wasActive) activateCurrent(true); else renderPkgUI();                          // 删的不是当前包：卡片区不用重绘
    pushHistory(); touchSave();
  }

  // 改名：走顶部输入栏（和卡片改字一致）。textbar.js 的 open(card, textarea, {value, placeholder, onOk}) 允许 card / textarea 为 null
  function startRename(pkg) {
    if (!pkg) return;
    var oldName = pkg.name, at = window.PACKAGES.indexOf(pkg);
    function apply(v) {
      v = String(v == null ? "" : v).trim().slice(0, 60);
      if (!v) return;
      // 输入栏开着的时候用户可能点了撤回 / 重做，PACKAGES 里的对象会被整体换掉：引用找不到就按"原位置 + 原名字"认
      var P = window.PACKAGES, target = P.indexOf(pkg) >= 0 ? pkg : (P[at] && P[at].name === oldName ? P[at] : null);
      if (!target || v === target.name) return;
      flushHistory(); target.name = v; pushHistory(); touchSave(); renderPkgUI();
    }
    if (typeof window.__openTextBar === "function") {
      window.__openTextBar(null, null, { value: oldName, placeholder: "文件包名称", onOk: apply });
    } else {
      var v = prompt("文件包名称：", oldName);      // 兜底：输入栏没加载时才会走到
      if (v != null) apply(v);
    }
  }

  /* ================= 长按胶囊菜单：编辑 / 删除 ================= */
  var menu = null;
  function onDocDown(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
  function closeMenu() {
    if (!menu) return;
    menu.remove(); menu = null;
    document.removeEventListener("pointerdown", onDocDown, true);
  }
  function mkItem(txt, cls, fn) {
    var b = document.createElement("button");
    b.type = "button"; b.textContent = txt; b.setAttribute("role", "menuitem");
    if (cls) b.className = cls;
    b.onclick = function(e) { e.stopPropagation(); fn(); };
    return b;
  }
  function openMenu(tab, i) {
    closeMenu();
    menu = document.createElement("div");
    menu.className = "pkg-menu"; menu.setAttribute("role", "menu");
    menu.appendChild(mkItem("编辑", "", function() {
      closeMenu(); startRename(window.PACKAGES[i]);
    }));
    menu.appendChild(mkItem("删除", "danger", function() { closeMenu(); deletePkg(i); }));
    document.body.appendChild(menu);
    var r = tab.getBoundingClientRect(), vw = window.innerWidth || 375, vh = window.innerHeight || 812;
    var mw = menu.offsetWidth || 140, mh = menu.offsetHeight || 96;
    var x = Math.min(Math.max(8, r.left + r.width / 2 - mw / 2), vw - mw - 8);
    var y = r.bottom + 8; if (y + mh > vh - 8) y = Math.max(8, r.top - mh - 8);   // 下面放不下就放到胶囊上方
    menu.style.left = x + "px"; menu.style.top = y + "px";
    document.addEventListener("pointerdown", onDocDown, true);                      // 点菜单外面关闭（打开这一下的 pointerdown 已经过去了）
  }
  viewHorizontal.addEventListener("scroll", closeMenu);

  /* ================= 渲染：横向胶囊（包名一律 textContent，不拼 HTML） ================= */
  // 点 = 切换；长按 = 弹菜单（弹出后松手不再触发切换）
  function attachTab(tab, i) {
    var timer = 0, sx = 0, sy = 0, long = false;
    function clr() { clearTimeout(timer); timer = 0; }
    tab.addEventListener("contextmenu", function(e) { e.preventDefault(); });
    tab.addEventListener("pointerdown", function(e) {
      long = false; sx = e.clientX; sy = e.clientY; clr();
      timer = setTimeout(function() { timer = 0; long = true; openMenu(tab, i); }, 450);
    });
    tab.addEventListener("pointermove", function(e) { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) clr(); });
    tab.addEventListener("pointerup", clr);
    tab.addEventListener("pointercancel", function() { clr(); long = false; });
    tab.addEventListener("click", function() {
      if (long) { long = false; return; }
      closeMenu(); switchPkg(i);
    });
  }

  function renderPkgUI() {
    if (!window.PACKAGES) return;
    closeMenu();
    var sl = viewHorizontal.scrollLeft;            // 清空会让横向滚动位置归零，重建后要还原
    viewHorizontal.textContent = "";
    window.PACKAGES.forEach(function(pkg, i) {
      var tab = document.createElement("div");
      tab.className = "pkg-tab" + (i === window.ACTIVE_PKG ? " active" : "");
      tab.textContent = pkg.name; tab.setAttribute("role", "button");
      attachTab(tab, i);
      viewHorizontal.appendChild(tab);
    });
    viewHorizontal.scrollLeft = sl;
    var a = viewHorizontal.querySelector(".pkg-tab.active");                // 保证当前包在可见范围内
    if (a) {
      var L = a.offsetLeft, R = L + a.offsetWidth, v = viewHorizontal.clientWidth, s = viewHorizontal.scrollLeft;
      if (L < s) viewHorizontal.scrollLeft = Math.max(0, L - 8);
      else if (R > s + v) viewHorizontal.scrollLeft = R - v + 8;
    }
  }

  /* ================= 文字页底栏三键：撤回 / 粘贴 / 加包 ================= */
  // 撤回：点 = 撤回，长按 = 重做（有可重做步骤时按钮右上角亮点）
  var undoT = 0, undoLong = false;
  cUndo.addEventListener("pointerdown", function() {
    undoLong = false; clearTimeout(undoT);
    undoT = setTimeout(function() { undoT = 0; undoLong = true; doRedo(); }, 500);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(function(t) {
    cUndo.addEventListener(t, function() { clearTimeout(undoT); undoT = 0; });
  });
  cUndo.addEventListener("click", function() {
    if (undoLong) { undoLong = false; return; }
    doUndo();
  });

  cNewPkg.addEventListener("click", function() {
    if (!window.PACKAGES) return;
    flushHistory();
    window.PACKAGES.push({ name: "新文件包 " + (window.PACKAGES.length + 1), shuffle: false, items: [] });
    window.ACTIVE_PKG = window.PACKAGES.length - 1;
    activateCurrent(true);
    pushHistory(); touchSave();
    // 建好后直接弹出输入栏改名（在点击手势内同步调用，iOS 才会弹键盘）；点取消就保留默认名
    startRename(window.PACKAGES[window.ACTIVE_PKG]);
  });

  cPaste.addEventListener("click", function() {
    if (!(navigator.clipboard && navigator.clipboard.readText)) { notice("当前环境不支持自动读取剪贴板。"); return; }
    navigator.clipboard.readText().then(function(text) {
      if (!text) return;
      var lines = text.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
      if (!lines.length) return;
      flushHistory();
      var its = window.ITEMS || [];
      lines.forEach(function(t){ its.push({ t: t }); });
      window.ITEMS = its;
      window.PACKAGES[window.ACTIVE_PKG].items = its;
      if (window.__setCards) window.__setCards(its);      // 内部会把空白卡片清掉并重新汇总
      if (window.onItemsChanged) window.onItemsChanged();
      pushHistory(); touchSave();
    }).catch(function() {
      notice("读取剪贴板失败，请检查权限。");
    });
  });

  /* ================= 底栏联动：只有文字页显示这三键，其他页还原原来的按钮 ================= */
  // 不改别的模块：原按钮（导入 / Q弹 / 更多，其中"更多"是 JS 动态生成的）用行内 display:none !important 隐藏，离开文字页就移除
  function textPageActive() {
    if (!pg0) return false;
    if (pg0.classList.contains("hide") || pg0.classList.contains("leave")) return false;
    if (document.body.classList.contains("music-mode")) return false;
    try { return getComputedStyle(pg0).display !== "none"; } catch(_) { return true; }
  }
  function syncBar() {
    if (!cbar) return;
    var on = textPageActive();
    for (var k = 0; k < cbar.children.length; k++) {
      var el = cbar.children[k], mine = el.classList.contains("cb-pkg");
      if (el.id === "cmore") { el.style.removeProperty("display"); continue; }   // 系统设置入口始终可见
      if (mine ? on : !on) el.style.removeProperty("display");           // 该显示：交还给样式表（原本就隐藏的 ppb/nxb 等仍由样式表隐藏）
      else el.style.setProperty("display", "none", "important");
    }
  }
  if (typeof MutationObserver !== "undefined") {
    if (pg0) new MutationObserver(syncBar).observe(pg0, { attributes: true, attributeFilter: ["class", "style", "hidden"] });
    new MutationObserver(syncBar).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    if (cbar) new MutationObserver(syncBar).observe(cbar, { childList: true });     // "更多"按钮是之后才生成的
  }
  window.addEventListener("load", syncBar);

  /* ================= 初始化 ================= */
  renderPkgUI();
  pushHistory();      // 先以 cards.js 初始化的数据为起点；storage.js 恢复存档后会调用 resetHistory() 换成存档数据
  updateUndoUI();
  syncBar();
  }
  try { __pkgMain(); }
  catch (e) {
    // 加载阶段 devtools.js 还没装好日志拦截，直接 console.error 看不到；等页面加载完再报，才会进「抓取日志」
    window.addEventListener("load", function() { console.error("[pkg-manager] 初始化失败: " + (e && e.stack || e)); });
  }
})();

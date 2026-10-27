// app/theme-editor.js — 主题配置编辑器
/* =========================================================
 * 主题选择器 × 背景设置 整合：主题卡片决定背景类型 + 当前主题参数编辑区
 *   - 每个主题独立记忆：类型(混色/纯色/图片)、四色、角度、流动、纯色、图片、模糊、压暗
 *   - 图二(#mediaMenu)下方的编辑器 ⇄ 图一(#bgPop)原生控件 双向同步，并触发 applyBg 渲染
 *   - 拦截 window.applyPreset / window.useImg，切换主题与选图时自动读写数据
 *   - 长按主题卡片：编辑区滚入视野并高亮「正在编辑当前主题」（删除改到编辑区里的「删除」按钮）
 * ========================================================= */
(function themeEditorBoot() {
  var tries = 0;
  var timer = setInterval(function () {
    var menu = document.getElementById("mediaMenu"), car = document.getElementById("tpCarousel");
    if (menu && car && car.children.length && typeof window.applyPreset === "function" && typeof THEMES !== "undefined") {
      clearInterval(timer);
      try { init(menu, car); } catch (err) { if (window.console) console.error("[主题编辑器] 初始化失败", err); }
    } else if (++tries > 100) clearInterval(timer);        /* 最多等 5 秒 */
  }, 50);

  function init(menu, carousel) {
    var $$ = function (id) { return document.getElementById(id); };
    var CFG_KEY = "themeCfgV1";
    var DEF = { ang: 160, flow: false, blur: 8, dim: 30 };
    var busy = false, editFlashTimer = 0;

    /* ---------- 每个主题的配置：挂在 THEMES[i].cfg 上（不参与 themesV1 的 JSON 序列化） ---------- */
    /*PERSIST-BEGIN*/
    function defaultCfg(t, i) {
      var solidDefault = (t[0] === "纯黑");                 /* 内置「纯黑」主题默认就是纯色 */
      return {
        type: solidDefault ? "solid" : "grad",
        colors: t[1].slice(),
        ang: DEF.ang, flow: DEF.flow,
        solid: solidDefault ? "#000000" : (t[1][1] || "#1b1b2f"),
        img: "", sq: false, blur: DEF.blur, dim: DEF.dim
      };
    }
    function cfgOf(i) {
      var t = THEMES[i]; if (!t) return null;
      if (!t.cfg) t.cfg = defaultCfg(t, i);
      return t.cfg;
    }
    /* 首次运行：把「当前页面状态」认作当前主题的配置，避免加载后背景被突然改掉 */
    function readOrigIntoCfg(cfg) {
      cfg.colors = ["c1", "c2", "c3", "c4"].map(function (id) { return $$(id).value; });
      cfg.ang = +$$("ang").value; cfg.flow = !!$$("gflow").checked;
      cfg.solid = $$("solidc").value; cfg.blur = +$$("imgBlur").value; cfg.dim = +$$("imgDim").value;
    }

    function loadStore() {
      try {
        var arr = JSON.parse(localStorage.getItem(CFG_KEY) || "null");
        if (!Array.isArray(arr)) return false;
        arr.forEach(function (e, i) {
          var t = THEMES[i];
          if (!t || !e || e.name !== t[0] || !e.cfg || typeof e.cfg !== "object") return;
          var d = defaultCfg(t, i), c = e.cfg;
          t.cfg = {
            type: /^(grad|solid|img)$/.test(c.type) ? c.type : d.type,
            colors: (Array.isArray(c.colors) && c.colors.length === 4) ? c.colors : d.colors,
            ang: isFinite(c.ang) ? +c.ang : d.ang, flow: !!c.flow,
            solid: /^#[0-9a-fA-F]{6}$/.test(c.solid) ? c.solid : d.solid,
            img: typeof c.img === "string" && /^data:image\//.test(c.img) ? c.img : "",
            sq: !!c.sq, blur: isFinite(c.blur) ? +c.blur : d.blur, dim: isFinite(c.dim) ? +c.dim : d.dim,
            imgId: (typeof c.imgId === "string" && /^[\w-]{1,40}$/.test(c.imgId)) ? c.imgId : ""      /* 图片放在 IndexedDB 里，这里只记它的编号 */
          };
        });
        return true;
      } catch (_) { return false; }
    }
    /* ---------- 主题图片的存储 ----------
     * 以前：整份配置（含每个主题的 base64 图片）一次性写进 localStorage。iOS 的 localStorage 总共只有约 5MB，
     *       而 td_autosave 里还有一份同样的当前背景图，一张手机照片就能塞满。写失败后旧代码把“所有主题的图片”都丢掉，
     *       还不提示，于是第二次进来就回到默认。
     * 现在：图片存 IndexedDB（容量大得多），localStorage 里只留参数和图片编号 imgId；
     *       IndexedDB 不可用时才退回旧办法，并且写失败时不再覆盖掉之前已经存好的图片，同时提示一次。 */
    var IMGDB = "themeImgsV1", IMGST = "img", dbP = null, savePending = false, warned = false;
    function dbOpen() {
      if (dbP) return dbP;
      dbP = new Promise(function (ok, no) {
        try {
          var rq = indexedDB.open(IMGDB, 1);
          rq.onupgradeneeded = function () { try { rq.result.createObjectStore(IMGST); } catch (_) {} };
          rq.onsuccess = function () { ok(rq.result); };
          rq.onerror = function () { no(rq.error || new Error("idb open")); };
          rq.onblocked = function () { no(new Error("idb blocked")); };
        } catch (e) { no(e); }
      });
      dbP.then(null, function () { dbP = null; });          /* 打开失败：下次再试 */
      return dbP;
    }
    function dbTx(mode, fn) {
      return dbOpen().then(function (db) {
        return new Promise(function (ok, no) {
          var out, tx = db.transaction(IMGST, mode);
          tx.oncomplete = function () { ok(out); };
          tx.onerror = tx.onabort = function () { no(tx.error || new Error("idb tx")); };
          fn(tx.objectStore(IMGST), function (v) { out = v; });
        });
      });
    }
    function idbPut(k, v) { return dbTx("readwrite", function (st) { st.put(v, k); }); }
    function idbGet(k) { return dbTx("readonly", function (st, set) { var r = st.get(k); r.onsuccess = function () { set(r.result); }; }); }
    function idbKeys() { return dbTx("readonly", function (st, set) { var r = st.getAllKeys(); r.onsuccess = function () { set(r.result || []); }; }); }
    function idbDel(k) { return dbTx("readwrite", function (st) { st.delete(k); }); }
    function newImgId() { return "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function isImg(v) { return typeof v === "string" && /^data:image\//.test(v); }

    /* 序列化：inline=true 把图片直接写进去（旧办法），否则只留 imgId */
    function metaList(inline) {
      return THEMES.map(function (t) {
        var c = t.cfg; if (!c) return { name: t[0], cfg: null };
        var o = {}, k;
        for (k in c) { if (k === "_persisted" || k === "_tmp" || k === "img") continue; o[k] = c[k]; }
        o.img = inline ? (c.img || "") : "";
        return { name: t[0], cfg: o };
      });
    }
    function warnFull() {
      if (warned || document.hidden) return; warned = true;
      try { alert("主题图片太大，没能保存到本机，下次打开可能会恢复默认。可以换一张小一点的图片再试。"); } catch (_) {}
    }
    /* 退路：IndexedDB 不可用时，图片继续放 localStorage；放不下时保留之前已存好的图片，不再一刀切全部丢掉 */
    function saveLegacy() {
      var full = metaList(true);
      try { localStorage.setItem(CFG_KEY, JSON.stringify(full)); return; } catch (_) {}
      var old = []; try { old = JSON.parse(localStorage.getItem(CFG_KEY) || "[]") || []; } catch (__) {}
      var slim = full.map(function (e, i) {
        if (!e.cfg) return e;
        var o = old[i], keep = (o && o.name === e.name && o.cfg && isImg(o.cfg.img)) ? o.cfg.img : "";
        var c = {}; for (var k in e.cfg) c[k] = e.cfg[k]; c.img = keep; return { name: e.name, cfg: c };
      });
      try { localStorage.setItem(CFG_KEY, JSON.stringify(slim)); } catch (___) {}
      warnFull();
    }
    var saveTimer = 0, usedSig = null;
    function saveStore(now) {
      savePending = true;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, now ? 0 : 300);
    }
    function doSave() {
      clearTimeout(saveTimer); saveTimer = 0; savePending = false;
      var jobs = [];
      THEMES.forEach(function (t) {
        var c = t.cfg;
        if (c && c.img && !c._tmp && c._persisted !== c.img) {           /* 新选的图 / 旧版留在 localStorage 里的图：搬进 IndexedDB */
          if (!c.imgId) c.imgId = newImgId();
          var img = c.img;
          jobs.push(idbPut(c.imgId, img).then(function () { c._persisted = img; }));
        }
      });
      Promise.all(jobs).then(function () {
        try { localStorage.setItem(CFG_KEY, JSON.stringify(metaList(false))); }
        catch (_) { saveLegacy(); return; }
        var used = {}; THEMES.forEach(function (t) { if (t.cfg && t.cfg.imgId) used[t.cfg.imgId] = 1; });
        var sig = Object.keys(used).sort().join("|");
        if (!jobs.length && sig === usedSig) return;                       /* 没写新图、图片编号也没变：不用清理 */
        usedSig = sig;
        idbKeys().then(function (keys) {                                   /* 清理没人用的旧图（删除 / 换图后） */
          keys.forEach(function (k) { if (!used[k]) idbDel(k).then(null, function () {}); });
        }).then(null, function () {});
      }, function () { saveLegacy(); });                                   /* IndexedDB 写失败 */
    }
    /* 启动后把 IndexedDB 里的图片读回各个主题 */
    function hydrate() {
      var cur = cfgOf(window.theme || 0), curHit = false, jobs = [];
      THEMES.forEach(function (t) {
        var c = t.cfg;
        if (!c || !c.imgId || (c.img && !c._tmp)) return;
        jobs.push(idbGet(c.imgId).then(function (v) {
          c._tmp = false;                                                  /* 无论读到没有，都不再当“临时图” */
          if (!isImg(v)) return false;
          c.img = v; c._persisted = v; if (c === cur) curHit = true; return true;
        }, function () { c._tmp = false; return false; }));
      });
      if (!jobs.length) return;
      Promise.all(jobs).then(function (r) {
        if (!r.some(Boolean)) return;
        paintCards(); refreshEditor();
        if (curHit && cur.type === "img") { pushToOrig(cur); if (typeof reqBg === "function") reqBg(true); }
      });
    }
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden" && savePending) doSave(); });
    window.addEventListener("pagehide", function () { if (savePending) doSave(); });
    function saveThemes() { try { localStorage.setItem("themesV1", JSON.stringify(THEMES)); } catch (_) {} }
    /*PERSIST-END*/

    /* ---------- 把某个主题的配置“铺”到页面原生控件 / 全局变量上 ---------- */
    function pushToOrig(cfg) {
      busy = true;
      try {
        ["c1", "c2", "c3", "c4"].forEach(function (id, k) { $$(id).value = cfg.colors[k]; });
        $$("ang").value = cfg.ang; $$("gflow").checked = !!cfg.flow;
        $$("solidc").value = cfg.solid; $$("imgBlur").value = cfg.blur; $$("imgDim").value = cfg.dim;
        ["ang", "imgBlur", "imgDim"].forEach(function (id) { if (typeof sync === "function") sync($$(id)); });
        window.imgData = cfg.img || ""; imgData = cfg.img || "";
        window.isBgSquare = !!cfg.sq;
        setBgModeQuiet(cfg.type);
      } finally { busy = false; }
    }
    /* 切换 bgMode：只更新变量 + 图一的分区/高亮，不触发多余渲染（渲染由调用方 reqBg 负责） */
    function setBgModeQuiet(v) {
      bgMode = v;
      var g = $$("gbox"), s = $$("solidbox"), i = $$("ibox");
      if (g) g.classList.toggle("hide", v !== "grad");
      if (s) s.classList.toggle("hide", v !== "solid");
      if (i) i.classList.toggle("hide", v !== "img");
      var bgm = $$("bgm");
      if (bgm) [].forEach.call(bgm.children, function (c, k) { c.classList.toggle("on", ["grad", "solid", "img"][k] === v); });
    }

    /* ---------- 拦截 applyPreset：每次切主题都读取该主题的专属配置 ---------- */
    var origApplyPreset = window.applyPreset;
    window.applyPreset = applyPreset = function (i) {
      if (window.__bgSwap) { try { window.__bgSwap.cancel(); } catch (_) {} }   /* 换图转场还没播完就切主题：取消它，免得它结束时把别的主题的背景图盖掉 */
      var cfg = cfgOf(i);
      if (!cfg) return origApplyPreset.apply(this, arguments);
      pushToOrig(cfg);
      refreshEditor();
      markCards();
    };
    /* 拦截选图：选完图把图片存进当前主题；若当前主题不是图片类型，则自动转成图片主题 */
    if (typeof window.useImg === "function") {
      var origUseImg = window.useImg;
      window.useImg = useImg = function (cv) {
        window.__lastPickedImg = "";
        var r = origUseImg.apply(this, arguments);
        var cfg = cfgOf(window.theme);
        /* 已经是图片模式时，原 useImg 要等转场结束才更新 imgData，这里直接读它会拿到空的或上一张图，
           主题里就存不进新图、卡片也一直画渐变。所以用 useImg 刚记下的新图 */
        var picked = window.__lastPickedImg || imgData; window.__lastPickedImg = "";
        if (cfg) { cfg.img = picked; cfg.sq = !!window.isBgSquare; cfg.type = "img"; cfg._tmp = false; saveStore(true); refreshEditor(); markCards(); }
        return r;
      };
    }

    /* ---------- 图一原生控件 → 当前主题配置 + 图二编辑器 ---------- */
    ["c1", "c2", "c3", "c4", "ang", "gflow", "solidc", "imgBlur", "imgDim"].forEach(function (id) {
      var el = $$(id);
      ["input", "change"].forEach(function (ev) {
        el.addEventListener(ev, function () {
          if (busy) return;
          var cfg = cfgOf(window.theme); if (!cfg) return;
          readOrigIntoCfg(cfg);
          if (/^c[1-4]$/.test(id)) { THEMES[window.theme][1] = cfg.colors.slice(); saveThemes(); }
          saveStore(); pullToEditor(); paintCards();
        });
      });
    });
    /* 图一的「混色渐变 / 纯色 / 自选图片」切换 → 改写当前主题的类型 */
    var bgm = $$("bgm");
    if (bgm) bgm.addEventListener("click", function () {
      var cfg = cfgOf(window.theme); if (!cfg) return;
      cfg.type = bgMode; saveStore(); refreshEditor(); paintCards();
    });

    /* ---------- 图二：编辑区 DOM ---------- */
    var hint = menu.querySelector(".tp-hint");
    if (hint) hint.style.display = "none";
    var ed = document.createElement("div");
    ed.id = "tpEdit"; ed.className = "tp-edit tp-sheet"; ed.setAttribute("aria-hidden", "true");
    var NAMEROW = '<div class="tpe-line tpe-namerow"><span class="tpe-n">主题名称</span><input type="text" class="tpe-name" maxlength="14" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="主题名称"></div>';
    ed.innerHTML =
      '<div class="tpe-head"><div class="tpe-title" id="tpeTitle">当前主题</div>' +
        '<div class="tpe-types" id="tpeTypes"><button type="button" data-t="grad">混色</button><button type="button" data-t="solid">纯色</button><button type="button" data-t="img">图片</button></div>' +
      '</div>' +
      /* 混色：左 = 四个色块(2×2)，右 = 角度 / 流动 */
      '<div class="tpe-grp tpe-cols" id="tpeGrad">' +
        '<div class="tpe-l"><div class="tpe-sw"><input type="color" id="tpeC1"><input type="color" id="tpeC2"><input type="color" id="tpeC3"><input type="color" id="tpeC4"></div></div>' +
        '<div class="tpe-r">' +
          '<div class="tpe-line"><span class="tpe-n">角度</span><input type="range" id="tpeAng" min="0" max="360" value="160"><em id="tpeAngV">160°</em></div>' +
          '<div class="tpe-line"><span class="tpe-n">流动</span><label class="chk" style="margin:0 0 0 auto"><input type="checkbox" id="tpeFlow"></label></div>' +
        '</div>' +
      '</div>' +
      /* 纯色：左 = 大色块，右 = 说明 */
      '<div class="tpe-grp tpe-cols hide" id="tpeSolid">' +
        '<div class="tpe-l"><input type="color" id="tpeSolidC" value="#000000"></div>' +
        '<div class="tpe-r"><div class="tpe-cap">点左侧色块选择纯色</div></div>' +
      '</div>' +
      /* 图片：左 = 缩略图(点它选图)，右 = 模糊 / 压暗 */
      '<div class="tpe-grp tpe-cols hide" id="tpeImg">' +
        '<div class="tpe-l"><button type="button" class="tpe-thumb" id="tpePick" aria-label="选择图片"><span class="tpe-thumb-t" id="tpePickT">选择图片</span><span class="tpe-thumb-i" aria-label="更换图片"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/></svg></span></button></div>' +
        '<div class="tpe-r">' +
          '<div class="tpe-line"><span class="tpe-n">模糊</span><input type="range" id="tpeBlur" min="0" max="40" value="8"><em id="tpeBlurV">8</em></div>' +
          '<div class="tpe-line"><span class="tpe-n">压暗</span><input type="range" id="tpeDim" min="0" max="80" value="30"><em id="tpeDimV">30</em></div>' +
        '</div>' +
        '<span class="tpe-noimg hide" id="tpeNoImg"></span>' +
      '</div>' + NAMEROW;
    menu.appendChild(ed);      /* 二级菜单：绝对定位在主菜单正下方（见 CSS），不挡住上面的主题卡片 */

    var E = {
      title: $$("tpeTitle"), types: $$("tpeTypes"), grad: $$("tpeGrad"), solid: $$("tpeSolid"), img: $$("tpeImg"),
      c: ["tpeC1", "tpeC2", "tpeC3", "tpeC4"].map($$), ang: $$("tpeAng"), angV: $$("tpeAngV"), flow: $$("tpeFlow"),
      solidC: $$("tpeSolidC"), pick: $$("tpePick"), noimg: $$("tpeNoImg"),
      blur: $$("tpeBlur"), blurV: $$("tpeBlurV"), dim: $$("tpeDim"), dimV: $$("tpeDimV")
    };
    [E.ang, E.blur, E.dim].forEach(function (r) { if (typeof sync === "function") { r.step = "any"; sync(r); r.addEventListener("input", function () { sync(r); }); } });

    /* 图二编辑器 → 图一原生控件：写值 → 派发 input（触发 applyBgRaf）→ 派发 change（触发 reqBg） */
    function fire(el, final) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      if (final) el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    function push(origId, val, isCheck, final) {
      var o = $$(origId); if (!o) return;
      if (isCheck) o.checked = !!val; else o.value = val;
      fire(o, final);
    }
    E.c.forEach(function (el, k) {
      el.addEventListener("input", function () { push("c" + (k + 1), el.value, false, false); });
      el.addEventListener("change", function () { push("c" + (k + 1), el.value, false, true); });
    });
    E.ang.addEventListener("input", function () { push("ang", E.ang.value, false, false); E.angV.textContent = Math.round(E.ang.value) + "°"; });
    E.ang.addEventListener("change", function () { fire($$("ang"), true); });
    E.flow.addEventListener("change", function () { push("gflow", E.flow.checked, true, true); });
    E.solidC.addEventListener("input", function () { push("solidc", E.solidC.value, false, false); });
    E.solidC.addEventListener("change", function () { fire($$("solidc"), true); });
    E.blur.addEventListener("input", function () { push("imgBlur", E.blur.value, false, false); E.blurV.textContent = Math.round(E.blur.value); });
    E.blur.addEventListener("change", function () { fire($$("imgBlur"), true); });
    E.dim.addEventListener("input", function () { push("imgDim", E.dim.value, false, false); E.dimV.textContent = Math.round(E.dim.value); });
    E.dim.addEventListener("change", function () { fire($$("imgDim"), true); });
    var armT = 0;
    function arm(on) { clearTimeout(armT); E.pick.classList.toggle("armed", !!on); if (on) armT = setTimeout(function () { E.pick.classList.remove("armed"); }, 3000); }
    E.pick.addEventListener("click", function (e) {
      var p = $$("pick"); if (!p) return;
      if (!E.pick.classList.contains("has")) { p.click(); return; }          /* 还没有图：直接选图 */
      var armed = E.pick.classList.contains("armed");
      if (!armed) { arm(true); return; }                                       /* 第一次点：虚化 + 出按钮，3 秒后自动收起 */
      if (e.target.closest && e.target.closest(".tpe-thumb-i")) { arm(false); p.click(); }   /* 点中间按钮：换图 */
      else arm(false);                                                         /* 点别处：收起 */
    });

    /* ---------- 主题名称：三个页签各有一个输入框，改名同步到卡片 / 主题按钮 / 标题 / 本地存储 ---------- */
    var NAME_INPUTS = [].slice.call(ed.querySelectorAll(".tpe-name"));
    function curName() { var t = THEMES[window.theme]; return t ? t[0] : ""; }
    function syncNames(force) { var n = curName(); NAME_INPUTS.forEach(function (inp) { if ((force || document.activeElement !== inp) && inp.value !== n) inp.value = n; }); }
    function applyName(v, final) {
      var i = window.theme, t = THEMES[i]; if (!t) return;
      v = v.replace(/^\s+|\s+$/g, "");
      if (!v) { if (final) syncNames(true); return; }                          /* 不允许空名字：失焦时还原 */
      if (v === t[0]) return;
      t[0] = v;
      var card = carousel.children[i], ti = card && card.querySelector && card.querySelector(".tp-card-title"); if (ti) ti.textContent = v;
      var ch = $$("themes"); if (ch && ch.children[i]) ch.children[i].textContent = v;
      E.title.textContent = (sheetOpen ? "正在编辑 · " : "主题 · ") + v;
      saveThemes(); saveStore();
    }
    /* 主题名称框只读：点它不弹系统键盘，改名走顶部输入栏，确认后才写回 */
    NAME_INPUTS.forEach(function (inp) {
      inp.readOnly = true; inp.setAttribute("inputmode", "none");
      inp.addEventListener("click", function () {
        if (!window.__openTextBar) return;
        window.__openTextBar(null, inp, { value: curName(), maxLength: 14, placeholder: "主题名称",
          onOk: function (v) { applyName(v, true); syncNames(true); } });
      });
    });   /* 复用图一的选图 / 裁剪流程 */

    /* 类型切换（小号分段按钮）：直接改当前主题类型并立即渲染 */
    E.types.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("button[data-t]"); if (!b) return;
      var cfg = cfgOf(window.theme); if (!cfg || cfg.type === b.dataset.t) return;
      cfg.type = b.dataset.t;
      if (cfg.type === "img" && !cfg.img && window.imgData) { cfg.img = window.imgData; cfg.sq = !!window.isBgSquare; }   /* 没选过图就先沿用当前图 */
      busy = true; try { pushToOrig(cfg); } finally { busy = false; }
      saveStore(); refreshEditor(); paintCards();
      var vis = [E.grad, E.solid, E.img].filter(function (x) { return !x.classList.contains("hide"); })[0];
      if (vis && vis.animate) try { vis.animate([{ opacity: 0, translate: "0px 8px" }, { opacity: 1, translate: "0px 0px" }], { duration: dur() * .7, easing: "cubic-bezier(.32,.72,0,1)" }); } catch (_) {}
      if (typeof reqBg === "function") reqBg(true);
    });

    /* ---------- 编辑器 ← 当前主题配置 ---------- */
    function pullToEditor() {
      var cfg = cfgOf(window.theme); if (!cfg) return;
      cfg.colors.forEach(function (c, k) { if (E.c[k].value !== c) E.c[k].value = c; });
      E.ang.value = cfg.ang; E.angV.textContent = Math.round(cfg.ang) + "°"; sync(E.ang);
      E.flow.checked = !!cfg.flow;
      syncNames(false);
      E.solidC.value = cfg.solid;
      E.blur.value = cfg.blur; E.blurV.textContent = Math.round(cfg.blur); sync(E.blur);
      E.dim.value = cfg.dim; E.dimV.textContent = Math.round(cfg.dim); sync(E.dim);
      var im = cfg.img || "", pt = $$("tpePickT");                       /* 缩略图：有图就显示图，点它换图 */
      if (E.pick._im !== im) { E.pick._im = im; E.pick.style.setProperty("--im", im ? "url('" + im + "')" : "none"); arm(false); }
      E.pick.classList.toggle("has", !!im);
      if (pt) pt.textContent = im ? "更换" : "选择图片";
    }
    function refreshEditor() {
      var cfg = cfgOf(window.theme), t = THEMES[window.theme]; if (!cfg || !t) return;
      E.title.textContent = (sheetOpen ? "正在编辑 · " : "主题 · ") + t[0];
      [].forEach.call(E.types.children, function (b) { b.classList.toggle("on", b.dataset.t === cfg.type); });
      E.grad.classList.toggle("hide", cfg.type !== "grad");
      E.solid.classList.toggle("hide", cfg.type !== "solid");
      E.img.classList.toggle("hide", cfg.type !== "img");
      E.noimg.classList.toggle("hide", !!cfg.img);
      pullToEditor();
      if (sheetOpen) layoutSheet(true);       /* 类型切换后内容高度会变，重新排版二级菜单 */
    }

    /* ---------- 卡片外观：按主题类型显示渐变 / 纯色 / 图片缩略图 ---------- */
    function paintCards() {
      [].forEach.call(carousel.children, function (card, i) {
        var t = THEMES[i]; if (!t || card.classList.contains("add-card")) return;
        var cfg = cfgOf(i), bg;
        if (cfg.type === "solid") bg = cfg.solid;
        else if (cfg.type === "img" && cfg.img) bg = "center/cover no-repeat url('" + cfg.img + "')";
        else bg = "linear-gradient(160deg," + cfg.colors.join(",") + ")";
        var key = cfg.type + "|" + (cfg.type === "solid" ? cfg.solid : cfg.type === "img" ? (cfg.img ? cfg.img.length + ":" + cfg.img.slice(-24) : "") : cfg.colors.join(","));
        if (card._k !== key) { card._k = key; card.style.background = bg; }   /* 没变就不重设，避免大图反复解码 */
        card.dataset.type = cfg.type;
      });
    }
    function markCards() { paintCards(); }

    /* ---------- 长按卡片：弹出二级菜单（在主菜单正下方，不遮挡上面的卡片） ---------- */
    var sheetOpen = false, shiftY = 0, shiftAnims = [];
    var canTranslate = !!(window.CSS && CSS.supports && CSS.supports("translate", "0px 0px"));
    function dur() { return typeof uiT === "function" ? uiT(420) : 420; }
    function moveMenu(y) {                                   /* 空间不够时，主菜单整体上移一点，给二级菜单腾位置 */
      if (!canTranslate || Math.abs(y - shiftY) < 1) return;
      var from = shiftY; shiftY = y;
      var a = menu.animate([{ translate: "0px " + (-from) + "px" }, { translate: "0px " + (-y) + "px" }],
        { duration: dur(), easing: "cubic-bezier(.32,.72,0,1)", fill: "forwards" });
      shiftAnims.push(a);
      if (y === 0) a.onfinish = function () { shiftAnims.forEach(function (x) { try { x.cancel(); } catch (_) {} }); shiftAnims = []; };
    }
    function layoutSheet() {
      var vh = window.innerHeight;
      /* 不用 getBoundingClientRect：动画进行中它会带上正在播放的位移，导致越算越偏、主菜单顶出屏幕。
         主菜单固定在屏幕正中（top:50% + translate(-50%,-50%)），直接用布局尺寸推算“没位移”时的位置 */
      var mh = menu.offsetHeight, baseTop = menu.offsetTop - mh / 2, baseBottom = baseTop + mh;
      var prevH = ed.offsetHeight;
      ed.style.transition = "none"; ed.style.height = "auto"; ed.style.maxHeight = "none";
      var natural = ed.scrollHeight, H = Math.min(natural, 236);
      var floor = vh - 16;
      var hubEl = document.getElementById("hub"), mini = document.getElementById("mini");
      var hr = hubEl ? hubEl.getBoundingClientRect() : null, mr = mini ? mini.getBoundingClientRect() : null;
      if (hr && hr.width > 0 && hr.bottom > 0) floor = Math.min(floor, hr.bottom);      /* 不超过主面板（蓝线）的下边 */
      if (mr && mr.width > 0 && mr.top > 0) floor = Math.min(floor, mr.top - 10);       /* 也不压到「正在播放」栏 */
      var avail = floor - baseBottom - 10;
      var shift = Math.min(Math.max(0, H - avail), Math.max(0, baseTop - 12));          /* 上移后，主菜单顶部仍留在屏幕内 */
      if (H > avail + shift) H = avail + shift;                                         /* 还放不下：面板内部滚动 */
      var fin = Math.max(90, Math.floor(H));
      ed.style.height = prevH + "px"; void ed.offsetHeight;                             /* 先回到旧高度，再平滑过渡到新高度 */
      ed.style.transition = ""; ed.style.maxHeight = fin + "px"; ed.style.height = fin + "px";
      moveMenu(shift);
    }
    function openSheet() {
      if (sheetOpen) {                                                   /* 已经开着：只做一次高亮提示 */
        ed.classList.remove("flash"); void ed.offsetWidth; ed.classList.add("flash");
        clearTimeout(editFlashTimer); editFlashTimer = setTimeout(function () { ed.classList.remove("flash"); }, 1200);
        return;
      }
      sheetOpen = true;
      refreshEditor();
      layoutSheet();
      ed.setAttribute("aria-hidden", "false");
      ed.classList.add("open");
      try { ed.scrollTop = 0; } catch (_) {}
      if (navigator.vibrate) try { navigator.vibrate(12); } catch (_) {}
    }
    function closeSheet() {
      if (!sheetOpen) return;
      sheetOpen = false;
      ed.classList.remove("open", "flash");
      ed.setAttribute("aria-hidden", "true");
      moveMenu(0);
      refreshEditor();
    }
    /* 主菜单关闭 / 点主菜单里卡片和二级菜单之外的地方：收起二级菜单 */
    new MutationObserver(function () { if (!menu.classList.contains("show") && sheetOpen) closeSheet(); })
      .observe(menu, { attributes: true, attributeFilter: ["class"] });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheetOpen) { e.stopImmediatePropagation(); closeSheet(); } }, true);

    /* ---------- 手势：长按(笔形遮罩 / 拖动排序) · 上滑(卡片翻面 → 背面删除) · 点空白逐级关闭 ---------- */
    (function gestures() {
      var API = window.__tpApi; if (!API) return;
      var TH = 70, LONG = 550, PEN_MS = 3000;
      var g = null, pen = null, pend = null, lock = false, swallowUntil = 0, eatCfs = 0;
      var cfsBtn = $$("cfs");
      var PEN_SVG = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
      function buzz(n) { if (navigator.vibrate) try { navigator.vibrate(n); } catch (_) {} }
      function now() { return performance.now(); }
      function pop(el, from, mid, ms) {                                                  /* 轻微回弹 */
        if (!el || !el.animate) return;
        try { el.animate([{ scale: from }, { scale: mid, offset: .55 }, { scale: "1" }], { duration: ms || dur(), easing: "cubic-bezier(.32,.72,0,1)" }); } catch (_) {}
      }

      /* ----- 笔形遮罩 ----- */
      function hidePen() {
        if (!pen) return;
        clearTimeout(pen.timer);
        var el = pen.el; pen = null;
        el.classList.remove("on");
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
      }
      function showPen(card) {
        hidePen();
        var o = document.createElement("div"); o.className = "tp-pen";
        o.innerHTML = '<button type="button" class="tp-pen-btn" aria-label="编辑">' + PEN_SVG + '</button>';
        o.firstChild.addEventListener("click", function (e) {
          e.stopPropagation(); e.preventDefault();
          openFor(+card.dataset.idx);
        });
        card.appendChild(o);
        requestAnimationFrame(function () { requestAnimationFrame(function () { o.classList.add("on"); }); });
        pen = { card: card, el: o, timer: 0 };
        buzz(15);
      }
      function armPenTimer() { if (pen) { clearTimeout(pen.timer); pen.timer = setTimeout(hidePen, PEN_MS); } }
      function openFor(idx) {
        hidePen();
        if (idx !== window.theme && typeof applyPreset === "function") {
          window.theme = idx; applyPreset(idx); if (typeof reqBg === "function") reqBg(true);
          var el = carousel.children[idx];
          if (el) try { carousel.scrollTo({ left: el.offsetLeft - carousel.offsetWidth / 2 + el.offsetWidth / 2, behavior: "smooth" }); } catch (_) {}
        }
        openSheet();
      }

      /* ----- 翻面 ----- */
      function setFlip(card, a) {
        card._a = a;
        card.style.rotate = "x " + a + "deg";
        card.classList.toggle("flipped", a > 90);
      }
      function flipTo(card, to, ms, done) {
        cancelAnimationFrame(card._fr);
        var from = card._a || 0, t0 = performance.now();
        if (from === to) { if (done) done(); return; }
        (function step(t) {
          var p = Math.min(1, (t - t0) / ms), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          setFlip(card, from + (to - from) * e);
          if (p < 1) card._fr = requestAnimationFrame(step); else if (done) done();
        })(t0);
      }
      function flipBack(card) {
        flipTo(card, 0, 360, function () { card.style.rotate = ""; card.classList.remove("flipped"); card._a = 0; });
      }
      function cancelPending() {
        if (!pend) return;
        var c = pend.card; pend = null;
        flipBack(c);
      }

      /* ----- 确认删除：向中心缩小消失 → 后面的卡片滑入空位 → 补位卡片弹一下 ----- */
      function confirmDelete(card, idx) {
        if (lock) return; lock = true;
        if (pend && pend.card === card) pend = null;
        card.classList.add("vanish");
        buzz(12);
        setTimeout(function () { deleteWithSlide(idx); lock = false; }, 400);
      }
      function deleteWithSlide(i) {
        var olds = [].map.call(carousel.children, function (c) { return c.offsetLeft - carousel.scrollLeft; });
        API.deleteTheme(i);
        var kids = carousel.children;
        [].forEach.call(kids, function (c, k) {
          var j = k < i ? k : k + 1, d = (olds[j] === undefined ? 0 : olds[j]) - (c.offsetLeft - carousel.scrollLeft);
          if (!canTranslate || Math.abs(d) < 1 || !c.animate) return;
          try { c.animate([{ translate: d + "px 0px" }, { translate: "0px 0px" }], { duration: dur() * 1.15, easing: "cubic-bezier(.32,.72,0,1)" }); } catch (_) {}
        });
        pop(kids[window.theme], ".86", "1.08", dur() * 1.3);                              /* 补位 / 选中的那张：轻微放大回弹 */
      }
      API.confirm = confirmDelete;

      /* ----- 排序 ----- */
      function startReorder(e) {
        var c = g.card, list = [].slice.call(carousel.querySelectorAll(".tp-card[data-idx]"));
        g.mode = "reorder"; g.list = list; g.i0 = g.idx; g.to = g.idx;
        g.step = list[1] ? list[1].offsetLeft - list[0].offsetLeft : 122;
        g.x0 = e.clientX; g.px = e.clientX; g.s0 = carousel.scrollLeft;
        carousel.style.scrollSnapType = "none";
        c.classList.add("dragging", "reordering"); c.style.scale = "1.06";
        buzz(10);
        (function loop() {
          if (!g || g.mode !== "reorder") return;
          var r = carousel.getBoundingClientRect();
          if (g.px < r.left + 36) carousel.scrollLeft -= 7; else if (g.px > r.right - 36) carousel.scrollLeft += 7;
          moveReorder();
          g.raf = requestAnimationFrame(loop);
        })();
      }
      function moveReorder() {
        var n = g.list.length, dx = g.px - g.x0 + (carousel.scrollLeft - g.s0);
        dx = Math.max(-g.i0 * g.step, Math.min((n - 1 - g.i0) * g.step, dx));
        g.card.style.translate = dx + "px 0px";
        var to = Math.max(0, Math.min(n - 1, Math.round(dx / g.step) + g.i0));
        if (to === g.to) return;
        g.to = to;
        g.list.forEach(function (el, i) {
          if (el === g.card) return;
          var sft = 0;
          if (g.i0 < to && i > g.i0 && i <= to) sft = -g.step; else if (g.i0 > to && i < g.i0 && i >= to) sft = g.step;
          el.style.translate = sft ? sft + "px 0px" : "";
        });
        buzz(6);
      }
      function finishReorder(gg, ok) {
        cancelAnimationFrame(gg.raf);
        var c = gg.card;
        c.classList.remove("dragging"); c.style.scale = "";
        if (!ok || gg.to === gg.i0) {
          carousel.style.scrollSnapType = "";
          gg.list.forEach(function (el) { el.style.translate = ""; }); c.classList.remove("reordering"); return;
        }
        /* FLIP：先记下每张卡此刻在屏幕上的位置，重建后再让它们从旧位置连续滑到新位置 */
        var n = gg.list.length, kidsOld = carousel.children, pos = [];
        for (var k = 0; k < kidsOld.length; k++) {
          var tr = getComputedStyle(kidsOld[k]).translate, x = (tr && tr !== "none") ? (parseFloat(tr) || 0) : 0;
          pos.push(kidsOld[k].offsetLeft - carousel.scrollLeft + x);
        }
        API.reorder(gg.i0, gg.to);
        carousel.style.scrollSnapType = "";
        var kids = carousel.children;
        [].forEach.call(kids, function (el, k) {
          var old = k;
          if (k < n) {
            if (k === gg.to) old = gg.i0;
            else if (gg.i0 < gg.to && k >= gg.i0 && k < gg.to) old = k + 1;
            else if (gg.i0 > gg.to && k > gg.to && k <= gg.i0) old = k - 1;
          }
          var d = pos[old] - (el.offsetLeft - carousel.scrollLeft);
          if (!canTranslate || Math.abs(d) < 1 || !el.animate) return;
          try { el.animate([{ translate: d + "px 0px" }, { translate: "0px 0px" }], { duration: dur() * 1.1, easing: "cubic-bezier(.32,.72,0,1)" }); } catch (_) {}
        });
        pop(kids[gg.to], "1.06", ".97", dur());
      }

      /* ----- 手指事件 ----- */
      carousel.addEventListener("pointerdown", function (e) {
        if (lock || sheetOpen || (e.button > 0)) { g = null; return; }
        if (e.target.closest && e.target.closest(".tp-pen-btn,.tp-del")) { g = null; return; }
        var card = e.target.closest && e.target.closest(".tp-card");
        if (!card || card.dataset.idx === undefined) { g = null; return; }
        g = { card: card, idx: +card.dataset.idx, id: e.pointerId, x: e.clientX, y: e.clientY, px: e.clientX, sl: carousel.scrollLeft, mode: "", up: 0, armed: false, timer: 0 };
        var mine = g;
        g.timer = setTimeout(function () {
          if (g !== mine || mine.mode) return;
          mine.mode = "hold"; showPen(mine.card);
        }, LONG);
      });
      window.addEventListener("pointermove", function (e) {
        if (!g || e.pointerId !== g.id) return;
        var dx = e.clientX - g.x, dy = e.clientY - g.y; g.px = e.clientX;
        if (g.mode === "reorder") { moveReorder(); return; }
        if (g.mode === "hold") {
          if (Math.abs(dx) > 8) { if (THEMES.length > 1) { hidePen(); startReorder(e); } else hidePen(); }
          return;
        }
        /* 方向判断：只要整体偏向上（距竖直约 50° 以内）就算上滑删除；刚按下的头几个像素抖动大，不急着下结论。
           判成横向后也不锁死：只要浏览器没真的开始横向滚动，之后明显朝上就改判为上滑 */
        var UPR = 0.8, canDel = THEMES.length > 1;
        function enterSwipe() { g.mode = "swipe"; cancelAnimationFrame(g.card._fr); g.card.classList.add("dragging"); }
        if (!g.mode) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          clearTimeout(g.timer);
          if (canDel && dy < 0 && -dy > Math.abs(dx) * UPR) enterSwipe();
          else { g.mode = "x"; return; }
        } else if (g.mode === "x") {
          if (canDel && dy <= -10 && -dy > Math.abs(dx) * UPR && Math.abs(carousel.scrollLeft - g.sl) < 2) enterSwipe();
          else return;
        }
        if (g.mode !== "swipe") return;
        var up = Math.max(0, -dy), a = Math.min(180, up / TH * 180);                      /* 上滑越多翻得越多，180° 露出背面 */
        g.up = up; setFlip(g.card, a);
        var armed = a >= 179;
        if (armed !== g.armed) { g.armed = armed; if (armed) buzz(12); }
      }, { passive: true });
      function end(e) {
        if (!g || e.pointerId !== g.id) return;
        var gg = g; g = null; clearTimeout(gg.timer);
        var up = e.type === "pointerup", card = gg.card;
        if (gg.mode === "swipe") {
          swallowUntil = now() + 400; card.classList.remove("dragging");
          if (gg.armed && up) { pend = { card: card, idx: gg.idx }; setFlip(card, 180); }   /* 停在背面，等你点「删除」 */
          else flipBack(card);
        } else if (gg.mode === "reorder") {
          swallowUntil = now() + 500; finishReorder(gg, up);
        } else if (gg.mode === "hold") {
          swallowUntil = now() + 400;
          if (up) armPenTimer(); else hidePen();
        }
      }
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      carousel.addEventListener("touchmove", function (e) {
        if (g && (g.mode === "hold" || g.mode === "reorder" || g.mode === "swipe") && e.cancelable) e.preventDefault();
      }, { passive: false });
      carousel.addEventListener("click", function (e) {
        if (now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); }
      }, true);
      carousel.addEventListener("scroll", function () {
        if (g && g.mode === "reorder") return;
        hidePen(); cancelPending();
      }, { passive: true });
      new MutationObserver(function () { if (!menu.classList.contains("show")) { hidePen(); cancelPending(); } })
        .observe(menu, { attributes: true, attributeFilter: ["class"] });

      /* ----- 点屏幕任意位置：一次只退一层（编辑面板 → 主题选择器） ----- */
      window.addEventListener("pointerdown", function (e) {
        var t = e.target; if (!t || !t.closest) return;
        if (sheetOpen) {
          if (ed.contains(t) || t.closest("#crop")) return;
          closeSheet();
          if (cfsBtn && cfsBtn.contains(t)) { eatCfs = now() + 700; }
          e.stopPropagation(); return;
        }
        if (pen || pend) {
          if (t.closest(".tp-del,.tp-pen-btn")) return;
          hidePen(); cancelPending();
          if (!menu.contains(t)) e.stopPropagation();
        }
      }, true);
      window.addEventListener("click", function (e) {
        if (eatCfs && now() < eatCfs && e.target.closest && e.target.closest("#cfs")) { eatCfs = 0; e.stopPropagation(); e.preventDefault(); }
      }, true);
    })();
    /* 轮播被重建（添加 / 删除主题）后，重新上色 + 同步编辑器 */
    new MutationObserver(function () { paintCards(); refreshEditor(); saveStore(); }).observe(carousel, { childList: true });

    /* ---------- 启动：恢复已存配置；没有存档就把当前页面状态认作当前主题 ---------- */
    var had = loadStore(), cur = cfgOf(window.theme || 0);
    if (!had) {   /* 没有存档：沿用页面当前的背景类型与图片，作为当前主题的配置 */
      cur.type = bgMode; readOrigIntoCfg(cur);
      if (bgMode === "img") { cur.img = imgData; cur.sq = !!window.isBgSquare; }
    }
    /* 图片还在 IndexedDB 里没读出来：先用 td_autosave 恢复出来的当前背景图顶着，免得闪一下默认背景（只是临时的，不会写回） */
    if (had && cur.type === "img" && !cur.img && cur.imgId && isImg(window.imgData)) { cur.img = window.imgData; cur._tmp = true; }
    for (var k = 0; k < THEMES.length; k++) cfgOf(k);
    pushToOrig(cfgOf(window.theme || 0));
    refreshEditor(); paintCards();
    if (typeof reqBg === "function") reqBg(false);
    hydrate();
    saveStore();
  }
})();


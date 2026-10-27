// app/theme-picker.js — 横向主题选择器
/* =========================================================
 * 主题选择器：横向滑动二级菜单（接管 #cfs 与 #mediaMenu）
 * ========================================================= */
(function() {
  var menu = $("mediaMenu"), carousel = $("tpCarousel"), cfs = $("cfs");
  if (!menu || !carousel || !cfs) return;

  var blurEl = $("tpBlur"), blurV = $("tpBlurV");
  var gbEl = $("gbamp");              /* 全局毛玻璃模糊滑块（控制 --gb，范围 5–40） */
  var MIN_SCALE = 0.45;               /* 轮播两侧卡片的固定最小尺寸 */
  var MIN_OPA = 0.4;                  /* 轮播两侧卡片的固定最小透明度 */
  var BLUR_DEFAULT = 23;              /* 5–40 的中间值 */
  var LONG_PRESS_MS = 550;
  var isScrolling = false, suspend = false, cards = [];
  var lpTimer = 0, lpFired = false, lpX = 0, lpY = 0;

  function persistThemes() { try { localStorage.setItem("themesV1", JSON.stringify(THEMES)); } catch (_) {} }

  /* 页面上原有的「主题」小按钮组也要跟着增删 */
  function refreshThemeChips() {
    var box = $("themes");
    if (!box || typeof chips !== "function") return;
    box.innerHTML = "";
    chips(box, THEMES.map(function(t, i) { return [i, t[0]]; }),
      function() { return theme; },
      function(v) { theme = v; applyPreset(v); reqBg(true); });
  }

  function centerOn(card, smooth) {
    carousel.scrollTo({ left: card.offsetLeft - carousel.offsetWidth/2 + card.offsetWidth/2, behavior: smooth ? 'smooth' : 'auto' });
  }

  function exitDeleteMode() {
    var d = carousel.querySelector('.tp-card.deleting');
    if (d) d.classList.remove('deleting');
  }

  function deleteTheme(i) {
    if (THEMES.length <= 1) return;                 /* 至少保留一个主题 */
    var t = window.theme, wasCur = (t === i);
    THEMES.splice(i, 1);
    if (t > i) t--; else if (wasCur) t = Math.min(i, THEMES.length - 1);
    suspend = true;                                 /* 重建期间不要因为滚动位置变化而误切主题 */
    window.theme = t;
    if (wasCur) {
      if (typeof applyPreset === "function") applyPreset(t);
      if (typeof reqBg === "function") reqBg(true);
    }
    persistThemes(); refreshThemeChips();
    renderCarousel();
    if (cards[t]) centerOn(cards[t], false);
    updateStyles();
    suspend = false;
  }

  function nextCustomName() {
    var max = 0;
    THEMES.forEach(function(t) { var m = /^自定义 (\d+)$/.exec(t[0]); if (m) max = Math.max(max, +m[1]); });
    return "自定义 " + (max + 1);
  }

  function renderCarousel() {
    carousel.innerHTML = ''; cards = [];
    THEMES.forEach(function(t, i) {
      var card = document.createElement('div');
      card.className = 'tp-card'; card.dataset.idx = i;
      card.innerHTML = '<div class="tp-card-inner"><div class="tp-card-title">'+t[0]+'</div><div class="tp-card-lines"><div class="tp-card-line"></div><div class="tp-card-line short"></div></div></div>'
        + '<button type="button" class="tp-del" aria-label="删除主题"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg><span>删除</span></button>';
      var c = t[1];
      card.style.background = 'linear-gradient(160deg, '+c[0]+', '+c[1]+', '+c[2]+', '+c[3]+')';
      carousel.appendChild(card); cards.push(card);
    });

    var addCard = document.createElement('div');
    addCard.className = 'tp-card add-card';
    addCard.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><span>添加新主题</span>';
    carousel.appendChild(addCard); cards.push(addCard);

    cards.forEach(function(card, index) {
      var isTheme = index < THEMES.length;

      if (isTheme) {
        card.addEventListener('contextmenu', function(e) { e.preventDefault(); });

        card.querySelector('.tp-del').addEventListener('click', function(e) {
          e.stopPropagation();
          if (window.__tpApi && window.__tpApi.confirm) window.__tpApi.confirm(card, index); else deleteTheme(index);
        });
      }

      card.addEventListener('click', function() {
        if (lpFired) { lpFired = false; return; }    /* 长按松手产生的 click 不处理 */
        exitDeleteMode();
        if (index === THEMES.length) {
          var hex = function(){ return '#'+Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'); };
          THEMES.push([nextCustomName(), [hex(), hex(), hex(), hex()]]);
          persistThemes(); refreshThemeChips();
          renderCarousel();
          var target = cards[THEMES.length - 1];
          if (target) {
            centerOn(target, true);
            if (target.animate) try { target.animate([{ scale: '.3', opacity: 0 }, { scale: '1.06', opacity: 1, offset: .6 }, { scale: '1', opacity: 1 }], { duration: 560, easing: 'cubic-bezier(.32,.72,0,1)' }); } catch (_) {}
          }
        } else {
          centerOn(card, true);
        }
      });
    });
    updateStyles();
  }

  function updateStyles() {
    var center = carousel.scrollLeft + carousel.offsetWidth / 2;
    var closest = -1, minDiff = Infinity;

    cards.forEach(function(card, i) {
      var cardCenter = card.offsetLeft + card.offsetWidth / 2;
      var dist = Math.abs(center - cardCenter);
      var ratio = Math.min(1, dist / (carousel.offsetWidth / 2.2));
      var rotateY = Math.max(-20, Math.min(20, (center - cardCenter) / 10));

      card.style.transform = 'scale('+(1 - (1 - MIN_SCALE) * ratio)+') rotateY('+rotateY+'deg)';
      card.style.opacity = (1 - (1 - MIN_OPA) * ratio);
      card.style.zIndex = Math.round((1 - ratio) * 10);

      if (i < THEMES.length && dist < minDiff) { minDiff = dist; closest = i; }
    });

    /* 仅在菜单打开（用户正在滑动选择）时才应用主题，
       避免页面加载时的首次渲染把已保存的主题覆盖成第 0 个 */
    /* 滑动途中只更新卡片外观；背景（含模糊 / 大图重绘）等滑动停稳后再切一次，
       之前是“每经过一张卡就重绘一次背景”，手指一划就连闪好几下，这就是抽搐的来源 */
    if (!suspend && closest !== -1 && menu.classList.contains('show')) {
      pendingTheme = closest;
      clearTimeout(settleTimer);
      if (window.theme !== closest) settleTimer = setTimeout(commitTheme, 110);
    }
  }
  var pendingTheme = -1, settleTimer = 0;
  function commitTheme() {
    clearTimeout(settleTimer);
    if (suspend || pendingTheme < 0 || pendingTheme === window.theme || !menu.classList.contains('show')) return;
    window.theme = pendingTheme;
    if (typeof applyPreset === "function") applyPreset(window.theme);
    if (typeof reqBg === "function") reqBg(true);
  }
  carousel.addEventListener('scrollend', commitTheme);

  carousel.addEventListener('scroll', function() {
    exitDeleteMode();
    if (!isScrolling) {
      isScrolling = true;
      requestAnimationFrame(function() { updateStyles(); isScrolling = false; });
    }
  }, { passive: true });

  /* 卡片模糊程度：与全局「模糊强度」(#gbamp) 联动，直接改 --gb 并记忆（范围 5–40） */
  function syncBlurFromGlobal() {
    if (!blurEl || !gbEl) return;
    blurEl.value = gbEl.value;
    blurV.textContent = Math.round(+gbEl.value) + 'px';
    if (typeof sync === 'function') sync(blurEl);
  }
  function setGlobalBlur(v) {
    if (!gbEl) return;
    gbEl.value = v;
    gbEl.dispatchEvent(new Event('input', { bubbles: true }));   /* 触发原逻辑：写 --gb、存 localStorage */
    syncBlurFromGlobal();
  }
  if (blurEl) {
    blurEl.addEventListener('input', function() { setGlobalBlur(this.value); });
    syncBlurFromGlobal();
  }

  var resetRaf = 0;
  $("tpReset").addEventListener('click', function() {
    cancelAnimationFrame(resetRaf);
    var from = +(gbEl ? gbEl.value : BLUR_DEFAULT), t0 = performance.now(), D = 420;
    (function step(t) {
      var p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3);
      setGlobalBlur(Math.round(from + (BLUR_DEFAULT - from) * e));
      if (p < 1) resetRaf = requestAnimationFrame(step);
    })(t0);
  });

  /* ---------- 弹出 / 关闭 ---------- */
  function isOpen() { return menu.classList.contains('show'); }

  function openMenu() {
    if (isOpen()) return;
    if (typeof qOpen === "function") qOpen(false);          /* 先收起旁边的 Q弹菜单 */
    syncBlurFromGlobal();
    /* 先在隐藏状态下把当前主题卡片滚到正中并算好缩放，再播放弹出动画，
       这样弹出的第一帧就是对齐好的，不会“先闪一下再跳位置” */
    var card = cards[window.theme || 0];
    if (card) centerOn(card, false);
    updateStyles();
    menu.setAttribute('aria-hidden', 'false');
    cfs.classList.add('on'); cfs.setAttribute('aria-expanded', 'true');
    menu.classList.add('show');
    requestAnimationFrame(function() {                       /* 兜底：首帧布局未就绪时再对齐一次 */
      if (!isOpen()) return;
      var c = cards[window.theme || 0];
      if (c) centerOn(c, false);
      updateStyles();
    });
  }

  function closeMenu() {
    exitDeleteMode();
    if (!isOpen()) return;
    menu.classList.remove('show');
    menu.setAttribute('aria-hidden', 'true');
    cfs.classList.remove('on'); cfs.setAttribute('aria-expanded', 'false');
  }

  menu.setAttribute('aria-hidden', 'true');
  cfs.setAttribute('aria-expanded', 'false');

  cfs.addEventListener('click', function(e) {
    e.stopPropagation();
    isOpen() ? closeMenu() : openMenu();
  });

  /* 点菜单外面：一级一级关 —— 先退出「删除状态」，再关菜单（主面板由下面的分层逻辑保留） */
  document.addEventListener('pointerdown', function(e) {
    if (!isOpen()) return;
    var inMenu = menu.contains(e.target), onBtn = cfs.contains(e.target);
    var d = carousel.querySelector('.tp-card.deleting');
    if (!inMenu && !onBtn) {
      if (d) d.classList.remove('deleting'); else closeMenu();
    } else if (d && !d.contains(e.target)) {
      d.classList.remove('deleting');
    }
  }, true);

  /* 主面板被收起时（返回键 / 折叠键 / 迷你条等），菜单不能残留在屏幕上 */
  new MutationObserver(function() {
    if (isOpen() && !document.body.classList.contains('open')) closeMenu();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  /* Esc：同样先退出删除状态，再关菜单 */
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape' || !isOpen()) return;
    if (carousel.querySelector('.tp-card.deleting')) exitDeleteMode(); else closeMenu();
  });

  /* 拖动排序：把 from 位置的主题移到 to，并选中它 */
  function reorderTheme(from, to) {
    if (from === to || from < 0 || to < 0 || from >= THEMES.length || to >= THEMES.length) return;
    var sl = carousel.scrollLeft;
    var it = THEMES.splice(from, 1)[0]; THEMES.splice(to, 0, it);
    suspend = true;
    window.theme = to;
    if (typeof applyPreset === "function") applyPreset(to);
    if (typeof reqBg === "function") reqBg(true);
    persistThemes(); refreshThemeChips();
    renderCarousel();
    carousel.scrollLeft = sl;
    if (cards[to]) centerOn(cards[to], false);
    updateStyles();
    suspend = false;
  }
  window.__tpApi = { deleteTheme: deleteTheme, reorder: reorderTheme };

  renderCarousel();
})();

/* =========================================================
 * 居中主题选择器（#mediaMenu.theme-picker，标题“网格卡片”）：
 * 从“点击的位置”展开 / 收回，而不是从正中心缩放。
 * 菜单固定在屏幕正中（top/left:50% + translate(-50%,-50%)），
 * 这里把点击坐标换算成菜单自身坐标系的缩放原点（--mx/--my）。
 * ========================================================= */
(function(){
  var menu=document.getElementById("mediaMenu"),cfs=document.getElementById("cfs");
  if(!menu||!cfs)return;
  var st=document.createElement("style");st.id="themePickerOriginStyle";
  st.textContent=
    '@property --fo{syntax:"<number>";inherits:false;initial-value:100}'+
    'html body #mediaMenu.theme-picker{transform-origin:var(--mx,50%) var(--my,50%)!important}'+
    /* 退出：缩回第一次点击的位置；遮罩从四角向中心慢慢淡掉，最后整体淡出 */
    'html body #mediaMenu.theme-picker:not(.show){transform:translate(-50%,-50%) scale(.12)!important;--fo:-35;'+
      '-webkit-mask-image:radial-gradient(circle farthest-corner at 50% 50%,#000 calc(var(--fo)*1%),transparent calc(var(--fo)*1% + 35%));'+
      'mask-image:radial-gradient(circle farthest-corner at 50% 50%,#000 calc(var(--fo)*1%),transparent calc(var(--fo)*1% + 35%));'+
      'transition:transform calc(.65s/var(--ui-spd,1)/var(--theme-spd,1)) cubic-bezier(.55,0,.25,1),--fo calc(.6s/var(--ui-spd,1)/var(--theme-spd,1)) cubic-bezier(.4,0,.8,.6),opacity calc(.15s/var(--ui-spd,1)/var(--theme-spd,1)) linear calc(.5s/var(--ui-spd,1)/var(--theme-spd,1)),visibility 0s linear calc(.68s/var(--ui-spd,1)/var(--theme-spd,1))!important}'+
    'html body #mediaMenu.theme-picker.show{transform:translate(-50%,-50%) scale(1)!important;--fo:100;-webkit-mask-image:none;mask-image:none;'+
      'transition:transform calc(.6s/var(--ui-spd,1)/var(--theme-spd,1)) var(--spring-pop,cubic-bezier(.32,.72,0,1)),opacity calc(.2s/var(--ui-spd,1)/var(--theme-spd,1)) ease,visibility 0s!important}'+
    '@media (prefers-reduced-motion:reduce){html body #mediaMenu.theme-picker:not(.show){transform:translate(-50%,-50%)!important;-webkit-mask-image:none;mask-image:none;transition:opacity calc(.2s/var(--ui-spd,1)/var(--theme-spd,1)) linear,visibility 0s linear calc(.2s/var(--ui-spd,1)/var(--theme-spd,1))!important}}';
  document.head.appendChild(st);
  /* 退出期间保留毛玻璃：样式表里“隐藏态去背景/阴影/模糊”的规则会在收起的瞬间把玻璃剥掉，
     看起来就像整块一下消失，只剩内容在缩小。这里用行内 !important 在退出动画期间顶住，动画结束再撤掉。 */
  var GLASS=[],keepT=0;   /* 玻璃改由 #tpGlass 跟随层负责，这里不再钉 */
  function dropGlass(){GLASS.forEach(function(g){menu.style.removeProperty(g[0])})}
  new MutationObserver(function(){
    clearTimeout(keepT);
    if(menu.classList.contains("show")){dropGlass();return}
    GLASS.forEach(function(g){menu.style.setProperty(g[0],g[1],"important")});
    keepT=setTimeout(dropGlass,themeT(760));
  }).observe(menu,{attributes:true,attributeFilter:["class"]});
  /* 捕获阶段：早于 cfs 自己的点击处理（openMenu），此时菜单还没加 .show */
  document.addEventListener("click",function(e){
    if(!cfs.contains(e.target)||menu.classList.contains("show"))return;
    var x=e.clientX,y=e.clientY;
    if(!e.detail||(!x&&!y)){var r=cfs.getBoundingClientRect();x=r.left+r.width/2;y=r.top+r.height/2}  /* 键盘触发：用按钮中心 */
    var W=menu.offsetWidth,H=menu.offsetHeight;
    var L=menu.offsetLeft-W/2,T=menu.offsetTop-H/2;               /* 居中后的真实左上角（不受 transform 影响） */
    menu.style.setProperty("--mx",(x-L).toFixed(1)+"px");
    menu.style.setProperty("--my",(y-T).toFixed(1)+"px");
  },true);
})();


/* =========================================================
 * 主题选择器的毛玻璃：独立"跟随层"（#tpGlass）
 * 问题：把 backdrop-filter 放在正在做 transform / mask 动画的元素上，
 *       WebKit 在动画期间不采样背景，展开和收起时玻璃都是"透明"的，只有静止后才变模糊。
 * 做法：玻璃不再属于菜单本身，而是一个不做 transform 的独立元素；
 *       展开 / 收起期间每帧读取菜单当前的屏幕矩形（含缩放位移），把玻璃层的
 *       left/top/width/height/圆角同步成一样，所以玻璃自己始终是静态的，模糊全程有效。
 * ========================================================= */
(function(){
  var menu=document.getElementById("mediaMenu");if(!menu||!menu.parentNode)return;
  var g=document.createElement("div");g.id="tpGlass";menu.parentNode.insertBefore(g,menu);
  var st=document.createElement("style");
  st.textContent='#tpGlass{position:fixed;left:0;top:0;width:0;height:0;margin:0;pointer-events:none;z-index:998;'+
    'border-radius:20px;background:rgba(255,255,255,.14);-webkit-backdrop-filter:var(--g-blur);backdrop-filter:var(--g-blur);'+
    'box-shadow:0 14px 40px rgba(0,0,0,.3);opacity:0;visibility:hidden;transition:background-color calc(.28s/var(--ui-spd,1)/var(--theme-spd,1)) ease}'+
    /* 动画期间（展开 / 收起）：玻璃加重底色，保证即使系统没做背景模糊，也不会显得透明、露出后面的字 */
    '#tpGlass.anim{background-color:rgba(96,92,100,.62);transition:background-color calc(.08s/var(--ui-spd,1)/var(--theme-spd,1)) linear}';
  document.head.appendChild(st);
  var raf=0,idleSince=0;
  function frame(){
    var cs=getComputedStyle(menu),show=menu.classList.contains("show");
    var op=parseFloat(cs.opacity)||0,vis=cs.visibility!=="hidden";
    if(vis&&op>0.01){
      var r=menu.getBoundingClientRect(),w0=menu.offsetWidth||r.width,s=w0?r.width/w0:1;
      g.style.left=r.left.toFixed(2)+"px";g.style.top=r.top.toFixed(2)+"px";
      g.style.width=r.width.toFixed(2)+"px";g.style.height=r.height.toFixed(2)+"px";
      g.style.borderRadius=(20*s).toFixed(2)+"px";
      g.style.opacity=op.toFixed(3);g.style.visibility="visible";
      g.classList.toggle("anim",!show||s<0.985);
      /* 收起时同步径向 mask：玻璃层也由四周向内收缩，最后收成圆 */
      if(!show){
        var fov=parseFloat(cs.getPropertyValue("--fo"));if(isNaN(fov))fov=100;
        var mk="radial-gradient(circle farthest-corner at 50% 50%, #000 "+fov+"%, transparent "+(fov+35)+"%)";
        g.style.webkitMaskImage=mk;g.style.maskImage=mk;
      }else{
        g.style.webkitMaskImage="";g.style.maskImage="";
      }
      idleSince=0;
    }else{
      g.style.visibility="hidden";g.style.opacity="0";
      /* 宽高清零，彻底消灭残影 */
      g.style.width="0px";g.style.height="0px";
      if(!show){if(!idleSince)idleSince=performance.now();if(performance.now()-idleSince>250){raf=0;return}}
    }
    raf=requestAnimationFrame(frame);
  }
  function kick(){if(!raf){idleSince=0;raf=requestAnimationFrame(frame)}}
  new MutationObserver(kick).observe(menu,{attributes:true,attributeFilter:["class"]});
  window.addEventListener("resize",kick);
  kick();
})();



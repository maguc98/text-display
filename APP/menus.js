// app/menus.js — 底部菜单、系统设置
/* ---- 底部控制栏 ---- */
/* 旧的「导入」二级菜单（导入文本/粘贴文字/背景照片/更换封面）及其展开逻辑已移除，
   现在由文件末尾的「主题选择器」接管 #mediaMenu 与 #cfs。
   这里只保留 #qpop 一级页里的「选择音频 / 导入 LRC」按钮。 */
(function(){
  var menu = $("mediaMenu");
  var bA = $("btnPickAudio"), bL = $("btnPickLrc");
  if(bA) bA.onclick = function(){ if(menu) menu.classList.remove("show"); $("audioFile").click(); };
  if(bL) bL.onclick = function(){ if(menu) menu.classList.remove("show"); $("lrcFile").click(); };
})();
function qOpen(on){var p=$("qpop");p.classList.toggle("show",on);$("cq").classList.toggle("on",on);p.setAttribute("aria-hidden",on?"false":"true")}
$("cq").onclick=function(e){e.stopPropagation();qOpen(!$("qpop").classList.contains("show"))};
document.addEventListener("pointerdown",function(e){
  var p=$("qpop");if(p.classList.contains("show")&&!p.contains(e.target)&&!$("cq").contains(e.target))qOpen(false);
});
/* ---- 高斯模糊强度（常开，记忆设置） ---- */
(function(){
  var rg=$("gbamp"),lab=$("gbv"),root=document.documentElement;
  function apply(save){
    var v=Math.round(Math.max(5,Math.min(40,+rg.value||23)));
    root.style.setProperty("--gb",v+"px");lab.textContent=v+"px";sync(rg);
    if(save)try{localStorage.setItem("gb",String(v))}catch(_){}
  }
  rg.addEventListener("input",function(){apply(1)});
  rg.addEventListener("change",function(){var d=$("qdemo");d.checked=!d.checked});
  try{var b=localStorage.getItem("gb");if(b!==null&&b!=="")rg.value=b}catch(_){}
  apply(0);
})();

/* ---- 功能区：所有选项组统一成"单个下拉按钮 + 气泡菜单" ---- */
(function(){
  var SEL="#easeIn,#easeOut,#pdTs,#pdOs,#bgm,#themes,#lyAlign,#lyPos,#lyWrap,.crow[data-k=\"mode\"] .chips";
  var pop=document.createElement("div");pop.id="ddPop";pop.className="gpop";pop.setAttribute("role","listbox");pop.setAttribute("aria-hidden","true");
  var hd=document.createElement("div");hd.className="dd-h";pop.appendChild(hd);
  var grid=document.createElement("div");grid.className="sp-grid";pop.appendChild(grid);document.body.appendChild(pop);
  var active=null;
  var IC=FX_IC;
  function labelOf(box){var on=box.querySelector(".on")||box.children[0];return on?on.textContent.trim():"—"}
  function paint(t,box){t.firstChild.textContent=labelOf(box)}
  function close(){PopFX.hide(pop);if(active)active.t.setAttribute("aria-expanded","false");active=null}
  /* 定位 + 尺寸：打开和窗口变化时共用 */
  function layout(t,cols,opts){
    var r=t.getBoundingClientRect(),vw=window.innerWidth;
    var pw=cols===2?Math.min(opts.rich?272:252,vw-24):Math.max(150,Math.min(220,r.width));
    pop.style.width=pw+"px";grid.style.gridTemplateColumns=cols===2?"1fr 1fr":"1fr";
    PopFX.place(pop,t,{inner:grid,maxH:440,width:pw});
  }
  var _rz=0;
  window.addEventListener("resize",function(){
    if(_rz||!active||!pop.classList.contains("show"))return;
    _rz=requestAnimationFrame(function(){_rz=0;if(active&&pop.classList.contains("show")){layout(active.t,active.cols,active.opts);fadeEdges()}});
  });
  /* 通用：list=[{text,on,fn}] */
  function openList(t,list,cols,opts){
    opts=opts||{};grid.innerHTML="";hd.innerHTML="";
    if(opts.title){var tt=document.createElement("b");tt.className="dd-t";tt.textContent=opts.title;hd.appendChild(tt)}
    pop.classList.toggle("rich",!!opts.rich);
    list.forEach(function(it){var b=document.createElement("button");b.type="button";b.setAttribute("role","option");
      if(it.ic&&IC[it.ic]){var i=document.createElement("i");i.className="ic";i.innerHTML='<svg viewBox="0 0 24 24">'+IC[it.ic]+'</svg>';b.appendChild(i);
        var sp=document.createElement("span");sp.textContent=it.text;b.appendChild(sp)}
      else b.textContent=it.text;
      if(it.on)b.classList.add("on");
      if(it.wide)b.classList.add("wide");
      b.onclick=function(ev){ev.stopPropagation();close();it.fn()};
      if(it.head){hd.appendChild(b);return}
      if(it.sep){var d=document.createElement("div");d.className="dd-sep";grid.appendChild(d)}
      grid.appendChild(b)});
    hd.style.display=hd.childNodes.length?"flex":"none";
    cols=cols||(list.length>4?2:1);
    layout(t,cols,opts);
    PopFX.show(pop);t.setAttribute("aria-expanded","true");active={t:t,cols:cols,opts:opts};
    var sel=grid.querySelector(".on");if(sel)grid.scrollTop=Math.max(0,sel.offsetTop-grid.clientHeight/2+sel.offsetHeight/2);
    fadeEdges();
  }
  /* 内容超出时，上下边缘渐隐，避免按钮被硬生生切掉一半 */
  function fadeEdges(){
    var top=grid.scrollTop>2,bot=grid.scrollTop+grid.clientHeight<grid.scrollHeight-2;
    grid.style.setProperty("--ft",top?"18px":"0px");grid.style.setProperty("--fb",bot?"18px":"0px");
  }
  grid.addEventListener("scroll",fadeEdges,{passive:true});
  function openBox(t,box){
    var items=[].slice.call(box.children);
    var isMode=!!(box.closest&&box.closest('.crow[data-k="mode"]'));
    var last=items.length-1;
    openList(t,items.map(function(c,i){var tx=c.textContent.trim();
      return {text:tx,on:c.classList.contains("on"),ic:isMode?IC[tx]&&tx:null,
        head:isMode&&i===0,wide:isMode&&i===last,sep:isMode&&i===last,
        fn:function(){c.click();paint(t,box)}}}),
      undefined,isMode?{title:"动画样式",rich:true}:null);
  }
  function ddz(box){
    if(box.__dd||!box.parentNode)return;box.__dd=1;
    var t=document.createElement("button");t.type="button";t.className="ssel";t.setAttribute("aria-haspopup","listbox");t.setAttribute("aria-expanded","false");
    t.innerHTML="<span></span><svg viewBox=\"0 0 24 24\"><path d=\"M6 9l6 6 6-6\"/></svg>";
    if(box.style.marginTop)t.style.marginTop=box.style.marginTop;
    box.parentNode.insertBefore(t,box);box.style.display="none";paint(t,box);
    t.addEventListener("click",function(e){e.stopPropagation();(active&&active.t===t)?close():openBox(t,box)});
    new MutationObserver(function(){paint(t,box)}).observe(box,{attributes:true,attributeFilter:["class"],childList:true,subtree:true});
  }
  function scan(){[].forEach.call(document.querySelectorAll(SEL),ddz)}
  scan();
  var cards=document.getElementById("cards");if(cards)new MutationObserver(scan).observe(cards,{childList:true});

  /* ---- 控制栏：第 4 个按钮 → 在控制栏下方整块展开的"播放菜单"（播放控制 / 速度 / 跳转 / 快捷开关） ---- */
  (function(){
    var bar=document.getElementById("cbar"),fold=document.getElementById("cfold");if(!bar||!fold)return;
    var t=document.createElement("button");t.type="button";t.className="cb";t.id="cmore";t.title="系统设置";t.setAttribute("aria-label","系统设置");t.setAttribute("aria-expanded","false");
    t.innerHTML=`<svg viewBox="0 0 24 24"><circle cx="5.5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18.5" cy="12" r="2"/></svg>`;
    fold.parentNode.insertBefore(t,fold.nextSibling);

    var menu=document.createElement("div");menu.id="pg5";menu.className="pg hide";
    menu.innerHTML=`<div class="ph">系统设置</div><div class="pm-box">

      <!-- 1. 系统设置 -->
      <div class="grp">
        <button class="gh" type="button" aria-expanded="false"><span>系统设置</span><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="gb"><div class="gi"><div class="gp">
          <div class="qh" style="margin-top:0; display:flex; justify-content:space-between; align-items:center; padding:0 4px;">
            <b>界面动画速度</b><em id="uiSpdV" class="av" style="font-style:normal; color:var(--sub);">1.00×</em>
          </div>
          <div class="qr" style="margin-top:8px; display:flex; align-items:center; gap:8px; padding:0 4px;">
            <span style="font-size:12px; color:var(--sub);">0.25×</span>
            <input type="range" id="uiSpd" min="25" max="300" step="5" value="100" aria-label="界面动画速度" style="flex:1;">
            <span style="font-size:12px; color:var(--sub);">3×</span>
          </div>
          <div class="qtip" style="margin:6px 4px 0">调节面板、按钮、菜单等界面动画的快慢，不影响文字特效。</div>

          <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px; border-top:1px solid rgba(255,255,255,.1); padding-top:16px;">
            <label class="chk" style="display:none !important;display:flex; align-items:center; justify-content:space-between; width:100%; margin:0; padding:10px 14px; background:rgba(255,255,255,.04); border-radius:12px; box-sizing:border-box;">
              <span style="font-size:14px; color:#fff;">高光描边</span>
              <input type="checkbox" id="uiH" checked>
            </label>
            <label class="chk" style="display:none !important;display:flex; align-items:center; justify-content:space-between; width:100%; margin:0; padding:10px 14px; background:rgba(255,255,255,.04); border-radius:12px; box-sizing:border-box;">
              <span style="font-size:14px; color:#fff;">柔和阴影</span>
              <input type="checkbox" id="uiS" checked>
            </label>
            <label class="chk" style="display:flex; align-items:center; justify-content:space-between; width:100%; margin:0; padding:10px 14px; background:rgba(255,255,255,.04); border-radius:12px; box-sizing:border-box;">
              <span style="font-size:14px; color:#fff;">性能优化</span>
              <input type="checkbox" id="performanceMode" checked>
            </label>
          </div>

          <div class="qd" style="margin-top:20px; display:flex; justify-content:center;">
            <button class="chip" id="qrstMoved" type="button" style="flex:1; padding:10px 0;">恢复默认设置</button>
          </div>
        </div></div></div>
      </div>

      <!-- 2. Beta 测试功能 -->
      <div class="grp" id="betaBox">
        <button class="gh" type="button" aria-expanded="false" style="background:rgba(80,125,240,.25); border:1px solid rgba(80,125,240,.4);"><span style="color:#a3c2ff">Beta 测试功能</span><em class="beta-tag" style="margin-left:auto; margin-right:8px;">BETA</em><svg viewBox="0 0 24 24" style="stroke:#a3c2ff"><path d="M6 9l6 6 6-6"/></svg></button>
        <div class="gb"><div class="gi"><div class="gp" id="betaBody" style="display:flex;flex-direction:column;gap:8px;">
          <div class="qtip" style="margin-top:0; margin-bottom:8px;">测试中的功能，可能不稳定。音乐模式和音频 / 歌词导入已移到底部「···」菜单。</div>
        </div></div></div>
      </div>

      <!-- 3. 开发者选项（由 devtools.js 注入） -->
      <div id="devOptionsHolder"></div>

      <div class="qtip" id="appVersion" style="text-align:center;margin-top:24px">版本 v0.1.1 Beta 3</div>
    </div>`;
    var pg4=document.getElementById("pg4");pg4.parentNode.insertBefore(menu,pg4);
    /* 绑定折叠面板事件 */
    [].forEach.call(menu.querySelectorAll(".gh"), function(btn) {
      btn.addEventListener("click", function() {
        var grp = btn.parentNode;
        var on = grp.classList.toggle("open");
        btn.setAttribute("aria-expanded", on ? "true" : "false");
        if (on) setTimeout(function(){ grp.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, 460);
      });
    });

    var $$=function(i){return document.getElementById(i)},timer=0;
    [].forEach.call(menu.querySelectorAll("input[type=range]"),wrapRange);
    bindUiSpd();
    var qrm=$$("qrstMoved");if(qrm)qrm.onclick=function(){setUiSpdPct(100);var d=$$("qdemo");if(d)d.checked=!d.checked};
    function refresh(){
      [].forEach.call(menu.querySelectorAll("[data-t]"),function(b){var c=$$(b.dataset.t);b.classList.toggle("on",!!(c&&c.checked))});
    }
    menu.addEventListener("click",function(e){
      var b=e.target.closest&&e.target.closest("button");if(!b)return;e.stopPropagation();
      var tg=b.dataset.t;
      if(tg){var c=$$(tg);if(c)c.click()}
      refresh();
    });
    var menuOn=false,_sp=showPg;
    function setMenu(on){
      on=!!on;if(on===menuOn)return;menuOn=on;
      t.classList.toggle("on",on);t.setAttribute("aria-expanded",on?"true":"false");clearInterval(timer);
      if(on){
        for(var k=0;k<5;k++){var e=$$("pg"+k);e.classList.remove("leave","go");e.classList.add("hide")}
        menu.classList.remove("leave","hide","go");menu.style.setProperty("--dx","18px");void menu.offsetWidth;menu.classList.add("go");
        clearTimeout(menu._g);menu._g=setTimeout(function(){menu.classList.remove("go")},uiT(400));
        $$("panel").scrollTop=0;refresh();timer=setInterval(refresh,300);
      }else{menu.classList.remove("go");menu.classList.add("hide");_sp(curTab,0)}
    }
    /* 其它地方切换页面时（点上方标签等），自动退出播放菜单 */
    showPg=function(i,d){if(menuOn){menuOn=false;t.classList.remove("on");t.setAttribute("aria-expanded","false");clearInterval(timer);menu.classList.remove("go");menu.classList.add("hide")}_sp(i,d)};
    var nav=document.querySelector(".nav");
    if(nav)nav.addEventListener("pointerdown",function(){if(menuOn)setMenu(false)},true);
    t.addEventListener("click",function(e){e.stopPropagation();close();setMenu(!menuOn)});
    new MutationObserver(function(){if(!document.body.classList.contains("open"))setMenu(false)}).observe(document.body,{attributes:true,attributeFilter:["class"]});
  })();

  /* ---- Q弹气泡里的两个新功能：循环播放 / 屏幕常亮 ---- */
  (function(){
    var loop=document.getElementById("qLoop"),wake=document.getElementById("qWake");if(!loop||!wake)return;
    function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(_){return null}}
    /* 循环播放：关闭后，自动播放到最后一句就停住 */
    if(ls("qloop")==="0")loop.checked=false;
    window.__noLoop=!loop.checked;
    loop.addEventListener("change",function(){window.__noLoop=!loop.checked;ls("qloop",loop.checked?"1":"0")});
    /* 屏幕常亮：播放时不自动熄屏（Screen Wake Lock） */
    var lock=null,ok=!!(navigator.wakeLock&&navigator.wakeLock.request);
    function setWake(on){
      if(!ok)return;
      if(on){
        if(lock)return;
        navigator.wakeLock.request("screen").then(function(l){lock=l;l.addEventListener("release",function(){lock=null})}).catch(function(){});
      }else if(lock){lock.release().catch(function(){});lock=null}
    }
    if(!ok){wake.disabled=true;wake.parentNode.title="当前浏览器不支持"}
    else{
      if(ls("qwake")==="1"){wake.checked=true;setWake(true)}
      wake.addEventListener("change",function(){ls("qwake",wake.checked?"1":"0");setWake(wake.checked)});
      document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"&&wake.checked&&!lock)setWake(true)});
    }
  })();

  /* ---- 沉浸模式（自动隐藏 UI）+ 时间滑块 ---- */
  var immerseTimer = null;
  function resetImmerseTimer() {
    clearTimeout(immerseTimer);

    // 只要有操作，立刻移除沉浸模式
    if (document.body.classList.contains('immerse')) {
      document.body.classList.remove('immerse');
    }

    // 获取用户设置的隐藏时间，默认 10 秒
    var sec = parseInt(document.getElementById('qImmerse') ? document.getElementById('qImmerse').value : 10) || 10;

    // 如果暂停中，或面板打开，或卡片打开，或菜单打开，不启动倒计时
    if (!playing ||
        document.body.classList.contains('open') ||
        document.body.classList.contains('np-open') ||
        (document.getElementById('qpop') && document.getElementById('qpop').classList.contains('show')) ||
        (document.getElementById('mediaMenu') && document.getElementById('mediaMenu').classList.contains('show'))) {
      return;
    }

    // 启动倒计时
    immerseTimer = setTimeout(function() {
      if (playing &&
          !document.body.classList.contains('open') &&
          !document.body.classList.contains('np-open') &&
          !(document.getElementById('qpop') && document.getElementById('qpop').classList.contains('show')) &&
          !(document.getElementById('mediaMenu') && document.getElementById('mediaMenu').classList.contains('show'))) {
        document.body.classList.add('immerse');
      }
    }, sec * 1000); // 乘以 1000 转换为毫秒
  }
  /* 任何操作都重置计时；UI 已隐藏时，这一次点击只负责唤醒，不再触发暂停/打开面板 */
  var immSwallow = 0;
  ['pointerdown','pointermove','keydown','wheel'].forEach(function(t){
    document.addEventListener(t, function(e){
      if (t === 'pointerdown' && document.body.classList.contains('immerse')) immSwallow = performance.now() + 600;
      resetImmerseTimer();
    }, true);
  });
  document.addEventListener('click', function(e){
    if (immSwallow && performance.now() < immSwallow) { immSwallow = 0; e.stopPropagation(); e.preventDefault(); }
  }, true);
  /* 状态变化（播放/暂停、面板开合）也重新判断一次 */
  var immKey = '';
  new MutationObserver(function(){
    var k = document.body.className.replace(/\bimmerse\b/g, '').trim(); // 忽略 immerse 自己的变化，否则一加上就被重置掉
    if (k === immKey) return;
    immKey = k; resetImmerseTimer();
  }).observe(document.body, {attributes:true, attributeFilter:['class']});
  /* 播放/暂停切换（stage 的 paused 类）也要重新判断：点“播放”那一下 pointerdown 时还是暂停态，不会启动倒计时 */
  new MutationObserver(function(){ resetImmerseTimer(); }).observe(stage, {attributes:true, attributeFilter:['class']});
  resetImmerseTimer();

  // ===== 自动隐藏时间滑块 =====
  (function(){
    var el = document.getElementById('qImmerse');
    var lab = document.getElementById('qImmerseV');
    if (!el || !lab) return;
    el.step = '1'; // 页面通用的 range 初始化把 step 设成了 any，这里改回整数秒

    // 从本地读取之前的设置
    try {
      var saved = localStorage.getItem('immerseSec');
      if (saved !== null && saved !== "") el.value = Math.min(10, Math.max(1, Math.round(+saved) || 10));
    } catch(_) {}

    lab.textContent = el.value + 's';
    if (typeof sync === 'function') sync(el);

    // 监听滑动，更新 UI、重置计时器并保存
    el.addEventListener('input', function(){
      lab.textContent = el.value + 's';
      try { localStorage.setItem('immerseSec', el.value); } catch(_) {}
      // 如果正在倒计时，重置一下，按新时间来
      if (typeof resetImmerseTimer === 'function') resetImmerseTimer();
    });
  })();

  /* Q弹气泡：优先朝下展开（盖在句子列表上），下方放不下再朝上；高度不超过可用空间 */
  (function(){
    var _q=window.qOpen;if(typeof _q!=="function")return;
    function placeQ(){
      var p=document.getElementById("qpop"),cd=document.getElementById("cdock");if(!p||!cd)return;
      var r=cd.getBoundingClientRect(),vh=window.innerHeight,below=vh-r.bottom-130,above=r.top-70,down=below>=above||below>=300;
      p.style.maxHeight=Math.max(150,down?below:above)+"px";
      if(down){p.style.top="calc(100% + 8px)";p.style.bottom="auto";p.style.transformOrigin="50% 0"}
      else{p.style.top="auto";p.style.bottom="calc(100% + 10px)";p.style.transformOrigin="50% 100%"}
    }
    qOpen=function(on){if(on)placeQ();_q(on)};
  })();

  /* 「···」弹窗：一级页（其他选项 › / 导入 / 模式切换）⇄ 二级页（全部设置控件），同一个弹窗内左右滑动 */
  (function(){
    var pop=document.getElementById("qpop"),view=document.getElementById("qpView"),
        p1=document.getElementById("qpP1"),p2=document.getElementById("qpP2"),
        go=document.getElementById("qpGoSub"),back=document.getElementById("qpBack");
    if(!pop||!view||!p1||!p2)return;
    function fit(){var a=pop.classList.contains("sub")?p2:p1;view.style.height=a.scrollHeight+"px"}
    function setSub(on){
      pop.classList.toggle("sub",!!on);
      p1.setAttribute("aria-hidden",on?"true":"false");p2.setAttribute("aria-hidden",on?"false":"true");
      fit();pop.scrollTop=0;
    }
    if(go)go.addEventListener("click",function(e){e.stopPropagation();setSub(true)});
    if(back)back.addEventListener("click",function(e){e.stopPropagation();setSub(false)});
    if(window.ResizeObserver){var ro=new ResizeObserver(fit);ro.observe(p1);ro.observe(p2)}
    window.addEventListener("resize",fit);
    /* 每次打开都回到一级页 */
    var _o=window.qOpen;
    qOpen=function(on){
      if(on){pop.classList.remove("sub");p1.setAttribute("aria-hidden","false");p2.setAttribute("aria-hidden","true")}
      _o(on);
      if(on)requestAnimationFrame(fit);
    };
    fit();
  })();

  document.addEventListener("pointerdown",function(e){if(active&&!pop.contains(e.target)&&!active.t.contains(e.target))close()},true);
  document.addEventListener("scroll",function(e){if(!pop.contains(e.target))close()},true);

  // 图片按钮交互 + 背景菜单
  (function(){
    var wrap=document.getElementById("coverWrap"),panel=document.getElementById("panel"),pg2=document.getElementById("pg2");
    var bp=document.getElementById("bgPop"),btnChange=document.getElementById("btnChangeBg"),btnZoom=document.getElementById("btnZoomBg");
    if(!wrap)return;
    if(bp)document.body.appendChild(bp);

    /* 图片高度 = 面板可视高度（减去标题），刚好填满、不用滚动 */
    function fit(){
      if(!panel||!pg2)return;
      var on=!pg2.classList.contains("hide");
      panel.classList.toggle("lock",on);        /* 背景页：面板锁死，不能上下滑 */
      if(!on)return;
      panel.scrollTop=0;
      var pcs=getComputedStyle(panel),ph=pg2.querySelector(".ph");
      var h=panel.clientHeight-(parseFloat(pcs.paddingTop)||0)-(parseFloat(pcs.paddingBottom)||0);
      if(ph){var cs=getComputedStyle(ph);h-=ph.offsetHeight+(parseFloat(cs.marginTop)||0)+(parseFloat(cs.marginBottom)||0)}
      h-=parseFloat(getComputedStyle(wrap).marginTop)||0;
      h=Math.max(90,Math.floor(h)-1);
      if(Math.abs(h-wrap.offsetHeight)>1)wrap.style.height=h+"px";
    }
    var fitT=0;function fitSoon(){cancelAnimationFrame(fitT);fitT=requestAnimationFrame(fit)}
    if(window.ResizeObserver&&panel)new ResizeObserver(fitSoon).observe(panel);
    if(pg2)new MutationObserver(fitSoon).observe(pg2,{attributes:true,attributeFilter:["class"]});
    window.addEventListener("resize",fitSoon);
    fitSoon();

    /* 点图片：显示/隐藏两个悬浮按钮（隐藏时不接收点击，避免误触） */
    var cBtns=wrap.querySelectorAll("button");
    wrap.addEventListener("click",function(e){
      if(e.target.closest&&e.target.closest("button"))return;
      var show=this.getAttribute("data-show")!=="1";
      this.setAttribute("data-show",show?"1":"0");
      cBtns.forEach(function(b){b.style.opacity=show?"1":"0";b.style.pointerEvents=show?"auto":"none"});
    });

    /* 两个气泡菜单：样式（背景设置）/ 放大（预览图），共用同一套定位与关闭逻辑 */
    var zp=document.createElement("div");zp.id="zoomPop";zp.className="gpop zoompop";zp.setAttribute("role","dialog");zp.setAttribute("aria-hidden","true");
    var zimg=document.createElement("img");zimg.id="zoomImg";zimg.alt="";zp.appendChild(zimg);document.body.appendChild(zp);
    var PAIRS=[[bp,btnChange],[zp,btnZoom]];
    function isShown(p){return !!p&&p.classList.contains("show")}
    function closeP(p,b){if(!p)return;PopFX.hide(p);if(b)b.setAttribute("aria-expanded","false")}
    function closeAll(){PAIRS.forEach(function(x){closeP(x[0],x[1])})}
    function openP(p,b,maxH,byRoom){
      var res=PopFX.place(p,b,{maxH:maxH,byRoom:byRoom,preferUp:true,bottomAnchor:true,gap:10,reserveTop:60,reserveBottom:110});
      PopFX.show(p);b.setAttribute("aria-expanded","true");
      return res.h;
    }
    /* 预览图加载完成后宽高会变，已经打开时顺滑地重新对齐一次 */
    zimg.addEventListener("load",function(){if(isShown(zp)){var h=openP(zp,btnZoom,380,true);zimg.style.maxHeight=Math.max(80,h-16)+"px"}});
    if(btnChange)btnChange.addEventListener("click",function(e){
      e.stopPropagation();
      if(isShown(bp)){closeP(bp,btnChange);return}
      closeAll();openP(bp,btnChange,440);
    });
    /* 放大：只在真的有图片时弹出（没有封面时是渐变，不弹） */
    if(btnZoom)btnZoom.addEventListener("click",function(e){
      e.stopPropagation();
      if(isShown(zp)){closeP(zp,btnZoom);return}
      var bg=window.getComputedStyle(document.getElementById("hubCover")).backgroundImage;
      if(!(bg&&bg!=="none"&&bg.indexOf("url(")===0))return;
      closeAll();
      zimg.src=bg.replace(/^url\(["']?/,'').replace(/["']?\)$/,'');
      var h=openP(zp,btnZoom,380,true);
      zimg.style.maxHeight=Math.max(80,h-16)+"px";
    });
    zp.addEventListener("click",function(){closeP(zp,btnZoom)});
    var inDD=function(el){return el&&el.nodeType===1&&el.closest&&el.closest("#ddPop")};
    document.addEventListener("pointerdown",function(e){
      PAIRS.forEach(function(x){
        if(isShown(x[0])&&!x[0].contains(e.target)&&!(x[1]&&x[1].contains(e.target))&&!inDD(e.target))closeP(x[0],x[1]);
      });
    },true);
    document.addEventListener("scroll",function(e){
      PAIRS.forEach(function(x){if(isShown(x[0])&&!x[0].contains(e.target)&&!inDD(e.target))closeP(x[0],x[1])});
    },true);
    window.addEventListener("resize",closeAll);
  })();
})();
(function(){
  var rbMode = document.getElementById("rainbowMode");
  if (rbMode) {
    // 从本地读取之前的设置，默认开启彩虹
    try {
      var saved = localStorage.getItem("singleColorMode");
      if (saved === "1") rbMode.checked = false;
    } catch(_) {}

    // 初始应用状态
    document.body.classList.toggle("single-color", !rbMode.checked);

    // 监听开关变化
    rbMode.addEventListener("change", function() {
      document.body.classList.toggle("single-color", !this.checked);
      try { localStorage.setItem("singleColorMode", this.checked ? "0" : "1"); } catch(_) {}
    });
  }
})();

(function(){
  var slider = document.getElementById("modeSlider");
  var thumb = slider ? slider.querySelector(".mode-slider-thumb") : null;
  var btnText = document.getElementById("btnModeText");
  var btnMusic = document.getElementById("btnModeMusic");
  var label = document.getElementById("modeSliderLabel");

  // 更新音乐面板信息（保留原有功能，showPg / applyLRC 都会调用它）
  window.updateMusicPanel = function() {
    var titleEl = document.getElementById("musicPanelTitle");
    var artistEl = document.getElementById("musicPanelArtist");
    if (!titleEl || !artistEl) return;
    if (window.LRC_META && LRC_META.ti) {
      titleEl.textContent = LRC_META.ti;
      artistEl.textContent = LRC_META.ar || "未知歌手";
    } else {
      var audio = document.getElementById("audio");
      if (audio && audio.src) {
        titleEl.textContent = decodeURIComponent((audio.src.split('/').pop()||'音频').split('?')[0]);
        artistEl.textContent = "本地音频";
      } else {
        titleEl.textContent = "暂无播放歌曲";
        artistEl.textContent = "请先在底部「···」菜单中导入音频和 LRC";
      }
    }
  };
  
  if (!slider || !thumb || !btnText || !btnMusic || !label) return;

  // 切换状态的统一函数
  function setMode(isText) {
    if (isText) {
      document.body.classList.remove("music-mode");
      slider.classList.add("is-text");
      btnText.classList.add("on");
      btnMusic.classList.remove("on");
      label.textContent = "文字模式";
      if(typeof curTab !== "undefined" && curTab === 0) { document.getElementById("pg0").classList.remove("hide"); }
    } else {
      document.body.classList.add("music-mode");
      slider.classList.remove("is-text");
      btnMusic.classList.add("on");
      btnText.classList.remove("on");
      label.textContent = "音乐模式";
      if(window.updateMusicPanel) window.updateMusicPanel();
      if(typeof showPg === "function" && typeof curTab !== "undefined" && curTab === 0) { showPg(0, 0); }
    }
  }

  // 判断当前是否为文字模式
  function isTextMode() { return slider.classList.contains("is-text"); }

  // 拖拽状态变量
  var isDragging = false;
  var hasMoved = false;
  var startX = 0;
  var startTx = 0;

  slider.addEventListener("pointerdown", function(e) {
    if (e.button > 0) return;
    isDragging = true;
    hasMoved = false;
    startX = e.clientX;
    
    // 计算当前位置
    var maxTx = thumb.offsetWidth;
    startTx = isTextMode() ? maxTx : 0;
    
    thumb.style.transition = "none"; // 拖拽时取消动画
    try { slider.setPointerCapture(e.pointerId); } catch(_) {}
  });

  slider.addEventListener("pointermove", function(e) {
    if (!isDragging) return;
    var dx = e.clientX - startX;
    
    // 移动超过3px才算拖动，防止和点击冲突
    if (Math.abs(dx) > 3) hasMoved = true; 

    var maxTx = thumb.offsetWidth;
    var targetTx = startTx + dx;
    
    // 限制在左右边界内
    if (targetTx < 0) targetTx = 0;
    if (targetTx > maxTx) targetTx = maxTx;
    
    thumb.style.transform = "translateX(" + targetTx + "px)";
  });

  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    var moved = hasMoved;
    hasMoved = false; // 复位：拖拽结束后，后续按钮点击不再被误吞
    thumb.style.transition = ""; // 恢复动画

    // 没有拖动：按点击位置切换（指针被捕获后 click 的目标会变成滑块本身，所以在这里直接判断左右半边）
    if (!moved) {
      thumb.style.transform = "";
      if (e && e.type === "pointerup") {
        var r = slider.getBoundingClientRect();
        setMode(e.clientX - r.left > r.width / 2);
      }
      return;
    }

    // 读取拖动后的最终位置
    var style = window.getComputedStyle(thumb);
    var matrix = new DOMMatrixReadOnly(style.transform);
    var currentTx = matrix.m41;
    var maxTx = thumb.offsetWidth;
    
    thumb.style.transform = ""; // 清空行内样式，让 CSS 类接管

    // 吸附判定：超过一半就切换
    if (currentTx > maxTx / 2) {
      if(!isTextMode()) setMode(true);
    } else {
      if(isTextMode()) setMode(false);
    }
  }

  slider.addEventListener("pointerup", endDrag);
  slider.addEventListener("pointercancel", endDrag);

  // 点击图标也支持切换（拖拽时不触发；键盘回车/空格也会走这里）
  btnText.addEventListener("click", function(e) {
    e.stopPropagation();
    if (hasMoved) return; // 如果刚才拖拽过，不响应点击
    setMode(true);
  });
  
  btnMusic.addEventListener("click", function(e) {
    e.stopPropagation();
    if (hasMoved) return;
    setMode(false);
  });

})();

(function(){
  var qFS = document.getElementById("qFadeSpeed");
  if(qFS) {
    qFS.addEventListener("input", function() {
      document.getElementById("qFadeSpeedV").textContent = parseFloat(this.value).toFixed(1) + "s";
    });
  }
})();

(function(){
var H=$('uiH'), S=$('uiS'); if(!H||!S)return;
function upd(){ 
  document.body.classList.toggle('ui-glow', H.checked); 
  document.body.classList.toggle('ui-shadow', S.checked); 
}
/* 高光描边 / 柔和阴影：固定开启，不再提供开关（同时清掉旧版本可能存下的“关闭”状态） */
H.checked=true; S.checked=true;
try{ localStorage.setItem('uiH','1'); localStorage.setItem('uiS','1'); }catch(e){}
H.onchange=S.onchange=function(){ H.checked=true; S.checked=true; upd(); };
upd();
})();

/* ---- 商籁：动效细节面板 → SonnetAdapter.updateConfig ---- */
(function(){
  var box=document.getElementById("sonnetbox"); if(!box)return;
  var els=[].slice.call(box.querySelectorAll("[data-sk]")),pend={},raf=0;
  function A(){return window.SonnetAdapter}
  function hex(n){return "#"+("000000"+((+n>>>0)&0xffffff).toString(16)).slice(-6)}
  function read(el){
    if(el.type==="checkbox")return el.checked;
    if(el.type==="color")return el.value;
    return +el.value/(+el.dataset.scale||1);
  }
  function write(el,v){
    if(v==null)return;
    if(el.type==="checkbox")el.checked=!!v;
    else if(el.type==="color")el.value=hex(v);
    else el.value=Math.round(v*(+el.dataset.scale||1));
    if(typeof sync==="function")try{sync(el)}catch(_){}   // 滑块填充条（若 core.js 有）
  }
  function flush(){
    raf=0;var p=pend;pend={};
    if(A()&&A().updateConfig)A().updateConfig(p);
  }
  function queue(k,v){pend[k]=v;if(!raf)raf=requestAnimationFrame(flush)}   // 每帧最多提交一次
  els.forEach(function(el){
    var ev=el.type==="checkbox"?"change":"input";
    el.addEventListener(ev,function(){queue(el.dataset.sk,read(el))});
  });
  function pull(){
    if(!A()||!A().getConfig)return;
    var c=A().getConfig();
    els.forEach(function(el){write(el,c[el.dataset.sk])});
  }
  var rs=document.getElementById("sonnetReset");
  if(rs)rs.onclick=function(){if(A()&&A().resetConfig){A().resetConfig();pull()}};
  els.forEach(function(el){   // 滑块套上磨砂把手（若全局没统一包过）
    if(el.type==="range"&&typeof wrapRange==="function"&&!(el.parentNode&&el.parentNode.classList.contains("rw")))try{wrapRange(el)}catch(_){}
  });
  pull();   // 读回适配器里（含 localStorage 记忆）的当前值
})();

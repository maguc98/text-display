// app/hub-panel.js — 主面板开关、分层关闭、面板高度把手
/* ===== 面板高度调节把手 ===== */
(function(){
  var dock=document.querySelector('.dock');
  if(!dock)return;
  var bar=document.createElement('div');
  bar.className='resizeBar';
  bar.setAttribute('aria-label','拖动调整卡片高度');
  dock.appendChild(bar);
  var dragging=false,startY=0,startD=0,d=0,nat=0,baseMt=10,minD=0,maxD=0,lastW=window.innerWidth;
  function apply(v){
    d=v;
    if(Math.abs(d)<0.5){reset();return}
    dock.style.setProperty('--dh',(nat+d)+'px');
    dock.style.setProperty('--dm',(baseMt-Math.max(0,d))+'px');
    dock.classList.add('sized');
  }
  function reset(){
    d=0;
    dock.classList.remove('sized');
    dock.style.removeProperty('--dh');
    dock.style.removeProperty('--dm');
  }
  function onDown(e){
    if(e.button>0)return;
    e.preventDefault();
    e.stopPropagation();
    try{bar.setPointerCapture(e.pointerId)}catch(_){}
    dragging=true;
    bar.classList.add('dragging');
    dock.classList.add('resizing');
    startY=e.clientY;
    startD=d;
    if(!dock.classList.contains('sized'))baseMt=parseFloat(getComputedStyle(dock).marginTop)||0;
    var h=dock.offsetHeight;
    nat=h-d;                                   /* 未调节时的自然高度 */
    var r=dock.getBoundingClientRect(),sr=stage.getBoundingClientRect();
    var maxH=Math.max(120,r.bottom-(sr.top+sr.height/2));   /* 顶边最多到预览区一半 */
    maxD=maxH-nat;
    minD=90-nat;
  }
  function onMove(e){
    if(!dragging)return;
    e.preventDefault();
    apply(Math.max(minD,Math.min(maxD,startD+(startY-e.clientY))));   /* 顶边跟手，底边不动 */
  }
  function onUp(e){
    if(!dragging)return;
    dragging=false;
    bar.classList.remove('dragging');
    dock.classList.remove('resizing');
  }
  bar.addEventListener('pointerdown',onDown);
  bar.addEventListener('pointermove',onMove);
  bar.addEventListener('pointerup',onUp);
  bar.addEventListener('pointercancel',onUp);
  bar.addEventListener('contextmenu',function(e){e.preventDefault()});
  window.addEventListener('resize',function(){if(window.innerWidth!==lastW){lastW=window.innerWidth;reset()}});
})();


/* =========================================================
 * 分层关闭：点击空白处时，一次只关掉最上面的一层
 *   删除状态 → 二级菜单（主题 / Q弹 / 各类下拉）→ 主面板
 * 各个弹层原有的「点外面就关」逻辑保持不变；这里只负责：
 * 如果这一次点击已经用来关掉了某个弹层，就不要让同一次点击
 * 顺带把底下的主面板也收起来（点舞台 / 返回键 / 折叠键 / 迷你条）。
 * ========================================================= */
(function() {
  var LAYERS = '#mediaMenu.show,#qpop.show,#stylePop.show,#ddPop.show,#bgPop.show,#zoomPop.show';
  var HUB_CLOSERS = '#stage,#hback,#cfold,#mini';
  var swallowUntil = 0;

  /* window 的捕获阶段比 document 上各弹层自己的监听更早，此时它们还没被关掉，正好用来记录“点击前哪些层是开着的” */
  window.addEventListener('pointerdown', function(e) {
    swallowUntil = 0;                                  /* 每次新的按下都重新判断，避免上一次的标记误伤 */
    var open = document.querySelectorAll(LAYERS);
    if (!open.length) return;
    for (var i = 0; i < open.length; i++) if (open[i].contains(e.target)) return;   /* 点在弹层里面：不算“点外面” */
    swallowUntil = performance.now() + 700;
  }, true);

  window.addEventListener('click', function(e) {
    if (!swallowUntil) return;
    var t = e.target;
    if (performance.now() > swallowUntil) { swallowUntil = 0; return; }
    if (t && t.closest && t.closest(HUB_CLOSERS)) {
      swallowUntil = 0;
      e.stopPropagation(); e.preventDefault();        /* 这一下只用来关弹层，不再关主面板 */
    }
  }, true);
})();

/* =========================================================
 * 主面板（#hub）：从“点击的位置”展开 / 收回，而不是固定从右下角
 * 原理：记录最近一次按下的坐标，面板打开（body.open）时把它换算成
 *       面板自身坐标系里的缩放原点（--hx/--hy），并把起始缩放调小，展开感更明显。
 * ========================================================= */
(function(){
  var hub=document.getElementById("hub");if(!hub)return;
  var st=document.createElement("style");st.id="hubOriginStyle";
  st.textContent=
    '@property --fo{syntax:"<number>";inherits:false;initial-value:100}'+
    'html body #hub{transform-origin:var(--hx,100%) var(--hy,100%)!important}'+
    /* 退出：缩回第一次点击的位置；遮罩从四角向中心慢慢淡掉，最后整体淡出 */
    'html body:not(.open) #hub{transform:scale(.12)!important;--fo:-35;'+
      '-webkit-mask-image:radial-gradient(circle farthest-corner at 50% 50%,#000 calc(var(--fo)*1%),transparent calc(var(--fo)*1% + 35%));'+
      'mask-image:radial-gradient(circle farthest-corner at 50% 50%,#000 calc(var(--fo)*1%),transparent calc(var(--fo)*1% + 35%));'+
      'transition:transform calc(.65s/var(--ui-spd,1)/var(--hub-spd,1)) cubic-bezier(.55,0,.25,1),--fo calc(.6s/var(--ui-spd,1)/var(--hub-spd,1)) cubic-bezier(.4,0,.8,.6),opacity calc(.15s/var(--ui-spd,1)/var(--hub-spd,1)) linear calc(.5s/var(--ui-spd,1)/var(--hub-spd,1)),visibility 0s linear calc(.68s/var(--ui-spd,1)/var(--hub-spd,1))!important}'+
    'html body.open #hub{--fo:100;-webkit-mask-image:none;mask-image:none;transition:transform calc(.7s/var(--ui-spd,1)/var(--hub-spd,1)) var(--spring-pop,cubic-bezier(.32,.72,0,1)),opacity calc(.22s/var(--ui-spd,1)/var(--hub-spd,1)) ease,visibility 0s!important}'+
    '@media (prefers-reduced-motion:reduce){html body:not(.open) #hub{transform:none!important;-webkit-mask-image:none;mask-image:none;transition:opacity calc(.2s/var(--ui-spd,1)/var(--hub-spd,1)) linear,visibility 0s linear calc(.2s/var(--ui-spd,1)/var(--hub-spd,1))!important}}';
  document.head.appendChild(st);
  /* 收起：面板被遮罩淡出后，视觉上"最后留下的一点"是面板自身的中心，
     所以不能只把缩放原点放在按钮上（那样中心只会靠近按钮 88%，永远停在左上角一点点）。
     改为：以面板中心缩放，再整体平移 (--tx,--ty)，让中心正好落在设置按钮中心。 */
  var st2=document.createElement("style");st2.id="hubCloseToGearStyle";
  st2.textContent='html body.hubClosing:not(.open) #hub#hub{transform-origin:50% 50%!important;'+
    'transform:translate(var(--tx,0px),var(--ty,0px)) scale(.12)!important}'+
    '@media (prefers-reduced-motion:reduce){html body.hubClosing:not(.open) #hub#hub{transform:none!important}}';
  document.head.appendChild(st2);
  var pt=null;
  window.addEventListener("pointerdown",function(e){pt={x:e.clientX,y:e.clientY,t:performance.now()}},true);
  function setOrigin(){
    var x,y;
    if(pt&&performance.now()-pt.t<1500){x=pt.x;y=pt.y}
    else{var m=document.getElementById("mini");var r=m?m.getBoundingClientRect():null;
      x=r?r.left+r.width/2:window.innerWidth-40;y=r?r.top+r.height/2:window.innerHeight-40}
    var L=hub.offsetLeft,T=hub.offsetTop;                 /* fixed 定位：相对视口，不受 scale 影响 */
    hub.style.setProperty("--hx",(x-L).toFixed(1)+"px");
    hub.style.setProperty("--hy",(y-T).toFixed(1)+"px");
  }
  /* 收起：统一缩回「设置」按钮的位置（不再跟着最后一次点击的位置走） */
  function setOriginToGear(){
    var g=document.getElementById("miSet"),x,y,r=g?g.getBoundingClientRect():null;
    if(r&&r.width>0){x=r.left+r.width/2;y=r.top+r.height/2}
    else{x=window.innerWidth-12-26;y=window.innerHeight-11-26}
    var cx=hub.offsetLeft+hub.offsetWidth/2,cy=hub.offsetTop+hub.offsetHeight/2;   /* 面板中心（布局位置，不受 transform 影响） */
    hub.style.setProperty("--tx",(x-cx).toFixed(1)+"px");
    hub.style.setProperty("--ty",(y-cy).toFixed(1)+"px");
    return true;
  }
  var was=document.body.classList.contains("open"),closeT=0;
  new MutationObserver(function(){
    var now=document.body.classList.contains("open");
    if(now&&!was){clearTimeout(closeT);document.body.classList.remove("hubClosing");setOrigin()}
    else if(!now&&was){
      setOriginToGear();
      /* 个别代码路径会在收起瞬间又写一次原点：下一帧和 60ms 后各再覆盖一次，始终以设置按钮为准 */
      requestAnimationFrame(setOriginToGear);setTimeout(setOriginToGear,60);
      /* 面板缩完消失之后，设置按钮才弹出来（CSS 里 body.hubClosing 给按钮加延迟） */
      document.body.classList.add("hubClosing");
      clearTimeout(closeT);closeT=setTimeout(function(){document.body.classList.remove("hubClosing")},hubT(1300));
    }
    was=now;
  }).observe(document.body,{attributes:true,attributeFilter:["class"]});
})();

/* =========================================================
 * 主面板（#hub）的毛玻璃：独立层 #hubGlass，与 #hub 用同一套 CSS 过渡（见 style.css 末尾）
 * 玻璃不做 opacity 过渡到半透明的"祖先"，也不带 mask，所以 backdrop-filter 全程有效；
 * 位置 / 缩放 / 时长 / 缓动与 #hub 完全相同，两者都由合成器驱动，不再靠 JS 逐帧追（会慢半拍）。
 * JS 只做三件事：同步布局盒（left/top/width/height/圆角，仅在尺寸变化时）、
 * 把 #hub 上的缩放原点变量（--hx --hy --tx --ty）抄给玻璃层。
 * ========================================================= */
(function(){
  var hub=document.getElementById("hub");if(!hub||!hub.parentNode)return;
  var g=document.createElement("div");g.id="hubGlass";hub.parentNode.insertBefore(g,hub);
  /* 位置：完全交给 CSS（#hubGlass 的 right / bottom 与 #hub 的写法一致），JS 不再读写 right / bottom ——
     上一版把 getComputedStyle(hub).right/bottom 抄过去，WebKit 上取到的不是像素值，玻璃层就掉到了左上角。
     尺寸：取 #hub 的屏幕矩形，除以它当前的 transform 缩放，得到不受动画影响的小数布局尺寸
     （offsetWidth / offsetHeight 会取整，让玻璃层比面板多出或少不到 1px）。 */
  function box(){
    var cs=getComputedStyle(hub),r=hub.getBoundingClientRect(),w=hub.offsetWidth,h=hub.offsetHeight;
    var m=null;
    try{if(cs.transform&&cs.transform!=="none")m=new DOMMatrix(cs.transform)}catch(_){m=null}
    var sx=m?Math.hypot(m.a,m.b):1,sy=m?Math.hypot(m.c,m.d):1;
    if(sx>0.05&&sy>0.05&&r.width>0&&r.height>0){
      var fw=r.width/sx,fh=r.height/sy;
      if(Math.abs(fw-w)<=1.5&&Math.abs(fh-h)<=1.5){w=fw;h=fh}   /* 只接受与取整值相差不到 1.5px 的结果，其余一律回退到 offset 值 */
    }
    g.style.width=w+"px";g.style.height=h+"px";
    g.style.borderRadius=cs.borderTopLeftRadius;
  }
  function vars(){
    ["--hx","--hy","--tx","--ty"].forEach(function(k){
      var v=hub.style.getPropertyValue(k);
      if(v)g.style.setProperty(k,v);else g.style.removeProperty(k);
    });
  }
  new MutationObserver(function(){vars()}).observe(hub,{attributes:true,attributeFilter:["style"]});
  if(window.ResizeObserver)new ResizeObserver(function(){box()}).observe(hub);
  window.addEventListener("resize",function(){box()});
  /* 打开瞬间再校一次：此时 #hub 可能刚被其它脚本改过尺寸 */
  new MutationObserver(function(){box();vars()}).observe(document.body,{attributes:true,attributeFilter:["class"]});
  box();vars();
})();


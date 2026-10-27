// app/utils.js — 通用算法、控件工具、range 初始化、PopFX

function chips(box,list,get,set){
  list.forEach(function(e){var b=document.createElement("button");b.className="chip";b.textContent=e[1];b.onclick=function(){set(e[0]);mark()};box.appendChild(b)});
  function mark(){[].forEach.call(box.children,function(c,i){c.classList.toggle("on",list[i][0]===get())})}
  mark();
}
function glide(box){
  var CH=[].slice.call(box.children),S={x:0,v:0,tx:0,s:1,sv:0,ts:1,last:0,run:false,drag:false},dragging=false,lastX=0;
  box.classList.add("glide");
  function curK(){for(var k=0;k<CH.length;k++)if(CH[k].classList.contains("on"))return k;return -1}
  function nearest(x){var best=0,bd=1e9;CH.forEach(function(c,k){var d=Math.abs(c.offsetLeft+c.offsetWidth/2-x);if(d<bd){bd=d;best=k}});return best}
  function hl(k){CH.forEach(function(c,j){c.classList.toggle("hl",j===k)})}
  function draw(){var st=0;
    box.style.setProperty("--tx",S.x.toFixed(2)+"px");
    box.style.setProperty("--sx",(S.s*(1+st)).toFixed(4));box.style.setProperty("--sy",(S.s*(1-st*.5)).toFixed(4))}
  function frame(t){
    var dt0=Math.min(.032,Math.max(.001,(t-S.last)/1000))*UISPD;S.last=t;
var _n=Math.max(1,Math.ceil(dt0/.032)),dt=dt0/_n;
for(var _i=0;_i<_n;_i++){
    if(S.drag){S.x=S.tx;S.v=0}
  else{var k=300,c=qC(15,300);S.v+=(-k*(S.x-S.tx)-c*S.v)*dt;S.x+=S.v*dt}
    var lo=CH[0].offsetLeft-2,hi=CH[CH.length-1].offsetLeft+2;
    if(S.x<lo){S.x=lo;if(S.v<0)S.v=-S.v*.5}else if(S.x>hi){S.x=hi;if(S.v>0)S.v=-S.v*.5}
    S.sv+=(-320*(S.s-S.ts)-qC(15,320)*S.sv)*dt;S.s+=S.sv*dt;
}
draw();
    if(!S.drag&&Math.abs(S.x-S.tx)<.15&&Math.abs(S.v)<6&&Math.abs(S.s-S.ts)<.002&&Math.abs(S.sv)<.08){
      S.x=S.tx;S.v=0;S.s=S.ts;S.sv=0;S.run=false;draw();return}
    requestAnimationFrame(frame);
  }
  function kick(){if(!S.run){S.run=true;S.last=performance.now();requestAnimationFrame(frame)}}
  function put(k,snap){
    var c=CH[k];if(!c||!c.offsetWidth)return;
    box.style.setProperty("--tw",c.offsetWidth+"px");S.tx=c.offsetLeft;
    if(snap){S.x=S.tx;S.v=0;S.s=S.ts=1;S.sv=0;draw()}else kick();
  }
  function fx(e){var r=box.getBoundingClientRect(),w=CH[0].offsetWidth,pad=CH[0].offsetLeft;
    return Math.max(pad+w/2,Math.min(r.width-pad-w/2,e.clientX-r.left))}
  function grab(e){var x=fx(e);lastX=x;S.drag=true;S.tx=x-CH[0].offsetWidth/2;hl(nearest(x));kick()}
  box.addEventListener("click",function(e){if(e.detail>0)e.stopImmediatePropagation()},true);
  box.addEventListener("pointerdown",function(e){
    if(e.button>0)return;
    try{box.setPointerCapture(e.pointerId)}catch(_){}
    dragging=true;S.ts=1;box.classList.add("pressing");
    box.style.setProperty("--tw",CH[0].offsetWidth+"px");grab(e);
  });
  box.addEventListener("pointermove",function(e){if(dragging)grab(e)});
  box.addEventListener("contextmenu",function(e){e.preventDefault()});
  function end(e){
    if(!dragging)return;dragging=false;
    var k=nearest(e.type==="pointercancel"?lastX:fx(e));
    S.drag=false;S.ts=1;box.classList.remove("pressing");hl(-1);
    if(k!==curK())CH[k].click();
    put(k);
  }
  box.addEventListener("pointerup",end);box.addEventListener("pointercancel",end);
  new MutationObserver(function(){if(!dragging)put(curK())}).observe(box,{attributes:true,subtree:true,attributeFilter:["class"]});
  new ResizeObserver(function(){if(!dragging)put(curK(),true)}).observe(box);
}
/* ---- 弹层统一：定位 + 动画（动画样式 / 功能下拉 / 背景·放大气泡 共用） ----
   定位：优先放下方，放不下翻到上方；都放不下选空间大的一侧并限高滚动；
         左右夹在屏幕内（含刘海安全区）；--ox/--oy 让缩放从触发按钮处长出来。
   动画：弹性缩放 + 轻微位移 + 淡入，网格项逐个错落进入；已打开时换锚点会平滑滑过去；
         关闭时快速淡出；尊重“减少动态效果”。 */
var PopFX=(function(){
  var CSS=[
  'html .pfx{scale:1!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;',
    'transform:translate3d(0,var(--dy,0px),0) scale(.6)!important;transform-origin:var(--ox,50%) var(--oy,0%)!important;',
    'transition:opacity calc(.14s/var(--ui-spd,1)) ease,transform calc(.16s/var(--ui-spd,1)) cubic-bezier(.4,0,1,1),visibility 0s linear calc(.16s/var(--ui-spd,1))!important}',
  'html .pfx.down,html .pfx.up{--dy:0px}',
  'html .pfx.show{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important;will-change:transform,opacity;',
    'transition:opacity calc(.18s/var(--ui-spd,1)) ease,transform calc(.36s/var(--ui-spd,1)) var(--spring,cubic-bezier(.32,.72,0,1)),visibility 0s!important}',
  'html .pfx.show.pfx-move{transition:opacity calc(.18s/var(--ui-spd,1)) ease,transform calc(.36s/var(--ui-spd,1)) var(--spring,cubic-bezier(.32,.72,0,1)),',
    'left calc(.26s/var(--ui-spd,1)) cubic-bezier(.3,.8,.3,1),top calc(.26s/var(--ui-spd,1)) cubic-bezier(.3,.8,.3,1),visibility 0s!important}',
  'html .pfx.pfx-in button[role="option"]{animation:pfxItem calc(.34s/var(--ui-spd,1)) var(--spring,cubic-bezier(.32,.72,0,1)) backwards;animation-delay:calc(var(--i,0)*calc(16ms/var(--ui-spd,1)) + calc(50ms/var(--ui-spd,1)))}',
  '@keyframes pfxItem{from{opacity:0;transform:translate3d(0,7px,0) scale(.93)}}',
  '@media (prefers-reduced-motion:reduce){html .pfx,html .pfx.show{transition:opacity calc(.01s/var(--ui-spd,1)) linear,visibility 0s linear calc(.01s/var(--ui-spd,1))!important;transform:none!important}',
    'html .pfx.pfx-in button[role="option"]{animation:none}}'
  ].join('');
  var st=document.createElement("style");st.id="popFxStyle";st.textContent=CSS;document.head.appendChild(st);

  /* 记录最近一次按下的位置：动画从“真正点击的地方”展开 */
  var lastPt=null;
  window.addEventListener("pointerdown",function(e){lastPt={x:e.clientX,y:e.clientY,t:performance.now(),el:e.target}},true);
  function clickPoint(anchor){
    if(lastPt&&performance.now()-lastPt.t<1500&&lastPt.el&&anchor.contains(lastPt.el))return {x:lastPt.x,y:lastPt.y};
    return null;
  }
  /* 安全区（刘海 / 底部横条）：用探针元素读 env() */
  var probe;
  function insets(){
    if(!probe){probe=document.createElement("div");
      probe.style.cssText="position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
      document.body.appendChild(probe)}
    var cs=getComputedStyle(probe);
    return {t:parseFloat(cs.paddingTop)||0,r:parseFloat(cs.paddingRight)||0,b:parseFloat(cs.paddingBottom)||0,l:parseFloat(cs.paddingLeft)||0};
  }
  /* 第一次加 pfx 时不要触发过渡，否则“无→缩小”和“缩小→展开”会互相抵消，看不到缩放 */
  function ensure(pop){
    if(pop.classList.contains("pfx"))return;
    pop.style.setProperty("transition","none","important");
    pop.classList.add("pfx");void pop.offsetWidth;
    pop.style.removeProperty("transition");
  }
  function pick(su,sd,full,byRoom,preferUp){
    if(byRoom)return su>=sd;
    if(preferUp){if(su>=full+12)return true;if(sd>=full+12)return false}
    else{if(sd>=full+12)return false;if(su>=full+12)return true}
    return su>sd;
  }
  /* o: inner(内部滚动区) maxH width gap reserveTop reserveBottom byRoom preferUp bottomAnchor */
  function place(pop,anchor,o){
    o=o||{};
    ensure(pop);
    var wasShown=pop.classList.contains("show");
    pop.classList.toggle("pfx-move",wasShown);          /* 已打开时换锚点：位置平滑过渡 */
    var r=anchor.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight,ins=insets();
    if(!r.width&&!r.height)r={left:vw/2,right:vw/2,top:vh/2,bottom:vh/2,width:0,height:0};
    var gap=o.gap==null?12:o.gap,maxH=o.maxH||440,
        rt=Math.max(o.reserveTop==null?62:o.reserveTop,ins.t+16),      /* 上方留给顶栏 */
        rb=Math.max(o.reserveBottom==null?132:o.reserveBottom,ins.b+16),/* 下方留给“正在播放”条 */
        su=r.top-gap-rt,sd=vh-r.bottom-gap-rb,pw=o.width||pop.offsetWidth,inner=o.inner,up,h;
    if(inner){
      inner.style.maxHeight="none";
      var chrome=pop.offsetHeight-inner.offsetHeight,full=Math.min(maxH,inner.scrollHeight+chrome);
      up=pick(su,sd,full,o.byRoom,o.preferUp);
      h=Math.max(96,Math.min(maxH-chrome,Math.max(110,up?su:sd)-12-chrome));
      inner.style.maxHeight=h+"px";
    }else{
      pop.style.maxHeight="";
      up=pick(su,sd,Math.min(pop.scrollHeight,maxH),o.byRoom,o.preferUp);
      h=Math.min(maxH,Math.max(160,(up?su:sd)-12));
      pop.style.maxHeight=h+"px";
    }
    var ph=pop.offsetHeight,cx=r.left+r.width/2,
        left=Math.max(ins.l+8,Math.min(vw-ins.r-pw-8,cx-pw/2));
    pop.style.left=left+"px";
    if(o.bottomAnchor&&up){pop.style.top="auto";pop.style.bottom=(vh-r.top+gap)+"px"}
    else{pop.style.bottom="auto";pop.style.top=Math.max(ins.t+8,up?r.top-gap-ph:r.bottom+gap)+"px"}
    var topPx=parseFloat(pop.style.top),
        pt=clickPoint(anchor)||(wasShown&&pop._pt)||{x:cx,y:(r.top+r.bottom)/2};
    pop._pt=pt;
    if(isNaN(topPx))topPx=vh-parseFloat(pop.style.bottom)-ph;          /* 底部锚定时换算出 top */
    pop.style.setProperty("--ox",(pt.x-left).toFixed(1)+"px");           /* 缩放原点 = 点击位置 */
    pop.style.setProperty("--oy",(pt.y-topPx).toFixed(1)+"px");
    pop.classList.toggle("up",up);pop.classList.toggle("down",!up);
    return {up:up,h:h,left:left};
  }
  function show(pop){
    ensure(pop);
    var bs=pop.querySelectorAll('button[role="option"]');
    for(var i=0;i<bs.length;i++)bs[i].style.setProperty("--i",Math.min(i*.55,7).toFixed(2));
    pop.classList.add("pfx-in","show");pop.setAttribute("aria-hidden","false");
  }
  function hide(pop){
    pop.classList.remove("show","pfx-in","pfx-move");pop.setAttribute("aria-hidden","true");
  }
  return {place:place,show:show,hide:hide};
})();

function rnd(a){return ((Math.random()-.5)*a).toFixed(0)}
function pol(A){var a=Math.random()*6.2832,d=(150+Math.random()*250)*A;return [Math.cos(a)*d,Math.sin(a)*d]}
function raf1(fn){var q=0;return function(){if(q)return;q=requestAnimationFrame(function(){q=0;fn()})}}
function wrapRange(el){if(el.parentNode&&el.parentNode.className==="rw")return;var w=document.createElement("i");w.className="rw";el.parentNode.insertBefore(w,el);w.appendChild(el);var g=document.createElement("i");g.className="gt";w.appendChild(g)}
function paintRange(el,f){el.style.setProperty("--p",(f*100)+"%");el.style.setProperty("--f",f);if(el.parentNode)el.parentNode.style.setProperty("--f",f)}
/* 滑块：手指拖动时 1:1 跟手（不加任何缓动，避免拖拽发黏）；
   代码改值 / 键盘步进 / 恢复默认时，用 iOS 减速曲线平滑过渡，不再瞬间跳变 */
function sync(el){
  wrapRange(el);
  var f=(el.value-el.min)/(el.max-el.min);
  var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches;
  if(el._raf){cancelAnimationFrame(el._raf);el._raf=0}
  if(el._drag||typeof el._f!=="number"||reduce||Math.abs(f-el._f)<.004){paintRange(el,f);el._f=f;return}
  var f0=el._f,t0=performance.now(),D=(typeof uiT==="function"?uiT(380):380);
  (function step(now){
    var t=Math.min(1,(now-t0)/D),e=1-Math.pow(1-t,4);   /* easeOutQuart ≈ iOS 减速 */
    var v=f0+(f-f0)*e;paintRange(el,v);el._f=v;
    if(t<1)el._raf=requestAnimationFrame(step);else{el._raf=0;el._f=f}
  })(t0);
}
document.addEventListener("pointerdown",function(e){var t=e.target;if(t&&t.matches&&t.matches("input[type=range]"))t._drag=true},true);
["pointerup","pointercancel"].forEach(function(n){document.addEventListener(n,function(){[].forEach.call(document.querySelectorAll("input[type=range]"),function(r){if(r._drag){r._drag=false;if(r._raf){cancelAnimationFrame(r._raf);r._raf=0}var f=(r.value-r.min)/(r.max-r.min);paintRange(r,f);r._f=f}})},true)});
/* ---- 动画：统一采用 iOS 弹簧曲线驱动 --spring / --spring-pop（已无 Q弹幅度设置）---- */
var QAMP=1;
function qC(c0,k){var a=(typeof QAMP==="number")?QAMP:1;if(a>=1)return c0/a;return c0+(2*Math.sqrt(k)-c0)*(1-a)}
function springCurve(a){return iosSpring(a,.08)}  /* 全局 --spring：同一套 iOS 弹簧，阻尼略高（更稳） */
/* iOS 风格弹簧（UISpringTimingParameters 同款物理模型）：
   起步速度快、中段平滑减速、尾部极轻回弹后安静落定。
   阻尼比 ζ 随「Q弹幅度」变化：100% ≈ 0.70（过冲约 4.6%），0% ≈ 0.88（几乎无过冲），
   200% ≈ 0.52。用 linear() 采样 64 点，肉眼是连续的非线性曲线。 */
function iosSpring(a,extraZ){
  var ok=window.CSS&&CSS.supports&&CSS.supports("transition-timing-function","linear(0,1)");
  if(!ok)return "cubic-bezier(.32,.72,0,1)";            /* iOS 系统转场曲线，无过冲 */
  if(a<=.02)return "cubic-bezier(.32,.72,0,1)";
  var z=Math.min(.97,Math.max(.4,.92+(extraZ||0)-.18*a)),
      w=6.4/z,                                         /* 归一化时长内衰减到 ≈0.2% */
      wd=w*Math.sqrt(1-z*z),k=z/Math.sqrt(1-z*z),N=64,pts=[];
  for(var i=0;i<=N;i++){
    var t=i/N,v=1-Math.exp(-z*w*t)*(Math.cos(wd*t)+k*Math.sin(wd*t));
    pts.push(i===N?"1":(+v.toFixed(4)).toString());
  }
  return "linear("+pts.join(", ")+")";
}
function applySpring(a){
  QAMP=a;
  var root=document.documentElement.style;
  /* 面板类弹层：--spring-pop（阻尼稍低，轻微回弹）；全局按钮/卡片/菜单：--spring（阻尼稍高）。
     两者都是 iOS 弹簧，始终写入，不再在 100% 时移除而退回默认 ease（那是顿挫感的来源之一） */
  root.setProperty("--spring-pop",iosSpring(a));
  var c=springCurve(a);root.setProperty("--spring",c);window.__spring=c;
}
applySpring(1);   /* Q弹幅度滑块已移除：统一固定为 iOS 弹簧 */
try{localStorage.removeItem("qamp")}catch(_){}

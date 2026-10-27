// app/stage.js — 底栏导航、全屏切换
/* ---- 折叠面板 / 全屏自动隐藏 ---- */
$("cfold").onclick=function(){
  var self=this;
  if(self._animating)return; // 防抖，防止连点
  self._animating=true;
  var body=document.body,st=$("statbar"),dock=document.querySelector(".dock"),nav=$("lg"),
      folding=!body.classList.contains("pc");
  /* 画面 / 状态栏：FLIP 位移 + 柔和弹簧（回弹取当前 Q弹幅度的一半，避免冲出屏幕） */
  function moveStage(){
    var f1=stage.getBoundingClientRect(),s1=st.getBoundingClientRect();
    body.classList.toggle("pc");
    var f2=stage.getBoundingClientRect(),s2=st.getBoundingClientRect();
    var ez=springCurve(Math.min(QAMP,1.4)*.5),opt={duration:uiT(700),easing:ez},
        ds=f1.top-f2.top,dt=s1.top-s2.top;
    if(Math.abs(ds)>1)stage.animate([{transform:"translateY("+ds+"px)"},{transform:"none"}],opt);
    if(Math.abs(dt)>1)st.animate([{transform:"translateY("+dt+"px)"},{transform:"none"}],opt);
    return {ez:ez,ds:ds};
  }
  function done(){self._animating=false}
  if(folding){
    /* 收起：面板和底栏先淡出下沉，再切换布局，画面弹到居中 */
    var outs=[dock,nav].map(function(el,i){
      return el.animate([{opacity:1,transform:"none"},{opacity:0,transform:"translateY(36px)"}],{duration:uiT(240),delay:uiT(i*30),easing:"cubic-bezier(.4,0,1,1)",fill:"forwards"});
    });
    outs[1].onfinish=function(){
      moveStage();
      outs.forEach(function(a){a.cancel()});
      setTimeout(done,uiT(720));
    };
  }else{
    /* 展开：布局一次到位，画面上移的同时，面板和底栏跟在后面淡入、弹起 */
    var r=moveStage(),base=Math.max(0,r.ds);
    [dock,nav].forEach(function(el,i){
      var dly=uiT(50+i*60),dy=base+40+i*24;
      el.animate([{opacity:0},{opacity:1}],{duration:uiT(380),delay:dly,easing:"ease-out",fill:"backwards"});
      el.animate([{transform:"translateY("+dy+"px)"},{transform:"none"}],{duration:uiT(760),delay:dly,easing:r.ez,fill:"backwards"});
    });
    setTimeout(done,uiT(900));
  }
};
var curTab=0,navs=document.querySelectorAll(".nb"),POS={3:0,1:1,2:2,0:3};
function showPg(i,dir){
  if(typeof updateMusicPanel === "function") updateMusicPanel();
  for(var k=0;k<5;k++){
    var e=$("pg"+k);
    if(k===i){
      clearTimeout(e._t);clearTimeout(e._g);
      e.classList.remove("leave","hide","go");
      e.style.setProperty("--dx",(18*dir)+"px");
      void e.offsetWidth;
      e.classList.add("go");
      (function(el){el._g=setTimeout(function(){el.classList.remove("go")},uiT(400))})(e);
    }else{
      e.classList.remove("leave");
      e.classList.add("hide");
    }
  }
  $("panel").scrollTop=0;
}
var lgEl=$("lg"),thumb=$("thumb"),NB=[].slice.call(navs),dragging=false;
var T={x:0,v:0,tx:0,s:1,sv:0,ts:1,last:0,run:false,drag:false,d:0};
function curK(){for(var k=0;k<NB.length;k++)if(+NB[k].dataset.i===curTab)return k;return 0}
function nearest(x){var best=0,bd=1e9;NB.forEach(function(b,k){var d=Math.abs(b.offsetLeft+b.offsetWidth/2-x);if(d<bd){bd=d;best=k}});return best}
function mark(k){NB.forEach(function(c,j){c.classList.toggle("on",j===k)})}
function choose(k){
  document.body.classList.remove("pc");
  mark(k);var i=+NB[k].dataset.i;if(i===curTab)return;
  var dir=POS[i]>POS[curTab]?1:-1;curTab=i;showPg(i,dir);
}
/* 弹簧物理：位置 + 缩放 + 速度拉伸，松手后自然衔接 */
function draw(){
  var st=0;
  thumb.style.translate=T.x.toFixed(2)+"px 0";
  thumb.style.scale=(T.s*(1+st)).toFixed(4)+" "+(T.s*(1-st*.65)).toFixed(4);
}
function frame(t){
  var dt0=Math.min(.032,Math.max(.001,(t-T.last)/1000))*UISPD;T.last=t;
var _n=Math.max(1,Math.ceil(dt0/.032)),dt=dt0/_n;
for(var _i=0;_i<_n;_i++){
if(T.drag){T.x=T.tx;T.v=0}
  else{var k=340,c=qC(12,340);T.v+=(-k*(T.x-T.tx)-c*T.v)*dt;T.x+=T.v*dt}
  /* 撞墙回弹：冲到底栏两端时被"弹回"，保留强回弹但不会飞出去 */
  var lo=bx(0)-2,hi=bx(NB.length-1)+2;
  if(T.x<lo){T.x=lo;if(T.v<0)T.v=-T.v*.7}else if(T.x>hi){T.x=hi;if(T.v>0)T.v=-T.v*.7}
  T.sv+=(-420*(T.s-T.ts)-qC(11,420)*T.sv)*dt;T.s+=T.sv*dt;
}

  draw();
  if(!T.drag&&Math.abs(T.x-T.tx)<.15&&Math.abs(T.v)<6&&Math.abs(T.s-T.ts)<.002&&Math.abs(T.sv)<.08){
    T.x=T.tx;T.v=0;T.s=T.ts;T.sv=0;T.run=false;draw();return;
  }
  requestAnimationFrame(frame);
}
function kick(){if(!T.run){T.run=true;T.last=performance.now();requestAnimationFrame(frame)}}
function bx(k){return NB[k].offsetLeft+lgEl.querySelector(".lg-btns").offsetLeft}
function putThumb(k,snap){
  thumb.style.setProperty("--w",NB[k].offsetWidth+"px");
  T.tx=bx(k);
  if(snap){T.x=T.tx;T.v=0;T.s=T.ts=1;T.sv=0;draw()}else{T.d=Math.abs(T.tx-T.x)+Math.abs(T.v)*.1;kick()}
}
function release(k){T.drag=false;T.ts=1;thumb.classList.remove("press");putThumb(k)}
var lastX=0, downX=0, isMoved=false;
function fx(e){var r=lgEl.getBoundingClientRect(),n=NB.length-1,c0=bx(0)+NB[0].offsetWidth/2,c1=bx(n)+NB[n].offsetWidth/2;
  return Math.max(c0,Math.min(c1,e.clientX-r.left))}
function grab(e){
  var x=fx(e),k=nearest(x),w=NB[k].offsetWidth;
  lastX=x;T.drag=true;thumb.style.setProperty("--w",w+"px");T.tx=x-w/2;mark(k);kick();
}
lgEl.addEventListener("pointerdown",function(e){
  if(e.button>0)return;
  try{lgEl.setPointerCapture(e.pointerId)}catch(_){}
  dragging=true;
  downX=e.clientX;
  isMoved=false;
  T.ts=1;
  // 按下时不立刻改变滑块位置，等待是否为拖拽的判定
});
lgEl.addEventListener("pointermove",function(e){
  if(!dragging)return;
  // 移动超过 8px 才判定为拖拽跟手
  if(!isMoved && Math.abs(e.clientX - downX) > 8){
    isMoved = true;
    thumb.classList.add("press");
    thumb.style.setProperty("--w",NB[0].offsetWidth+"px");
    grab(e);
  }
  if(isMoved) grab(e);
});
lgEl.addEventListener("contextmenu",function(e){e.preventDefault()});
function endDrag(e){
  if(!dragging)return;
  dragging=false;
  var k;
  if(!isMoved){
    // 如果是纯点击，直接计算目标位置，让 release(k) 里的弹簧动画接管
    k = nearest(e.type==="pointercancel"?downX:fx(e));
  } else {
    k = nearest(e.type==="pointercancel"?lastX:fx(e));
  }
  choose(k);
  release(k);
}
lgEl.addEventListener("pointerup",endDrag);
lgEl.addEventListener("pointercancel",endDrag);
NB.forEach(function(b,k){b.onclick=function(e){if(e.detail===0){choose(k);release(k)}}});
window.addEventListener("resize",function(){putThumb(curK(),true)});
(function(){var k=curK();mark(k);putThumb(k,true)})();
showPg(0,1);

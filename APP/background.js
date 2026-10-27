// app/background.js — 背景渲染、裁剪
function applyPreset(i){var c=THEMES[i][1];["c1","c2","c3","c4"].forEach(function(id,k){$(id).value=c[k]})}
function applyBg(){
  var bg=$("bg"),dv=$("dimv"),img=bgMode==="img"&&imgData;
  bg.style.cssText="";
  $("stage").classList.remove("bgsq");
  if(bgMode==="solid"){}
  else if(img){
    /* #bgf：同一张图 cover 铺满 + 高斯模糊，作为底 */
    $("bgf").style.backgroundImage="url('"+imgData+"')";
    $("bgf").style.backgroundSize="cover";
    $("bgf").style.backgroundPosition="center";
    $("stage").classList.add("hasimg");
    /* #bg：清晰层 */
    bg.style.backgroundImage="url('"+imgData+"')";
    if(window.isBgSquare){
      /* 1:1：原图居中完整显示，不裁切；空出的部分由 #bgf 的模糊图填满 */
      $("stage").classList.add("bgsq");
      bg.style.backgroundSize="contain";
      bg.style.backgroundRepeat="no-repeat";
      bg.style.backgroundPosition="center";
      bg.style.inset="0";
      bg.style.filter="blur("+$("imgBlur").value+"px)";
    }else{
      /* 屏幕比例：保持原来的全屏铺满 */
      bg.style.backgroundSize="cover";
      bg.style.backgroundPosition="center";
      bg.style.inset="-40px";
      bg.style.filter="blur("+$("imgBlur").value+"px)";
    }
    dv.style.background="rgba(0,0,0,"+($("imgDim").value/100)+")";
  }else{
    var cs=["c1","c2","c3","c4"].map(function(id){return $(id).value});
    bg.style.backgroundImage="linear-gradient("+$("ang").value+"deg,"+cs.join(",")+")";
    if($("gflow").checked){bg.style.backgroundSize="300% 300%";bg.style.animation="gflow 14s ease infinite"}
    dv.style.background="none";
    $("bgf").style.backgroundImage="none";$("stage").classList.remove("hasimg");
  }
  if(bgMode==="solid"){
    bg.style.cssText="";bg.style.backgroundColor=$("solidc").value;dv.style.background="none";
    $("bgf").style.backgroundImage="none";$("stage").classList.remove("hasimg");
  }
  $("noimg").classList.toggle("hide",!(bgMode==="img"&&!imgData));
// 【新增】计算颜色亮度的函数
    function lum(h){
      h=String(h).replace("#","");
      if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      return (0.299*parseInt(h.substr(0,2),16)+0.587*parseInt(h.substr(2,2),16)+0.114*parseInt(h.substr(4,2),16))/255;
    }
    
    var amb=$("amb");
    var autoTc=false;
    
    if($("glbOn").checked){
      amb.style.backgroundImage="none";
      amb.style.backgroundColor=$("glbC").value;
      amb.style.filter="none";
      document.body.style.background=$("glbC").value;
      autoTc = lum($("glbC").value) > 0.62; // 检测自定义颜色是不是浅色
    }else{
      amb.style.backgroundImage=(bgMode==="solid")?"none":bg.style.backgroundImage;
      amb.style.backgroundColor=(bgMode==="solid")?$("solidc").value:"";
      amb.style.filter="blur(46px) saturate(1.6) brightness(.72)";
      document.body.style.background="";
      if(bgMode==="solid") autoTc = lum($("solidc").value) > 0.62; // 检测纯色模式是不是浅色
    }
    
    // 【核心】根据背景颜色深浅，给整个页面 body 加上 light-bg 类名
    if(typeof pgData!=="undefined"&&pgData&&$("pgOn").checked)autoTc=pgLum>0.62;
    document.body.classList.toggle("light-bg", autoTc);
  }
["c1","c2","c3","c4","ang","gflow","imgBlur","imgDim","fg","solidc","glbC","glbOn"].forEach(function(id){$(id).addEventListener("input",applyBgRaf);$(id).addEventListener("change",function(){reqBg(false)})});
/* ---- 1:1 裁剪器：拖动选位置，双指/滚轮/滑杆缩放 ---- */
var openCrop=(function(){
  var ov=$("crop"),area=$("carea"),cv=$("cimg"),fr=$("cframe"),z=$("cz"),done=null,ratio=1,maxOut=1400,currentRatioMode="1";
  var ttl=ov.querySelector(".crop-title"),sub=ov.querySelector(".crop-sub"),ttl0=ttl.textContent,sub0=sub.textContent;
  var S={w:0,h:0,k:1,kmin:1,X:0,Y:0,FW:0,FH:0,fx:0,fy:0},ptrs=new Map();
  function layoutFrame(){
    var r=area.getBoundingClientRect(),mw=Math.max(120,r.width-36),mh=Math.max(120,r.height-36),
        FW=Math.min(mw,mh*ratio),FH=FW/ratio;
    S.FW=FW;S.FH=FH;S.fx=(r.width-FW)/2;S.fy=(r.height-FH)/2;
    fr.style.width=FW+"px";fr.style.height=FH+"px";fr.style.left=S.fx+"px";fr.style.top=S.fy+"px";
  }
  function paint(){
    S.k=Math.min(S.kmin*4,Math.max(S.kmin,S.k));
    S.X=Math.min(S.fx,Math.max(S.fx+S.FW-S.w*S.k,S.X));
    S.Y=Math.min(S.fy,Math.max(S.fy+S.FH-S.h*S.k,S.Y));
    cv.style.transform="translate("+S.X+"px,"+S.Y+"px) scale("+S.k+")";
    z.value=S.k/S.kmin;sync(z);
  }
  function zoomAt(nk,cx,cy){
    nk=Math.min(S.kmin*4,Math.max(S.kmin,nk));var r=nk/S.k;
    S.X=cx-(cx-S.X)*r;S.Y=cy-(cy-S.Y)*r;S.k=nk;paint();
  }
  function close(){ov.classList.remove("show");ov.setAttribute("aria-hidden","true");ptrs.clear();done=null}
  area.addEventListener("pointerdown",function(e){try{area.setPointerCapture(e.pointerId)}catch(_){}ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY})});
  area.addEventListener("pointermove",function(e){
    var p=ptrs.get(e.pointerId);if(!p)return;
    if(ptrs.size===1){S.X+=e.clientX-p.x;S.Y+=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;paint()}
    else if(ptrs.size===2){
      var o,r=area.getBoundingClientRect();ptrs.forEach(function(v,k){if(k!==e.pointerId)o=v});
      var d0=Math.hypot(p.x-o.x,p.y-o.y),cx0=(p.x+o.x)/2,cy0=(p.y+o.y)/2;
      p.x=e.clientX;p.y=e.clientY;
      var d1=Math.hypot(p.x-o.x,p.y-o.y),cx1=(p.x+o.x)/2,cy1=(p.y+o.y)/2;
      S.X+=cx1-cx0;S.Y+=cy1-cy0;
      if(d0>0)zoomAt(S.k*d1/d0,cx1-r.left,cy1-r.top);else paint();
    }
  });
  function up(e){ptrs.delete(e.pointerId)}
  area.addEventListener("pointerup",up);area.addEventListener("pointercancel",up);
  area.addEventListener("wheel",function(e){e.preventDefault();var r=area.getBoundingClientRect();zoomAt(S.k*Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top)},{passive:false});
  z.addEventListener("input",function(){zoomAt(S.kmin*parseFloat(z.value),S.fx+S.FW/2,S.fy+S.FH/2)});
  $("ccancel").onclick=close;
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&ov.classList.contains("show"))close()});
  $("cok").onclick=function(){
    var sw=S.FW/S.k,sh=S.FH/S.k,
        x0=Math.max(0,Math.min(S.w-sw,(S.fx-S.X)/S.k)),y0=Math.max(0,Math.min(S.h-sh,(S.fy-S.Y)/S.k)),
        sc=Math.min(1,maxOut/Math.max(sw,sh)),ow=Math.max(1,Math.round(sw*sc)),oh=Math.max(1,Math.round(sh*sc)),
        c=document.createElement("canvas");
    c.width=ow;c.height=oh;c.getContext("2d").drawImage(cv,x0,y0,sw,sh,0,0,ow,oh);
    window.lastCropMode=currentRatioMode;
    var cb=done;close();if(cb)cb(c);
  };
  /* o: {ratio:宽/高, title, sub, max:输出长边上限} */
  return function(src,cb,o){
    o=o||{};ratio=o.ratio||1;maxOut=o.max||1400;ttl.textContent=o.title||ttl0;sub.textContent=o.sub||sub0;
    currentRatioMode="1";
    var rBox=ov.querySelector(".crop-ratio-btns");
    if(rBox)rBox.style.display=o.ratioPick?"flex":"none"; /* 仅传 ratioPick 时显示比例按钮 */
    var rBtns=ov.querySelectorAll(".crop-ratio-btns .chip");
    rBtns.forEach(function(b){
      b.classList.toggle("on",b.getAttribute("data-ratio")==="1");
      b.onclick=null; /* 移除旧事件，防止重复绑定 */
      b.onclick=function(){
        rBtns.forEach(function(x){x.classList.remove("on")});
        b.classList.add("on");
        currentRatioMode=b.getAttribute("data-ratio");
        ratio=currentRatioMode==="1"?1:(window.innerWidth/window.innerHeight);
        ttl.textContent=(o.title||ttl0).replace(/(1:1|屏幕比例)/,currentRatioMode==="1"?"1:1":"屏幕比例");
        layoutFrame();
        S.kmin=Math.max(S.FW/S.w,S.FH/S.h);S.k=S.kmin;
        S.X=S.fx+(S.FW-S.w*S.k)/2;S.Y=S.fy+(S.FH-S.h*S.k)/2;
        paint();
      };
    });
    done=cb;cv.width=src.width;cv.height=src.height;cv.getContext("2d").drawImage(src,0,0);
    S.w=src.width;S.h=src.height;ptrs.clear();
    ov.classList.add("show");ov.setAttribute("aria-hidden","false");
    layoutFrame();S.kmin=Math.max(S.FW/S.w,S.FH/S.h);S.k=S.kmin;
    S.X=S.fx+(S.FW-S.w*S.k)/2;S.Y=S.fy+(S.FH-S.h*S.k)/2;paint();
  };
})();
function bgSwapDelayMs(){
  var v=parseFloat(localStorage.getItem("dev_bgSwapDelay"));
  if(isNaN(v))v=0.3;   /* 默认 0.3 秒（原来 1 秒，点完成后会空等一下）；开发者选项里设过的值照旧 */
  return Math.round(Math.min(5,Math.max(0,v))*1000);
}
/* 三次贝塞尔缓动（和 CSS 的 cubic-bezier 一样），用来在 requestAnimationFrame 里手动算进度 */
function bgEase(x1,y1,x2,y2){
  var cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
  return function(x){
    if(x<=0)return 0;if(x>=1)return 1;
    var t=x;
    for(var i=0;i<8;i++){
      var e=((ax*t+bx)*t+cx)*t-x,d=(3*ax*t+2*bx)*t+cx;
      if(Math.abs(e)<1e-5||Math.abs(d)<1e-6)break;
      t-=e/d;
    }
    t=Math.min(1,Math.max(0,t));
    return ((ay*t+by)*t+cy)*t;
  };
}
function useImg(cv){
  var newImg=cv.toDataURL("image/jpeg",.88);
  window.__lastPickedImg=newImg;   /* 已经是图片模式时，imgData 要等约 2 秒的转场结束才会换成新图；主题编辑器要立刻拿到新图，不能读 imgData */

  /* 当前不是图片模式：直接切过去（要展示背景类型的切换） */
  if(bgMode!=="img"){
    imgData=newImg;
    $("bgm").children[2].click();
    return;
  }

  /* 连续选图：以最后一次为准（取消上一次还没播完的转场，不会叠出多个动画） */
  if(window.__bgSwap)window.__bgSwap.cancel();
  var st={timer:0,anim:null,el:null};
  st.cancel=function(){
    clearTimeout(st.timer);
    if(st.raf){cancelAnimationFrame(st.raf);st.raf=0}
    if(st.anim){try{st.anim.cancel()}catch(_){}}
    if(st.el&&st.el.parentNode)st.el.parentNode.removeChild(st.el);
    if(!st.done){                                              /* 转场被打断（又选了图 / 切了主题）：把 #bg / #bgf 还原成转场前的样子，后面的流程会重新画 */
      if(st.bgSaved!=null){var b0=$("bg");if(b0)b0.style.cssText=st.bgSaved;st.bgSaved=null}
      if(st.bgfSaved!=null){var f0=$("bgf");if(f0)f0.style.cssText=st.bgfSaved;st.bgfSaved=null}
    }
    if(st.dimEl){st.dimEl.style.transition="";st.dimEl=null}
    if(window.__bgSwap===st)window.__bgSwap=null;
  };
  window.__bgSwap=st;
  try{var pre=new Image();pre.src=newImg;if(pre.decode)pre.decode().then(null,function(){})}catch(_){}   /* 等待期间先把大图解码好，转场第一帧不用卡着解码 */

  /* 1. 先等待（开发者选项「背景换图等待」，默认 1 秒） */
  st.timer=setTimeout(function(){
    st.timer=0;
    if(bgMode!=="img"){imgData=newImg;st.cancel();return}      /* 等待期间用户切走了图片模式：只记下新图 */

    var stage=$("stage"),bgEl=$("bg"),bgfEl=$("bgf"),dv=$("dimv"),sq=!!window.isBgSquare,url="url('"+newImg+"')";
    var DUR=700,EASE="cubic-bezier(.4,0,.2,1)",endBlur=(+$("imgBlur").value||0);   /* 终点模糊 = 设置里的背景模糊，和底层衔接不跳变 */
    function finish(){                                          /* 动画结束：底层换成新图，再摘掉覆盖层 */
      st.done=true;
      if(st.bgfSaved!=null)bgfEl.style.cssText=st.bgfSaved;     /* #bgf 还给 applyBg 去设置 */
      imgData=newImg;
      if(bgMode==="img")applyBg();
      requestAnimationFrame(function(){requestAnimationFrame(function(){st.cancel()})});   /* 等底层画好再摘，避免闪一下 */
    }
    /* 压暗层从转场开始就和圆形同步淡入，转场结束时不再有「突然变暗」 */
    function dimFade(){
      try{
        var dimTo=(+$("imgDim").value||0)/100,cc=getComputedStyle(dv).backgroundColor;
        if(dimTo>0&&(cc==="transparent"||/,\s*0\)$/.test(cc))){          /* 原来没有压暗（从渐变换成图片）才需要淡入；已有压暗就不动，免得闪 */
          dv.style.transition="none";dv.style.background="rgba(0,0,0,0)";void dv.offsetWidth;
          dv.style.transition="background-color "+DUR+"ms "+EASE;dv.style.background="rgba(0,0,0,"+dimTo+")";
          st.dimEl=dv;
        }
      }catch(_){}
    }
    var vw=window.innerWidth,vh=window.innerHeight,sr=stage.getBoundingClientRect(),full=sr.width>=vw-1&&sr.height>=vh-1;
    var ccx=(full?vw/2:sr.left+sr.width/2)-sr.left,ccy=(full?vh/2:sr.top+sr.height/2)-sr.top;   /* 圆心（舞台坐标）= 屏幕正中心；舞台不是全屏（电脑版）就用舞台自己的中心 */

    if(sq){
      /* ===== 1:1 方图：仍用原来的覆盖层 + clip-path（模糊 20px → 清晰） ===== */
      var trans=document.createElement("div");
      trans.style.cssText="position:absolute;pointer-events:none;transform:translateZ(0);will-change:clip-path,filter;inset:0;";
      var back=document.createElement("div");
      back.style.cssText="position:absolute;inset:-80px;background:"+url+" center/cover no-repeat;filter:blur(44px) saturate(1.15);transform:scale(1.2) translateZ(0);";
      var front=document.createElement("div");
      front.style.cssText="position:absolute;inset:0;background:"+url+" center/contain no-repeat;";
      trans.appendChild(back);trans.appendChild(front);
      if(bgEl&&bgEl.parentNode)bgEl.parentNode.insertBefore(trans,bgEl.nextSibling);else stage.appendChild(trans);
      st.el=trans;
      if(!trans.animate){finish();return}                       /* 环境不支持动画：直接换 */
      var tr=trans.getBoundingClientRect();
      var cx=(full?vw/2:sr.left+sr.width/2)-tr.left,cy=(full?vh/2:sr.top+sr.height/2)-tr.top;
      var R0=Math.ceil(Math.hypot(Math.max(cx,tr.width-cx),Math.max(cy,tr.height-cy)))+4;   /* 到最远角的距离，保证铺满 */
      dimFade();
      trans.style.clipPath="circle(0px at "+cx+"px "+cy+"px)";
      trans.style.filter="blur(20px)";
      st.anim=trans.animate([
        {clipPath:"circle(0px at "+cx+"px "+cy+"px)",filter:"blur(20px)"},
        {clipPath:"circle("+R0+"px at "+cx+"px "+cy+"px)",filter:"blur("+endBlur+"px)"}
      ],{duration:DUR,easing:EASE,fill:"forwards"});
      st.anim.onfinish=finish;
      return;
    }

    /* ===== 屏幕比例：用「真正的」#bg 当那个圆，旧外观搬到 #bgf（在 #bg 下面） =====
       录屏证明：主面板的毛玻璃只“看得见”页面里原有的 #bg / #bgf / #dimv，看不见转场时临时插进去的覆盖层
       （clip-path 的、普通 div 的都一样），所以面板要等转场结束、#bg 真正换图才变色。
       这里不再插覆盖层：#bg 自己变成不断变大的圆（新图），#bgf 临时顶替旧的 #bg 外观；
       毛玻璃采样的就是这两层，会随圆一起变 */
    var cs=getComputedStyle(bgEl);
    st.bgSaved=bgEl.style.cssText;st.bgfSaved=bgfEl.style.cssText;
    bgfEl.style.cssText="display:block;position:absolute;left:"+cs.left+";top:"+cs.top+";width:"+cs.width+";height:"+cs.height+";"+
      "background-image:"+cs.backgroundImage+";background-size:"+cs.backgroundSize+";background-position:"+cs.backgroundPosition+";"+
      "background-repeat:"+cs.backgroundRepeat+";background-color:"+cs.backgroundColor+";filter:"+cs.filter+";transform:translateZ(0);animation:"+cs.animation+";";
    var iw=cv.width,ih=cv.height,tw=sr.width+200,th=sr.height+200,                  /* 最终的 #bg 是 inset:-100px */
        k=Math.max(tw/iw,th/ih),dw=iw*k,dh=ih*k,ix=-100+(tw-dw)/2,iy=-100+(th-dh)/2,
        R=Math.ceil(Math.hypot(Math.max(ccx+100,tw-(ccx+100)),Math.max(ccy+100,th-(ccy+100))))+4;
    function ib(prop,val){bgEl.style.setProperty(prop,val,"important")}   /* 样式表里有 !important，行内也要加 */
    ib("inset","auto");ib("border-radius","50%");ib("background-image",url);ib("background-repeat","no-repeat");
    ib("background-size",dw+"px "+dh+"px");ib("background-color","transparent");ib("animation","none");
    ib("filter",endBlur?"blur("+endBlur+"px)":"none");
    ib("left",ccx+"px");ib("top",ccy+"px");ib("width","0px");ib("height","0px");
    dimFade();
    var ease=bgEase(.4,0,.2,1),t0=null;
    function step(now){
      if(window.__bgSwap!==st)return;
      if(bgMode!=="img"){                                       /* 动画期间切走了图片模式：还原 #bgf，按新模式重画，转场作废 */
        st.done=true;bgfEl.style.cssText=st.bgfSaved;applyBg();st.cancel();return;
      }
      if(t0===null)t0=now;
      var p=Math.min(1,(now-t0)/DUR),r=R*ease(p),l=ccx-r,t=ccy-r;
      ib("left",l+"px");ib("top",t+"px");ib("width",(2*r)+"px");ib("height",(2*r)+"px");
      ib("background-position",(ix-l)+"px "+(iy-t)+"px");
      if(p<1)st.raf=requestAnimationFrame(step);else{st.raf=0;finish()}
    }
    st.raf=requestAnimationFrame(step);
  },bgSwapDelayMs());
}
$("pick").onclick=function(){$("file").click()};
$("file").onchange=function(){
  var f=this.files[0];this.value="";if(!f)return;
  var r=new FileReader();
  r.onload=function(){var im=new Image();im.onload=function(){
    var sq=Math.abs(im.width/im.height-1)<.01,
        s=Math.min(1,(sq?1400:2400)/Math.max(im.width,im.height)),cv=document.createElement("canvas");
    cv.width=Math.round(im.width*s);cv.height=Math.round(im.height*s);
    cv.getContext("2d").drawImage(im,0,0,cv.width,cv.height);
    if(sq){window.isBgSquare=true;useImg(cv)}   /* 本身就是 1:1：不裁剪，按 1:1 处理 */
    else openCrop(cv,function(c){
      window.isBgSquare=(window.lastCropMode==="1"); /* 记录背景是不是 1:1 */
      useImg(c);
    },{ratioPick:true});
  };im.src=r.result};
  r.readAsDataURL(f);
};
/* ---- 全区背景照片：按屏幕比例裁剪 + 模糊开关 ---- */
var pgData="",pgLum=.3;
function applyPg(){
  var el=$("pgbg"),has=!!pgData,on=has&&$("pgOn").checked,bo=$("pgBlurOn").checked,bl=bo?(+$("pgBlur").value||0):0;
  el.style.backgroundImage=has?"url('"+pgData+"')":"none";
  var ex=Math.ceil(bl*2.2);                       /* 模糊时把图往外扩，避免边缘发虚/露底 */
  el.style.inset=(-ex)+"px";
  el.style.filter=(bl>0?"blur("+bl+"px) ":"")+"brightness(.85)";
  el.classList.toggle("on",on);
  $("pgOn").disabled=!has;$("pgDel").classList.toggle("hide",!has);
  $("pgBlur").disabled=!bo;sync($("pgBlur"));
  if($("pgPick")&&$("pgPick").lastChild)$("pgPick").lastChild.nodeValue=has?"更换照片":"添加照片";
  applyBg();
}
if($("pgPick")){$("pgPick").onclick=function(){$("pgFile").click()};}
if($("pgDel")){$("pgDel").onclick=function(){pgData="";$("pgOn").checked=false;applyPg()};}
["pgOn","pgBlurOn"].forEach(function(id){$(id).addEventListener("change",applyPg)});
$("pgBlur").addEventListener("input",applyPg);
$("pgFile").onchange=function(){
  var fl=this.files[0];this.value="";if(!fl)return;
  var r=new FileReader();
  r.onload=function(){var im=new Image();im.onload=function(){
    var sc=Math.min(1,3000/Math.max(im.width,im.height)),cv=document.createElement("canvas");
    cv.width=Math.round(im.width*sc);cv.height=Math.round(im.height*sc);
    cv.getContext("2d").drawImage(im,0,0,cv.width,cv.height);
    var vw=window.innerWidth,vh=window.innerHeight;
    openCrop(cv,function(c){
      pgData=c.toDataURL("image/jpeg",.86);
      var t=document.createElement("canvas");t.width=t.height=16;var x=t.getContext("2d");x.drawImage(c,0,0,16,16);
      var d=x.getImageData(0,0,16,16).data,sum=0;
      for(var i=0;i<d.length;i+=4)sum+=.299*d[i]+.587*d[i+1]+.114*d[i+2];
      pgLum=sum/(d.length/4)/255*.85;
      $("pgOn").checked=true;applyPg();
    },{ratio:vw/vh,max:1800,title:"裁剪全区背景 · 当前屏幕比例",sub:"框的比例和当前屏幕一致；拖动选位置，双指或滑杆缩放"});
  };im.src=r.result};
  r.readAsDataURL(fl);
};
applyPg();


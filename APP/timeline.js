// app/timeline.js — 时间轴 + 放大镜
/* ---- 全局时间轴 ---- */
var TLS=[],tlLN=null,tlDurs=[],tlTot=0,tlT=0;
function fmtT(t){return t<60?t.toFixed(1)+"s":Math.floor(t/60)+":"+("0"+Math.floor(t%60)).slice(-2)}
function tlBuild(durs){
  tlDurs=durs;tlTot=durs.reduce(function(a,b){return a+b},0);
  var n=durs.length,keep=[];
  [].forEach.call(document.querySelectorAll(".tl"),function(el){
    /* 找现有的同一条时间轴状态（上一次 tlBuild 留下的） */
    var old=null;
    for(var k=0;k<TLS.length;k++){if(TLS[k].el===el){old=TLS[k];break}}
    if(old&&old.segs.length===n){
      /* 句子数没变：只更新每块的时长权重与悬浮提示，DOM 一个都不重建
         → 拖动速度滑块时色块宽度平滑变化，游标不回到原点，不再抽搐 */
      for(var i=0;i<n;i++){
        var g=old.segs[i];
        g.style.setProperty("--d",durs[i].toFixed(3));
        g.title="第 "+(i+1)+" 条 · "+durs[i].toFixed(1)+"s · "+LN[i];
      }
      old.geo=null;   /* 宽度变了，几何缓存作废，下一帧重新量 */
      old.pp=-1;      /* 强制下一帧重算游标位置（否则 pg 没变就不会刷新 transform） */
      keep.push(old);
    }else{
      /* 句子数变了（首次渲染 / 增删卡片）：只能重建 */
      el.innerHTML="";var segs=[];
      durs.forEach(function(d,i){
        var g=document.createElement("div");g.className="tg";
        g.style.setProperty("--d",d.toFixed(3));g.style.setProperty("--h",(i / durs.length) * 360);
        g.title="第 "+(i+1)+" 条 · "+d.toFixed(1)+"s · "+LN[i];
        el.appendChild(g);segs.push(g);
      });
      var c=document.createElement("div");c.className="cur";el.appendChild(c);
      keep.push({el:el,segs:segs,cur:c,idx:-1,shuf:null,geo:null,pp:-1});
    }
  });
  TLS=keep;
}
function tlJump(e){
  e.stopPropagation();
  if(performance.now()-tlSuppT<500)return;
  var t=null;TLS.forEach(function(o){if(o.el===e.currentTarget)t=o});
  if(!t)return;
  var x=e.clientX,best=-1,bd=1e9;
  t.segs.forEach(function(g,i){var r=g.getBoundingClientRect(),d=x<r.left?r.left-x:(x>r.right?x-r.right:0);if(d<bd){bd=d;best=i}});
  if(best<0)return;
  tlGo(best);
}
[].forEach.call(document.querySelectorAll(".tl"),function(el){el.addEventListener("click",tlJump)});

/* ---- 时间轴性能：缓存几何、节流检查、只在变化时写样式 ---- */
function tlGeoOf(t){
  if(!t.geo){var L=[],W=[],s=t.segs,i;for(i=0;i<s.length;i++){L.push(s[i].offsetLeft);W.push(s[i].offsetWidth)}t.geo={L:L,W:W}}
  return t.geo;
}
var tlRO=window.ResizeObserver?new ResizeObserver(function(es){
  es.forEach(function(en){for(var i=0;i<TLS.length;i++)if(TLS[i].el===en.target)TLS[i].geo=null});
}):null,tlChkT=0;
window.addEventListener("resize",function(){TLS.forEach(function(t){t.geo=null})});
function paintTL(force){
  var n=LN.length,now=performance.now(),i;
  if(force||LN!==tlLN||tlDurs.length!==n||now-tlChkT>250){
    tlChkT=now;
    var durs=[],same=!!(tlLN&&tlLN.length===n&&tlDurs.length===n);
    for(i=0;i<n;i++){
      durs.push(secOf(i));
      if(same){
        if(LN[i]!==tlLN[i])same=false;
        else if(Math.abs(durs[i]-tlDurs[i])>1e-6)same=false;
      }
    }
    if(!same){tlLN=LN;tlBuild(durs)}
  }
  var shuf=$("shuf").checked,k=Math.min(idx,n-1),pg=Math.min(1,prog);
  TLS.forEach(function(t){
    if(t.idx!==k||t.shuf!==shuf){
      t.segs.forEach(function(g,j){g.classList.toggle("on",j===k);g.classList.toggle("dn",!shuf&&j<k);if(j!==k)g.style.removeProperty("--p")});
      t.idx=k;t.shuf=shuf;t.pp=-1;
    }
    var g=t.segs[k];if(!g)return;
    if(force||Math.abs(pg-t.pp)>=.002){
      t.pp=pg;
      var geo=tlGeoOf(t);
      g.style.setProperty("--p",pg.toFixed(3));
      t.cur.style.transform="translateX("+(geo.L[k]+pg*geo.W[k]).toFixed(1)+"px)";
    }
  });
  /* 胶囊时间轴"已播放"白色填充：直接按播放时间连续算（有音频用音频时间；没音频但按顺序播放用累计时长）。
     不再依赖各句的 dn 类 —— 勾选"随机显示"时 dn 不会被标上，已播放部分就只剩当前那一小截；
     分段拼出来的填充在句与句之间还会露出细缝。 */
  var cont=false,pct=0;
  if(typeof AUDIO_ON!=="undefined"&&AUDIO_ON&&typeof audio!=="undefined"&&audio&&audio.duration&&isFinite(audio.duration)){
    cont=true;pct=audio.currentTime/audio.duration;
  }else if(!shuf&&k>=0&&tlTot>0){
    var el2=0;for(i=0;i<k;i++)el2+=tlDurs[i];el2+=pg*tlDurs[k];cont=true;pct=el2/tlTot;
  }
  pct=Math.max(0,Math.min(1,pct||0));
  TLS.forEach(function(t){
    t.el.classList.toggle("tlc",cont);
    if(force||t.fp===undefined||Math.abs(pct-t.fp)>=.001){t.fp=pct;t.el.style.setProperty("--tl-pct",(pct*100).toFixed(2)+"%")}
  });
  if(force||now-tlT>100){
    tlT=now;var lab=$("tlt");
    if(lab){
      if(shuf)lab.textContent="共 "+fmtT(tlTot);
      else{var el=0;for(i=0;i<k;i++)el+=tlDurs[i];el+=pg*tlDurs[k];lab.textContent=fmtT(el)+" / "+fmtT(tlTot)}
    }
    
    // 更新左右两侧的时间显示
    var cEl = document.getElementById("tlTimeCur");
    var tEl = document.getElementById("tlTimeTot");
    if(cEl && tEl){
      var curSec = 0, totSec = tlTot;
      if(typeof AUDIO_ON !== "undefined" && AUDIO_ON && audio && audio.duration){
        curSec = audio.currentTime;
        totSec = audio.duration;
      }else if(!shuf){
        for(i=0;i<k;i++) curSec += tlDurs[i];
        curSec += pg * tlDurs[k];
      }
      var fmtTm = function(s) {
        if(!isFinite(s)) s = 0;
        var m = Math.floor(s / 60);
        var sec = Math.floor(s % 60);
        return (m < 10 ? '0' : '') + m + ':' + (sec < 10 ? '0' : '') + sec;
      };
      cEl.textContent = fmtTm(curSec);
      tEl.textContent = fmtTm(totSec);
    }
  }
}

/* ---- 时间轴长按放大镜（按帧节流 + 节点复用） ---- */
var tlSuppT=-1e9;
function tlGo(i){
  bag=null; prog=0; idx=i;
  if(AUDIO_ON && audio && TS.length) audio.currentTime = lyrSeekTime(i);
  update(); paintTL(true);
}
(function(){
  var lens=document.createElement("div");lens.id="tlLens";lens.setAttribute("aria-hidden","true");
  lens.innerHTML='<div class="lh"><b></b><span></span></div><div class="lt"></div><div class="trk"><div class="sg"></div><div class="ndl"></div></div>';
  document.body.appendChild(lens);
  var hb=lens.querySelector(".lh b"),hs=lens.querySelector(".lh span"),lt=lens.querySelector(".lt"),
      sg=lens.querySelector(".sg"),ndl=lens.querySelector(".ndl");
  var st=null,timer=0,raf=0,pool=[];
  function findT(el){for(var i=0;i<TLS.length;i++)if(TLS[i].el===el)return TLS[i];return null}
  function nearest(L,W,x){var best=-1,bd=1e9;for(var i=0;i<L.length;i++){var d=x<L[i]?L[i]-x:(x>L[i]+W[i]?x-L[i]-W[i]:0);if(d<bd){bd=d;best=i}}return best}
  function norm(i){var c=st.txt;if(c[i]===undefined)c[i]=String(LN[i]||"").replace(/\s+/g," ");return c[i]}
  function render(){
    if(!st||!st.on)return;
    var key=st.cx+"|"+idx+"|"+Math.min(1,prog).toFixed(3)+"|"+LN.length;
    if(key===st.key)return;st.key=key;          /* 手指没动、播放也没变化时不重复写 DOM */
    var t=findT(st.el);if(!t||!t.segs.length)return;
    var g=tlGeoOf(t),L=g.L,W=g.W,n=L.length,i,tw=st.tw,
        fx=Math.max(0,Math.min(tw,(st.cx-st.rl)/st.sc)),pk=nearest(L,W,fx),
        lw=st.lw,tkw=lw-20,anchor=st.rl+fx*st.sc,
        left=Math.max(8,Math.min(st.vw-lw-8,anchor-lw/2)),
        nx=Math.max(4,Math.min(tkw-4,anchor-left-10)),
        z=Math.min(80,Math.max(3,tkw/((tw/n)*5))),
        shuf=st.shuf,used=0,cur=idx,pg=Math.min(1,prog);
    for(i=0;i<n;i++){
      var px=nx+(L[i]-fx)*z,w=W[i]*z;
      /* 预渲染缓冲：允许色块在屏幕左右各多渲染 150px，滑动时备用色块无缝滑入，解决快速滑动时的空缺和突然跳出 */
      if(px+w<-150||px>tkw+150)continue;
      var d=pool[used];
      if(!d){d=document.createElement("div");d.className="lseg";d.appendChild(document.createElement("i"));sg.appendChild(d);pool.push(d)}
      used++;
      d.style.display="";
      d.className=i===pk?"lseg pk":"lseg";
      /* 原时间轴每个块之间有 2px 的 gap，乘以放大倍率 z 后缝隙会变大。
         这里用"到下一块起点的距离"当宽度，再统一减去 1.5px 作为固定细缝，
         这样不管放大多少倍、也不受 offsetLeft/offsetWidth 取整影响，间隙永远均匀且极细。
         最后一块没有下一块，直接用自己的宽度。 */
      var span=(i<n-1)?(L[i+1]-L[i])*z:w;
      d.style.left=px.toFixed(1)+"px";
      d.style.width=Math.max(1,span-1.5).toFixed(1)+"px";
      d.style.setProperty("--h",(i / n) * 360);
      d.style.setProperty("--p",!shuf&&i<cur?"1":(i===cur?pg.toFixed(3):"0"));
      var s=d.firstChild;
      if(w>14){s.style.display="";s.textContent=String(i+1)}else s.style.display="none";
    }
    for(i=used;i<pool.length;i++)pool[i].style.display="none";
    ndl.style.left=nx.toFixed(1)+"px";
    if(st.pk!==pk){
      var start=0;for(i=0;i<pk;i++)start+=tlDurs[i]||0;
      hb.textContent="第 "+(pk+1)+" / "+n+" 条";
      hs.textContent=(shuf?"":fmtT(start)+" · ")+(tlDurs[pk]||0).toFixed(1)+"s";
      lt.textContent=norm(pk)||"（空）";
      if(st.pk>=0)t.segs[st.pk].classList.remove("pick");
      t.segs[pk].classList.add("pick");
      if(st.pk!==-1&&navigator.vibrate)try{navigator.vibrate(6)}catch(_){}
      st.pk=pk;
    }
    lens.style.left=left.toFixed(1)+"px";
  }
  function loop(){raf=0;if(!st||!st.on)return;render();raf=requestAnimationFrame(loop)}   /* 按住不动时也每帧刷新 */
  function hide(){
    lens.classList.remove("show");
    if(raf){cancelAnimationFrame(raf);raf=0}
    if(st){st.el.classList.remove("scrub");var t=findT(st.el);if(t)t.segs.forEach(function(g){g.classList.remove("pick")})}
  }
  function activate(){
    if(!st)return;st.on=true;
    var el=st.el,r=el.getBoundingClientRect();           /* 只在按下时量一次，移动中不再读布局 */
    st.tw=el.offsetWidth||1;st.sc=r.width/st.tw||1;st.rl=r.left;
    st.vw=document.documentElement.clientWidth;st.lw=Math.min(320,st.vw-16);
    st.shuf=$("shuf").checked;st.txt=[];
    lens.style.width=st.lw+"px";
    var h=lens.offsetHeight,top=r.top-h-14;if(top<8)top=r.bottom+14;
    lens.style.top=top.toFixed(1)+"px";
    el.classList.add("scrub");lens.classList.add("show");
    if(navigator.vibrate)try{navigator.vibrate(14)}catch(_){}
    loop();
  }
  [].forEach.call(document.querySelectorAll(".tl"),function(el){
    if(tlRO)tlRO.observe(el);
    el.addEventListener("contextmenu",function(e){e.preventDefault()});
    el.addEventListener("pointerdown",function(e){
      if(e.pointerType==="mouse"&&e.button!==0)return;
      clearTimeout(timer);
      st={el:el,id:e.pointerId,x0:e.clientX,y0:e.clientY,cx:e.clientX,on:false,pk:-1};
      try{el.setPointerCapture(e.pointerId)}catch(_){}
      timer=setTimeout(activate,320);
    });
    el.addEventListener("pointermove",function(e){
      if(!st||e.pointerId!==st.id)return;
      st.cx=e.clientX;
      if(!st.on){if(Math.hypot(e.clientX-st.x0,e.clientY-st.y0)>10){clearTimeout(timer);st=null}return}
      e.preventDefault();
    },{passive:false});
    function end(e,commit){
      if(!st||e.pointerId!==st.id)return;
      clearTimeout(timer);
      var was=st.on,pk=st.pk;
      if(was){hide();tlSuppT=performance.now();if(commit&&pk>=0)tlGo(pk)}
      st=null;
    }
    el.addEventListener("pointerup",function(e){end(e,true)});
    el.addEventListener("pointercancel",function(e){end(e,false)});
  });
})();



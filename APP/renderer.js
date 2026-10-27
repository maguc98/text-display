// app/renderer.js — 舞台渲染、动效面板
var LIVE=true,dirty=0,eIn="cubic-bezier(.2,.8,.2,1)",eOut="cubic-bezier(.4,0,.8,.3)",CF=[],shownSig="",statT=0,skyT=0,sonnetOn=false,sonnetKillT=0;
function cfgOf(i){return CF[i]||{}}
function markStyles(){[$("styles"),$("styles2"),$("styles3")].forEach(function(box,b){var L=b===2?STY3:b?STY2:STY;[].forEach.call(box.children,function(c,i){c.classList.toggle("on",L[i][0]===style)})})}
function setStyle(v){
  if(v===style||!LIVE||!window.StyleFX){style=v;idx=0;prog=0;reqRender();markStyles();return}   // 原逻辑：同风格重点 / 手动刷新模式 / 过渡模块未加载
  style=v;markStyles();syncBoxes();                          // 立刻反馈：chip 选中态、下拉文字、参数面板开合
  StyleFX.swap(function(){idx=0;prog=0;reqRender()});       // 旧内容通用退场 → 提交真正的切换 → 新内容升起淡入
}
chips($("styles"),STY,function(){return style},setStyle);
chips($("styles2"),STY2,function(){return style},setStyle);
chips($("styles3"),STY3,function(){return style},setStyle);
chips($("themes"),THEMES.map(function(t,i){return [i,t[0]]}),function(){return theme},function(v){theme=v;applyPreset(v);reqBg(true)});
chips($("bgm"),[["grad","混色渐变"],["solid","纯色"],["img","自选图片"]],function(){return bgMode},function(v){bgMode=v;$("gbox").classList.toggle("hide",v!=="grad");$("solidbox").classList.toggle("hide",v!=="solid");$("ibox").classList.toggle("hide",v!=="img");reqBg(true)});
glide($("styles"));glide($("styles2"));glide($("styles3"));glide($("bgm"));
/* ---- 动效风格下拉 ---- */
(function(){
  var sel=$("styleSel"),pop=$("stylePop"),grid=pop.firstChild,hub=$("hub"),ALL=STY.concat(STY2,STY3,STY4),nSp=STY3.length+STY4.length,btns=[];
  var hd=document.createElement("div");hd.className="dd-h";hd.style.display="flex";
  var tt=document.createElement("b");tt.className="dd-t";tt.textContent="动画样式";hd.appendChild(tt);
  pop.insertBefore(hd,grid);pop.classList.add("rich");
  ALL.forEach(function(e,i){var b=document.createElement("button");b.type="button";b.setAttribute("role","option");
    var ic=document.createElement("i");ic.className="ic";ic.innerHTML='<svg viewBox="0 0 24 24">'+(FX_IC[e[1]]||"")+'</svg>';b.appendChild(ic);
    var sp=document.createElement("span");sp.textContent=e[1];b.appendChild(sp);
    if(i>=ALL.length-nSp){b.classList.add("wide");if(i===ALL.length-nSp){var d=document.createElement("div");d.className="dd-sep";grid.appendChild(d)}}
    b.onclick=function(ev){ev.stopPropagation();setStyle(e[0]);close()};grid.appendChild(b);btns.push(b)});
  function fade(){var t=grid.scrollTop>2,bt=grid.scrollTop+grid.clientHeight<grid.scrollHeight-2;
    grid.style.setProperty("--ft",t?"18px":"0px");grid.style.setProperty("--fb",bt?"18px":"0px")}
  grid.addEventListener("scroll",fade,{passive:true});
  function label(){for(var i=0;i<ALL.length;i++)if(ALL[i][0]===style){$("styleSelTx").textContent=ALL[i][1];btns.forEach(function(b,j){b.classList.toggle("on",j===i)});return}}
  document.body.appendChild(pop);
  function place(keepScroll){
    var pw=Math.min(272,window.innerWidth-24);
    pop.style.width=pw+"px";
    PopFX.place(pop,sel,{inner:grid,maxH:440,width:pw});
    if(keepScroll!==true){var on=grid.querySelector("button.on");if(on)grid.scrollTop=Math.max(0,on.offsetTop-grid.clientHeight/2+on.offsetHeight/2)}
    fade();
  }
  function open(){label();place();PopFX.show(pop);sel.setAttribute("aria-expanded","true")}
  function close(){PopFX.hide(pop);sel.setAttribute("aria-expanded","false")}
  sel.addEventListener("click",function(e){e.stopPropagation();pop.classList.contains("show")?close():open()});
  document.addEventListener("pointerdown",function(e){if(pop.classList.contains("show")&&!pop.contains(e.target)&&!sel.contains(e.target))close()},true);
  var _rz=0;window.addEventListener("resize",function(){if(_rz||!pop.classList.contains("show"))return;_rz=requestAnimationFrame(function(){_rz=0;if(pop.classList.contains("show"))place(true)})});document.addEventListener("scroll",function(e){if(!pop.contains(e.target))close()},true);
  var _ms=markStyles;markStyles=function(){_ms();label()};
  label();
})();

function applyLayout(){
  var fx={left:"flex-start",center:"center",right:"flex-end"},fy={top:"flex-start",center:"center",bottom:"flex-end"};
  var set=function(k,v){stage.style.setProperty(k,v)};
  set("--ta",LY.a);set("--jc",fx[LY.a]);set("--ai",fy[LY.v]);
  set("--py",LY.v==="center"?"0px":"28px");
  set("--px",$("lyPad").value+"px");
  set("--fw",String($("lyFw").value*100));
  set("--lhm",($("lyLh").value/100).toFixed(2));
  set("--wb",LY.w==="fill"?"break-all":"normal");
  stage.dataset.wrap=LY.w;
}
function sec(){return (11-$("speed").value)*0.6}
function lh(){return Math.round($("size").value*2.1)}

function render(){
  applyItems();
  stage.style.setProperty("--hl",$("fg").value);
  stage.style.setProperty("--aspd", ASPD);
  stage.style.setProperty("--tc",$("tc").value);
  stage.style.setProperty("--sw",$("sw").value+"px");stage.style.setProperty("--sc",$("sc").value);
  stage.style.setProperty("--po",(+$("sw").value>0)?"stroke fill":"normal");
  var sh=+$("shd").value,rg=+($("rgb")?$("rgb").value:0)||0,tp=[];
  /* RGB 分离：红、青两层左右错开的实色阴影，叠在普通阴影之上，与阴影 / 描边互相独立 */
  if(rg>0)tp.push((-rg).toFixed(1)+"px 0 0 rgba(255,0,60,.9)",rg.toFixed(1)+"px 0 0 rgba(0,229,255,.9)");
  if(sh)tp.push("0 2px "+(sh*.24).toFixed(1)+"px rgba(0,0,0,"+Math.min(.95,.35+sh*.006).toFixed(2)+")","0 0 "+(sh*.1).toFixed(1)+"px rgba(0,0,0,.6)");
  stage.style.setProperty("--tsh",tp.length?tp.join(","):"0 0 0 transparent");
  stage.style.setProperty("--fs",$("size").value+"px");
  stage.style.setProperty("--fs2",Math.round($("size").value*1.7)+"px");
  stage.style.setProperty("--lh",lh()+"px");
  applyLayout();
  stage.classList.toggle("paused",!playing);stage.classList.toggle("gtext",$("gtext").checked);
  one.innerHTML="";cur=null;wx=0;wy=0;panGen++;one.style.transition="none";one.style.transform="none";one.style.filter="";
  syncBoxes();
  if(!sky.children.length)buildSky();
  update();
}

/* 出场时间选项：视频节奏 / 随机 / 自定义 */
function pdMarkSeg(boxId,hid,list){
  var b=$(boxId);if(!b)return;
  if(!b.children.length)list.forEach(function(e){var c=document.createElement("button");c.className="chip";c.textContent=e[1];c.onclick=function(){$(hid).value=e[0];pdSync();renderRaf()};b.appendChild(c)});
  [].forEach.call(b.children,function(c,i){c.classList.toggle("on",list[i][0]===$(hid).value)});
}
function pdSync(){
  if(!$("pdT"))return;
  pdMarkSeg("pdTs","pdT",[["0","视频节奏"],["1","随机"],["2","自定义"]]);
  pdMarkSeg("pdOs","pdO",[["0","顺序"],["1","倒序"],["2","大字优先"]]);
  $("pdCustom").classList.toggle("hide",$("pdT").value!=="2");
}
/* ---- 开屏 / 停在开头时，舞台显示「当前歌曲名」，而不是第一句歌词的第一个字 ---- */
var shownIdle=false,shownTitle="";
function songTitleText(){
  var el=document.getElementById("miT")||document.getElementById("musicPanelTitle");
  var t=el?(el.textContent||"").trim():"";
  return(!t||t==="—"||t==="暂无播放歌曲")?"":t;
}
function titleIdle(){
  if(typeof AUDIO_ON==="undefined"||!AUDIO_ON||typeof audio==="undefined"||!audio)return false;
  return idx===0&&audio.paused&&(audio.currentTime||0)<0.3&&!!songTitleText();
}
function titleSync(){
  if(typeof update!=="function"||typeof LN==="undefined"||!LN.length)return;
  var now=titleIdle(),t=now?songTitleText():"";
  if(now!==shownIdle||(now&&t!==shownTitle))update();
}
function update(){
  var tIdle=titleIdle(),m=modeOf(idx),pan=m==="pan",cfg=cfgOf(idx),dur=secOf(idx),text=tIdle?songTitleText():LN[idx];
  shownIdle=tIdle;shownTitle=tIdle?text:"";
  if(tIdle)dur=Math.max(dur,4);   // 歌名要停留，别按第一句只有 0.1 秒的时长来播动画
  if(m!=="sonnet"&&sonnetOn)sonnetLeave();
if(m!=="poster"){ [].forEach.call(one.children,function(c){ if(c.classList&&(c.classList.contains("vig")||c.classList.contains("noise")))c.remove(); }); }
  if(cur){
    /* 切句前：如果旧 box 是海报排版，把它的当前 cam 位置存到交接对象，
       新句的 buildPoster 会从这里继续，镜头跨句不重置。 */
    if(cur._posterCamSnapshot){
      try{
        var snap = cur._posterCamSnapshot();
        window.__posterCam.x = snap.x;
        window.__posterCam.y = snap.y;
        window.__posterCam.vx = snap.vx;
        window.__posterCam.vy = snap.vy;
      }catch(_){}
    }
    var o=cur;
    if(o._posterCamCleanup)try{o._posterCamCleanup()}catch(_){}
    o.classList.add("out");
    if(!pan){var _outs=one.querySelectorAll(".one.out");if(_outs.length>2)_outs[0].remove()}
    if(!pan)setTimeout(function(){o.remove()},o.classList.contains("m-poster")?900:1800)
  }
  if(!pan&&(wx||wy||(one.style.transform&&one.style.transform!=="none"))){panGen++;one.style.transition="none";one.style.transform="none";one.style.filter="";wx=0;wy=0}
  if(m==="sonnet"){                  // 商籁自己画整首歌：这里不建 DOM 文字，只保证画布已显示
    sonnetEnter();skyShow(false);
    cur=null;curMode=m;shown=text;shownSig=sigOf(idx);paintStat(true);
    return;
  }
  var box=document.createElement("div");
  box.className="one "+({scatter:"m-scatter",star:"m-star",pan:"m-scatter m-pan",fade:"m-fade",type:"m-type",bounce:"m-bounce",flip:"m-flip",focus:"m-focus",wave:"m-wave",glitch:"m-glitch",poster:"m-poster"})[m];
  if(cfg.color){box.classList.add("cc");box.style.setProperty("--tc",cfg.color)}
  if(cfg.size)box.style.setProperty("--fs2",Math.round(cfg.size*1.7)+"px");
  if(m==="scatter"||pan){box.style.setProperty("--ein",eIn);box.style.setProperty("--eout",eOut)}
  if(m==="fade")box.style.setProperty("--fade",($("fadeT").value/100).toFixed(2)+"s");
  if(m==="type"&&!$("caret").checked)box.classList.add("nocaret");
  if(FXM[m])box.style.setProperty("--k",($("fxK").value/100).toFixed(2));
  if(pan&&cur){var W=stage.clientWidth,H=stage.clientHeight,ang=Math.random()*6.2832,dist=Math.max(W,H)*0.75*($("pdist").value/100)*(0.7+Math.random()*0.6);wx+=Math.cos(ang)*dist;wy+=Math.sin(ang)*dist}
  if(pan)box.style.transform="translate("+wx.toFixed(0)+"px,"+wy.toFixed(0)+"px)";
  if(m==="poster"){
    buildPoster(box,text,dur,cfg);
    one.appendChild(box);cur=box;curMode=m;skyShow(false);
    shown=text;shownSig=sigOf(idx);paintStat(true);
    requestAnimationFrame(function(){requestAnimationFrame(function(){box.classList.add("in")})});
    return;
  }
  var p=document.createElement("p"),chars=[].slice.call(text),n=chars.length;
  /* 逐字延迟的「节拍序号」：空格不占拍、标点跟着前一个字、英文整词算一拍，避免字与字之间出现空档 */
  var ui=[],U=0,pw0=false,po0=false;
  chars.forEach(function(ch,i){
    var isW0=WORDCH.test(ch)&&!CJKCH.test(ch),isT0=TAILCH.test(ch),sp0=/\s/.test(ch);
    if(sp0)ui[i]=Math.max(0,U-1);
    else if(U>0&&((isW0&&pw0)||isT0||po0))ui[i]=U-1;
    else{ui[i]=U;U++}
    pw0=isW0;po0=OPENCH.test(ch);
  });
  U=Math.max(1,U);
  var step=Math.min(1/$("typeV").value,dur*.7/U);
  var sf=Math.min(1,dur*.5/2.4);     /* 打散重组：整句拼完的时间不超过这句时长的一半（最长延迟 .8s + 时长 1.6s = 2.4s） */
  var smart=LY.w!=="fill",unit=null,prevWord=false,prevOpen=false;
  var kara=!!(!tIdle&&AUDIO_ON&&window.WT&&WT[idx]&&m!=="poster"&&WT[idx].length===chars.length); // 逐字歌词：字按时间一个个出现
  chars.forEach(function(ch,i){
    var s=document.createElement("span");s.className="c";s.textContent=ch===" "?"\u00a0":ch;
    s.style.setProperty("--i",i);
    if(m==="scatter"||pan){
      var rd=$("rnd").checked,A=$("amp").value/100,q=pol(A),st=function(k,v){s.style.setProperty(k,v)};
      if(rd){
        st("--x",q[0].toFixed(0)+"px");st("--y",q[1].toFixed(0)+"px");st("--r",(rnd(720)*A).toFixed(0)+"deg");st("--s",(1.2+Math.random()*3).toFixed(2));
        st("--dl",(Math.random()*0.8*sf).toFixed(2)+"s");st("--du",Math.max(.25,(0.6+Math.random())*sf).toFixed(2)+"s");
        q=pol(A);st("--x2",q[0].toFixed(0)+"px");st("--y2",q[1].toFixed(0)+"px");st("--r2",(rnd(720)*A).toFixed(0)+"deg");st("--s2",(0.1+Math.random()*0.6).toFixed(2));
        st("--dlo",(Math.random()*0.2*sf).toFixed(2)+"s");st("--duo",Math.max(.2,(0.3+Math.random()*0.35)*Math.max(.5,sf)).toFixed(2)+"s");
      }else{
        st("--x",(rnd(320)*A).toFixed(0)+"px");st("--y",(rnd(380)*A).toFixed(0)+"px");st("--r",(rnd(300)*A).toFixed(0)+"deg");
      }
    }else if(m==="type"){s.style.setProperty("--dl",(ui[i]*step).toFixed(3)+"s")}
    else if(FXM[m]){
      var gap=Math.min($("fxS").value/1000,dur*.4/U);
      if(m==="glitch"){s.style.setProperty("--dl",(Math.random()*Math.min(.6,dur*.3)).toFixed(2)+"s");s.style.setProperty("--gx",((Math.random()<.5?-1:1)*(8+Math.random()*20)).toFixed(0)+"px")}
      else if(m==="focus")s.style.setProperty("--dl",(ui[i]*gap*.6).toFixed(3)+"s");
      else s.style.setProperty("--dl",(ui[i]*gap).toFixed(3)+"s");
    }
    if(kara)s.style.setProperty("--dl","0s");
    if(smart){
      var isW=WORDCH.test(ch)&&!CJKCH.test(ch),isT=TAILCH.test(ch);
      if(unit&&((isW&&prevWord)||isT||prevOpen)){
        if(unit.className!=="wd"){var w=document.createElement("span");w.className="wd";p.replaceChild(w,unit);w.appendChild(unit);unit=w}
        unit.appendChild(s);
      }else{p.appendChild(s);unit=s}
      prevWord=isW;prevOpen=OPENCH.test(ch);
    }else p.appendChild(s);
  });
  box.appendChild(p);one.appendChild(box);cur=box;curMode=m;
  skyShow(m==="star");
  if(pan)panMove(box);
  shown=text;shownSig=sigOf(idx);paintStat(true);
  if(kara){
    // 逐字歌词：不加 .in，字由 player.js 的 karaPaint 按时间一个个点亮；等两帧后再开始，保证入场动画能播
    box._kara=1;
    requestAnimationFrame(function(){requestAnimationFrame(function(){box._kgo=1;if(cur===box&&window.karaPaint)karaPaint(audio.currentTime)})});
  }else requestAnimationFrame(function(){requestAnimationFrame(function(){box.classList.add("in")})});
}

/* ---- 逐条配置：LN 文本 + CF 每条的独立设置（字号/颜色/动画/停留） ---- */
/* ---- 商籁（Sonnet）：全局风格；画布与 Pixi Ticker 由 SonnetAdapter 管理 ---- */
var SONNET_KEEP_MS=15000;   // 离开商籁后，隐藏画布并停掉 Ticker；超过这个时间没回来就销毁 WebGL 释放显存
function sonnetOK(){var A=window.SonnetAdapter;return !!(A&&typeof A.show==="function"&&typeof A.hide==="function")}
function sonnetEnter(){
  clearTimeout(sonnetKillT);
  if(sonnetOn)return;                       // 幂等：每句换句都会走到这里
  sonnetOn=true;
  stage.classList.add("mode-sonnet");       // CSS：显示 #sonnetHost，隐藏 #one / #sky
  try{window.SonnetAdapter.show()}catch(e){
    console.warn("Sonnet show failed:",e);
    sonnetOn=false;stage.classList.remove("mode-sonnet");
    setTimeout(function(){if(style==="sonnet")setStyle("scatter")},0);
  }
}
function sonnetLeave(){
  if(!sonnetOn)return;
  sonnetOn=false;
  stage.classList.remove("mode-sonnet");
  var A=window.SonnetAdapter;if(!A)return;
  try{A.hide()}catch(_){}                   // 立刻停 Ticker + 藏画布
  clearTimeout(sonnetKillT);
  if(typeof A.destroy==="function")sonnetKillT=setTimeout(function(){if(!sonnetOn){try{A.destroy()}catch(_){}}},SONNET_KEEP_MS);
}
/* 适配器异步建画布失败（WebGL 拿不到等）时调用：退回默认风格，免得一片空白 */
window.__sonnetFailed=function(){if(style==="sonnet")setStyle("scatter")};
function modeOf(i){
  if(style==="sonnet")return sonnetOK()?"sonnet":"scatter";   // 商籁不参与逐句覆盖；适配器没加载时退回打散重组
  var m=cfgOf(i).mode;return(m&&m!=="sonnet")?m:style;
}
function pdUnits(t){var c=window._pdN=window._pdN||{},v=c[t];if(v==null){v=0;posterWords(t).forEach(function(w){v+=pchars(w).length});c[t]=v=v||1}return v}
function secOf(i){
  if(AUDIO_ON && TS.length && audio.duration){
    var s = TS[i] || 0;
    var e = (i+1 < TS.length) ? TS[i+1] : (audio.duration || s + 5);
    return Math.max(0.1, e - s);
  }
  var d=cfgOf(i).dur;if(d>0)return d;
  var b=sec(),pt=$("pdT");
  if(pt&&pt.value==="0"&&modeOf(i)==="poster"){var need=.25+.3*(pdUnits(LN[i])-1)+.65+.4;if(need>b)b=need}
  return b;
}
function sigOf(i){var c=cfgOf(i);return LN[i]+"|"+JSON.stringify([c.size,c.color,c.mode,c.dur])}
function applyItems(){
  var it=window.ITEMS||[];
  var arr=it.map(function(x){return x.t});
  if(!arr.length)arr=["请输入文字"];
  var chg=!LN||arr.length!==LN.length;
  if(!chg){for(var k=0;k<arr.length;k++){if(arr[k]!==LN[k]){chg=true;break}}}
  if(chg)LN=arr;
  CF=it.slice();
  if(!it.length)CF=[{}];
  if(idx>=LN.length)idx=0;
}
/* ---- 预览：实时 / 手动刷新 ---- */
function markDirty(){dirty=1;$("refresh").classList.add("dirty")}
function reqRender(){syncBoxes();if(LIVE)render();else markDirty()}
function reqBg(f){if(LIVE){applyBg();if(f)fadeBg()}else markDirty()}
function reqSky(){if(LIVE)buildSky();else markDirty()}
function refreshAll(){dirty=0;$("refresh").classList.remove("dirty");applyItems();buildSky();render();applyBg();fadeBg()}
$("live").addEventListener("change",function(){LIVE=this.checked;$("refresh").classList.toggle("hide",LIVE);if(LIVE&&dirty)refreshAll()});
$("refresh").onclick=refreshAll;
/* ---- 各动画模式的参数面板：默认风格 + 各条字幕用到的模式 ---- */
function syncBoxes(){
  var u={};u[style]=1;(window.ITEMS||[]).forEach(function(x){if(x.mode)u[x.mode]=1});
  $("sbox").classList.toggle("hide",!(u.scatter||u.pan));
  $("pbox").classList.toggle("hide",!u.pan);
  $("starbox").classList.toggle("hide",!u.star);
  $("fadebox").classList.toggle("hide",!u.fade);
  $("typebox").classList.toggle("hide",!u.type);
  $("fxbox").classList.toggle("hide",!(u.bounce||u.flip||u.focus||u.wave||u.glitch));
  $("posterbox").classList.toggle("hide",!u.poster);
  $("sonnetbox").classList.toggle("hide",style!=="sonnet");
  var gt=$("gtextRow");if(gt)gt.classList.toggle("hide",style==="sonnet");
  pdSync();
}
/* ---- 星空：数量 / 大小 / 速度（星星与流星各自独立） ---- */
function buildSky(){
  sky.innerHTML="";
  var n=+$("stN").value,sz=$("stS").value/100,sp=$("stV").value/100,k,d;
  for(k=0;k<n;k++){
    d=document.createElement("i");
    d.style.left=Math.random()*100+"%";d.style.top=Math.random()*100+"%";
    var w=((2+Math.random()*3)*sz).toFixed(1);d.style.width=w+"px";d.style.height=w+"px";
    if(Math.random()<.1){d.className="big";d.style.opacity=.85;d.style.width=d.style.height=(6*sz).toFixed(1)+"px"}
    else d.style.opacity=(.35+Math.random()*.6).toFixed(2);
    if(Math.random()<.18)d.style.background="rgba(195,215,255,.9)";
    d.style.animationDelay=(-Math.random()*3).toFixed(1)+"s";d.style.animationDuration=((2+Math.random()*3)/sp).toFixed(2)+"s";
    sky.appendChild(d);
  }
  var mon=$("meteorOn").checked;$("mtbox").classList.toggle("hide",!mon);
  if(mon){
    var mn=+$("mtN").value,ms=$("mtS").value/100,mv=$("mtV").value/100;
    for(var m=0;m<mn;m++){
      var me=document.createElement("i");me.className="meteor";
      me.style.left=(5+Math.random()*70)+"%";me.style.top=(5+Math.random()*45)+"%";
      me.style.width=(70*ms).toFixed(0)+"px";me.style.setProperty("--ms",ms);
      var per=(6+Math.random()*3)/mv;
      me.style.animationDuration=per.toFixed(2)+"s";me.style.animationDelay=(m*per/Math.max(1,mn)+Math.random()*1.2).toFixed(2)+"s";
      sky.appendChild(me);
    }
  }
}
function skyShow(on){
  clearTimeout(skyT);
  if(on){sky.classList.remove("hide");void sky.offsetWidth;sky.classList.remove("off")}
  else{sky.classList.add("off");skyT=setTimeout(function(){sky.classList.add("hide")},900)}
}
/* ---- 状态栏：第几条 / 总条数 · 剩余时长 ---- */
function paintStat(force){
  var now=performance.now();if(!force&&now-statT<90)return;statT=now;
  var rm=Math.max(0,(1-prog)*secOf(idx)).toFixed(1),t="第 "+(idx+1)+" / "+LN.length+" 条 · 剩余 "+rm+"s";
  [].forEach.call(document.querySelectorAll(".cnt"),function(c){c.textContent=t});
}
window.onItemsChanged=function(){
  bag=null;syncBoxes();
  if(!LIVE){markDirty();return}
  applyItems();clearTimeout(txtT);
  txtT=setTimeout(function(){if(sigOf(idx)!==shownSig)update();paintStat(true)},350);
};
var renderRaf=raf1(reqRender),applyBgRaf=raf1(function(){reqBg(false)}),skyRaf=raf1(reqSky);
["size","fg","rnd","amp","pcomb","pdist","gtext","tc","sw","sc","shd","rgb","fadeT","typeV","caret","fxS","fxK","pdN","pdC","pdS","pdD","pdE"].forEach(function(id){$(id).addEventListener("input",renderRaf)});
(function(){
  var el=$("camFollow"),lab=$("camFollowV");if(!el)return;
  function label(){
    var v=+el.value,t="跟随";
    if(v<30)t="慵懒";else if(v<55)t="自然";else if(v<80)t="跟随";else t="紧跟";
    if(lab)lab.textContent=t;
  }
  el.addEventListener("input",function(){
    label();
    if(typeof modeOf==="function"&&modeOf(idx)==="poster"){prog=0;update();}
  });
  label();
})();
["stN","stS","stV","meteorOn","mtN","mtS","mtV"].forEach(function(id){$(id).addEventListener("input",skyRaf)});
$("meteorOn").addEventListener("change",function(){$("mtbox").classList.toggle("hide",!this.checked)});
$("speed").addEventListener("input",function(){paintStat(true)});
var aspdRaf = raf1(function(){
  ASPD = $("aspd").value / 100;
  stage.style.setProperty("--aspd", ASPD);
  $("aspdv").textContent = ASPD.toFixed(2) + "×";
  if (LIVE) render(); else markDirty();
});
$("aspd").addEventListener("input", aspdRaf);
$("aspd").dispatchEvent(new Event("input")); // 初始化一次
$("shuf").addEventListener("change",function(){bag=null});
var EIN=[["cubic-bezier(.2,.8,.2,1)","默认"],["ease-in-out","平滑"],["cubic-bezier(.32,.72,0,1)","弹性"],["linear","匀速"]],
    EOUT=[["cubic-bezier(.4,0,.8,.3)","默认"],["cubic-bezier(.7,0,.84,0)","加速"],["ease-in-out","平滑"],["linear","匀速"]];
chips($("easeIn"),EIN,function(){return eIn},function(v){eIn=v;reqRender()});
chips($("easeOut"),EOUT,function(){return eOut},function(v){eOut=v;reqRender()});
function fadeBg(){[$("bg"),$("bgf")].forEach(function(b){if(b.animate)b.animate([{opacity:0},{opacity:1}],{duration:500,easing:"ease-out"})})}
var panGen=0,wx=0,wy=0;
function panMove(box){
  var g=++panGen,dur=Math.min(1.4,secOf(idx)*0.7);
  void one.offsetWidth;
  one.style.transition="transform "+dur+"s cubic-bezier(.65,0,.25,1)";
  one.style.transform="translate("+(-wx).toFixed(0)+"px,"+(-wy).toFixed(0)+"px)";
  var cr=$("camRot").checked,cb=true;
  if((wx||wy)&&one.animate&&cr){
    var ra=(Math.random()<.5?-1:1)*(8+Math.random()*14),kf=[],N=18,k,t,w;
    for(k=0;k<=N;k++){
      t=k/N;w=Math.pow(Math.sin(Math.PI*Math.pow(t,.9)),2);
      kf.push({rotate:(ra*w).toFixed(2)+"deg",offset:t});
    }
    one.animate(kf,{duration:dur*1000,easing:"linear"});
  }
  /* 运动模糊：沿平移方向的定向模糊，强度随移动速度变化（SVG 高斯模糊，x/y 分别取值） */
  if(cb&&(wx||wy)){
    var L=Math.sqrt(wx*wx+wy*wy),peak=Math.min(20,Math.max(6,L/dur/60)),bx=peak*Math.abs(wx)/L,by=peak*Math.abs(wy)/L,mb=$("mbg"),t0=performance.now();
    one.style.filter="url(#mblur)";
    (function step(now){
      if(g!==panGen)return;
      var p=Math.min(1,(now-t0)/(dur*1000)),e=Math.pow(Math.sin(Math.PI*Math.pow(p,.9)),2);
      mb.setAttribute("stdDeviation",(bx*e).toFixed(2)+" "+(by*e).toFixed(2));
      if(p<1)requestAnimationFrame(step);else{mb.setAttribute("stdDeviation","0 0");one.style.filter=""}
    })(t0);
  }else{one.style.filter=""}
  setTimeout(function(){
    if(g!==panGen)return;
    [].slice.call(one.children).forEach(function(c){if(c!==box)c.remove()});
    one.style.transition="none";one.style.transform="none";box.style.transform="none";one.style.filter="";wx=0;wy=0;
  },dur*1000+80);
}
/* ---- 调节页分组菜单：点击标题展开/收起，各组互不影响 ---- */
[].forEach.call(document.querySelectorAll(".gh"),function(b){
  b.addEventListener("click",function(){
    var g=b.parentNode,on=g.classList.toggle("open");
    b.setAttribute("aria-expanded",on?"true":"false");
    if(on)setTimeout(function(){g.scrollIntoView({block:"nearest",behavior:"smooth"})},uiT(460));
  });
});
/* ---- 排版：对齐 / 位置 / 断行 / 边距 / 粗细 / 行距 ---- */
chips($("lyAlign"),[["left","靠左"],["center","居中"],["right","靠右"]],function(){return LY.a},function(v){LY.a=v;renderRaf()});
chips($("lyPos"),[["top","靠上"],["center","居中"],["bottom","靠下"]],function(){return LY.v},function(v){LY.v=v;renderRaf()});
chips($("lyWrap"),[["fill","挤满断行"],["word","按词断行"],["balance","均衡断行"]],function(){return LY.w},function(v){LY.w=v;renderRaf()});
["lyPad","lyFw","lyLh"].forEach(function(id){$(id).addEventListener("input",renderRaf)});
/* ---- 歌曲名显示：音频状态 / 标题变化时刷新舞台 ---- */
(function(){
  var a=document.getElementById("audio");
  if(a)["play","pause","seeked","loadedmetadata","emptied","durationchange"].forEach(function(ev){a.addEventListener(ev,titleSync)});
  ["miT","musicPanelTitle"].forEach(function(id){
    var el=document.getElementById(id);
    if(el&&window.MutationObserver)new MutationObserver(titleSync).observe(el,{childList:true,characterData:true,subtree:true});
  });
})();

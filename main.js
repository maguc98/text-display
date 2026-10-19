/* ===== script block 1 ===== */

document.addEventListener("touchstart",function(){},{passive:true});
var $=function(id){return document.getElementById(id)};
function isMobile(){return window.matchMedia("(max-width: 820px), (pointer: coarse)").matches}
var stage=$("stage"),one=$("one"),sky=$("sky");
/* ===== 音乐播放器核心状态 ===== */
var audio = document.getElementById('audio');
var AUDIO_ON = false;
var TS = [];
var LRC_META = {ti:'',ar:'',al:'',by:''};
var style="scatter",theme=0,idx=0,prog=0,playing=true,last=0,LN=[],cur=null,ASPD=1;
var THEMES=[["紫夜",["#2b1055","#7597de","#d16ba5","#5ffbf1"]],["落日",["#ff512f","#dd2476","#f9d423","#6a11cb"]],["深海",["#0f2027","#2c5364","#00c6ff","#0072ff"]],["墨绿",["#134e5e","#71b280","#c6ffdd","#2c5364"]],["纯黑",["#000000","#0b0b12","#1a1a2e","#000000"]]];
var bgMode="img",imgData="./bg.jpg";
var STY=[["scatter","打散重组"],["star","星空飘字"],["pan","镜头平移"],["fade","淡入淡出"],["type","打字机"]];

function chips(box,list,get,set){
  list.forEach(function(e){var b=document.createElement("button");b.className="chip";b.textContent=e[1];b.onclick=function(){set(e[0]);mark()};box.appendChild(b)});
  function mark(){[].forEach.call(box.children,function(c,i){c.classList.toggle("on",list[i][0]===get())})}
  mark();
}
var STY2=[["bounce","弹跳落字"],["flip","逐字翻转"],["focus","模糊聚焦"],["wave","波浪起伏"],["glitch","故障闪烁"]];
var STY3=[["poster","海报排版"]];
var FXM={bounce:1,flip:1,focus:1,wave:1,glitch:1};
function markStyles(){[$("styles"),$("styles2"),$("styles3")].forEach(function(box,b){var L=b===2?STY3:b?STY2:STY;[].forEach.call(box.children,function(c,i){c.classList.toggle("on",L[i][0]===style)})})}
function setStyle(v){style=v;idx=0;prog=0;reqRender();markStyles()}
chips($("styles"),STY,function(){return style},setStyle);
chips($("styles2"),STY2,function(){return style},setStyle);
chips($("styles3"),STY3,function(){return style},setStyle);
chips($("themes"),THEMES.map(function(t,i){return [i,t[0]]}),function(){return theme},function(v){theme=v;applyPreset(v);reqBg(true)});
chips($("bgm"),[["grad","混色渐变"],["solid","纯色"],["img","自选图片"]],function(){return bgMode},function(v){bgMode=v;$("gbox").classList.toggle("hide",v!=="grad");$("solidbox").classList.toggle("hide",v!=="solid");$("ibox").classList.toggle("hide",v!=="img");reqBg(true)});
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
    var dt=Math.min(.032,Math.max(.001,(t-S.last)/1000));S.last=t;
    if(S.drag){S.x=S.tx;S.v=0}
  else{var k=300,c=qC(15,300);S.v+=(-k*(S.x-S.tx)-c*S.v)*dt;S.x+=S.v*dt}
    var lo=CH[0].offsetLeft-2,hi=CH[CH.length-1].offsetLeft+2;
    if(S.x<lo){S.x=lo;if(S.v<0)S.v=-S.v*.5}else if(S.x>hi){S.x=hi;if(S.v>0)S.v=-S.v*.5}
    S.sv+=(-320*(S.s-S.ts)-qC(15,320)*S.sv)*dt;S.s+=S.sv*dt;draw();
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
glide($("styles"));glide($("styles2"));glide($("styles3"));glide($("bgm"));
/* ---- 动效风格下拉 ---- */
(function(){
  var sel=$("styleSel"),pop=$("stylePop"),grid=pop.firstChild,hub=$("hub"),ALL=STY.concat(STY2,STY3),btns=[];
  ALL.forEach(function(e){var b=document.createElement("button");b.type="button";b.textContent=e[1];b.setAttribute("role","option");
    b.onclick=function(ev){ev.stopPropagation();setStyle(e[0]);close()};grid.appendChild(b);btns.push(b)});
  function label(){for(var i=0;i<ALL.length;i++)if(ALL[i][0]===style){$("styleSelTx").textContent=ALL[i][1];btns.forEach(function(b,j){b.classList.toggle("on",j===i)});return}}
  document.body.appendChild(pop);
  function place(){
    var r=sel.getBoundingClientRect(),vh=window.innerHeight,vw=window.innerWidth,pw=pop.offsetWidth,pad=12,gap=12;
    var spaceUp=r.top-gap-pad-50,spaceDown=vh-r.bottom-gap-pad-120;/* 上方留出顶栏，下方留出"正在播放"条 */
    var full=Math.min(240,btns.length/2*37+6),up;
    if(spaceDown>=full+12)up=false;else if(spaceUp>=full+12)up=true;else up=spaceUp>spaceDown;
    var avail=Math.max(110,up?spaceUp:spaceDown),gh=Math.min(240,avail-12);
    grid.style.maxHeight=gh+"px";
    var ph=pop.offsetHeight,cx=r.left+r.width/2,left=Math.max(8,Math.min(vw-pw-8,cx-pw/2));
    var top=up?r.top-gap-ph:r.bottom+gap;
    pop.style.left=left+"px";pop.style.top=top+"px";
    pop.style.setProperty("--ox",(cx-left)+"px");pop.style.setProperty("--oy",up?"100%":"0%");
    pop.classList.toggle("up",up);pop.classList.toggle("down",!up);
  }
  function open(){label();place();pop.classList.add("show");pop.setAttribute("aria-hidden","false");sel.setAttribute("aria-expanded","true")}
  function close(){pop.classList.remove("show");pop.setAttribute("aria-hidden","true");sel.setAttribute("aria-expanded","false")}
  sel.addEventListener("click",function(e){e.stopPropagation();pop.classList.contains("show")?close():open()});
  document.addEventListener("pointerdown",function(e){if(pop.classList.contains("show")&&!pop.contains(e.target)&&!sel.contains(e.target))close()},true);
  window.addEventListener("resize",close);document.addEventListener("scroll",function(e){if(!pop.contains(e.target))close()},true);
  var _ms=markStyles;markStyles=function(){_ms();label()};
  label();
})();

var LY={a:"center",v:"center",w:"fill"};
var CJKCH=/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/,WORDCH=/[\p{L}\p{N}'\u2019\-]/u,TAILCH=/[，。！？、；：）》」』”’…,.!?;:)\]}%】〉]/,OPENCH=/[“‘《「『（(\[【〈]/;
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
function rnd(a){return ((Math.random()-.5)*a).toFixed(0)}
function pol(A){var a=Math.random()*6.2832,d=(150+Math.random()*250)*A;return [Math.cos(a)*d,Math.sin(a)*d]}

function render(){
  applyItems();
  stage.style.setProperty("--hl",$("fg").value);
  stage.style.setProperty("--aspd", ASPD);
  stage.style.setProperty("--tc",$("tc").value);
  stage.style.setProperty("--sw",$("sw").value+"px");stage.style.setProperty("--sc",$("sc").value);
  var sh=+$("shd").value;
  stage.style.setProperty("--tsh",sh?("0 2px "+(sh*.24).toFixed(1)+"px rgba(0,0,0,"+Math.min(.95,.35+sh*.006).toFixed(2)+"),0 0 "+(sh*.1).toFixed(1)+"px rgba(0,0,0,.6)"):"0 0 0 transparent");
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

/* ---- 海报排版：词语按大小错落散布 + 几何装饰 ---- */
function posterWords(text){
  var out=[];
  try{
    if(window.Intl&&Intl.Segmenter){
      var sg=new Intl.Segmenter("zh",{granularity:"word"}),it=sg.segment(String(text));
      for(var s of it){if(/[\p{L}\p{N}]/u.test(s.segment))out.push(s.segment)}
    }
  }catch(e){out=[]}
  if(!out.length){
    var cs=[].slice.call(String(text)).filter(function(c){return /[\p{L}\p{N}]/u.test(c)});
    for(var i=0;i<cs.length;i+=2)out.push(cs.slice(i,i+2).join(""));
  }
  return out;
}
function posterDeco(box,W,H,dur){
  var N=+$("pdN").value;if(!N)return;
  N=Math.min(N,12);
  var NS="http://www.w3.org/2000/svg";
  var PX=Math.round(W*.38),PY=Math.round(H*.22),WW=W+2*PX,HH=H+2*PY;
  var R=function(a,b){return a+Math.random()*(b-a)},F=function(v){return (+v).toFixed(1)};
  var tc=$("tc").value||'#ffffff',hl=$("fg").value||'#ffd60a';

  /* ===== 静态层：全部画进一张图片 ===== */
  var uid='pd'+(window.__pdid=(window.__pdid||0)+1);
  var hx=R(-W*.4,W*.3),hy=R(-H*.15,H*.3),hw=W*.8,hh=H*.5;
  var hx2=R(W*.1,W*.7),hy2=R(H*.6,H*1.0),hw2=W*.7,hh2=H*.42;
  var cx1=hx+hw/2,cy1=hy+hh/2,r1=Math.max(hw,hh)*0.62;
  var cx2=hx2+hw2/2,cy2=hy2+hh2/2,r2=Math.max(hw2,hh2)*0.62;

  var s='<svg xmlns="'+NS+'" viewBox="0 0 '+WW+' '+HH+'" preserveAspectRatio="none">';
  s+='<defs>';
  s+='<pattern id="'+uid+'p" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.05" fill="'+tc+'"/></pattern>';
  s+='<radialGradient id="'+uid+'g1" gradientUnits="userSpaceOnUse" cx="'+F(cx1)+'" cy="'+F(cy1)+'" r="'+F(r1)+'"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>';
  s+='<radialGradient id="'+uid+'g2" gradientUnits="userSpaceOnUse" cx="'+F(cx2)+'" cy="'+F(cy2)+'" r="'+F(r2)+'"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>';
  s+='<mask id="'+uid+'m1" maskUnits="userSpaceOnUse" x="'+F(-PX*3)+'" y="'+F(-PY*3)+'" width="'+F(WW*4)+'" height="'+F(HH*4)+'"><rect x="'+F(-PX*3)+'" y="'+F(-PY*3)+'" width="'+F(WW*4)+'" height="'+F(HH*4)+'" fill="url(#'+uid+'g1)"/></mask>';
  s+='<mask id="'+uid+'m2" maskUnits="userSpaceOnUse" x="'+F(-PX*3)+'" y="'+F(-PY*3)+'" width="'+F(WW*4)+'" height="'+F(HH*4)+'"><rect x="'+F(-PX*3)+'" y="'+F(-PY*3)+'" width="'+F(WW*4)+'" height="'+F(HH*4)+'" fill="url(#'+uid+'g2)"/></mask>';
  s+='</defs>';
  s+='<g transform="translate('+PX+' '+PY+')" fill="none" stroke="'+tc+'" stroke-width="1.2">';

  s+='<rect x="'+F(hx)+'" y="'+F(hy)+'" width="'+F(hw)+'" height="'+F(hh)+'" fill="url(#'+uid+'p)" opacity="0.34" mask="url(#'+uid+'m1)" stroke="none"/>';
  s+='<rect x="'+F(hx2)+'" y="'+F(hy2)+'" width="'+F(hw2)+'" height="'+F(hh2)+'" fill="url(#'+uid+'p)" opacity="0.26" mask="url(#'+uid+'m2)" stroke="none"/>';

  /* 网格：10 竖 + 15 横（恢复原版） */
  var i;
  for(i=0;i<10;i++){
    var gx=-PX+WW*(i+.5)/10+R(-W*.05,W*.05);
    s+='<line x1="'+F(gx)+'" y1="'+(-PY)+'" x2="'+F(gx+R(-6,6))+'" y2="'+F(H+PY)+'" stroke-opacity="0.18" stroke-width="0.6"/>';
  }
  for(i=0;i<15;i++){
    var gy=-PY+HH*(i+.5)/15+R(-H*.02,H*.02);
    s+='<line x1="'+(-PX)+'" y1="'+F(gy)+'" x2="'+F(W+PX)+'" y2="'+F(gy+R(-6,6))+'" stroke-opacity="0.18" stroke-width="0.6"/>';
  }

  /* 弧线：4 条（恢复原版） */
  var X0=-PX-20,X1=W+PX+20,L=X1-X0;
  function arcStr(y0,a,b,y1,sw){
    return '<path d="M'+F(X0)+' '+F(y0)+'C'+F(X0+L*.3)+' '+F(a)+' '+F(X0+L*.7)+' '+F(b)+' '+F(X1)+' '+F(y1)+'" stroke-opacity="0.5" stroke-width="'+sw+'"/>';
  }
  s+=arcStr(H*R(.22,.36),H*R(.1,.2),H*R(.4,.55),H*R(.34,.5),1.4);
  s+=arcStr(H*R(.62,.74),H*R(.5,.58),H*R(.78,.88),H*R(.68,.8),1.1);
  s+=arcStr(H*R(-.2,-.08),H*R(-.3,-.1),H*R(-.05,.08),H*R(-.15,0),1.1);
  s+=arcStr(H*R(.95,1.08),H*R(.9,1.0),H*R(1.05,1.2),H*R(.98,1.15),1.2);

  /* 角标：12 个（4 固定 + 8 随机） */
  var cp=[[W*.06,H*.04],[W*.93,H*.04],[W*R(.3,.7),H*R(.55,.7)],[W*.08,H*.62]];
  for(i=0;i<8;i++)cp.push([R(-PX*.85,W+PX*.85),R(-PY*.85,H+PY*.85)]);
  for(i=0;i<cp.length;i++){
    var p=cp[i],c=7,rot=R(-3,3);
    s+='<path d="M'+F(p[0]-c)+' '+F(p[1])+'H'+F(p[0]+c)+'M'+F(p[0])+' '+F(p[1]-c)+'V'+F(p[1]+c)+'" stroke-opacity="0.55" stroke-width="0.9" transform="rotate('+F(rot)+' '+F(p[0])+' '+F(p[1])+')"/>';
  }

  /* 小件：按装饰数 1.5 倍生成，类型多样 */
  var smallCount=Math.max(0,Math.round(N*1.5)-5);
  var smallTypes=['ring','ring2','spark','plus','hex','dot'];
  for(i=0;i<smallCount;i++){
    var sx=R(-PX*.85,W+PX*.85),sy=R(-PY*.8,H+PY*.8),sr=R(9,24);
    var tp=smallTypes[Math.floor(Math.random()*smallTypes.length)];
    var op=R(.45,.8).toFixed(2),col=Math.random()<.18?hl:tc;
    if(tp==='ring'){
      s+='<circle cx="'+F(sx)+'" cy="'+F(sy)+'" r="'+F(sr)+'" stroke="'+col+'" stroke-opacity="'+op+'"/>';
    }else if(tp==='ring2'){
      s+='<circle cx="'+F(sx)+'" cy="'+F(sy)+'" r="'+F(sr*1.1)+'" stroke="'+col+'" stroke-opacity="'+op+'"/>';
      s+='<circle cx="'+F(sx)+'" cy="'+F(sy)+'" r="'+F(sr*.6)+'" stroke="'+col+'" stroke-opacity="'+op+'"/>';
      s+='<circle cx="'+F(sx)+'" cy="'+F(sy)+'" r="2.2" fill="'+col+'" fill-opacity="'+op+'" stroke="none"/>';
    }else if(tp==='spark'){
      var q=sr*1.15;
      s+='<path d="M'+F(sx)+' '+F(sy-q)+'Q'+F(sx)+' '+F(sy)+' '+F(sx+q)+' '+F(sy)+'Q'+F(sx)+' '+F(sy)+' '+F(sx)+' '+F(sy+q)+'Q'+F(sx)+' '+F(sy)+' '+F(sx-q)+' '+F(sy)+'Q'+F(sx)+' '+F(sy)+' '+F(sx)+' '+F(sy-q)+'Z" fill="'+col+'" fill-opacity="'+op+'" stroke="none"/>';
    }else if(tp==='plus'){
      s+='<path d="M'+F(sx-sr)+' '+F(sy)+'H'+F(sx+sr)+'M'+F(sx)+' '+F(sy-sr)+'V'+F(sy+sr)+'" stroke="'+col+'" stroke-opacity="'+op+'"/>';
    }else if(tp==='hex'){
      var pts=[];
      for(var h2=0;h2<6;h2++){var ah=h2*1.0472;pts.push(F(sx+Math.cos(ah)*sr)+','+F(sy+Math.sin(ah)*sr))}
      s+='<polygon points="'+pts.join(' ')+'" stroke="'+col+'" stroke-opacity="'+op+'"/>';
    }else{
      s+='<circle cx="'+F(sx)+'" cy="'+F(sy)+'" r="3" fill="'+col+'" fill-opacity="'+op+'" stroke="none"/>';
    }
  }

  /* 小花：静态，5 瓣 + 花蕊 + 放射线 + 随机旋转 */
  var smallFlowers=Math.max(0,Math.round(N*0.3));
  for(i=0;i<smallFlowers;i++){
    var fx2=R(-PX*.85,W+PX*.85),fy2=R(-PY*.8,H+PY*.8),rr2=R(12,20);
    var colF=Math.random()<.18?hl:tc,opF=R(.45,.7).toFixed(2),rotF=R(0,360);
    var gf='<g transform="translate('+F(fx2)+' '+F(fy2)+') rotate('+F(rotF)+')" stroke="'+colF+'" fill="none">';
    for(var k=0;k<5;k++){
      var a2=k*1.2566-1.5708;
      gf+='<circle cx="'+F(Math.cos(a2)*rr2)+'" cy="'+F(Math.sin(a2)*rr2)+'" r="'+F(rr2)+'" stroke-opacity="'+opF+'" stroke-width="1.2"/>';
      gf+='<line x1="0" y1="0" x2="'+F(Math.cos(a2)*rr2*1.75)+'" y2="'+F(Math.sin(a2)*rr2*1.75)+'" stroke-opacity="'+(opF*0.7).toFixed(2)+'" stroke-width="0.8"/>';
    }
    gf+='<circle r="'+F(rr2*0.32)+'" stroke-opacity="'+opF+'" stroke-width="1"/>';
    gf+='</g>';
    s+=gf;
  }

  /* 小菱形：静态，带随机旋转 */
  var smallDia=Math.max(0,Math.round(N*0.2));
  for(i=0;i<smallDia;i++){
    var dx2=R(-PX*.6,W+PX*.6),dy2=R(-PY*.6,H+PY*.6),dd2=R(10,16);
    var colD=Math.random()<.18?hl:tc,opD=R(.45,.7).toFixed(2),rotD=R(-30,30);
    s+='<polygon points="0,'+F(-dd2)+' '+F(dd2)+',0 0,'+F(dd2)+' '+F(-dd2)+',0" stroke="'+colD+'" stroke-opacity="'+opD+'" fill="none" transform="translate('+F(dx2)+' '+F(dy2)+') rotate('+F(rotD)+')"/>';
  }

  s+='</g></svg>';

  var bgImg=document.createElement('img');
  bgImg.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
  bgImg.className='pdeco pdeco-bg';
  bgImg.alt='';
  bgImg.style.cssText='position:absolute;left:'+(-PX)+'px;top:'+(-PY)+'px;width:'+WW+'px;height:'+HH+'px;pointer-events:none;';
  box.appendChild(bgImg);

  /* ===== 动态层：5 个主角，5 条 SMIL 动画源 ===== */
  var mainSvg=document.createElementNS(NS,'svg');
  mainSvg.setAttribute('class','pdeco pdeco-main');
  mainSvg.setAttribute('viewBox','0 0 '+WW+' '+HH);
  mainSvg.setAttribute('preserveAspectRatio','none');
  mainSvg.style.cssText='position:absolute;left:'+(-PX)+'px;top:'+(-PY)+'px;width:'+WW+'px;height:'+HH+'px;pointer-events:none;overflow:visible;';
  var root=document.createElementNS(NS,'g');
  root.setAttribute('transform','translate('+PX+' '+PY+')');
  mainSvg.appendChild(root);
  function el(tag,at,par){var e=document.createElementNS(NS,tag);for(var k in at)e.setAttribute(k,at[k]);if(par)par.appendChild(e);return e}

  var heroes=['flower','dia','tri','frame','ring2'];
  heroes.forEach(function(kd){
    var x=R(-PX*.7,W+PX*.7),y=R(-PY*.6,H+PY*.6),color=Math.random()<.18?hl:tc;
    var outer=el('g',{transform:'translate('+F(x)+' '+F(y)+')'},root);
    var g=el('g',{'class':'ps'},outer);
    g.style.setProperty('--dl',R(0,dur*.55).toFixed(2)+'s');
    g.style.setProperty('--po',R(.55,.8).toFixed(2));
    g.style.setProperty('--rot0',R(-40,40).toFixed(0)+'deg');
    g.style.color=color;

    if(kd==='flower'){
      var rr=R(24,34);
      for(var k=0;k<5;k++){
        var a2=k*1.2566-1.5708,cx=Math.cos(a2)*rr,cy=Math.sin(a2)*rr;
        el('circle',{cx:F(cx),cy:F(cy),r:F(rr),fill:'none',stroke:color,'stroke-opacity':.6,'stroke-width':1.2},g);
        el('line',{x1:0,y1:0,x2:F(Math.cos(a2)*rr*1.55),y2:F(Math.sin(a2)*rr*1.55),stroke:color,'stroke-opacity':.5,'stroke-width':.9},g);
      }
      el('circle',{r:F(rr*.32),fill:'none',stroke:color,'stroke-opacity':.8},g);
    }else if(kd==='dia'){
      var d=R(W*.12,W*.18);
      el('polygon',{points:'0,'+F(-d)+' '+F(d)+',0 0,'+F(d)+' '+F(-d)+',0',fill:'none',stroke:color,'stroke-opacity':.6,'stroke-width':1.2},g);
      el('polygon',{points:'0,'+F(-d*.55)+' '+F(d*.55)+',0 0,'+F(d*.55)+' '+F(-d*.55)+',0',fill:'none',stroke:color,'stroke-opacity':.5,'stroke-width':.7},g);
    }else if(kd==='tri'){
      var s2=R(W*.22,W*.32);
      el('polygon',{points:'0,'+F(-s2)+' '+F(s2*.87)+','+F(s2*.5)+' '+F(-s2*.87)+','+F(s2*.5),fill:color,'fill-opacity':.35,stroke:'none'},g);
    }else if(kd==='frame'){
      var fw=W*R(.62,.85),fh=H*R(.4,.56),fx=R(-W*.2,W*.35),fy=R(-H*.05,H*.45);
      outer.setAttribute('transform','translate(0 0)');
      el('rect',{x:F(fx),y:F(fy),width:F(fw),height:F(fh),fill:'none',stroke:color,'stroke-opacity':.5,'stroke-width':2.6,transform:'rotate('+F(R(-2.5,2.5))+' '+F(fx+fw/2)+' '+F(fy+fh/2)+')'},g);
    }else if(kd==='ring2'){
      var rr2=R(18,28);
      el('circle',{r:F(rr2*1.1),fill:'none',stroke:color,'stroke-opacity':.5,'stroke-width':1.2},g);
      el('circle',{r:F(rr2*.6),fill:'none',stroke:color,'stroke-opacity':.5,'stroke-width':1.2},g);
      el('circle',{r:2.2,fill:color,'fill-opacity':.6,stroke:'none'},g);
    }

    var fdx=R(-10,10).toFixed(0),fdy=R(-10,10).toFixed(0);
    el('animateTransform',{attributeName:'transform',type:'translate',additive:'sum',values:'0 0;'+fdx+' '+fdy+';0 0',keyTimes:'0;.5;1',calcMode:'spline',keySplines:'.42 0 .58 1;.42 0 .58 1',dur:(R(10,18)).toFixed(1)+'s',repeatCount:'indefinite'},outer);
  });

  box.appendChild(mainSvg);
}
function pchars(t){return String(t).match(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]|[^\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]+/g)||[String(t)]}
/* 每个字的出场时间：视频节奏 / 随机 / 自定义。返回 [{dl,du}]（文字顺序） */
function posterTimes(U,dur){
  var N=U.length,mode=$("pdT").value,R=function(a,b){return a+Math.random()*(b-a)},j,out=[];
  var lead=Math.min(.4,dur*.15),budget=Math.max(.6,dur-lead-.2);
  if(mode==="1"){
    var Wd=Math.max(.3,Math.min(.3*(N-1),budget-.75));
    for(j=0;j<N;j++)out.push({dl:.2+R(0,Wd),du:R(.3,.55)});
    return out;
  }
  var st=.25,step=.3,du=.38,ord=U.map(function(u,i){return i});
  if(mode==="2"){
    st=+$("pdD").value/1000;step=+$("pdS").value/1000;du=+$("pdE").value/1000;
    var o=$("pdO").value;
    if(o==="1")ord.reverse();else if(o==="2")ord.sort(function(a,b){return U[b].r-U[a].r||a-b});
  }
  var avail=Math.max(.2,budget-du-st);
  if(N>1&&step*(N-1)>avail)step=Math.max(.04,avail/(N-1));
  for(j=0;j<N;j++)out[ord[j]]={dl:st+step*j,du:du};
  return out;
}
/* 镜头跨句交接：上一句停止时的 cam 位置，新一句从这里继续 */
if(!window.__posterCam) window.__posterCam = { x: null, y: null, vx: 0, vy: 0 };
function buildPoster(box,text,dur,cfg){
  var W=stage.clientWidth||390,H=stage.clientHeight||800;
  var __seed=2166136261;
  for(var __si=0;__si<String(text).length;__si++){__seed^=String(text).charCodeAt(__si);__seed=Math.imul(__seed,16777619)}
  var __qr=(function(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}})(__seed);
  var R=function(a,b){return a+__qr()*(b-a)};
  var words=posterWords(text);if(!words.length)words=[String(text||" ")];
  var n=words.length,base=(cfg&&cfg.size)||+$("size").value,K=+$("pdC").value/100;
  var crowd=Math.max(.62,Math.min(1,8/n));
  var order=words.map(function(w,i){return i}).sort(function(a,b){return words[b].length-words[a].length+(__qr()-.5)*.9});
  var role=words.map(function(){return 0}),nXL=n>=7?2:1;
  var heroLen=0,supportLen=0;
  words.forEach(function(w,i){if(i===order[0])heroLen+=w.length;else supportLen+=w.length});
  var nMD=(supportLen>=heroLen*1.8&&n>=4)?Math.max(1,Math.round(n*.15)):0;
  order.forEach(function(wi,k){role[wi]=k<nXL?2:(k<nXL+nMD?1:0)});
  var mx=14,top=64,bot=170,avail=Math.max(200,H-top-bot);
  /* 1. 字号 / 字距 */
  var items=words.map(function(wd,i){
    var rl=role[i],f=rl===2?(3.5+R(0,1.2))*K:(rl===1?(1.6+R(0,.4))*(.7+.3*K):R(.72,.95)),size=Math.max(14,base*f*crowd);
    var ls=rl===0?R(.32,.55):(rl===1?R(0,.08):0),em=0,cn=[].slice.call(wd).length;
    for(var c of wd)em+=(CJKCH.test(c)?1:.58);
    var maxW=rl===2?W*1.08:W-mx*2,w=(em+cn*ls)*size;if(w>maxW){size*=maxW/w}
    if(rl===2&&cn===1)size=Math.min(size,W*.5);
    w=(em+cn*ls)*size;
    var split=rl>=1&&cn===2&&CJKCH.test(wd[0])&&__qr()<.4;
    return {i:i,wd:wd,rl:rl,size:size,ls:ls,w:w,h:size*1.15,split:split,hh:size*1.15+(split?size*R(1,1.4):0)};
  });
  /* 2. 分行：连续的小字并成一行（同排错落），大字单独占行 */
  var rows=[],cur=[];
  items.forEach(function(it){
    if(it.rl===0){cur.push(it);if(cur.length>=3){rows.push(cur);cur=[]}}
    else{if(cur.length){rows.push(cur);cur=[]}rows.push([it])}
  });
  if(cur.length)rows.push(cur);
  var sumH=0;rows.forEach(function(r){r.h=Math.max.apply(null,r.map(function(t){return t.hh}));sumH+=r.h});
  var sc=Math.min(1,avail*.94/sumH);
  if(sc<1){sc=Math.max(.6,sc);items.forEach(function(it){it.size*=sc;it.w*=sc;it.h*=sc;it.hh*=sc});rows.forEach(function(r){r.h*=sc});sumH*=sc}
  var gapY=(avail-sumH)/Math.max(1,rows.length),y=top,k=0;

  /* ===== 有规律的随机排版：隐形列网格 + 交错锚点 ===== */
  var COLS=W<380?3:4,COLW=(W-mx*2)/COLS;
  function anchorX(kind,w){
    var x;
    if(kind==="c0")x=(W-w)/2;
    else{
      var off=kind.charAt(1)==="1"?COLW:0;
      x=kind.charAt(0)==="l"?(mx+off):(W-w-mx-off);
    }
    return Math.max(mx,Math.min(W-w-mx,x));
  }
  var ANCH=["l0","r0","l1","r1","c0","r0","l0","r1"],ri=0;
  /* 3. 每个字（单元）的出场时间 */
  var U=[];items.forEach(function(it){pchars(it.wd).forEach(function(){U.push({r:it.rl})})});
  var TT=posterTimes(U,dur);

  /* 镜头容器：文字、装饰、仪表都放在里面，一起被镜头带动 */
  var cam=document.createElement("div");
  cam.className="cam";
  box.appendChild(cam);

  posterDeco(cam,W,H,dur);

  /* 弧形仪表层 */
  try{
    var gNS="http://www.w3.org/2000/svg";
    var gauge=document.createElementNS(gNS,"svg");
    gauge.setAttribute("class","gauge");
    gauge.setAttribute("viewBox","0 0 "+W+" "+H);
    gauge.setAttribute("preserveAspectRatio","none");
    var gcx=W*0.5,gcy=H*0.42,gr=Math.min(W,H)*0.34;
    var ring1=document.createElementNS(gNS,"circle");
    ring1.setAttribute("cx",gcx);ring1.setAttribute("cy",gcy);ring1.setAttribute("r",gr);
    ring1.setAttribute("fill","none");
    ring1.setAttribute("stroke","currentColor");
    ring1.setAttribute("stroke-width","1");
    ring1.setAttribute("stroke-opacity","0.18");
    ring1.setAttribute("stroke-dasharray","3 8");
    gauge.appendChild(ring1);
    var startA=-Math.PI*0.7,endA=-Math.PI*0.3;
    var ax1=gcx+Math.cos(startA)*gr,ay1=gcy+Math.sin(startA)*gr;
    var ax2=gcx+Math.cos(endA)*gr,ay2=gcy+Math.sin(endA)*gr;
    var arc1=document.createElementNS(gNS,"path");
    arc1.setAttribute("d","M"+ax1+" "+ay1+" A"+gr+" "+gr+" 0 0 1 "+ax2+" "+ay2);
    arc1.setAttribute("fill","none");
    arc1.setAttribute("stroke","currentColor");
    arc1.setAttribute("stroke-width","2.2");
    arc1.setAttribute("stroke-linecap","round");
    if(!isMobile())arc1.style.animation="gaugePulse 3.6s ease-in-out infinite";
    gauge.appendChild(arc1);
    for(var gi=0;gi<5;gi++){
      var ga=startA+(endA-startA)*(gi/4);
      var gx=gcx+Math.cos(ga)*gr,gy=gcy+Math.sin(ga)*gr;
      var dot=document.createElementNS(gNS,"circle");
      dot.setAttribute("cx",gx);dot.setAttribute("cy",gy);dot.setAttribute("r","2");
      dot.setAttribute("fill","currentColor");
      dot.setAttribute("opacity","0.45");
      gauge.appendChild(dot);
    }
    gauge.style.color=((cfg&&cfg.color)||$("tc").value);
    cam.appendChild(gauge);
  }catch(e){try{console.error("Gauge failed:",e)}catch(_){}}

  var p=document.createElement("p");
  var focusPoints=[];
  function put(it,x,yy,txt){
    var w=document.createElement("span");
    w.className="pwd "+(it.rl===2?"xl":it.rl===1?"md":"sm");
    w.style.setProperty("--lx",x.toFixed(0)+"px");w.style.setProperty("--ly",yy.toFixed(0)+"px");
    w.style.setProperty("--wf",it.size.toFixed(1)+"px");w.style.setProperty("--ls",it.ls.toFixed(2)+"em");
    pchars(txt).forEach(function(ch){
      var s=document.createElement("span"),st=function(a,b){s.style.setProperty(a,b)},t=TT[k]||{dl:0,du:.5};
      s.className="c pc";s.textContent=ch;
      st("--i",Math.min(k*3,18));
      if(it.rl===2){
        /* Hero：从屏幕外远处飞入，带旋转和大小变化 */
        var _a=R(0,1)*Math.PI*2,_d=Math.max(W,H)*(0.7+R(0,0.5));
        st("--ox",(Math.cos(_a)*_d).toFixed(0)+"px");
        st("--oy",(Math.sin(_a)*_d).toFixed(0)+"px");
        st("--r0",R(-30,30).toFixed(0)+"deg");
        st("--s0",R(1.4,1.8).toFixed(2));
        st("--bl","14px");
        st("--ein","cubic-bezier(0.25,1.1,0.4,1)");
        s.classList.add("hero");
        /* 色散边缘 + 主题发光 */
        var glowColor=(cfg&&cfg.color)||$("tc").value;
        st("--tsh","-1.5px 0 rgba(255,40,90,0.55), 1.5px 0 rgba(0,180,255,0.55), 0 0 20px "+glowColor);
      }else{
        /* 普通字：从 360° 随机方向飞入，距离/角度/旋转全随机 */
        var _a2=R(0,1)*Math.PI*2,_d2=Math.max(W,H)*(0.55+R(0,0.5));
        st("--ox",(Math.cos(_a2)*_d2).toFixed(0)+"px");
        st("--oy",(Math.sin(_a2)*_d2).toFixed(0)+"px");
        st("--r0",R(-50,50).toFixed(0)+"deg");
        st("--s0",R(.85,.98).toFixed(2));
        st("--ein","cubic-bezier(0.25,1.1,0.4,1)");
      }
      if(it.rl===2){
        st("--ox2",R(-6,6).toFixed(0)+"px");
        st("--oy2",(-R(40,70)).toFixed(0)+"px");
        st("--s2","1.25");
      }else{
        st("--ox2",R(-10,10).toFixed(0)+"px");
        st("--oy2",(-R(10,24)).toFixed(0)+"px");
      }
      st("--wo",it.rl===2?".95":(it.rl===1?".9":".8"));
      st("--dl",t.dl.toFixed(2)+"s");st("--du",(it.rl===2?Math.max(t.du,.55):t.du).toFixed(2)+"s");
      st("--dlo",(Math.min(k,10)*.008+R(0,.02)).toFixed(2)+"s");st("--duo",R(.2,.3).toFixed(2)+"s");
      w.appendChild(s);k++;
    });
    p.appendChild(w);
    /* 焦点：词块几何中心（split 的两半按字数分摊宽度） */
    if(it.w && it.w>0){
      var pw=it.w;
      if(it.split){pw=it.w/[].slice.call(it.wd).length*[].slice.call(txt).length}
      focusPoints.push({x:x+pw/2,y:yy+(it.h||it.size*1.15)/2});
    }
  }
  /* 方框：文字落下的瞬间，用一个自己描出来的正方形把它圈住（主框 + 错位淡影框 + 四角小方块，落位时轻微转正） */
  var frameN=0;
  function addFrame(it,x,yy,k0,k1){
    if(!(it.w>0)||it.split||k1<=k0)return;
    var asp=it.w/it.h;
    if(it.rl===0){if(asp>2.4||frameN>=6||R(0,1)>.35)return}
    else if(it.rl===1){if(asp>3||frameN>=6||R(0,1)>.75)return}
    else if(asp>3)return;
    frameN++;
    var tw=it.w-(it.ls||0)*it.size,side=Math.max(tw,it.h)+Math.max(12,it.size*(it.rl===2?.3:.4));
    if(side>W*.92)return;
    var cx=x+tw/2,cy=yy+it.size*.56;
    cx=Math.max(side/2+4,Math.min(W-side/2-4,cx));
    var land=0,j;for(j=k0;j<k1;j++){var tj=TT[j]||{dl:0,du:.5};land=Math.max(land,tj.dl+(it.rl===2?Math.max(tj.du,.55):tj.du))}
    var NS="http://www.w3.org/2000/svg",sv=document.createElementNS(NS,"svg"),g=document.createElementNS(NS,"g");
    function E(tag,at,par){var e=document.createElementNS(NS,tag);for(var q in at)e.setAttribute(q,at[q]);par.appendChild(e);return e}
    sv.setAttribute("class","pfr"+(it.rl===2?" hero":""));
    sv.setAttribute("width",side.toFixed(1));sv.setAttribute("height",side.toFixed(1));sv.setAttribute("viewBox","0 0 "+side.toFixed(1)+" "+side.toFixed(1));
    sv.style.left=(cx-side/2).toFixed(1)+"px";sv.style.top=(cy-side/2).toFixed(1)+"px";
    sv.style.setProperty("--fdl",Math.max(0,land-.12).toFixed(2)+"s");
    sv.style.setProperty("--fr0",R(-10,10).toFixed(1)+"deg");
    sv.style.setProperty("--fr1",R(-2.4,2.4).toFixed(1)+"deg");
    g.setAttribute("class","fr");sv.appendChild(g);
    var m=1,sd=side-2*m,o=Math.max(5,Math.min(9,side*.07));
    E("rect",{"class":"sq sq2",x:(m+o).toFixed(1),y:(m+o).toFixed(1),width:sd.toFixed(1),height:sd.toFixed(1),pathLength:1},g);
    E("rect",{"class":"sq",x:m,y:m,width:sd.toFixed(1),height:sd.toFixed(1),pathLength:1},g);
    var cs=Math.max(4,Math.min(7,side*.05));
    [[m,m],[m+sd,m],[m+sd,m+sd],[m,m+sd]].forEach(function(c,ci){
      var e=E("rect",{"class":"cn",x:(c[0]-cs/2).toFixed(1),y:(c[1]-cs/2).toFixed(1),width:cs.toFixed(1),height:cs.toFixed(1)},g);
      e.style.setProperty("--cd",(ci*.07).toFixed(2)+"s");
    });
    p.appendChild(sv);
  }
  function putF(it,x,yy,txt){var k0=k;put(it,x,yy,txt);addFrame(it,x,yy,k0,k)}
  rows.forEach(function(r){
    var kind=ANCH[ri%ANCH.length];ri++;
    var jY=Math.min(gapY*.45,r.h*.2);
    var yy=y+jY*(R(0,1)-.1);

    if(r.length===1){
      var it=r[0],x=anchorX(kind,it.w)+(R(0,1)-.5)*3;
      if(it.w>W-mx*2)x=(W-it.w)/2;
      if(it.split){
        var d=R(0,1)<.5?1:-1,
            dx=d*Math.min(it.size*R(.3,.6),Math.max(0,W-it.w-mx*2)),
            x2=Math.max(mx,Math.min(W-it.size-mx,x+dx));
        put(it,x,yy,it.wd[0]);put(it,x2,yy+it.size*R(1.05,1.35),it.wd.slice(1));
      }else putF(it,x,yy,it.wd);
    }else{
      var tot=0;r.forEach(function(t){tot+=t.w});
      var availW=W-mx*2;
      if(tot>availW){var k2=availW/tot;r.forEach(function(t){t.size*=k2;t.w*=k2;t.h*=k2});tot=availW}
      var gapW=Math.min(r[0].size*1.6,Math.max(8,(availW-tot)/Math.max(1,r.length-1))),
          span=tot+gapW*(r.length-1),
          cx=Math.max(mx,Math.min(W-mx-span,anchorX(kind,span)+(R(0,1)-.5)*2));
      r.forEach(function(t){putF(t,cx,yy,t.wd);cx+=t.w+gapW});
    }
    y+=r.h+gapY;
  });
  cam.appendChild(p);

  /* ===== 弹簧运镜：逐词居中 + 线性牵引 + 欠阻尼过冲（setInterval ~30fps，读全局 prog） ===== */
  if(focusPoints.length>0){
    var FN=focusPoints.length,slot=dur/FN;
    /* 焦点过多（每段 <0.3s）：等间隔降采样，避免镜头抽搐 */
    if(slot<0.3){
      var stepF=Math.ceil(0.3/slot),reduced=[];
      for(var fi=0;fi<FN;fi+=stepF)reduced.push(focusPoints[fi]);
      focusPoints=reduced;FN=focusPoints.length;slot=dur/FN;
    }
    /* ===== 取景框：画面正中央的小矩形（宽 16% × 高 11.5%） =====
       词块中心只要在框内，镜头目标就不动；超出框时，只移动"刚好让词块回到框边缘"的最小距离。
       框很小 → 只有相邻焦点几乎重合时才不动，大多数焦点都会让镜头移动一小段。
       想更小可以把 0.16 / 0.115 继续调低（例如 0.12 / 0.09），想更大就调高。 */
    var BOXW=W*0.06,BOXH=H*0.04,tgtX=[],tgtY=[],prX=0,prY=0;
    for(var ti=0;ti<FN;ti++){
      var fx=focusPoints[ti].x-W/2,fy=focusPoints[ti].y-H/2;
      var nx=Math.max(fx-BOXW/2,Math.min(fx+BOXW/2,prX)),
          ny=Math.max(fy-BOXH/2,Math.min(fy+BOXH/2,prY));
      /* 位移极小就吸附到上一个目标，避免无意义的亚像素抖动 */
      if(Math.abs(nx-prX)<1.5)nx=prX;
      if(Math.abs(ny-prY)<1.5)ny=prY;
      tgtX.push(nx);tgtY.push(ny);prX=nx;prY=ny;
    }

    /* 如果上一句留下了交接位置，就从那里继续；否则走原来的开场推入 */
    var camX, camY, camVX=0, camVY=0, handoffOn=false;
    if(window.__posterCam.x !== null && window.__posterCam.y !== null){
      camX = window.__posterCam.x;
      camY = window.__posterCam.y;
      camVX = window.__posterCam.vx||0;      /* 速度也一起交接：只接位置会让镜头在切句瞬间猛冲 */
      camVY = window.__posterCam.vy||0;
      handoffOn = true;
      /* 交接位置是上一句的 cam 值，不是当前句的目标。
         新句的弹簧会从交接位置平滑追到 tgtX[0]/tgtY[0]，视觉上就是"镜头接着走"。 */
    }else{
      camX = tgtX[0] + W*0.05;
      camY = tgtY[0] + H*0.025;
    }
    /* 交接只用一次：消费掉，避免后续句一直从很旧的位置开始 */
    window.__posterCam.x = null;
    window.__posterCam.y = null;
    window.__posterCam.vx = 0;
    window.__posterCam.vy = 0;
    /* 弹簧更紧、阻尼略低：快速跟随连续目标，保留轻微过冲但不震荡 */
    /* 镜头跟随：滑块 0-100 线性映射到三组参数
       0   = 慵懒：镜头慢半拍，有留白感
       60  = 默认：跟得上，但不过冲
       100 = 紧跟：镜头几乎和文字同步，锐利但略急 */
    var _cf=Math.max(0,Math.min(100,+(($("camFollow")||{}).value||60)))/100;
    var SPK=300+350*_cf;
    var ZETA=0.45+0.25*_cf;
    var SPC=2*ZETA*Math.sqrt(SPK);
    var _leadR=0.25+0.30*_cf;
    var lastNow=performance.now(),ct=0,txL=tgtX[0],tyL=tgtY[0];
    var lead=slot*_leadR;

    /* Catmull-Rom 样条：镜头目标在焦点之间连续移动，经过每个焦点中心。
       没有分段停留，速度由相邻焦点距离自然决定——距离大时快，距离小时慢，但不会停。 */
    function crv(p0,p1,p2,p3,u){
      /* 低张力 Catmull-Rom（张力 m=0.35，标准是 0.5）：
         端点仍然精确等于 p1、p2，但相邻控制点之间的过冲被压到 1px 以内，
         避免删除常数分支后镜头在重复目标之间画出可见的小弧。 */
      var m=0.35,u2=u*u,u3=u2*u;
      return (2*u3-3*u2+1)*p1 + (u3-2*u2+u)*(p2-p0)*m
           + (-2*u3+3*u2)*p2 + (u3-u2)*(p3-p1)*m;
    }
    function tgtAt(camCt){
      var s=camCt/slot;
      if(s<=0)return[tgtX[0],tgtY[0]];
      if(s>=FN-1)return[tgtX[FN-1],tgtY[FN-1]];
      var i=Math.floor(s),u=s-i;
      var i0=Math.max(0,i-1),i1=i,i2=i+1,i3=Math.min(FN-1,i+2);
      return[crv(tgtX[i0],tgtX[i1],tgtX[i2],tgtX[i3],u),
             crv(tgtY[i0],tgtY[i1],tgtY[i2],tgtY[i3],u)];
    }

    /* 游走：时间的连续函数（camStep 与交接共用） */
    function driftAt(tt){
      return[Math.sin(tt*1.1)*20.0+Math.sin(tt*2.3+1.1)*7.0,
             Math.cos(tt*1.3)*16.0+Math.sin(tt*1.9+0.6)*6.0];
    }
    /* 跨句交接缓动：
       只把位置交给新句，弹簧会在切句瞬间被"新目标离得很远"猛拽（速度突变、冲刺）。
       这里改成：新目标 = 新句样条 + 一个"交接偏移"，偏移按临界阻尼曲线衰减到 0。
       偏移的初值/初速度按"镜头此刻的位置与速度"反推，所以切句瞬间镜头的位置、速度、受力都连续，
       之后平滑过渡到新句第一个焦点。HOT 是衰减时间常数（秒）：越小越快到位，越大越缓。 */
    var HOT=0.25,hoOX=0,hoOY=0,hoVX=0,hoVY=0,hoT=0;
    if(handoffOn){
      var h0=performance.now()*0.001,he=0.03;
      var g0=tgtAt(lead),g1=tgtAt(lead+he),d0=driftAt(h0),d1=driftAt(h0+he);
      var lagK=SPC/SPK;     /* 弹簧稳态跟随滞后：匀速 v 时 cam 落后目标 v*SPC/SPK */
      hoOX=camX+camVX*lagK-(g0[0]+d0[0]);
      hoOY=camY+camVY*lagK-(g0[1]+d0[1]);
      hoVX=camVX-((g1[0]+d1[0])-(g0[0]+d0[0]))/he;
      hoVY=camVY-((g1[1]+d1[1])-(g0[1]+d0[1]))/he;
    }

    cam.style.transform="translate3d("+(-camX).toFixed(2)+"px,"+(-camY).toFixed(2)+"px,0)";
    var camRaf=0;
    function camStep(){
      if(!box.parentNode){cancelAnimationFrame(camRaf);camRaf=0;return;}
      var finishing=(box!==window.cur);
      var now=performance.now(),dt=Math.min(0.034,(now-lastNow)/1000);
      lastNow=now;
      camRaf=requestAnimationFrame(camStep);

      /* 1) 推进播放时间（只在播放中且非收尾） */
      if(playing&&!finishing){
        ct+=dt;
        ct+=(prog*dur-ct)*Math.min(1,dt*6);
      }

      /* 2) 目标 = 样条位置 + 永不为零的低频游走。
            游走是时间的连续函数，与播放状态无关——即使样条冻结（取景框内、最后一段、暂停），
            游走仍在变，镜头永远在动。
            幅度：水平 sin(0.65t)×5 + sin(1.73t)×2.5 ≈ 最大 7.5px
                  垂直 cos(0.83t)×4 + sin(1.41t)×2.0 ≈ 最大 6.0px
            周期 3.6–9.7 秒，两个不同频率叠加，是缓慢自然的"手持感"，不是抖动。 */
      var camCt=ct+lead;
      var tg=tgtAt(camCt);
      var tt=now*0.001;
      var dr=driftAt(tt);
      /* 最后一个焦点之后（样条已走完）：游走幅度平滑放大到 1.5 倍，句尾镜头更有活力 */
      var dg=1+0.5*Math.max(0,Math.min(1,camCt/slot-(FN-2)));
      dr=[dr[0]*dg,dr[1]*dg];
      txL=tg[0]+dr[0];tyL=tg[1]+dr[1];
      if(handoffOn){
        /* 交接偏移：(a+b·t)·e^(−t/HOT)，临界阻尼衰减，初值与初速度见上 */
        hoT+=dt;
        var hoE=Math.exp(-hoT/HOT);
        txL+=(hoOX+(hoVX+hoOX/HOT)*hoT)*hoE;
        tyL+=(hoOY+(hoVY+hoOY/HOT)*hoT)*hoE;
        if(hoT>4)handoffOn=false;
      }

      /* 3) 弹簧步进：始终执行（暂停时也追扰动目标，所以暂停时镜头仍在缓慢游走） */
      for(var rem=dt;rem>1e-6;){
        var h=Math.min(rem,1/240);rem-=h;
        camVX+=(-SPK*(camX-txL)-SPC*camVX)*h;
        camVY+=(-SPK*(camY-tyL)-SPC*camVY)*h;
        camX+=camVX*h;camY+=camVY*h;
      }
      cam.style.transform="translate3d("+(-camX).toFixed(2)+"px,"+(-camY).toFixed(2)+"px,0)";

      /* 4) 收尾：切句/出场且弹簧已静止时才停止 RAF（旧 box 即将移除，合理停止） */
      if(finishing&&Math.abs(camVX)+Math.abs(camVY)<0.5&&Math.abs(camX-txL)+Math.abs(camY-tyL)<0.3){
        /* 兜底：即使 update() 没及时快照，停止时也把位置留给下一句 */
        window.__posterCam.x = camX;
        window.__posterCam.y = camY;
        window.__posterCam.vx = camVX;
        window.__posterCam.vy = camVY;
        cancelAnimationFrame(camRaf);camRaf=0;
      }
    }
    /* 暴露当前 cam 位置：update() 切句时用这个快照做交接 */
    box._posterCamSnapshot = function(){ return { x: camX, y: camY, vx: camVX, vy: camVY }; };
camRaf=requestAnimationFrame(camStep);
box._posterCamCleanup=function(){cancelAnimationFrame(camRaf);camRaf=0;box._posterCamSnapshot=null;box._posterCamCleanup=null};
}
try{ if(!one.querySelector(".vig")){ var vig=document.createElement("div"); vig.className="vig"; one.appendChild(vig); } }catch(e){}
try{ if(!window._pNoiseUrl){ var nz=document.createElement("canvas"); nz.width=96; nz.height=96; var nctx=nz.getContext("2d"); if(nctx){ var nid=nctx.createImageData(96,96); var nd=nid.data; for(var ni=0;ni<nd.length;ni+=4){ var nv=Math.random()*255|0; nd[ni]=nv; nd[ni+1]=nv; nd[ni+2]=nv; nd[ni+3]=22; } nctx.putImageData(nid,0,0); window._pNoiseUrl=nz.toDataURL("image/png"); } } if(window._pNoiseUrl&&!one.querySelector(".noise")){ var nzdiv=document.createElement("div"); nzdiv.className="noise"; nzdiv.style.backgroundImage="url('"+window._pNoiseUrl+"')"; one.appendChild(nzdiv); } }catch(e){}
try{ var supportsBlend=(window.CSS&&CSS.supports&&CSS.supports("mix-blend-mode","overlay")); if(!supportsBlend){ var vv=one.querySelector(".vig"),nn=one.querySelector(".noise"); if(vv)vv.classList.add("noblend"); if(nn)nn.classList.add("noblend"); } }catch(e){}
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
function update(){
  var m=modeOf(idx),pan=m==="pan",cfg=cfgOf(idx),dur=secOf(idx),text=LN[idx];
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
    if(!pan)setTimeout(function(){o.remove()},o.classList.contains("m-poster")?900:1800)
  }
  if(!pan&&(wx||wy||(one.style.transform&&one.style.transform!=="none"))){panGen++;one.style.transition="none";one.style.transform="none";one.style.filter="";wx=0;wy=0}
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
  var p=document.createElement("p"),chars=[].slice.call(text),n=chars.length,step=Math.min(1/$("typeV").value,dur*.7/Math.max(1,n));
  var smart=LY.w!=="fill",unit=null,prevWord=false,prevOpen=false;
  chars.forEach(function(ch,i){
    var s=document.createElement("span");s.className="c";s.textContent=ch===" "?"\u00a0":ch;
    s.style.setProperty("--i",Math.min(i,18));
    if(m==="scatter"||pan){
      var rd=$("rnd").checked,A=$("amp").value/100,q=pol(A),st=function(k,v){s.style.setProperty(k,v)};
      if(rd){
        st("--x",q[0].toFixed(0)+"px");st("--y",q[1].toFixed(0)+"px");st("--r",(rnd(720)*A).toFixed(0)+"deg");st("--s",(1.2+Math.random()*3).toFixed(2));
        st("--dl",(Math.random()*0.8).toFixed(2)+"s");st("--du",(0.6+Math.random()).toFixed(2)+"s");
        q=pol(A);st("--x2",q[0].toFixed(0)+"px");st("--y2",q[1].toFixed(0)+"px");st("--r2",(rnd(720)*A).toFixed(0)+"deg");st("--s2",(0.1+Math.random()*0.6).toFixed(2));
        st("--dlo",(Math.random()*0.35).toFixed(2)+"s");st("--duo",(0.4+Math.random()*0.5).toFixed(2)+"s");
      }else{
        st("--x",(rnd(320)*A).toFixed(0)+"px");st("--y",(rnd(380)*A).toFixed(0)+"px");st("--r",(rnd(300)*A).toFixed(0)+"deg");
      }
    }else if(m==="type"){s.style.setProperty("--dl",(i*step).toFixed(3)+"s")}
    else if(FXM[m]){
      var gap=Math.min($("fxS").value/1000,dur*.45/Math.max(1,n));
      if(m==="glitch"){s.style.setProperty("--dl",(Math.random()*Math.min(.6,dur*.3)).toFixed(2)+"s");s.style.setProperty("--gx",((Math.random()<.5?-1:1)*(8+Math.random()*20)).toFixed(0)+"px")}
      else if(m==="focus")s.style.setProperty("--dl",(i*gap*.6+Math.random()*.12).toFixed(3)+"s");
      else s.style.setProperty("--dl",(i*gap).toFixed(3)+"s");
    }
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
  requestAnimationFrame(function(){requestAnimationFrame(function(){box.classList.add("in")})});
}

var bag=null,shown="",txtT=0,curMode="";
function shuf(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}}
function nextIdx(auto){
  if (window.playMode === 2) return idx; // 单曲循环模式，不切下一句
  if(auto&&window.__noLoop&&LN.length>1&&idx>=LN.length-1&&!$("shuf").checked){setPlay(false);return idx}
  var n=LN.length;
  if(!$("shuf").checked||n<2)return (idx+1)%n;
  if(bag===null){bag=[];for(var i=0;i<n;i++)if(i!==idx)bag.push(i);shuf(bag)}
  else if(!bag.length){bag=[];for(var j=0;j<n;j++)bag.push(j);shuf(bag);if(bag[bag.length-1]===idx)bag.unshift(bag.pop())}
  return bag.pop();
}
function tick(ts){
  requestAnimationFrame(tick);
  if(!last)last=ts;var dt=Math.min(.1,(ts-last)/1000);last=ts;

  if(AUDIO_ON && audio && audio.duration && LN.length){
    var ct = audio.currentTime;
    var i = 0;
    for(var k = 0; k < LN.length; k++){
      if((TS[k]||0) <= ct) i = k; else break;
    }
    if(i !== idx){ idx = i; prog = 0; update(); }
    var start = TS[idx] || 0;
    var end = (idx+1 < TS.length) ? TS[idx+1] : (audio.duration || start + 5);
    prog = Math.min(1, Math.max(0, (ct - start) / Math.max(0.1, end - start)));
    if(!playing){ paintTL(); return; }
  } else {
    if(!playing){ paintTL(); return; }
    prog += dt / secOf(idx);
    if(prog >= 1){ prog = 0; idx = nextIdx(true); update(); }
  }

  if(curMode==="poster"&&cur){
    var _d=secOf(idx),_l=Math.min(.4,_d*.15),_o=prog*_d>=_d-_l;
    if(_o&&!cur._po){cur._po=1;cur.classList.add("out")}
    else if(!_o&&cur._po&&prog<1){cur._po=0;cur.classList.remove("out")}
  }
  paintStat();paintTL();
}

/* ---- 全局时间轴 ---- */
var TLS=[],tlLN=null,tlDurs=[],tlTot=0,tlT=0;
function fmtT(t){return t<60?t.toFixed(1)+"s":Math.floor(t/60)+":"+("0"+Math.floor(t%60)).slice(-2)}
function tlBuild(durs){
  TLS=[];tlDurs=durs;tlTot=durs.reduce(function(a,b){return a+b},0);
  [].forEach.call(document.querySelectorAll(".tl"),function(el){
    el.innerHTML="";var segs=[];
    durs.forEach(function(d,i){
      var g=document.createElement("div");g.className="tg";
      g.style.setProperty("--d",d.toFixed(3));g.style.setProperty("--h",(i / durs.length) * 360);
      g.title="第 "+(i+1)+" 条 · "+d.toFixed(1)+"s · "+LN[i];
      el.appendChild(g);segs.push(g);
    });
    var c=document.createElement("div");c.className="cur";el.appendChild(c);
    TLS.push({el:el,segs:segs,cur:c,idx:-1,shuf:null,geo:null,pp:-1});
  });
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
    var durs=[],same=(LN===tlLN&&tlDurs.length===n);
    for(i=0;i<n;i++){durs.push(secOf(i));if(same&&Math.abs(durs[i]-tlDurs[i])>1e-6)same=false}
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
  if(force||now-tlT>100){
    tlT=now;var lab=$("tlt");
    if(lab){
      if(shuf)lab.textContent="共 "+fmtT(tlTot);
      else{var el=0;for(i=0;i<k;i++)el+=tlDurs[i];el+=pg*tlDurs[k];lab.textContent=fmtT(el)+" / "+fmtT(tlTot)}
    }
  }
}

/* ---- 时间轴长按放大镜（按帧节流 + 节点复用） ---- */
var tlSuppT=-1e9;
function tlGo(i){
  bag=null; prog=0; idx=i;
  if(AUDIO_ON && audio && TS.length) audio.currentTime = TS[i] || 0;
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


function raf1(fn){var q=0;return function(){if(q)return;q=requestAnimationFrame(function(){q=0;fn()})}}
/* ---- 逐条配置：LN 文本 + CF 每条的独立设置（字号/颜色/动画/停留） ---- */
var LIVE=true,dirty=0,eIn="cubic-bezier(.2,.8,.2,1)",eOut="cubic-bezier(.2,.8,.2,1)",CF=[],shownSig="",statT=0,skyT=0;
function cfgOf(i){return CF[i]||{}}
function modeOf(i){return cfgOf(i).mode||style}
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
  var it=window.ITEMS||[];LN=it.map(function(x){return x.t});CF=it.slice();
  if(!LN.length){LN=["请输入文字"];CF=[{}]}
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
["size","fg","rnd","amp","pcomb","pdist","gtext","tc","sw","sc","shd","fadeT","typeV","caret","fxS","fxK","pdN","pdC","pdS","pdD","pdE"].forEach(function(id){$(id).addEventListener("input",renderRaf)});
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
var EIN=[["cubic-bezier(.2,.8,.2,1)","默认"],["ease-in-out","平滑"],["cubic-bezier(.34,1.56,.64,1)","弹性"],["linear","匀速"]],
    EOUT=[["cubic-bezier(.2,.8,.2,1)","默认"],["cubic-bezier(.7,0,.84,0)","加速"],["ease-in-out","平滑"],["linear","匀速"]];
chips($("easeIn"),EIN,function(){return eIn},function(v){eIn=v;reqRender()});
chips($("easeOut"),EOUT,function(){return eOut},function(v){eOut=v;reqRender()});
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
    var ez=springCurve(Math.min(QAMP,1.4)*.5),opt={duration:700,easing:ez},
        ds=f1.top-f2.top,dt=s1.top-s2.top;
    if(Math.abs(ds)>1)stage.animate([{transform:"translateY("+ds+"px)"},{transform:"none"}],opt);
    if(Math.abs(dt)>1)st.animate([{transform:"translateY("+dt+"px)"},{transform:"none"}],opt);
    return {ez:ez,ds:ds};
  }
  function done(){self._animating=false}
  if(folding){
    /* 收起：面板和底栏先淡出下沉，再切换布局，画面弹到居中 */
    var outs=[dock,nav].map(function(el,i){
      return el.animate([{opacity:1,transform:"none"},{opacity:0,transform:"translateY(36px)"}],{duration:240,delay:i*30,easing:"cubic-bezier(.4,0,1,1)",fill:"forwards"});
    });
    outs[1].onfinish=function(){
      moveStage();
      outs.forEach(function(a){a.cancel()});
      setTimeout(done,720);
    };
  }else{
    /* 展开：布局一次到位，画面上移的同时，面板和底栏跟在后面淡入、弹起 */
    var r=moveStage(),base=Math.max(0,r.ds);
    [dock,nav].forEach(function(el,i){
      var dly=50+i*60,dy=base+40+i*24;
      el.animate([{opacity:0},{opacity:1}],{duration:380,delay:dly,easing:"ease-out",fill:"backwards"});
      el.animate([{transform:"translateY("+dy+"px)"},{transform:"none"}],{duration:760,delay:dly,easing:r.ez,fill:"backwards"});
    });
    setTimeout(done,900);
  }
};
(function(){
  var box=$("cards"),txt=$("txt"),panel=$("panel"),addb=$("addc"),cnt=$("lcnt");
  var SPR=(function(){var d="cubic-bezier(.34,1.7,.5,1)",v=getComputedStyle(document.documentElement).getPropertyValue("--spring").trim()||d;
    try{document.createElement("i").animate([],{duration:1,easing:v});return v}catch(e){return d}})();
  var GRIP='<svg viewBox="0 0 24 24"><g fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></g></svg>';
  var XI='<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>';
  var GEAR='<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2.2" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="2.2" fill="currentColor" stroke="none"/></svg>';
  var MODES=[[null,"跟随"],["scatter","打散重组"],["star","星空飘字"],["pan","镜头平移"],["fade","淡入淡出"],["type","打字机"],["bounce","弹跳落字"],["flip","逐字翻转"],["focus","模糊聚焦"],["wave","波浪起伏"],["glitch","故障闪烁"],["poster","海报排版"]];
  function list(){return [].slice.call(box.children)}
  function area(c){return c.querySelector("textarea")}
  var SUPPORTS_FS=!!(window.CSS&&CSS.supports&&CSS.supports("field-sizing","content"));
function grow(t){if(SUPPORTS_FS)return;t.style.height="auto";t.style.height=t.scrollHeight+"px"}
  function hasOv(o){return o.size!=null||o.color!=null||o.mode!=null||o.dur!=null}
  function updCount(){
    var its=window.ITEMS||[],tot=its.reduce(function(a,x){return a+(x.dur>0?x.dur:sec())},0);
    cnt.textContent="共 "+its.length+" 句 · 约 "+Math.round(tot)+" 秒";
  }
  /* 汇总为播放用的 ITEMS（空文字不计入）；skip：删除动画期间先排除该卡片 */
  function commit(silent,skip){
    var cs=list(),its=[];
    cs.forEach(function(c,i){
      c.querySelector(".no").textContent=i+1;
      var o=c._o,t=area(c).value.replace(/\n/g," ").trim();
      c.classList.toggle("has-ov",hasOv(o));
      if(t&&c!==skip)its.push({t:t,size:o.size,color:o.color,mode:o.mode,dur:o.dur});
    });
    window.ITEMS=its;updCount();
    if(!silent&&window.onItemsChanged)window.onItemsChanged();
  }
  function focusEnd(t){t.focus();var n=t.value.length;try{t.setSelectionRange(n,n)}catch(_){}}
  /* 单条设置面板的显示同步 */
  function paintCfg(c){
    var o=c._o,q=function(k){return c.querySelector('.crow[data-k="'+k+'"]')},r,sl,v;
    r=q("size");sl=r.querySelector("input");v=o.size!=null?o.size:+$("size").value;sl.value=v;sync(sl);
    r.classList.toggle("ov",o.size!=null);r.querySelector(".cv").textContent=(o.size!=null?"":"跟随 ")+Math.round(v);
    r=q("color");r.querySelector("input").value=o.color||$("tc").value;
    r.classList.toggle("ov",o.color!=null);r.querySelector(".cv").textContent=o.color||"跟随";
    r=q("dur");sl=r.querySelector("input");v=o.dur!=null?o.dur:Math.min(20,Math.max(.5,sec()));sl.value=v;sync(sl);
    r.classList.toggle("ov",o.dur!=null);r.querySelector(".cv").textContent=(o.dur!=null?"":"跟随 ")+v.toFixed(1)+"s";
    r=q("mode");[].forEach.call(r.querySelectorAll(".chip"),function(b,i){b.classList.toggle("on",MODES[i][0]===o.mode)});
    r.classList.toggle("ov",o.mode!=null);
    c.classList.toggle("has-ov",hasOv(o));
  }
  function make(text){
    var c=document.createElement("div");c.className="card";c._o={size:null,color:null,mode:null,dur:null};
    c.innerHTML='<div class="top"><div class="grip" aria-label="拖动排序">'+GRIP+'</div><span class="no"></span><textarea rows="1" enterkeyhint="next" placeholder="输入一句话"></textarea>'+
      '<button class="gear" type="button" aria-label="单条设置">'+GEAR+'</button><button class="del" type="button" aria-label="删除">'+XI+'</button></div>'+
      '<div class="cfg">'+
      '<div class="crow" data-k="size"><span>字号</span><input type="range" min="14" max="80"><em class="cv"></em><button class="rst" type="button" aria-label="恢复跟随">↺</button></div>'+
      '<div class="crow" data-k="color"><span>颜色</span><input type="color"><em class="cv"></em><button class="rst" type="button" aria-label="恢复跟随">↺</button></div>'+
      '<div class="crow" data-k="dur"><span>停留</span><input type="range" min="0.5" max="20"><em class="cv"></em><button class="rst" type="button" aria-label="恢复跟随">↺</button></div>'+
      '<div class="crow top" data-k="mode"><span>动画</span><div class="chips"></div><button class="rst" type="button" aria-label="恢复跟随">↺</button></div>'+
      '</div>';
    var t=area(c),o=c._o;t.value=text;
    [].forEach.call(c.querySelectorAll('input[type=range]'),function(el){el.step="any";wrapRange(el);el.addEventListener("input",function(){sync(el)})});
    t.addEventListener("input",function(){grow(t);commit()});
    t.addEventListener("keydown",function(e){
      if(e.isComposing||e.keyCode===229)return;
      if(e.key==="Enter"&&!e.shiftKey){
        e.preventDefault();
        var L=t.value.slice(0,t.selectionStart),Rt=t.value.slice(t.selectionEnd);
        t.value=L;grow(t);var n=insert(Rt,c);n.focus();n.setSelectionRange(0,0);
      }else if(e.key==="Backspace"&&!t.value&&list().length>1){
        e.preventDefault();var p=c.previousElementSibling||c.nextElementSibling;remove(c);focusEnd(area(p));
      }
    });
    c.querySelector(".del").addEventListener("click",function(){remove(c)});
    c.querySelector(".grip").addEventListener("pointerdown",function(e){startDrag(c,e)});
    c.querySelector(".gear").addEventListener("click",function(){c.classList.toggle("open");if(c.classList.contains("open"))paintCfg(c)});
    var sizeR=c.querySelector('[data-k="size"] input'),colR=c.querySelector('[data-k="color"] input'),durR=c.querySelector('[data-k="dur"] input');
    sizeR.addEventListener("input",function(){o.size=+this.value;paintCfg(c);commit()});
    colR.addEventListener("input",function(){o.color=this.value;paintCfg(c);commit()});
    durR.addEventListener("input",function(){o.dur=+this.value;paintCfg(c);commit()});
    MODES.forEach(function(m){
      var b=document.createElement("button");b.type="button";b.className="chip";b.textContent=m[1];
      b.onclick=function(){o.mode=m[0];paintCfg(c);commit()};
      c.querySelector('[data-k="mode"] .chips').appendChild(b);
    });
    [].forEach.call(c.querySelectorAll(".rst"),function(b){b.addEventListener("click",function(){o[b.parentNode.dataset.k]=null;paintCfg(c);commit()})});
    return c;
  }
  function insert(text,after){
    var c=make(text);box.insertBefore(c,after?after.nextSibling:null);
    grow(area(c));commit();
    if(c.animate)c.animate([{opacity:0,transform:"scale(.9) translateY(-8px)"},{opacity:1,transform:"none"}],{duration:520,easing:(window.__spring||SPR)});
    return area(c);
  }
  function remove(c){
    if(list().length<=1){var t=area(c);t.value="";grow(t);commit();t.focus();return}
    var h=c.offsetHeight;c.style.pointerEvents="none";
    if(!c.animate){c.remove();commit();return}
    c.style.overflow="hidden";
    commit(false,c);
    c.animate([{opacity:1,transform:"scale(1)",height:h+"px",marginBottom:"8px"},{opacity:0,transform:"scale(.88)",height:"0px",marginBottom:"0px",paddingTop:"0px",paddingBottom:"0px"}],
      {duration:300,easing:"cubic-bezier(.3,0,.3,1)",fill:"forwards"}).onfinish=function(){c.remove();commit(true)};
  }
  /* ---- 拖拽排序：占位指示器 + 橡皮筋边界 + 弹簧落位 ---- */
  function startDrag(c,e){
    if(e.button>0)return;e.preventDefault();
    var grip=e.currentTarget;try{grip.setPointerCapture(e.pointerId)}catch(_){}
    var top0=c.offsetTop,hh=c.offsetHeight,w=c.offsetWidth,startY=e.clientY,startScroll=panel.scrollTop,lastY=e.clientY,raf=0,live=true,vis=top0;
    var ph=document.createElement("div");ph.className="slot";ph.style.height=hh+"px";
    box.insertBefore(ph,c);
    c.style.position="absolute";c.style.left="0";c.style.width=w+"px";c.style.top=top0+"px";c.style.marginBottom="0";c.classList.add("dragging");
    if(c.animate)c.animate([{transform:"scale(1)"},{transform:"scale(1.03)"}],{duration:380,easing:(window.__spring||SPR)});
    function others(){return list().filter(function(x){return x!==c&&x!==ph})}
    function apply(){
      var dy=lastY-startY+(panel.scrollTop-startScroll),os=others(),all=os.concat([ph]);
      var lastEl=all.reduce(function(a,x){return x.offsetTop>a.offsetTop?x:a},all[0]);
      var minT=0,maxT=Math.max(0,lastEl.offsetTop+lastEl.offsetHeight-hh);
      var want=top0+dy,clampT=Math.max(minT,Math.min(maxT,want)),over=want-clampT;
      vis=clampT+(over?(over>0?1:-1)*Math.min(34,Math.abs(over)*.38):0);            /* 越界时橡皮筋式阻尼 */
      var centerY=clampT+hh/2,pos=0,before=0,k,x;
      os.forEach(function(sb){if(sb.offsetTop+sb.offsetHeight/2<centerY)pos++});
      var order=list();for(k=0;k<order.length;k++){x=order[k];if(x===ph)break;if(x!==c)before++}
      if(pos!==before){
        var tops=os.map(function(sb){return sb.getBoundingClientRect().top});
        box.insertBefore(ph,os[pos]||null);
        os.forEach(function(sb,i){var d=tops[i]-sb.getBoundingClientRect().top;
          if(d&&sb.animate)sb.animate([{transform:"translateY("+d+"px)"},{transform:"none"}],{duration:340,easing:(window.__spring||SPR)})});
      }
      c.style.top=vis+"px";
    }
    function tick(){
      if(!live)return;
      var r=panel.getBoundingClientRect();
      if(lastY<r.top+40)panel.scrollTop-=9;else if(lastY>r.bottom-40)panel.scrollTop+=9;
      apply();raf=requestAnimationFrame(tick);
    }
    function move(ev){lastY=ev.clientY}
    function up(){
      live=false;cancelAnimationFrame(raf);
      grip.removeEventListener("pointermove",move);grip.removeEventListener("pointerup",up);grip.removeEventListener("pointercancel",up);
      var from=vis;
      box.insertBefore(c,ph);ph.remove();
      c.style.position="";c.style.left="";c.style.width="";c.style.top="";c.style.marginBottom="";c.classList.remove("dragging");
      var d=from-c.offsetTop;
      if(c.animate)c.animate([{transform:"translateY("+d+"px) scale(1.03)"},{transform:"none"}],{duration:560,easing:(window.__spring||SPR)});
      commit();
    }
    grip.addEventListener("pointermove",move);grip.addEventListener("pointerup",up);grip.addEventListener("pointercancel",up);
    tick();
  }
  addb.addEventListener("click",function(){var n=insert("",list()[list().length-1]);n.focus();panel.scrollTop=panel.scrollHeight});
  ["speed","size","tc"].forEach(function(id){$(id).addEventListener("input",function(){
    updCount();list().forEach(function(c){if(c.classList.contains("open"))paintCfg(c)})})});
  var init=txt.value.split("\n").map(function(x){return x.trim()}).filter(Boolean);
  if(!init.length)init=[""];
  var frag=document.createDocumentFragment();
init.forEach(function(x){frag.appendChild(make(x))});
box.appendChild(frag); // 一次插入，只触发一次布局
list().forEach(function(c){grow(area(c))});commit(true);
  if(window.ResizeObserver){var _cw=0;new ResizeObserver(function(){
  var w=box.clientWidth;if(w===_cw)return;_cw=w;
  list().forEach(function(c){grow(area(c))})
}).observe(box)}
  window.__setCards=function(its){
    var arr=its&&its.length?its:[{t:""}];
    box.innerHTML="";
    var fr=document.createDocumentFragment();
    arr.forEach(function(x){
      var c=make(x.t||""),o=c._o;
      o.size=x.size==null?null:x.size;o.color=x.color==null?null:x.color;o.mode=x.mode==null?null:x.mode;o.dur=x.dur==null?null:x.dur;
      fr.appendChild(c);
    });
    box.appendChild(fr);
    list().forEach(function(c){grow(area(c));paintCfg(c)});
    commit(true);
  };
})();
var IC={
 pause:'<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="2.1" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="2.1" fill="currentColor"/></svg>',
 play:'<svg viewBox="0 0 24 24"><path d="M8.4 6.4v11.2L17.6 12z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>',
 next:'<svg viewBox="0 0 24 24"><path d="M5.5 6.6v10.8L14.8 12z" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M18.8 6.2v11.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>'};
[].forEach.call(document.querySelectorAll(".ppb"),function(b){b.innerHTML=IC.pause});
[].forEach.call(document.querySelectorAll(".nxb"),function(b){b.innerHTML=IC.next});
function wrapRange(el){if(el.parentNode&&el.parentNode.className==="rw")return;var w=document.createElement("i");w.className="rw";el.parentNode.insertBefore(w,el);w.appendChild(el);var g=document.createElement("i");g.className="gt";w.appendChild(g)}
function sync(el){wrapRange(el);var f=(el.value-el.min)/(el.max-el.min);el.style.setProperty("--p",(f*100)+"%");el.style.setProperty("--f",f);if(el.parentNode)el.parentNode.style.setProperty("--f",f)}
[].forEach.call(document.querySelectorAll("input[type=range]"),function(el){el.step="any";sync(el);el.addEventListener("input",function(){sync(el)})});
function setPlay(v){
  playing=v;stage.classList.toggle("paused",!v);
  if(AUDIO_ON && audio){
    if(v) audio.play().catch(function(){});
    else audio.pause();
  }
  [].forEach.call(document.querySelectorAll(".ppb"),function(b){b.innerHTML=v?IC.pause:IC.play});
}
function gotoIdx(i, playNow){
  idx = i; prog = 0;
  if(AUDIO_ON && audio && TS.length) audio.currentTime = TS[i] || 0;
  update();
  if(playNow && !playing) setPlay(true);
}
/* ---- LRC 解析 ---- */
function parseLRC(txt){
  var lines = String(txt).split(/\r?\n/), out = [], meta = {};
  var re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  lines.forEach(function(line){
    var m = line.match(/^\[(ti|ar|al|by|offset):(.*)\]\s*$/i);
    if(m){ meta[m[1].toLowerCase()] = m[2].trim(); return; }
    re.lastIndex = 0;
    var times = [], mm;
    while((mm = re.exec(line))){
      var frac = mm[3] ? parseFloat('0.' + mm[3]) : 0;
      times.push(+mm[1]*60 + +mm[2] + frac);
    }
    if(!times.length) return;
    var text = line.replace(re, '').trim();
    if(!text) return;
    times.forEach(function(t){ out.push({t:t, text:text}); });
  });
  out.sort(function(a,b){ return a.t - b.t; });
  return {items: out, meta: meta};
}

function applyLRC(lrc){
  var its = lrc.items;
  if(!its.length){ alert('这个 LRC 里没有解析到歌词'); return; }
  LRC_META = lrc.meta || {};
  var cards = document.querySelectorAll('#cards .card');
  if(cards.length === its.length){
    cards.forEach(function(c, i){
      var ta = c.querySelector('textarea');
      if(ta){ ta.value = its[i].text; ta.dispatchEvent(new Event('input')); }
    });
  } else {
    window.__setCards(its.map(function(x){ return {t: x.text}; }));
  }
  TS = its.map(function(x){ return x.t; });
  idx = 0; prog = 0;
  if(AUDIO_ON && audio && TS.length) audio.currentTime = TS[0] || 0;
  refreshAll();
  updateAudioInfo();
  if(window.updateMusicPanel) window.updateMusicPanel();
}

function fmtDur(s){
  if(!s || !isFinite(s)) return '--:--';
  var m = Math.floor(s/60), sec = Math.floor(s%60);
  return m + ':' + (sec<10?'0':'') + sec;
}
function updateAudioInfo(){
  var el = document.getElementById('audioInfo');
  if(!el) return;
  if(!audio.src){ el.textContent = '未加载音频 · 当前为固定时长模式'; return; }
  var name = LRC_META.ti || decodeURIComponent((audio.src.split('/').pop()||'音频').split('?')[0]);
  var ar = LRC_META.ar ? ' · ' + LRC_META.ar : '';
  el.textContent = name + ar + ' · ' + fmtDur(audio.duration);
}

document.getElementById('pickAudio').onclick = function(){ document.getElementById('audioFile').click(); };
document.getElementById('audioFile').onchange = function(){
  var f = this.files[0]; this.value = ''; if(!f) return;
  audio.src = URL.createObjectURL(f);
  audio.load();
};
document.getElementById('pickLrc').onclick = function(){ document.getElementById('lrcFile').click(); };
document.getElementById('lrcFile').onchange = function(){
  var f = this.files[0]; this.value = ''; if(!f) return;
  var r = new FileReader();
  r.onload = function(){ applyLRC(parseLRC(r.result)); };
  r.readAsText(f, 'utf-8');
};

audio.addEventListener('loadedmetadata', function(){
  AUDIO_ON = true;
  if(LN.length && TS.length !== LN.length){
    var d = audio.duration || 0, n = LN.length;
    if(d > 0 && isFinite(d)){
      TS = [];
      for(var k = 0; k < n; k++) TS.push(d * k / n);
    }
  }
  updateAudioInfo();
  refreshAll();
});
audio.addEventListener('play',  function(){ playing = true;  stage.classList.remove('paused'); [].forEach.call(document.querySelectorAll('.ppb'),function(b){b.innerHTML=IC.pause}); });
audio.addEventListener('pause', function(){ playing = false; stage.classList.add('paused');    [].forEach.call(document.querySelectorAll('.ppb'),function(b){b.innerHTML=IC.play});  });
audio.addEventListener('ended', function(){
  if(window.__noLoop){ setPlay(false); return; }
  if(document.getElementById('shuf').checked){ gotoIdx(nextIdx(true), true); }
  else { gotoIdx(0, true); }
});
audio.addEventListener('error', function(){
  AUDIO_ON = false;
  updateAudioInfo();
});
/* 已取消：点击屏幕暂停/播放
stage.addEventListener("click",function(e){
  setPlay(!playing);
});
*/
[].forEach.call(document.querySelectorAll(".ppb"),function(b){b.onclick=function(e){e.stopPropagation();setPlay(!playing)}});
[].forEach.call(document.querySelectorAll(".nxb"),function(b){b.onclick=function(e){e.stopPropagation();gotoIdx(nextIdx(),false)}});
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
      (function(el){el._g=setTimeout(function(){el.classList.remove("go")},400)})(e);
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
  var dt=Math.min(.032,Math.max(.001,(t-T.last)/1000));T.last=t;
if(T.drag){T.x=T.tx;T.v=0}
  else{var k=340,c=qC(12,340);T.v+=(-k*(T.x-T.tx)-c*T.v)*dt;T.x+=T.v*dt}
  /* 撞墙回弹：冲到底栏两端时被"弹回"，保留强回弹但不会飞出去 */
  var lo=bx(0)-2,hi=bx(NB.length-1)+2;
  if(T.x<lo){T.x=lo;if(T.v<0)T.v=-T.v*.7}else if(T.x>hi){T.x=hi;if(T.v>0)T.v=-T.v*.7}
  T.sv+=(-420*(T.s-T.ts)-qC(11,420)*T.sv)*dt;T.s+=T.sv*dt;
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
      bg.style.filter="none";
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
function useImg(cv){
  imgData=cv.toDataURL("image/jpeg",.88);
  if(bgMode!=="img")$("bgm").children[2].click();else{applyBg();fadeBg()}
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
applyPreset(0);render();$("gbox").classList.toggle("hide",bgMode!=="grad");$("ibox").classList.toggle("hide",bgMode!=="img");$("solidbox").classList.toggle("hide",bgMode!=="solid");applyBg();requestAnimationFrame(tick);
/* ---- Q弹幅度：阻尼弹簧曲线统一驱动 --spring，并联动 JS 弹簧阻尼 ---- */
var QAMP=1;
function qC(c0,k){var a=(typeof QAMP==="number")?QAMP:1;if(a>=1)return c0/a;return c0+(2*Math.sqrt(k)-c0)*(1-a)}
function springCurve(a){
  var ok=window.CSS&&CSS.supports&&CSS.supports("transition-timing-function","linear(0,1)");
  if(!ok)return "cubic-bezier(.34,"+(1+.7*a).toFixed(3)+",.5,1)";
  if(a<=.02)return "cubic-bezier(.22,1,.36,1)";
  var o=.274*a,L=Math.log(o),z=-L/Math.sqrt(Math.PI*Math.PI+L*L),D=5.2,wd=D*Math.sqrt(1-z*z)/z,N=48,pts=[];
  for(var i=0;i<=N;i++){var t=i/N,v=1-Math.exp(-D*t)*(Math.cos(wd*t)+(D/wd)*Math.sin(wd*t));pts.push(i===N?"1":(+v.toFixed(4)).toString())}
  return "linear("+pts.join(", ")+")";
}
function applySpring(a){
  QAMP=a;
  if(Math.abs(a-1)<.005){document.documentElement.style.removeProperty("--spring");window.__spring=null;return}
  var c=springCurve(a);document.documentElement.style.setProperty("--spring",c);window.__spring=c;
}
function setQ(v,from){
  v=Math.max(0,Math.min(200,+v||0));applySpring(v/100);
  var e=document.getElementById("qamp");if(e&&e!==from){e.value=v;sync(e)}
  var qv=document.getElementById("qv");if(qv)qv.textContent=Math.round(v)+"%";
  try{localStorage.setItem("qamp",String(v))}catch(_){}
}
function bindQamp(){
  var e = document.getElementById("qamp");
  // #qamp 现在是动态插入到 #pg5 里的，未加载时直接跳过；插入后会再调用一次
  if(!e || e._qb) return;
  e._qb = 1;
  e.addEventListener("input", function(){ setQ(e.value, e) });
  e.addEventListener("change", function(){ var d=document.getElementById("qdemo"); if(d) d.checked=!d.checked });
  setQ(Math.round(QAMP*100)); // 把滑块位置和百分比文字同步到已保存的值
}
bindQamp();
var qrstOld=$("qrst");if(qrstOld)qrstOld.onclick=function(){setQ(100);var d=$("qdemo");if(d)d.checked=!d.checked};
(function(){var sv=null;try{sv=localStorage.getItem("qamp")}catch(_){}setQ(sv!=null&&sv!==""?+sv:100)})();
setTimeout(function(){
  var qampEl = document.getElementById("qamp");
  if(qampEl) sync(qampEl);
}, 100);
/* ---- 底部控制栏 ---- */
(function(){
  var cfs = $("cfs"), menu = $("mediaMenu");
  if(!cfs || !menu) return;

  // 点击按钮：切换菜单
  cfs.onclick = function(e) {
    e.stopPropagation();
    qOpen(false); // 关闭旁边的 Q弹菜单
    menu.classList.toggle("show");
  };

  // 点击外部关闭菜单
  document.addEventListener("pointerdown", function(e) {
    if (menu.classList.contains("show") && !menu.contains(e.target) && !cfs.contains(e.target)) {
      menu.classList.remove("show");
    }
  }, true);

  // 选择音频
  $("btnPickAudio").onclick = function() {
    menu.classList.remove("show");
    $("audioFile").click();
  };

  // 导入 LRC
  $("btnPickLrc").onclick = function() {
    menu.classList.remove("show");
    $("lrcFile").click();
  };
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
    var v=Math.round(Math.max(0,Math.min(40,+rg.value||0)));
    root.style.setProperty("--gb",v+"px");lab.textContent=v+"px";sync(rg);
    if(save)try{localStorage.setItem("gb",String(v))}catch(_){}
  }
  rg.addEventListener("input",function(){apply(1)});
  rg.addEventListener("change",function(){var d=$("qdemo");d.checked=!d.checked});
  try{var b=localStorage.getItem("gb");if(b!==null&&b!=="")rg.value=b}catch(_){}
  apply(0);
})();

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


/* ---- 调节页分组菜单：点击标题展开/收起，各组互不影响 ---- */
[].forEach.call(document.querySelectorAll(".gh"),function(b){
  b.addEventListener("click",function(){
    var g=b.parentNode,on=g.classList.toggle("open");
    b.setAttribute("aria-expanded",on?"true":"false");
    if(on)setTimeout(function(){g.scrollIntoView({block:"nearest",behavior:"smooth"})},460);
  });
});
/* ---- 排版：对齐 / 位置 / 断行 / 边距 / 粗细 / 行距 ---- */
chips($("lyAlign"),[["left","靠左"],["center","居中"],["right","靠右"]],function(){return LY.a},function(v){LY.a=v;renderRaf()});
chips($("lyPos"),[["top","靠上"],["center","居中"],["bottom","靠下"]],function(){return LY.v},function(v){LY.v=v;renderRaf()});
chips($("lyWrap"),[["fill","挤满断行"],["word","按词断行"],["balance","均衡断行"]],function(){return LY.w},function(v){LY.w=v;renderRaf()});
["lyPad","lyFw","lyLh"].forEach(function(id){$(id).addEventListener("input",renderRaf)});
/* ---- 自动保存 / 导出 / 导入 ---- */
(function(){
  var SK="td_autosave",LOADING=false,touched=false,saveT=0,lastStr="",quotaWarned=false;
  var G_IDS=["size","tc","fg","sw","sc","shd"],BG_IDS=["solidc","ang","gflow","imgBlur","imgDim"],P_IDS=["speed","aspd"],LY_IDS=["lyPad","lyFw","lyLh"];
  var SKIP={txt:1,live:1,qdemo:1,qamp:1,qImmerse:1,gblurOn:1,gbamp:1,cz:1,file:1,pgFile:1,impFile:1};
  var STYS=STY.concat(STY2,STY3).map(function(e){return e[0]});
  var MODE_RE=/^(scatter|star|pan|fade|type|bounce|flip|focus|wave|glitch|poster)$/,IMG_RE=/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\/=]+$/i,COL_RE=/^#[0-9a-f]{6}$/i;
  function p2(n){return (n<10?"0":"")+n}
  function inList(list,v){return list.indexOf(v)>=0}
  function num(v,lo,hi){return typeof v==="number"&&isFinite(v)?Math.min(hi,Math.max(lo,v)):null}
  function okImg(v){return typeof v==="string"&&v.length>0&&(IMG_RE.test(v)||/\.(jpg|jpeg|png|webp|gif)$/i.test(v))?v:""}
  function getV(id){var e=$(id);return !e?null:(e.type==="checkbox"?e.checked:e.value)}
  function setV(id,v){
    var e=$(id);if(!e||v==null||!/^(INPUT|SELECT)$/.test(e.tagName)||e.type==="file")return;
    if(e.type==="checkbox"){e.checked=!!v;return}
    if(e.type==="color"){if(typeof v==="string"&&COL_RE.test(v))e.value=v;return}
    if(e.type==="range"){var n=parseFloat(v);if(!isFinite(n))return;e.value=n;sync(e);return}
    e.value=String(v);
  }
  function isQuota(e){return !!e&&(e.name==="QuotaExceededError"||e.name==="NS_ERROR_DOM_QUOTA_REACHED"||e.code===22||e.code===1014)}
  function stamp(){var el=$("bkTime");if(!el)return;var d=new Date();el.textContent="上次自动保存："+p2(d.getHours())+":"+p2(d.getMinutes())+":"+p2(d.getSeconds())}

  /* 当前全部状态 → 一个可序列化对象 */
  function snapshot(){
    var its=window.ITEMS||[],o={app:"text-display",v:1};
    o.LN=its.map(function(x){return x.t});
    o.CF=its.map(function(x){return {size:x.size,color:x.color,mode:x.mode,dur:x.dur}});
    o.G={};G_IDS.forEach(function(id){o.G[id]=getV(id)});o.G.style=style;o.G.theme=theme;
    o.BG={bgMode:bgMode,imgData:imgData,isSq:!!window.isBgSquare};BG_IDS.forEach(function(id){o.BG[id]=getV(id)});
    o.LY={a:LY.a,v:LY.v,w:LY.w};LY_IDS.forEach(function(id){o.LY[id]=getV(id)});
    o.P={};P_IDS.forEach(function(id){o.P[id]=getV(id)});
    var ui={},skip=G_IDS.concat(BG_IDS,P_IDS,LY_IDS);
    [].forEach.call(document.querySelectorAll("input[id],select[id]"),function(e){
      if(SKIP[e.id]||e.type==="file"||inList(skip,e.id))return;
      ui[e.id]=getV(e.id);
    });
    o.X={ui:ui,eIn:eIn,eOut:eOut,pgData:pgData,pgLum:pgLum};
    o.TS = TS.slice();
    o.LRC_META = LRC_META;
    o.cover = window.customCoverData || "";
    return o;
  }

  function saveData(){
    clearTimeout(saveT);saveT=0;
    var o=snapshot(),str=JSON.stringify(o);
    if(str===lastStr)return true;
    try{localStorage.setItem(SK,str);lastStr=str;quotaWarned=false;stamp();return true}
    catch(e){
      if(isQuota(e)){
        /* 空间不够：文字和设置照常保存，图片沿用上一次已保存的版本 */
        try{
          var old=null;try{old=JSON.parse(localStorage.getItem(SK))}catch(_){}
          if(old&&old.BG&&old.BG.imgData)o.BG.imgData=old.BG.imgData;else delete o.BG.imgData;
          if(old&&old.X&&old.X.pgData){o.X.pgData=old.X.pgData;o.X.pgLum=old.X.pgLum}else{delete o.X.pgData;delete o.X.pgLum}
          if(old&&old.cover)o.cover=old.cover;else delete o.cover;
          localStorage.setItem(SK,JSON.stringify(o));
        }catch(_){}
        if(!quotaWarned&&!document.hidden){quotaWarned=true;alert("存储空间不足，请及时导出备份")}
      }
      return false;
    }
  }
  function scheduleSave(){if(LOADING)return;touched=true;clearTimeout(saveT);saveT=setTimeout(saveData,500)}
  function flush(){if(LOADING||!touched)return;saveData()}

  function markBox(id,vals,v){var b=$(id);if(!b)return;[].forEach.call(b.children,function(c,i){c.classList.toggle("on",vals[i]===v)})}

  /* 把一个状态对象恢复到页面上 */
  function applyState(d){
    if(!d||typeof d!=="object")return false;
    var ok=true;LOADING=true;
    try{
      var G=d.G||{},BG=d.BG||{},P=d.P||{},L=d.LY||{},X=d.X||{},ui=X.ui||{},skip=G_IDS.concat(BG_IDS,P_IDS,LY_IDS);
      G_IDS.forEach(function(id){setV(id,G[id])});
      BG_IDS.forEach(function(id){setV(id,BG[id])});
      P_IDS.forEach(function(id){setV(id,P[id])});
      LY_IDS.forEach(function(id){setV(id,L[id])});
      Object.keys(ui).forEach(function(id){if(SKIP[id]||inList(skip,id))return;setV(id,ui[id])});
      if(inList(STYS,G.style))style=G.style;
      var th=parseInt(G.theme,10);if(th>=0&&th<THEMES.length)theme=th;
      if(inList(["grad","solid","img"],BG.bgMode))bgMode=BG.bgMode;
      var im=okImg(BG.imgData);if(im){imgData=im;window.isBgSquare=!!BG.isSq}
      if(inList(["left","center","right"],L.a))LY.a=L.a;
      if(inList(["top","center","bottom"],L.v))LY.v=L.v;
      if(inList(["fill","word","balance"],L.w))LY.w=L.w;
      if(inList(EIN.map(function(e){return e[0]}),X.eIn))eIn=X.eIn;
      if(inList(EOUT.map(function(e){return e[0]}),X.eOut))eOut=X.eOut;
      if(typeof X.pgData==="string")pgData=okImg(X.pgData);
      if(Array.isArray(d.TS)) TS = d.TS.map(function(v){ return +v || 0; });
      if(d.LRC_META && typeof d.LRC_META === 'object') LRC_META = d.LRC_META;
      var pl=num(X.pgLum,0,1);if(pl!==null)pgLum=pl;
      window.customCoverData = okImg(d.cover) || "";
      ASPD=$("aspd").value/100;$("aspdv").textContent=ASPD.toFixed(2)+"×";
      idx=0;prog=0;bag=null;
      /* 按钮高亮 / 分区显隐 */
      markStyles();
      markBox("themes",THEMES.map(function(t,i){return i}),theme);
      markBox("bgm",["grad","solid","img"],bgMode);
      markBox("easeIn",EIN.map(function(e){return e[0]}),eIn);
      markBox("easeOut",EOUT.map(function(e){return e[0]}),eOut);
      markBox("lyAlign",["left","center","right"],LY.a);
      markBox("lyPos",["top","center","bottom"],LY.v);
      markBox("lyWrap",["fill","word","balance"],LY.w);
      $("gbox").classList.toggle("hide",bgMode!=="grad");
      $("solidbox").classList.toggle("hide",bgMode!=="solid");
      $("ibox").classList.toggle("hide",bgMode!=="img");
      /* 卡片：文字 LN + 单条设置 CF */
      if(Array.isArray(d.LN)&&window.__setCards){
        var cf=Array.isArray(d.CF)?d.CF:[],items=[];
        d.LN.forEach(function(t,i){
          var c=cf[i]&&typeof cf[i]==="object"?cf[i]:{};
          items.push({t:String(t==null?"":t),size:num(c.size,14,80),color:typeof c.color==="string"&&COL_RE.test(c.color)?c.color:null,
            mode:typeof c.mode==="string"&&MODE_RE.test(c.mode)?c.mode:null,dur:num(c.dur,.5,20)});
        });
        window.__setCards(items);
      }
    }catch(e){ok=false;try{console.error(e)}catch(_){}}
    try{applyPg();refreshAll()}catch(e){ok=false;try{console.error(e)}catch(_){}}
    LOADING=false;
    return ok;
  }

  function loadData(){
    var raw=null;try{raw=localStorage.getItem(SK)}catch(_){return false}
    if(!raw)return false;
    var d=null;try{d=JSON.parse(raw)}catch(_){return false}
    return applyState(d);
  }

  /* 导出 */
  function exportData(){
    var o=snapshot();o.time=new Date().toISOString();
    var blob=new Blob([JSON.stringify(o)],{type:"application/json"}),d=new Date(),
        name="文字显示器备份-"+d.getFullYear()+"-"+p2(d.getMonth()+1)+"-"+p2(d.getDate())+".json",
        url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;a.style.display="none";
    document.body.appendChild(a);a.click();
    setTimeout(function(){if(a.parentNode)a.parentNode.removeChild(a);URL.revokeObjectURL(url)},2000);
  }
  /* 导入 */
  function importFile(f){
    var r=new FileReader();
    r.onerror=function(){alert("导入失败：无法读取这个文件")};
    r.onload=function(){
      var d=null;try{d=JSON.parse(r.result)}catch(_){}
      if(!d||typeof d!=="object"||(!Array.isArray(d.LN)&&!d.G&&!d.BG)){alert("导入失败：这不是有效的备份文件");return}
      if(!confirm("导入会覆盖当前所有内容，确定继续吗？"))return;
      if(!applyState(d)){alert("导入时部分内容无法恢复，请检查备份文件")}
      touched=true;saveData();
    };
    r.readAsText(f);
  }
  $("expBtn").onclick=exportData;
  $("impBtn").onclick=function(){$("impFile").click()};
  $("impFile").onchange=function(){var f=this.files&&this.files[0];this.value="";if(f)importFile(f)};

  /* 选图 / 删图 不触发 input 事件，单独挂钩 */
  var _useImg=useImg;useImg=function(cv){_useImg(cv);scheduleSave()};
  var _applyPg=applyPg;applyPg=function(){_applyPg.apply(this,arguments);scheduleSave()};

  loadData();

  document.addEventListener("input",scheduleSave,true);
  document.addEventListener("change",scheduleSave,true);
  function clk(e){var t=e.target;if(t&&t.closest&&t.closest("button,.chip,.seg,.grip,.card"))scheduleSave()}
  document.addEventListener("click",clk,true);
  document.addEventListener("pointerup",clk,true);
  document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")flush()});
  window.addEventListener("pagehide",flush);
  window.saveData=saveData;window.loadData=loadData;
})();

/* ===== script block 2 ===== */

/* ---- v0.0.2 布局：迷你条 ⇄ 小卡片 ---- */
(function(){
  var B=document.body,g=function(i){return document.getElementById(i)};
  var mini=g("mini"),back=g("hback"),stg=g("stage");
  var npT=g("npT"),miT=g("miT"),tile=g("miTile"),cover=g("hubCover"),ckey="";
  var ckey2="";
  function paintCover(){
    var bg=g("bg");
    var bgImg=(typeof bgMode!=="undefined"&&bgMode==="img"&&typeof imgData!=="undefined"&&imgData)?imgData:"";
    var val,key;
    /* --cover：背景页图片 / 背景光晕，只跟背景走 */
    if(bgImg){key="i"+bgImg.length+bgImg.slice(-48);val="url('"+bgImg+"')"}
    else{var bi=bg.style.backgroundImage;
      if(bi&&bi!=="none"){key="g"+bi;val=bi}
      else{var c=bg.style.backgroundColor||"#1c1c24";key="c"+c;val="linear-gradient("+c+","+c+")"}}
    if(key!==ckey){ckey=key;B.style.setProperty("--cover",val)}
    
    /* --cover2：图一（迷你条小封面）和图二（卡片大封面）的独立封面；没设置时回退到 --cover */
    var cc=window.customCoverData||"";
    var k2=cc?"i"+cc.length+cc.slice(-48):"";
    
    if(k2!==ckey2){
      var oldCkey2 = ckey2;
      ckey2 = k2;
      
      // 读取渐变速度
      var speed = parseFloat(document.getElementById("qFadeSpeed") ? document.getElementById("qFadeSpeed").value : 1.5);
      
      // 交叉渐变动画（在写入新图之前，先把旧图复制成一层盖在上面，再淡出）
      if(cc && speed > 0 && oldCkey2) {
        var nImg = document.getElementById("npImg");
        var targets = [tile, nImg];
        targets.forEach(function(el){
          if(!el) return;
          var oldBg = getComputedStyle(el).backgroundImage;
          if(oldBg && oldBg !== 'none' && oldBg.indexOf('gradient') === -1) {
            var oldLayer = document.createElement("div");
            oldLayer.style.cssText = "position:absolute;inset:0;background-size:cover;background-position:center;z-index:1;pointer-events:none;border-radius:inherit;background-image:" + oldBg + ";";
            
            if(getComputedStyle(el).position === 'static') el.style.position = 'relative';
            el.style.overflow = "hidden";
            el.appendChild(oldLayer);
            
            void oldLayer.offsetHeight;
            oldLayer.style.transition = "opacity " + speed + "s ease";
            oldLayer.style.opacity = "0";
            setTimeout(function(){ oldLayer.remove(); }, speed * 1000);
          }
        });
      }
      
      if(cc){
        B.style.setProperty("--cover2","url('"+cc+"')");
      } else {
        B.style.removeProperty("--cover2");
      }
    }
    
    cover.classList.toggle("img",!!bgImg);
    if(tile) tile.classList.toggle("img",!!(cc||bgImg));
  }

  // ===== 独立封面上传 =====
  var coverFile=document.createElement('input');
  coverFile.type='file';coverFile.accept='image/*';coverFile.style.display='none';
  document.body.appendChild(coverFile);
  coverFile.onchange=function(){
    var f=this.files[0];this.value="";if(!f)return;
    var r=new FileReader();
    r.onload=function(){
      var im=new Image();
      im.onload=function(){
        // 如果页面上有 openCrop 函数，调用它进行 1:1 裁剪
        if (typeof openCrop === "function") {
          openCrop(im, function(croppedCanvas){
            // 裁剪界面已完全关闭；延迟 2.5 秒（2500毫秒）再执行渐变
            setTimeout(function(){
              window.customCoverData = croppedCanvas.toDataURL('image/jpeg', 0.85);
              paintCover();
              document.dispatchEvent(new Event('change')); // 触发自动保存
            }, 2500);
          }, {
            ratio: 1, 
            max: 800, 
            title: "裁剪专属封面 · 1:1", 
            sub: "拖动选择显示位置，双指或滑杆缩放"
          });
        } else {
          // 兜底：如果没有裁剪器，按原逻辑压缩
          var maxW=800,maxH=800;
          var scale=Math.min(1,maxW/im.width,maxH/im.height);
          var cvs=document.createElement('canvas');
          cvs.width=Math.max(1,Math.round(im.width*scale));cvs.height=Math.max(1,Math.round(im.height*scale));
          cvs.getContext('2d').drawImage(im,0,0,cvs.width,cvs.height);
          window.customCoverData=cvs.toDataURL('image/jpeg',0.85);
          paintCover();
          document.dispatchEvent(new Event('change'));
        }
      };
      im.src=r.result;
    };
    r.readAsDataURL(f);
  };

  // 点击小封面，直接弹出修改图片（大封面在播放卡片里同样绑定）
  // if(tile) tile.addEventListener('click',function(e){e.stopPropagation();coverFile.click();}); // 已取消：点击迷你条封面不再弹出换图
  function isOpen(){return B.classList.contains("open")}
  function setOpen(on){
    on=!!on;
    // 打开右侧前，强制关闭左侧播放卡片
    if(on) {
      var npCardEl = document.getElementById("npCard");
      if (npCardEl && npCardEl.classList.contains("show")) {
        if (typeof npClose === "function") npClose();
      }
    }
    if(isOpen()===on)return;
    B.classList.toggle("open",on);
    mini.setAttribute("aria-expanded",on?"true":"false");
    if(!on&&typeof qOpen==="function")qOpen(false);
    if(on&&typeof putThumb==="function"&&typeof curK==="function")setTimeout(function(){putThumb(curK(),true)},0);
  }
  mini.addEventListener("click",function(e){
    if(e.target.closest&&e.target.closest("button"))return;
    setOpen(!isOpen());
  });
  mini.addEventListener("keydown",function(e){
    if((e.key==="Enter"||e.key===" ")&&e.target===mini){e.preventDefault();setOpen(!isOpen())}
  });
  var miSet=g("miSet");
  if(miSet)miSet.addEventListener("click",function(e){e.stopPropagation();setOpen(true)});

  /* ---- 播放卡片：上滑迷你条弹出，下滑 / 点外面收起 ---- */
  var npCard=document.createElement("div");npCard.id="npCard";npCard.setAttribute("role","dialog");npCard.setAttribute("aria-hidden","true");
  npCard.innerHTML='<div class="np-grab"></div><div class="np-cov"><div class="np-img" id="npImg">文</div></div>'
    +'<div class="np-t" id="npTt">—</div><div class="np-s1" id="npS1"></div><div class="np-s2" id="npS2"></div>'
    +'<div class="np-row">'
    +'<button class="np-b" type="button" data-a="prev" aria-label="上一句"><svg viewBox="0 0 24 24"><path d="M18.5 6.6v10.8L9.2 12z" fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M5.2 6.2v11.6" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>'
    +'<button class="np-b" type="button" data-a="play" aria-label="暂停/继续"></button>'
    +'<button class="np-b" type="button" data-a="next" aria-label="下一句"></button>'
    +'<span class="np-sp"></span>'
    +'<button class="np-b" type="button" data-a="mode" id="npModeBtn" aria-label="播放模式"></button>'
    +'</div>';
  document.body.appendChild(npCard);
  var npPlay=npCard.querySelector('[data-a="play"]'),npNext=npCard.querySelector('[data-a="next"]');
  npNext.innerHTML=IC.next;

  // 播放模式相关
  window.playMode = 0; // 0:顺序, 1:随机, 2:重复
  var npModeBtn = npCard.querySelector("#npModeBtn");
  var modeIcons = [
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h12M4 12h12M4 18h12"/><path d="M17 15l3 3-3 3"/></svg>',
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3"/></svg>'
  ];
  if(npModeBtn) {
    npModeBtn.innerHTML = modeIcons[0];
  }
  var npImg=npCard.querySelector("#npImg"),npTt=npCard.querySelector("#npTt"),npS1=npCard.querySelector("#npS1"),npS2=npCard.querySelector("#npS2"),npTimer=0;
  npImg.addEventListener("click",function(e){e.stopPropagation();coverFile.click()});
  var isNpDragging = false; // 拖拽抽屉期间为 true：npRefresh 只直接赋值，不做淡入动画
  // 直接设置文字（不动画），并同步 fadeSwap 用的目标值，避免之后比较出错
  function npSetNow(el,txt){
    clearTimeout(el._ft);el._tgt=txt;
    if(el.textContent!==txt)el.textContent=txt;
    el.style.removeProperty('transition');el.style.opacity='1';
  }
  function npRefresh(){
    // 如果正在拖拽，直接更新文字内容，不加任何动画，保证流畅度
    if(isNpDragging){
      npSetNow(npTt,curT(miT));
      var st0=mini.querySelector(".mi-s");
      var s10=st0 ? st0.textContent : "";
      if(npS1.textContent !== s10) npS1.textContent = s10;
      var n0=0,nx0="";try{n0=LN.length;nx0=String((LN[(idx+1)%n0]||"")).replace(/\s+/g," ").trim()}catch(_){}
      npSetNow(npS2,nx0&&n0>1?"下一句 · "+nx0:"");
      if(npImg.textContent !== tile.textContent) npImg.textContent = tile.textContent;
      npImg.classList.toggle("img",tile.classList.contains("img"));
      var isPlay0=(typeof playing!=="undefined"&&playing)?1:0;
      if(npPlay._p !== isPlay0){npPlay._p=isPlay0;npPlay.innerHTML=isPlay0?IC.pause:IC.play}
      return;
    }
    // 1. 标题：保留柔和动画
    fadeSwap(npTt,curT(miT));
    
    // 2. 进度/剩余时间：直接赋值，绝对不添加动画，防止跳变闪烁
    var st=mini.querySelector(".mi-s");
    var s1=st ? st.textContent : "";
    if(npS1.textContent !== s1) npS1.textContent = s1;
    
    // 3. 下一句：保留柔和动画
    var n=0,nx="";try{n=LN.length;nx=String((LN[(idx+1)%n]||"")).replace(/\s+/g," ").trim()}catch(_){}
    var s2Text = nx&&n>1?"下一句 · "+nx:"";
    fadeSwap(npS2,s2Text);
    
    // 4. 封面首字 / 播放键图标：刷新率提到 50ms 后，只在真的变了才写 DOM（否则按钮里的图标每 50ms 重建一次）
    if(npImg.textContent !== tile.textContent) npImg.textContent = tile.textContent;
    npImg.classList.toggle("img",tile.classList.contains("img"));
    var isPlay=(typeof playing!=="undefined"&&playing)?1:0;
    if(npPlay._p !== isPlay){npPlay._p=isPlay;npPlay.innerHTML=isPlay?IC.pause:IC.play}
  }
  function npOpen(){
    // 打开左侧前，强制关闭右侧工具栏
    if(B.classList.contains("open")) {
      if (typeof setOpen === "function") setOpen(false);
    }
    
    npRefresh();clearInterval(npTimer);npTimer=setInterval(npRefresh,50);
    npCard.classList.add("show");npCard.setAttribute("aria-hidden","false");
    if(!B.classList.contains("np-open"))B.classList.add("np-open");
  }
  function npClose(){
    clearInterval(npTimer);
    npCard.classList.remove("show");
    npCard.setAttribute("aria-hidden","true");
    if(B.classList.contains("np-open"))B.classList.remove("np-open"); // 恢复底部小白条（先判断再删：无条件 remove 也会触发 class 变动，被下面的 MutationObserver 反复调用 npClose 造成死循环）
  }
  npCard.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest("button");if(!b)return;e.stopPropagation();
    var a=b.getAttribute("data-a");
    if(a==="prev"){var n=LN.length||1;gotoIdx((idx-1+n)%n,false)}
    else if(a==="next"){gotoIdx(nextIdx(),false)}
    else if(a==="play"){setPlay(!playing)}
    else if(a==="mode"){
      window.playMode = (window.playMode + 1) % 3;
      npModeBtn.innerHTML = modeIcons[window.playMode];
      // 联动原来的随机复选框（只有在随机模式下才勾选 shuf）
      var shufChk = document.getElementById("shuf");
      if (shufChk) { shufChk.checked = (window.playMode === 1); shufChk.dispatchEvent(new Event("change")); }
    }
    npRefresh();
  });
  // ====== 迷你条左右滑动逻辑 ======
  (function(){
    var sx=0,sy=0,down=false,swiped=false;
    mini.addEventListener("pointerdown",function(e){
      swiped=false;
      if(e.target.closest&&e.target.closest("button"))return;
      sx=e.clientX;sy=e.clientY;down=true;
    });
    mini.addEventListener("pointerup",function(e){
      if(!down)return;down=false;
      var dx=e.clientX-sx,dy=e.clientY-sy;
      if(Math.abs(dx)>36&&Math.abs(dx)>Math.abs(dy)*1.5){B.classList.toggle("mx",dx>0);swiped=true}
      else if(dy<-36&&Math.abs(dy)>Math.abs(dx)*1.5){npOpen();swiped=true}
    });
    mini.addEventListener("pointercancel",function(){down=false});
    mini.addEventListener("click",function(e){if(swiped){swiped=false;e.stopImmediatePropagation();e.preventDefault()}},true);
    mini.addEventListener("keydown",function(e){
      if(e.target!==mini)return;
      if(e.key==="ArrowRight")B.classList.add("mx");else if(e.key==="ArrowLeft")B.classList.remove("mx");
    });
  })();
  // ====== 滑动逻辑结束 ======

  // ====== 底部抽屉 (Bottom Sheet) 动画逻辑 ======
  var miGrab = document.createElement('div');
  miGrab.className = 'mi-grab';
  mini.appendChild(miGrab);
  var npGrab = npCard.querySelector('.np-grab');
  
  var isDragging = false, dragFromMini = false, startY = 0, fullH = 0, endTimer = 0;
  var PT = 10, PB = 12; // 卡片上下内边距（与 CSS 一致），高度收到 0 时必须一起归零，否则会残留一条边
  // 清掉所有行内样式，交回给 CSS 管理
  function resetCard() {
    npCard.style.cssText = '';
  }

  // 把卡片设成"比例 p"的样子：p=0 完全消失（只剩小白条），p=1 完整卡片
  function paint(p, h) {
    npCard.style.height = h + 'px';
    npCard.style.paddingTop = (PT * p) + 'px';
    npCard.style.paddingBottom = (PB * p) + 'px';
    npCard.style.pointerEvents = p > 0 ? 'auto' : 'none';
    if (p > 0) {
      npCard.style.background = 'rgba(65, 65, 75, ' + (0.45 * p) + ')';
      npCard.style.boxShadow = '0 18px 50px rgba(0,0,0,' + (0.25 * p) + ')';
      npCard.style.backdropFilter = ''; npCard.style.webkitBackdropFilter = '';
    } else {
      // 高度为 0 时连毛玻璃模糊一起去掉，否则会留下一条黑边
      npCard.style.background = 'transparent';
      npCard.style.boxShadow = 'none';
      npCard.style.backdropFilter = 'none'; npCard.style.webkitBackdropFilter = 'none';
    }
  }

  function startDrag(e, fromMini, y0) {
    isNpDragging = true;
    e.preventDefault();
    e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch(_) {}
    clearTimeout(endTimer);
    // 卡片已经展开时，迷你条上的小白条也只负责"往下收"
    if (fromMini && npCard.classList.contains('show')) fromMini = false;
    dragFromMini = fromMini;
    npRefresh(); // isNpDragging 为 true：文字直接就位、不淡入，露出时就是最新内容
    
    npCard.classList.add('show');
    npCard.style.transition = 'none';
    npCard.style.height = 'auto';
    npCard.style.paddingTop = ''; npCard.style.paddingBottom = '';
    npCard.style.opacity = '1';
    npCard.style.visibility = 'visible';
    npCard.style.transform = 'none';
    fullH = npCard.offsetHeight;
    
    isDragging = true;
    startY = (typeof y0 === 'number') ? y0 : e.clientY;
    
    if (fromMini) {
      paint(0, 0); // paint 会把 pointerEvents 设成 none，露出后在 paint(p>0) 里恢复 auto
    }
  }

  function moveDrag(e) {
    if (!isDragging) return;
    var dy = e.clientY - startY;
    var currentH = dragFromMini ? (0 - dy) : (fullH - dy);
    currentH = Math.max(0, Math.min(fullH, currentH));
    paint(currentH / fullH, currentH);
  }

  function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    var dy = e.clientY - startY;
    var shouldOpen = dragFromMini ? (-dy > 80) : (dy <= 80);
    
    npCard.style.transition = 'height 0.35s cubic-bezier(0.32, 0.72, 0, 1), padding 0.35s cubic-bezier(0.32, 0.72, 0, 1), background 0.35s, box-shadow 0.35s';

    if (shouldOpen) {
      paint(1, fullH);
      if (typeof npOpen === 'function') npOpen();
      endTimer = setTimeout(function(){
        if (isDragging) return;
        resetCard();
        npCard.classList.add('show');
      }, 350);
    } else {
      paint(0, 0);
      if (typeof npClose === 'function') npClose();
      endTimer = setTimeout(function(){
        if (isDragging) return;
        // 先在隐藏状态下清理，避免满尺寸卡片闪现；最终只留下小白条
        npCard.style.cssText = 'transition:none;visibility:hidden;opacity:0';
        void npCard.offsetHeight;
        npCard.classList.remove('show'); // 彻底隐藏卡片
        npCard.style.cssText = '';
      }, 350);
    }
    isNpDragging = false;
  }

  if (miGrab) {
    var gPending = false, gX = 0, gY = 0, gDragged = false;
    miGrab.addEventListener('pointerdown', function(e){
      gDragged = false; gPending = true; gX = e.clientX; gY = e.clientY;
      try { miGrab.setPointerCapture(e.pointerId); } catch(_) {} // 鼠标移出 20px 高的小白条后仍能收到 move（触屏本来就隐式捕获）；click 仍会冒泡给迷你条
      try { miGrab.setPointerCapture(e.pointerId); } catch(_) {}
      e.stopPropagation(); // 只挡 pointerdown（避免迷你条横滑/上滑逻辑重复触发）；不 preventDefault，单击照常产生
    });
    miGrab.addEventListener('pointermove', function(e){
      if (isDragging) { moveDrag(e); return; }
      if (!gPending) return;
      var dx = e.clientX - gX, dy = e.clientY - gY;
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        gPending = false; gDragged = true;
        startDrag(e, true, gY);
        moveDrag(e);
      } else if (Math.abs(dx) > 10) {
        gPending = false; // 横向为主：不是抽屉拖拽
      }
    });
    miGrab.addEventListener('pointerup', function(e){ gPending = false; endDrag(e); });
    miGrab.addEventListener('pointercancel', function(e){ gPending = false; endDrag(e); });
    // 只有真的拖过才吞掉 click；普通单击放行给迷你条（展开/收起面板）
    miGrab.addEventListener('click', function(e){
      if (gDragged) { gDragged = false; e.stopPropagation(); e.preventDefault(); }
    });
  }
  if (npGrab) {
    npGrab.addEventListener('pointerdown', function(e){ startDrag(e, false); });
    npGrab.addEventListener('pointermove', moveDrag);
    npGrab.addEventListener('pointerup', endDrag);
    npGrab.addEventListener('pointercancel', endDrag);
  }
  // ====== 抽屉动画逻辑结束 ======
  document.addEventListener("pointerdown",function(e){
    // 如果点击的是裁剪界面（#crop）及其内部元素，直接跳过，不触发关闭逻辑
    if(e.target && e.target.closest && e.target.closest("#crop")) return;
    
    if(npCard.classList.contains("show")&&!npCard.contains(e.target)&&!mini.contains(e.target))npClose();
  },true);
  new MutationObserver(function(){if(B.classList.contains("open"))npClose()}).observe(B,{attributes:true,attributeFilter:["class"]});
  back.addEventListener("click",function(){setOpen(false)});
  g("cfold").onclick=function(e){if(e)e.stopPropagation();setOpen(false)};
  /* 卡片展开时，点一下背景 = 收起（不触发暂停） */
  document.addEventListener("click",function(e){
    if(!isOpen())return;
    if(stg.contains(e.target)){e.stopPropagation();e.preventDefault();setOpen(false)}
  },true);
  /* 当前句子 → 迷你条 / 卡片标题 */
  var last=null;
  /* 文字淡出 -> 换字 -> 淡入（纯透明度，没有位移）。_tgt 记住"正在换成什么"，避免 50ms 刷新时反复重置 */
  function curT(el){return el._tgt!==undefined?el._tgt:el.textContent}
  function fadeSwap(el,txt){
    if(curT(el)===txt)return;
    el._tgt=txt;clearTimeout(el._ft);
    el.style.transition="opacity .14s ease";el.style.opacity="0";
    el._ft=setTimeout(function(){
      el.textContent=txt;
      el.style.transition="opacity .22s ease";el.style.opacity="1";
    },150);
  }
  function tick(){
    paintCover();
    var s="";try{s=(LN&&LN[idx])||""}catch(_){}
    s=String(s).replace(/\s+/g," ").trim();
    if(s===last)return;last=s;
    var t=s||"—";
    
    fadeSwap(npT,t);
    fadeSwap(miT,t);
    tile.textContent=cover.textContent=s?Array.from(s)[0]:"文";
  }
  tick();setInterval(tick,200);
})();

/* ---- 功能区：所有选项组统一成"单个下拉按钮 + 气泡菜单" ---- */
(function(){
  var SEL="#easeIn,#easeOut,#pdTs,#pdOs,#bgm,#themes,#lyAlign,#lyPos,#lyWrap,.crow[data-k=\"mode\"] .chips";
  var pop=document.createElement("div");pop.id="ddPop";pop.className="gpop";pop.setAttribute("role","listbox");pop.setAttribute("aria-hidden","true");
  var grid=document.createElement("div");grid.className="sp-grid";pop.appendChild(grid);document.body.appendChild(pop);
  var active=null;
  function labelOf(box){var on=box.querySelector(".on")||box.children[0];return on?on.textContent.trim():"—"}
  function paint(t,box){t.firstChild.textContent=labelOf(box)}
  function close(){pop.classList.remove("show");pop.setAttribute("aria-hidden","true");if(active)active.t.setAttribute("aria-expanded","false");active=null}
  /* 通用：list=[{text,on,fn}] */
  function openList(t,list,cols){
    grid.innerHTML="";
    list.forEach(function(it){var b=document.createElement("button");b.type="button";b.textContent=it.text;b.setAttribute("role","option");
      if(it.on)b.classList.add("on");
      b.onclick=function(ev){ev.stopPropagation();close();it.fn()};grid.appendChild(b)});
    var r=t.getBoundingClientRect(),vh=window.innerHeight,vw=window.innerWidth;cols=cols||(list.length>4?2:1);
    var pw=cols===2?204:Math.max(150,Math.min(220,r.width));
    pop.style.width=pw+"px";grid.style.gridTemplateColumns=cols===2?"1fr 1fr":"1fr";
    var pad=12,gap=12,spaceUp=r.top-gap-pad-50,spaceDown=vh-r.bottom-gap-pad-120;
    var full=Math.min(240,Math.ceil(list.length/cols)*37+6),up;
    if(spaceDown>=full+12)up=false;else if(spaceUp>=full+12)up=true;else up=spaceUp>spaceDown;
    var avail=Math.max(110,up?spaceUp:spaceDown);
    grid.style.maxHeight=Math.min(240,avail-12)+"px";
    var ph=pop.offsetHeight,cx=r.left+r.width/2,left=Math.max(8,Math.min(vw-pw-8,cx-pw/2));
    pop.style.left=left+"px";pop.style.top=(up?r.top-gap-ph:r.bottom+gap)+"px";
    pop.style.setProperty("--ox",(cx-left)+"px");pop.style.setProperty("--oy",up?"100%":"0%");
    pop.classList.add("show");pop.setAttribute("aria-hidden","false");t.setAttribute("aria-expanded","true");active={t:t};
    var sel=grid.querySelector(".on");if(sel)grid.scrollTop=Math.max(0,sel.offsetTop-grid.clientHeight/2+17);
  }
  function openBox(t,box){
    var items=[].slice.call(box.children);
    openList(t,items.map(function(c){return {text:c.textContent.trim(),on:c.classList.contains("on"),fn:function(){c.click();paint(t,box)}}}));
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
      <div class="qh" style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; padding:0 4px;">
        <b>Q弹幅度</b><em id="qv" class="av" style="font-style:normal; color:var(--sub);">100%</em>
      </div>
      <div class="qr" style="margin-top:8px; display:flex; align-items:center; gap:8px; padding:0 4px;">
        <span style="font-size:12px; color:var(--sub);">0</span>
        <input type="range" id="qamp" min="0" max="200" value="100" aria-label="Q弹幅度" style="flex:1;">
        <span style="font-size:12px; color:var(--sub);">200</span>
      </div>
      <div class="qd" style="margin-top:24px; display:flex; justify-content:center;">
        <button class="chip" id="qrstMoved" type="button" style="flex:1; padding:10px 0;">恢复默认设置</button>
      </div>
      <div class="qg" style="margin-top:20px; border-top:1px solid rgba(255,255,255,.1); padding-top:20px;">
        <label class="chk"><input type="checkbox" id="uiH" checked> 高光描边</label>
        <label class="chk"><input type="checkbox" id="uiS" checked> 柔和阴影</label>
      </div>
      <div class="qtip" style="text-align:center;margin-top:24px">版本 v0.1.1 beta1</div>
    </div>`;
    var pg4=document.getElementById("pg4");pg4.parentNode.insertBefore(menu,pg4);

    var $$=function(i){return document.getElementById(i)},timer=0;
    [].forEach.call(menu.querySelectorAll("input[type=range]"),wrapRange);
    /* Q弹幅度滑块是在这里动态插入的：此时才能绑定事件、同步已保存的值 */
    if(typeof bindQamp==="function")bindQamp();
    var qrm=$$("qrstMoved");if(qrm)qrm.onclick=function(){setQ(100);var d=$$("qdemo");if(d)d.checked=!d.checked};
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
        clearTimeout(menu._g);menu._g=setTimeout(function(){menu.classList.remove("go")},400);
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

  document.addEventListener("pointerdown",function(e){if(active&&!pop.contains(e.target)&&!active.t.contains(e.target))close()},true);
  window.addEventListener("resize",close);
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
    function closeP(p,b){if(!p)return;p.classList.remove("show");p.setAttribute("aria-hidden","true");if(b)b.setAttribute("aria-expanded","false")}
    function closeAll(){PAIRS.forEach(function(x){closeP(x[0],x[1])})}
    function openP(p,b,maxH,byRoom){
      var t=b.getBoundingClientRect(),vh=window.innerHeight,vw=window.innerWidth,gap=10,pw=p.offsetWidth;
      var spaceUp=t.top-gap-60,spaceDown=vh-t.bottom-gap-110,up;
      if(byRoom)up=spaceUp>=spaceDown;
      else{p.style.maxHeight="";var full=Math.min(p.scrollHeight,maxH);
        if(spaceUp>=full+12)up=true;else if(spaceDown>=full+12)up=false;else up=spaceUp>spaceDown}
      var h=Math.min(maxH,Math.max(160,(up?spaceUp:spaceDown)-12));
      p.style.maxHeight=h+"px";
      var cx=t.left+t.width/2,left=Math.max(8,Math.min(vw-pw-8,cx-pw/2));
      p.style.left=left+"px";
      if(up){p.style.top="auto";p.style.bottom=(vh-t.top+gap)+"px"}else{p.style.bottom="auto";p.style.top=(t.bottom+gap)+"px"}
      p.style.setProperty("--ox",(cx-left)+"px");p.style.setProperty("--oy",up?"100%":"0%");
      p.classList.add("show");p.setAttribute("aria-hidden","false");b.setAttribute("aria-expanded","true");
      return h;
    }
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

/* ===== script block 3 ===== */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // 仅在 HTTPS 或 localhost 环境下注册，避免本地 file:// 或编辑器预览时报错
    if (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('SW ready:', reg.scope))
        .catch(err => console.log('SW bypassed:', err.message));
    }
  });
}

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
        artistEl.textContent = "请先在菜单中导入音频和 LRC";
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
H.checked=localStorage.getItem('uiH')!=='0'; S.checked=localStorage.getItem('uiS')!=='0';
H.onchange=function(){ localStorage.setItem('uiH',this.checked?'1':'0'); upd(); };
S.onchange=function(){ localStorage.setItem('uiS',this.checked?'1':'0'); upd(); };
upd();
})();

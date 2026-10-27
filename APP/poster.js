// app/poster.js — 海报排版
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
  var N=U.length,mode=$("pdT").value,j,out=[];
  var lead=Math.min(.4,dur*.15),budget=Math.max(.6,dur-lead-.2);
  if(mode==="1"){
    /* 「随机」：用黄金比例序列撒点——看起来没有规律，但不会扎堆，也不会出现长时间的空档；同一句每次结果一样 */
    var Wd=Math.max(.3,Math.min(.4*(N-1),budget-.75));
    for(j=0;j<N;j++)out.push({dl:.2+Wd*((.137+j*.6180339887)%1),du:.5+.2*((.3+j*.7548776662)%1)});
    return out;
  }
  var st=.2,step=.34,du=.5,ord=U.map(function(u,i){return i});
  if(mode==="2"){
    st=+$("pdD").value/1000;step=+$("pdS").value/1000;du=+$("pdE").value/1000;
    var o=$("pdO").value;
    if(o==="1")ord.reverse();else if(o==="2")ord.sort(function(a,b){return U[b].r-U[a].r||a-b});
  }
  var avail=Math.max(.2,budget-du-st);
  /* 节拍：每个词占一拍；新起一行（一组）之前多停 0.35 拍，让「一段一段」的节奏听得出来 */
  var pos=[],acc=0;
  for(j=0;j<N;j++){if(j>0)acc+=1+((ord[j]===j&&U[j]&&U[j].rs)?.35:0);pos.push(acc)}
  if(acc>0&&step*acc>avail)step=Math.max(.04,avail/acc);
  for(j=0;j<N;j++)out[ord[j]]={dl:st+step*pos[j],du:du};
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
    var ls=rl===0?R(.04,.14):(rl===1?R(0,.04):0),em=0,cn=[].slice.call(wd).length;
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
  var RW=[1.35,.7,1.1,.85,1.25,.75],rwSum=0;
  rows.forEach(function(r,i){rwSum+=RW[i%RW.length]});
  var gapY=(avail-sumH)/Math.max(1,rwSum),y=top,k=0;
  rows.forEach(function(r,ri2){r.forEach(function(t,j){t._rs=ri2>0&&j===0})});

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
  var U=items.map(function(it){return {r:it.rl,rs:!!it._rs}});
  var TT=posterTimes(U,dur);

  /* 镜头容器：文字、装饰、仪表都放在里面，一起被镜头带动 */
  var cam=document.createElement("div");
  cam.className="cam";
  cam.setAttribute("data-compositor","1"); /* 每帧只改 transform（走合成层，不触发重排），告诉视觉异常捕捉器别误报 */
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
    /* 入场：整个词共用一个方向 / 角度（由锚点位置决定，种子随机，同一句每次一样），词内的字只做先后错开；
       位移改成短距离滑入（不再从屏幕外飞来），看上去随意，实际有规律 */
    var t=TT[it.i]||{dl:0,du:.5},dX=it.dX||0,hero=it.rl===2,pat=it.i%3,
        du=hero?Math.max(t.du,.7):t.du,cs=Math.min(.07,du*.16),
        d=Math.min(W*.22,30+it.size*.5)*(1+pat*.18)*(.9+R(0,.2)),ox0,oy0,r0,s0,
        ox2=R(-8,8),oy2=-(hero?R(40,70):R(10,24)),ci0=it._c||0;
    if(hero){ox0=dX*W*.16;oy0=dX?-d*.4:d*.9;r0=-(dX||1)*(4+R(0,3));s0=1.5+R(0,.15)}
    else{ox0=dX*d;oy0=dX?d*.35:d;r0=(dX||1)*(2+pat*1.5+R(0,1.5));s0=it.rl===1?.88:.9+R(0,.05)}
    pchars(txt).forEach(function(ch,ci){
      var s=document.createElement("span"),st=function(a,b){s.style.setProperty(a,b)};
      s.className="c pc";s.textContent=ch;
      st("--i",Math.min(k*3,18));
      st("--ox",ox0.toFixed(0)+"px");st("--oy",oy0.toFixed(0)+"px");st("--r0",r0.toFixed(1)+"deg");st("--s0",s0.toFixed(2));
      st("--ein",hero?"cubic-bezier(.22,1,.3,1.12)":"cubic-bezier(.2,.9,.25,1.08)");
      if(hero){
        st("--bl","14px");
        s.classList.add("hero");
        /* 色散边缘 + 主题发光 */
        var glowColor=(cfg&&cfg.color)||$("tc").value;
        st("--tsh","-1.5px 0 rgba(255,40,90,0.55), 1.5px 0 rgba(0,180,255,0.55), 0 0 20px "+glowColor);
        st("--s2","1.25");
      }
      st("--ox2",ox2.toFixed(0)+"px");st("--oy2",oy2.toFixed(0)+"px");
      st("--wo",it.rl===2?".95":(it.rl===1?".9":".8"));
      st("--dl",(t.dl+(ci0+ci)*cs).toFixed(2)+"s");st("--du",du.toFixed(2)+"s");
      st("--dlo",(Math.min(k,10)*.008+R(0,.02)).toFixed(2)+"s");st("--duo",R(.2,.3).toFixed(2)+"s");
      w.appendChild(s);k++;
    });
    it._c=ci0+pchars(txt).length;
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
    var tj=TT[it.i]||{dl:0,du:.5},dj=it.rl===2?Math.max(tj.du,.7):tj.du,land=tj.dl+Math.max(0,k1-k0-1)*Math.min(.07,dj*.16)+dj;
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
    var dX=kind==="c0"?0:(kind.charAt(0)==="l"?-1:1);      /* 入场方向跟着锚点走：靠左的从左来，靠右的从右来，居中的从下来 */
    r.forEach(function(t){t.dX=dX});
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
      var gapW=Math.min(Math.min.apply(null,r.map(function(t){return t.size}))*.75,Math.max(8,(availW-tot)/Math.max(1,r.length-1))),
          span=tot+gapW*(r.length-1),
          cx=Math.max(mx,Math.min(W-mx-span,anchorX(kind,span)+(R(0,1)-.5)*2));
      r.forEach(function(t){putF(t,cx,yy,t.wd);cx+=t.w+gapW});
    }
    y+=r.h+gapY*RW[(ri-1)%RW.length];
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
    var lastCamPaint=0; /* 限制 DOM 写入频率（约 30 次/秒） */
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

      /* 4) 降频：物理步进每帧都算（保证运动准确），但 DOM 最多约 30 次/秒写入。
            阈值取 28ms 而不是 33ms：60Hz 下帧间隔有抖动，太接近 33ms 会偶尔隔三帧才写一次。 */
      var settled=finishing&&Math.abs(camVX)+Math.abs(camVY)<0.5&&Math.abs(camX-txL)+Math.abs(camY-tyL)<0.3;
      if(settled||now-lastCamPaint>=28){
        cam.style.transform="translate3d("+(-camX).toFixed(2)+"px,"+(-camY).toFixed(2)+"px,0)";
        lastCamPaint=now;
      }

      /* 5) 收尾：切句/出场且弹簧已静止时才停止 RAF（旧 box 即将移除，合理停止） */
      if(settled){
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

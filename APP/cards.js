// app/cards.js — 逐句卡片列表
(function(){
  var box=$("cards"),txt=$("txt"),panel=$("panel"),addb=$("addc"),cnt=$("lcnt");
  var SPR=(function(){var d="cubic-bezier(.32,.72,0,1)",v=getComputedStyle(document.documentElement).getPropertyValue("--spring").trim()||d;
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
    window.ITEMS=its;
    if (window.PACKAGES && window.PACKAGES[window.ACTIVE_PKG]) {
      window.PACKAGES[window.ACTIVE_PKG].items = its;
    }
    updCount();
    if(!silent&&window.onItemsChanged)window.onItemsChanged();
    if(!silent&&window.__onCardsEdited)window.__onCardsEdited();   /* 历史栈（pkg-manager.js）：打字 / 增删 / 排序 / 单条设置 */
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
    t.readOnly=true;t.setAttribute("inputmode","none");      /* 卡片里的文字框只读：点它不弹键盘、不触发 iOS 自动放大；改字走顶部输入栏 */
    t.addEventListener("click",function(){if(window.__openTextBar)window.__openTextBar(c,t)});
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
    if(c.animate)c.animate([{opacity:0,transform:"scale(.9) translateY(-8px)"},{opacity:1,transform:"none"}],{duration:uiT(520),easing:(window.__spring||SPR)});
    return area(c);
  }
  function remove(c){
    if(list().length<=1){var t=area(c);t.value="";grow(t);commit();t.focus();return}
    var h=c.offsetHeight;c.style.pointerEvents="none";
    if(!c.animate){c.remove();commit();return}
    c.style.overflow="hidden";
    commit(false,c);
    c.animate([{opacity:1,transform:"scale(1)",height:h+"px",marginBottom:"8px"},{opacity:0,transform:"scale(.88)",height:"0px",marginBottom:"0px",paddingTop:"0px",paddingBottom:"0px"}],
      {duration:uiT(300),easing:"cubic-bezier(.3,0,.3,1)",fill:"forwards"}).onfinish=function(){c.remove();commit(true)};
  }
  /* ---- 拖拽排序：占位指示器 + 橡皮筋边界 + 弹簧落位 ---- */
  function startDrag(c,e){
    if(e.button>0)return;e.preventDefault();
    var grip=e.currentTarget;try{grip.setPointerCapture(e.pointerId)}catch(_){}
    var top0=c.offsetTop,hh=c.offsetHeight,w=c.offsetWidth,startY=e.clientY,startScroll=panel.scrollTop,lastY=e.clientY,raf=0,live=true,vis=top0;
    var ph=document.createElement("div");ph.className="slot";ph.style.height=hh+"px";
    box.insertBefore(ph,c);
    c.style.position="absolute";c.style.left="0";c.style.width=w+"px";c.style.top=top0+"px";c.style.marginBottom="0";c.classList.add("dragging");
    if(c.animate)c.animate([{transform:"scale(1)"},{transform:"scale(1.03)"}],{duration:uiT(380),easing:(window.__spring||SPR)});
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
          if(d&&sb.animate)sb.animate([{transform:"translateY("+d+"px)"},{transform:"none"}],{duration:uiT(340),easing:(window.__spring||SPR)})});
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
      if(c.animate)c.animate([{transform:"translateY("+d+"px) scale(1.03)"},{transform:"none"}],{duration:uiT(560),easing:(window.__spring||SPR)});
      commit();
    }
    grip.addEventListener("pointermove",move);grip.addEventListener("pointerup",up);grip.addEventListener("pointercancel",up);
    tick();
  }
  addb.addEventListener("click",function(){var n=insert("",list()[list().length-1]);panel.scrollTop=panel.scrollHeight;if(window.__openTextBar)window.__openTextBar(n.closest(".card"),n);else n.focus()});
  ["speed","size","tc"].forEach(function(id){$(id).addEventListener("input",function(){
    updCount();list().forEach(function(c){if(c.classList.contains("open"))paintCfg(c)})})});
  // 初始化多包结构（如果 storage.js 没有恢复出来的话）
  if (!window.PACKAGES || window.PACKAGES.length === 0) {
    var _initItems = txt.value.split("\n").map(function(x){return x.trim()}).filter(Boolean).map(function(t){return {t:t}});
    window.PACKAGES = [{ name: "默认文件包", shuffle: false, items: _initItems }];
    window.ACTIVE_PKG = 0;
  }
  window.ITEMS = window.PACKAGES[window.ACTIVE_PKG].items;
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
[].forEach.call(document.querySelectorAll("input[type=range]"),function(el){el.step="any";sync(el);el.addEventListener("input",function(){sync(el)})});

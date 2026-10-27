// app/storage.js — 自动保存、导入导出
/* ---- 自动保存 / 导出 / 导入 ---- */
(function(){
  var SK="td_autosave",LOADING=false,touched=false,saveT=0,lastStr="",quotaWarned=false;
  var G_IDS=["size","tc","fg","sw","sc","shd","rgb"],BG_IDS=["solidc","ang","gflow","imgBlur","imgDim"],P_IDS=["speed","aspd"],LY_IDS=["lyPad","lyFw","lyLh"];
  var SKIP={txt:1,live:1,qdemo:1,qamp:1,uiSpd:1,qImmerse:1,gblurOn:1,gbamp:1,cz:1,file:1,pgFile:1,impFile:1};
  var STYS=STY.concat(STY2,STY3).map(function(e){return e[0]});
  var MODE_RE=/^(scatter|star|pan|fade|type|bounce|flip|focus|wave|glitch|poster)$/,IMG_RE=/^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\/=]+$/i,COL_RE=/^#[0-9a-f]{6}$/i;
  function p2(n){return (n<10?"0":"")+n}
  function inList(list,v){return list.indexOf(v)>=0}
  function num(v,lo,hi){return typeof v==="number"&&isFinite(v)?Math.min(hi,Math.max(lo,v)):null}
  function okImg(v){return typeof v==="string"&&v.length>30&&IMG_RE.test(v)?v:""}
  function getV(id){var e=$(id);return !e?null:(e.type==="checkbox"?e.checked:e.value)}
  function setV(id,v){
    var e=$(id);if(!e||v==null||!/^(INPUT|SELECT)$/.test(e.tagName)||e.type==="file")return;
    if(e.type==="checkbox"){e.checked=!!v;return}
    if(e.type==="color"){if(typeof v==="string"&&COL_RE.test(v))e.value=v;return}
    if(e.type==="range"){var n=parseFloat(v);if(!isFinite(n))return;e.value=n;sync(e);return}
    e.value=String(v);
  }
  /* 单条 / 文件包清洗：恢复数据（含导入的备份文件）一律过白名单，和原来 LN/CF 的校验标准一致 */
  function cleanItem(t,c){
    c=c&&typeof c==="object"?c:{};
    return {t:String(t==null?"":t),size:num(c.size,14,80),color:typeof c.color==="string"&&COL_RE.test(c.color)?c.color:null,
      mode:typeof c.mode==="string"&&MODE_RE.test(c.mode)?c.mode:null,dur:num(c.dur,.5,20)};
  }
  function cleanPkgs(arr){
    var out=[];
    arr.forEach(function(p){
      if(!p||typeof p!=="object")return;
      var its=Array.isArray(p.items)?p.items:[];
      out.push({name:String(p.name==null?"":p.name).slice(0,60)||("文件包 "+(out.length+1)),shuffle:!!p.shuffle,
        items:its.map(function(x){return cleanItem(x&&x.t,x)})});
    });
    return out;
  }
  function isQuota(e){return !!e&&(e.name==="QuotaExceededError"||e.name==="NS_ERROR_DOM_QUOTA_REACHED"||e.code===22||e.code===1014)}
  function stamp(){var el=$("bkTime");if(!el)return;var d=new Date();el.textContent="上次自动保存："+p2(d.getHours())+":"+p2(d.getMinutes())+":"+p2(d.getSeconds())}

  /* 当前全部状态 → 一个可序列化对象 */
  function snapshot(){
    var its=window.ITEMS||[],o={app:"text-display",v:1};
    o.LN=its.map(function(x){return x.t});
    o.CF=its.map(function(x){return {size:x.size,color:x.color,mode:x.mode,dur:x.dur}});
    o.PACKAGES=window.PACKAGES||[];          /* 多文件包；LN/CF 继续保留 = 当前包，兼容旧版本与导入校验 */
    o.ACTIVE_PKG=window.ACTIVE_PKG||0;
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
      /* 文件包：新版读 PACKAGES；旧版 LN + CF 打包成默认包 */
      if(window.__setCards){
        var pk=null,act=0;
        if(Array.isArray(d.PACKAGES)){pk=cleanPkgs(d.PACKAGES);act=parseInt(d.ACTIVE_PKG,10)}
        if((!pk||!pk.length)&&Array.isArray(d.LN)){
          var cf=Array.isArray(d.CF)?d.CF:[];act=0;
          pk=[{name:"默认文件包",shuffle:!!ui.shuf,items:d.LN.map(function(t,i){return cleanItem(t,cf[i])})}];
        }
        if(pk&&pk.length){
          window.PACKAGES=pk;
          window.ACTIVE_PKG=(act>=0&&act<pk.length)?act:0;          /* 越界 / NaN 都回到第 0 个包 */
          window.ITEMS=pk[window.ACTIVE_PKG].items;                  /* ITEMS 始终指向当前包 */
          window.__setCards(window.ITEMS);
          if(window.resetHistory)window.resetHistory();else if(window.updatePkgName)window.updatePkgName();   /* 撤回基线 = 刚恢复的数据，而不是演示文字 */
        }
      }
    }catch(e){ok=false;try{console.error(e)}catch(_){}
      try{window.addEventListener("load",function(){console.error("[storage] applyState 出错: "+(e&&e.stack||e))})}catch(_){}}
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
      if(!d||typeof d!=="object"||(!Array.isArray(d.LN)&&!Array.isArray(d.PACKAGES)&&!d.G&&!d.BG)){alert("导入失败：这不是有效的备份文件");return}
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


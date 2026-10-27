// app/changelog.js — 设置页「更新日志」：悬浮毛玻璃卡片（顶部高斯模糊），添加 / 修改版本需输入密码
(function(){
  var KEY="changelogV2",OLD="changelogV1";
  var list=[],pick=false,editIdx=-1,open=false,verEl=null;

  /* 初始内容：来自你给的设计图（「已知问题」图里没显示内容，这里不放，可用「修改版本」补上） */
  var SEED={v:"v0.1.1 Beta 3",d:"2026-10-21",s:[
    {t:"新功能",i:["主题选择器升级为网格卡片：每个主题独立记忆背景类型","长按主题卡片显示笔形遮罩，点击进入编辑","支持拖动主题卡片调整顺序","顶部文字输入栏：修改文字不再触发页面自动放大","播放卡片：上滑迷你条打开"]},
    {t:"优化",i:["玻璃拟态材质统一：面板 / 菜单 / 按钮共用一套模糊参数","背景切换平滑过渡","时间轴性能优化：用 scaleX 代替 width"]},
    {t:"修复",i:["修复主题选择器展开过程中毛玻璃失效的问题","修复 iOS 上内容不绘制的问题","修复迷你条收起时残留黑边的问题"]}
  ]};
  function clone(o){return JSON.parse(JSON.stringify(o))}
  function cleanSecs(a){
    return (Array.isArray(a)?a:[]).filter(function(x){return x&&typeof x.t==="string"&&Array.isArray(x.i)})
      .map(function(x){return {t:x.t,i:x.i.filter(function(s){return typeof s==="string"&&s})}}).filter(function(x){return x.i.length});
  }
  function load(){
    var a=null;try{a=JSON.parse(localStorage.getItem(KEY)||"null")}catch(_){}
    if(Array.isArray(a)){
      a=a.filter(function(x){return x&&typeof x.v==="string"}).map(function(x){return {v:x.v,d:typeof x.d==="string"?x.d:"",s:cleanSecs(x.s)}});
      if(a.length)return a;
    }
    /* 从第一版（每条只有平铺的 n 数组）迁移：顺序不变，同名版本换成新内容，找不到同名版本就把新内容放在最后 */
    var out=[],o=null,hit=false;try{o=JSON.parse(localStorage.getItem(OLD)||"null")}catch(_){}
    if(Array.isArray(o))o.forEach(function(x){
      if(!x||typeof x.v!=="string")return;
      if(x.v===SEED.v){out.push(clone(SEED));hit=true;return}
      var n=Array.isArray(x.n)?x.n.filter(function(s){return typeof s==="string"&&s}):[];
      out.push({v:x.v,d:typeof x.d==="string"?x.d:"",s:n.length?[{t:"更新",i:n}]:[]});
    });
    if(!hit)out.push(clone(SEED));
    return out;
  }
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(list));return true}catch(_){return false}}
  function today(){var t=new Date(),p=function(n){return(n<10?"0":"")+n};return t.getFullYear()+"-"+p(t.getMonth()+1)+"-"+p(t.getDate())}
  function mk(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
  function kind(t){return t.indexOf("新功能")>=0?"new":t.indexOf("优化")>=0?"opt":t.indexOf("修复")>=0?"fix":(t.indexOf("已知")>=0||t.indexOf("问题")>=0)?"bug":"def"}

  /* 编辑框文本 ⇄ 分类数据：「# 分类名」开头的行是分类标题，其余每行一条 */
  function toText(s){return s.map(function(x){return "# "+x.t+"\n"+x.i.join("\n")}).join("\n")}
  function fromText(txt){
    var out=[],cur=null;
    txt.split("\n").forEach(function(l){
      l=l.trim();if(!l)return;
      var m=/^[#＃]+\s*(.*)$/.exec(l);
      if(m){cur={t:m[1].trim()||"更新",i:[]};out.push(cur)}
      else{if(!cur){cur={t:"更新",i:[]};out.push(cur)}cur.i.push(l)}
    });
    return out.filter(function(x){return x.i.length});
  }

  /* ---------- 样式 ---------- */
  var CSS=""
  /* 不再对 #clSheet 整体做 opacity：opacity<1 的祖先会成为 backdrop root，里面两层毛玻璃渐变期间不模糊、结束瞬间才套上 → 闪一下。
     改为 #clSheet 只切 visibility，遮罩 / 毛玻璃层 / 标题栏 / 内容各自淡入淡出 */
  +"#clSheet{position:fixed;inset:0;z-index:99990;visibility:hidden;"
  +"transition:visibility 0s calc(.3s/var(--ui-spd,1))}"
  +"#clSheet.show{visibility:visible;transition:visibility 0s}"
  +"#clSheet .cl-mask,#clSheet .cl-glass,#clSheet .cl-head,#clSheet .cl-body,#clSheet .cl-foot{opacity:0;transition:opacity calc(.3s/var(--ui-spd,1)) ease}"
  +"#clSheet.show .cl-mask,#clSheet.show .cl-glass,#clSheet.show .cl-head,#clSheet.show .cl-body,#clSheet.show .cl-foot{opacity:1}"
  +"#clSheet .cl-mask{position:absolute;inset:0;background:rgba(0,0,0,.3)}"
  +"#clSheet .cl-card{position:absolute;left:0;right:0;margin:0 auto;width:calc(100% - 36px);max-width:440px;"
  +"top:calc(env(safe-area-inset-top,0px) + 58px);bottom:calc(env(safe-area-inset-bottom,0px) + 98px);border-radius:32px;color:#fff;"
  /* 入场 / 出场：card 只做位移 + 缩放，不加 opacity（它是三层毛玻璃的祖先，opacity<1 会让子层 backdrop-filter 失效再闪一下）。
     淡入淡出仍由 .cl-glass / .cl-head / .cl-body / .cl-foot 各自负责。出场用短促 ease-in，入场用 .show 里的弹簧曲线 */
  +"transform:translateY(24px) scale(.95);"
  +"transition:transform calc(.3s/var(--ui-spd,1)) cubic-bezier(.4,0,1,1)}"
  +"#clSheet.show .cl-card{transform:translateY(0) scale(1);transition:transform calc(.5s/var(--ui-spd,1)) var(--spring-pop,cubic-bezier(.32,.72,0,1))}"
  /* 三层并列（不嵌套 backdrop-filter，iOS 上更稳）：底层毛玻璃 / 滚动内容 / 顶部毛玻璃标题栏 */
  +"#clSheet .cl-glass{position:absolute;inset:0;border-radius:32px;border:1px solid rgba(255,255,255,.16);box-shadow:0 20px 60px rgba(0,0,0,.4);transform:translateZ(0);"
  +"background:var(--g-fill),rgba(30,28,36,.46);-webkit-backdrop-filter:var(--g-blur) saturate(1.4);backdrop-filter:var(--g-blur) saturate(1.4)}"
  +"#clSheet .cl-body{position:absolute;inset:0;bottom:70px;z-index:1;border-radius:32px 32px 0 0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;"
  +"padding:calc(var(--cl-top,100px) + 14px) 16px 22px;scrollbar-width:none}"
  +"#clSheet .cl-body::-webkit-scrollbar{display:none}"
  +"#clSheet .cl-head{position:absolute;left:0;right:0;top:0;z-index:2;padding:16px 16px 12px 22px;border-radius:32px 32px 0 0;transform:translateZ(0);"
  +"background:rgba(46,42,54,.3);-webkit-backdrop-filter:var(--g-blur) saturate(1.5);backdrop-filter:var(--g-blur) saturate(1.5);box-shadow:0 8px 24px -6px rgba(0,0,0,.4)}"
  +"#clSheet .cl-bar{display:flex;align-items:center;gap:10px}"
  +"#clSheet .cl-tt{flex:1;min-width:0;display:flex;align-items:baseline;gap:10px;white-space:nowrap;overflow:hidden}"
  +"#clSheet .cl-title{font-size:19px;font-weight:800;letter-spacing:.3px}"
  +"#clSheet .cl-cur{font-size:12.5px;color:rgba(255,255,255,.55);overflow:hidden;text-overflow:ellipsis}"
  +"#clSheet .cl-x{flex:none;width:32px;height:32px;border:none;border-radius:16px;background:rgba(255,255,255,.16);color:#fff;font-size:14px;cursor:pointer}"
  +"#clSheet .cl-x:active{background:rgba(255,255,255,.28)}"
  /* 底部固定操作栏 */
  +"#clSheet .cl-foot{position:absolute;left:0;right:0;bottom:0;height:70px;z-index:2;display:flex;align-items:center;justify-content:center;gap:12px;padding:0 22px;box-sizing:border-box;transform:translateZ(0);"
  +"background:rgba(46,42,54,.3);-webkit-backdrop-filter:var(--g-blur);backdrop-filter:var(--g-blur);border-radius:0 0 32px 32px;box-shadow:0 -8px 24px -6px rgba(0,0,0,.4)}"
  +"#clSheet .cl-foot button{flex:1;height:42px;border:none;border-radius:14px;font:inherit;font-size:14px;font-weight:600;color:#fff;cursor:pointer;"
  +"background:rgba(255,255,255,.14);transition:background .2s,scale .2s}"
  +"#clSheet .cl-foot button.primary{background:rgba(80,125,240,.75)}"
  +"#clSheet .cl-foot button:active{background:rgba(255,255,255,.28);scale:.96}"
  +"#clSheet .cl-hint{display:none;align-items:center;gap:8px;margin-top:10px;padding-right:6px;font-size:12.5px;color:rgba(255,255,255,.75)}"
  +"#clSheet.picking .cl-hint{display:flex}"
  +"#clSheet .cl-hint span{flex:1;min-width:0}"
  +"#clSheet .cl-hint button{flex:none;border:none;border-radius:9px;background:rgba(255,255,255,.16);color:#fff;font:inherit;font-size:12px;height:26px;padding:0 10px;cursor:pointer}"
  +"#clSheet .cl-item{padding:16px 16px 6px;margin-bottom:12px;border-radius:26px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.06)}"
  +"#clSheet .cl-item.latest{border-color:rgba(143,176,255,.5);background:rgba(143,176,255,.1)}"
  +"#clSheet .cl-vr{display:flex;align-items:center;gap:10px;margin-bottom:12px}"
  +"#clSheet .cl-v{font-size:18px;font-weight:800;min-width:0;word-break:break-word}"
  +"#clSheet .cl-d{font-size:12.5px;color:rgba(255,255,255,.5);font-variant-numeric:tabular-nums;white-space:nowrap}"
  +"#clSheet .cl-new{margin-left:auto;flex:none;padding:3px 11px;border-radius:12px;background:rgba(130,150,230,.78);font-size:12px;font-weight:700}"
  +"#clSheet .cl-sec{margin-bottom:12px}"
  +"#clSheet .cl-tag{display:inline-block;padding:4px 11px;border-radius:12px;font-size:12.5px;font-weight:700;background:rgba(255,255,255,.14);color:#fff}"
  +"#clSheet .cl-tag.k-new{background:rgba(88,190,110,.34);color:#c3f3cb}"
  +"#clSheet .cl-tag.k-opt{background:rgba(90,160,215,.38);color:#c4e4ff}"
  +"#clSheet .cl-tag.k-fix{background:rgba(214,150,95,.38);color:#ffdcb8}"
  +"#clSheet .cl-tag.k-bug{background:rgba(215,95,108,.38);color:#ffc6cc}"
  +"#clSheet ul{margin:10px 0 0;padding:0;list-style:none}"
  +"#clSheet li{position:relative;padding:0 0 0 18px;margin-bottom:8px;font-size:13.5px;line-height:1.6;color:rgba(255,255,255,.88);word-break:break-word}"
  +"#clSheet li::before{content:\"\";position:absolute;left:3px;top:.62em;width:6px;height:6px;border-radius:50%;background:#8fb0ff}"
  +"#clSheet .k-new+ul li::before{background:#6fd283}"
  +"#clSheet .k-opt+ul li::before{background:#5aaee6}"
  +"#clSheet .k-fix+ul li::before{background:#f0a050}"
  +"#clSheet .k-bug+ul li::before{background:#f07a85}"
  +"#clSheet.picking .cl-item{cursor:pointer;outline:1.5px dashed rgba(143,176,255,.8);outline-offset:-1.5px}"
  +"#clSheet.picking .cl-item:active{background:rgba(143,176,255,.24)}"
  +"#clSheet .cl-empty{padding:40px 0;text-align:center;font-size:13px;color:rgba(255,255,255,.5)}"
  /* 1. 遮罩层：只过渡背景色 + visibility。整层不做 opacity——它是 .cl-box 的祖先，opacity<1 会让 .cl-box 的毛玻璃在动画期间失效、结束时才突然套上（闪烁 / 看起来不透）。
        底部 45vh 留白：键盘弹起后仍能往上滑出足够高度；overscroll-behavior 阻止滚动穿透 */
  +".cl-layer{position:fixed;inset:0;z-index:99995;display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;padding:calc(env(safe-area-inset-top,0px) + 40px) 22px calc(env(safe-area-inset-bottom,0px) + 45vh);"
  +"background:rgba(0,0,0,0);visibility:hidden;"
  +"transition:background calc(.3s/var(--ui-spd,1)) ease,visibility 0s calc(.32s/var(--ui-spd,1))}"
  +".cl-layer.show{background:rgba(0,0,0,.45);visibility:visible;"
  +"transition:background calc(.3s/var(--ui-spd,1)) ease,visibility 0s}"

  /* 2. 编辑弹窗主体：全局材质 + 高斯模糊 + 内描边高光；入场弹簧（回弹），出场短促下沉 */
  +".cl-layer .cl-box{width:100%;max-width:380px;margin-bottom:20px;padding:18px 18px 16px;border-radius:24px;color:#fff;"
  +"background:var(--g-fill),rgba(30,30,34,.65);"
  +"-webkit-backdrop-filter:var(--g-blur) saturate(1.5);backdrop-filter:var(--g-blur) saturate(1.5);"
  +"box-shadow:0 10px 40px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.15);"
  +"transform:translateY(40px) scale(.85);opacity:0;will-change:transform,opacity;"
  +"transition:transform calc(.32s/var(--ui-spd,1)) cubic-bezier(.4,0,1,1),opacity calc(.25s/var(--ui-spd,1)) ease}"
  +".cl-layer.show .cl-box{transform:translateY(0) scale(1);opacity:1;"
  +"transition:transform calc(.55s/var(--ui-spd,1)) var(--spring-pop,cubic-bezier(.34,1.45,.64,1)),opacity calc(.3s/var(--ui-spd,1)) ease}"

  +".cl-layer .cl-bt{font-size:16px;font-weight:800;margin-bottom:12px;color:#fff}"
  +".cl-layer label{display:block;font-size:12px;color:rgba(255,255,255,.6);margin:10px 0 5px}"

  /* 3. 输入框（contenteditable：不触发 iOS 灰条）：柔和半透明，聚焦时提亮 */
  +".cl-layer .cl-input,.cl-layer .cl-textarea{display:block;width:100%;box-sizing:border-box;border:none;outline:none;border-radius:12px;padding:12px;"
  +"background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:16px;-webkit-user-select:text;user-select:text;caret-color:#ff9f43;-webkit-tap-highlight-color:transparent;"
  +"transition:background calc(.2s/var(--ui-spd,1)) ease}"
  +".cl-layer .cl-input:focus,.cl-layer .cl-textarea:focus{background:rgba(255,255,255,.15)}"
  +".cl-layer .cl-input{height:44px;line-height:20px;overflow:hidden;white-space:nowrap}"
  +".cl-layer .cl-textarea{min-height:170px;line-height:1.5;overscroll-behavior:contain;overflow-y:auto;white-space:pre-wrap;overflow-wrap:anywhere}"
  +".cl-layer .cl-input:empty::before,.cl-layer .cl-textarea:empty::before{content:attr(placeholder);color:rgba(255,255,255,.35);pointer-events:none}"

  /* 4. 快捷插入按钮 */
  +".cl-layer .cl-qk{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}"
  +".cl-layer .cl-qk button{border:none;border-radius:10px;height:28px;padding:0 12px;font:inherit;font-size:12px;font-weight:600;color:#fff;background:rgba(255,255,255,.12);cursor:pointer;transition:background .2s}"
  +".cl-layer .cl-qk button:active{background:rgba(255,255,255,.25)}"

  /* 5. 底部取消 / 保存按钮 */
  +".cl-layer .cl-err{min-height:18px;margin-top:8px;font-size:12px;color:#ff7a8a}"
  +".cl-layer .cl-btns{display:flex;gap:10px;margin-top:12px}"
  +".cl-layer .cl-btns button{flex:1;border:none;border-radius:14px;height:42px;font:inherit;font-size:15px;font-weight:600;color:#fff;background:rgba(255,255,255,.12);cursor:pointer;transition:background .2s,scale .2s}"
  +".cl-layer .cl-btns button.ok{background:rgba(80,125,240,.85)}"
  +".cl-layer .cl-btns button:active{scale:.96;filter:brightness(1.1)}"

  /* 6. 错误抖动 */
  +".cl-layer.bad .cl-box{animation:clShake .36s ease}"
  +"@keyframes clShake{20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}";
  var st=document.createElement("style");st.id="clStyle";st.textContent=CSS;document.head.appendChild(st);

  /* ---------- DOM ---------- */
  var sheet=mk("div");sheet.id="clSheet";sheet.setAttribute("role","dialog");sheet.setAttribute("aria-label","更新日志");sheet.setAttribute("aria-hidden","true");
  sheet.innerHTML='<div class="cl-mask"></div><div class="cl-card"><div class="cl-glass"></div><div class="cl-body" id="clBody"></div>'
    +'<div class="cl-head"><div class="cl-bar"><div class="cl-tt"><span class="cl-title">更新日志</span><span class="cl-cur" id="clCur"></span></div><button type="button" class="cl-x" aria-label="关闭">✕</button></div>'
    +'<div class="cl-hint"><span>点选下方要修改的版本</span><button type="button" id="clPickCancel">取消</button></div></div>'
    +'<div class="cl-foot"><button type="button" id="clMod">修改版本</button><button type="button" class="primary" id="clAdd">添加版本</button></div></div>';
  document.body.appendChild(sheet);
  var head=sheet.querySelector(".cl-head"),bodyEl=sheet.querySelector("#clBody"),curEl=sheet.querySelector("#clCur");

  var ed=mk("div","cl-layer");ed.id="clEdit";ed.setAttribute("aria-hidden","true");
  ed.innerHTML='<div class="cl-box" role="dialog" aria-label="编辑版本"><div class="cl-bt" id="clEdTitle">添加版本</div>'
    +'<label for="clEv">版本号</label><div class="cl-input" contenteditable="true" id="clEv" role="textbox" enterkeyhint="done" placeholder="例如 v0.1.2 Beta 4"></div>'
    +'<label for="clEd">日期（可留空）</label><div class="cl-input" contenteditable="true" id="clEd" role="textbox" enterkeyhint="done" placeholder="例如 2026-10-22"></div>'
    +'<label for="clEn">更新内容（「# 」开头的行是分类标题，其余每行一条）</label>'
    +'<div class="cl-qk"><button type="button" data-k="新功能">＋新功能</button><button type="button" data-k="优化">＋优化</button><button type="button" data-k="修复">＋修复</button><button type="button" data-k="已知问题">＋已知问题</button></div>'
    +'<div class="cl-textarea" contenteditable="true" id="clEn" role="textbox" aria-multiline="true" placeholder="# 新功能&#10;主题选择器升级为网格卡片&#10;# 修复&#10;修复若干问题"></div>'
    +'<div class="cl-err" id="clEdErr"></div><div class="cl-btns"><button type="button" id="clEdNo">取消</button><button type="button" class="ok" id="clEdOk">保存</button></div></div>';
  document.body.appendChild(ed);
  var fv=ed.querySelector("#clEv"),fd=ed.querySelector("#clEd"),fn=ed.querySelector("#clEn"),edErr=ed.querySelector("#clEdErr");

  /* ---------- 渲染 ---------- */
  function fit(){sheet.querySelector(".cl-card").style.setProperty("--cl-top",head.offsetHeight+"px")}
  function curText(){
    var t=verEl?verEl.textContent.replace(/^\s*版本\s*/,"").trim():"";
    return "当前 "+(t||(list[0]&&list[0].v)||"");
  }
  function syncVersion(v){
    var el=document.getElementById("appVersion");
    if(el&&v)el.textContent="版本 "+String(v).replace(/^\s*版本\s*/,"");
  }
  function render(){
    if(list[0])syncVersion(list[0].v); /* 先同步，下一行 curText() 才读到最新版本号 */
    bodyEl.innerHTML="";curEl.textContent=curText();
    if(!list.length){bodyEl.appendChild(mk("div","cl-empty","暂无更新记录"));return}
    list.forEach(function(it,i){
      var c=mk("div","cl-item"+(i===0?" latest":""));c.dataset.i=i;
      var r=mk("div","cl-vr");r.appendChild(mk("span","cl-v",it.v));
      if(it.d)r.appendChild(mk("span","cl-d",it.d));
      if(i===0)r.appendChild(mk("span","cl-new","最新"));
      c.appendChild(r);
      it.s.forEach(function(sec){
        var s=mk("div","cl-sec");s.appendChild(mk("span","cl-tag k-"+kind(sec.t),sec.t));
        var ul=mk("ul");sec.i.forEach(function(x){ul.appendChild(mk("li","",x))});s.appendChild(ul);c.appendChild(s);
      });
      bodyEl.appendChild(c);
    });
  }
  function setPick(on){pick=!!on;sheet.classList.toggle("picking",pick);fit()}

  /* ---------- 打开 / 关闭 ---------- */
  function openSheet(){
    if(open)return;open=true;list=load();setPick(false);render();
    fit(); /* 先同步算好高度，再触发显示，避免入场第一帧重排 */
    sheet.classList.add("show");sheet.setAttribute("aria-hidden","false");
    bodyEl.scrollTop=0;
  }
  function closeSheet(){
    if(!open)return;open=false;hideEdit();setPick(false);
    sheet.classList.remove("show");sheet.setAttribute("aria-hidden","true");
  }
  sheet.querySelector(".cl-x").addEventListener("click",closeSheet);
  sheet.querySelector(".cl-mask").addEventListener("click",closeSheet);

  /* ---------- 编辑 ---------- */
  function showEdit(i){
    editIdx=i;edErr.textContent="";
    ed.querySelector("#clEdTitle").textContent=i<0?"添加版本":"修改版本";
    if(i<0){fv.textContent="";fd.textContent=today();fn.textContent=""}
    else{fv.textContent=list[i].v;fd.textContent=list[i].d;fn.textContent=toText(list[i].s)}
    void ed.offsetWidth;ed.classList.add("show");ed.setAttribute("aria-hidden","false");
    try{fv.focus()}catch(_){}
    /* 延时 350ms 等键盘弹起后，直接把弹窗滚动到最底部，让「取消 / 保存」按钮露出来 */
    setTimeout(function(){
      if(!ed.classList.contains("show"))return;
      ed.scrollTo({top:ed.scrollHeight,behavior:"smooth"});
    },350);
  }
  function hideEdit(){ed.classList.remove("show");ed.setAttribute("aria-hidden","true");fv.blur();fd.blur();fn.blur();editIdx=-1}
  function shake(){ed.classList.remove("bad");void ed.offsetWidth;ed.classList.add("bad");setTimeout(function(){ed.classList.remove("bad")},400)}
  function saveEdit(){
    var v=fv.textContent.trim().slice(0,40);if(!v){edErr.textContent="请填写版本号";shake();return}
    var it={v:v,d:fd.textContent.trim().slice(0,20),s:fromText(fn.innerText||fn.textContent)};
    var prev=list.slice();
    if(editIdx<0)list.unshift(it);else list[editIdx]=it;
    if(!persist()){list=prev;edErr.textContent="保存失败：存储空间不可用";shake();return}
    var added=editIdx<0;hideEdit();setPick(false);render();if(added)bodyEl.scrollTop=0;
  }
  ed.querySelector("#clEdOk").addEventListener("click",saveEdit);
  ed.querySelector("#clEdNo").addEventListener("click",hideEdit);
  /* 分类快捷按钮：在光标处插入「# 分类名」一行（contenteditable 版） */
  var _rg=null;
  function inFn(r){return r&&fn.contains(r.commonAncestorContainer)}
  document.addEventListener("selectionchange",function(){
    var sel=window.getSelection();if(!sel||!sel.rangeCount)return;
    var r=sel.getRangeAt(0);if(inFn(r))_rg=r.cloneRange();
  });
  /* 按下按钮时不抢焦点：键盘不收起，光标不丢 */
  ed.querySelector(".cl-qk").addEventListener("mousedown",function(e){e.preventDefault()});
  ed.querySelector(".cl-qk").addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest("button");if(!b)return;
    fn.focus();
    var sel=window.getSelection(),r=_rg&&inFn(_rg)?_rg:null;
    if(!r){r=document.createRange();r.selectNodeContents(fn);r.collapse(false)} /* 没有记录过光标：放到末尾 */
    sel.removeAllRanges();sel.addRange(r);
    var pre="";try{var t=document.createRange();t.selectNodeContents(fn);t.setEnd(r.startContainer,r.startOffset);pre=t.toString()}catch(_){}
    var ins=(pre&&pre.slice(-1)!=="\n"?"\n":"")+"# "+b.dataset.k+"\n";
    document.execCommand("insertText",false,ins);
  });
  /* 粘贴一律转纯文本（避免带入富文本样式）；版本号 / 日期再去掉换行 */
  [fv,fd,fn].forEach(function(el){
    el.addEventListener("paste",function(e){
      e.preventDefault();
      var t=(e.clipboardData||window.clipboardData).getData("text/plain")||"";
      if(el!==fn)t=t.replace(/[\r\n]+/g," ");
      document.execCommand("insertText",false,t);
    });
    /* 删空后浏览器会残留 <br>，导致 :empty 占位符不显示 */
    el.addEventListener("input",function(){if(!el.textContent&&el.innerHTML)el.innerHTML=""});
  });

  /* ---------- 两个按钮：直接进入编辑 ---------- */
  sheet.querySelector("#clAdd").addEventListener("click",function(){
    setPick(false);
    showEdit(-1);
  });
  sheet.querySelector("#clMod").addEventListener("click",function(){
    if(!list.length)return;
    setPick(true);
    bodyEl.scrollTop=0;
  });
  sheet.querySelector("#clPickCancel").addEventListener("click",function(){setPick(false)});
  bodyEl.addEventListener("click",function(e){
    if(!pick)return;var c=e.target.closest&&e.target.closest(".cl-item");if(!c)return;
    showEdit(+c.dataset.i);
  });

  /* ---------- 键盘：输入框内的按键不外泄给全局快捷键；Esc 逐层关闭 ---------- */
  [fv,fd,fn].forEach(function(inp){
    inp.addEventListener("keydown",function(e){
      e.stopPropagation();
      if(e.isComposing||e.keyCode===229)return;
      if(e.key==="Enter"&&inp!==fn){e.preventDefault();inp.blur()}
      else if(e.key==="Escape"){e.preventDefault();hideEdit()}
    });
    inp.addEventListener("keyup",function(e){e.stopPropagation()});
  });
  document.addEventListener("keydown",function(e){
    if(e.key!=="Escape"||!open)return;
    if(ed.classList.contains("show"))hideEdit();
    else if(pick)setPick(false);
    else closeSheet();
  });
  window.addEventListener("resize",function(){if(open)fit()});

  /* ---------- 入口：设置页里，紧挨在「版本 …」上方的一个按钮（版本行保持原样，其它模块仍靠它定位） ---------- */
  function hook(){
    var pg5=document.getElementById("pg5");if(!pg5)return false;
    var ver=null;[].forEach.call(pg5.querySelectorAll(".qtip"),function(el){if(el.textContent.indexOf("版本")>=0)ver=el});
    if(!ver)return false;
    verEl=ver;
    if(pg5.querySelector(".cl-entry-btn"))return true;
    list=load();if(list[0])syncVersion(list[0].v); /* 初始化时同步一次 */
    var b=mk("button","chip cl-entry-btn");b.type="button";
    b.style.cssText="width:100%;margin-top:16px;padding:12px 0;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px;";
    b.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 7v6.2"/><path d="M12 16.9v.2"/></svg><span>更新日志</span>';
    b.addEventListener("click",function(e){e.stopPropagation();openSheet()});
    ver.parentNode.insertBefore(b,ver);
    return true;
  }
  if(!hook()){
    var mo=new MutationObserver(function(){if(hook())mo.disconnect()});
    mo.observe(document.body,{childList:true,subtree:true});
  }
  window.__openChangelog=openSheet;
})();

// app/textbar.js — 顶部输入栏（contenteditable 版，不再使用原生 <input>）
(function(){
  var bar=document.createElement("div");
  bar.id="textBar";bar.setAttribute("role","dialog");bar.setAttribute("aria-label","修改文字");bar.setAttribute("aria-hidden","true");
  // 将 input 换成 contenteditable 的 div
  bar.innerHTML='<div id="textBarIn" contenteditable="true" enterkeyhint="done" spellcheck="false" placeholder="输入一句话" role="textbox" aria-label="文字"></div><button type="button" class="tb-cancel">取消</button><button type="button" class="tb-ok">确认</button>';
  document.body.appendChild(bar);

  // 预热...
  (window.requestIdleCallback||function(f){setTimeout(f,600)})(function(){
    bar.style.transition="none";bar.style.opacity=".01";void bar.offsetWidth;
    requestAnimationFrame(function(){requestAnimationFrame(function(){bar.style.opacity="";bar.style.transition=""})});
  });

  var inp=bar.querySelector("#textBarIn"),cur=null,curT=null,curO=null,DEF="输入一句话";
  function close(){
    bar.classList.remove("show");bar.setAttribute("aria-hidden","true");
    if(cur)cur.classList.remove("editing");
    cur=null;curT=null;curO=null;
    // blur 需要在 contenteditable 上生效
    if(inp.blur)inp.blur();
    var sel=window.getSelection();if(sel)sel.removeAllRanges();
    inp.setAttribute("placeholder",DEF); /* div 没有 placeholder 属性：必须用 setAttribute，CSS 的 attr(placeholder) 才读得到 */
  }

  // 光标移至末尾
  function setCaretEnd(){
    var range=document.createRange(),sel=window.getSelection();
    if(inp.childNodes.length>0){
      range.selectNodeContents(inp);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function open(c,t,o){
    if(cur&&cur!==c)cur.classList.remove("editing");
    cur=c;curT=t;curO=o||null;

    // 设置内容
    var val=(o&&o.value!=null)?o.value:t.value.replace(/\n/g," ");
    inp.textContent=val;
    inp.setAttribute("placeholder",(o&&o.placeholder)||DEF);

    if(c)c.classList.add("editing");
    void bar.offsetWidth;
    bar.classList.add("show");bar.setAttribute("aria-hidden","false");

    try{inp.focus({preventScroll:true})}catch(_){inp.focus()}
    setCaretEnd();
  }

  function ok(){
    var v=(inp.textContent||"").replace(/\n/g," ");
    if(curO&&curO.onOk){
      var f=curO.onOk;
      close();
      f(v);
      return;
    }
    if(curT){
      var t=curT;
      t.value=v;
      t.dispatchEvent(new Event("input",{bubbles:true}));
    }
    close();
  }

  bar.querySelector(".tb-ok").addEventListener("click",ok);
  bar.querySelector(".tb-cancel").addEventListener("click",close);

  inp.addEventListener("keydown",function(e){
    e.stopPropagation();
    if(e.isComposing||e.keyCode===229)return;
    // contenteditable 默认回车会换行，这里拦截掉
    if(e.key==="Enter"){
      e.preventDefault();
      ok();
    }
    else if(e.key==="Escape"){
      e.preventDefault();
      close();
    }
  });
  inp.addEventListener("keyup",function(e){e.stopPropagation()});
  // 兜底：任何方式产生的换行都拦掉（输入栏是单行）
  inp.addEventListener("beforeinput",function(e){
    if(e.inputType==="insertParagraph"||e.inputType==="insertLineBreak")e.preventDefault();
  });
  // 删光文字后浏览器可能留下 <br>，会让 :empty 的占位提示不显示：清掉
  inp.addEventListener("input",function(){
    if(!inp.textContent&&inp.firstChild)inp.innerHTML="";
  });

  // 粘贴时只取纯文本，避免带进 HTML 格式
  inp.addEventListener("paste",function(e){
    e.preventDefault();
    var text=(e.originalEvent||e).clipboardData.getData("text/plain");
    document.execCommand("insertText",false,text.replace(/\n/g," "));
  });

  window.__openTextBar=open;
})();

// 禁止双指缩放...
(function(){
  var stop=function(e){if(e.cancelable)e.preventDefault()};
  ["gesturestart","gesturechange","gestureend"].forEach(function(n){document.addEventListener(n,stop,{passive:false})});
  document.addEventListener("touchmove",function(e){if(e.touches&&e.touches.length>1)stop(e)},{passive:false});
  window.addEventListener("wheel",function(e){if(e.ctrlKey)stop(e)},{passive:false});
})();

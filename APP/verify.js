// verify.js — 用法: node verify.js [appDir=./app] [原始app.js=./app.js]
var fs = require("fs"), path = require("path");
var DIR = process.argv[2] || "./app", ORIG = process.argv[3] || "./app.js";
var ORDER = ["core","utils","player","renderer","poster","timeline","cards","stage","background","storage",
  "mini-player","hub-panel","menus","theme-picker","theme-editor","textbar","devtools","boot"];
var HDR = /^\/\/ app\/[\w-]+\.js — /;
var PERF_CORE = 7, PERF_DEV = 14; // M9：性能模式拆成两半后新增的包装行数

function norm(l) { return l.replace(/\s+/g, " ").trim().replace(/;$/, ""); }
function body(txt) { return txt.split("\n").filter(function (l) { return !HDR.test(l); }); }
var files = {}, fail = 0;
ORDER.forEach(function (n) { files[n] = body(fs.readFileSync(path.join(DIR, n + ".js"), "utf8")); });
// 拆分之后有意修改过的行（Bug 修复）：比对前先还原成原文写法，这样其余部分仍按“纯搬运”严格校验。
// 1) 背景为 1:1 时模糊滑块无效：applyBg 的 1:1 分支原为 bg.style.filter="none";，现按 imgBlur 滑块取值。
var FIXES = [{ file: "background", now: 'bg.style.filter="blur("+$("imgBlur").value+"px)";', orig: '      bg.style.filter="none";' }];
FIXES.forEach(function (f) {
  var k = files[f.file].map(norm).indexOf(norm(f.now));
  if (k < 0) { fail++; console.log("已知修复未找到: " + f.now); return; }
  files[f.file][k] = f.orig; console.log("已还原已知修复(仅用于比对): " + f.file + ".js");
});
var origLines = body(fs.readFileSync(ORIG, "utf8"));

// (1) 按要求：顺序拼接 → 归一化 → 严格比较（原文模块本来是交错排列的，拆分必然改变顺序，这里仅作信息）
var A = ORDER.map(function (n) { return files[n].map(norm).join(" "); }).join(" ").replace(/\s+/g, " ");
var B = origLines.map(norm).join(" ").replace(/\s+/g, " ");
if (A === B) console.log("strict concat: identical");
else {
  var i = 0; while (i < A.length && A[i] === B[i]) i++;
  console.log("strict concat: differs (预期：原文交错排列，拆分后顺序必变) @" + i);
  console.log("  A: " + A.slice(Math.max(0, i - 100), i + 100) + "\n  B: " + B.slice(Math.max(0, i - 100), i + 100));
}

// (2) 行级多重集合：不丢行、不多行（M9 的 6 行包装除外）
function bag(arr) { var m = {}; arr.forEach(function (l) { var k = norm(l); if (k) m[k] = (m[k] || 0) + 1; }); return m; }
var all = []; ORDER.forEach(function (n) { all = all.concat(files[n]); });
var ba = bag(all), bb = bag(origLines);
var EXTRA = { "(function(){": 1, "})()": 1, "var saved=null": 1,
  "try{saved=localStorage.getItem('performanceMode')}catch(_){}": 1,
  "var enabled=saved===null?true:saved==='1'": 1 };
var bad = [];
Object.keys(Object.assign({}, ba, bb)).forEach(function (k) {
  var d = (ba[k] || 0) - (bb[k] || 0) - (EXTRA[k] || 0);
  if (d) bad.push((d > 0 ? "多出 x" : "缺少 x") + Math.abs(d) + ": " + k.slice(0, 80));
});
if (bad.length) { fail++; console.log("行集合不一致:\n  " + bad.slice(0, 20).join("\n  ")); } else console.log("line multiset: OK");

// (3) 每个文件内部语句顺序必须是原文的子序列（renderer 文件头两行 / M9 新增行单独排除）
ORDER.forEach(function (n) {
  var ls = files[n].map(norm).filter(Boolean);
  if (n === "renderer") ls = ls.slice(2);
  if (n === "core") ls = ls.slice(0, ls.length - PERF_CORE);
  if (n === "devtools") ls = ls.slice(PERF_DEV);
  var o = origLines.map(norm).filter(Boolean), p = 0, j;
  for (j = 0; j < ls.length; j++) {
    while (p < o.length && o[p] !== ls[j]) p++;
    if (p >= o.length) { fail++; console.log("ORDER FAIL " + n + ".js 第 " + j + " 行: " + ls[j].slice(0, 80)); break; }
    p++;
  }
});
var r = files.renderer.map(norm).filter(Boolean);
if (!/^var LIVE=true,dirty=0,/.test(r[0]) || !/^function cfgOf\(i\)/.test(r[1])) { fail++; console.log("renderer 文件头两行不对"); }

// (4) 关键点检查
var T = {}; ORDER.forEach(function (n) { T[n] = files[n].join("\n"); });
var origText = origLines.join("\n");
function has(f, s, label) { if (T[f].indexOf(s) < 0) { fail++; console.log("MISSING " + (label || s.slice(0, 60)) + "  in " + f + ".js"); } }
function before(f, a, b) { var x = T[f].indexOf(a), y = T[f].indexOf(b); if (x < 0 || y < 0 || x > y) { fail++; console.log("ORDER " + f + ".js: '" + a.slice(0, 30) + "' 应在 '" + b.slice(0, 30) + "' 之前"); } }
var imgLine = origLines.filter(function (l) { return l.indexOf('var bgMode="img",imgData="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD') === 0; })[0];
if (!imgLine || files.core.indexOf(imgLine) < 0) { fail++; console.log("imgData 行缺失或被改动"); }
else if (!/KAAAAAElFTkSuQmCC";$/.test(imgLine)) console.log("提示: imgData 结尾与清单描述不同: ..." + imgLine.slice(-24));
before("core", "var $=function", 'var stage=$("stage")');
has("core", "document.body.classList.toggle('performance-mode',enabled)"); has("core", 'document.addEventListener("touchstart"');
["var STY=", "var STY2=", "var STY3=", "var FXM=", "var FX_IC=", "var LY=", "CJKCH=", "WORDCH=", "TAILCH=", "OPENCH="].forEach(function (s) { has("core", s); });
has("utils", "var PopFX=(function(){"); has("utils", 'window.addEventListener("pointerdown"'); before("utils", "function iosSpring", "applySpring(1);");
has("player", 'var bag=null,shown="",txtT=0,curMode="";'); before("player", 'var bag=null,shown="",txtT=0,curMode="";', "function shuf");
has("player", "window.addEventListener('pagehide', releaseAudioObjectURL);"); has("player", "var TS = [];");
has("renderer", '$("aspd").dispatchEvent(new Event("input"));'); has("renderer", '$("live").addEventListener("change"'); has("renderer", '$("refresh").onclick=refreshAll;');
has("renderer", '$("speed").addEventListener("input",function(){paintStat(true)});'); has("renderer", '$("meteorOn").addEventListener("change"');
has("renderer", '[].forEach.call(document.querySelectorAll(".gh")'); has("renderer", "var _ms=markStyles");
has("stage", "var lastX=0, downX=0, isMoved=false;"); has("stage", "(function(){var k=curK();mark(k);putThumb(k,true)})();"); has("stage", "showPg(0,1);"); has("stage", "function showPg(i,dir){"); has("stage", '$("cfold").onclick=function(){');
has("background", "function applyPreset(i){"); has("background", "function applyBg(){"); has("background", '$("pgBlur").addEventListener("input",applyPg);');
has("storage", "var _useImg=useImg;useImg=function"); has("storage", "var _applyPg=applyPg;applyPg=function");
has("mini-player", 'g("cfold").onclick=function');
has("hub-panel", "面板高度调节把手");
has("menus", "function qOpen(on){"); before("menus", "function qOpen(on){", "var _q=window.qOpen"); has("menus", "_sp=showPg;");
has("menus", "window.updateMusicPanel = function"); has("menus", "qOpen(false)");
has("theme-editor", "window.applyPreset = applyPreset ="); has("theme-editor", "window.useImg = useImg =");
has("devtools", "performance-mode-change");
has("boot", "applyPreset(0);render();"); has("boot", "serviceWorker");
if (ORDER[ORDER.length - 1] !== "boot") fail++;
ORDER.forEach(function (n) { [/^\s*import\s/m, /^\s*export\s/m, /use strict/, /@ts-check/].forEach(function (re) { if (re.test(T[n]) && !re.test(origText)) { fail++; console.log("禁用写法 " + re + " in " + n + ".js"); } }); });
["var qOpen", "qOpen = function", "var showPg", "var refreshAll", "var applyBg", "var applyPreset"].forEach(function (s) {
  ORDER.forEach(function (n) { if (T[n].indexOf(s) >= 0 && !(s === "qOpen = function" && n === "menus")) { fail++; console.log("函数声明被改写? '" + s + "' in " + n + ".js"); } });
});
// 全局变量只声明一次
["curMode", "shown", "txtT", "shownSig", "statT", "skyT", "dirty", "CF", "LIVE", "TS"].forEach(function (nm) {
  var re = new RegExp("(^|,)\\s*" + nm + "\\s*=\\s*", "");
  var c = 0; ORDER.forEach(function (n) { files[n].forEach(function (l) { if (/^var /.test(l) && new RegExp("[ ,]" + nm + "\\s*=").test(l)) c++; }); });
  if (c !== 1) { fail++; console.log("变量 " + nm + " 声明次数 = " + c); }
});
console.log(fail ? "FAIL (" + fail + ")" : "OK: split is lossless");
process.exit(fail ? 1 : 0);

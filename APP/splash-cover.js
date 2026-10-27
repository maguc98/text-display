// app/splash-cover.js — 自定义开屏封面（设置 → 更多选项 → 开屏封面）
// 选图 → 按屏幕比例裁剪 → 压成 JPEG → 存进 localStorage('splashImg')，下次启动时由 index.html 里的封面脚本读取。
// 预览 = 把封面重新盖上，播一遍「圆形扩散消失」。
(function () {
  'use strict';
  var KEY = 'splashImg';
  var MAX_SIDE = 1400;                    // 长边上限：够清晰，又不会把 localStorage（约 5MB，且被主题 / 自动保存共用）撑爆
  var TIP_DEFAULT = '未设置时使用默认封面。图片会按屏幕比例裁剪，下次启动生效。';

  function $(id) { return document.getElementById(id); }
  var pick = $('splashPick'), prev = $('splashPreview'), reset = $('splashReset'),
      file = $('splashFile'), thumb = $('splashThumb'), tip = $('splashTip');
  if (!pick || !prev || !reset || !file || !thumb) return;

  var mem = '';                           // 存不进 localStorage 时，仅本次运行有效

  function lsGet() { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  function lsSet(v) { try { localStorage.setItem(KEY, v); return localStorage.getItem(KEY) === v; } catch (_) { return false; } }
  function lsDel() { try { localStorage.removeItem(KEY); } catch (_) {} }
  function current() { return mem || lsGet(); }
  function say(msg) { if (tip) tip.textContent = msg; }

  function refresh() {
    var d = current();
    thumb.style.backgroundImage = d ? 'url("' + d + '")' : '';
    thumb.classList.toggle('empty', !d);
    pick.textContent = d ? '更换图片' : '选择图片';
    reset.classList.toggle('hide', !d);
  }

  /* 没有 openCrop（background.js）时的兜底：居中按屏幕比例裁剪 */
  function coverCrop(src, ratio, maxSide) {
    var sw = src.width, sh = src.height, cw = sw, ch = sw / ratio;
    if (ch > sh) { ch = sh; cw = sh * ratio; }
    var sx = (sw - cw) / 2, sy = (sh - ch) / 2, k = Math.min(1, maxSide / Math.max(cw, ch));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(cw * k)); c.height = Math.max(1, Math.round(ch * k));
    c.getContext('2d').drawImage(src, sx, sy, cw, ch, 0, 0, c.width, c.height);
    return c;
  }

  function save(canvas) {
    var q = 0.82, d = canvas.toDataURL('image/jpeg', q);
    while (d.length > 900000 && q > 0.45) { q -= 0.1; d = canvas.toDataURL('image/jpeg', q); }   // 太大就再压一压
    if (lsSet(d)) {
      mem = ''; window.__splashImg = '';
      say('已设置，下次启动生效。点「预览」可以马上看效果。');
    } else {
      mem = d; window.__splashImg = d;
      say('本机存储空间不足或不可用，这张封面只在本次运行中有效。');
    }
    refresh();
    // 点裁剪的「确定」会被 App 当成「点了气泡外面」把设置气泡收起来；稍后重新打开，让用户直接看到结果并能点「预览」
    setTimeout(function () { if (typeof qOpen === 'function') qOpen(true); }, 120);
  }

  pick.onclick = function () { file.click(); };

  file.onchange = function () {
    var f = this.files && this.files[0];
    this.value = '';
    if (!f) return;
    var r = new FileReader();
    r.onerror = function () { say('读取图片失败，请换一张试试。'); };
    r.onload = function () {
      var im = new Image();
      im.onerror = function () { say('这张图片无法打开，请换一张试试。'); };
      im.onload = function () {
        var sc = Math.min(1, 3000 / Math.max(im.width, im.height)),
            cv = document.createElement('canvas');
        cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        var ratio = window.innerWidth / window.innerHeight;
        if (typeof openCrop === 'function') {
          openCrop(cv, function (c) { save(c); },
            { ratio: ratio, max: MAX_SIDE, title: '裁剪开屏封面 · 当前屏幕比例', sub: '框的比例和当前屏幕一致；拖动选位置，双指或滑杆缩放' });
        } else {
          save(coverCrop(cv, ratio, MAX_SIDE));
        }
      };
      im.src = r.result;
    };
    r.readAsDataURL(f);
  };

  prev.onclick = function () {
    if (typeof qOpen === 'function') qOpen(false);               // 先收起设置气泡，免得挡住预览
    if (!window.__showSplash) { say('当前版本不支持预览。'); return; }
    window.__showSplash(function () {
      setTimeout(function () { if (window.__hideSplash) window.__hideSplash(); }, 1000);
    });
  };

  reset.onclick = function () {
    lsDel(); mem = ''; window.__splashImg = '';
    say('已恢复默认封面。');
    refresh();
  };

  say(TIP_DEFAULT);
  refresh();
})();

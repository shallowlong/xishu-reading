/* ==========================================================================
   newspaper.js — 夜读切换、字号、阅读进度、续读记忆
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var body = document.body;
  var THEME_KEY = 'paper.theme';
  var SIZE_KEY = 'paper.size';

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 隐私模式忽略 */ }
  }
  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ------------------------------ 主题 ------------------------------ */

  var themeButtons = document.querySelectorAll('[data-theme-toggle]');
  var themeLabels = document.querySelectorAll('[data-theme-label]');
  var themeMeta = document.querySelector('meta[name="theme-color"]');

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    var isNight = theme === 'night';
    Array.prototype.forEach.call(themeLabels, function (el) {
      el.textContent = isNight ? '白天' : '夜读';
    });
    Array.prototype.forEach.call(themeButtons, function (btn) {
      btn.setAttribute('aria-pressed', isNight ? 'true' : 'false');
      if (btn.classList.contains('rail-btn')) {
        btn.textContent = isNight ? '切回白天' : '切换夜读';
      }
    });
    if (themeMeta) themeMeta.setAttribute('content', isNight ? '#14120e' : '#f6f2e8');
  }

  applyTheme(root.getAttribute('data-theme') === 'night' ? 'night' : 'paper');

  Array.prototype.forEach.call(themeButtons, function (btn) {
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'night' ? 'paper' : 'night';
      safeSet(THEME_KEY, next);
      applyTheme(next);
    });
  });

  /* ------------------------------ 字号 ------------------------------ */

  var fontButtons = document.querySelectorAll('[data-font]');

  function applySize(size) {
    var valid = ['s', 'm', 'l'];
    if (valid.indexOf(size) < 0) size = 'm';
    root.setAttribute('data-size', size);
    Array.prototype.forEach.call(fontButtons, function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-font') === size);
    });
  }

  applySize(safeGet(SIZE_KEY) || root.getAttribute('data-size') || 'm');

  Array.prototype.forEach.call(fontButtons, function (btn) {
    btn.addEventListener('click', function () {
      var size = btn.getAttribute('data-font');
      safeSet(SIZE_KEY, size);
      applySize(size);
    });
  });

  /* --------------------------- 路径与已读状态 --------------------------- */

  function normalizePath(path) {
    var p = String(path || '/');
    p = p.replace(/index\.html$/, '');
    p = p.replace(/\\/g, '/');
    if (p.charAt(0) !== '/') p = '/' + p;
    return p;
  }

  var currentPath = normalizePath(location.pathname);

  function markReadStates() {
    var nodes = document.querySelectorAll('[data-path]');
    Array.prototype.forEach.call(nodes, function (node) {
      if (node === body) return;
      var key = 'paper.read:' + normalizePath(node.getAttribute('data-path'));
      if (safeGet(key)) node.classList.add('is-read');
    });
  }

  markReadStates();

  /* --------------------------- 阅读进度与续读 --------------------------- */

  var isPost = body.getAttribute('data-layout') === 'post';
  if (!isPost) return;

  var posKey = 'paper.pos:' + currentPath;
  var readKey = 'paper.read:' + currentPath;
  var progressFill = document.querySelector('#readingProgress span');
  var railFill = document.querySelector('[data-progress-bar]');
  var percentNodes = document.querySelectorAll('[data-progress-percent]');
  var tocLinks = document.querySelectorAll('.toc-list a[href^="#"]');
  var resumeBar = document.getElementById('resumeBar');
  var resumePercent = document.getElementById('resumePercent');
  var resumeGo = document.getElementById('resumeGo');
  var resumeReset = document.getElementById('resumeReset');
  var saved = null;

  try {
    saved = JSON.parse(safeGet(posKey) || 'null');
  } catch (e) {
    saved = null;
  }

  function maxScroll() {
    return Math.max(0, root.scrollHeight - window.innerHeight);
  }

  function readRatio() {
    var max = maxScroll();
    if (max <= 0) return 1;
    return Math.min(1, Math.max(0, window.scrollY / max));
  }

  function paintProgress(ratio) {
    var percent = Math.round(ratio * 100);
    if (progressFill) progressFill.style.transform = 'scaleX(' + ratio + ')';
    if (railFill) railFill.style.transform = 'scaleX(' + ratio + ')';
    Array.prototype.forEach.call(percentNodes, function (node) {
      node.textContent = percent + '%';
    });
  }

  function findHeading(rawId) {
    var node = document.getElementById(rawId);
    if (node) return node;
    try {
      return document.getElementById(decodeURIComponent(rawId));
    } catch (e) {
      return null;
    }
  }

  function paintToc() {
    if (!tocLinks.length) return;
    var active = null;
    Array.prototype.forEach.call(tocLinks, function (link) {
      var id = link.getAttribute('href').slice(1);
      var target = findHeading(id);
      if (target && target.getBoundingClientRect().top <= 130) active = link;
    });
    Array.prototype.forEach.call(tocLinks, function (link) {
      link.classList.remove('active');
    });
    if (active) active.classList.add('active');
  }

  function saveProgress() {
    var ratio = readRatio();
    safeSet(posKey, JSON.stringify({ r: ratio, y: window.scrollY, t: Date.now() }));
    if (ratio >= 0.8) safeSet(readKey, '1');
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var ratio = readRatio();
      paintProgress(ratio);
      paintToc();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  paintProgress(readRatio());
  paintToc();

  var saveTimer = null;
  window.addEventListener('scroll', function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProgress, 500);
  }, { passive: true });
  window.addEventListener('pagehide', saveProgress);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveProgress();
  });

  /* ------------------------------ 续读提示 ------------------------------ */

  if (resumeBar && saved && typeof saved.r === 'number' && saved.r > 0.03 && saved.r < 0.96) {
    var showResume = function () {
      if (resumePercent) resumePercent.textContent = Math.round(saved.r * 100) + '%';
      resumeBar.hidden = false;
    };
    setTimeout(showResume, 420);

    var hideResume = function () {
      resumeBar.classList.add('is-hidden');
      setTimeout(function () { resumeBar.hidden = true; }, 260);
    };

    if (resumeGo) {
      resumeGo.addEventListener('click', function () {
        var target = Math.round(saved.r * maxScroll());
        window.scrollTo({ top: target, behavior: 'auto' });
        hideResume();
        paintProgress(saved.r);
      });
    }

    if (resumeReset) {
      resumeReset.addEventListener('click', function () {
        safeRemove(posKey);
        window.scrollTo({ top: 0, behavior: 'auto' });
        hideResume();
      });
    }
  }

  /* ------------------------------ 回到顶部 ------------------------------ */

  Array.prototype.forEach.call(document.querySelectorAll('[data-to-top]'), function (btn) {
    btn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
})();

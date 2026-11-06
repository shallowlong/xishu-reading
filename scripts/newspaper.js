/**
 * newspaper.js - 报纸版式阅读站点的站点级脚本
 *
 *  1) 系列（series）聚合页生成：/series/ 与 /series/<path>/
 *  2) 模板辅助函数：字数、阅读时长、目录、摘要、期号、系列信息
 *  3) `{% link url "标题" desc:说明 %}` 标签插件，兼容原系列文章的写法
 *
 * 系列判定顺序：front-matter 的 series -> topic -> 第一个分类名。
 * 主题 _config.yml 的 series 段可以给出中文名、URL 别名、简介，未配置的系列自动兜底。
 */

'use strict';

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

function decodeEntities(text) {
  return String(text)
    .replace(/&#x([0-9a-fA-F]+);/g, function (m, hex) {
      var code = parseInt(hex, 16);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/&#(\d+);/g, function (m, dec) {
      var code = parseInt(dec, 10);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(html) {
  return decodeEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(html) {
  var text = stripTags(html);
  var cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
  var latin = (text.match(/[A-Za-z0-9]+(?:['’.\-][A-Za-z0-9]+)*/g) || []).length;
  return cjk + latin;
}

function readingMinutes(html) {
  var text = stripTags(html);
  var cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length;
  var latin = (text.match(/[A-Za-z0-9]+(?:['’.\-][A-Za-z0-9]+)*/g) || []).length;
  return Math.max(1, Math.round(cjk / 380 + latin / 200));
}

function excerpt(html, length) {
  // 摘要里剔除表格：知乎精选这类文章表格占比高，抽出来全是噪声
  var text = stripTags(String(html || '').replace(/<table[\s\S]*?<\/table>/gi, ' '));
  var max = length || 120;
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/[\s，。、；：,.;:]+$/, '') + '…';
}

/** 版权年份区间：起始年固定，结束年按构建时的当前年动态计算 */
function copyrightYears() {
  var paper = (hexo.theme.config && hexo.theme.config.paper) || {};
  var since = parseInt(paper.since, 10);
  if (!isFinite(since) || since <= 0) since = 2026;
  var now = new Date().getFullYear();
  return now > since ? since + '-' + now : String(since);
}

function seriesIdOf(post) {
  var raw = post.series || post.topic;
  if (!raw && post.categories && typeof post.categories.length === 'number' && post.categories.length) {
    raw = post.categories.first ? post.categories.first().name : post.categories[0];
  }
  if (Array.isArray(raw)) raw = raw[0];
  if (raw && typeof raw === 'object' && raw.name) raw = raw.name;
  return raw ? String(raw).trim() : '';
}

/** 由文章集合构建系列清单（按最近更新倒序） */
function buildSeries(posts) {
  var cfg = (hexo.theme.config && hexo.theme.config.series) || {};
  var cfgKeys = Object.keys(cfg);
  var map = {};

  function ensure(id) {
    if (!map[id]) {
      var c = cfg[id] || {};
      map[id] = {
        id: id,
        name: c.name || id,
        path: c.path || id,
        desc: c.desc || '',
        cover: c.cover || '',
        order: cfgKeys.indexOf(id),
        posts: [],
        count: 0,
        latest: null
      };
    }
    return map[id];
  }

  Object.keys(cfg).forEach(ensure);

  posts.toArray()
    .sort(function (a, b) { return b.date.valueOf() - a.date.valueOf(); })
    .forEach(function (post) {
      var id = seriesIdOf(post);
      if (!id) return;
      var s = ensure(id);
      s.posts.push(post);
      s.count += 1;
    });

  var list = Object.keys(map).map(function (k) { return map[k]; })
    .filter(function (s) { return s.count > 0; });

  list.forEach(function (s) {
    s.posts.sort(function (a, b) { return b.date.valueOf() - a.date.valueOf(); });
    s.latest = s.posts[0];
  });

  // 已登记的系列按配置顺序固定版面，未登记的按最近更新排在后面
  list.sort(function (a, b) {
    var aCfg = a.order >= 0;
    var bCfg = b.order >= 0;
    if (aCfg && bCfg) return a.order - b.order;
    if (aCfg !== bCfg) return aCfg ? -1 : 1;
    return b.latest.date.valueOf() - a.latest.date.valueOf();
  });
  return list;
}

function findSeries(posts, id) {
  if (!id) return null;
  var list = buildSeries(posts);
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

/** 从已渲染 HTML 中提取 h2/h3 生成目录 */
function buildToc(html) {
  var items = [];
  var re = /<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>/gi;
  var m;
  while ((m = re.exec(String(html || '')))) {
    var idm = /\bid="([^"]+)"/.exec(m[2] || '');
    if (!idm) continue;
    var text = stripTags(m[3]);
    if (!text) continue;
    items.push({ level: Number(m[1]), id: idm[1], text: text });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* 模板辅助函数                                                        */
/* ------------------------------------------------------------------ */

hexo.extend.helper.register('paper_series_list', function () {
  return buildSeries(this.site.posts);
});

hexo.extend.helper.register('paper_series_of', function (post) {
  if (!post) return null;
  return findSeries(this.site.posts, seriesIdOf(post));
});

hexo.extend.helper.register('paper_series_name', function (post) {
  var s = this.paper_series_of(post);
  return s ? s.name : '';
});

hexo.extend.helper.register('paper_series_url', function (post) {
  var s = this.paper_series_of(post);
  return s ? this.url_for('/series/' + s.path + '/') : '';
});

hexo.extend.helper.register('paper_word_count', function (content) {
  return countWords(content);
});

hexo.extend.helper.register('paper_reading_time', function (content) {
  return readingMinutes(content);
});

hexo.extend.helper.register('paper_excerpt', function (content, length) {
  return excerpt(content, length);
});

hexo.extend.helper.register('paper_toc', function (content) {
  return buildToc(content);
});

/** 全站文章总数，构建时统计 */
hexo.extend.helper.register('paper_total_count', function () {
  return this.site.posts.length;
});

/** 版权年份区间，如 2026、2026-2027 */
hexo.extend.helper.register('paper_copyright_years', function () {
  return copyrightYears();
});

/** 同系列上一篇（更早）/ 下一篇（更新） */
hexo.extend.helper.register('paper_siblings', function () {
  var post = this.page;
  var id = seriesIdOf(post);
  if (!id) return null;
  var s = findSeries(this.site.posts, id);
  if (!s) return null;

  var index = -1;
  for (var i = 0; i < s.posts.length; i++) {
    if (normalizePath(s.posts[i].path) === normalizePath(post.path)) { index = i; break; }
  }
  if (index < 0) return null;

  return {
    series: s,
    prev: s.posts[index + 1] || null,
    next: s.posts[index - 1] || null
  };
});

function normalizePath(p) {
  return String(p || '').replace(/index\.html$/, '').replace(/\\/g, '/');
}

/* ------------------------------------------------------------------ */
/* 系列聚合页生成                                                      */
/* ------------------------------------------------------------------ */

hexo.extend.generator.register('newspaper_series', function (locals) {
  var list = buildSeries(locals.posts);
  var routes = [];

  routes.push({
    path: 'series/index.html',
    layout: 'series',
    data: {
      title: '系列',
      series_list: list,
      __series_index: true
    }
  });

  list.forEach(function (s) {
    routes.push({
      path: 'series/' + s.path + '/index.html',
      layout: 'series-detail',
      data: {
        title: s.name,
        series: s,
        description: s.desc
      }
    });
  });

  return routes;
});

/* ------------------------------------------------------------------ */
/* 标签插件：{% link url "标题" desc:说明 %}                            */
/* ------------------------------------------------------------------ */

hexo.extend.tag.register('link', function (args) {
  var url = args[0] || '#';
  var text = args[1] || url;
  var desc = args.slice(2).join(' ').replace(/^desc:\s*/, '').replace(/^["']|["']$/g, '');
  var html = '<p class="paper-link"><a href="' + url + '">' +
    '<span class="paper-link-title">' + text + '</span>' +
    (desc ? '<span class="paper-link-desc">' + desc + '</span>' : '') +
    '<span class="paper-link-arrow" aria-hidden="true">→</span>' +
    '</a></p>';
  return html;
});

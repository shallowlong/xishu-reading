/**
 * nunjucks-guard.js - 正文里的「伪 Nunjucks 语法」提前拦截
 *
 * Hexo 渲染文章时会先把正文交给 Nunjucks 处理（为了支持 {% link %} 这类标签插件），
 * 触发条件是正文里出现**成对**的 {{ ... }} / {# ... #} / {% ... %}。
 * 知乎搬运里的 LaTeX 一旦写出 ^{{\color{blue}{\infty}}} 这种多余大括号，
 * 就会命中 {{ ... }}，于是整篇按模板解析 → 构建失败，
 * 而报错只有一段错位的 HTML context dump，很难看出是哪篇文章的哪个公式。
 *
 * 这里在 before_post_render 阶段先扫一遍原文：命中就抛出带文件名/行号/片段的错误，
 * 让本地 `npm run build` 和 CI 都在第一时间说清楚问题在哪。
 *
 * 行内代码与围栏代码块里的花括号会被 Hexo 自己转义，不参与检查。
 */

'use strict';

var TRIGGERS = [
  { re: /\{\{[\s\S]+?\}\}/, label: '{{ … }}' },
  { re: /\{#[\s\S]+?#\}/, label: '{# … #}' }
];

/* 用等长空白替换代码片段，保证行号、列号仍然对应原文 */
function blankOut(match) {
  return match.replace(/[^\n]/g, ' ');
}

function stripCode(text) {
  return String(text)
    .replace(/^ {0,3}(?:```|~~~)[^\n]*\n[\s\S]*?^ {0,3}(?:```|~~~)[ \t]*$/gm, blankOut)
    .replace(/`[^`\n]+`/g, blankOut);
}

function locate(text, index) {
  var line = text.slice(0, index).split('\n').length;
  var col = index - text.lastIndexOf('\n', index - 1);
  return { line: line, col: col };
}

hexo.extend.filter.register('before_post_render', function (data) {
  var raw = data.content || '';
  var text = stripCode(raw);
  var source = data.source || data.path || '(未知文件)';
  // data.content 已去掉 front-matter，补回行偏移，让报的是 md 文件里的真实行号
  var offset = data.raw ? data.raw.split('\n').length - raw.split('\n').length : 0;

  for (var i = 0; i < TRIGGERS.length; i++) {
    var matched = TRIGGERS[i].re.exec(text);
    if (!matched) continue;

    var pos = locate(text, matched.index);
    var snippet = matched[0].length > 160 ? matched[0].slice(0, 160) + '…' : matched[0];

    var err = new Error([
      '',
      '正文里出现了会被当成 Nunjucks 模板解析的写法 ' + TRIGGERS[i].label + '：',
      '  文件：source/' + source,
      '  位置：第 ' + (pos.line + offset) + ' 行，第 ' + pos.col + ' 列',
      '  片段：' + snippet.replace(/\n/g, ' ⏎ '),
      '处理方式（二选一）：',
      '  1) LaTeX 多余的大括号去掉，例如 \\sum_{k=0}^{{\\color{blue}{\\infty}}} → \\sum_{k=0}^{\\color{blue}{\\infty}}',
      '  2) 该段前后包 {% raw %} … {% endraw %}，让 Hexo 跳过模板解析',
      ''
    ].join('\n'));
    err.name = 'NunjucksGuardError';
    throw err;
  }
});

#!/usr/bin/env node
/**
 * sync-image-prompt.js — 【手动批量工具】把「风格图片提示词」日报批量重建为本站系列文章
 *
 * ⚠️ 自动化任务不依赖本脚本：每日任务已把 front-matter 写死在 prompt 里，直接落盘。
 *    本脚本只用于补历史 / 批量重建。改格式时两处都要同步改，或先确认自动化的写法再动。
 *
 *   npm run sync:image            # 全量同步（源目录下所有 YYYY-MM-DD.md）
 *   npm run sync:image -- 2026-09-04   # 只同步某一天
 *
 * 源目录默认 C:\Users\Administrator\.workbuddy\prompts\image-style-daily，
 * 可用环境变量 IMAGE_PROMPT_DIR 覆盖。
 *
 * 处理规则：
 *   1. 文件名 YYYY-MM-DD.md -> 标题「风格图片提示词日报-YYMMDD」
 *   2. 去掉正文开头的 H1（标题由 front-matter 渲染，避免页面出现两个大标题）
 *   3. 图片已是聚合图床绝对 URL，原样保留
 *   4. front-matter 与 scaffolds/image-prompt-daily.md 保持一致
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'source/_posts/image-prompt-daily');
const SRC_DIR = process.env.IMAGE_PROMPT_DIR
  || 'C:\\Users\\Administrator\\.workbuddy\\prompts\\image-style-daily';

const SERIES = 'image-prompt-daily';
const PREFIX = '风格图片提示词日报';
const AUTHOR = '奚叔2099';
const DESC = '每日 3 个风格图片提示词，附效果图与分工具适配版';

function yymmdd(dateStr) {
  return dateStr.slice(2, 4) + dateStr.slice(5, 7) + dateStr.slice(8, 10);
}

function buildFrontMatter(title, dateStr) {
  return [
    '---',
    'title: ' + title,
    'date: ' + dateStr + ' 08:10:00',
    'updated: ' + dateStr + ' 08:10:00',
    'series: ' + SERIES,
    'author: ' + AUTHOR,
    'description: ' + DESC,
    'categories:',
    '  - 图片风格',
    'tags:',
    '  - 提示词',
    '  - AI 生图',
    '  - 风格库',
    '  - 日报',
    '  - AIGC',
    '---',
    ''
  ].join('\n');
}

/** 去掉正文开头的 H1（允许前面有空白行） */
function stripLeadingH1(body) {
  const lines = body.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length && /^#\s+/.test(lines[i]) && !/^##\s/.test(lines[i])) {
    lines.splice(i, 1);
    if (i < lines.length && lines[i].trim() === '') lines.splice(i, 1);
  }
  return lines.join('\n').replace(/^\n+/, '');
}

function main() {
  const only = (process.argv[2] || '').trim();
  if (!fs.existsSync(SRC_DIR)) {
    console.error('源目录不存在: ' + SRC_DIR);
    process.exit(1);
  }
  const files = fs.readdirSync(SRC_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .filter(f => !only || f === only + '.md')
    .sort();

  if (!files.length) {
    console.error('没有匹配的日报文件' + (only ? '（指定日期 ' + only + '）' : ''));
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let created = 0, updated = 0, same = 0;

  for (const f of files) {
    const dateStr = f.slice(0, 10);
    const title = PREFIX + '-' + yymmdd(dateStr);
    const raw = fs.readFileSync(path.join(SRC_DIR, f), 'utf8');
    const body = stripLeadingH1(raw);
    const content = buildFrontMatter(title, dateStr) + '\n' + body;
    const target = path.join(OUT_DIR, title + '.md');
    const exists = fs.existsSync(target);

    if (exists) {
      const prev = fs.readFileSync(target, 'utf8');
      if (prev === content) { same++; continue; }
      fs.writeFileSync(target, content, 'utf8');
      updated++;
    } else {
      fs.writeFileSync(target, content, 'utf8');
      created++;
    }
  }

  console.log('同步完成：新建 ' + created + '，更新 ' + updated + '，无变化 ' + same + '，共 ' + files.length + ' 篇');
  console.log('输出目录：' + path.relative(ROOT, OUT_DIR).replace(/\\/g, '/'));
}

main();

#!/usr/bin/env node
/**
 * new-post.js — 按系列脚手架生成新一期文章
 *
 *   npm run new:insight         -- 1011
 *   npm run new:insight-weekly  -- 261011-261017
 *   npm run new:weekly          -- 260914-260920
 *   npm run new:zhihu           -- 1011
 *
 * 不传后缀时：日报/精选用当天 MMDD；周报用本周一至周日；
 * ai-insight-weekly 用 YYMMDD-YYMMDD（与日报的 YYMMDD 命名保持一致）。
 * 模板取自 scaffolds/<layout>.md，改分类和标签只需要改脚手架。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source/_posts');
const SCAFFOLD_DIR = path.join(ROOT, 'scaffolds');

const PRESETS = {
  insight: { layout: 'ai-insight', dir: 'ai-insight', prefix: 'AI政策洞察日报', suffix: 'day' },
  'insight-weekly': { layout: 'ai-insight-weekly', dir: 'ai-insight-weekly', prefix: 'AI政策洞察周报', suffix: 'week6' },
  weekly: { layout: 'ai-ecom-weekly', dir: 'ai-ecom-weekly', prefix: 'AI驱动服装电商周报', suffix: 'week6' },
  zhihu: { layout: 'zhihu-top', dir: 'zhihu-top', prefix: '知乎高赞精选', suffix: 'day' }
};

function pad(value) {
  return value < 10 ? '0' + value : String(value);
}

function daySuffix(date) {
  return pad(date.getMonth() + 1) + pad(date.getDate());
}

function weekSuffix(date) {
  const day = date.getDay() || 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return daySuffix(monday) + '-' + daySuffix(sunday);
}

/** YYMMDD-YYMMDD，与日报系列的 YYMMDD 命名保持一致 */
function weekSuffix6(date) {
  const day = date.getDay() || 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  function ymd(d) {
    return String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate());
  }
  return ymd(monday) + '-' + ymd(sunday);
}

function formatDate(date) {
  return [
    date.getFullYear(), '-', pad(date.getMonth() + 1), '-', pad(date.getDate()), ' ',
    pad(date.getHours()), ':', pad(date.getMinutes()), ':', pad(date.getSeconds())
  ].join('');
}

const type = process.argv[2];
const preset = PRESETS[type];

if (!preset) {
  console.error('用法: node tools/new-post.js <insight|insight-weekly|weekly|zhihu> [后缀，如 1011 或 261011-261017]');
  process.exit(1);
}

const now = new Date();
const suffix = (process.argv[3] || '').trim() || (
  preset.suffix === 'week6' ? weekSuffix6(now)
    : preset.suffix === 'week' ? weekSuffix(now)
      : daySuffix(now)
);
const title = preset.prefix + '-' + suffix;

const scaffoldPath = path.join(SCAFFOLD_DIR, preset.layout + '.md');
if (!fs.existsSync(scaffoldPath)) {
  console.error('找不到脚手架: ' + path.relative(ROOT, scaffoldPath));
  process.exit(1);
}

const content = fs.readFileSync(scaffoldPath, 'utf8')
  .replace(/\{\{\s*title\s*\}\}/g, title)
  .replace(/\{\{\s*date\s*\}\}/g, formatDate(now));

const targetDir = path.join(POSTS_DIR, preset.dir);
const target = path.join(targetDir, title + '.md');
if (fs.existsSync(target)) {
  console.error('文章已存在: ' + path.relative(ROOT, target));
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(target, content, 'utf8');
console.log('已创建: ' + path.relative(ROOT, target).replace(/\\/g, '/'));

#!/usr/bin/env node
/**
 * auto-commit.js — 定时把 source/_posts 下的内容变化提交并推送到 GitHub
 *
 *   node tools/auto-commit.js
 *   node tools/auto-commit.js --dry-run
 *   node tools/auto-commit.js --quiet     # 无变化时不输出（给计划任务用）
 *
 * 设计要点：
 *   - 只处理 source/_posts，主题、配置、ACCOUNT.md 等仍由人工提交
 *   - 文件最后修改 2 分钟内不提交，避免文章还没写完就推送
 *   - commit 后先 fetch + rebase 再 push，避免 non-fast-forward
 *   - 有本地未推送提交但没有新内容时，也会补推
 *   - 用 .git/auto-commit.lock 防止计划任务重叠执行
 */
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const POSTS = "source/_posts";
const REMOTE = "origin";
const BRANCH = "main";
const QUIET_MS = 2 * 60 * 1000;
const LOCK = path.join(ROOT, ".git", "auto-commit.lock");

const QUIET = process.argv.includes("--quiet");
const DRY_RUN = process.argv.includes("--dry-run");

function git(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function log(message) {
  if (!QUIET) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
}

function fail(message) {
  console.error(`[${new Date().toISOString()}] ${message}`);
  process.exitCode = 1;
}

function guardRebaseInProgress() {
  return (
    fs.existsSync(path.join(ROOT, ".git", "rebase-merge")) ||
    fs.existsSync(path.join(ROOT, ".git", "rebase-apply"))
  );
}

function newestMtime(files) {
  return files.reduce((max, file) => {
    try {
      return Math.max(max, fs.statSync(path.join(ROOT, file)).mtimeMs);
    } catch (err) {
      return max;
    }
  }, 0);
}

function commitIfNeeded() {
  const status = git([
    "-c",
    "core.quotepath=false",
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    POSTS,
  ]);
  if (!status) {
    log("无内容变化");
    return false;
  }

  const files = status
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

  if (Date.now() - newestMtime(files) < QUIET_MS) {
    log("文件刚写入，等下一轮再提交");
    return false;
  }

  git(["add", "-A", "--", POSTS]);

  const staged = git([
    "-c",
    "core.quotepath=false",
    "diff",
    "--cached",
    "--name-only",
    "--",
    POSTS,
  ]);
  if (!staged) {
    log("无实际内容差异");
    return false;
  }

  const list = staged.split("\n").filter(Boolean);
  const when = new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" })
    .slice(0, 16);
  const body = list.map((file) => "- " + file).join("\n");

  if (DRY_RUN) {
    log(`[dry-run] 将提交 ${list.length} 个文件：`);
    console.log(body);
    return false;
  }

  git(["commit", "-m", `content: update ${when}`, "-m", body]);
  log(`已提交 ${list.length} 个文件`);
  return true;
}

function pushIfNeeded() {
  git(["fetch", REMOTE, BRANCH]);

  const ahead = parseInt(
    git(["rev-list", "--count", `${REMOTE}/${BRANCH}..${BRANCH}`]),
    10,
  );

  if (!ahead) {
    log("没有待推送的提交");
    return;
  }

  if (DRY_RUN) {
    log(`[dry-run] 有 ${ahead} 个提交待推送`);
    return;
  }

  try {
    git(["pull", "--rebase", "--autostash", REMOTE, BRANCH]);
  } catch (err) {
    fail("rebase 失败，本地提交已保留，请手动处理冲突");
    return;
  }

  git(["push", REMOTE, BRANCH]);
  log(`已推送 ${ahead} 个提交到 ${REMOTE}/${BRANCH}`);
}

function main() {
  if (guardRebaseInProgress()) {
    fail("检测到未完成的 rebase，请手动处理后重试");
    return;
  }

  let lockFd;
  try {
    lockFd = fs.openSync(LOCK, "wx");
  } catch (err) {
    log("上一轮仍在运行，跳过");
    return;
  }

  try {
    commitIfNeeded();
    pushIfNeeded();
  } catch (err) {
    fail("执行失败: " + String(err.stderr || err.message).trim());
  } finally {
    try {
      fs.closeSync(lockFd);
    } catch (err) {
      /* ignore */
    }
    try {
      fs.unlinkSync(LOCK);
    } catch (err) {
      /* ignore */
    }
  }
}

main();

#!/usr/bin/env node
// 把 .claude/skills 整个链接到 .agents/skills，让 Claude Code 和 Codex 共用同一套 skill。
// 链接的是目录本身，以后新增或删除 skill 都不需要重新运行。
// macOS/Linux 建相对软链；Windows 建目录 junction（不需要管理员或开发者模式）。
// 用法：node scripts/link-agent-skills.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, '.agents', 'skills');
const link = path.join(root, '.claude', 'skills');
const isWin = process.platform === 'win32';

if (!fs.existsSync(source)) {
  console.error(`找不到 ${source}`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(link), { recursive: true });

let stat = null;
try {
  stat = fs.lstatSync(link);
} catch {}

if (stat) {
  if (stat.isSymbolicLink()) {
    if (fs.realpathSync(link) === fs.realpathSync(source)) {
      console.log(`已链接：${link} -> ${source}`);
      process.exit(0);
    }
    fs.unlinkSync(link);
  } else {
    console.error(`${link} 已存在且不是链接，请确认里面没有要保留的内容后手动删除，再重新运行。`);
    process.exit(1);
  }
}

// junction 必须用绝对路径；软链用相对路径，仓库挪位置也不会失效。
const target = isWin ? source : path.relative(path.dirname(link), source);
fs.symlinkSync(target, link, isWin ? 'junction' : 'dir');
console.log(`已创建：${link} -> ${target}`);

#!/usr/bin/env bash
# 把 .claude/skills 整个软链到 .agents/skills，让 Claude Code 和 Codex 共用同一套 skill。
# 链接的是目录本身，新增或删除 skill 不需要重新运行。该链接不入库，clone 后本地运行一次即可。
# Windows 请用 scripts\link-agent-skills.bat。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$root/.agents/skills"
link="$root/.claude/skills"
target="../.agents/skills"

[ -d "$source_dir" ] || { echo "找不到 $source_dir" >&2; exit 1; }
mkdir -p "$root/.claude"

if [ -L "$link" ]; then
  if [ "$(readlink "$link")" = "$target" ]; then
    echo "已链接：.claude/skills -> $target"
    exit 0
  fi
  rm "$link"
elif [ -e "$link" ]; then
  echo ".claude/skills 已存在且不是链接，请确认里面没有要保留的内容后手动删除，再重新运行。" >&2
  exit 1
fi

ln -s "$target" "$link"
echo "已创建：.claude/skills -> $target"

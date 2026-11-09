#!/usr/bin/env bash
# 把 .agents/skills/ 下的每个 skill 软链到 .claude/skills/，让 Codex 和 Claude Code 共用一份。
# 可重复执行：补齐缺失链接，修正指向错误的链接，清理源目录已删除的失效链接；
# .claude/skills/ 下的真实目录（Claude 专属 skill）不会被动到。
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/.agents/skills"
dst="$root/.claude/skills"

[ -d "$src" ] || { echo "找不到 $src" >&2; exit 1; }
mkdir -p "$dst"

for dir in "$src"/*/; do
  name="$(basename "$dir")"
  [ -f "$dir/SKILL.md" ] || continue
  target="../../.agents/skills/$name"
  link="$dst/$name"
  if [ -L "$link" ]; then
    [ "$(readlink "$link")" = "$target" ] && { echo "= $name"; continue; }
    rm "$link"
  elif [ -e "$link" ]; then
    echo "! $name：.claude/skills 下已有同名真实目录，跳过" >&2
    continue
  fi
  ln -s "$target" "$link"
  echo "+ $name"
done

for link in "$dst"/*; do
  [ -L "$link" ] && [ ! -e "$link" ] && { rm "$link"; echo "- $(basename "$link")（源已删除）"; }
done
exit 0

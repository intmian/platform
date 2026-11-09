@echo off
rem 把 .claude\skills 整个链接到 .agents\skills（目录 junction，不需要管理员或开发者模式），
rem 让 Claude Code 和 Codex 共用同一套 skill。新增或删除 skill 不需要重新运行。
rem 该链接不入库，clone 后本地运行一次即可。macOS/Linux 请用 scripts/link-agent-skills.sh。
setlocal
chcp 65001 >nul

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "SOURCE=%ROOT%\.agents\skills"
set "LINK=%ROOT%\.claude\skills"

if not exist "%SOURCE%\" (
  echo 找不到 %SOURCE%
  exit /b 1
)
if not exist "%ROOT%\.claude\" mkdir "%ROOT%\.claude"

rem 判断 .claude\skills 是否已是链接（junction/软链带 L 属性）
set "ISLINK="
if exist "%LINK%" (
  for %%A in ("%LINK%") do echo %%~aA | find "l" >nul && set "ISLINK=1"
  if not defined ISLINK (
    echo .claude\skills 已存在且不是链接，请确认里面没有要保留的内容后手动删除，再重新运行。
    exit /b 1
  )
  rem 已是链接：删掉重建，保证指向当前仓库的 .agents\skills（rmdir 只删链接，不动源目录）
  rmdir "%LINK%"
)

mklink /J "%LINK%" "%SOURCE%" >nul || (
  echo 创建 junction 失败
  exit /b 1
)
echo 已链接：.claude\skills -^> %SOURCE%
endlocal

#!/bin/zsh -il
set -e
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null; then
  print '请先安装 Node.js 24，再重新双击此文件。'
  read -r '?按回车关闭。'
  exit 1
fi
if ! node --import tsx scripts/service.mjs start; then
  read -r '?启动失败，按回车关闭。'
  exit 1
fi
node --import tsx scripts/service-console.mjs --open

#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null; then
  echo '请先安装 Node.js 24，再重新运行此文件。'
  exit 1
fi
node --import tsx scripts/service.mjs start
node --import tsx scripts/service-console.mjs --open

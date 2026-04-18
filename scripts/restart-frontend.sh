#!/bin/bash
# 重启前端: 先停后启

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔄 正在重启前端..."
bash "$SCRIPT_DIR/stop-frontend.sh"
sleep 1
bash "$SCRIPT_DIR/start-frontend.sh"

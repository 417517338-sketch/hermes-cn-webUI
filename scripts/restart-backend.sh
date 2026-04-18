#!/bin/bash
# 重启后端: 先停后启

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔄 正在重启后端..."
bash "$SCRIPT_DIR/stop-backend.sh"
sleep 1
bash "$SCRIPT_DIR/start-backend.sh"

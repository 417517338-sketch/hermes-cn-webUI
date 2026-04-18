#!/bin/bash
# 重启前后端

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🔄 重启前后端..."
bash "$SCRIPT_DIR/stop-all.sh"
sleep 1
bash "$SCRIPT_DIR/start-all.sh"

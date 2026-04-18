#!/bin/bash
# 同时停止前端和后端

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🛑 停止前后端..."
bash "$SCRIPT_DIR/stop-frontend.sh"
bash "$SCRIPT_DIR/stop-backend.sh"

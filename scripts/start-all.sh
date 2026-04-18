#!/bin/bash
# 同时启动前端和后端，各自在独立 Terminal 窗口

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 启动前后端..."
bash "$SCRIPT_DIR/start-backend.sh"
sleep 1
bash "$SCRIPT_DIR/start-frontend.sh"

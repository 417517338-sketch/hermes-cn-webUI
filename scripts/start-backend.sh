#!/bin/bash
# 启动后端 (Node server on port 3001)
# 在新 Terminal 窗口中执行，不阻塞当前会话

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

osascript <<EOF
tell application "Terminal"
    activate
    do script "cd ${PROJECT_DIR} && node server/index.js 2>&1 | while read line; do echo \"[backend] \${line}\"; done; echo 'Press Enter to close...'; read"
end tell
EOF

echo "✅ 后端已在新 Terminal 窗口启动 (http://localhost:3001)"

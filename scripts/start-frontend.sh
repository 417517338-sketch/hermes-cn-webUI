#!/bin/bash
# 启动前端 (Vite dev server on port 3000)
# 在新 Terminal 窗口中执行，不阻塞当前会话

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

osascript <<EOF
tell application "Terminal"
    activate
    do script "cd ${PROJECT_DIR} && node_modules/.bin/vite --port 3000 2>&1 | while read line; do echo \"[frontend] \${line}\"; done; echo 'Press Enter to close...'; read"
end tell
EOF

echo "✅ 前端已在新 Terminal 窗口启动 (http://localhost:3000)"

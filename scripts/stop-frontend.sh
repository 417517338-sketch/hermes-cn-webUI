#!/bin/bash
# 停止前端 (kill port 3000)

PID=$(lsof -i :3000 -t 2>/dev/null)
if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null
    echo "🛑 前端已停止 (port 3000)"
else
    echo "⚠️  前端未在运行 (port 3000)"
fi

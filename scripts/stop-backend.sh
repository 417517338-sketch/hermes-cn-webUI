#!/bin/bash
# 停止后端 (kill port 3001)

PID=$(lsof -i :3001 -t 2>/dev/null)
if [ -n "$PID" ]; then
    kill -9 $PID 2>/dev/null
    echo "🛑 后端已停止 (port 3001)"
else
    echo "⚠️  后端未在运行 (port 3001)"
fi

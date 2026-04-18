#!/bin/bash
#
# hermes-cn-webui 一键部署脚本
# 用法: curl -s https://raw.githubusercontent.com/417517338-sketch/hermes-cn-webUI/master/scripts/deploy.sh | bash
# 或: bash <(curl -s https://raw.githubusercontent.com/417517338-sketch/hermes-cn-webUI/master/scripts/deploy.sh)
#

set -e

# 配置
REPO_URL="${REPO_URL:-https://github.com/417517338-sketch/hermes-cn-webUI.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/hermes-cn-webui}"
BRANCH="${BRANCH:-master}"
PORT_FRONTEND="${PORT_FRONTEND:-3000}"
PORT_BACKEND="${PORT_BACKEND:-3001}"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1"; }

# 检查系统
check_system() {
    log "检查系统环境..."
    
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        warn "本脚本主要针对 Linux 系统优化，当前检测到: $OSTYPE"
    fi
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        error "Node.js 未安装，请先安装 Node.js 20+: https://nodejs.org/"
    fi
    
    NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [[ "$NODE_VER" -lt 20 ]]; then
        error "Node.js 版本过低，需要 20+，当前: $(node -v)"
    fi
    
    log "Node.js $(node -v) ✓"
    
    # 检查 pnpm
    if ! command -v pnpm &> /dev/null; then
        log "安装 pnpm..."
        npm install -g pnpm
    fi
    log "pnpm $(pnpm -v) ✓"
}

# 部署函数
deploy() {
    log "开始部署 hermes-cn-webui..."
    log "安装目录: $INSTALL_DIR"
    log "分支: $BRANCH"
    
    # 创建目录
    if [[ -d "$INSTALL_DIR" ]]; then
        warn "安装目录已存在，是否更新？(y/n)"
        read -r answer
        if [[ "$answer" =~ ^[Yy]$ ]]; then
            log "更新代码..."
            cd "$INSTALL_DIR"
            git pull origin "$BRANCH"
        else
            log "跳过更新，使用现有代码"
        fi
    else
        log "创建目录并克隆代码..."
        mkdir -p "$INSTALL_DIR"
        git clone -b "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    fi
    
    # 安装依赖
    log "安装依赖..."
    cd "$INSTALL_DIR"
    pnpm install
    
    # 配置
    if [[ ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example .env
            warn "已创建 .env 文件，请编辑 $INSTALL_DIR/.env 配置必要的 API Keys"
        fi
    fi
    
    log "依赖安装完成 ✓"
}

# 启动函数
start() {
    log "启动服务..."
    cd "$INSTALL_DIR"
    
    # 使用 systemd（如果存在）
    if command -v systemctl &> /dev/null && [[ "$EUID" -eq 0 ]]; then
        log "配置 systemd 服务..."
        
        cat > /etc/systemd/system/hermes-cnweb.service << EOF
[Unit]
Description=Hermes-CN-WebUI
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
ExecStart=$(command -v node) $INSTALL_DIR/hermes-cnweb.js start
Restart=always
User=$USER

[Install]
WantedBy=multi-user.target
EOF
        
        systemctl daemon-reload
        systemctl enable hermes-cnweb
        systemctl start hermes-cnweb
        
        log "服务已启动 (systemd)"
        log "前端: http://localhost:$PORT_FRONTEND"
        log "后端: http://localhost:$PORT_BACKEND"
        log ""
        log "管理命令:"
        log "  systemctl status hermes-cnweb  # 查看状态"
        log "  systemctl restart hermes-cnweb # 重启"
        log "  journalctl -u hermes-cnweb -f   # 查看日志"
    else
        log "直接启动（前台运行，关闭窗口后停止）..."
        log "如需后台运行，请使用 nohup 或 systemd"
        echo ""
        node hermes-cnweb.js start
    fi
}

# 主菜单
main() {
    echo ""
    echo "========================================"
    echo "  hermes-cn-webui 一键部署脚本"
    echo "========================================"
    echo ""
    
    check_system
    
    echo ""
    echo "请选择操作:"
    echo "  1) 部署 + 启动"
    echo "  2) 仅部署"
    echo "  3) 仅启动"
    echo "  4) 停止服务"
    echo ""
    read -p "请输入选项 [1]: " choice
    
    choice=${choice:-1}
    
    case $choice in
        1) deploy && start ;;
        2) deploy ;;
        3) start ;;
        4)
            if command -v systemctl &> /dev/null && [[ "$EUID" -eq 0 ]]; then
                systemctl stop hermes-cnweb
                log "服务已停止"
            else
                pkill -f "hermes-cnweb" || true
                log "已尝试停止服务"
            fi
            ;;
        *) error "无效选项: $choice" ;;
    esac
}

main "$@"

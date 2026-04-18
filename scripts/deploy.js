#!/usr/bin/env node
/**
 * hermes-cn-webui 跨平台部署脚本
 * 用法: node deploy.js [deploy|start|stop|restart]
 */

import { spawn, execSync } from 'child_process';
import { createInterface } from 'readline';
import fs from 'fs';
import path from 'path';
import os from 'os';
import https from 'https';
import http from 'http';

// 配置
const CONFIG = {
  repoUrl: process.env.REPO_URL || 'https://github.com/417517338-sketch/hermes-cn-webUI.git',
  installDir: process.env.INSTALL_DIR || '/opt/hermes-cn-webui',
  branch: process.env.BRANCH || 'master',
  portFrontend: process.env.PORT_FRONTEND || '3000',
  portBackend: process.env.PORT_BACKEND || '3001',
};

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer));
  });
}

function log(msg, type = 'INFO') {
  const colors = { INFO: '\x1b[32m', WARN: '\x1b[33m', ERROR: '\x1b[31m' };
  console.log(`${colors[type] || ''}[${type}]${type === 'ERROR' ? '\x1b[0m' : ''} ${msg}\x1b[0m`);
}

function exec(cmd, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [], { shell: true, stdio: 'inherit', ...options });
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed: ${cmd}`));
    });
    child.on('error', reject);
  });
}

async function checkSystem() {
  log('检查系统环境...');
  
  // 检查 Node.js
  try {
    const version = execSync('node -v', { encoding: 'utf-8' }).trim();
    const major = parseInt(version.slice(1).split('.')[0]);
    if (major < 20) {
      log(`Node.js 版本过低，需要 20+，当前: ${version}`, 'ERROR');
      process.exit(1);
    }
    log(`Node.js ${version} ✓`);
  } catch {
    log('Node.js 未安装，请先安装: https://nodejs.org/', 'ERROR');
    process.exit(1);
  }
  
  // 检查 pnpm
  try {
    execSync('pnpm -v', { stdio: 'ignore' });
    const version = execSync('pnpm -v', { encoding: 'utf-8' }).trim();
    log(`pnpm ${version} ✓`);
  } catch {
    log('安装 pnpm...');
    try {
      execSync('npm install -g pnpm', { stdio: 'inherit' });
      log('pnpm 安装完成 ✓');
    } catch {
      log('pnpm 安装失败，请手动运行: npm install -g pnpm', 'ERROR');
      process.exit(1);
    }
  }
}

async function deploy() {
  log(`开始部署 hermes-cn-webui...`);
  log(`安装目录: ${CONFIG.installDir}`);
  log(`分支: ${CONFIG.branch}`);
  
  // 创建目录
  if (fs.existsSync(CONFIG.installDir)) {
    log('安装目录已存在，是否更新？ (y/n)');
    const answer = await ask('');
    if (answer.toLowerCase() === 'y') {
      log('更新代码...');
      exec(`cd ${CONFIG.installDir} && git pull origin ${CONFIG.branch}`);
    } else {
      log('跳过更新，使用现有代码');
    }
  } else {
    log('创建目录并克隆代码...');
    fs.mkdirSync(CONFIG.installDir, { recursive: true });
    exec(`git clone -b ${CONFIG.branch} ${CONFIG.repoUrl} "${CONFIG.installDir}"`);
  }
  
  // 安装依赖
  log('安装依赖...');
  exec(`cd "${CONFIG.installDir}" && pnpm install`);
  
  // 配置
  const envFile = path.join(CONFIG.installDir, '.env');
  const envExample = path.join(CONFIG.installDir, '.env.example');
  
  if (!fs.existsSync(envFile) && fs.existsSync(envExample)) {
    fs.copyFileSync(envExample, envFile);
    log('已创建 .env 文件，请编辑配置必要的 API Keys', 'WARN');
  }
  
  log('依赖安装完成 ✓');
}

async function startService() {
  log('启动服务...');
  
  const serviceFile = '/etc/systemd/system/hermes-cnweb.service';
  const isRoot = process.getuid && process.getuid() === 0;
  
  if (isRoot && fs.existsSync('/bin/systemctl')) {
    log('配置 systemd 服务...');
    
    const serviceContent = `[Unit]
Description=Hermes-CN-WebUI
After=network.target

[Service]
Type=simple
WorkingDirectory=${CONFIG.installDir}
ExecStart=${process.execPath} ${CONFIG.installDir}/hermes-cnweb.js start
Restart=always
User=${process.env.USER}

[Install]
WantedBy=multi-user.target
`;
    
    fs.writeFileSync(serviceFile, serviceContent);
    exec('systemctl daemon-reload');
    exec('systemctl enable hermes-cnweb');
    exec('systemctl start hermes-cnweb');
    
    log('服务已启动 (systemd)');
  } else {
    log('直接启动（前台运行）...');
    spawn('node', [path.join(CONFIG.installDir, 'hermes-cnweb.js'), 'start'], {
      cwd: CONFIG.installDir,
      stdio: 'inherit',
      detached: true
    }).unref();
  }
  
  log(`前端: http://localhost:${CONFIG.portFrontend}`);
  log(`后端: http://localhost:${CONFIG.portBackend}`);
}

async function stopService() {
  log('停止服务...');
  
  try {
    if (fs.existsSync('/bin/systemctl') && fs.existsSync('/etc/systemd/system/hermes-cnweb.service')) {
      exec('systemctl stop hermes-cnweb');
      log('服务已停止 (systemd)');
    } else {
      exec('pkill -f hermes-cnweb || true');
      log('已尝试停止服务');
    }
  } catch {
    log('停止时出错', 'WARN');
  }
}

async function main() {
  console.log('\n========================================');
  console.log('  hermes-cn-webui 一键部署脚本');
  console.log('========================================\n');
  
  await checkSystem();
  
  console.log('\n请选择操作:');
  console.log('  1) 部署 + 启动');
  console.log('  2) 仅部署');
  console.log('  3) 仅启动');
  console.log('  4) 停止服务');
  console.log('');
  
  const choice = await ask('请输入选项 [1]: ') || '1';
  
  switch (choice) {
    case '1': await deploy(); await startService(); break;
    case '2': await deploy(); break;
    case '3': await startService(); break;
    case '4': await stopService(); break;
    default: log(`无效选项: ${choice}`, 'ERROR'); process.exit(1);
  }
  
  rl.close();
}

main().catch(err => {
  log(err.message, 'ERROR');
  process.exit(1);
});

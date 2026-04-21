#!/usr/bin/env node
/**
 * hermes-cnweb - 跨平台启动脚本
 * 用法：hermes-cnweb [start|stop|restart]
 * 
 * 支持的操作系统：
 * - Windows 10/11 (PowerShell)
 * - macOS (10.15+)
 * - Linux (Ubuntu/Debian/CentOS)
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 跨平台获取项目目录
function getProjectDir() {
  // 方式 1: 通过环境变量（全局安装时设置）
  if (process.env.HERMES_PROJECT_DIR) {
    return process.env.HERMES_PROJECT_DIR;
  }
  
  // 方式 2: 脚本自身所在目录（symlink 时准确定位）
  let scriptPath = process.argv[1] ? path.resolve(process.argv[1]) : __filename;
  
  // Windows: 解析 symlink
  try {
    const stats = fs.lstatSync(scriptPath);
    if (stats.isSymbolicLink()) {
      scriptPath = fs.realpathSync(scriptPath);
    }
  } catch {}
  
  return path.dirname(scriptPath);
}

// 跨平台进程查找
function findProcess(name) {
  try {
    const platform = os.platform();
    let cmd;
    
    if (platform === 'win32') {
      cmd = `tasklist /FI "IMAGENAME eq ${name}" /FO CSV /NH`;
    } else {
      cmd = `pgrep -f "${name}"`;
    }
    
    const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    
    if (platform === 'win32') {
      const lines = output.trim().split('\n');
      return lines.length > 1;
    } else {
      return output.trim().split('\n').filter(l => l.trim()).length > 0;
    }
  } catch {
    return false;
  }
}

// 跨平台启动后台进程
function startServices(projectDir) {
  const child = spawn('npx', ['concurrently', 'npm run dev', 'npm run dev:server'], {
    cwd: projectDir,
    detached: true,
    stdio: 'ignore',
    shell: true
  });
  child.unref();
  return child;
}

// 跨平台杀死进程
function killProcess(name) {
  try {
    const platform = os.platform();
    let cmd;
    
    if (platform === 'win32') {
      cmd = `taskkill /F /IM ${name}`;
    } else {
      cmd = `pkill -f "${name}"`;
    }
    
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
🚀 hermes-cn-webUI 跨平台启动脚本

用法: hermes-cnweb [start|stop|restart]

命令:
  start    启动前端和后端服务
  stop     停止所有运行中的服务
  restart  重启服务

示例:
  hermes-cnweb start    # 启动服务
  hermes-cnweb stop     # 停止服务
  hermes-cnweb restart  # 重启服务

端口:
  前端：http://localhost:3000
  后端：http://localhost:3001

支持的操作系统:
  ✅ Windows 10/11
  ✅ macOS (10.15+)
  ✅ Linux (Ubuntu/Debian/CentOS)

更多文档：https://github.com/417517338-sketch/hermes-cn-webUI/blob/master/CROSS_PLATFORM.md
`);
}

// 主函数
async function main() {
  const projectDir = getProjectDir();
  const action = process.argv[2] || 'start';
  const platformName = os.platform() === 'win32' ? 'Windows' : os.platform() === 'darwin' ? 'macOS' : 'Linux';
  
  console.log(`\n🚀 hermes-cn-webUI 跨平台脚本`);
  console.log(`📁 项目目录：${projectDir}`);
  console.log(`🖥️  平台：${platformName}\n`);
  
  switch (action) {
    case 'start':
      console.log('📦 启动服务...\n');
      console.log('   前端：http://localhost:3000');
      console.log('   后端：http://localhost:3001\n');
      
      try {
        startServices(projectDir);
        console.log('✅ 启动完成！\n');
        console.log('提示：按 Ctrl+C 可退出（仅退出脚本，服务继续运行）\n');
      } catch (err) {
        console.error('❌ 启动失败:', err.message);
        process.exit(1);
      }
      break;
      
    case 'stop':
      console.log('🛑 停止服务...\n');
      
      const killed = [
        killProcess('vite'),
        killProcess('node'),
        killProcess('concurrently'),
      ];
      
      if (killed.some(r => r)) {
        console.log('✅ 停止完成\n');
      } else {
        console.log('⚠️  未找到运行中的服务\n');
      }
      break;
      
    case 'restart':
      console.log('🔄 重启服务...\n');
      execSync(`${process.execPath} "${path.resolve(process.argv[1])}" stop`, { stdio: 'inherit', shell: true });
      await new Promise(resolve => setTimeout(resolve, 1000));
      execSync(`${process.execPath} "${path.resolve(process.argv[1])}" start`, { stdio: 'inherit', shell: true });
      break;
      
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
      
    default:
      console.log(`\n❌ 未知命令：${action}\n`);
      showHelp();
      process.exit(1);
  }
}

main().catch(console.error);

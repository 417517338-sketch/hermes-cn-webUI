#!/usr/bin/env node
/**
 * hermes-cn-webui 跨平台启动脚本
 * 用法: node hermes-cnweb.js [start|stop|restart]
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import fs from 'fs';

// 跨平台获取项目目录
function getProjectDir() {
  // 方式1: 通过环境变量（全局安装时设置）
  if (process.env.HERMES_PROJECT_DIR) {
    return process.env.HERMES_PROJECT_DIR;
  }
  
  // 方式2: 脚本自身所在目录（symlink 时准确定位）
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

// 主函数
async function main() {
  const projectDir = getProjectDir();
  const action = process.argv[2] || 'start';
  const platformName = os.platform() === 'win32' ? 'Windows' : os.platform() === 'darwin' ? 'macOS' : 'Linux';
  
  console.log(`\n🚀 hermes-cn-webui 跨平台脚本`);
  console.log(`📁 项目目录: ${projectDir}`);
  console.log(`🖥️  平台: ${platformName}\n`);
  
  switch (action) {
    case 'start':
      console.log('📦 启动服务...\n');
      console.log('   前端: http://localhost:3000');
      console.log('   后端: http://localhost:3001\n');
      
      try {
        startServices(projectDir);
        console.log('✅ 启动完成！\n');
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
      execSync(`"${process.execPath}" "${path.resolve(process.argv[1])}" stop`, { stdio: 'inherit', shell: true });
      await new Promise(resolve => setTimeout(resolve, 1000));
      execSync(`"${process.execPath}" "${path.resolve(process.argv[1])}" start`, { stdio: 'inherit', shell: true });
      break;
      
    default:
      console.log(`\n用法: node hermes-cnweb.js [start|stop|restart]\n`);
      console.log(`或者添加到 PATH 后直接运行: hermes-cnweb start\n`);
      process.exit(1);
  }
}

main().catch(console.error);

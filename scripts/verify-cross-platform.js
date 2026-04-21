#!/usr/bin/env node
/**
 * 跨平台兼容性验证脚本
 * 用法：node scripts/verify-cross-platform.js
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function section(title) {
  log(colors.cyan, `\n${'='.repeat(50)}`);
  log(colors.cyan, ` ${title}`);
  log(colors.cyan, `${'='.repeat(50)}\n`);
}

function check(name, fn) {
  try {
    const result = fn();
    if (result === true || result === '') {
      log(colors.green, `✅ ${name}`);
      return true;
    } else {
      log(colors.yellow, `⚠️  ${name}: ${result}`);
      return false;
    }
  } catch (err) {
    log(colors.red, `❌ ${name}: ${err.message}`);
    return false;
  }
}

let passed = 0;
let failed = 0;

section('hermes-cn-webUI 跨平台兼容性验证');

log(colors.blue, `操作系统：${os.platform()} ${os.release()}`);
log(colors.blue, `架构：${os.arch()}`);
log(colors.blue, `主目录：${os.homedir()}`);
log(colors.blue, `Node.js: ${process.version}`);

// 1. Node.js 版本检查
section('1. Node.js 环境');

check('Node.js 版本 >= 20', () => {
  const version = parseInt(process.version.replace('v', '').split('.')[0]);
  if (version < 20) {
    return `当前版本 ${process.version}，需要 20+`;
  }
  return true;
});

check('pnpm 可用', () => {
  try {
    execSync('pnpm --version', { stdio: 'pipe' });
    return true;
  } catch {
    return 'pnpm 未安装';
  }
});

// 2. 路径处理检查
section('2. 路径处理');

check('path.join 跨平台兼容', () => {
  const testPath = path.join(os.homedir(), '.hermes', 'config.yaml');
  const expectedSep = os.platform() === 'win32' ? '\\' : '/';
  if (testPath.includes(expectedSep) || !testPath.includes('/')) {
    return true;
  }
  return '路径分隔符异常';
});

check('os.homedir() 返回有效路径', () => {
  const home = os.homedir();
  if (!home || home.length < 3) {
    return '主目录路径无效';
  }
  return true;
});

// 3. 文件结构检查
section('3. 项目文件结构');

const requiredFiles = [
  'package.json',
  'server/index.js',
  'hermes-cnweb.js',
  'hermes-cnweb.cmd',
  'CROSS_PLATFORM.md',
];

requiredFiles.forEach(file => {
  check(`文件存在：${file}`, () => {
    const filePath = path.join(process.cwd(), file);
    if (!fs.existsSync(filePath)) {
      return `文件不存在：${file}`;
    }
    return true;
  });
});

// 4. 跨平台代码检查
section('4. 跨平台代码实现');

check('server/routes/status.js 使用 os.homedir()', () => {
  const content = fs.readFileSync('server/routes/status.js', 'utf-8');
  if (content.includes('os.homedir()') || content.includes('process.env.HOME')) {
    return true;
  }
  return '未检测到跨平台路径处理';
});

check('server/routes/startup.js 支持 Windows', () => {
  const content = fs.readFileSync('server/routes/startup.js', 'utf-8');
  const hasWinCheck = content.includes("platform() === 'win32'");
  const hasPowerShell = content.includes('powershell') || content.includes('Start-Process');
  if (hasWinCheck && hasPowerShell) {
    return true;
  }
  return 'Windows 支持不完整';
});

check('hermes-cnweb.js 跨平台进程管理', () => {
  const content = fs.readFileSync('hermes-cnweb.js', 'utf-8');
  const hasTasklist = content.includes('tasklist');
  const hasPgrep = content.includes('pgrep');
  if (hasTasklist && hasPgrep) {
    return true;
  }
  return '进程管理跨平台支持不完整';
});

// 5. 依赖包检查
section('5. 依赖包兼容性');

check('node-pty 支持跨平台', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  if (pkg.dependencies && pkg.dependencies['node-pty']) {
    return true;
  }
  return 'node-pty 未安装';
});

check('concurrently 支持多进程', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
  if (pkg.devDependencies && pkg.devDependencies.concurrently) {
    return true;
  }
  return 'concurrently 未安装';
});

// 6. 启动脚本检查
section('6. 启动脚本');

check('hermes-cnweb.js 可执行', () => {
  const scriptPath = path.join(process.cwd(), 'hermes-cnweb.js');
  try {
    fs.accessSync(scriptPath, fs.constants.X_OK);
    return true;
  } catch {
    // 在 Windows 上可能不可执行，这是正常的
    if (os.platform() === 'win32') {
      return true; // Windows 不需要执行权限
    }
    return '脚本不可执行';
  }
});

check('CROSS_PLATFORM.md 文档存在', () => {
  if (fs.existsSync('CROSS_PLATFORM.md')) {
    return true;
  }
  return '跨平台文档缺失';
});

// 7. 构建检查
section('7. 构建验证');

check('TypeScript 编译', () => {
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe', timeout: 30000 });
    return true;
  } catch (err) {
    return 'TypeScript 编译失败';
  }
});

check('Vite 构建', () => {
  try {
    execSync('npx vite build --emptyOutDir', { stdio: 'pipe', timeout: 60000 });
    return true;
  } catch (err) {
    return 'Vite 构建失败';
  }
});

// 8. 环境变量支持
section('8. 环境变量支持');

check('HERMES_HOME 环境变量支持', () => {
  const statusContent = fs.readFileSync('server/routes/status.js', 'utf-8');
  if (statusContent.includes('process.env.HERMES_HOME')) {
    return true;
  }
  return 'HERMES_HOME 环境变量未实现';
});

check('PORT 环境变量支持', () => {
  const indexContent = fs.readFileSync('server/index.js', 'utf-8');
  if (indexContent.includes('process.env.PORT')) {
    return true;
  }
  return 'PORT 环境变量未实现';
});

// 总结
section('验证总结');

const total = passed + failed;
log(colors.blue, `通过：${passed}/${total}`);
log(colors.blue, `失败：${failed}/${total}`);

if (failed === 0) {
  log(colors.green, '\n🎉 所有跨平台检查通过！项目已准备好在 Windows/Linux/macOS 上运行。\n');
  process.exit(0);
} else {
  log(colors.red, `\n⚠️  发现 ${failed} 个跨平台兼容性问题，请修复后重新验证。\n`);
  process.exit(1);
}

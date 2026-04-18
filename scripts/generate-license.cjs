#!/usr/bin/env node
/**
 * Hermes WebUI 离线激活码生成工具
 * 
 * 基于宪法第四章 4.2.1 RSA-2048 非对称加密方案
 * 
 * 使用方式：
 *   node generate-license.js                    # 交互模式
 *   node generate-license.js --generate 10      # 批量生成10个
 *   node generate-license.js --keys             # 仅生成密钥对
 *   node generate-license.js --verify <code>   # 验证激活码
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const KEYS_DIR = path.join(__dirname, '..', 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');
const CODES_DIR = path.join(__dirname, '..', 'codes');

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { mode: 0o700 });
    console.log(`📁 创建目录: ${dir}`);
  }
}

// 生成 RSA-2048 密钥对
function generateKeyPair() {
  console.log('\n🔐 开始生成 RSA-2048 密钥对...\n');
  
  ensureDir(KEYS_DIR);
  
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
  
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });
  
  console.log('✅ 密钥对生成成功！');
  console.log(`   私钥: ${PRIVATE_KEY_PATH} (0600权限，仅自己可读)`);
  console.log(`   公钥: ${PUBLIC_KEY_PATH} (可分发到软件中)`);
  console.log('\n⚠️  重要警告：');
  console.log('   私钥必须妥善保管！丢失后无法再生成激活码。');
  console.log('   切勿将私钥上传到任何公开仓库或网络服务。\n');
  
  return { publicKey, privateKey };
}

// 从已有私钥加载
function loadPrivateKey() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error(`❌ 私钥不存在: ${PRIVATE_KEY_PATH}`);
    console.error('   请先运行 --keys 生成密钥对');
    process.exit(1);
  }
  return fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
}

// 生成单个激活码
function generateActivationCode(privateKey, licenseType = 'L2') {
  const types = {
    'L1': { name: '基础版', agents: 1, features: ['Sessions', 'Logs', 'Keys', 'Settings'] },
    'L2': { name: '专业版', agents: 3, features: ['L1 + Config', 'Skills', 'Tools', 'Memory', 'Cron', 'Browser'] },
    'L3': { name: '企业版', agents: 3, features: ['L1 + L2 + Delegation', 'Gateway', 'Analytics', 'Terminal'] }
  };
  
  const info = types[licenseType] || types['L2'];
  const timestamp = Date.now();
  const random = crypto.randomBytes(16).toString('hex');
  
  // 激活码信息负载
  const payload = {
    type: licenseType,
    name: info.name,
    agents: info.agents,
    features: info.features,
    created: new Date().toISOString(),
    timestamp,
    random
  };
  
  const payloadStr = JSON.stringify(payload);
  
  // 使用私钥签名
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(payloadStr);
  const signature = sign.sign(privateKey, 'base64');
  
  // 组合: payload.signature
  const activationCode = Buffer.from(JSON.stringify({
    p: payloadStr,
    s: signature
  })).toString('base64');
  
  return { activationCode, payload };
}

// 批量生成激活码
function batchGenerate(privateKey, count, type) {
  ensureDir(CODES_DIR);
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `codes_${type}_${timestamp}.txt`;
  const filepath = path.join(CODES_DIR, filename);
  
  const codes = [];
  for (let i = 0; i < count; i++) {
    const { activationCode, payload } = generateActivationCode(privateKey, type);
    codes.push({
      code: activationCode,
      type: payload.type,
      name: payload.name,
      created: payload.created
    });
  }
  
  // 保存到文件
  let content = `Hermes WebUI 激活码批量生成\n`;
  content += `生成时间: ${new Date().toISOString()}\n`;
  content += `密钥文件: ${PRIVATE_KEY_PATH}\n`;
  content += `授权类型: ${type}\n`;
  content += `数量: ${count}\n`;
  content += `${'='.repeat(60)}\n\n`;
  
  codes.forEach((item, i) => {
    content += `[${i + 1}] 类型: ${item.name} (${item.type})\n`;
    content += `    激活码:\n    ${item.code}\n`;
    content += `    生成时间: ${item.created}\n`;
    content += `${'-'.repeat(60)}\n`;
  });
  
  fs.writeFileSync(filepath, content);
  console.log(`\n📝 已保存到: ${filepath}`);
  
  return codes;
}

// 验证激活码
function verifyActivationCode(publicKeyPath, activationCode) {
  let pubKey;
  try {
    pubKey = fs.readFileSync(publicKeyPath, 'utf8');
  } catch {
    console.error(`❌ 公钥不存在: ${publicKeyPath}`);
    return null;
  }
  
  try {
    const decoded = JSON.parse(Buffer.from(activationCode, 'base64').toString('utf8'));
    const payload = JSON.parse(decoded.p);
    
    const verify = crypto.createVerify('RSA-SHA256');
    verify.update(decoded.p);
    const isValid = verify.verify(pubKey, decoded.s, 'base64');
    
    return { isValid, payload };
  } catch (e) {
    return null;
  }
}

// 打印激活码（格式化）
function printCode(code, payload) {
  console.log('\n' + '━'.repeat(60));
  console.log(`🎫 激活码类型: ${payload.name} (${payload.type})`);
  console.log('━'.repeat(60));
  console.log(`📋 功能列表: ${payload.features.join(', ')}`);
  console.log(`🤖 子Agent数量: ${payload.agents}`);
  console.log(`📅 生成时间: ${payload.created}`);
  console.log('━'.repeat(60));
  console.log('🔑 激活码:');
  
  // 每70字符换行，保持可复制性
  const codeLines = code.match(/.{1,70}/g) || [code];
  codeLines.forEach(line => console.log('   ' + line));
  
  console.log('━'.repeat(60) + '\n');
}

// 交互模式
async function interactiveMode(privateKey) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const question = (q) => new Promise(resolve => rl.question(q, resolve));
  
  console.log('\n📋 请选择授权类型:');
  console.log('   [1] L1 基础版 (免费功能)');
  console.log('   [2] L2 专业版 (¥1.9 永久) ← 推荐');
  console.log('   [3] L3 企业版 (全部功能)');
  
  const choice = await question('\n请输入选项 (1/2/3): ');
  const typeMap = { '1': 'L1', '2': 'L2', '3': 'L3' };
  const type = typeMap[choice] || 'L2';
  
  const { activationCode, payload } = generateActivationCode(privateKey, type);
  
  printCode(activationCode, payload);
  
  // 询问是否保存
  const save = await question('是否保存到文件? (y/n): ');
  if (save.toLowerCase() === 'y') {
    ensureDir(CODES_DIR);
    const filename = `code_${type}_${Date.now()}.txt`;
    const filepath = path.join(CODES_DIR, filename);
    fs.writeFileSync(filepath, activationCode);
    console.log(`✅ 已保存到: ${filepath}`);
  }
  
  rl.close();
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--keys')) {
    generateKeyPair();
    return;
  }
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Hermes WebUI 离线激活码生成工具

用法:
  node generate-license.js                    交互模式
  node generate-license.js --keys            生成 RSA 密钥对
  node generate-license.js --generate <n>    批量生成激活码
  node generate-license.js --verify <code>   验证激活码
  node generate-license.js --help            显示帮助

示例:
  # 首次使用 - 生成密钥对
  node generate-license.js --keys
  
  # 生成10个专业版激活码
  node generate-license.js --generate 10 L2
  
  # 生成5个企业版激活码
  node generate-license.js --generate 5 L3
  
  # 验证激活码
  node generate-license.js --verify <激活码>
`);
    return;
  }
  
  if (args.includes('--generate')) {
    const idx = args.indexOf('--generate');
    const count = parseInt(args[idx + 1]) || 1;
    const type = args[idx + 2] || 'L2';
    const privateKey = loadPrivateKey();
    
    console.log(`\n🎫 开始批量生成 ${count} 个 ${type} 激活码...\n`);
    const codes = batchGenerate(privateKey, count, type);
    
    codes.forEach((item, i) => {
      console.log(`[${i + 1}] ${item.type} - ${item.name}`);
      console.log(`    ${item.code.slice(0, 80)}...`);
    });
    
    console.log(`\n✅ 完成！共生成 ${count} 个激活码`);
    return;
  }
  
  if (args.includes('--verify')) {
    const idx = args.indexOf('--verify');
    const code = args[idx + 1];
    
    if (!code) {
      console.error('❌ 请提供要验证的激活码');
      process.exit(1);
    }
    
    const result = verifyActivationCode(PUBLIC_KEY_PATH, code);
    
    if (result && result.isValid) {
      console.log('\n✅ 激活码验证通过！');
      console.log(`   类型: ${result.payload.name} (${result.payload.type})`);
      console.log(`   子Agent: ${result.payload.agents}`);
      console.log(`   功能: ${result.payload.features.join(', ')}`);
      console.log(`   生成时间: ${result.payload.created}`);
    } else {
      console.log('\n❌ 激活码验证失败！');
    }
    return;
  }
  
  // 无参数 - 检查密钥是否存在
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.log('🔑 首次使用，正在生成 RSA-2048 密钥对...\n');
    generateKeyPair();
    console.log('✨ 密钥已生成，现在可以生成激活码了！\n');
  }
  
  await interactiveMode(loadPrivateKey());
}

main().catch(console.error);

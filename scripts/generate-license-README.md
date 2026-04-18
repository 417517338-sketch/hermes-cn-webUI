# Hermes WebUI 离线激活码生成工具

基于宪法第四章 4.2.1 RSA-2048 非对称加密方案。

## 安全说明

- 使用 RSA-2048 非对称加密，私钥签名，公钥验证
- 私钥离线保管，不存在于任何网络服务
- 激活码为 Base64 编码的签名数据，无法被伪造或篡改

## 目录结构

```
scripts/
├── generate-license.cjs    # 激活码生成脚本
└── generate-license-README.md

keys/
├── private.pem             # 私钥（0600权限，仅生成者可读）
└── public.pem              # 公钥（可分发到软件中）

codes/                       # 生成的激活码文件存放目录
```

## 使用方法

### 首次使用 - 生成密钥对

```bash
node scripts/generate-license.cjs --keys
```

### 批量生成激活码

```bash
# 生成10个专业版(L2)激活码
node scripts/generate-license.cjs --generate 10 L2

# 生成5个企业版(L3)激活码
node scripts/generate-license.cjs --generate 5 L3

# 生成3个基础版(L1)激活码
node scripts/generate-license.cjs --generate 3 L1
```

### 验证激活码

```bash
node scripts/generate-license.cjs --verify <激活码>
```

### 交互模式

```bash
node scripts/generate-license.cjs
```

## 授权类型

| 类型 | 名称 | 子Agent数 | 功能 |
|------|------|-----------|------|
| L1 | 基础版 | 1 | Sessions, Logs, Keys, Settings |
| L2 | 专业版 | 3 | L1 + Config, Skills, Tools, Memory, Cron, Browser |
| L3 | 企业版 | 3 | L1 + L2 + Delegation, Gateway, Analytics, Terminal |

## 与 51自动发卡平台 配合使用

1. 运行 `node scripts/generate-license.cjs --keys` 生成密钥对
2. 将 `keys/public.pem` 中的内容复制到 WebUI 的许可证验证代码中
3. 批量生成激活码：`node scripts/generate-license.cjs --generate 100 L2`
4. 在 51自动发卡平台 创建商品，上传激活码列表
5. 用户购买后获得激活码，在 WebUI 中激活

## 注意事项

- 私钥丢失将无法再生成可用的激活码，请务必妥善保管
- 切勿将私钥提交到任何版本控制系统
- 建议定期备份私钥到安全的离线存储介质

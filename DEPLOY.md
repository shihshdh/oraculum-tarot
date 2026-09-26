# 部署指南

本应用的生产部署方案。

## 架构说明

```
用户浏览器
    ↓ HTTPS
反向代理 (Nginx / Cloudflare)
    ↓
Node 服务 (server/index.js)  ← 所有 API Key 存这里
    ├── 托管静态前端 (dist/)
    ├── /api/_config 管理员配置
    ├── /api/reading 塔罗解读（服务端拼提示词，流式）
    └── /api/assist  看板娘「占星师」对话
```

**关键点**：API Key 只存在服务器的 `.ai-config.json` 文件里，用户浏览器**完全不接触 Key**。任何设备访问都能直接用 AI 解读，不需要各自配置。

## 快速部署（本地测试）

```bash
npm install
npm run build     # 生成 dist/
npm start         # 启动 Node 服务，默认 3000 端口
```

访问 http://localhost:3000 即可。

## 生产环境（Linux 服务器）

### 一、基础环境

```bash
# 安装 Node 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pm2 做进程管理
sudo npm i -g pm2
```

### 二、部署代码

```bash
# 上传项目到服务器某个目录，例如 /opt/tarot
cd /opt/tarot
npm install
npm run build

# 用 pm2 启动
pm2 start server/index.js --name tarot --env production
pm2 save
pm2 startup            # 按提示执行生成的命令
```

### 三、配置 Nginx 反向代理 + HTTPS

**很重要**：塔罗应用用了摄像头，浏览器要求 **HTTPS**，否则手势识别无法启动。

`/etc/nginx/sites-available/tarot.conf`：

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # 证书用 Let's Encrypt 免费申请
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # 支持 SSE 流式响应（AI 流式吐字必须）
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;
    proxy_cache off;
    chunked_transfer_encoding on;
    proxy_read_timeout 300s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# HTTP 自动跳 HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$host$request_uri;
}
```

申请免费 SSL 证书：

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 四、环境变量

生产环境建议通过环境变量设置：

```bash
# /etc/systemd/system/tarot.service 或 pm2 ecosystem.config.js
PORT=3000
ADMIN_PASSWORD=你自己的强密码       # 不设置的话每次启动随机生成，只打印在服务器终端里
RATE_LIMIT=30                        # 解读：每 IP 每小时最多次数
ASSIST_RATE_LIMIT=60                 # 占星师对话：每 IP 每小时最多次数
GLOBAL_RATE_LIMIT=0                  # 全站每小时合计上限，0 = 关闭
```

pm2 使用环境变量：

```bash
ADMIN_PASSWORD='your-strong-password' pm2 restart tarot --update-env
```

### 五、首次配置 AI

1. 打开 https://your-domain.com
2. 右下角"管理员"按钮 → 输入 ADMIN_PASSWORD
3. 右上角齿轮 → 配置 DeepSeek / 豆包 / Gemini 的 Key
4. 普通用户访问即可直接用 AI 解读

## 阿里云轻量应用服务器参考

- 2 核 2G 足够（约 ¥30-50/月）
- Ubuntu 22.04 LTS
- 域名备案（中国大陆服务器强制要求）或换香港节点

## Cloudflare Pages + Workers（纯 Serverless）

如果不想管服务器，可以：

- 前端 `dist/` 部署到 Cloudflare Pages（免费）
- `server/index.js` 改写为 Cloudflare Workers（需要改几行 API）
- 我没在这个仓库里做这一步，需要可以告诉我

## 安全建议

1. **设置管理员密码** —— 用环境变量 `ADMIN_PASSWORD`；不设置时每次启动随机生成（看服务器终端输出）
2. **关掉 cpolar** —— 部署到正式服务器后，不要再用 cpolar 暴露 dev server
3. **限制并发** —— `server/index.js` 内置按 IP 限流（解读 30 次/时、占星师 60 次/时），按需调整 `RATE_LIMIT` / `ASSIST_RATE_LIMIT`；Nginx 的 `client_max_body_size` 至少 4m（占星师看截图时请求体约 1–3MB）
4. **监控 API 消耗** —— 豆包/DeepSeek 控制台都有用量统计，定期看看有没有被异常消耗
5. **`.ai-config.json` 不要提交到 Git** —— 已写入 `.gitignore`

## 常见问题

**Q：部署后摄像头权限不给**
A：必须 HTTPS。`localhost` 和 `127.0.0.1` 是例外（浏览器信任本机），但公网域名必须有证书。

**Q：AI 流式吐字变成整段一起出来，没有逐字效果**
A：Nginx 没关 `proxy_buffering`。检查上面 conf 里的 `proxy_buffering off`。

**Q：管理员面板保存后没生效**
A：检查服务器上 `.ai-config.json` 是否写入成功，路径在项目根目录。权限不够的话 `chmod 600 .ai-config.json`。

**Q：副屏同步在跨设备场景下不工作**
A：当前用的是 BroadcastChannel API，只支持同一浏览器窗口组。跨设备需要加 WebSocket，这里没做。

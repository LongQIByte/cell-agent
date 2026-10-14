# 连接与部署

## 局域网快速开始

需要 Node.js **22.13+（建议 24）**，以及已经配置好模型提供商、可以正常运行的 `codex` CLI。

```bash
npm ci
npm run web:build
npm start
```

另一个终端查看配对信息：

```bash
npm run connection
node scripts/pairing.mjs
```

手机与电脑连接同一 Wi-Fi，打开 `http://电脑局域网IP:8787`。在 Settings 填入 `ws://电脑局域网IP:8787/ws` 与生成的配对密钥，点击「保存并连接」，然后进入 Projects。APK 下载地址是 `http://电脑局域网IP:8787/downloads/codex-remote.apk`（完成构建后可用）。APK 包含 JavaScript，运行时不需要 Metro 或 Expo Go。

配对密钥、二维码和手机安装步骤在 `.local/`，不进入 Git，也不编译进 APK。重新启动服务会复用密钥和机器 ID。可以通过 `PUBLIC_HOST`、`DEVICE_NAME`、`RELAY_PORT` 指定地址、电脑名称和端口。

### 本机是 WSL 时

手机使用 **Windows 的局域网 IP**。用 Windows 管理员 PowerShell 运行：

```powershell
& "\\wsl.localhost\Ubuntu\home\<Linux用户名>\codes\cell-agent\deploy\setup-windows-lan.ps1"
```

将路径中的发行版名称、Linux 用户名和项目位置改为实际值。脚本将 TCP 8787 转发到 WSL，并添加仅限 LocalSubnet 的防火墙规则。WSL 重启、IP 改变后重新运行。撤销配置运行 `deploy/remove-windows-lan.ps1`。原生 Linux/macOS 可直接监听局域网 IP，不需要此转发。

## 电脑端三平台服务

电脑端提供统一的后台启动、状态、日志、停止操作，以及只在本机打开的浏览器管理页。源码环境完成上面的安装与网页版构建后，可运行：

```bash
npm run service:start
npm run service:console
npm run service:status
npm run service:logs
npm run service:stop
```

Mac 可双击 `service/Start-Mac.command`，Windows 双击 `service/Start-Windows.cmd`，Linux 运行 `bash service/Start-Linux.sh`。后台服务在关闭终端后继续运行；管理页显示实际端口、进程、Agent 在线状态和日志。

`npm run service:build` 生成同一份三平台 ZIP，包含已打包的 Agent/中转程序与网页版。解压后只需要已配置好的 Node.js 和 Codex，无需安装项目依赖。完整操作、手机连接及自定义配置见 [电脑服务使用说明](../service/使用说明.md)。

## 存储和通信

```text
手机 / 浏览器 ── WebSocket ── 中转服务 ── WebSocket ── 本地 Agent
                                                       │ stdio JSON-RPC
                                                       ▼
                                                Codex App Server
                                                       │
                                             原生会话、项目与执行工具
```

中转服务的 SQLite **仅保存设备 ID、名称、平台与最近上线时间**。请求映射存在内存中，不保存对话、文件或 OpenAI API Key。Agent SQLite 保存绑定会话的上传文件索引及发送幂等记录；项目和原生会话由 Codex 管理。Android SQLite 在手机本地缓存项目、会话、草稿及通用偏好，配对密钥单独放入系统 SecureStore。

当前局域网使用 `ws://`。外网部署使用 `wss://`，支持服务本身的 `TLS_CERT` / `TLS_KEY`，也提供 Caddy 自动 HTTPS 的部署配置。一个配对密钥对应个人的整组机器。

## 添加其他电脑

每台电脑安装 Node.js、Codex，并复制本仓库：

```bash
npm ci
REMOTE_TOKEN='同一配对密钥' \
RELAY_URL='ws://中转电脑IP:8787/ws' \
DEVICE_NAME='Mac Studio' \
AGENT_DATA_DIR="$HOME/.codex-remote-agent" \
npm run agent
```

每台电脑只运行 Agent。Projects 在同一列表中显示全部在线电脑的项目，离线电脑保留本地缓存。云端 WSS 时，`RELAY_URL` 改为 `wss://你的域名/ws`。

## 服务端部署

局域网 `npm start` 同时启动中转与本机 Agent。独立中转可设置 `REMOTE_TOKEN` 后运行 `npm run relay`。

云端示例：

```bash
REMOTE_TOKEN='至少16字符的随机密钥' REMOTE_DOMAIN='remote.example.com' \
docker compose -f deploy/compose.yml up -d --build
```

服务器需要域名 DNS 和 80/443 端口。此配置只部署中转，不部署 Codex，不保存开发内容；各电脑的 Agent 主动连入中转。

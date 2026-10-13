# Codex Remote 使用与开发手册

个人使用的 Codex 远程客户端。React Native + Expo 同一套界面支持 Android、iOS 和浏览器；本机 Node.js Agent 通过官方 Codex App Server JSON-RPC 读取和继续原生会话。无需重新实现 Agent，也不把电脑上的 OpenAI 凭据交给手机。

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

## 已实现

- 极简 Projects / Settings 双 Tab；项目绑定唯一机器和工作目录，同名、不同机器的项目独立。
- 自动导入 CLI、IDE 和 App Server 的原生会话，按最近活动排序；折叠、搜索项目与会话。
- 新建项目、远程浏览目录、新建会话，沿用本机 Codex 模型、认证与执行策略。
- 全屏聊天，无 Header、选择器或底部 Tab。Android 系统返回键返回 Projects；浏览器返回 / Esc；iOS 左边缘滑动。
- 流式消息、执行状态、命令与输出、文件变更、错误，以及 Codex 发起的执行许可和问题回复。
- 停止执行、会话历史分页、刷新后恢复历史、断线重连、发送幂等保护。
- 每条消息最多 6 个附件，每个 8 MB。图片通过 `localImage` 交给 Codex，其他文件上传到项目下 `.codex-remote/attachments/`，由 Codex 按文件路径读取。
- 响应式直板 / 折叠屏布局、系统安全区、键盘避让；原生客户端使用 SQLite 缓存与 SecureStore 保存密钥，浏览器使用 localStorage。

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

## Android APK

### 局域网手机开发调试（Fast Refresh）

想在电脑保存代码后立刻看到手机界面变化，使用开发版 APK。首次编译一次：

```bash
npm run android:build:dev
npm run dev
```

输出 `artifacts/codex-remote-dev.apk`（ARM64），手机与电脑连接同一 Wi-Fi，在手机浏览器打开终端显示的 Development APK 地址下载、安装。开发版名称为 **Codex Remote Dev**，可与正式版共存。打开开发版，在 Expo launcher 输入终端显示的 Metro 地址 `http://电脑IP:8081`，或扫描终端二维码 / `.local/dev-client.png`。进入 Settings 后使用原有服务地址和配对密钥连接电脑。

手机已通过 USB 连接并允许 USB 调试时，在另一个终端运行：

```bash
npm run android:dev:open
```

这条命令安装开发版并直接打开局域网开发地址。`adb` 需要在 PATH 中，或设置 `ANDROID_HOME`；多台设备时用 `ANDROID_SERIAL` 选择手机。日常只需保持 `npm run dev` 运行，修改并保存 JS/TS、组件和样式后手机通过 Fast Refresh 自动刷新，通常保留组件状态；某些修改会触发整页重载。无需 Expo 登录、发布更新包或重新跑 Gradle。也可按 Expo 终端的 `w` 打开浏览器开发版。

电脑防火墙需要允许局域网访问 TCP **8081**（Metro）和 **8787**（Relay；配置过其他端口时用该端口）。`npm run dev` 会复用已保存的 Relay 端口，也可用 `RELAY_PORT` 覆盖。WSL 还需要转发这两个端口，运行下述更新后的 Windows LAN 脚本；自定义端口时例如 `-Ports 8788,8081`。若电脑 IP 改变，重新启动服务并在 launcher 选择新的 Metro 地址。安装/升级原生库、修改 app config 或升级 Expo 时，重新运行 `npm run android:build:dev` 并安装。开发版运行依赖电脑上的 Metro；需要脱离开发服务器使用时，安装下面的正式版 APK。

### 正式版 APK

已构建的个人测试 APK 可从 [GitHub Release v0.1.0](https://github.com/LongQIByte/cell-agent/releases/tag/v0.1.0) 下载，附有 SHA-256 校验文件。

需要 JDK 17+、Android SDK 平台 36 / build-tools 36.0.0、NDK 27，以及 CMake / Ninja。环境准备后：

```bash
npm run android:build
```

输出 `artifacts/codex-remote.apk`。这是 release 构建、带完整 JS 的**个人测试 APK**，使用开发签名。默认包含 arm64-v8a / armeabi-v7a，兼容 Android 7+。`scripts/build-android.sh` 支持 `ANDROID_HOME` / `JAVA_HOME`，以及可选的 `CODEX_REMOTE_CMAKE_DIR` 和 `CODEX_REMOTE_GRADLE_INIT`。

构建下载可单独使用 HTTP 代理，不改变手机或系统的代理设置。例如本机已有 `127.0.0.1:17890` 时：

```bash
CODEX_REMOTE_PROXY_PORT=17890 npm run android:build
```

其他代理主机可设置 `CODEX_REMOTE_PROXY_HOST`。

`apps/mobile/android/` 是 Expo prebuild 产物，不提交。iOS 架构和界面已兼容，但构建需要 macOS / Xcode，尚未进行 iOS 真机验证。

Google 下载站不可达时，可用 `python3 scripts/fetch-android-sdk.py` 从固定版本的 Cirrus Labs 公共 OCI 镜像提取 Linux SDK（平台 36、build-tools 36.0.0、NDK 27.3），逐层校验 SHA-256。默认保存到 `~/.cache/codex-remote-tools/android-sdk/`。可通过 `CODEX_REMOTE_DOWNLOAD_WORKERS` 调整分段下载并发。对应构建设置 `CODEX_REMOTE_NDK_VERSION=27.3.13750724` 和 `CODEX_REMOTE_GRADLE_INIT` 指向 `scripts/android-mirrors.gradle`。JDK / CMake 仍需安装。

如果 SDK、JDK、CMake 安装在 `~/.cache/codex-remote-tools/`，可在项目根目录按以下示例构建：

```bash
CODEX_REMOTE_PROXY_PORT=17890 \
CODEX_REMOTE_NDK_VERSION=27.3.13750724 \
CODEX_REMOTE_CMAKE_DIR="$HOME/.cache/codex-remote-tools/cmake-python/cmake/data" \
CODEX_REMOTE_GRADLE_INIT="$PWD/scripts/android-mirrors.gradle" \
npm run android:build
```

## 验证

```bash
npm run typecheck
npm test
npm run test:browser   # 先启动 npm start；会调用本机真实 Codex
```

浏览器测试使用 `.local/browser-workspace/`，覆盖配对错误、原生会话发现、项目折叠、新建项目 / 会话、真实命令执行、流式输出、页面刷新后的原生会话继续、文件附件、直板和折叠屏布局。测试前需在本仓库目录已有原生 Codex 会话，以验证原生会话发现。测试会创建原生 Codex 测试会话；截图生成在 `artifacts/`，不纳入版本控制。

本机测试结果、APK 信息和校验值见 [验证记录](../artifacts/validation.md)。

## 当前范围

项目归属使用 Codex 原生 project API 的项目定义，并仅读取本机桌面明确记录的归属 metadata；不按工作目录推断归属，也不写迁移数据。当前客户端使用通信协议 2；旧正式 APK 需要重新安装新版，开发 APK 可通过 Metro 加载新的 JavaScript。

支持读取并继续这台机器保存的原生会话。Agent 启动一个独立的官方 App Server，流式事件覆盖通过该 Agent 执行的任务；其他桌面客户端独立运行的任务通过历史刷新查看，不承诺其跨进程实时事件。为保持会话记录一致，应避免桌面和手机同时向同一个会话发起任务。

通用 MCP 表单 / URL 授权目前可在手机取消，需要在电脑完成；尚未实现语音、后台推送、远程桌面或完整 diff 编辑器。这些不影响局域网的文本开发任务和原生会话复用。

协议依据：[官方 Codex App Server 文档](https://learn.chatgpt.com/docs/app-server)。本机验证版本：`codex-cli 0.162.0-alpha.17.2`；CLI 协议可能变化，可通过 `codex app-server generate-ts --out /tmp/codex-schema` 获取本机对应类型。

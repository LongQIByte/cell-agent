# 局域网验证记录

日期：2026-10-12。运行环境：WSL Ubuntu、Node.js 24.20.0、Codex CLI 0.162.0-alpha.17.2。

- `npm run typecheck`：服务端、协议和移动端 TypeScript 检查通过。
- `npm test`：通过。覆盖配对认证、两台设备的请求路由、响应归属校验、离线错误、断线后的流式合并、附件目录限制及发送幂等。
- `npm run test:browser`：真实浏览器端到端测试通过，最终复测 24.3 秒。`TEST_WEB_URL` 指向 Windows 局域网转发地址，HTTP 与 WebSocket 均经过该地址。
- 浏览器测试创建原生 Codex 会话，实际执行 `pwd`、读取测试文件，收到 `CODEX_REMOTE_LAN_OK`；刷新后在同一个原生会话继续对话；上传并读取手机附件，收到 `PHONE_ATTACHMENT_OK`。
- 流式增量已收到；聊天无 Header / 底部 Tab。390 × 844 和 900 × 750 布局检查通过。
- 电脑上的中转服务与本地 Agent 在后台启动成功；私密配对信息位于 `.local/phone-setup.txt`，不纳入版本控制。

测试在本地 `artifacts/` 生成界面截图：`projects-phone.png`、`chat-phone.png`、`chat-fold.png`。截图不纳入版本控制。

Android 安装包 `codex-remote.apk` 已成功构建并验证：

- 包名 `com.codexremote.personal`，版本 `0.1.0` / versionCode `1`。
- 文件大小 35,808,966 字节，包含 arm64-v8a / armeabi-v7a，最低 Android 7（API 24），target API 36。
- release 构建，个人测试签名；`apksigner verify` 验证 APK v2 签名通过。
- `zipalign -c -P 16 4` 通过，ZIP 中所有文件的 CRC 完整性校验通过。
- 包含 1,369,308 字节的 Hermes 应用代码，可独立运行；未编入配对密钥。
- 移除了悬浮窗与旧版全盘存储权限；系统备份已关闭。
- 从实际局域网地址下载完整 APK，HTTP 200、文件类型正确、SHA-256 与本地文件一致。

SHA-256：`f0830b0651fb6fe247b869decdb3630220ed422b0b257540bf2807caadb948f6`。

验证包含 Windows TCP 8787 → WSL 的局域网转发及 LocalSubnet 防火墙规则，重启 WSL 后可运行 `deploy/setup-windows-lan.ps1` 更新地址。

当前未连接 Android 真机；不能将浏览器测试视为真机键盘、系统文档选择器、后台行为或折叠屏硬件验证。iOS 尚未构建。

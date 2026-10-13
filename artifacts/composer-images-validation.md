# 输入区、图片与 Dev 验证

日期：2026-10-13（Asia/Shanghai）。

模型、推理、权限、功能模式与运行指标已移至输入框上方。运行状态和指标详情显示本轮缓存命中率，按缓存输入 token / 输入 token 计算；无用量、输入为零或数值无效时显示暂无数据。

聊天支持发送后的照片、imageView、imageGeneration、MCP / dynamicToolCall 图片，以及 Markdown 图片。电脑本地图片通过已认证的会话接口按需读取，仅允许当前会话实际引用的图片，支持 PNG / JPEG / GIF / WebP，沿用 8 MB 大小限制。可以打开大图、关闭预览和重试失败图片。图片二进制不随历史列表重复发送。

类型检查、46 项 Node 单元测试、11 个相关浏览器场景通过。浏览器覆盖 320 / 390 / 820px 配置位置和图片宽度、缓存命中率实时变化、无数据和零命中区别、会话隔离、图片预览、失败重试、刷新恢复。Windows 原生接口已读取本会话的两张真实 JPEG 截图（508988、565550 字节）和工具 PNG；部署后通过 Relay 的 images/read 再次读回 JPEG。

Windows 后端继续在 8787 提供原有项目和会话。更新前的 Agent bundle 与网页入口已备份到服务目录的 `.local/chat-ui-before-20261013/`，连接与数据库保留。更新后的网页及正式 / Dev APK 已放入现有服务目录；未推送仓库或发布 Release。

Codex Remote Dev 已覆盖安装到 vivo V2337A，保留开发版数据，与正式版共存。首次 Dev 构建包含新相册模块，依赖通过用户的 macbook-air 代理下载。Metro 使用 WSL 的 18081，Windows 回环桥接与 ADB reverse 连接手机；Dev launcher 地址为 `http://127.0.0.1:18081`，应用内使用原 Windows 服务地址和密钥。这一开发连接依赖 USB 和运行中的 Metro；重启 WSL 后需重新启动 Metro 并重建对应转发。

真机已验证设置与功能在输入框上方、缓存命中率标签、Windows 会话加载、聊天内真实截图及大图打开 / 关闭。临时修改功能文案后无需安装 APK 即显示新文案，恢复后手机自动恢复原文；应用 PID 始终为 28439。定位图片的临时开发验证代码已移除，最终源码不含测试标记。

`npm run dev:ui` 是新增的仅界面开发入口，复用已有 Windows 后端；可用 `METRO_PORT` 选择端口。Agent 的接口更新仍需部署和重启。未进行 iOS 真机验收。

本机图片证据（Git 忽略）：`artifacts/composer-cache-rate-390.png`、`artifacts/chat-images-390.png`、`artifacts/phone-dev-composer-final.png`、`artifacts/phone-dev-photo-preview-source.png`、`artifacts/phone-dev-photo-preview.png`。

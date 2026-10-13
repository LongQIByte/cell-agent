# Codex Remote

在手机或浏览器上查看、继续电脑中的 Codex 会话。支持 Android、iOS 和 Web；模型、工具执行和 OpenAI 凭据留在电脑上。

- 多电脑项目与会话，跨项目置顶、重命名、归档及会话分支。
- 流式聊天、Markdown、工具记录、执行许可和照片附件预览。
- 点击使用原生 Plan / Goal，查看任务状态、上下文与用量。
- 黑白主题、字体设置和折叠屏布局。

## 快速开始

电脑需要 **Node.js 22.13+（建议 24）**，以及已配置好的 Codex CLI。本项目已验证 `0.162.0-alpha.17.2`，需要支持原生项目 API 的版本。

```bash
npm ci
npm run web:build
npm run service:start
npm run connection
```

手机和电脑连接同一 Wi-Fi，在手机浏览器打开终端显示的网页地址。在 Settings 填入服务地址和配对密钥，保存并连接，即可打开项目或会话。Windows 上的 WSL 还需按手册配置端口转发。

Android 安装包：[下载 Release](https://github.com/LongQIByte/cell-agent/releases)。本机完成构建后也可从 `http://电脑IP:8787/downloads/codex-remote.apk` 下载。正式 APK 可独立运行，无需 Expo Go 或 Metro。

## 更多说明

- [电脑服务：启动、停止、状态与管理页](service/使用说明.md)
- [使用与开发手册：WSL、其他电脑、部署、Android 构建及开发调试](docs/usage-and-development.md)
- [移动端功能与指标说明](docs/mobile-features.md)
- [验证记录](artifacts/validation.md)

局域网使用 `ws://`；公网请使用 `wss://`。iOS 构建需要 macOS/Xcode，尚未完成 iOS 真机验证。避免桌面和手机同时向同一会话发起任务。

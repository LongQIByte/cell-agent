# 局域网手机开发调试验证

日期：2026-10-12

- Expo SDK 54 / expo-dev-client 6.0.21；macOS 本地 Android SDK 36、JDK 21。
- `npm run android:build:dev` 成功，首次构建耗时 7m 52s。APK 包名 `com.codexremote.personal.dev`，签名验证及 SHA-256 校验通过。
- 已通过 USB/ADB 安装到 V2337A（ARM64），与已有正式版 `com.codexremote.personal` 共存。
- `npm run dev` 启动局域网 Metro（8081）、Relay（本机已配置 8788）和 Agent；Metro manifest 使用局域网地址，文件监听开启。
- 手机通过同一 Wi-Fi 连接 Metro，未设置 ADB reverse。两轮临时修改 Settings 文案并保存，手机自动显示新文案，Settings 页面和应用进程均保持不变。
- 第一轮在 2490 ms 内观察到新文字，第二轮在 2339 ms 内观察到；时间包含 ADB/UIAutomator 采样开销，是可见更新时间的上界。两轮均未重建或重装 APK，测试后恢复原文并确认手机恢复。
- TypeScript 检查、APK 下载 GET/HEAD/404 测试及现有 Node 测试通过；web export、浏览器配对、项目列表加载和页面错误检查通过。
- Windows 双端口转发脚本已调整，未在 Windows 主机执行验证。

后续日常修改只需保持 `npm run dev` 运行并保存 JS/TS 文件。新增原生库、修改 app config 或升级 Expo 时需要重新构建开发版。

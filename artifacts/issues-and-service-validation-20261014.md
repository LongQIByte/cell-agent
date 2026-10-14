# Issues 与后端部署验收

日期：2026-10-14，Asia/Shanghai。

## 已合并与 issue 状态

- PR #46：回到最新消息按钮，保留草稿并恢复自动跟随。
- PR #47：完整回复复制；图片缩放；按电脑和会话授权的文件访问、视频 Range、下载与取消；历史图片读取不再依赖恢复会话写入权限。
- PR #48：Android edge-to-edge 使用 Keyboard Controller 原生 IME insets。
- PR #50：heartbeat 自动化内容显示为有来源的折叠事件。
- PR #51：协议 3、PUBLIC_URL、部署与诊断说明。
- 本次补充：跨 WSL 发行版路径拒绝、ARM64 安装选择、Windows 安装脚本与服务 ZIP 中的诊断/安装入口。

已关闭 #27、#28、#30、#32、#49。前四项结合已合并代码、现有回归和 2026-10-13 的原真机记录核对；#49 随 PR #50 关闭。

#39、#41 保持待设计审核，未实施。#29、#31、#40、#42、#43、#44、#45 保持打开：代码已按上述 PR 推进，但相应原环境或真机验收未满足，不把合并视为全部验收通过。

## 本次验证

- 类型检查、65 项后端/状态测试通过。
- 23 个浏览器交互回归通过；覆盖复制完整 Markdown、图片重试、滚动、草稿、权限与多服务隔离。
- 服务包生命周期测试通过，覆盖启动、状态、停止、重启、真实 Relay、日志及身份保留。
- Web 构建、包含新原生模块的 Android Dev APK 构建及 Android Hermes JS 导出通过。未构建新的正式 APK。
- 两个 PowerShell 脚本在另一 Windows 环境完成语法解析；未在原故障账号执行安装。
- 公网真实浏览器打开项目和当前聊天，无 page error。点击实际会话里的远程 WebM 文件链接，应用预览解码为 320×180、2 秒、readyState 4。
- 同一视频经公网 Range 返回 206、32 字节；关闭访问凭证后返回 410。实际 PNG 也通过 Range 与凭证撤销验证。
- 手机 ADB 未连接；Android 双指、输入法候选栏、系统剪贴板、原 WSL 视频及用户实际失败照片样本均未做本次真机验收。

## 已部署的六个环境

| 环境 | 本地 Relay | 腾讯 FRP | HTTPS 路径 | 公网结果 |
| --- | --- | --- | --- | --- |
| 本机 Mac | 8788 | 9001 | `/cell-agent/mac/` | 协议 3，Agent 在线，31 个原生项目、749 个近期会话 |
| macbook-air 别名（Linux/WSL） | 8793 | 9003 | `/cell-agent/air/` | 协议 3，Agent 在线，2 个项目、172 个近期会话 |
| personal-computer | 8797 | 9004 | `/cell-agent/personal/` | 协议 3，Agent 在线，45 个近期会话 |
| XGD-server 主机 | 8797 | 9005 | `/cell-agent/xgd/` | 协议 3，Agent 在线，15 个近期会话 |
| xgd-dev 容器 | 8798 | 9006 | `/cell-agent/xgd-dev/` | 协议 3，Agent 在线，11 个近期会话 |
| kuka-dev 容器（ARM64） | 8799 | 9008 | `/cell-agent/kuka-dev/` | 协议 3，Agent 在线，7 个近期会话 |

公网基址为 `https://124.221.242.143`；手机服务地址为对应路径后接 `ws`，协议为 `wss://`。每个环境分别完成正确配对、真实会话读取和错误密钥 4001 拒绝。无原生项目的环境保留原本的 projectless 会话，不按工作目录伪造归属。

Linux 主机使用 enabled 的 systemd 用户服务并启用 linger；Mac 使用 LaunchAgent；容器使用 Supervisor，启动钩子已保存到各自入口。人工终止进程后，Mac、personal-computer 与 xgd-dev 的管理器自动拉起，机器 ID 保持不变。未重启整台主机或容器。

FRPC 复用腾讯云 token，控制连接启用 TLS、代理流量启用加密；ARM64 使用对应二进制。XGD 容器与宿主共用网络，已分配不同端口。

腾讯云 Caddy 配置保存在 `/opt/paseo-caddy-ip/Caddyfile`，安装文件通过现有 `/config` 挂载目录发布。保留原站点及其他代理，原 HTTPS 根页面复查成功。服务 ZIP 不包含配对密钥。

## 尚未完成的环境

20-machine 和 20-machine-win 的 SSH 连接被关闭，Tailscale 直连 SSH 也未恢复。Windows 9002 的旧服务仍在线且为协议 2，未将其宣称为已更新。WSL Agent 未完成安装；相关公网入口尚不可用。

原 Windows 沙盒日志明确包含对 `\\wsl.localhost\Ubuntu\...` 的 GetSecurityInfo / ACL 错误。Windows/WSL 应分别使用对应执行环境；原 #29 会话的读取、可逆修改和恢复执行仍需验证。

Windows 安装脚本已提供并放入服务 ZIP，可在原机器恢复访问后运行。仅语法检查不能替代安装或原故障验收。

## 配置留存

本机 `.local/deployment/` 保存私有连接资料、六个 Dev 配对二维码、部署清单与结构化验收结果，权限限制为当前用户。各服务器的 `.local` 保留配对、机器 ID、SQLite 和备份；密钥不进入 Git 或本文。

新 Dev APK 从 Mac 服务的 `/cell-agent/mac/downloads/codex-remote-dev.apk` 下载。覆盖安装后连接当前 Mac Metro 8082，继续 Fast Refresh；同一服务目录内保留旧数据。协议 2 的旧客户端须更新，Windows 旧后端也须更新后再连接。

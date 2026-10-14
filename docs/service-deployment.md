# 后端部署与远程连接

电脑服务包含 Relay 与 Agent。项目、会话、模型认证保留在各电脑；公网入口只转发流量。Linux 使用 systemd 用户服务；开发容器使用 Supervisor；macOS 使用 LaunchAgent；Windows 使用当前用户的计划任务。服务重启保留 `.local/connection.json`、机器 ID 与 SQLite 数据。

本仓库通信协议为 **3**。远程文件接口替换旧图片接口，需要同时更新电脑服务和手机 JS。新增 Clipboard、Video、Sharing、手势、动画及 Keyboard Controller 模块后，开发版须覆盖安装新的 Dev APK；后续继续通过 Metro Fast Refresh 更新，正式 APK 不用于日常调试。

## 腾讯云入口

现有腾讯云 FRPS 控制端口为 9000；为各电脑分配独立的 9001–9999 数据端口。FRPC 使用 token 认证、TLS 控制连接和加密代理流量。腾讯云 Caddy 在 HTTPS 443 终止 TLS，按 `/cell-agent/<电脑名>/` 转发到对应 FRP 数据端口，WebSocket 与 Range 文件传输共用此入口。

例如手机服务地址：`wss://124.221.242.143/cell-agent/mac/ws`。在服务的 `.local/service.env` 中设置：

```dotenv
PUBLIC_URL=https://124.221.242.143/cell-agent/mac
RELAY_PORT=8788
```

其他电脑使用各自地址和配对密钥。`PUBLIC_URL` 只改变公开连接信息；Agent 仍连接本机 Relay。Caddy 对 `/cell-agent/<电脑名>` 重定向至带尾斜杠的网页路径；统一的 `/_expo/` 静态资源转发到同版本的 Mac 服务。

配对密钥与 FRP token 分别保存在 `.local/connection.json` 和 `.local/frpc.toml`，限制为当前用户读取；不要写入 Git、日志、网页资源或 APK。部署机的私有清单与连接资料放在 `.local/deployment/`，公开文档不记录密钥。

## Linux 服务安装

`deploy/install-linux-service.sh` 使用同一份服务 ZIP，创建用户级开机服务或容器 Supervisor 配置。执行前把该机器的 FRPC 配置以 0600 权限放到 `~/cell-agent-frpc.toml`；机器需已有 Node.js 22.13+、npm、curl、unzip 和已配置的 Codex 模型认证。

```bash
bash deploy/install-linux-service.sh \
  "$HOME/cell-agent/codex-remote-service" \
  cell-agent-personal 8797 \
  https://124.221.242.143/cell-agent/personal \
  systemd /usr/local/bin/node
```

脚本从腾讯云 HTTPS 安装目录读取已发布服务包，保留已有配置与数据，将旧程序备份到 `.local/backup-日期时间/`，并在独立用户目录安装验证版本 Codex，避免改动桌面应用的 runtime。配置、日志和进程状态以实际返回为准。

systemd：

```bash
systemctl --user status cell-agent-personal cell-agent-personal-frpc
systemctl --user restart cell-agent-personal
```

容器采用 `supervisor` 模式，另在容器启动入口调用对应用户的 `supervisord -c ~/.config/cell-agent/supervisord.conf`。只启动 Agent、Relay 与 FRPC；不启动机器人、相机或仿真。

## Windows 与 WSL

Windows Agent 处理 Windows 项目；WSL 项目由对应发行版中的 Linux Agent 处理。Windows 的 `\\wsl.localhost\Ubuntu\...` 路径不具备普通 NTFS ACL 语义；已观察到 Windows sandbox 在这些路径上报 `GetSecurityInfo failed`，随后返回 `setup refresh had errors`。

`windows-runtime-diagnostics.ps1` 会报告真实账号、项目路径、PowerShell、最新日期日志及 setup 错误。保留执行权限；不要通过关闭沙盒替代对原环境的修复。必须在原故障会话成功读取、可逆修改并恢复执行，才能关闭相关 issue。

## 验收

每台机器确认：程序版本、开机服务、Agent 在线；公网 HTTPS/WSS 认证、真实项目与会话读取；文件读取与 Range、取消及错误提示；错误密钥拒绝。手机使用 Dev 应用连接当前 Metro，验证复制、图片缩放、远程视频播放和键盘。健康接口通过不代表这些交互已验收。

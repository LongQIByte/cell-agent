# 电脑服务验证记录

验证日期：2026-10-12（Asia/Shanghai）。范围是三平台电脑服务包、启动操作、管理页、日志和配对状态；手机 issue 与主题功能由“解决 GitHub issues 并测试”聊天统一验收、提交。

## 当前 Mac 实际运行位置

- 目录：`/Volumes/datas/Codes/cell-agent`。
- 服务主进程：PID `8807`，`node scripts/lan.mjs --dev`，由协调聊天执行 `npm run dev` 启动。
- Relay：`8788`；手机开发 Metro：`8081`。
- 本机 Agent：在线，中转连接成功，通信协议 2。
- Codex：App 内置 `0.162.0-alpha.17.2`；已将本机可执行文件路径保存在 `.local/service.env`，不含密钥。
- 本机管理页：`http://127.0.0.1:59149`（该次进程的地址；重新打开管理页时以终端新输出为准）。
- 正常日志：`.local/service.log`；错误日志：`.local/service-error.log`。
- 实际截图：`artifacts/desktop-agent-console.png`；包含状态、目录、启动命令和近期日志，配对密钥未显示。错误栏中的重复启动记录属于旧入口留下的历史记录。

此前服务由提交给 macOS launchd 的 `com.longqibyte.cell-agent` job 启动。已将其 keepalive/重复启动问题告知协调聊天，由它停用旧 job 并统一启动当前开发运行时。本聊天没有重启或停止共享 Relay/Agent/Metro。

## Mac 服务包集成测试

`npm run test:service` 通过（约 6.4 秒）。测试把构建程序放进一个含空格的临时目录，目录中没有 `node_modules`，以模拟解压后的安装。Codex 接口使用专门的进程 fixture；这部分证明包装、进程生命周期和控制接口，不代表模型推理验收。

- 服务包构建、独立运行、真实 Relay WebSocket 握手、网页 HTTP 输出。
- 通过含空格的 Codex 启动入口初始化；Windows 分支使用 `.cmd` fixture，由 Windows CI 运行。
- 重复启动保留同一个服务 PID。
- 管理页显示真实状态与落盘日志，普通状态接口不返回配对密钥。
- 未经认证的停止、跨来源请求与伪造 Host 被拒绝。
- 停止清理服务及 Codex 子进程，删除运行标记。
- 重启保留配对密钥、机器 ID。
- 已占用的监听地址导致启动失败并记录 `EADDRINUSE`；缺失 Codex 给出明确错误。
- ZIP 不收录本机 `.local`、环境配置、凭据、数据库、日志或 `node_modules`；即使测试目录运行后生成了 `.local`，归档仍排除它。

`npm run service:doctor` 在实际 Mac 上成功检查 Node `22.22.3`、Codex `0.162.0-alpha.17.2` 与 `project/list` 原生接口。后端 TypeScript 检查通过；并行新增的 `tests/browser/general.spec.ts` 相对导入扩展名错误已由协调聊天修复。协调聊天随后报告完整类型检查、29 项单元测试及 7 项前端场景通过，后续新增 issue 由该聊天继续验证。本记录的服务集成结果来自本聊天直接运行的 `test:service`。

## Linux 真实运行验证

机器：`personal-computer`（Ubuntu 原生 Linux）。在本聊天创建的 `/tmp/codex-remote-portable.snnADR/` 中解压同一服务 ZIP；没有安装本项目依赖。

原有 Codex `0.146.0` 能启动 App Server，但缺少 `project/list`。模型接口可读，项目接口失败，因此没有把该旧环境称为业务验收通过。

随后只在测试目录安装官方 npm 包 `@openai/codex@0.162.0-alpha.17.2`，未更新机器原有 Codex。实际结果：

| 检查 | 结果 |
| --- | --- |
| Node / Codex | `22.23.2` / `0.162.0-alpha.17.2` |
| 启动检查与 Agent 连接 | 通过 |
| 通信协议 | 2 |
| 项目列表 | 成功，0 个原生项目 |
| 模型列表 | 成功，8 个模型 |
| 重复启动 | 保持同一个 PID |
| 停止 | 成功，服务运行状态变为已停止 |

以上验证是服务启动、原生接口读取与生命周期验证，没有新建执行任务或消耗模型推理额度。

## Windows 验证边界

已实现 `.cmd` 双击启动器、named pipe 本机控制、跨平台 Codex `.cmd`/`.exe` 启动，以及 Windows 子进程树停止。实际 Windows SSH 连接不可用，尚未取得 Windows 实机通过证据。

`.github/workflows/desktop-service.yml` 配置 macOS、Ubuntu、Windows 三个平台的 Node 24 验证矩阵。由协调聊天统一提交推送后运行；Windows job 成功前，不声称三平台完整验收。

## 交付与使用入口

- 服务包：`artifacts/codex-remote-service.zip`，附同名 `.sha256`。
- 源码 Mac 启动：双击 `service/Start-Mac.command`。
- Windows：双击 `service/Start-Windows.cmd`；Linux：`bash service/Start-Linux.sh`。
- 通用管理命令：`npm run service:start`、`service:status`、`service:logs`、`service:stop`、`service:console`、`service:doctor`。
- 使用说明：`service/使用说明.md`；重新打包：`npm run service:build`。

新服务首次启动之前探测当前 Codex 的 `project/list`，不对缺失原生 API 的旧 CLI 添加兼容路径。源码与服务包保留同一套操作接口；服务包已捆绑运行代码和依赖，只要求机器上的 Node 与已配置 Codex。

当前 ZIP 是共享 `codex/resolve-current-issues` 工作区的构建快照。仍在进行的手机 issue 完成后，协调聊天将统一重建最终 ZIP、提交并运行三平台 CI。源码、测试与使用说明已留在共享工作区；本聊天未单独提交或推送。

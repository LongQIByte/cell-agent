# Windows 执行进程初始化失败

`Failed to create unified exec process: helper_unknown_error: setup refresh had errors` 是命令创建阶段的错误。聊天现在保留原始错误、命令和退出码，并提示实际执行账号、PowerShell 路径、工作目录及初始化日志。仅凭该错误不能确定 sandbox、runtime 安装或集成层中的具体原因。

必须在截图中报错的 Windows 用户与原始环境诊断。另一台电脑、WSL、不同 Windows 用户的成功执行不能作为恢复证据。`npm run service:doctor` 目前检查 Node、网页和 Codex 项目 API，不检查会话的命令进程初始化。

## 收集诊断

在该 Windows 账号的 PowerShell 中，从项目根目录运行：

```powershell
.\scripts\windows-runtime-diagnostics.ps1 `
  -RuntimeShell '截图中实际使用的完整 pwsh.exe 路径' `
  -ProjectPath '当前会话的完整项目路径'
```

脚本只查询当前账号、电脑名称、文件存在性，运行指定 PowerShell 的 `Get-Location` 和版本查询，显示 `CODEX_HOME/.sandbox/sandbox.log` 是否存在。它不修改权限、配置或服务。普通 shell 的探测成功也不能证明 Codex helper/sandbox 中的执行已经恢复。

结合 [OpenAI Windows sandbox 排查指南](https://learn.chatgpt.com/docs/windows/windows-sandbox)，检查当前 sandbox 模式、Windows 版本以及日志中的原始初始化错误。由对应错误定位 runtime 组件、初始化或系统策略问题，再修复该原因。升级 runtime 或重启后，重新进入同一会话进行验收。

## 恢复验收

通过手机在原始 Windows 会话查询工作目录、读取项目中的一个现有文件，在专用临时目录创建并读取验证文件，然后删除验证文件。退出并恢复该会话后再次执行读取。记录命令、退出码、实际运行账号和应用/runtime 版本，确认原任务可继续。

截至本次 PR，未连接截图中 `C:\Users\tangzhifeng\...` 的故障 Windows 账号，因此尚未确认根因或完成恢复验收。该诊断改进不代表运行环境故障已修复，issue #29 应保持打开。

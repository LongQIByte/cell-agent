// These errors precede process creation. Preserve the native error and explain
// the diagnostic boundary without changing the user's execution permissions.
export function executionDiagnostics(command: string, output: string, exitCode: number | null | undefined): string {
  if (exitCode !== -1 || !/Failed to create unified exec process:[\s\S]*setup refresh had errors/i.test(output)) return '';
  const windows = /(?:[a-z]:[\\/]|pwsh\.exe|powershell\.exe)/i.test(command);
  return '\n\n执行环境初始化失败：命令进程尚未创建。' + (windows
    ? '\n请在报错所示的 Windows 运行账号检查 PowerShell 路径、项目目录及 Codex sandbox 初始化日志（CODEX_HOME/.sandbox/sandbox.log）。可运行项目中的 scripts/windows-runtime-diagnostics.ps1 收集诊断。修复原始初始化错误后，在同一会话重试；此错误本身不能定位具体初始化原因。'
    : '\n请在执行端检查当前运行账号、工作目录及 Codex 初始化日志，再重试。');
}

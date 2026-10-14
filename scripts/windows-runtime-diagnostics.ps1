# Run in the SAME Windows account and project directory as the failing session.
# This diagnostic does not alter sandbox configuration or restart services.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$RuntimeShell,
  [Parameter(Mandatory = $true)][string]$ProjectPath,
  [string]$CodexHome = $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' })
)
$ErrorActionPreference = 'Stop'
$report = [ordered]@{
  WindowsUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  Computer = $env:COMPUTERNAME
  ProjectPath = $ProjectPath
  ProjectExists = Test-Path -LiteralPath $ProjectPath -PathType Container
  RuntimeShell = $RuntimeShell
  RuntimeShellExists = Test-Path -LiteralPath $RuntimeShell -PathType Leaf
  CodexHome = $CodexHome
  SandboxLog = $null
  SandboxSetupErrors = @()
  ProjectIsWslPath = $ProjectPath -match '^[/\\]{2}(wsl\.localhost|wsl\$)[/\\]'
  ExecutionEnvironmentAdvice = $null
  SandboxLogExists = $false
  ShellProbe = $null
}
$latestLog = Get-ChildItem -LiteralPath (Join-Path $CodexHome '.sandbox') -Filter '*.log' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($latestLog) {
  $report.SandboxLog = $latestLog.FullName
  $report.SandboxLogExists = $true
  $report.SandboxSetupErrors = @(Get-Content -LiteralPath $latestLog.FullName -Tail 200 | Where-Object { $_ -match 'setup refresh:.*errors=\[.+' } | Select-Object -Last 5)
}
if ($report.ProjectIsWslPath) {
  $report.ExecutionEnvironmentAdvice = '此项目属于 WSL 文件系统。若 Windows sandbox 的 GetSecurityInfo/ACL 初始化失败，请使用对应 WSL Agent 与 Linux 路径执行；保留 Windows Agent 处理 Windows 项目。不要通过关闭沙盒掩盖环境不匹配。'
}
if ($report.ProjectExists -and $report.RuntimeShellExists) {
  $probe = "Set-Location -LiteralPath '" + $ProjectPath.Replace("'", "''") + "'; Get-Location; " + '$PSVersionTable.PSVersion.ToString()'
  try {
    $output = & $RuntimeShell -NoProfile -NonInteractive -Command $probe 2>&1 | Out-String
    $report.ShellProbe = @{ ExitCode = $LASTEXITCODE; Output = $output.Trim() }
  } catch { $report.ShellProbe = @{ Error = $_.Exception.Message } }
}
$report | ConvertTo-Json -Depth 4

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
  SandboxLog = Join-Path $CodexHome '.sandbox\sandbox.log'
  SandboxLogExists = $false
  ShellProbe = $null
}
$report.SandboxLogExists = Test-Path -LiteralPath $report.SandboxLog -PathType Leaf
if ($report.ProjectExists -and $report.RuntimeShellExists) {
  $probe = "Set-Location -LiteralPath '" + $ProjectPath.Replace("'", "''") + "'; Get-Location; " + '$PSVersionTable.PSVersion.ToString()'
  try {
    $output = & $RuntimeShell -NoProfile -NonInteractive -Command $probe 2>&1 | Out-String
    $report.ShellProbe = @{ ExitCode = $LASTEXITCODE; Output = $output.Trim() }
  } catch { $report.ShellProbe = @{ Error = $_.Exception.Message } }
}
$report | ConvertTo-Json -Depth 4

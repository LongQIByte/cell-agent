[CmdletBinding()]
param(
  [string]$ServiceRoot = (Join-Path $env:USERPROFILE 'CodexRemote9002/codex-remote-service'),
  [string]$PublicUrl = 'https://124.221.242.143/cell-agent/windows',
  [string]$TaskName = 'CellAgent-Windows'
)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$parent = Split-Path -Parent $ServiceRoot
New-Item -ItemType Directory -Path $parent -Force | Out-Null
$archive = Join-Path ([IO.Path]::GetTempPath()) ('cell-agent-' + [guid]::NewGuid().ToString() + '.zip')
Invoke-WebRequest -Uri 'https://124.221.242.143/cell-agent/install/codex-remote-service.zip' -OutFile $archive
try {
  if (Test-Path (Join-Path $ServiceRoot 'scripts/service.mjs')) {
    & $node (Join-Path $ServiceRoot 'scripts/service.mjs') stop
    if ($LASTEXITCODE -ne 0) { throw '停止现有服务失败，未覆盖程序。' }
    $backup = Join-Path $ServiceRoot ('.local/backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    Copy-Item -Path "$ServiceRoot/apps","$ServiceRoot/scripts","$ServiceRoot/package.json" -Destination $backup -Recurse -Force
  }
  $staging = Join-Path ([IO.Path]::GetTempPath()) ('cell-agent-unpack-' + [guid]::NewGuid().ToString())
  try {
    Expand-Archive -Path $archive -DestinationPath $staging -Force
    New-Item -ItemType Directory -Path $ServiceRoot -Force | Out-Null
    Copy-Item -Path (Join-Path $staging 'codex-remote-service/*') -Destination $ServiceRoot -Recurse -Force
  } finally { Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue }
} finally { Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue }
$runtime = Join-Path $env:LOCALAPPDATA 'CellAgent/runtime'
& $npm install --prefix $runtime '@openai/codex@0.162.0-alpha.17.2' --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Codex runtime 安装失败。' }
$local = Join-Path $ServiceRoot '.local'
New-Item -ItemType Directory -Path $local -Force | Out-Null
$file = Join-Path $local 'service.env'
$text = if (Test-Path $file) { Get-Content -LiteralPath $file -Raw } else { '' }
$text = [regex]::Replace($text, '(?m)^(PUBLIC_URL|CODEX_BIN)=.*\r?\n?', '')
$binary = Join-Path $runtime 'node_modules/.bin/codex.cmd'
$text += "`nPUBLIC_URL=$PublicUrl`nCODEX_BIN=$binary`n"
[IO.File]::WriteAllText($file, $text, [Text.UTF8Encoding]::new($false))
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $node -Argument 'scripts/lan.mjs' -WorkingDirectory $ServiceRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3
& $node (Join-Path $ServiceRoot 'scripts/service.mjs') status
if ($LASTEXITCODE -ne 0) { throw '服务状态检查失败。' }

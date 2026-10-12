param([int]$Port = 8787, [string]$Distribution = "Ubuntu", [string]$WslAddress = "")
$ErrorActionPreference = "Stop"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "Run this script in an Administrator PowerShell window." }
if (-not $WslAddress) { $WslAddress = ((wsl.exe -d $Distribution hostname -I).Trim() -split '\s+')[0] }
if ($WslAddress -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw "Could not determine WSL address." }
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$Port connectaddress=$WslAddress connectport=$Port
if ($LASTEXITCODE -ne 0) { throw "Port forwarding failed." }
$ruleName = "CodexRemote-LAN-$Port"
if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name $ruleName -DisplayName "Codex Remote LAN ($Port)" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -RemoteAddress LocalSubnet -Profile Any | Out-Null
}
Write-Output "Forwarding TCP $Port to WSL $WslAddress. Allowed only from the local subnet."
Write-Output "Re-run after a WSL restart if its IP changes."

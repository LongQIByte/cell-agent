param([int]$Port = 8787)
netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$Port
Get-NetFirewallRule -Name "CodexRemote-LAN-$Port" -ErrorAction SilentlyContinue | Remove-NetFirewallRule

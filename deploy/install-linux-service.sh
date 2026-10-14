#!/usr/bin/env bash
set -euo pipefail
service_root="$1"
service_name="$2"
service_port="$3"
service_public_url="$4"
service_mode="$5"
node_binary="$6"
export PATH="$(dirname "$node_binary"):$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
install -d -m 700 "$service_root/.local"
curl -fsS --retry 2 --max-time 120 https://124.221.242.143/cell-agent/install/codex-remote-service.zip -o "$HOME/cell-agent-update.zip"
case "$(uname -m)" in
  x86_64) frpc_arch=amd64 ;;
  aarch64|arm64) frpc_arch=arm64 ;;
  *) echo 'Unsupported CPU architecture for FRPC' >&2; exit 1 ;;
esac
curl -fsS --retry 2 --max-time 120 "https://124.221.242.143/cell-agent/install/frpc-linux-$frpc_arch.gz" | gzip -d > "$HOME/cell-agent-frpc-linux"
if [[ -f "$service_root/package.json" ]]; then
  "$node_binary" "$service_root/scripts/service.mjs" stop || true
  backup_dir="$service_root/.local/backup-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$backup_dir"
  cp -a "$service_root/apps" "$service_root/scripts" "$service_root/package.json" "$backup_dir/"
fi
unzip -qo "$HOME/cell-agent-update.zip" -d "$(dirname "$service_root")"
install -d -m 700 "$HOME/.local/share/cell-agent/runtime"
npm install --prefix "$HOME/.local/share/cell-agent/runtime" @openai/codex@0.162.0-alpha.17.2 --no-audit --no-fund >/dev/null
python3 - "$service_root" "$service_name" "$service_port" "$service_public_url" <<'PY'
from pathlib import Path
import sys,os,re
root,name,port,url=sys.argv[1:]
f=Path(root)/'.local/service.env'
s=f.read_text() if f.exists() else ''
values={'RELAY_PORT':port, 'PUBLIC_URL':url,'DEVICE_NAME':name,'CODEX_BIN':str(Path.home()/'.local/share/cell-agent/runtime/node_modules/.bin/codex')}
for key,value in values.items():
 s=re.sub(r'^'+key+r'=.*\n?', '',s,flags=re.M)
 s+=key+'='+value+'\n'
f.write_text(s);f.chmod(0o600)
PY
install -m 600 "$HOME/cell-agent-frpc.toml" "$service_root/.local/frpc.toml"
install -m 755 "$HOME/cell-agent-frpc-linux" "$service_root/.local/frpc"
if [[ "$service_mode" == 'systemd' ]]; then
  install -d -m 700 "$HOME/.config/systemd/user"
  cat > "$HOME/.config/systemd/user/$service_name.service" <<UNIT
[Unit]
Description=Cell Agent $service_name
After=network-online.target
[Service]
WorkingDirectory=$service_root
Environment=PATH=$PATH
ExecStart=$node_binary scripts/lan.mjs
Restart=on-failure
RestartSec=5
[Install]
WantedBy=default.target
UNIT
  cat > "$HOME/.config/systemd/user/$service_name-frpc.service" <<UNIT
[Unit]
Description=Cell Agent Tencent FRP $service_name
After=network-online.target
[Service]
ExecStart=$service_root/.local/frpc -c $service_root/.local/frpc.toml
Restart=on-failure
RestartSec=5
[Install]
WantedBy=default.target
UNIT
  systemctl --user daemon-reload
  systemctl --user enable --now "$service_name.service" "$service_name-frpc.service"
  if sudo -n true 2>/dev/null; then sudo loginctl enable-linger "$(id -un)"; fi
else
  python3 -m venv "$HOME/.local/share/cell-agent/supervisor"
  "$HOME/.local/share/cell-agent/supervisor/bin/pip" install supervisor >/dev/null
  install -d -m 700 "$HOME/.config/cell-agent"
  cat > "$HOME/.config/cell-agent/supervisord.conf" <<CONF
[supervisord]
logfile=$service_root/.local/supervisord.log
pidfile=$service_root/.local/supervisord.pid
[unix_http_server]
file=$service_root/.local/supervisor.sock
chmod=0600
[rpcinterface:supervisor]
supervisor.rpcinterface_factory=supervisor.rpcinterface:make_main_rpcinterface
[supervisorctl]
serverurl=unix://$service_root/.local/supervisor.sock
[program:cell-agent]
command=$node_binary scripts/lan.mjs
directory=$service_root
environment=PATH="$PATH"
autostart=true
autorestart=unexpected
exitcodes=0
stopasgroup=true
killasgroup=true
stdout_logfile=$service_root/.local/supervisor-service.log
stderr_logfile=$service_root/.local/supervisor-service-error.log
[program:frpc]
command=$service_root/.local/frpc -c $service_root/.local/frpc.toml
autostart=true
autorestart=true
stdout_logfile=$service_root/.local/supervisor-frpc.log
stderr_logfile=$service_root/.local/supervisor-frpc-error.log
CONF
  "$HOME/.local/share/cell-agent/supervisor/bin/supervisord" -c "$HOME/.config/cell-agent/supervisord.conf"
fi
for i in {1..30}; do
 if curl -fsS "http://127.0.0.1:$service_port/health" >/dev/null; then
   "$node_binary" "$service_root/scripts/service.mjs" status
   exit 0
 fi
 sleep 1
done
exit 1

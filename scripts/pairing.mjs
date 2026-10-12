import QRCode from 'qrcode';
import { writeFileSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { configuration, root } from './config.mjs';
const config = configuration();
const native = `codex-remote://connect?${new URLSearchParams({ server: config.server, key: config.token })}`;
const web = `${config.web}/#${new URLSearchParams({ server: config.server, key: config.token })}`;
await QRCode.toFile(resolve(root, '.local/pairing-app.png'), native, { width: 480, margin: 3 });
await QRCode.toFile(resolve(root, '.local/pairing-web.png'), web, { width: 480, margin: 3 });
for (const file of ['pairing-app.png', 'pairing-web.png'])
  chmodSync(resolve(root, '.local', file), 0o600);
writeFileSync(
  resolve(root, '.local/phone-setup.txt'),
  `Codex Remote\n\n1. 手机和电脑连接同一 Wi-Fi。\n2. 手机浏览器下载 APK：${config.apk}\n3. 安装后，在 Settings 输入：\n   服务地址：${config.server}\n   配对密钥：${config.token}\n\n也可安装后扫描 pairing-app.png 直接配对。\n网页版配对链接：${web}\n\n服务重启：在 ${root} 运行 npm start。\n`,
  { mode: 0o600 },
);
console.log(
  'Pairing QR codes and phone setup instructions saved in .local/ (these contain your private pairing key).',
);

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './config.mjs';
import { serviceStatus, serviceLogs, startService, stopService } from './service-core.mjs';

const sessionToken = randomBytes(24).toString('hex');
const page = readFileSync(resolve(root, 'service/console.html'), 'utf8').replace('__CONSOLE_TOKEN__', sessionToken);
let origin;
let changing = false;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (req.headers.host !== new URL(origin).host || (req.headers.origin && req.headers.origin !== origin)) {
    res.writeHead(403); res.end('只允许本机管理页访问。'); return;
  }
  const send = (data, code = 200) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page);
    } else if (req.method === 'GET' && req.url === '/api/status') {
      send({ status: await serviceStatus(), logs: serviceLogs(22) });
    } else if (req.method === 'POST' && ['/api/start', '/api/stop'].includes(req.url)) {
      if (req.headers['x-console-token'] !== sessionToken) { send({ error: '管理操作认证失败' }, 403); return; }
      if (changing) { send({ error: '上一个操作尚未完成' }, 409); return; }
      changing = true;
      try { send(await (req.url === '/api/start' ? startService() : stopService())); }
      finally { changing = false; }
    } else { res.writeHead(404); res.end(); }
  } catch (error) { send({ error: error.message }, 500); }
});
server.listen(0, '127.0.0.1', () => {
  origin = `http://127.0.0.1:${server.address().port}`;
  console.log(`Codex Remote 本机管理页：${origin}`);
  console.log('点击上面的地址，查看状态、日志和启动／停止按钮。关闭此窗口不影响后台 Agent。');
  if (process.argv.includes('--open')) {
    const [command, args] = process.platform === 'darwin' ? ['open', [origin]]
      : process.platform === 'win32' ? ['rundll32.exe', ['url.dll,FileProtocolHandler', origin]]
      : ['xdg-open', [origin]];
    const browser = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    browser.on('error', () => console.log(`请在浏览器打开 ${origin}`));
    browser.unref();
  }
});
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());

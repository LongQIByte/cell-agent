import { appendFileSync, existsSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

export function serviceLogger(root, token) {
  return (component, message, error = false) => {
    const text = String(message).split(token).join('[配对密钥已隐藏]');
    const line = `${new Date().toISOString()} [${component}] ${text}\n`;
    const file = resolve(root, '.local', error ? 'service-error.log' : 'service.log');
    if (existsSync(file) && statSync(file).size > 2 * 1024 * 1024) {
      if (existsSync(file + '.1')) unlinkSync(file + '.1');
      renameSync(file, file + '.1');
    }
    appendFileSync(file, line, { mode: 0o600 });
    (error ? process.stderr : process.stdout).write(line);
  };
}

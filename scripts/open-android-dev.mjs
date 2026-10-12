import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { configuration, root } from './config.mjs';

const sdkAdb = process.env.ANDROID_HOME && resolve(process.env.ANDROID_HOME, 'platform-tools/adb');
const adb = sdkAdb && existsSync(sdkAdb) ? sdkAdb : 'adb';
const apk = resolve(root, 'artifacts/codex-remote-dev.apk');
if (!existsSync(apk)) throw new Error('First run npm run android:build:dev.');
const config = configuration();
const response = await fetch(`${config.metro}/status`, {
  signal: AbortSignal.timeout(3000),
}).catch(() => null);
if (!response?.ok || !(await response.text()).includes('packager-status:running'))
  throw new Error('Start npm run dev before opening the phone.');
// ANDROID_SERIAL selects a device when more than one is attached.
execFileSync(adb, ['install', '-r', apk], { stdio: 'inherit' });
execFileSync(adb, [
  'shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
  '-d', config.devClient, '-p', 'com.codexremote.personal.dev',
], { stdio: 'inherit' });
console.log(`Opened Codex Remote Dev via LAN (${config.metro}). Save JS/TS files for Fast Refresh.`);

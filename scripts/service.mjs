import { startService, stopService, serviceStatus, serviceLogs, checkEnvironment } from './service-core.mjs';

function show(state) {
  console.log(`Codex Remote · ${state.running ? '运行中' : '已停止'}`);
  console.log(`目录：${state.root}`);
  if (state.pid) console.log(`主进程 PID：${state.pid}`);
  console.log(`中转：${state.relayConnected ? '已连接' : '未连接'} · 本机 Agent：${state.agentOnline ? '在线' : '离线'}`);
  if (state.server) console.log(`手机 Settings 服务地址：${state.server}\n网页版：${state.web}`);
  console.log(`正常日志：${state.logs.normal}\n错误日志：${state.logs.error}`);
  if (state.error) console.log(`详情：${state.error}`);
}

try {
  const action = process.argv[2] ?? 'status';
  if (action === 'start') show(await startService());
  else if (action === 'stop') show(await stopService());
  else if (action === 'status') {
    const state = await serviceStatus();
    if (process.argv.includes('--json')) console.log(JSON.stringify(state));
    else show(state);
  } else if (action === 'logs') {
    const print = () => {
      const logs = serviceLogs();
      if (process.argv.includes('--follow')) console.clear();
      console.log(`正常日志\n${logs.normal}\n\n错误日志（包含历史记录）\n${logs.error}`);
    };
    print();
    if (process.argv.includes('--follow')) setInterval(print, 2000);
  } else if (action === 'doctor') console.log(JSON.stringify(await checkEnvironment(), null, 2));
  else throw new Error('使用：node scripts/service.mjs start | stop | status | logs [--follow] | doctor');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

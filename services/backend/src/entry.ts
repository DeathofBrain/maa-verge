import path from 'node:path';
import { Runtime } from './runtime';
import { RpcError } from './errors';
import { dataRoot } from './config';
import { runUpdateJobStdio } from './updates';
import { isWireFloat, parseWireJson, stringifyWireJson } from './wire-json';

export async function processRequest(runtime: Pick<Runtime, 'handle'>, request: any): Promise<any> {
  const id = request && typeof request === 'object' && !Array.isArray(request) ? request.id ?? null : null;
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string'
      || ('id' in request && id !== null && typeof id !== 'string' && !(typeof id === 'number' && Number.isSafeInteger(id) && !isWireFloat(request, 'id')))) throw new RpcError(-32600, '无效的 JSON-RPC 请求');
    const result = await runtime.handle(request.method, request.params);
    return 'id' in request ? { jsonrpc: '2.0', id, result } : undefined;
  } catch (error) {
    if (error instanceof RpcError) {
      if (request && typeof request === 'object' && !('id' in request) && error.code !== -32600) return undefined;
      return { jsonrpc: '2.0', id, error: error.asDict() };
    }
    console.error('本地运行时请求失败:', error);
    return { jsonrpc: '2.0', id, error: { code: -32603, message: '本地运行时内部错误' } };
  }
}

export async function main() {
  if (process.argv.includes('--update-job')) { await runUpdateJobStdio(); return; }
  const args = process.argv.slice(2), option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const mode = option('--mode') || process.env.MAAVERGE_MODE || 'mock';
  if (mode !== 'mock' && mode !== 'native') throw new Error('运行模式必须是 mock 或 native');
  let transportBroken = false, signalled = false;
  const send = (message: any) => { if (!transportBroken && message !== undefined && !process.stdout.destroyed) process.stdout.write(stringifyWireJson(message) + '\n'); };
  process.stdout.on('error', () => { transportBroken = true; process.stdin.destroy(); });
  const runtime = new Runtime(path.join(path.resolve(option('--data-dir') || dataRoot()), mode), mode, { notify: send });
  const inflight = new Set<Promise<unknown>>();
  let stopped = false, updateBusy = false, connectionBusy = false, backgroundSlots = 0;
  const track = (promise: Promise<unknown>) => { inflight.add(promise); void promise.catch(error => console.error(error)).finally(() => inflight.delete(promise)); };
  const timers = [
    setInterval(() => track(runtime.tick()), 100),
    setInterval(() => { if (!updateBusy && !stopped) { updateBusy = true; track((async () => { try { await runtime.automaticUpdates(); await runtime.updates.activatePending(); } finally { updateBusy = false; } })()); } }, 1000),
    setInterval(() => { if (!connectionBusy && !stopped) { connectionBusy = true; track(runtime.automaticConnections().finally(() => { connectionBusy = false; })); } }, 1000),
  ];
  const dispatch = (bytes: Buffer) => {
    let request: any;
    try { request = parseWireJson(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON 解析失败' } }); return; }
    const background = mode === 'native' && typeof request?.method === 'string' && (request.method.startsWith('updates.') || request.method === 'device.auto_connect');
    if (background && backgroundSlots >= 2) { if (Object.hasOwn(request, 'id')) send({ jsonrpc: '2.0', id: request.id, error: { code: -32021, message: '已有后台请求在处理中' } }); return; }
    if (background) backgroundSlots++;
    track(processRequest(runtime, request).then(send).finally(() => { if (background) backgroundSlots--; }));
  };
  const finish = async () => {
    if (stopped) return; stopped = true; timers.forEach(clearInterval); runtime.running = false;
    const deadline = setTimeout(() => { console.error('本地服务退出超时；进行中的操作结果未知'); process.exit(1); }, 4500);
    deadline.unref();
    try {
      await runtime.updates.close();
      await Promise.allSettled([...inflight]); await runtime.close();
    } finally { clearTimeout(deadline); }
  };
  let remaining = Buffer.alloc(0), dropping = false;
  const onSignal = () => { signalled = true; process.stdin.destroy(); };
  process.once('SIGTERM', onSignal); process.once('SIGINT', onSignal);
  try {
   for await (const chunk of process.stdin) {
    let bytes: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    while (bytes.length) {
      const newline = bytes.indexOf(10), part = newline < 0 ? bytes : bytes.subarray(0, newline);
      if (!dropping) {
        if (remaining.length + part.length > 1024 * 1024) { dropping = true; remaining = Buffer.alloc(0); send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: '请求超过大小限制' } }); }
        else remaining = Buffer.concat([remaining, part]);
      }
      if (newline < 0) break;
      if (!dropping) dispatch(remaining); remaining = Buffer.alloc(0); dropping = false; bytes = bytes.subarray(newline + 1);
    }
   }
   if (remaining.length && !dropping) dispatch(remaining);
  } catch (error) { if (!transportBroken && !signalled) throw error; }
  finally { process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal); await finish(); }
}
if (import.meta.main) main().catch(error => { console.error(error); process.exitCode = 1; });

import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  Diagnostics,
  Logs,
  logExportDirectory,
  redactLog,
} from '../src/infrastructure/logging/logs';
import { Runtime } from '../src/app/runtime';
import { processRequest } from '../src/transport/json-rpc';
import { parseSettings } from '../src/modules/settings/models';

const roots: string[] = [],
  runtimes: Runtime[] = [];
const temp = () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'maaverge-logs-')));
  roots.push(root);
  return root;
};
const put = (root: string, name: string, text = name, age = 0) => {
  const filename = path.join(root, name);
  mkdirSync(path.dirname(filename), { recursive: true });
  writeFileSync(filename, text);
  if (age)
    utimesSync(
      filename,
      new Date(Date.now() - age * 86400_000),
      new Date(Date.now() - age * 86400_000),
    );
  return filename;
};
const logsAt = (root = temp(), active = new Set<string>()) =>
  new Logs(root, {
    activeWorkers: () => active,
    summary: () => ({ componentVersion: 'test-core', status: 'failed' }),
    events: () => [{ id: 1, type: 'run.failed', runId: 'run-test', message: 'synthetic failure' }],
  });
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('diagnostic log export and retention', () => {
  test('platform defaults follow exe/log, macOS Logs and XDG state with checkout isolation', () => {
    expect(
      logExportDirectory('C:\\isolated', 'C:\\Apps\\Maa Verge', 'win32', 'C:\\Users\\test', {}),
    ).toBe('C:\\Apps\\Maa Verge\\log');
    expect(
      logExportDirectory('/data', '/Applications/Maa Verge.app', 'darwin', '/Users/test', {}),
    ).toBe('/Users/test/Library/Logs/Maa Verge');
    expect(logExportDirectory('/data', '/opt/app', 'linux', '/home/test', {})).toBe(
      '/home/test/.local/state/maa-verge/log',
    );
    expect(
      logExportDirectory('/data', '/opt/app', 'linux', '/home/test', { XDG_STATE_HOME: '/state' }),
    ).toBe('/state/maa-verge/log');
    expect(
      logExportDirectory('/data', '/opt/app', 'linux', '/home/test', {
        XDG_STATE_HOME: 'relative',
      }),
    ).toBe('/home/test/.local/state/maa-verge/log');
    expect(logExportDirectory('/checkout', undefined, 'linux', '/home/test', {})).toBe(
      '/checkout/log',
    );
    expect(
      logExportDirectory('/data', '/opt/app', 'linux', '/home/test', {
        MAAVERGE_LOG_DIR: '/custom',
      }),
    ).toBe('/custom');
  });

  test('runtime deletes selected event log entries by id and rejects invalid ids', async () => {
    const root = temp(),
      runtime = new Runtime(root, { calendar: { fetcher: null } });
    runtimes.push(runtime);
    runtime.emit('test.one', 'first', {});
    runtime.emit('test.two', 'second', {});
    const ids = runtime.store.events().map((event) => event.id);
    await expect(runtime.handle('logs.delete', { ids: ['not-an-id'] })).rejects.toMatchObject({
      code: -32602,
    });
    expect(await runtime.handle('logs.delete', { ids: [ids[0], 99999] })).toEqual({ deleted: 1 });
    expect(runtime.store.events().map((event) => event.id)).toEqual([ids[1]]);
  });

  test('exports readable version, correlation and source sections without business files or known credentials', () => {
    const logs = logsAt();
    logs.diagnostics.write('error', 'worker crashed', {
      runId: 'run-test',
      token: 'private-token',
      apiKey: 'private-key',
    });
    const entry = JSON.parse(readFileSync(logs.diagnostics.currentFile, 'utf8'));
    expect(entry.data.token).toBe('[redacted]');
    put(
      logs.root,
      'workers/device-a/worker.stderr.log',
      'synthetic stderr\nAuthorization: Bearer private-bearer\n',
    );
    put(logs.root, 'workers/device-a/debug/asst.log.bak', 'older core error');
    put(logs.root, 'workers/device-a/debug/screenshot.png', 'private-image');
    put(logs.root, 'workers/device-a/config.json', 'private-config');
    put(logs.root, 'state.sqlite3', 'private-db');
    const exported = logs.export(),
      text = readFileSync(exported.path, 'utf8');
    expect(text).toContain('formatVersion');
    expect(text).toContain('test-core');
    expect(text).toContain('run-test');
    expect(text).toContain('synthetic stderr');
    expect(text).toContain('older core error');
    for (const secret of [
      'private-token',
      'private-key',
      'private-bearer',
      'private-image',
      'private-config',
      'private-db',
    ])
      expect(text).not.toContain(secret);
    expect(exported.bytes).toBe(Buffer.byteLength(text));
    expect(exported.warnings).toEqual([]);
    expect(logs.export().path).not.toBe(exported.path);
  });

  test('large log tails and excessive files are bounded and described in warnings', () => {
    const logs = logsAt();
    for (let index = 0; index < 70; index++)
      put(
        logs.root,
        `workers/d/debug/asst-${index}.log`,
        'OLD START\n' + 'line\n'.repeat(120_000) + 'RECENT END\n',
      );
    const result = logs.export(),
      text = readFileSync(result.path, 'utf8');
    expect(result.bytes).toBeLessThan(8 * 1024 * 1024);
    expect(text).not.toContain('OLD START');
    expect(text).toContain('RECENT END');
    expect(result.warnings.some((warning) => warning.includes('仅包含末尾'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('上限'))).toBe(true);
  });

  test('empty installations export successfully and bad destinations give an actionable error', () => {
    expect(readFileSync(logsAt().export().path, 'utf8')).toContain('=== recent events ===');
    const root = temp(),
      blocked = put(root, 'not-a-directory');
    const logs = new Logs(root, {
      exportDirectory: blocked,
      activeWorkers: () => new Set(),
      summary: () => ({}),
      events: () => [],
    });
    expect(() => logs.export()).toThrow();
  });

  test('manual cleanup protects session workers, current runtime and unrelated files', () => {
    const active = new Set(['idle-device']),
      logs = logsAt(undefined, active);
    logs.diagnostics.write('info', 'runtime.started');
    const current = logs.diagnostics.currentFile;
    const idle = put(logs.root, 'workers/idle-device/debug/asst.log', 'in use', 60);
    const removed = put(logs.root, 'workers/closed-device/debug/asst.log.bak', 'old', 60);
    const screenshot = put(logs.root, 'workers/closed-device/debug/1.png');
    const unrelated = put(logs.root, 'log/user-created.log');
    const database = put(logs.root, 'state.sqlite3');
    const exported = logs.export();
    const result = logs.clean();
    expect(result.removedFiles).toBe(2);
    expect(result.removedBytes).toBeGreaterThan(0);
    expect(result.skippedFiles).toBe(2);
    expect(existsSync(removed)).toBe(false);
    expect(existsSync(exported.path)).toBe(false);
    for (const file of [current, idle, screenshot, unrelated, database])
      expect(existsSync(file)).toBe(true);
  });

  test('automatic retention runs immediately then daily; zero disables it', () => {
    const logs = logsAt(),
      at = Date.now();
    const old = put(logs.root, 'workers/d/debug/old.log', 'old', 15),
      recent = put(logs.root, 'workers/d/debug/new.log', 'new', 2);
    expect(logs.automatic(0, at)).toBeUndefined();
    expect(existsSync(old)).toBe(true);
    logs.resetCleanup();
    expect(logs.automatic(7, at)?.removedFiles).toBe(1);
    expect(existsSync(recent)).toBe(true);
    const later = put(logs.root, 'workers/d/debug/later.log', 'later', 15);
    expect(logs.automatic(7, at + 1000)).toBeUndefined();
    expect(existsSync(later)).toBe(true);
    expect(logs.automatic(7, at + 86400_000)?.removedFiles).toBe(1);
    logs.resetCleanup();
    expect(logs.automatic(7, at + 86400_001)).toBeDefined();
  });

  test('junctions and linked ancestors never grant read or cleanup access', () => {
    const root = temp(),
      outside = temp(),
      outsideLog = put(outside, 'asst.log', 'external-secret', 60);
    mkdirSync(path.join(root, 'workers'), { recursive: true });
    symlinkSync(
      outside,
      path.join(root, 'workers', 'linked-device'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const logs = logsAt(root),
      exported = logs.export();
    expect(readFileSync(exported.path, 'utf8')).not.toContain('external-secret');
    logs.clean();
    expect(existsSync(outsideLog)).toBe(true);
    const linkedParent = path.join(root, 'ancestor');
    symlinkSync(outside, linkedParent, process.platform === 'win32' ? 'junction' : 'dir');
    const nested = path.join(linkedParent, 'nested');
    mkdirSync(nested);
    const linkedLogs = new Logs(root, {
      exportDirectory: nested,
      activeWorkers: () => new Set(),
      summary: () => ({}),
      events: () => [],
    });
    expect(() => linkedLogs.export()).toThrow('符号链接');
  });

  test('service log write failures do not break the runtime and exports report them', () => {
    const logs = logsAt();
    put(logs.root, 'logs', 'blocked');
    expect(() => logs.diagnostics.write('error', 'failed request')).not.toThrow();
    expect(logs.diagnostics.failure).toContain('写入失败');
    expect(logs.export().warnings.join()).toContain('写入失败');
  });

  test('service rotation is bounded and oversized entries remain valid JSON', () => {
    const directory = path.join(temp(), 'logs'),
      diagnostic = new Diagnostics(directory);
    diagnostic.write('error', 'large data', 'x'.repeat(20000));
    expect(JSON.parse(readFileSync(diagnostic.currentFile, 'utf8')).truncated).toBe(true);
    for (let index = 0; index < 9; index++) {
      writeFileSync(diagnostic.currentFile, 'x'.repeat(2 * 1024 * 1024));
      diagnostic.write('info', 'rotate');
    }
    expect(diagnostic.failure).toContain('16 MiB');
  });

  test('credential redaction covers URL credentials, query tokens, JSON and headers', () => {
    const value = redactLog(
      'https://user:pass@example.test/api?token=secret123&cdk=private-cdk&ok=yes\n{"password":"pwd123","api_key":"key123","CDK":"private-json-cdk"}\nCookie: session=abc; value=123\nAuthorization: Basic abc123',
    );
    for (const secret of [
      'user:pass',
      'secret123',
      'private-cdk',
      'private-json-cdk',
      'pwd123',
      'key123',
      'session=abc',
      'abc123',
    ])
      expect(value).not.toContain(secret);
    expect(value).toContain('ok=yes');
    const diagnostic = new Diagnostics(path.join(temp(), 'logs'));
    diagnostic.write('error', 'url https://example.test/?token=private-token&ok=yes', {
      password: 'private-password',
      mirrorChyan: { cdk: 'private-nested-cdk' },
    });
    expect(JSON.parse(readFileSync(diagnostic.currentFile, 'utf8')).message).not.toContain(
      'private-token',
    );
    expect(readFileSync(diagnostic.currentFile, 'utf8')).not.toContain('private-nested-cdk');
  });

  test('runtime persists retention, validates commands and exports correlated failures without raw event payloads', async () => {
    const root = temp(),
      runtime = new Runtime(root, { calendar: { fetcher: null } });
    runtimes.push(runtime);
    expect((await runtime.handle('logs.info')).retentionDays).toBe(7);
    await runtime.handle('settings.save', {
      settings: { ...runtime.snapshot().settings, logRetentionDays: 14 },
    });
    expect((await runtime.handle('logs.info')).retentionDays).toBe(14);
    expect(() => parseSettings({ logRetentionDays: -1 })).toThrow();
    for (const method of ['logs.info', 'logs.export', 'logs.clean'])
      await expect(runtime.handle(method, { path: '/outside' })).rejects.toMatchObject({
        code: -32602,
      });
    const reply = await processRequest(runtime, {
      jsonrpc: '2.0',
      id: 'request-correlation',
      method: 'device.connect',
      params: {},
    });
    expect(reply.error).toBeDefined();
    runtime.emit('test.payload', 'diagnostic event', {
      account: 'private-account',
      raw: 'private-game-data',
      runId: 'run-correlation',
    });
    const exported = await runtime.handle('logs.export'),
      content = readFileSync(exported.path, 'utf8');
    expect(content).toContain('request-correlation');
    expect(content).toContain('run-correlation');
    expect(content).toContain('rpc.failed');
    expect(content).not.toContain('private-account');
    expect(content).not.toContain('private-game-data');
    const before = runtime.store.events();
    await runtime.handle('logs.clean');
    expect(runtime.store.events()).toEqual(before);
    await runtime.close();
    const reopened = new Runtime(root, { calendar: { fetcher: null } });
    runtimes.push(reopened);
    expect((await reopened.handle('logs.info')).retentionDays).toBe(14);
  });

  test('resolved instance configuration is exported and disconnected worker logs stay protected until restart', async () => {
    const root = temp(),
      worker = {
        events: [],
        connected: true,
        safeIdle: true,
        task: async () => ({}),
        stop: async () => ({}),
        connect: async () => ({}),
        waitConnected: async () => true,
        close: async () => {},
      };
    const runtime = new Runtime(root, {
      calendar: { fetcher: null },
      adbExecutable: () => 'synthetic-resolved-adb',
      workerFactory: async () => worker,
    });
    runtimes.push(runtime);
    runtime.store.put('active', 'combo', {
      core: { path: 'synthetic-resolved-core', version: 'v1' },
      resource: { path: 'synthetic-resolved-resource', version: 'r1' },
    });
    const device = await runtime.connectDevice({ address: '127.0.0.1:5555' });
    const nativeLog = put(root, `workers/${device.id}/debug/asst.log`, 'connected native log', 30);
    const exported = await runtime.handle('logs.export'),
      content = readFileSync(exported.path, 'utf8');
    expect(content).toContain('synthetic-resolved-adb');
    expect(content).toContain('synthetic-resolved-resource');
    expect(content).toContain('"safeIdle": true');
    await runtime.disconnectDevice(device.id);
    await runtime.handle('logs.clean');
    expect(existsSync(nativeLog)).toBe(true);
    await runtime.close();
    const reopened = new Runtime(root, { calendar: { fetcher: null } });
    runtimes.push(reopened);
    expect(existsSync(nativeLog)).toBe(false);
  });

  test('SQL recent history reads the newest bounded rows and RPC export failure includes its destination', async () => {
    const root = temp(),
      blocked = put(root, 'blocked-directory'),
      runtime = new Runtime(root, { calendar: { fetcher: null }, logExportDirectory: blocked });
    runtimes.push(runtime);
    for (let index = 0; index < 60; index++)
      runtime.store.put('run', String(index), { id: String(index), status: 'failed' });
    expect(runtime.store.recent('run', 50).map((run) => run.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => String(59 - index)),
    );
    const reply = await processRequest(runtime, {
      jsonrpc: '2.0',
      id: 'failed-export',
      method: 'logs.export',
      params: {},
    });
    expect(reply.error.code).toBe(-32050);
    expect(reply.error.data).toContain(blocked);
    expect(reply.error.message).toBe('日志导出失败');
  });
});

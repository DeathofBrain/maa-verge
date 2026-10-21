// Windows-only release smoke. Requires an installed WebView2 runtime, project
// Playwright dependencies, and a built release executable with its runtime/.
// Node drives CDP/DOM from the host; the application uses only packaged binaries.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { root } from './project.mjs';

const require = createRequire(import.meta.url);
const option = process.argv.indexOf('--executable');
if (process.argv.includes('--help')) {
  console.log('node tools/smoke-webview-windows.mjs [--executable <release maaverge.exe>]\nRequires Windows, installed WebView2, pnpm dependencies, and release/runtime binaries.\nUses an isolated mock workspace and temporary WebView profile; no devices or models.');
  process.exit(0);
}
if (process.platform !== 'win32') throw new Error('This native WebView smoke requires Windows; it does not install WebView2.');
if (option >= 0 && !process.argv[option + 1]) throw new Error('--executable requires a release executable path');
const executable = path.resolve(option >= 0 ? process.argv[option + 1] : path.join(root, 'apps/desktop/src-tauri/target/release/maaverge.exe'));
for (const file of [executable, ...['maaverge-runtime.exe', 'maaverge-core-worker.exe'].map(name => path.join(path.dirname(executable), 'runtime', name))]) {
  if (!existsSync(file)) throw new Error(`Missing release artifact: ${file}. Build the complete release before this smoke.`);
}
let chromium, expect;
try { ({ chromium, expect } = require('@playwright/test')); }
catch { throw new Error('Project Playwright dependencies are missing; install them with pnpm install --frozen-lockfile. No browser download is required.'); }

function processes() {
  const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CreationDate | ConvertTo-Json -Compress'], { windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 15_000 });
  const result = JSON.parse(output);
  return Array.isArray(result) ? result : [result];
}
if (processes().some(process => process.Name.toLowerCase() === 'maaverge.exe')) {
  throw new Error('A Maa Verge instance is already running. Close it first; this test will not control or stop existing instances.');
}
const outputRoot = path.join(root, 'build/webview-smoke');
mkdirSync(outputRoot, { recursive: true });
const runRoot = mkdtempSync(path.join(outputRoot, 'run-'));
const data = path.join(runRoot, 'data');
const locks = path.join(runRoot, 'locks');
const profile = path.join(runRoot, 'webview-profile');
const report = { executable, artifactDirectory: runRoot, startedAt: new Date().toISOString(), phases: [], pageErrors: [] };
const tracked = new Map();
let child;
let browser;
let page;
let output = '';

function ownTree() {
  const all = processes();
  const ids = new Set([child.pid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const process of all) if (ids.has(process.ParentProcessId) && !ids.has(process.ProcessId)) { ids.add(process.ProcessId); changed = true; }
  }
  const own = all.filter(process => ids.has(process.ProcessId));
  for (const process of own) tracked.set(process.ProcessId, process);
  return own;
}
function aliveTracked() {
  return processes().filter(process => {
    const known = tracked.get(process.ProcessId);
    return known && known.CreationDate === process.CreationDate;
  });
}
async function waitUntil(predicate, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await predicate()) return;
    await delay(200);
  }
  throw new Error(`Condition not satisfied after ${timeout}ms`);
}
function assertNoPageErrors() {
  assert.deepEqual(report.pageErrors, [], 'The native WebView raised an uncaught page error');
}
async function start() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const env = { ...process.env, MAAVERGE_MODE: 'mock', MAAVERGE_DATA_DIR: data, MAAVERGE_DEVICE_LOCK_DIR: locks, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` };
  for (const key of ['MAAVERGE_BACKEND', 'MAAVERGE_CORE_WORKER_PATH', 'BUN_OPTIONS', 'BUN_BE_BUN', 'NODE_OPTIONS', 'NODE_PATH']) delete env[key];
  child = spawn(executable, [], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => output += chunk);
  child.stderr.on('data', chunk => output += chunk);
  let spawnError;
  child.on('error', error => { spawnError = error; });
  await delay(150);
  ownTree();
  await waitUntil(async () => {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Desktop exited ${child.exitCode} before CDP: ${output}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
      if (response.ok) { report.webview = await response.json(); return true; }
    } catch {}
    return false;
  }, 25_000).catch(error => { throw new Error(`The release WebView did not expose the isolated CDP port. Check the installed WebView2 runtime and its debugging support. ${error.message}`); });
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10_000 });
  assert.ok(existsSync(profile), 'WebView2 must create this test\'s isolated profile');
  await waitUntil(() => browser.contexts().flatMap(context => context.pages()).some(candidate => candidate.url().startsWith('http://tauri.localhost')));
  page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('http://tauri.localhost'));
  assert.ok(page, 'The CDP target must be the native packaged Tauri page');
  page.setDefaultTimeout(12_000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  // Reload only this isolated mock page after attaching the listener. Otherwise
  // initialization errors (including illegal Tauri event names) can precede CDP.
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await expect(page.locator('.environment-badge')).toHaveText('模拟工作空间');
  await expect(page.getByLabel('设备统计', { exact: true }).locator('strong')).toHaveText('1');
  await delay(200); // Let initialization IPC listener rejections reach pageerror.
  assertNoPageErrors();
  ownTree();
  report.phases.push({ phase: 'native-WebView-ready', url: page.url(), mode: 'mock' });
}
async function closeThroughUI() {
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '通用与外观', exact: true }).click();
  const tray = page.getByRole('switch', { name: '关闭窗口后驻留托盘', exact: true });
  if (await tray.getAttribute('aria-checked') === 'true') await tray.click();
  await expect(tray).toHaveAttribute('aria-checked', 'false');
  ownTree();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await waitUntil(() => child.exitCode !== null, 12_000);
  await waitUntil(() => aliveTracked().length === 0, 12_000);
  assert.equal(child.exitCode, 0);
  report.phases.push({ phase: 'native-window-close-cleanup', exitCode: child.exitCode, remainingTrackedProcesses: aliveTracked() });
}
function removeOwnedDirectory(directory) {
  const relative = path.relative(path.resolve(runRoot), path.resolve(directory));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Refusing cleanup outside this smoke workspace');
  rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}

try {
  console.log('Starting an isolated Windows release mock WebView smoke.');
  await start();
  await page.locator('.sidebar').getByRole('button', { name: '任务表', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: '配置任务表1-7 材料补给', exact: true }).click();
  const workspace = page.getByRole('region', { name: '任务表工作台', exact: true });
  await expect(workspace.getByRole('heading', { name: '1-7 材料补给', exact: true })).toBeVisible();
  await workspace.getByRole('button', { name: '开始日常', exact: true }).click();
  const dock = page.getByRole('contentinfo', { name: '执行状态栏', exact: true });
  await expect(dock).toContainText('执行中');
  const activeTree = ownTree();
  assert.ok(activeTree.some(process => process.Name === 'maaverge-runtime.exe'));
  assert.ok(activeTree.some(process => process.Name === 'maaverge-core-worker.exe'));
  assert.ok(!activeTree.some(process => /python|node|bun/i.test(process.Name)), 'The application must use only its packaged runtime');
  report.phases.push({ phase: 'run-started', processes: activeTree });
  await dock.getByRole('button', { name: '停止执行', exact: true }).click();
  await expect(dock.getByRole('button', { name: '停止执行', exact: true })).toBeHidden();
  await waitUntil(() => !ownTree().some(process => process.Name === 'maaverge-core-worker.exe'));
  await page.locator('.sidebar').getByRole('button', { name: '执行记录', exact: true }).click();
  await expect(page.getByRole('cell', { name: '已停止', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '模拟执行已停止，原计划保留', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(runRoot, 'stopped.png'), animations: 'disabled' });
  assertNoPageErrors();
  report.phases.push({ phase: 'run-stopped-worker-released' });
  await closeThroughUI();
  await start();
  await page.locator('.sidebar').getByRole('button', { name: '执行记录', exact: true }).click();
  await expect(page.getByRole('cell', { name: '已停止', exact: true })).toHaveCount(1);
  await expect(page.getByRole('cell', { name: '模拟执行已停止，原计划保留', exact: true })).toBeVisible();
  report.phases.push({ phase: 'restart-persistence' });
  await closeThroughUI();
  assertNoPageErrors();
  report.ok = true;
} catch (error) {
  report.ok = false;
  report.error = error.stack || String(error);
  if (page && !page.isClosed()) {
    try { report.visibleText = await page.locator('body').innerText({ timeout: 2000 }); await page.screenshot({ path: path.join(runRoot, 'failure.png'), timeout: 2000 }); } catch {}
  }
  try { if (child?.pid) report.failureProcessTree = ownTree(); } catch {}
} finally {
  try {
    if (child?.pid && child.exitCode === null) execFileSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'pipe' });
    for (const process of aliveTracked()) {
      try { execFileSync('taskkill.exe', ['/PID', String(process.ProcessId), '/T', '/F'], { windowsHide: true, stdio: 'pipe' }); } catch {}
    }
    await waitUntil(() => aliveTracked().length === 0);
    report.cleanupRemaining = aliveTracked();
    for (const directory of [profile, data, locks]) removeOwnedDirectory(directory);
  } catch (error) { report.ok = false; report.cleanupError = String(error); }
  if (browser?.isConnected()) { try { await browser.close(); } catch {} }
  report.output = output;
  report.finishedAt = new Date().toISOString();
  const file = path.join(runRoot, 'report.json');
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`${report.ok ? 'PASS' : 'FAIL'} Windows native release WebView smoke: ${file}`);
  if (!report.ok) console.error(report.error || report.cleanupError);
  process.exitCode = report.ok ? 0 : 1;
}

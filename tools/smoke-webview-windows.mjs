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
import { seedNativeData } from './test-support/seed-native.mjs';

const require = createRequire(import.meta.url);
const option = process.argv.indexOf('--executable');
const scheduledWake = process.argv.includes('--scheduled-wake');
if (process.argv.includes('--help')) {
  console.log('node tools/smoke-webview-windows.mjs [--executable <release maaverge.exe>] [--scheduled-wake]\nRequires Windows, installed WebView2, pnpm dependencies, and release/runtime binaries.\nUses an isolated native workspace with automatic connection/download disabled and a temporary WebView profile.');
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
  const env = { ...process.env, MAAVERGE_MODE: 'native', MAAVERGE_DATA_DIR: data, MAAVERGE_DEVICE_LOCK_DIR: locks, WEBVIEW2_USER_DATA_FOLDER: profile, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` };
  for (const key of ['MAAVERGE_BACKEND', 'MAAVERGE_CORE_WORKER_PATH', 'BUN_OPTIONS', 'BUN_BE_BUN', 'NODE_OPTIONS', 'NODE_PATH']) delete env[key];
  child = spawn(executable, scheduledWake ? ['--scheduled-wake', '--schedule-data-root', data] : [], { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
  // Reload only this isolated test page after attaching the listener. Otherwise
  // initialization errors (including illegal Tauri event names) can precede CDP.
  await page.reload({ waitUntil: 'load' });
  await expect(page.getByRole('region', { name: '主页仪表盘', exact: true })).toBeVisible();
  await expect(page.getByLabel('选择设备', { exact: true })).toBeVisible();
  await expect(page.getByLabel('设备统计', { exact: true }).locator('strong')).toHaveText('0');
  await delay(200); // Let initialization IPC listener rejections reach pageerror.
  assertNoPageErrors();
  ownTree();
  report.phases.push({ phase: 'native-WebView-ready', url: page.url(), mode: 'native' });
}
async function closeThroughUI() {
  await page.locator('.sidebar').getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '通用与外观', exact: true }).click();
  const behavior = page.getByLabel('关闭窗口时', { exact: true });
  await behavior.selectOption('ask');
  await expect(behavior).toHaveValue('ask');
  let exitDialogPainted = false;
  await page.exposeFunction('recordNativeExitDialog', () => { exitDialogPainted = true; });
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const dialog = document.querySelector('dialog[open]');
      if (dialog?.textContent.includes('正在退出') && dialog.querySelector('.spin')) {
        observer.disconnect();
        requestAnimationFrame(() => { void window.recordNativeExitDialog(); });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  ownTree();
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  const choice = page.getByRole('dialog', { name: '关闭 Maa Verge', exact: true });
  await expect(choice).toBeVisible();
  await choice.getByRole('button', { name: '退出应用', exact: true }).click();
  await waitUntil(() => child.exitCode !== null, 12_000);
  await waitUntil(() => aliveTracked().length === 0, 12_000);
  assert.equal(child.exitCode, 0);
  assert.equal(exitDialogPainted, true, 'The native WebView must paint its exit dialog before cleanup');
  report.phases.push({ phase: 'native-window-close-cleanup', exitDialogPainted, exitCode: child.exitCode, remainingTrackedProcesses: aliveTracked() });
}
function removeOwnedDirectory(directory) {
  const relative = path.relative(path.resolve(runRoot), path.resolve(directory));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Refusing cleanup outside this smoke workspace');
  rmSync(directory, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}

try {
  await seedNativeData(data);
  console.log('Starting an isolated Windows release native WebView smoke.');
  await start();
  if (scheduledWake) {
    // Only this isolated empty workspace is launched; no system wake or real
    // device is involved. The duplicate must hand off and exit before UI setup.
    const second = spawn(executable, ['--scheduled-wake', '--schedule-data-root', data], { cwd: root, env: { ...process.env, MAAVERGE_DATA_DIR: data }, windowsHide: true, stdio: 'ignore' });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Scheduled duplicate did not exit')), 15000);
        second.once('error', error => { clearTimeout(timer); reject(error); });
        second.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Scheduled duplicate exited ${code}`)); });
      });
    } finally {
      if (second.pid && second.exitCode === null) execFileSync('taskkill.exe', ['/PID', String(second.pid), '/T', '/F'], { windowsHide: true, stdio: 'pipe' });
    }
    assert.equal(ownTree().filter(process => process.Name === 'maaverge-runtime.exe').length, 1);
    report.phases.push({ phase: 'scheduled-wake-single-instance-handoff' });
  }
  await page.locator('.sidebar').getByRole('button', { name: /^Agent 助手/ }).click();
  await page.getByRole('button', { name: '制定刷 6 次 1-7 的计划', exact: true }).click();
  await page.getByRole('button', { name: '检查并保存计划', exact: true }).click();
  const workspace = page.getByRole('region', { name: '任务表工作台', exact: true });
  await expect(workspace.getByRole('heading', { name: '1-7 材料补给', exact: true })).toBeVisible();
  await page.keyboard.press('Control+s');
  await expect(workspace.locator('.wb-save-state')).toHaveText('已保存');
  const activeTree = ownTree();
  assert.ok(activeTree.some(process => process.Name === 'maaverge-runtime.exe'));
  assert.ok(!activeTree.some(process => process.Name === 'maaverge-core-worker.exe'), 'An empty workspace must not create a device worker');
  assert.ok(!activeTree.some(process => /python|node|bun/i.test(process.Name)), 'The application must use only its packaged runtime');
  await page.locator('.sidebar').getByRole('button', { name: '执行记录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '还没有执行记录', exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(runRoot, 'native-empty-history.png'), animations: 'disabled' });
  assertNoPageErrors();
  report.phases.push({ phase: 'local-proposal-saved-without-execution', processes: activeTree });
  await closeThroughUI();
  await start();
  await page.locator('.sidebar').getByRole('button', { name: '任务表', exact: true }).click();
  await page.locator('.sidebar').getByRole('button', { name: '配置任务表1-7 材料补给', exact: true }).click();
  await expect(page.getByRole('region', { name: '任务表工作台', exact: true }).getByRole('heading', { name: '1-7 材料补给', exact: true })).toBeVisible();
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

import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root, windows, fail } from './project.mjs';

async function main() {
  const temporary = mkdtempSync(path.join(tmpdir(), 'maaverge-package-smoke-'));
  const executable = path.join(root, 'dist/runtime/maaverge-runtime', windows ? 'maaverge-runtime.exe' : 'maaverge-runtime');
  try {
    const child = spawn(executable, ['--mode', 'mock', '--data-dir', temporary], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, MAAVERGE_MODE: 'mock' },
    });
    let stdout = '';
    let stderr = '';
    child.stdin.on('error', () => {});
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr = (stderr + chunk).slice(-16000); });
    const timer = setTimeout(() => child.kill(), 30000);
    child.stdin.end(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'app.snapshot', params: {} })}\n`);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    }).finally(() => clearTimeout(timer));
    if (code !== 0) throw new Error(`Packaged runtime exited ${code}: ${stderr}`);
    const messages = stdout.trim().split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
    const response = messages.find((message) => message.id === 1);
    if (response?.jsonrpc !== '2.0' || response.result?.mode !== 'mock' || !Array.isArray(response.result?.devices)) {
      throw new Error('Packaged runtime did not return a valid mock snapshot');
    }
    const archive = path.join(temporary, 'fixture.zip');
    const target = path.join(temporary, 'candidate');
    mkdirSync(target);
    // A deterministic ZIP containing one harmless text file. No DLL, device,
    // network or model is involved; this verifies the frozen upstream helper path.
    writeFileSync(archive, Buffer.from('UEsDBBQAAAAAAAAAIVy/WosfEwAAABMAAAAQAAAAc21va2UtbWFya2VyLnR4dHBhY2thZ2VkLXVwZGF0ZXItb2tQSwECFAAUAAAAAAAAACFcv1qLHxMAAAATAAAAEAAAAAAAAAAAAAAAgAEAAAAAc21va2UtbWFya2VyLnR4dFBLBQYAAAAAAQABAD4AAABBAAAAAAA=', 'base64'));
    const helper = spawn(executable, ['--native-helper'], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, MAAVERGE_MODE: 'mock', PYTHONUTF8: '1' },
    });
    let helperOutput = '';
    let helperErrors = '';
    helper.stdin.on('error', () => {});
    helper.stdout.setEncoding('utf8').on('data', (chunk) => { helperOutput += chunk; });
    helper.stderr.setEncoding('utf8').on('data', (chunk) => { helperErrors = (helperErrors + chunk).slice(-16000); });
    const helperTimer = setTimeout(() => helper.kill(), 30000);
    helper.stdin.end(JSON.stringify({ operation: 'official_update', archive, target, currentVersion: 'v0.0.1', version: 'v0.0.2' }));
    const helperCode = await new Promise((resolve, reject) => {
      helper.once('error', reject);
      helper.once('close', resolve);
    }).finally(() => clearTimeout(helperTimer));
    if (helperCode !== 0 || !JSON.parse(helperOutput).installed || readFileSync(path.join(target, 'smoke-marker.txt'), 'utf8') !== 'packaged-updater-ok') {
      throw new Error(`Packaged official updater helper failed: ${helperErrors}`);
    }
    console.log('Packaged runtime verified: JSON-RPC mock snapshot, clean EOF shutdown, frozen official updater using a local fixture.');
  } finally {
    const prefix = path.join(tmpdir(), 'maaverge-package-smoke-');
    if (!path.resolve(temporary).startsWith(path.resolve(prefix))) throw new Error('Unexpected smoke temporary path');
    rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch(fail);

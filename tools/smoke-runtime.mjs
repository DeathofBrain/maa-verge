import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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
    // A deterministic ZIP with text-only core/resource fixtures and unused GUI
    // files. No native library is loaded; this checks frozen selective extraction.
    writeFileSync(archive, Buffer.from('UEsDBBQAAAAAAAAAIVxNwYUhHgAAAB4AAAALAAAATWFhQ29yZS5kbGxzeW50aGV0aWMtbm90LWEtbmF0aXZlLWxpYnJhcnlQSwMEFAAAAAAAAAAhXEO/pqMCAAAAAgAAABUAAAByZXNvdXJjZS92ZXJzaW9uLmpzb257fVBLAwQUAAAAAAAAACFcv1qLHxMAAAATAAAAGQAAAHJlc291cmNlL3Ntb2tlLW1hcmtlci50eHRwYWNrYWdlZC11cGRhdGVyLW9rUEsDBBQAAAAAAAAAIVyzmBYTCgAAAAoAAAAHAAAATUFBLmV4ZXVudXNlZC1ndWlQSwMEFAAAAAAAAAAhXCmSCXYNAAAADQAAABEAAABleHRlcm5hbHMvZ3VpLmRsbHVudXNlZC1kb3RuZXRQSwECFAAUAAAAAAAAACFcTcGFIR4AAAAeAAAACwAAAAAAAAAAAAAAgAEAAAAATWFhQ29yZS5kbGxQSwECFAAUAAAAAAAAACFcQ7+mowIAAAACAAAAFQAAAAAAAAAAAAAAgAFHAAAAcmVzb3VyY2UvdmVyc2lvbi5qc29uUEsBAhQAFAAAAAAAAAAhXL9aix8TAAAAEwAAABkAAAAAAAAAAAAAAIABfAAAAHJlc291cmNlL3Ntb2tlLW1hcmtlci50eHRQSwECFAAUAAAAAAAAACFcs5gWEwoAAAAKAAAABwAAAAAAAAAAAAAAgAHGAAAATUFBLmV4ZVBLAQIUABQAAAAAAAAAIVwpkgl2DQAAAA0AAAARAAAAAAAAAAAAAACAAfUAAABleHRlcm5hbHMvZ3VpLmRsbFBLBQYAAAAABQAFADcBAAAxAQAAAAA=', 'base64'));
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
    if (helperCode !== 0 || !JSON.parse(helperOutput).installed
        || readFileSync(path.join(target, 'resource/smoke-marker.txt'), 'utf8') !== 'packaged-updater-ok'
        || readFileSync(path.join(target, 'MaaCore.dll'), 'utf8') !== 'synthetic-not-a-native-library'
        || existsSync(path.join(target, 'MAA.exe')) || existsSync(path.join(target, 'externals'))) {
      throw new Error(`Packaged official updater helper failed: ${helperErrors}`);
    }
    console.log('Packaged runtime verified: JSON-RPC mock snapshot, clean EOF shutdown, frozen official updater with selective extraction.');
  } finally {
    const prefix = path.join(tmpdir(), 'maaverge-package-smoke-');
    if (!path.resolve(temporary).startsWith(path.resolve(prefix))) throw new Error('Unexpected smoke temporary path');
    rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch(fail);

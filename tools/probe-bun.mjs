import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { crc32 } from 'node:zlib';
import { bunRoot, bunVersion, cleanRuntimeEnvironment, ensureBun } from './setup-bun.mjs';

const supported = ['bun-windows-x64', 'bun-linux-x64', 'bun-darwin-arm64', 'bun-darwin-x64'];
const host = `bun-${{ win32: 'windows', linux: 'linux', darwin: 'darwin' }[process.platform]}-${process.arch}`;
const targetArgument = process.argv.find((argument) => argument.startsWith('--target='))?.slice(9);
const targets = process.argv.includes('--all-targets') ? supported : [targetArgument || host];
const dependencyRoot = process.argv.find((argument) => argument.startsWith('--dependency-root='))?.slice(18) || path.join(bunRoot, 'services', 'backend');
const requireDependency = createRequire(path.join(path.resolve(dependencyRoot), 'package.json'));
const yauzl = requireDependency.resolve('yauzl');
const tar = requireDependency.resolve('tar');
const bun = await ensureBun();

function command(executable, arguments_, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { cwd: bunRoot, env: cleanRuntimeEnvironment(), windowsHide: true, ...options });
    const stdout = [], stderr = [];
    child.stdout?.on('data', (chunk) => stdout.push(chunk));
    child.stderr?.on('data', (chunk) => stderr.push(chunk));
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Probe command timed out: ${executable}`)); }, 120000);
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(stdout).toString('utf8');
      const diagnostic = Buffer.concat(stderr).toString('utf8');
      if (code !== 0) reject(new Error(`Probe exited ${code}: ${diagnostic || output}`));
      else resolve({ stdout: output, stderr: diagnostic });
    });
    if (options.input !== undefined) child.stdin.end(options.input);
  });
}

function zipFixture() {
  const name = Buffer.from('probe.txt'), contents = Buffer.from('archive probe\n');
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc32(contents), 14);
  local.writeUInt32LE(contents.length, 18); local.writeUInt32LE(contents.length, 22); local.writeUInt16LE(name.length, 26);
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc32(contents), 16); central.writeUInt32LE(contents.length, 20); central.writeUInt32LE(contents.length, 24); central.writeUInt16LE(name.length, 28);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + contents.length, 16);
  return Buffer.concat([local, name, contents, central, name, end]).toString('base64');
}

function tarFixture() {
  const header = Buffer.alloc(512), contents = Buffer.from('archive probe\n');
  header.write('probe.txt'); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
  header.write(contents.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
  header.fill(0x20, 148, 156); header.write('0', 156); header.write('ustar\0', 257); header.write('00', 263);
  header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([header, contents, Buffer.alloc(512 - contents.length + 1024)]).toString('base64');
}

const source = `import assert from 'node:assert/strict';
import { Database } from 'bun:sqlite';
import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import yauzl from ${JSON.stringify(yauzl)};
import { Parser } from ${JSON.stringify(tar)};

if (process.argv[2] === '--echo') {
  for await (const line of createInterface({ input: process.stdin })) {
    const request = JSON.parse(line);
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: request.params }) + '\\n');
  }
} else if (process.argv[2] === '--lock-attempt') {
  const lock = new Database(process.argv[3]);
  lock.run('PRAGMA busy_timeout=0');
  try { lock.run('BEGIN EXCLUSIVE'); process.exitCode = 2; }
  catch (error) { if (error.code !== 'SQLITE_BUSY') throw error; }
  finally { lock.close(); }
} else {
  assert.equal(process.versions.bun, ${JSON.stringify(bunVersion)});
  assert.equal(process.env.MAAVERGE_BUN_PROBE_LEAK, undefined);
  assert.equal(process.env.BUN_OPTIONS, undefined);
  assert.equal(process.env.NODE_OPTIONS, undefined);
  const tokens = [];
  JSON.parse('{"integer":1,"float":1.0}', (key, value, context) => { if (context?.source) tokens.push(context.source); return value; });
  assert.deepEqual(tokens, ['1', '1.0']);
  assert.equal(JSON.stringify({ wide: JSON.rawJSON('9007199254740993') }), '{"wide":9007199254740993}');
  assert.equal(createHash('sha256').update('probe').digest('hex').length, 64);
  const root = process.env.MAAVERGE_PROBE_ROOT;
  mkdirSync(root, { recursive: true });
  const lockPath = path.join(root, 'runtime-lock.sqlite3');
  const guard = new Database(lockPath);
  assert.equal(Object.values(guard.query('PRAGMA journal_mode=DELETE').get())[0], 'delete');
  guard.run('PRAGMA busy_timeout=0'); guard.run('BEGIN EXCLUSIVE');
  const child = (args, input = '') => new Promise((resolve, reject) => {
    const worker = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let output = '', errors = '';
    worker.stdout.setEncoding('utf8'); worker.stderr.setEncoding('utf8');
    worker.stdout.on('data', chunk => output += chunk); worker.stderr.on('data', chunk => errors += chunk);
    worker.once('error', reject);
    worker.once('exit', code => code === 0 ? resolve(output) : reject(new Error('child failed: ' + errors + ' code=' + code)));
    worker.stdin.end(input);
  });
  await child(['--lock-attempt', lockPath]);
  const db = new Database(path.join(root, '中文数据.sqlite3'));
  db.run('PRAGMA journal_mode=WAL');
  db.run('CREATE TABLE objects(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id))');
  db.transaction(() => {
    db.query('INSERT INTO objects(rowid,kind,id,value) VALUES(?,?,?,?)').run(7, 'plan', 'b', JSON.stringify({ name: '任务二' }));
    db.query('INSERT INTO objects(rowid,kind,id,value) VALUES(?,?,?,?)').run(2, 'plan', 'a', JSON.stringify({ name: '任务一' }));
  })();
  const original = db.query('SELECT rowid,* FROM objects ORDER BY rowid').all();
  const snapshot = db.serialize();
  const backupPath = path.join(root, 'backup.sqlite3');
  const temporary = backupPath + '.tmp';
  const descriptor = openSync(temporary, 'wx');
  try { writeFileSync(descriptor, snapshot); fsyncSync(descriptor); } finally { closeSync(descriptor); }
  const backup = new Database(temporary, { readonly: true });
  assert.equal(Object.values(backup.query('PRAGMA integrity_check').get())[0], 'ok');
  assert.deepEqual(backup.query('SELECT rowid,* FROM objects ORDER BY rowid').all(), original);
  backup.close(); renameSync(temporary, backupPath);
  const sqliteVersion = Object.values(db.query('SELECT sqlite_version()').get())[0];
  db.close(); guard.run('ROLLBACK'); guard.close();
  const echo = await child(['--echo'], JSON.stringify({ jsonrpc: '2.0', id: 42, params: { text: '逐行通信' } }) + '\\n');
  assert.deepEqual(JSON.parse(echo), { jsonrpc: '2.0', id: 42, result: { text: '逐行通信' } });
  const zipEntries = await new Promise((resolve, reject) => yauzl.fromBuffer(Buffer.from(${JSON.stringify(zipFixture())}, 'base64'), { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    const entries = [];
    zip.on('error', reject); zip.on('end', () => resolve(entries));
    zip.on('entry', entry => zip.openReadStream(entry, (error, stream) => {
      if (error) return reject(error);
      const chunks = []; stream.on('error', reject); stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => { entries.push([entry.fileName, Buffer.concat(chunks).toString()]); zip.readEntry(); });
    }));
    zip.readEntry();
  }));
  const tarEntries = await new Promise((resolve, reject) => {
    const entries = [], parser = new Parser();
    parser.on('error', reject); parser.on('end', () => resolve(entries));
    parser.on('entry', entry => {
      const chunks = []; entry.on('data', chunk => chunks.push(chunk));
      entry.on('end', () => entries.push([entry.path, Buffer.concat(chunks).toString()])); entry.resume();
    });
    parser.end(Buffer.from(${JSON.stringify(tarFixture())}, 'base64'));
  });
  assert.deepEqual(zipEntries, [['probe.txt', 'archive probe\\n']]);
  assert.deepEqual(tarEntries, zipEntries);
  const requests = createInterface({ input: process.stdin });
  for await (const line of requests) {
    const request = JSON.parse(line);
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { bunVersion: process.versions.bun, sqliteVersion, rowids: original.map(row => row.rowid), subprocess: true, exclusiveLock: true, archives: ['zip', 'tar'], platform: process.platform, architecture: process.arch } }) + '\\n');
  }
}
`;

for (const target of targets) {
  if (!supported.includes(target)) throw new Error(`Unsupported probe target: ${target}`);
  const directory = path.join(bunRoot, '.tools', 'bun-probe', target);
  mkdirSync(directory, { recursive: true });
  const entrypoint = path.join(directory, 'probe.ts');
  const executable = path.join(directory, target.includes('windows') ? 'maaverge-probe.exe' : 'maaverge-probe');
  writeFileSync(entrypoint, source);
  await command(bun, ['build', entrypoint, '--compile', `--target=${target}`, '--no-compile-autoload-dotenv', '--no-compile-autoload-bunfig', '--outfile', executable]);
  const result = { target, built: true, executed: false };
  if (target === host) {
    const runDirectory = path.join(directory, `isolated-${Date.now()}`);
    mkdirSync(runDirectory, { recursive: true });
    writeFileSync(path.join(runDirectory, '.env'), 'MAAVERGE_BUN_PROBE_LEAK=unexpected\n');
    writeFileSync(path.join(runDirectory, 'bunfig.toml'), 'invalid = [ broken toml\n');
    const environment = cleanRuntimeEnvironment({ ...process.env, BUN_OPTIONS: '--invalid-probe-flag', NODE_OPTIONS: '--invalid-probe-flag' });
    for (const key of Object.keys(environment)) if (key.toUpperCase() === 'PATH') environment[key] = runDirectory;
    delete environment.MAAVERGE_BUN_PROBE_LEAK;
    environment.MAAVERGE_PROBE_ROOT = path.join(runDirectory, 'data');
    const output = await command(executable, [], { cwd: runDirectory, env: environment, input: '{"jsonrpc":"2.0","id":1,"method":"probe"}\n' });
    const messages = output.stdout.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    assert.equal(messages.length, 1); assert.equal(messages[0].id, 1); assert.equal(messages[0].result.bunVersion, bunVersion);
    Object.assign(result, { executed: true, ...messages[0].result });
  }
  writeFileSync(path.join(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}

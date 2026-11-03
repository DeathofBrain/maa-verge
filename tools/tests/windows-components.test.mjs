/** Resource packaging is tested with synthetic source/overlay archives and a forbidden network. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ensureBun } from '../setup-bun.mjs';
import { makeTemporaryDirectory } from '../test-support/temporary-directory.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));

test('resource-only preparation validates source composition, licenses and atomic publication without native binaries', async (t) => {
  const temporary = await makeTemporaryDirectory(path.join(tmpdir(), 'maaverge-resource-package-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const script = path.join(temporary, 'fixture.ts');
  const source = `
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prepareWindowsComponentPayloads } from ${JSON.stringify(path.join(root, 'tools/test-support/windows-components.ts'))};
import { zipBytes } from ${JSON.stringify(path.join(root, 'services/backend/tests/archive-fixture.ts'))};
import { baseResourceFiles } from ${JSON.stringify(path.join(root, 'services/backend/tests/resource-update-fixture.ts'))};
const directory = ${JSON.stringify(temporary)}, commit = '71bce1cc85bce55d3b20e19066b2dd33252072fc', version = 'a'.repeat(40);
const base = zipBytes(baseResourceFiles), overlay = zipBytes([{ name:'overlay/resource/version.json',content:'{}' }]);
const baseUrl = 'https://codeload.github.com/MaaAssistantArknights/MaaAssistantArknights/zip/' + commit;
const overlayUrl = 'https://codeload.github.com/MaaAssistantArknights/MaaResource/zip/' + version;
const lockFile = path.join(directory,'lock.json');
await writeFile(lockFile,JSON.stringify({formatVersion:2,platform:'win32',arch:'x64',base:{version:commit,url:baseUrl},resource:{version,url:overlayUrl,size:overlay.length,sha256:createHash('sha256').update(overlay).digest('hex')}}));
const outputDirectory = path.join(directory,'payload');
const urls = [];
await prepareWindowsComponentPayloads({lockFile,outputDirectory,cacheDirectory:path.join(directory,'cache')},{fetcher:async(input)=>{
 const url=String(input); urls.push(url); if (![baseUrl,overlayUrl].includes(url)) throw new Error('network forbidden');
 return new Response(Uint8Array.from(url===baseUrl?base:overlay));
}});
const manifest = JSON.parse(await readFile(path.join(outputDirectory,'manifest.json'),'utf8'));
if (manifest.formatVersion!==2 || manifest.core || !manifest.resource.installedHash) throw new Error('invalid manifest');
const entries = await readdir(outputDirectory);
if (JSON.stringify(entries.sort())!==JSON.stringify(['manifest.json','resource'])) throw new Error('native payload leaked');
if ((await readFile(path.join(outputDirectory,'resource/resource/PaddleOCR/rec/keys.txt'),'utf8'))!=='synthetic keys') throw new Error('missing model baseline');
if ((await readFile(path.join(outputDirectory,'resource/licenses/official-source/LICENSE'),'utf8'))!=='upstream resource license') throw new Error('missing source license');
// A competing publisher must keep its lock and the active payload; only our unowned stage is removed.
await mkdir(outputDirectory + '.lock');
let contended = false;
try { await prepareWindowsComponentPayloads({lockFile,outputDirectory,cacheDirectory:path.join(directory,'cache')},{fetcher:async()=>{throw new Error('network forbidden during lock contention');}}); }
catch (error) { if (error.code !== 'EEXIST') throw error; contended = true; }
if (!contended || !(await readdir(directory)).includes('payload.lock')) throw new Error('competing publisher lock was lost');
if ((await readdir(directory)).some(name=>name.startsWith('.windows-resources-'))) throw new Error('contended stage leaked');
if ((await readFile(path.join(outputDirectory,'manifest.json'),'utf8'))!==JSON.stringify(manifest,null,2)+'\\n') {
 const preserved=JSON.parse(await readFile(path.join(outputDirectory,'manifest.json'),'utf8'));
 if (preserved.resource.installedHash!==manifest.resource.installedHash) throw new Error('active payload changed during contention');
}
await rm(outputDirectory + '.lock',{recursive:true});
console.log(JSON.stringify({urls,version:manifest.resource.version}));
`;
  await writeFile(script, source);
  const child = spawn(await ensureBun({ download: false }), [script], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(code, 0, stderr);
  const result = JSON.parse(stdout);
  assert.equal(result.urls.length, 2);
  assert.equal(result.version, 'a'.repeat(40));
});

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ensureBun } from '../setup-bun.mjs';
import { offlineAgentEnvironment } from '../test-support/agent-environment.mjs';

const execute = promisify(execFile);
const project = fileURLToPath(new URL('../../', import.meta.url));

// Exercise the real TypeScript preparation pipeline in the pinned Bun. Only
// archive responses and native validation are synthetic; no network or native
// library is used, and the production downloader and extractor remain intact.
async function scenario(name, project) {
  const assert = (await import('node:assert/strict')).default;
  const { createHash } = await import('node:crypto');
  const { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } =
    await import('node:fs/promises');
  const path = (await import('node:path')).default;
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const load = (relative) => import(pathToFileURL(path.join(project, relative)).href);
  const { prepareWindowsComponentPayloads: prepare, readWindowsComponentsLock: readLock } =
    await load('tools/test-support/windows-components.ts');
  const { zipBytes, tarBytes } = await load('services/backend/tests/archive-fixture.ts');
  const { snapshotIntegrity } = await load('services/backend/src/snapshot-integrity.ts');
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'maa verge component build-')));
  const output = path.join(root, 'dist/windows-components');
  const cache = path.join(root, 'cache');
  const lockFile = path.join(root, 'components.lock.json');
  const coreVersion = 'v6.20.1';
  const resourceVersion = 'a'.repeat(40);
  const coreMembers = [
    { name: 'MaaCore.dll', content: 'synthetic core, never loaded' },
    { name: 'resource/version.json', content: '{"last_updated":"base"}' },
    { name: 'resource/base-only.json', content: 'complete base resource' },
    { name: 'resource/shared.json', content: 'base' },
    { name: 'MaaWpfGui.exe', content: 'excluded GUI fixture' },
  ];
  const source = `MaaResource-${resourceVersion}`;
  const resourceMembers = [
    { name: `${source}/resource/version.json`, content: '{"last_updated":"overlay"}' },
    { name: `${source}/resource/shared.json`, content: 'overlay' },
    { name: `${source}/resource/overlay-only.json`, content: 'new resource' },
    { name: `${source}/LICENSE`, content: 'MaaResource license fixture' },
  ];
  const coreBytes = zipBytes(coreMembers);
  let resourceBytes = zipBytes(resourceMembers);
  const sourceCommit = 'b'.repeat(40);
  const licenseBytes = Buffer.from('MaaCore license fixture');
  const spdxBytes = Buffer.from('PackageLicenseDeclared: AGPL-3.0-only');
  const utilitiesCommit = 'c'.repeat(40);
  const utilitiesBytes = Buffer.from('MaaUtils LGPLv3 license fixture');
  const gpl3Bytes = Buffer.from('GNU GPL version 3 complete license fixture');
  const ports = [
    'opencv4',
    'maa-onnxruntime',
    'maa-fastdeploy',
    'directml-bin',
    'zlib',
    'boost-asio',
  ];
  const dependencyMembers = [
    ...ports.flatMap((port) => [
      {
        name: `./vcpkg/installed/maa-x64-windows/share/${port}/copyright`,
        content: `${port} license fixture`,
      },
      {
        name: `./vcpkg/installed/maa-x64-windows/share/${port}/vcpkg.spdx.json`,
        content: JSON.stringify({ name: port }),
      },
    ]),
    { name: './runtime/x64-windows/should-not-be-copied.dll', content: 'excluded SDK library' },
  ];
  let dependencyBytes = tarBytes(dependencyMembers);
  const metadata = (version, url, bytes) => ({
    version,
    url,
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const lock = {
    formatVersion: 1,
    platform: 'win32',
    arch: 'x64',
    core: metadata(
      coreVersion,
      `https://github.com/MaaAssistantArknights/MaaAssistantArknights/releases/download/${coreVersion}/MAA-${coreVersion}-win-x64.zip`,
      coreBytes,
    ),
    resource: {
      ...metadata(
        resourceVersion,
        `https://codeload.github.com/MaaAssistantArknights/MaaResource/zip/${resourceVersion}`,
        resourceBytes,
      ),
      coreVersion,
    },
    licenses: {
      coreVersion,
      sourceCommit,
      license: metadata(
        sourceCommit,
        `https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/${sourceCommit}/LICENSE`,
        licenseBytes,
      ),
      spdx: metadata(
        sourceCommit,
        `https://raw.githubusercontent.com/MaaAssistantArknights/MaaAssistantArknights/${sourceCommit}/LICENSE.spdx`,
        spdxBytes,
      ),
      maaUtils: metadata(
        utilitiesCommit,
        `https://raw.githubusercontent.com/MaaXYZ/MaaUtils/${utilitiesCommit}/LICENSE.md`,
        utilitiesBytes,
      ),
      gpl3: metadata('3.0', 'https://www.gnu.org/licenses/gpl-3.0.txt', gpl3Bytes),
      dependencies: metadata(
        'v2.14.1',
        'https://github.com/MaaAssistantArknights/MaaDeps/releases/download/v2.14.1/MaaDeps-x64-windows-devel.tar.xz',
        dependencyBytes,
      ),
    },
  };
  const options = {
    lockFile,
    outputDirectory: output,
    cacheDirectory: cache,
    workerPath: 'unused',
  };
  const saveLock = () => writeFile(lockFile, JSON.stringify(lock));
  const cached = async () => {
    await mkdir(cache, { recursive: true });
    await writeFile(path.join(cache, `MAA-${coreVersion}-win-x64.zip`), coreBytes);
    await writeFile(path.join(cache, `MaaResource-${resourceVersion}.zip`), resourceBytes);
    await writeFile(
      path.join(cache, `MaaAssistantArknights-${sourceCommit}-LICENSE`),
      licenseBytes,
    );
    await writeFile(
      path.join(cache, `MaaAssistantArknights-${sourceCommit}-LICENSE.spdx`),
      spdxBytes,
    );
    await writeFile(path.join(cache, `MaaUtils-${utilitiesCommit}-LICENSE.md`), utilitiesBytes);
    await writeFile(path.join(cache, 'GNU-GPL-3.0.txt'), gpl3Bytes);
    await writeFile(path.join(cache, 'MaaDeps-x64-windows-devel-v2.14.1.tar.xz'), dependencyBytes);
  };
  const requests = [];
  const validations = [];
  const dependencies = {
    log() {},
    async fetcher(url) {
      const target = String(url);
      requests.push(target);
      const bytes = new Map([
        [lock.core.url, coreBytes],
        [lock.resource.url, resourceBytes],
        [lock.licenses.license.url, licenseBytes],
        [lock.licenses.spdx.url, spdxBytes],
        [lock.licenses.maaUtils.url, utilitiesBytes],
        [lock.licenses.gpl3.url, gpl3Bytes],
        [lock.licenses.dependencies.url, dependencyBytes],
      ]).get(target);
      assert.ok(bytes, target);
      return new Response(bytes, { headers: { 'content-length': String(bytes.length) } });
    },
    async validator(core, resource, version) {
      assert.equal(version, coreVersion);
      assert.equal(await readFile(path.join(core, 'MaaCore.dll'), 'utf8'), coreMembers[0].content);
      await readFile(path.join(resource, 'resource/base-only.json'));
      validations.push([core, resource, version]);
    },
  };
  const exists = async (filename) => {
    try {
      await readFile(filename);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  };
  const clean = async () => {
    assert.equal(
      (await readdir(path.dirname(output))).some((entry) => entry.startsWith('.')),
      false,
    );
    assert.equal((await readdir(path.dirname(output))).includes('windows-components.lock'), false);
  };
  try {
    await saveLock();
    if (name === 'xz-fallback') {
      const { withDependencyTar, decodeToFile } = await load(
        'tools/test-support/dependency-tar.mjs',
      );
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const stage = path.join(root, 'decoder-stage');
      await mkdir(stage);
      const source = path.join(root, 'synthetic.tar.xz');
      await writeFile(source, Buffer.concat([Buffer.from('fd377a585a00', 'hex'), dependencyBytes]));
      let decodedCount = 0;
      const fallback = {
        platform: 'win32',
        environment: { MAAVERGE_7ZIP_PATH: process.execPath },
        async run(_program, args) {
          assert.deepEqual(args, ['--version']);
          return { stdout: 'bsdtar 3.8.9 - libarchive 3.8.9 zlib/1.2.5.f-ipp' };
        },
        async decode(program, args, destination) {
          assert.equal(program, process.execPath);
          assert.deepEqual(args, ['x', '-so', '--', source]);
          decodedCount++;
          await decodeToFile(
            process.execPath,
            [
              '--no-env-file',
              '-e',
              'process.stdout.write(require("node:fs").readFileSync(process.argv.at(-1)).subarray(6))',
              source,
            ],
            destination,
          );
        },
      };
      let temporary;
      await withDependencyTar(
        source,
        stage,
        'system-tar',
        async (input) => {
          temporary = input;
          assert.notEqual(input, source);
          assert.deepEqual(await readFile(input), dependencyBytes);
          const tar =
            process.platform === 'win32'
              ? path.join(process.env.SystemRoot || process.env.WINDIR, 'System32/tar.exe')
              : 'tar';
          const listing = await promisify(execFile)(tar, ['-tf', input], { timeout: 5_000 });
          for (const port of ports)
            for (const name of ['copyright', 'vcpkg.spdx.json'])
              assert.ok(listing.stdout.includes(`/share/${port}/${name}`));
        },
        fallback,
      );
      assert.equal(decodedCount, 1);
      assert.equal(await exists(temporary), false);
      assert.deepEqual(await readdir(stage), []);
      await assert.rejects(
        withDependencyTar(
          source,
          stage,
          'system-tar',
          async () => {
            throw new Error('synthetic consumer failure');
          },
          fallback,
        ),
        /synthetic consumer failure/,
      );
      assert.deepEqual(await readdir(stage), []);
      await withDependencyTar(
        source,
        stage,
        'system-tar',
        async (input) => {
          assert.equal(input, source);
        },
        {
          ...fallback,
          async run() {
            return { stdout: 'bsdtar 3.8.9 liblzma/5.8.1' };
          },
        },
      );
      assert.equal(decodedCount, 2);
      const plain = path.join(root, 'plain.tar.xz');
      await writeFile(plain, dependencyBytes);
      await withDependencyTar(
        plain,
        stage,
        'system-tar',
        async (input) => {
          assert.equal(input, plain);
        },
        {
          ...fallback,
          async run() {
            assert.fail('Plain TAR must not require an XZ decoder');
          },
        },
      );
      await assert.rejects(
        withDependencyTar(
          source,
          stage,
          'system-tar',
          async () => {
            assert.fail('Missing decoder must prevent consumption');
          },
          { ...fallback, environment: {} },
        ),
        /Install 7-Zip or set MAAVERGE_7ZIP_PATH/,
      );
      for (const [label, script, limits, expected] of [
        ['failure', 'process.exit(7)', {}, /decoder failed \(7\)/],
        ['oversized', 'process.stdout.write(Buffer.alloc(32))', { maxBytes: 16 }, /size limit/],
        ['timeout', 'setInterval(() => {}, 1000)', { timeoutMs: 100 }, /time limit/],
      ]) {
        await assert.rejects(
          decodeToFile(
            process.execPath,
            ['--no-env-file', '-e', script],
            path.join(stage, label),
            limits,
          ),
          expected,
        );
      }
      await assert.rejects(
        withDependencyTar(source, stage, 'system-tar', async () => {}, {
          ...fallback,
          async decode() {
            throw new Error('synthetic decoder failure');
          },
        }),
        /synthetic decoder failure/,
      );
      assert.equal(
        (await readdir(stage)).some((entry) => entry.startsWith('.dependency-tar-')),
        false,
      );
      return;
    }
    if (name === 'path-shadow') {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const shadow = path.join(root, 'shadow');
      const systemRoot = process.env.SystemRoot || process.env.WINDIR;
      assert.ok(systemRoot);
      await mkdir(shadow);
      // A valid PE with incompatible tar flags makes a PATH lookup fail visibly.
      await copyFile(path.join(systemRoot, 'System32/where.exe'), path.join(shadow, 'tar.exe'));
      process.env.PATH = shadow + path.delimiter + process.env.PATH;
      // Verify the child-process resolver actually selects the shadow executable.
      await promisify(execFile)('tar.exe', ['/q', 'tar.exe'], {
        windowsHide: true,
        timeout: 5_000,
      });
      await cached();
      await prepare(options, dependencies);
      assert.equal(
        await readFile(path.join(output, 'core/licenses/MaaDeps/opencv4/copyright'), 'utf8'),
        'opencv4 license fixture',
      );
      await clean();
      return;
    }
    if (name === 'lock') {
      const official = await readLock(path.join(project, 'tools/windows-components.lock.json'));
      assert.equal(official.core.version, official.resource.coreVersion);
      assert.equal(official.platform, 'win32');
      const good = structuredClone(lock);
      for (const mutate of [
        (value) => (value.platform = 'linux'),
        (value) => (value.arch = 'arm64'),
        (value) => (value.core.size = 0),
        (value) => (value.core.size = 2 * 1024 ** 3 + 1),
        (value) => (value.core.sha256 = 'invalid'),
        (value) => (value.core.version = '../v6.20.1'),
        (value) => (value.core.url = value.core.url.replace('https:', 'http:')),
        (value) => (value.resource.version = 'main'),
        (value) => (value.resource.coreVersion = 'v6.20.0'),
        (value) => (value.resource.url += '?mutable=1'),
        (value) => (value.licenses.coreVersion = 'v6.20.0'),
        (value) => (value.licenses.sourceCommit = 'main'),
        (value) => (value.licenses.license.sha256 = 'invalid'),
        (value) => (value.licenses.license.url += '?unlocked=1'),
        (value) => (value.licenses.spdx.version = 'c'.repeat(40)),
        (value) => (value.licenses.maaUtils.version = 'main'),
        (value) => (value.licenses.maaUtils.url += '?mutable=1'),
        (value) => (value.licenses.gpl3.url = 'https://example.invalid/gpl-3.0.txt'),
        (value) => (value.licenses.dependencies.url = 'https://example.invalid/notices.tar.xz'),
      ]) {
        const invalid = structuredClone(good);
        mutate(invalid);
        await writeFile(lockFile, JSON.stringify(invalid));
        await assert.rejects(readLock(lockFile), /lock is invalid/);
      }
      assert.deepEqual(requests, []);
      return;
    }
    if (name === 'prepare') {
      assert.equal(await prepare(options, dependencies), output);
      assert.deepEqual(requests, [
        lock.core.url,
        lock.resource.url,
        lock.licenses.license.url,
        lock.licenses.spdx.url,
        lock.licenses.maaUtils.url,
        lock.licenses.gpl3.url,
        lock.licenses.dependencies.url,
      ]);
      assert.equal(validations.length, 2);
      assert.equal(validations[0][0], validations[0][1]);
      assert.notEqual(validations[1][0], validations[1][1]);
      const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
      assert.equal(manifest.core.version, coreVersion);
      assert.equal(manifest.resource.version, resourceVersion);
      for (const channel of ['core', 'resource'])
        assert.equal(
          manifest[channel].installedHash,
          (await snapshotIntegrity(path.join(output, channel))).installedHash,
        );
      assert.equal(await exists(path.join(output, 'core/MaaWpfGui.exe')), false);
      assert.equal(
        await readFile(path.join(output, 'resource/resource/shared.json'), 'utf8'),
        'overlay',
      );
      assert.equal(
        await readFile(path.join(output, 'resource/resource/base-only.json'), 'utf8'),
        'complete base resource',
      );
      assert.equal(
        await readFile(path.join(output, 'resource/licenses/MaaResource/LICENSE'), 'utf8'),
        'MaaResource license fixture',
      );
      for (const channel of ['core', 'resource']) {
        assert.equal(
          await readFile(path.join(output, channel, 'licenses/MaaUtils/LICENSE.md'), 'utf8'),
          utilitiesBytes.toString(),
        );
        assert.equal(
          await readFile(path.join(output, channel, 'licenses/MaaUtils/GPL-3.0.txt'), 'utf8'),
          gpl3Bytes.toString(),
        );
        assert.equal(
          await readFile(
            path.join(output, channel, 'licenses/MaaAssistantArknights/LICENSE'),
            'utf8',
          ),
          licenseBytes.toString(),
        );
        assert.equal(
          await readFile(
            path.join(output, channel, 'licenses/MaaDeps/maa-onnxruntime/copyright'),
            'utf8',
          ),
          'maa-onnxruntime license fixture',
        );
        assert.deepEqual(
          JSON.parse(await readFile(path.join(output, channel, 'licenses/sources.json'), 'utf8')),
          lock,
        );
        assert.equal(
          await exists(
            path.join(
              output,
              channel,
              'licenses/MaaDeps/runtime/x64-windows/should-not-be-copied.dll',
            ),
          ),
          false,
        );
      }
      await clean();
      return;
    }
    await cached();
    if (name === 'corrupt-license') {
      for (const [filename, bytes] of [
        [`MaaAssistantArknights-${sourceCommit}-LICENSE`, licenseBytes],
        [`MaaUtils-${utilitiesCommit}-LICENSE.md`, utilitiesBytes],
        ['GNU-GPL-3.0.txt', gpl3Bytes],
      ]) {
        await cached();
        await writeFile(path.join(cache, filename), Buffer.alloc(bytes.length));
        await assert.rejects(prepare(options, dependencies), /locked SHA-256/);
        await clean();
      }
      assert.equal(validations.length, 0);
      assert.equal(await exists(path.join(output, 'manifest.json')), false);
      assert.deepEqual(requests, []);
      await clean();
      return;
    }
    if (name === 'dependency-incomplete' || name === 'dependency-link') {
      const required = './vcpkg/installed/maa-x64-windows/share/maa-onnxruntime/copyright';
      const members = dependencyMembers.filter((member) => member.name !== required);
      if (name === 'dependency-link') members.push({ name: required, link: 'vcpkg.spdx.json' });
      dependencyBytes = tarBytes(members);
      Object.assign(
        lock.licenses.dependencies,
        metadata('v2.14.1', lock.licenses.dependencies.url, dependencyBytes),
      );
      await saveLock();
      await cached();
      await assert.rejects(prepare(options, dependencies));
      assert.equal(await exists(path.join(output, 'manifest.json')), false);
      assert.deepEqual(requests, []);
      await clean();
      return;
    }
    if (name === 'replace') {
      await prepare(options, dependencies);
      const previous = await readFile(path.join(output, 'manifest.json'), 'utf8');
      await writeFile(path.join(output, 'keep-until-success'), 'previous build');
      await assert.rejects(
        prepare(options, {
          ...dependencies,
          validator() {
            throw new Error('synthetic validation failed');
          },
        }),
        /synthetic validation failed/,
      );
      assert.equal(await readFile(path.join(output, 'manifest.json'), 'utf8'), previous);
      assert.equal(
        await readFile(path.join(output, 'keep-until-success'), 'utf8'),
        'previous build',
      );
      await clean();
      await prepare(options, dependencies);
      assert.equal(await exists(path.join(output, 'keep-until-success')), false);
      assert.equal(await readFile(path.join(output, 'manifest.json'), 'utf8'), previous);
      assert.deepEqual(requests, [], 'verified cache must not use the network');
      await clean();
      return;
    }
    if (name === 'publish-rollback' || name === 'retain-backup') {
      await prepare(options, dependencies);
      const previous = await readFile(path.join(output, 'manifest.json'), 'utf8');
      await writeFile(path.join(output, 'previous-build'), 'recoverable payload');
      await assert.rejects(
        prepare(options, {
          ...dependencies,
          async rename(from, to) {
            if (to === output && path.basename(from).includes('-stage-'))
              throw new Error('synthetic publishing failure');
            if (
              name === 'retain-backup' &&
              to === output &&
              path.basename(from).includes('-backup-')
            )
              throw new Error('synthetic restoration failure');
            await rename(from, to);
          },
        }),
        (error) => {
          if (name === 'publish-rollback')
            assert.match(error.message, /synthetic publishing failure/);
          else {
            assert.ok(error instanceof AggregateError);
            assert.match(error.message, /previous payload retained at/);
            assert.deepEqual(
              error.errors.map((cause) => cause.message),
              ['synthetic publishing failure', 'synthetic restoration failure'],
            );
          }
          return true;
        },
      );
      if (name === 'publish-rollback') {
        assert.equal(await readFile(path.join(output, 'manifest.json'), 'utf8'), previous);
        assert.equal(
          await readFile(path.join(output, 'previous-build'), 'utf8'),
          'recoverable payload',
        );
        await clean();
      } else {
        const entries = await readdir(path.dirname(output));
        const backups = entries.filter((entry) => entry.startsWith('.windows-components-backup-'));
        assert.equal(backups.length, 1);
        assert.equal(
          entries.some((entry) => entry.startsWith('.windows-components-stage-')),
          false,
        );
        assert.equal(entries.includes('windows-components.lock'), false);
        assert.equal(await exists(path.join(output, 'manifest.json')), false);
        const backup = path.join(path.dirname(output), backups[0]);
        assert.equal(await readFile(path.join(backup, 'manifest.json'), 'utf8'), previous);
        assert.equal(
          await readFile(path.join(backup, 'previous-build'), 'utf8'),
          'recoverable payload',
        );
        await prepare(options, dependencies);
        assert.equal(
          await readFile(path.join(backup, 'previous-build'), 'utf8'),
          'recoverable payload',
        );
      }
      assert.deepEqual(requests, []);
      return;
    }
    if (name === 'corrupt-cache') {
      const filename = path.join(cache, `MAA-${coreVersion}-win-x64.zip`);
      for (const bytes of [Buffer.alloc(coreBytes.length), Buffer.from('wrong size')]) {
        await writeFile(filename, bytes);
        await assert.rejects(prepare(options, dependencies), /locked (?:size|SHA-256)/);
        assert.equal(await exists(path.join(output, 'manifest.json')), false);
        await clean();
      }
      assert.deepEqual(requests, [], 'corrupt existing cache must fail before contacting a source');
      return;
    }
    if (name === 'corrupt-download') {
      await rm(cache, { recursive: true });
      await assert.rejects(
        prepare(options, {
          ...dependencies,
          async fetcher() {
            return new Response(Buffer.alloc(coreBytes.length), {
              headers: { 'content-length': String(coreBytes.length) },
            });
          },
        }),
        /SHA-256|摘要|校验/,
      );
      assert.equal(validations.length, 0);
      assert.equal(await exists(path.join(output, 'manifest.json')), false);
      await clean();
      return;
    }
    if (name === 'lease') {
      let entered;
      const started = new Promise((resolve) => (entered = resolve));
      let release;
      const gate = new Promise((resolve) => (release = resolve));
      const first = prepare(options, {
        ...dependencies,
        async validator(...args) {
          entered();
          await gate;
          await dependencies.validator(...args);
        },
      });
      try {
        await started;
        await assert.rejects(prepare(options, dependencies), { code: 'EEXIST' });
        assert.ok((await readdir(path.dirname(output))).includes('windows-components.lock'));
      } finally {
        release();
        await first;
      }
      await clean();
      return;
    }
    if (name === 'arbitrary-output') {
      await mkdir(output, { recursive: true });
      await writeFile(path.join(output, 'valuable-file'), 'not generated output');
      await assert.rejects(prepare(options, dependencies));
      assert.equal(
        await readFile(path.join(output, 'valuable-file'), 'utf8'),
        'not generated output',
      );
      await clean();
      return;
    }
    if (name === 'links') {
      const actual = path.join(root, 'actual');
      await mkdir(actual);
      await writeFile(path.join(actual, 'valuable-file'), 'untouched');
      await symlink(
        actual,
        path.dirname(output),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      await assert.rejects(prepare(options, dependencies), /filesystem links/);
      assert.equal(await readFile(path.join(actual, 'valuable-file'), 'utf8'), 'untouched');
      assert.deepEqual(await readdir(actual), ['valuable-file']);
      return;
    }
    if (name === 'licenses') {
      resourceBytes = zipBytes(
        resourceMembers.filter((member) => !member.name.endsWith('/LICENSE')),
      );
      Object.assign(lock.resource, metadata(resourceVersion, lock.resource.url, resourceBytes));
      await saveLock();
      await cached();
      await assert.rejects(prepare(options, dependencies), /ENOENT|license is missing/);
      assert.equal(await exists(path.join(output, 'manifest.json')), false);
      await clean();
      return;
    }
    throw new Error(`Unknown scenario: ${name}`);
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}

for (const [name, description] of [
  ['lock', 'component lock accepts only compatible immutable official Windows sources'],
  [
    'xz-fallback',
    'XZ fallback uses bounded decoder output only when system tar lacks liblzma and cleans its temporary TAR',
  ],
  ['path-shadow', 'Windows dependency notices use the system tar despite a valid PATH shadow'],
  [
    'prepare',
    'preparation downloads verified archives, preserves full resources and licenses, and records payload integrity',
  ],
  [
    'replace',
    'verified cache is reused and failed validation preserves the previous payload before atomic replacement',
  ],
  [
    'publish-rollback',
    'failed publication restores the previous payload and releases its build lease',
  ],
  [
    'retain-backup',
    'failed publication and restoration retain the complete backup for recovery and release the build lease',
  ],
  [
    'corrupt-cache',
    'corrupt cache is rejected without network, publishing a payload or retaining build locks',
  ],
  ['corrupt-download', 'incorrect downloaded bytes never reach extraction or native validation'],
  [
    'corrupt-license',
    'the exact pinned source license must pass integrity checks before publishing native payloads',
  ],
  [
    'dependency-incomplete',
    'missing notices for a required native dependency prevent publishing payloads',
  ],
  ['dependency-link', 'archive links cannot be adopted as native dependency license files'],
  ['lease', 'concurrent preparations cannot steal the active build lease'],
  ['arbitrary-output', 'an unrelated existing output directory is preserved'],
  ['links', 'filesystem aliases are rejected before writing through the build parent'],
  ['licenses', 'a missing official resource license prevents publishing the payload'],
]) {
  test(
    description,
    { timeout: 30_000, skip: name === 'path-shadow' && process.platform !== 'win32' },
    async () => {
      const source = `await (${scenario.toString()})(${JSON.stringify(name)}, ${JSON.stringify(project)});`;
      const result = await execute(
        await ensureBun({ download: false }),
        ['--no-env-file', '-e', source],
        {
          cwd: project,
          env: offlineAgentEnvironment(),
          windowsHide: true,
          timeout: 25_000,
          maxBuffer: 1024 * 1024,
        },
      ).catch((error) => {
        throw new Error(error.stderr || error.message);
      });
      assert.equal(result.stderr, '');
    },
  );
}

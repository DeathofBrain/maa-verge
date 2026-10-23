import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { archiveFile, aria2Assets, aria2BuildArguments, aria2RecipeSha256, aria2Target, ensureAria2, readAria2BuildInfo, sqlitePublicDomainNotice, unpackSource, validateAria2Version, verifyAria2Asset } from '../setup-aria2.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const supported = 'aria2 version 1.37.0\nEnabled Features: HTTPS, Message Digest\nHash Algorithms: sha-1, sha-256\n';
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'maa verge aria2 setup-'));
  t.after(() => {
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function gitTar() {
  if (process.platform !== 'win32') return undefined;
  const result = spawnSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (result.error || result.status !== 0) return undefined;
  const program = path.resolve(result.stdout.trim(), '../../../usr/bin/tar.exe');
  return existsSync(program) ? program : undefined;
}
function tarPrograms() {
  const gnu = gitTar();
  return gnu ? ['tar', gnu] : ['tar'];
}
function createArchive(program, root, name, members, zip = false) {
  const result = spawnSync(program, [...(zip ? ['-a'] : []), '-cf', `./${name}`, '-C', './source', ...members], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return path.join(root, name);
}
function buildFixture(t) {
  const projectRoot = fixture(t), directory = path.join(projectRoot, '.tools/aria2');
  mkdirSync(path.join(directory, 'licenses/sources'), { recursive: true });
  const bytes = Buffer.from('source fixture');
  writeFileSync(path.join(directory, 'licenses/sources/aria2.tar.xz'), bytes);
  const info = { version: '1.37.0', target: 'darwin/arm64', recipeSha256: aria2RecipeSha256, sources: [{ name: aria2Assets.aria2.name, url: aria2Assets.aria2.url, sha256: aria2Assets.aria2.sha256 }], notices: [{ name: 'sources/aria2.tar.xz', sha256: sha256(bytes) }] };
  const save = () => writeFileSync(path.join(directory, 'build-info.json'), JSON.stringify(info));
  save();
  return { projectRoot, directory, info, save };
}

test('supports exactly the four desktop targets and rejects unsupported bootstraps before network', async (t) => {
  for (const [platform, arch] of [['win32', 'x64'], ['linux', 'x64'], ['darwin', 'x64'], ['darwin', 'arm64']]) assert.equal(aria2Target(platform, arch), `${platform}/${arch}`);
  await assert.rejects(ensureAria2({ projectRoot: fixture(t), platform: 'linux', arch: 'arm64', fetcher: () => assert.fail('must not fetch') }), /Unsupported aria2 target/);
});

test('rejects a different aria2 release, missing HTTPS or missing SHA-256', () => {
  assert.equal(validateAria2Version(supported), supported);
  assert.equal(validateAria2Version(supported.replaceAll('\n', '\r\n')).includes('HTTPS'), true);
  for (const invalid of [supported.replace('1.37.0', '1.36.0'), supported.replace('HTTPS', 'SFTP'), supported.replace('sha-256', 'sha-512')]) assert.throws(() => validateAria2Version(invalid), /Expected aria2|must support/);
});

test('does not trust a downloaded or cached asset with the wrong digest', async (t) => {
  assert.throws(() => verifyAria2Asset(Buffer.from('wrong archive'), aria2Assets.aria2), /SHA-256 mismatch/);
  const projectRoot = fixture(t);
  mkdirSync(path.join(projectRoot, '.tools/aria2-downloads'), { recursive: true });
  writeFileSync(path.join(projectRoot, '.tools/aria2-downloads', aria2Assets.aria2.name), 'corrupt cached archive');
  await assert.rejects(ensureAria2({ projectRoot, platform: 'win32', arch: 'x64', fetcher: () => assert.fail('must not fetch'), execute: () => assert.fail('must not execute') }), /SHA-256 mismatch/);
  await assert.rejects(ensureAria2({ projectRoot: fixture(t), platform: 'win32', arch: 'x64', fetcher: async () => new Response('wrong download'), execute: () => assert.fail('must not execute') }), /SHA-256 mismatch/);
});

test('check mode cannot download missing tools or fall back to a PATH executable', async (t) => {
  await assert.rejects(ensureAria2({ download: false, projectRoot: fixture(t), fetcher: () => assert.fail('must not fetch'), execute: () => assert.fail('must not run PATH aria2c') }), /Pinned aria2 is missing/);
});

test('rejects failed HTTP downloads and redirects outside HTTPS', async (t) => {
  for (const response of [new Response('', { status: 503 }), { ok: true, url: 'http://example.invalid/insecure', body: [] }]) {
    await assert.rejects(ensureAria2({ projectRoot: fixture(t), platform: 'win32', arch: 'x64', fetcher: async () => response }), /HTTP 503|outside HTTPS/);
  }
});

test('Linux links exact static TLS archives and preserves the system certificate store', () => {
  const args = aria2BuildArguments('linux', '/fixture/openssl');
  assert.ok(args.includes('--with-openssl'));
  assert.ok(args.includes('--with-ca-bundle=/etc/ssl/certs/ca-certificates.crt'));
  assert.ok(args.some(arg => arg.includes('/fixture/openssl/lib/libssl.a') && arg.includes('/fixture/openssl/lib/libcrypto.a')));
  assert.ok(args.some(arg => arg.includes('-static-libstdc++') && arg.includes('-static-libgcc')));
  assert.ok(aria2BuildArguments('darwin').includes('--with-appletls'));
  assert.ok(aria2BuildArguments('darwin').includes('--without-openssl'));
});

test('preserves the complete SQLite copyright disclaimer instead of truncating fixed bytes', () => {
  const comment = '/*\nThe author disclaims copyright to this source code.\nMay you share freely, never taking more than you give.\n*/';
  assert.equal(sqlitePublicDomainNotice(Buffer.from('/* amalgamation header */\n' + comment + '\nint source;')).toString(), comment + '\n');
  assert.throws(() => sqlitePublicDomainNotice(Buffer.from('not a copyright disclaimer')), /Missing SQLite/);
});

test('invalidates cached recipe, source identities, and damaged or escaping notices', (t) => {
  const f = buildFixture(t);
  assert.equal(readAria2BuildInfo(f.directory).version, '1.37.0');
  f.info.recipeSha256 = '0'.repeat(64); f.save();
  assert.throws(() => readAria2BuildInfo(f.directory), /recipe\/source mismatch/);
  f.info.recipeSha256 = aria2RecipeSha256; f.info.sources[0].sha256 = '0'.repeat(64); f.save();
  assert.throws(() => readAria2BuildInfo(f.directory), /recipe\/source mismatch/);
  f.info.sources[0].sha256 = aria2Assets.aria2.sha256; f.info.notices[0].name = '../outside'; f.save();
  assert.throws(() => readAria2BuildInfo(f.directory), /Invalid aria2 notice path/);
  f.info.notices[0].name = 'sources/aria2.tar.xz'; f.save();
  writeFileSync(path.join(f.directory, 'licenses/sources/aria2.tar.xz'), 'damaged source');
  assert.throws(() => readAria2BuildInfo(f.directory), /notice checksum mismatch/);
});

test('refuses to execute a cached executable that differs from recorded build output', async (t) => {
  const f = buildFixture(t);
  f.info.executableSha256 = sha256('expected binary'); f.save();
  writeFileSync(path.join(f.directory, 'aria2c'), 'modified binary');
  await assert.rejects(ensureAria2({ projectRoot: f.projectRoot, platform: 'darwin', arch: 'arm64', execute: () => assert.fail('must not execute corrupted tool'), fetcher: () => assert.fail('must not silently fetch replacement') }), /checksum\/target mismatch/);
});

test('real tar reads exact binary members from local archives with spaces and colon paths', (t) => {
  for (const program of tarPrograms()) {
    const root = fixture(t), member = `${aria2Assets.windows.root}/aria2c.exe`;
    const expected = Buffer.from(Array.from({ length: 256 }, (_, index) => index));
    mkdirSync(path.join(root, 'source', aria2Assets.windows.root), { recursive: true });
    writeFileSync(path.join(root, 'source', member), expected);
    const name = process.platform === 'win32' ? 'aria2 binary fixture.tar' : 'aria2:binary fixture.tar';
    const archive = createArchive(program, root, name, [member]);
    const execute = (_program, args, options) => spawnSync(program, args, { ...options, timeout: 10000 });
    const actual = archiveFile(execute, archive, member);
    assert.ok(Buffer.isBuffer(actual));
    assert.deepEqual(actual, expected);
    assert.equal(verifyAria2Asset(actual, { name, sha256: sha256(expected) }), actual);
    assert.throws(() => archiveFile(execute, archive, 'missing-member'), /aria2 setup failed/);
    t.diagnostic(`Verified binary extraction using ${program}`);
  }
});

test('real tar source extraction preserves bytes and rejects foreign archive roots', (t) => {
  for (const program of tarPrograms()) {
    const root = fixture(t), asset = aria2Assets.aria2, member = `${asset.root}/COPYING`;
    mkdirSync(path.join(root, 'source', asset.root), { recursive: true });
    writeFileSync(path.join(root, 'source', member), 'complete source notice\n');
    const name = process.platform === 'win32' ? 'aria2 source fixture.tar' : 'aria2:source fixture.tar';
    const archive = createArchive(program, root, name, [member]);
    const output = path.join(root, 'source output');
    mkdirSync(output);
    const execute = (_program, args, options) => spawnSync(program, args, { ...options, timeout: 10000 });
    assert.equal(unpackSource(execute, archive, output, asset), path.join(output, asset.root));
    assert.equal(readFileSync(path.join(output, member), 'utf8'), 'complete source notice\n');
    mkdirSync(path.join(root, 'source', 'unexpected'));
    writeFileSync(path.join(root, 'source', 'unexpected/file'), 'must not extract');
    const unsafe = createArchive(program, root, 'foreign-root.tar', ['unexpected/file']);
    assert.throws(() => unpackSource(execute, unsafe, output, asset), /Unsafe aria2 source archive paths/);
    assert.equal(existsSync(path.join(output, 'unexpected')), false);
  }
});

test('archive read failures identify the archive, member and command error', () => {
  const failure = new Error('spawnSync tar ETIMEDOUT');
  assert.throws(() => archiveFile(() => ({ error: failure }), 'source archive.tar.xz', 'source/COPYING'), (error) => {
    assert.ok(error.message.includes('source archive.tar.xz'));
    assert.ok(error.message.includes('source/COPYING'));
    assert.ok(error.message.includes(failure.message));
    assert.ok(error.cause.message.includes('aria2 setup failed'));
    return true;
  });
});

test('Windows ZIP and compressed tar members use system libarchive with Git GNU tools first in PATH', { skip: process.platform !== 'win32' }, (t) => {
  const root = fixture(t), member = `${aria2Assets.windows.root}/aria2c.exe`;
  const expected = Buffer.from([0, 255, 128, 13, 10, 1, 254]);
  mkdirSync(path.join(root, 'source', aria2Assets.windows.root), { recursive: true });
  writeFileSync(path.join(root, 'source', member), expected);
  const systemTar = path.join(process.env.SystemRoot || process.env.WINDIR, 'System32', 'tar.exe');
  const gnu = gitTar();
  const execute = (program, args, options) => {
    assert.equal(program, systemTar);
    const env = { ...options.env };
    const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
    if (gnu) env[pathKey] = path.dirname(gnu) + path.delimiter + env[pathKey];
    return spawnSync(program, args, { ...options, env, timeout: 10000 });
  };
  for (const extension of ['zip', 'tar.gz', 'tar.bz2', 'tar.xz']) {
    const archive = createArchive(systemTar, root, `aria2 binary fixture.${extension}`, [member], true);
    assert.deepEqual(archiveFile(execute, archive, member), expected);
    assert.throws(() => archiveFile(execute, archive, 'missing/member'), (error) => {
      assert.ok(error.message.includes(path.basename(archive)));
      assert.ok(error.message.includes('missing/member'));
      return true;
    });
    t.diagnostic(`Verified Windows system libarchive extraction of ${extension}`);
  }
});

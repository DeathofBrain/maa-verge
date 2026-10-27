import { expect, test } from 'bun:test';
import { createDownloadProxyResolver, ProxyConfigurationError } from '../src/network-proxy';

const target = 'https://github.com/MaaAssistantArknights/MaaResource/archive.zip';
const settings = (patch: Record<string, unknown> = {}) =>
  JSON.stringify({
    ProxyEnable: 1,
    ProxyServer: '127.0.0.1:17890',
    ProxyOverride: '',
    ...patch,
  });
function windows(patch: Record<string, unknown> = {}, environment: Record<string, string> = {}) {
  return createDownloadProxyResolver({
    platform: 'win32',
    environment,
    readSystemProxy: async () => settings(patch),
  });
}
const macSettings = (lines = '') => `<dictionary> {
  HTTPEnable : 1
  HTTPProxy : 127.0.0.1
  HTTPPort : 17890
  HTTPSEnable : 1
  HTTPSProxy : 127.0.0.2
  HTTPSPort : 17891
${lines}
}`;
function mac(output: string) {
  return createDownloadProxyResolver({
    platform: 'darwin',
    environment: {},
    readSystemProxy: async () => output,
  });
}

test('a configured environment proxy takes priority without reading desktop settings', async () => {
  let reads = 0;
  for (const environment of [
    { https_proxy: 'http://localhost:17890' },
    { HTTPS_PROXY: 'https://localhost:17891' },
    { all_proxy: 'http://localhost:17892' },
    { ALL_PROXY: 'localhost:17893' },
  ]) {
    const resolve = createDownloadProxyResolver({
      platform: 'win32',
      environment,
      readSystemProxy: async () => {
        reads++;
        throw new Error('must not read');
      },
    });
    const configured = Object.values(environment)[0]!;
    expect(await resolve(target)).toBe(
      new URL(configured.includes('://') ? configured : 'http://' + configured).href,
    );
  }
  expect(reads).toBe(0);
});

test('environment precedence follows Bun lowercase, uppercase, protocol, then ALL_PROXY', async () => {
  const resolve = (environment: Record<string, string>) => windows({}, environment)(target);
  await expect(
    resolve({
      https_proxy: 'http://localhost:17890',
      HTTPS_PROXY: 'socks5://secret:private@localhost:17891',
    }),
  ).resolves.toBe('http://localhost:17890/');
  await expect(
    resolve({
      https_proxy: '',
      HTTPS_PROXY: 'http://localhost:17890',
      ALL_PROXY: 'socks5://localhost:17891',
    }),
  ).resolves.toBe('http://localhost:17890/');
  await expect(
    resolve({ https_proxy: 'socks5://localhost:17890', HTTPS_PROXY: 'http://localhost:17891' }),
  ).rejects.toThrow('HTTP CONNECT');
  await expect(
    resolve({ all_proxy: 'socks5://localhost:17890', ALL_PROXY: 'http://localhost:17891' }),
  ).rejects.toThrow('HTTP CONNECT');
  expect(await resolve({ HTTP_PROXY: 'http://localhost:17892' })).toBe('http://127.0.0.1:17890/');
  expect(await windows({}, { http_proxy: 'http://localhost:17892' })('http://example.test')).toBe(
    'http://localhost:17892/',
  );
});

test('NO_PROXY wildcard forces direct while other NO_PROXY rules remain Bun responsibility', async () => {
  for (const environment of [
    { NO_PROXY: '*' },
    { no_proxy: 'example.test, *' },
    { no_proxy: '', NO_PROXY: '*' },
  ]) {
    const resolve = createDownloadProxyResolver({
      platform: 'win32',
      environment,
      readSystemProxy: async () => {
        throw new Error('wildcard must not query PAC settings');
      },
    });
    expect(await resolve(target)).toBe('');
  }
  expect(await windows({}, { no_proxy: 'example.test', NO_PROXY: '*' })(target)).toBe(
    'http://127.0.0.1:17890/',
  );
  // Explicit proxy URLs still respect Bun's full NO_PROXY implementation, including
  // CIDR and per-port rules, when the caller uses fetch's default respectNoProxy.
  expect(await windows({}, { NO_PROXY: 'github.com,127.0.0.0/8' })(target)).toBe(
    'http://127.0.0.1:17890/',
  );
});

test('Windows reads enabled settings and ignores stale disabled proxy addresses', async () => {
  expect(await windows()(target)).toBe('http://127.0.0.1:17890/');
  expect(
    await windows({ ProxyEnable: 0, ProxyServer: 'socks5://localhost:1080' })(target),
  ).toBeUndefined();
  expect(await windows({ ProxyEnable: false })(target)).toBeUndefined();
  await expect(windows({ ProxyEnable: 2 })(target)).rejects.toThrow('代理设置无效');
});

test('Windows protocol lists describe target protocols rather than TLS to the proxy', async () => {
  const resolve = windows({
    ProxyServer: 'http=127.0.0.1:17890; https=127.0.0.2:17891; socks=127.0.0.3:17892',
  });
  expect(await resolve(target)).toBe('http://127.0.0.2:17891/');
  expect(await resolve('http://example.test')).toBe('http://127.0.0.1:17890/');
  expect(await windows({ ProxyServer: 'https=https://localhost:17891' })(target)).toBe(
    'https://localhost:17891/',
  );
  expect(await windows({ ProxyServer: 'http=localhost:17890' })(target)).toBe('');
  expect(await windows({ ProxyServer: '[::1]:17890' })(target)).toBe('http://[::1]:17890/');
  expect(await windows({ ProxyServer: 'localhost:80' })(target)).toBe('http://localhost/');
});

test('Windows never guesses absent ports or turns invalid or SOCKS-only settings into direct', async () => {
  for (const ProxyServer of [
    '',
    'localhost',
    'http://localhost',
    'localhost:0',
    'localhost:65536',
    'https=localhost',
    'http=localhost:123;http=localhost:456',
    'not an address:123',
  ]) {
    await expect(windows({ ProxyServer })(target)).rejects.toThrow('代理设置无效');
  }
  for (const ProxyServer of [
    'socks=localhost:1080',
    'socks5://localhost:1080',
    'http=localhost:123;socks=localhost:1080',
  ]) {
    await expect(windows({ ProxyServer })(target)).rejects.toThrow('HTTP CONNECT');
  }
});

test('Windows explicit PAC needs a diagnostic while manual proxies override auto-detection', async () => {
  for (const patch of [
    { ProxyEnable: 0, AutoConfigURL: 'https://pac.test/settings.pac' },
    { ProxyEnable: 0, AutoConfigEnabled: true },
  ]) {
    await expect(windows(patch)(target)).rejects.toBeInstanceOf(ProxyConfigurationError);
  }
  expect(await windows({ ProxyEnable: 0, AutoDetect: true })(target)).toBe('');
  expect(await windows({ AutoDetect: true, AutoConfigEnabled: true })(target)).toBe(
    'http://127.0.0.1:17890/',
  );
  expect(
    await windows({ AutoConfigURL: 'https://stale.test/config.pac', AutoConfigEnabled: false })(
      target,
    ),
  ).toBe('http://127.0.0.1:17890/');
});

test('Windows bypass rules match local names, wildcards, ports and exact hosts', async () => {
  const resolve = windows({
    ProxyOverride: '<local>;*.internal.test;github.com:443;127.0.0.*;[::1]',
  });
  for (const address of [
    target,
    'https://buildserver/file',
    'https://a.internal.test/file',
    'https://127.0.0.1/file',
    'https://[::1]/file',
  ])
    expect(await resolve(address)).toBe('');
  for (const address of [
    'https://github.com:444/file',
    'https://github.com.evil.test/file',
    'https://internal.test.evil.test/file',
  ])
    expect(await resolve(address)).toBe('http://127.0.0.1:17890/');
  expect(await windows({ ProxyOverride: 'http://github.com' })(target)).toBe(
    'http://127.0.0.1:17890/',
  );
  expect(await windows({ ProxyOverride: '*' })(target)).toBe('');
});

test('macOS maps separate HTTP and HTTPS destinations to ordinary HTTP proxies', async () => {
  const resolve = mac(macSettings());
  expect(await resolve(target)).toBe('http://127.0.0.2:17891/');
  expect(await resolve('http://example.test')).toBe('http://127.0.0.1:17890/');
  expect(await mac('<dictionary> {\n  HTTPSEnable : 0\n}')(target)).toBeUndefined();
  expect(await mac('<dictionary> {\n}')(target)).toBeUndefined();
  expect(
    await mac('<dictionary> {\n HTTPSEnable : 1\n HTTPSProxy : ::1\n HTTPSPort : 17890\n}')(target),
  ).toBe('http://[::1]:17890/');
});

test('macOS exceptions support simple hosts, host globs, exact IPs and IPv4 CIDR', async () => {
  const resolve = mac(
    macSettings(`  ExcludeSimpleHostnames : 1
  ExceptionsList : <array> {
    0 : *.internal.test
    1 : github.com
    2 : 169.254/16
    3 : 10.0.0.0/8
    4 : ::1
  }`),
  );
  for (const address of [
    target,
    'https://localserver',
    'https://a.internal.test',
    'https://169.254.10.5',
    'https://10.10.10.10',
    'https://[::1]',
  ])
    expect(await resolve(address)).toBe('');
  for (const address of ['https://github.com.evil.test', 'https://169.253.0.1', 'https://11.0.0.1'])
    expect(await resolve(address)).toBe('http://127.0.0.2:17891/');
});

test('macOS default-route proxy settings are not replaced by nested interface settings', async () => {
  const resolve = mac(
    macSettings(`  __SCOPED__ : <dictionary> {
    utun1 : <dictionary> {
      HTTPSEnable : 1
      HTTPSProxy : scoped.invalid
      HTTPSPort : 17892
      ExceptionsList : <array> {
        0 : github.com
      }
    }
  }`),
  );
  expect(await resolve(target)).toBe('http://127.0.0.2:17891/');
});

test('macOS rejects automatic proxy, SOCKS-only and malformed active settings', async () => {
  await expect(mac('<dictionary> {\n ProxyAutoConfigEnable : 1\n}')(target)).rejects.toThrow(
    'PAC/WPAD',
  );
  expect(await mac('<dictionary> {\n ProxyAutoDiscoveryEnable : 1\n}')(target)).toBe('');
  expect(
    await mac(macSettings('  ProxyAutoDiscoveryEnable : 1\n ProxyAutoConfigEnable : 1'))(target),
  ).toBe('http://127.0.0.2:17891/');
  await expect(mac('<dictionary> {\n SOCKSEnable : 1\n}')(target)).rejects.toThrow('HTTP CONNECT');
  for (const output of [
    '',
    'not scutil output',
    '<dictionary> {\n HTTPSEnable : 2\n}',
    '<dictionary> {\n HTTPSEnable : 1\n HTTPSProxy : localhost\n}',
    '<dictionary> {\n HTTPSEnable : 1\n HTTPSProxy : localhost\n HTTPSPort : 0\n}',
    macSettings('  HTTPSEnable : 0'),
  ]) {
    await expect(mac(output)(target)).rejects.toThrow('代理设置无效');
  }
});

test('unsupported and invalid configuration errors are distinct from retryable read failures', async () => {
  await expect(windows({ ProxyServer: 'localhost' })(target)).rejects.toBeInstanceOf(
    ProxyConfigurationError,
  );
  await expect(windows({ ProxyServer: 'socks=localhost:1080' })(target)).rejects.toBeInstanceOf(
    ProxyConfigurationError,
  );
  await expect(mac('<dictionary> {\n ProxyAutoConfigEnable : 1\n}')(target)).rejects.toBeInstanceOf(
    ProxyConfigurationError,
  );
  const resolve = createDownloadProxyResolver({
    platform: 'win32',
    environment: {},
    readSystemProxy: async () => {
      throw new Error('timeout');
    },
  });
  const error = await resolve(target).catch((error) => error);
  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(ProxyConfigurationError);
});

test('read failures and malformed proxy settings cannot expose credentials in diagnostics', async () => {
  const secret = 'private-password';
  const resolvers = [
    windows({ ProxyServer: `socks5://user:${secret}@localhost:1080` }),
    windows({ ProxyServer: `http://user:${secret}@localhost:bad` }),
    windows({}, { HTTPS_PROXY: `socks5://user:${secret}@localhost:1080` }),
    mac(
      `<dictionary> {\n HTTPSEnable : 1\n HTTPSProxy : user:${secret}@localhost\n HTTPSPort : bad\n}`,
    ),
    createDownloadProxyResolver({
      platform: 'win32',
      environment: {},
      readSystemProxy: async () => {
        throw new Error(`failed http://user:${secret}@localhost:123`);
      },
    }),
    createDownloadProxyResolver({
      platform: 'darwin',
      environment: {},
      readSystemProxy: async () => `not JSON ${secret}`,
    }),
  ];
  for (const resolve of resolvers) {
    const error = await resolve(target).then(
      () => undefined,
      (error) => error,
    );
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain(secret);
    expect(error.cause).toBeUndefined();
  }
});

test('each connection observes changed desktop and environment proxy settings', async () => {
  const environment: Record<string, string> = {};
  let current = settings(),
    reads = 0;
  const resolve = createDownloadProxyResolver({
    platform: 'win32',
    environment: () => environment,
    readSystemProxy: async () => {
      reads++;
      return current;
    },
  });
  expect(await resolve(target)).toBe('http://127.0.0.1:17890/');
  current = settings({ ProxyEnable: 0 });
  expect(await resolve(target)).toBeUndefined();
  current = settings({ ProxyServer: '127.0.0.2:17891' });
  expect(await resolve(target)).toBe('http://127.0.0.2:17891/');
  environment.https_proxy = 'http://localhost:17892';
  expect(await resolve(target)).toBe('http://localhost:17892/');
  expect(reads).toBe(3);
});

test('Linux supports environment and VPN/TUN without inventing a desktop proxy', async () => {
  const resolve = createDownloadProxyResolver({
    platform: 'linux',
    environment: {},
    readSystemProxy: async () => {
      throw new Error('must not read another desktop');
    },
  });
  expect(await resolve(target)).toBe('');
  const proxy = createDownloadProxyResolver({
    platform: 'linux',
    environment: { HTTPS_PROXY: 'http://localhost:17890' },
  });
  expect(await proxy(target)).toBe('http://localhost:17890/');
});

test('aborts propagate before and after a system lookup without starting another request', async () => {
  let reads = 0;
  const controller = new AbortController(),
    reason = new Error('fixture cancelled');
  const resolve = createDownloadProxyResolver({
    platform: 'win32',
    environment: {},
    readSystemProxy: async (_platform, signal) => {
      reads++;
      expect(signal).toBe(controller.signal);
      controller.abort(reason);
      return settings();
    },
  });
  await expect(resolve(target, controller.signal)).rejects.toBe(reason);
  await expect(resolve(target, controller.signal)).rejects.toBe(reason);
  expect(reads).toBe(1);
});

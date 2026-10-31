import { expect, test } from 'bun:test';
import {
  ldPlayerConsoleInstances,
  mumuManagerInstances,
  queryWindowsEmulatorInventory,
} from '@backend/infrastructure/native/windows-emulators';

const process = (root: string, pid: number) => ({
  Name: 'dnplayer.exe',
  ExecutablePath: `${root}\\dnplayer.exe`,
  ProcessId: pid,
});
const listener = (port: number, pid: number) => ({
  LocalAddress: '127.0.0.1',
  LocalPort: port,
  OwningProcess: pid,
});
const row = (index: number, pid: number, vmPid: number, state = 1, name = `雷电 ${index}`) =>
  `${index},${name},100,200,${state},${pid},${vmPid}`;

test('LDPlayer list2 retains all running indices and uses the upstream screenshot SDK PID field', () => {
  const instances = ldPlayerConsoleInstances(
    `\uFEFF${row(0, 1001, 2001)}\r\n${row(2, 1002, 2002)}\r\n${row(29990, 1003, 2003)}`,
    'D:\\雷电',
  );
  expect(
    instances.map((instance) => [
      instance.kind,
      instance.index,
      instance.address,
      instance.pid,
      instance.vmPid,
    ]),
  ).toEqual([
    ['ldplayer', 0, '127.0.0.1:5555', 1001, 2001],
    ['ldplayer', 2, '127.0.0.1:5559', 1002, 2002],
    ['ldplayer', 29990, '127.0.0.1:65535', 1003, 2003],
  ]);
  expect(instances[0].emulatorPath).toBe('D:\\雷电');
  expect(
    mumuManagerInstances(
      JSON.stringify({
        0: {
          index: '0',
          adb_host_ip: '127.0.0.1',
          adb_port: 16384,
          pid: 123,
          is_android_started: true,
          is_process_started: true,
        },
      }),
      'F:\\MuMu',
    )[0],
  ).toMatchObject({ kind: 'mumu', pid: 123 });
});

test('LDPlayer list2 excludes stopped, invalid and conflicting rows and bounds the parsed list', () => {
  const output = [
    row(0, 1001, 2001, 0),
    row(1, 0, 2002),
    row(29991, 1003, 2003),
    '-1,坏编号,0,0,1,1004,2004',
    '2,坏PID,0,0,1,1e3,2005',
    row(6, 0x80000000, 2010),
    '3,缺少列,0,0,1,1006',
    row(4, 1007, 2007),
    row(4, 1008, 2008),
    row(5, 1009, 0, 1, '   '),
    'diagnostic text',
  ].join('\n');
  const instances = ldPlayerConsoleInstances(output, 'D:\\雷电');
  expect(instances).toHaveLength(1);
  expect(instances[0]).toMatchObject({ index: 5, name: '雷电实例 5', pid: 1009, vmPid: 0 });
  expect(
    ldPlayerConsoleInstances(
      Array.from({ length: 130 }, (_, index) => row(index, 1000 + index, 2000 + index)).join('\n'),
      '',
    ),
  ).toHaveLength(128);
});

test('running LDPlayer installations are queried independently with fixed bounded list2 argv', async () => {
  const first = 'D:\\模拟器 A',
    second = 'F:\\雷电 B',
    calls: string[] = [];
  const inventory = await queryWindowsEmulatorInventory({
    isFile: (value) => value.endsWith('ldconsole.exe'),
    query: async (executable, args, options) => {
      if (executable.endsWith('powershell.exe'))
        return JSON.stringify({
          processes: [process(first, 10), process(first, 11), process(second, 20)],
          listeners: [listener(5555, 2001), listener(5561, 2002), listener(5565, 2004)],
        });
      calls.push(executable);
      expect(args).toEqual(['list2']);
      expect(options).toEqual({ timeout: 4000, maxBuffer: 256 * 1024, windowsHide: true });
      // Console field 5 need not match the window process captured earlier.
      return executable.startsWith('D:')
        ? `${row(0, 1001, 2001)}\n${row(3, 1002, 2002)}\n${row(4, 1003, 2003, 0)}`
        : row(5, 1004, 2004);
    },
  });
  expect(calls).toEqual([`${first}\\ldconsole.exe`, `${second}\\ldconsole.exe`]);
  expect(
    inventory.instances.map((instance) => [instance.index, instance.emulatorPath, instance.pid]),
  ).toEqual([
    [0, first, 1001],
    [3, first, 1002],
    [5, second, 1004],
  ]);
  expect(inventory.diagnostics).toEqual([]);
});

test('LDPlayer aliases and PID identities require an actual canonical listener owned by a unique reported process', async () => {
  const inventory = await queryWindowsEmulatorInventory({
    isFile: (value) => value.endsWith('ldconsole.exe'),
    query: async (executable) => {
      if (executable.endsWith('powershell.exe'))
        return JSON.stringify({
          processes: [process('D:\\雷电', 1001)],
          listeners: [
            listener(5555, 2001),
            listener(18001, 2001),
            listener(5557, 1002),
            listener(18002, 1002),
            listener(5559, 9999),
            listener(18003, 2003),
            { LocalAddress: '0.0.0.0', LocalPort: 19000, OwningProcess: 2001 },
          ],
        });
      return [row(0, 1001, 2001), row(1, 1002, 2002), row(2, 1003, 2003)].join('\n');
    },
  });
  expect(inventory.instances.map((instance) => instance.aliases)).toEqual([
    ['127.0.0.1:18001'],
    ['127.0.0.1:18002'],
  ]);
  expect(inventory.diagnostics[0]).toContain('其他进程占用');
  expect(inventory.instances[0].pid).toBe(1001);
  expect(inventory.identities).toEqual({
    '127.0.0.1:5555': 'ldplayer-process:2001',
    '127.0.0.1:18001': 'ldplayer-process:2001',
    '127.0.0.1:5557': 'ldplayer-process:1002',
    '127.0.0.1:18002': 'ldplayer-process:1002',
  });
});

test('a shared reported PID does not merge distinct LDPlayer instances', async () => {
  const inventory = await queryWindowsEmulatorInventory({
    isFile: (value) => value.endsWith('ldconsole.exe'),
    query: async (executable) => {
      if (executable.endsWith('powershell.exe'))
        return JSON.stringify({
          processes: [process('D:\\雷电', 1001)],
          listeners: [listener(5555, 2001), listener(5557, 2001), listener(18001, 2001)],
        });
      return [row(0, 1001, 2001), row(1, 1001, 2001)].join('\n');
    },
  });
  expect(inventory.instances.map((instance) => instance.address)).toEqual([
    '127.0.0.1:5555',
    '127.0.0.1:5557',
  ]);
  expect(inventory.instances.every((instance) => instance.aliases.length === 0)).toBe(true);
  expect(inventory.identities).toEqual({});
});

test('MuMu and LDPlayer enumeration coexist while retaining each kind and independent PID', async () => {
  const inventory = await queryWindowsEmulatorInventory({
    isFile: (value) =>
      value.endsWith('ldconsole.exe') || value.endsWith('nx_main\\MuMuManager.exe'),
    query: async (executable) => {
      if (executable.endsWith('powershell.exe'))
        return JSON.stringify({
          processes: [
            process('D:\\雷电', 1001),
            {
              Name: 'MuMuNxMain.exe',
              ExecutablePath: 'F:\\MuMu\\nx_main\\MuMuNxMain.exe',
              ProcessId: 3001,
            },
          ],
          listeners: [listener(5559, 2002)],
        });
      return executable.endsWith('ldconsole.exe')
        ? row(2, 1002, 2002)
        : JSON.stringify({
            0: {
              index: '0',
              adb_host_ip: '127.0.0.1',
              adb_port: 16384,
              pid: 3002,
              is_android_started: true,
              is_process_started: true,
            },
          });
    },
  });
  expect(
    inventory.instances.map((instance) => [instance.kind, instance.index, instance.pid]),
  ).toEqual([
    ['mumu', 0, 3002],
    ['ldplayer', 2, 1002],
  ]);
  expect(inventory.diagnostics).toEqual([]);
});

test('a failed LDPlayer console or missing executable preserves other emulator installations', async () => {
  const inventory = await queryWindowsEmulatorInventory({
    isFile: (value) => value.endsWith('ldconsole.exe') && !value.startsWith('G:'),
    query: async (executable) => {
      if (executable.endsWith('powershell.exe'))
        return JSON.stringify({
          processes: [process('D:\\bad', 10), process('F:\\good', 20), process('G:\\missing', 30)],
          listeners: [listener(5559, 2002)],
        });
      if (executable.startsWith('D:')) throw new Error('synthetic console timeout');
      return row(2, 1002, 2002);
    },
  });
  expect(inventory.instances.map((instance) => instance.index)).toEqual([2]);
  expect(inventory.diagnostics).toHaveLength(1);
  expect(inventory.diagnostics[0]).toContain('雷电多开信息读取失败');
});

test('an LDPlayer process without its ADB listener cannot trigger automatic SDK selection', async () => {
  const inventory = await queryWindowsEmulatorInventory({
    isFile: (value) => value.endsWith('ldconsole.exe'),
    query: async (executable) => {
      if (executable.endsWith('powershell.exe'))
        return JSON.stringify({
          processes: [process('D:\\雷电', 1001)],
          listeners: [listener(19000, 2001)],
        });
      return row(0, 1001, 2001);
    },
  });
  expect(inventory.instances).toEqual([]);
  expect(inventory.identities).toEqual({});
  expect(inventory.diagnostics[0]).toContain('ADB 端口尚未就绪');
});

test('LDPlayer installation enumeration stops at four consoles and limits concurrent queries to two', async () => {
  let release!: () => void,
    started!: () => void,
    active = 0,
    peak = 0;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    firstBatch = new Promise<void>((resolve) => {
      started = resolve;
    });
  const calls: string[] = [];
  const pending = queryWindowsEmulatorInventory({
    isFile: (value) => value.endsWith('ldconsole.exe'),
    query: async (executable) => {
      if (executable.endsWith('powershell.exe'))
        return JSON.stringify({
          processes: Array.from({ length: 6 }, (_, index) =>
            process(`D:\\雷电${index}`, index + 1),
          ),
          listeners: [],
        });
      calls.push(executable);
      active++;
      peak = Math.max(peak, active);
      if (calls.length === 2) started();
      await gate;
      active--;
      return row(calls.length, 1000 + calls.length, 2000 + calls.length);
    },
  });
  await firstBatch;
  expect(calls).toHaveLength(2);
  release();
  const inventory = await pending;
  expect(calls).toHaveLength(4);
  expect(peak).toBe(2);
  expect(active).toBe(0);
  expect(inventory.diagnostics).toContain(
    '运行中的雷电安装目录超过自动发现上限 4 个，请手动配置其余实例',
  );
});

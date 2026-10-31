import { afterEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  UpdateService,
  type UpdateOptions,
  type UpdateStore,
} from '@backend/modules/updates/updates.ts';

class MemoryStore implements UpdateStore {
  private readonly rows = new Map<string, any>();
  get(kind: string, id: string, fallback?: any) {
    const value = this.rows.get(`${kind}|${id}`);
    return structuredClone(value === undefined ? fallback : value);
  }
  put(kind: string, id: string, value: any) {
    this.rows.set(`${kind}|${id}`, structuredClone(value));
  }
  delete(kind: string, id: string) {
    this.rows.delete(`${kind}|${id}`);
  }
  all(kind: string) {
    return [...this.rows.entries()]
      .filter(([key]) => key.startsWith(`${kind}|`))
      .map(([, value]) => structuredClone(value));
  }
}

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(options: UpdateOptions = {}) {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'maaverge-update-activation-'))),
    store = new MemoryStore(),
    events: any[] = [],
    state = { busy: false, coreVersion: 'v6.20.0', resourceVersion: 'a'.repeat(40) };
  roots.push(root);
  const updates = new UpdateService(
    root,
    store,
    (_type, _message, data) => events.push(structuredClone(data.update)),
    () => state.busy,
    {
      source: {
        check: (channel) => ({
          version: channel === 'core' ? state.coreVersion : state.resourceVersion,
          name: `${channel}.zip`,
          source: 'fixture',
        }),
        download: async (_metadata, destination, progress) => {
          await writeFile(destination, 'synthetic archive');
          progress(90);
          return 'a'.repeat(64);
        },
      },
      validator: async () => {},
      jobRunner: async (config) => {
        await mkdir(path.join(config.target, 'resource/onnx'), { recursive: true });
        await writeFile(path.join(config.target, 'resource/version.json'), '{}');
        await writeFile(path.join(config.target, 'resource/onnx/model'), config.version);
        if (config.channel === 'core') {
          const library =
            process.platform === 'win32'
              ? 'MaaCore.dll'
              : process.platform === 'darwin'
                ? 'libMaaCore.dylib'
                : 'libMaaCore.so';
          await writeFile(path.join(config.target, library), config.version);
          await writeFile(path.join(config.target, 'MaaUtils.dll'), 'synthetic dependency');
          return {};
        }
        return { coreVersion: config.coreVersion };
      },
      ...options,
    },
  );
  const prepare = async (channel: 'core' | 'resource') => {
    await updates.check(channel);
    await updates.prepare(channel);
  };
  return { updates, store, events, state, prepare };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('core activation defers content checks for unrelated rollback and resource candidates', async () => {
  let inspect = () => {};
  const context = await fixture({ validator: () => inspect() }),
    { updates, store, state, prepare } = context;
  try {
    await prepare('core');
    await updates.activate('core');
    await prepare('resource');
    await updates.activate('resource');
    state.coreVersion = 'v6.20.1';
    await prepare('core');
    await updates.activate('core');
    const previous = store.get('previous', 'combo');
    state.resourceVersion = 'b'.repeat(40);
    await prepare('resource');
    state.coreVersion = 'v6.20.2';
    await prepare('core');
    const otherCandidate = store.get('staged', 'resource');
    await writeFile(path.join(previous.core.path, 'MaaUtils.dll'), 'modified rollback dependency');
    await writeFile(
      path.join(previous.resource.path, 'resource/onnx/model'),
      'modified rollback resource',
    );
    await writeFile(
      path.join(otherCandidate.path, 'resource/onnx/model'),
      'modified unrelated candidate',
    );
    let inspected = false;
    inspect = () => {
      inspected = true;
      expect(store.get('previous', 'combo')).toEqual(previous);
      expect(store.get('staged', 'resource')).toEqual(otherCandidate);
    };
    expect((await updates.activate('core')).currentVersion).toBe('v6.20.2');
    expect(inspected).toBe(true);
    expect(store.get('staged', 'resource')).toBeUndefined();
  } finally {
    await updates.close();
  }
});

test('resource activation preserves unrelated rollback and core candidate content for later validation', async () => {
  let inspect = () => {};
  const { updates, store, state, prepare } = await fixture({ validator: () => inspect() });
  try {
    await prepare('core');
    await updates.activate('core');
    await prepare('resource');
    await updates.activate('resource');
    state.resourceVersion = 'b'.repeat(40);
    await prepare('resource');
    await updates.activate('resource');
    const previous = store.get('previous', 'combo');
    state.coreVersion = 'v6.20.1';
    await prepare('core');
    state.resourceVersion = 'c'.repeat(40);
    await prepare('resource');
    const otherCandidate = store.get('staged', 'core');
    await writeFile(
      path.join(previous.resource.path, 'resource/onnx/model'),
      'modified rollback resource',
    );
    await writeFile(path.join(otherCandidate.path, 'MaaUtils.dll'), 'modified unrelated core');
    let inspected = false;
    inspect = () => {
      inspected = true;
      expect(store.get('previous', 'combo')).toEqual(previous);
      expect(store.get('staged', 'core')).toEqual(otherCandidate);
    };
    expect((await updates.activate('resource')).currentVersion).toBe('c'.repeat(40));
    expect(inspected).toBe(true);
    expect(store.get('staged', 'core')).toEqual(otherCandidate);
  } finally {
    await updates.close();
  }
});

test.each(['core', 'resource'] as const)(
  'busy %s activation preserves an unread damaged candidate until the idle integrity check',
  async (channel) => {
    let validations = 0;
    const { updates, store, events, state, prepare } = await fixture({
      validator: () => {
        validations++;
      },
    });
    try {
      await prepare('core');
      await updates.activate('core');
      const active = store.get('active', 'combo');
      state.coreVersion = 'v6.20.1';
      state.resourceVersion = 'b'.repeat(40);
      await prepare(channel);
      const candidate = store.get('staged', channel),
        before = validations;
      await writeFile(
        path.join(candidate.path, 'resource/onnx/model'),
        'damaged but structurally present',
      );
      state.busy = true;
      events.length = 0;
      expect((await updates.activate(channel)).status).toBe('waiting_idle');
      expect(store.get('staged', channel)).toEqual(candidate);
      expect(store.get('active', 'combo')).toEqual(active);
      expect(validations).toBe(before);
      expect(events.some((event) => event.status === 'downloading')).toBe(false);
      state.busy = false;
      await expect(updates.activate(channel)).rejects.toThrow('完整性校验未通过');
      expect(store.get('staged', channel)).toBeUndefined();
      expect(store.get('active', 'combo')).toEqual(active);
      expect(updates.channel(channel).status).not.toBe('downloading');
      expect(validations).toBe(before);
    } finally {
      await updates.close();
    }
  },
);

test('activation publishes integrity, native validation and switch stages before their work completes', async () => {
  const validating = deferred(),
    allowValidation = deferred(),
    switching = deferred(),
    allowSwitch = deferred();
  const { updates, store, events, prepare } = await fixture({
    validator: async () => {
      validating.resolve();
      await allowValidation.promise;
    },
    beforeActivate: async () => {
      switching.resolve();
      await allowSwitch.promise;
    },
  });
  let activation: Promise<any> | undefined;
  try {
    await prepare('core');
    store.put('update', 'core', {
      ...store.get('update', 'core'),
      downloadSpeedBytesPerSecond: 2048,
    });
    events.length = 0;
    activation = updates.activate('core');
    await validating.promise;
    expect(updates.channel('core')).toMatchObject({
      status: 'downloading',
      progress: 85,
      message: '正在验证核心与资源，请稍候',
    });
    expect(store.get('active', 'combo')).toBeUndefined();
    allowValidation.resolve();
    await switching.promise;
    expect(updates.channel('core')).toMatchObject({
      status: 'downloading',
      progress: 95,
      message: '正在切换核心与资源，请稍候',
    });
    expect(store.get('active', 'combo')).toBeUndefined();
    allowSwitch.resolve();
    expect((await activation).status).toBe('active');
    const stages = events.filter((event) => event.id === 'core');
    expect(stages[0]).toMatchObject({
      status: 'downloading',
      progress: 0,
      message: '正在校验更新文件，请稍候',
    });
    const nativeIndex = stages.findIndex((event) => event.message === '正在验证核心与资源，请稍候'),
      switchIndex = stages.findIndex((event) => event.message === '正在切换核心与资源，请稍候'),
      activeIndex = stages.findIndex((event) => event.status === 'active');
    expect(nativeIndex).toBeGreaterThan(0);
    expect(switchIndex).toBeGreaterThan(nativeIndex);
    expect(activeIndex).toBeGreaterThan(switchIndex);
    expect(stages.every((event) => event.downloadSpeedBytesPerSecond === undefined)).toBe(true);
    const progress: number[] = stages.map((event) => event.progress);
    expect(progress).toEqual([...progress].sort((left, right) => left - right));
  } finally {
    allowValidation.resolve();
    allowSwitch.resolve();
    await activation?.catch(() => {});
    await updates.close();
  }
});

test('native validation failure restores a terminal state and leaves the working combination intact', async () => {
  let rejectValidation = false,
    validations = 0;
  const { updates, store, state, prepare } = await fixture({
    validator: () => {
      validations++;
      if (rejectValidation) throw new Error('synthetic native initialization failed');
    },
  });
  try {
    await prepare('core');
    await updates.activate('core');
    const original = store.get('active', 'combo');
    state.coreVersion = 'v6.20.1';
    await prepare('core');
    rejectValidation = true;
    await expect(updates.activate('core')).rejects.toThrow('更新切换失败');
    expect(updates.channel('core').status).toBe('failed');
    expect(updates.channel('core').downloadSpeedBytesPerSecond).toBeUndefined();
    expect(store.get('active', 'combo')).toEqual(original);
    expect(store.get('staged', 'core')).toBeDefined();
    const beforeRetry = validations;
    rejectValidation = false;
    expect((await updates.activate('core')).status).toBe('active');
    expect(validations).toBe(beforeRetry + 1);
  } finally {
    await updates.close();
  }
});

test('a failed switch retains its verified candidate and a retry validates before switching again', async () => {
  let rejectSwitch = false,
    validations = 0;
  const finished: (string | undefined)[] = [];
  const { updates, store, state, prepare } = await fixture({
    validator: () => {
      validations++;
    },
    beforeActivate: () => {
      if (rejectSwitch) throw new Error('synthetic worker shutdown failed');
    },
    finishActivate: (error) => {
      finished.push(error);
    },
  });
  try {
    await prepare('core');
    await updates.activate('core');
    const original = store.get('active', 'combo');
    state.coreVersion = 'v6.20.1';
    await prepare('core');
    const candidate = store.get('staged', 'core');
    rejectSwitch = true;
    await expect(updates.activate('core')).rejects.toThrow('更新切换失败');
    expect(updates.channel('core').status).toBe('staged');
    expect(store.get('active', 'combo')).toEqual(original);
    expect(store.get('staged', 'core')).toEqual(candidate);
    expect(finished).toContain('synthetic worker shutdown failed');
    const beforeRetry = validations;
    rejectSwitch = false;
    expect((await updates.activate('core')).status).toBe('active');
    expect(validations).toBe(beforeRetry + 1);
    expect(store.get('active', 'combo').core.path).toBe(candidate.path);
  } finally {
    await updates.close();
  }
});

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { start, terminate } from '../project.mjs';

const unixOnly = {
  skip: process.platform === 'win32' ? 'Unix process groups; Windows retains taskkill /t' : false,
  timeout: 10000,
};

const descendant = `
  const { writeFileSync } = require('node:fs');
  process.on('SIGTERM', () => {
    writeFileSync(process.argv[1], String(process.pid));
    process.exit(0);
  });
  process.send({ ready: process.pid });
  setInterval(() => {}, 1000);
`;

function leader(marker, exitEarly) {
  return `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}, ${JSON.stringify(marker)}], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    child.once('message', ({ ready }) => {
      process.send({ descendant: ready }, () => {
        if (${exitEarly}) {
          child.unref();
          child.disconnect();
          process.disconnect();
          process.exit(0);
        }
      });
    });
    setInterval(() => {}, 1000);
  `;
}

async function waitFor(check) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    assert.ok(Date.now() < deadline, 'fixture process did not reach the expected state');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

function running(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'maaverge-process-tree-'));
  const children = new Set();
  const descendants = new Set();
  t.after(async () => {
    for (const child of children) {
      terminate(child);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    for (const pid of descendants) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, children, descendants };
}

test(
  'managed shutdown reaches grandchildren and preserves an unrelated process',
  unixOnly,
  async (t) => {
    const { directory, children, descendants } = fixture(t);
    const unrelatedMarker = path.join(directory, 'unrelated-stopped');
    const unrelated = spawn(process.execPath, ['-e', descendant, unrelatedMarker], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    children.add(unrelated);
    await once(unrelated, 'message');
    const marker = path.join(directory, 'grandchild-stopped');
    const child = start(process.execPath, ['-e', leader(marker, false)], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    children.add(child);
    const [{ descendant: pid }] = await once(child, 'message');
    descendants.add(pid);

    terminate(child);

    // File creation is visible before the descendant's synchronous write finishes.
    await waitFor(() => existsSync(marker) && readFileSync(marker, 'utf8') === String(pid));
    assert.equal(readFileSync(marker, 'utf8'), String(pid));
    await waitFor(() => !running(pid));
    descendants.delete(pid);
    await waitFor(() => child.exitCode !== null || child.signalCode !== null);
    assert.equal(process.kill(unrelated.pid, 0), true);
    assert.equal(existsSync(unrelatedMarker), false);
    assert.doesNotThrow(() => terminate(child));
  },
);

test(
  'managed shutdown still reaches a grandchild after its group leader exits',
  unixOnly,
  async (t) => {
    const { directory, children, descendants } = fixture(t);
    const marker = path.join(directory, 'orphan-stopped');
    const child = start(process.execPath, ['-e', leader(marker, true)], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    children.add(child);
    const [{ descendant: pid }] = await once(child, 'message');
    descendants.add(pid);
    await waitFor(() => child.exitCode !== null);
    assert.equal(child.exitCode, 0);

    terminate(child);

    await waitFor(() => existsSync(marker) && readFileSync(marker, 'utf8') === String(pid));
    assert.equal(readFileSync(marker, 'utf8'), String(pid));
    await waitFor(() => !running(pid));
    descendants.delete(pid);
  },
);

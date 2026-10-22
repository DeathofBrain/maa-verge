import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { root, run, fail } from './project.mjs';

function normalizeIcns(file) {
  const data = readFileSync(file);
  if (data.toString('ascii', 0, 4) !== 'icns' || data.readUInt32BE(4) !== data.length) {
    throw new Error('Invalid generated ICNS header');
  }
  const entries = [];
  for (let offset = 8; offset < data.length;) {
    if (offset + 8 > data.length) throw new Error('Truncated generated ICNS entry');
    const size = data.readUInt32BE(offset + 4);
    if (size < 8 || offset + size > data.length) throw new Error('Invalid generated ICNS entry');
    entries.push(data.subarray(offset, offset + size));
    offset += size;
  }
  // The CLI emits these independent size entries in random map order.
  entries.sort((left, right) => Buffer.compare(left.subarray(0, 4), right.subarray(0, 4)));
  writeFileSync(file, Buffer.concat([data.subarray(0, 8), ...entries]));
}

async function main() {
  const source = path.join(root, 'apps/desktop/public/logo.png');
  const directory = path.join(root, 'apps/desktop/src-tauri/icons');
  const temporaryRoot = path.resolve(tmpdir());
  const scratch = mkdtempSync(path.join(temporaryRoot, 'maa-verge-icons-'));
  try {
    await run('pnpm', ['exec', 'tauri', 'icon', source, '--output', scratch]);
    // Dock icons need optical padding; keep the UI and Windows/Linux artwork
    // full-sized. Embed the PNG so this stays portable and needs no image tools.
    const macosSource = path.join(scratch, 'macos.svg');
    const macosDirectory = path.join(scratch, 'macos');
    writeFileSync(macosSource, `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><image x="100" y="100" width="824" height="824" href="data:image/png;base64,${readFileSync(source).toString('base64')}" /></svg>`);
    await run('pnpm', ['exec', 'tauri', 'icon', macosSource, '--output', macosDirectory]);
    normalizeIcns(path.join(macosDirectory, 'icon.icns'));
    mkdirSync(directory, { recursive: true });
    for (const [generated, target] of [
      ['32x32.png', '32x32.png'],
      ['128x128.png', '128x128.png'],
      ['128x128@2x.png', '256x256.png'],
      ['icon.ico', 'icon.ico'],
      ['macos/icon.icns', 'icon.icns'],
    ]) {
      copyFileSync(path.join(scratch, generated), path.join(directory, target));
    }
  } finally {
    // Only remove the unique temporary directory created for this invocation.
    if (path.dirname(scratch) === temporaryRoot && path.basename(scratch).startsWith('maa-verge-icons-')) {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
}
main().catch(fail);

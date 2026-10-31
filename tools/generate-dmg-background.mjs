import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';
import { root, fail } from './project.mjs';

// Finder uses physical image dimensions. A 2x PNG needs 144 DPI to keep the
// background aligned with the logical icon coordinates on Retina displays.
function retinaPng(png) {
  const payload = Buffer.alloc(9);
  payload.writeUInt32BE(5669, 0);
  payload.writeUInt32BE(5669, 4);
  payload[8] = 1;
  const chunk = Buffer.alloc(21);
  chunk.writeUInt32BE(payload.length, 0);
  chunk.write('pHYs', 4, 'ascii');
  payload.copy(chunk, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, 17)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 17);
  const chunks = [png.subarray(0, 8)];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset) + 12;
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type !== 'pHYs') chunks.push(png.subarray(offset, offset + length));
    if (type === 'IHDR') chunks.push(chunk);
    offset += length;
  }
  return Buffer.concat(chunks);
}

async function main() {
  const directory = path.join(root, 'apps/desktop/src-tauri/installer');
  const source = readFileSync(path.join(directory, 'dmg-background.svg'), 'utf8');
  const [, width, height] = source.match(/viewBox="0 0 (\d+) (\d+)"/) ?? [];
  if (!width || !height) throw new Error('DMG background must have a zero-origin viewBox');
  const requireDesktop = createRequire(path.join(root, 'apps/desktop/package.json'));
  const fonts = path.dirname(requireDesktop.resolve('@fontsource-variable/noto-sans-sc/wght.css'));
  // Embed the already pinned UI fonts: regeneration never uses host fonts or
  // downloads a font. Chromium only decodes the unicode subsets used by the SVG.
  const css = readFileSync(path.join(fonts, 'wght.css'), 'utf8').replace(
    /url\(\.\/([^)]*)\)/gu,
    (_, file) =>
      `url(data:font/woff2;base64,${readFileSync(path.join(fonts, file)).toString('base64')})`,
  );
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL }
      : {}),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: Number(width), height: Number(height) },
      deviceScaleFactor: 2,
    });
    await page.route('**/*', (route) => route.abort());
    await page.setContent(`<style>${css}html,body{margin:0}svg{display:block}</style>${source}`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      if ([...document.fonts].some((font) => font.status === 'error')) {
        throw new Error('DMG background font failed to load');
      }
    });
    const png = retinaPng(await page.screenshot());
    const output = path.join(directory, 'dmg-background.png');
    writeFileSync(output, png);
    console.log(
      `Generated ${path.relative(root, output)} (${Number(width) * 2}×${Number(height) * 2}, 144 DPI)`,
    );
  } finally {
    await browser.close();
  }
}

main().catch(fail);

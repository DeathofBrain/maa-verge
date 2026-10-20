import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './project.mjs';

const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([header, body, tail]);
}
function png(size) {
  const scanlines = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      const u = x / size;
      const v = y / size;
      const inner = u > .18 && u < .82 && v > .18 && v < .82;
      const vee = inner && Math.abs(u - .5) < .28 - Math.abs(v - .5) * .3 && v > .30 + Math.abs(u - .5) * .6;
      scanlines.set(vee ? [176, 235, 105, 255] : [17, 21, 18, 255], offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]);
}
const directory = path.join(root, 'apps/desktop/src-tauri/icons');
mkdirSync(directory, { recursive: true });
for (const size of [32, 128, 256]) writeFileSync(path.join(directory, `${size}x${size}.png`), png(size));
const bitmap = png(256);
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(bitmap.length, 14);
icoHeader.writeUInt32LE(22, 18);
writeFileSync(path.join(directory, 'icon.ico'), Buffer.concat([icoHeader, bitmap]));
const icnsHeader = Buffer.alloc(16);
icnsHeader.write('icns', 0);
icnsHeader.writeUInt32BE(16 + bitmap.length, 4);
icnsHeader.write('ic08', 8);
icnsHeader.writeUInt32BE(8 + bitmap.length, 12);
writeFileSync(path.join(directory, 'icon.icns'), Buffer.concat([icnsHeader, bitmap]));

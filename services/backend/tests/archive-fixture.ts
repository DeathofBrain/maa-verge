import { writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

export interface FixtureMember { name: string; content?: string | Buffer; link?: string; hard?: boolean; type?: "special" | "directory"; mode?: number }
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipBytes(members: FixtureMember[]): Buffer {
  const files: Buffer[] = [], entries: Buffer[] = [];
  let offset = 0;
  for (const member of members) {
    const name = Buffer.from(member.name), body = Buffer.from(member.link ?? member.content ?? "");
    const crc = crc32(body), local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22); local.writeUInt16LE(name.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x314, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24); central.writeUInt16LE(name.length, 28);
    const mode = (member.link ? 0o120777 : member.type === "special" ? 0o020600 : member.type === "directory" ? 0o040755 : 0o100000 | (member.mode ?? 0o644));
    central.writeUInt32LE((mode << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    files.push(local, name, body); entries.push(central, name); offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(entries), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(members.length, 8); end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, directory, end]);
}
export function tarBytes(members: FixtureMember[]): Buffer {
  const chunks: Buffer[] = [];
  for (const member of members) {
    const body = Buffer.from(member.link ? "" : member.content ?? ""), header = Buffer.alloc(512);
    if (Buffer.byteLength(member.name) > 100) throw new Error("fixture path too long");
    header.write(member.name); header.write((member.mode ?? 0o755).toString(8).padStart(7, "0") + "\0", 100);
    header.write("0000000\0", 108); header.write("0000000\0", 116);
    header.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
    header.write("00000000000\0", 136); header.fill(32, 148, 156);
    header.write(member.link ? member.hard ? "1" : "2" : member.type === "special" ? "3" : member.type === "directory" ? "5" : "0", 156);
    if (member.link) header.write(member.link, 157);
    header.write("ustar\0", 257); header.write("00", 263);
    header.write(header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, "0") + "\0 ", 148);
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
export function writeArchive(filename: string, kind: string, members: FixtureMember[]): Promise<void> {
  return writeFile(filename, kind === "zip" ? zipBytes(members) : tarBytes(members));
}

/** Synthetic executable: no network, devices, configuration or user data. */
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const argument = (name: string) => args.find((value) => value.startsWith(name + "="))?.slice(name.length + 1) ?? "";
const destination = path.join(argument("--dir"), argument("--out"));
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination + ".args", JSON.stringify(args));
await writeFile(destination + ".env", JSON.stringify({ NODE_OPTIONS: process.env.NODE_OPTIONS, BUN_OPTIONS: process.env.BUN_OPTIONS }));
const mode = new URL(args.at(-1)!).pathname.slice(1);
if (mode === "ignore-range") {
  if (!await Bun.file(destination + ".attempt").exists()) {
    await writeFile(destination + ".attempt", "first attempt");
    await writeFile(destination, "da"); await writeFile(destination + ".aria2", "synthetic resume control"); process.exit(1);
  }
  if (await Bun.file(destination).exists() || await Bun.file(destination + ".aria2").exists()) process.exit(98);
}
if (mode === "sparse") {
  await writeFile(destination, "data");
  const file = await open(destination, "r+");
  for (let index = 0; index < 5; index++) {
    await file.write(Buffer.from("d"), 0, 1, 0);
    process.stdout.write(`[#abcdef ${Math.min(3, index + 1)}B/4B(25%) CN:1 DL:1B]\r`);
    await Bun.sleep(150);
  }
  await file.close();
}
if (mode === "interrupt" && !await Bun.file(destination + ".aria2").exists() || mode === "wait") {
  await writeFile(destination, "da");
  await writeFile(destination + ".aria2", "synthetic resume control");
  if (mode === "wait") await Bun.sleep(60_000);
  process.stderr.write("synthetic network failure\n"); process.exit(1);
}
if (mode === "interrupt") {
  if (await readFile(destination, "utf8") !== "da") process.exit(99);
}
await writeFile(destination, mode === "checksum" ? "oops" : "data");
if (mode === "checksum") process.exit(32);

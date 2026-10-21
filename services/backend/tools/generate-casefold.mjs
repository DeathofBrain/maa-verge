// Python 3.12 uses Unicode 15.0. Keep archive path rejection identical across runtimes.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

const source = "https://www.unicode.org/Public/15.0.0/ucd/CaseFolding.txt";
const response = await fetch(source);
if (!response.ok) throw new Error(`Unicode data: ${response.status}`);
const data = await response.text();
const expectedHash = "cdd49e55eae3bbf1f0a3f6580c974a0263cb86a6a08daa10fbf705b4808a56f7";
const hash = createHash("sha256").update(data).digest("hex");
if (hash !== expectedHash) throw new Error("Unicode 15.0 source digest mismatch");
const mapping = {};
for (const line of data.split("\n")) {
  const match = /^([0-9A-F]+); ([CF]); ([0-9A-F ]+);/.exec(line);
  if (match) mapping[String.fromCodePoint(parseInt(match[1], 16))] =
    String.fromCodePoint(...match[3].trim().split(" ").map((value) => parseInt(value, 16)));
}
await writeFile(new URL("../src/casefold-data.json", import.meta.url), JSON.stringify(mapping) + "\n");
console.log(`Unicode 15.0 SHA-256 ${hash}, ${Object.keys(mapping).length} mappings`);

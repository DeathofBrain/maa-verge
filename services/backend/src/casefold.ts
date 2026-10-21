import mapping from "./casefold-data.json";

// Full default case folding, rather than JavaScript's locale-sensitive lowercase.
// Data: Unicode 15.0 CaseFolding.txt, generated with tools/generate-casefold.mjs.
const table: Readonly<Record<string, string>> = mapping;
export function casefold(value: string): string {
  return Array.from(value, (character) => table[character] ?? character).join("");
}

import generated from './product-knowledge.generated.json';
import type { KnowledgeRecord } from './knowledge-types';

/** Statically imported at build time; the packaged service never reads the repository. */
export const productKnowledgeDigest = generated.digest;
export const productKnowledgeVersion = generated.formatVersion;
export const productKnowledgeSources: ReadonlyArray<Readonly<{ file: string; sha256: string }>> =
  Object.freeze(generated.sources.map((source) => Object.freeze({ ...source })));

/** Return an isolated copy so a query consumer cannot mutate the shared catalogue. */
export function productKnowledge(): KnowledgeRecord[] {
  // JSON imports widen discriminants and infer absent union keys as undefined.
  // The offline generator and source-verification tests own this format.
  return structuredClone(generated.records) as unknown as KnowledgeRecord[];
}

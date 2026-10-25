import type { ClientType } from './item-resources';

export type KnowledgeKind = 'operator' | 'item' | 'stage' | 'recruitment' | 'infrastructure' | 'document' | 'capability';
export type KnowledgeValue = string | number | boolean | null | KnowledgeValue[] | { [key: string]: KnowledgeValue };
export interface KnowledgeRecord {
  key: string;
  kind: KnowledgeKind;
  id: string;
  name: string;
  aliases: string[];
  text: string;
  data: { [key: string]: KnowledgeValue };
  relations: { predicate: string; targetKind: KnowledgeKind; targetId: string }[];
  source: { file: string; pointer: string; sha256: string };
}
export interface KnowledgeSource {
  file: string;
  sha256: string | null;
  status: 'available' | 'missing' | 'invalid';
  records: number;
}
export interface ResourceKnowledgePack {
  parserVersion: number;
  clientType: ClientType;
  coreVersion: string | null;
  resourceVersion: string | null;
  fingerprint: string;
  sources: KnowledgeSource[];
  records: KnowledgeRecord[];
  diagnostics: string[];
}

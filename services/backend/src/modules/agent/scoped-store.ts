import { createHash } from 'node:crypto';
import {
  BaseStore,
  type Item,
  type Operation,
  type OperationResults,
  type SearchItem,
} from '@langchain/langgraph-checkpoint';
import type { AgentJsonObject, AgentScope } from '@contracts/agent-types';
import { validateAgentJsonObject } from '@contracts/validators.js';
import type { Store } from '@backend/infrastructure/storage/storage';
import { accountKnowledgeScope } from '@backend/modules/knowledge/account-knowledge';
import { AgentContextError, sameAgentScope } from './context';

interface StoredItem {
  id: string;
  scope: AgentScope;
  namespace: string[];
  key: string;
  value: AgentJsonObject;
  createdAt: string;
  updatedAt: string;
}
const begins = (namespace: string[], prefix: string[]) =>
  prefix.every((part, i) => namespace[i] === part);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const hash = (namespace: string[], key: string) =>
  createHash('sha256')
    .update(JSON.stringify([namespace, key]))
    .digest('hex');
const filtersMatch = (value: AgentJsonObject, filter: Record<string, unknown> = {}) =>
  Object.entries(filter).every(([field, condition]) => {
    const actual = value[field];
    if (condition === null || typeof condition !== 'object' || Array.isArray(condition))
      return equal(actual, condition);
    return Object.entries(condition).every(([operator, expected]) => {
      if (operator === '$eq') return equal(actual, expected);
      if (operator === '$ne') return !equal(actual, expected);
      if (
        (typeof actual !== 'number' && typeof actual !== 'string') ||
        typeof actual !== typeof expected
      )
        return false;
      const comparison =
        typeof actual === 'string' && typeof expected === 'string'
          ? actual < expected
            ? -1
            : actual > expected
              ? 1
              : 0
          : (actual as number) - (expected as number);
      if (operator === '$gt') return comparison > 0;
      if (operator === '$gte') return comparison >= 0;
      if (operator === '$lt') return comparison < 0;
      if (operator === '$lte') return comparison <= 0;
      return false;
    });
  });

/** Namespace enforcement lives in batch, including SDK calls that bypass put(). */
export class ScopedAgentStore extends BaseStore {
  private readonly scope: AgentScope;
  readonly namespace: string[];

  constructor(
    private readonly store: Store,
    scope: AgentScope,
  ) {
    super();
    this.scope = structuredClone(scope);
    this.namespace = Object.freeze(['maaverge', 'account', scope.accountId]) as unknown as string[];
  }

  private assertCurrent() {
    const configuredClient = this.scope.deviceId
      ? this.store.get('device_client', this.scope.deviceId)
      : undefined;
    const current = {
      ...this.scope,
      ...accountKnowledgeScope(this.store, this.scope.deviceId, this.scope.clientType),
    };
    if (
      (configuredClient !== undefined && configuredClient !== this.scope.clientType) ||
      !sameAgentScope(this.scope, current)
    )
      throw new AgentContextError('账号配置已改变，记忆访问已停止');
  }

  private assertNamespace(namespace: unknown): asserts namespace is string[] {
    if (
      !Array.isArray(namespace) ||
      namespace.length > 16 ||
      !begins(namespace, this.namespace) ||
      namespace.some(
        (part) =>
          typeof part !== 'string' ||
          !part ||
          part.length > 200 ||
          ['__proto__', 'prototype', 'constructor', '..'].includes(part),
      )
    )
      throw new AgentContextError('记忆命名空间超出当前账号范围');
  }

  private rows(): StoredItem[] {
    return this.store
      .all('agent_kv')
      .filter(
        (row): row is StoredItem =>
          row &&
          sameAgentScope(row.scope ?? {}, this.scope) &&
          Array.isArray(row.namespace) &&
          begins(row.namespace, this.namespace) &&
          typeof row.key === 'string' &&
          validateAgentJsonObject(row.value),
      );
  }

  private item(row: StoredItem): Item {
    return {
      namespace: [...row.namespace],
      key: row.key,
      value: structuredClone(row.value),
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async batch<Op extends Operation[]>(operations: Op): Promise<OperationResults<Op>> {
    this.assertCurrent();
    if (!Array.isArray(operations) || operations.length > 100)
      throw new AgentContextError('记忆批次过大');
    // Validate every operation before any mutation, including broad namespace listings.
    for (const operation of operations) {
      if ('namespace' in operation) {
        this.assertNamespace(operation.namespace);
        if (typeof operation.key !== 'string' || !operation.key || operation.key.length > 200)
          throw new AgentContextError('记忆键无效');
        if (
          'value' in operation &&
          operation.value !== null &&
          (!validateAgentJsonObject(operation.value) ||
            Buffer.byteLength(JSON.stringify(operation.value)) > 512 * 1024)
        )
          throw new AgentContextError('记忆值无效或过大');
      } else if ('namespacePrefix' in operation) {
        this.assertNamespace(operation.namespacePrefix);
        if (operation.query && operation.query.length > 1000)
          throw new AgentContextError('记忆查询过长');
      } else if (
        'matchConditions' in operation ||
        ('limit' in operation && 'offset' in operation)
      ) {
        const prefix = operation.matchConditions?.find((match) => match.matchType === 'prefix');
        this.assertNamespace(prefix?.path);
        if (operation.maxDepth !== undefined && operation.maxDepth < this.namespace.length)
          throw new AgentContextError('命名空间深度超出当前账号范围');
      } else throw new AgentContextError('记忆操作无效');
    }
    return this.store.transaction(() =>
      operations.map((operation) => {
        if ('namespace' in operation) {
          const id = hash(operation.namespace, operation.key);
          const previous = this.store.get<StoredItem | null>('agent_kv', id, null);
          if ('value' in operation) {
            if (operation.value === null) this.store.delete('agent_kv', id);
            else {
              const timestamp = new Date().toISOString();
              this.store.put('agent_kv', id, {
                id,
                scope: this.scope,
                namespace: operation.namespace,
                key: operation.key,
                value: operation.value,
                createdAt: previous?.createdAt ?? timestamp,
                updatedAt: timestamp,
              } satisfies StoredItem);
            }
            return undefined;
          }
          return previous && sameAgentScope(previous.scope, this.scope)
            ? this.item(previous)
            : null;
        }
        if ('namespacePrefix' in operation) {
          const query = operation.query?.toLocaleLowerCase().trim();
          const results: SearchItem[] = this.rows()
            .filter(
              (row) =>
                begins(row.namespace, operation.namespacePrefix) &&
                filtersMatch(row.value, operation.filter),
            )
            .flatMap((row) => {
              const text = `${row.key}\n${JSON.stringify(row.value)}`.toLocaleLowerCase();
              if (query && !text.includes(query)) return [];
              return [
                {
                  ...this.item(row),
                  ...(query ? { score: row.key.toLocaleLowerCase() === query ? 2 : 1 } : {}),
                },
              ];
            })
            .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.key.localeCompare(b.key));
          const offset = Math.max(0, Math.trunc(operation.offset ?? 0));
          const limit = Math.max(1, Math.min(100, Math.trunc(operation.limit ?? 10)));
          const bounded: SearchItem[] = [];
          let bytes = 0;
          for (const item of results.slice(offset, offset + limit)) {
            bytes += Buffer.byteLength(JSON.stringify(item));
            if (bytes > 3 * 1024 * 1024) break;
            bounded.push(item);
          }
          return bounded;
        }
        const conditions = operation.matchConditions ?? [];
        const namespaces = new Map<string, string[]>();
        for (const row of this.rows()) {
          if (
            !conditions.every((condition) =>
              condition.matchType === 'prefix'
                ? begins(row.namespace, condition.path)
                : condition.path.every(
                    (part, index) =>
                      part === '*' ||
                      row.namespace[row.namespace.length - condition.path.length + index] === part,
                  ),
            )
          )
            continue;
          const namespace = row.namespace.slice(0, operation.maxDepth);
          namespaces.set(JSON.stringify(namespace), namespace);
        }
        const offset = Math.max(0, Math.trunc(operation.offset));
        const limit = Math.max(1, Math.min(100, Math.trunc(operation.limit)));
        return [...namespaces.values()]
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
          .slice(offset, offset + limit);
      }),
    ) as OperationResults<Op>;
  }
}

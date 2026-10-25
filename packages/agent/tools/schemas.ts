import rpcSchema from '../../contracts/schemas/rpc.schema.json';
import runtimeSchema from '../../contracts/schemas/runtime.schema.json';
import type { RpcContract } from '../../contracts/src/rpc-types';
import { MaaToolError } from './errors';

type Document = 'rpc' | 'runtime';
const documents = { rpc: rpcSchema, runtime: runtimeSchema };
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Expand only selected contract fragments; no network or arbitrary schema URI. */
function expand(value: unknown, document: Document, ancestors = new Set<string>()): unknown {
  if (Array.isArray(value)) return value.map(item => expand(item, document, ancestors));
  if (!object(value)) return value;
  if (typeof value.$ref === 'string') {
    const [file, pointer] = value.$ref.split('#');
    const target: Document = !file ? document : file === './runtime.schema.json' ? 'runtime' : file === './rpc.schema.json' ? 'rpc'
      : (() => { throw new MaaToolError('schema_error', '工具契约包含不支持的引用'); })();
    if (!pointer?.startsWith('/')) throw new MaaToolError('schema_error', '工具契约引用无效');
    const identity = `${target}#${pointer}`;
    if (ancestors.has(identity)) throw new MaaToolError('schema_error', '工具契约包含递归引用');
    let selected: unknown = documents[target];
    for (const key of pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
      if (!object(selected) || !Object.hasOwn(selected, key)) throw new MaaToolError('schema_error', '工具契约引用不存在');
      selected = selected[key];
    }
    const expanded = expand(selected, target, new Set([...ancestors, identity]));
    if (!object(expanded)) throw new MaaToolError('schema_error', '工具契约引用不是对象');
    return { ...expanded, ...Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$ref').map(([key, item]) => [key, expand(item, document, ancestors)])) };
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expand(item, document, ancestors)]));
}

export function rpcToolSchema(method: keyof RpcContract['params'], omit: readonly string[] = []): Record<string, unknown> {
  const source = rpcSchema.properties.params.properties[method];
  if (!source) throw new MaaToolError('schema_error', '工具对应的业务契约不存在');
  const result = expand(source, 'rpc') as Record<string, unknown>;
  const properties = object(result.properties) ? result.properties : {};
  for (const field of omit) delete properties[field];
  result.properties = properties;
  if (Array.isArray(result.required)) result.required = result.required.filter(field => !omit.includes(String(field)));
  return result;
}

export const emptySchema: Record<string, unknown> = expand(rpcSchema.$defs.EmptyParams, 'rpc') as Record<string, unknown>;

export const taskProposalSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: expand(runtimeSchema.$defs.Plan.properties.name, 'runtime'),
    tasks: expand(runtimeSchema.$defs.Plan.properties.tasks, 'runtime'),
  },
  required: ['name', 'tasks'],
};

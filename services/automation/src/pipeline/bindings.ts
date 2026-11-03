/** JSON 数据绑定只读取本次输入和已完成步骤；不解释表达式、路径文件或任意代码。 */
import { AtomicFailure } from '../core/errors';

export type PipelineScope = { input: Record<string, unknown>; steps: Record<string, unknown> };

/** RFC 6901 的本地片段形式；每个属性必须真实存在，不沿原型链取值。 */
function readPointer(reference: string, scope: PipelineScope): unknown {
  if (!reference.startsWith('#/')) throw new AtomicFailure(`Pipeline 引用无效：${reference}`);
  // URI 片段先解码，再按 JSON Pointer 的 ~0/~1 规则解析属性名。
  let pointer: string;
  try {
    pointer = decodeURIComponent(reference.slice(2));
  } catch {
    throw new AtomicFailure('JSON Pointer URI 转义无效');
  }
  const tokens = pointer.split('/').map((token) => {
    if (/~(?![01])/u.test(token)) throw new AtomicFailure('JSON Pointer 转义无效');
    return token.replace(/~1/gu, '/').replace(/~0/gu, '~');
  });
  if (tokens[0] !== 'input' && tokens[0] !== 'steps')
    throw new AtomicFailure('Pipeline 只能引用本次 input 或已完成 steps');
  let value: unknown = scope;
  for (const token of tokens) {
    if (
      !value ||
      typeof value !== 'object' ||
      (Array.isArray(value) && !/^(?:0|[1-9]\d*)$/u.test(token)) ||
      !Object.hasOwn(value, token)
    )
      throw new AtomicFailure(`Pipeline 引用尚无值：${reference}`);
    value = (value as Record<string, unknown>)[token];
  }
  return structuredClone(value);
}

/** 只把单独的 {$ref:...} 对象当引用；其他对象/数组按字面结构递归复制。 */
export function resolvePipelineValue(value: unknown, scope: PipelineScope, depth = 0): unknown {
  if (depth > 64) throw new AtomicFailure('Pipeline 参数嵌套过深');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value))
    return value.map((item) => resolvePipelineValue(item, scope, depth + 1));
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (Object.hasOwn(object, '$ref')) {
      if (Object.keys(object).length !== 1 || typeof object.$ref !== 'string')
        throw new AtomicFailure('Pipeline $ref 必须是独立的字符串引用');
      return readPointer(object.$ref, scope);
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, item]) => [
        key,
        resolvePipelineValue(item, scope, depth + 1),
      ]),
    );
  }
  throw new AtomicFailure('Pipeline 参数必须是有限 JSON 数据');
}

/** 截图结果可在当前调用中传递；限制整体数据大小，避免无限积累步骤结果。 */
export function assertPipelineDataSize(value: unknown) {
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 32 * 1024 * 1024)
    throw new AtomicFailure('Pipeline 本次数据超过 32 MiB 限制');
}

import { parsePlan, type Plan } from './models';
import { RpcError } from './errors';

// Python strip/re use this whitespace set, Unicode digits and Unicode word
// boundaries. JavaScript's trim and ASCII \d/\b have different semantics.
const nonWhitespace = /[^\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;
const stagePattern = /(?<![\p{L}\p{N}_])\p{Nd}{1,2}-\p{Nd}{1,2}(?![\p{L}\p{N}_])/u;
const countPattern = /(\p{Nd}{1,3})[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]*(?:次|把|局)/u;
const decimalDigit = /\p{Nd}/u;
function decimalInteger(text: string): number {
  let value = 0;
  for (const digit of text) {
    const code = digit.codePointAt(0)!;
    let start = code;
    // Adjacent Nd blocks (including mathematical digits) repeat 0..9.
    while (start > 0 && decimalDigit.test(String.fromCodePoint(start - 1))) start--;
    value = value * 10 + (code - start) % 10;
  }
  return value;
}

/** Deterministic proposal harness. Tools execute only through the reviewed RPC plan. */
export function propose(message: unknown, mode: string, validate: (plan: Plan) => void) {
  if (typeof message !== 'string' || !nonWhitespace.test(message) || [...message].length > 4000) throw new RpcError(-32602, '请输入 1 到 4000 字的目标');
  if (mode !== 'mock') throw new RpcError(-32030, '云模型尚未接入；请切换 mock 查看本地计划演示');
  let name = 'Agent 日常计划', tasks: any[];
  if (['刷', '作战', '1-7', '材料'].some(word => message.includes(word))) {
    const stage = message.match(stagePattern)?.[0] || '1-7';
    const count = message.match(countPattern)?.[1];
    tasks = [{ type: 'Fight', params: { stage, times: count ? Math.max(1, decimalInteger(count)) : 6 } }]; name = stage + ' 材料补给';
  } else tasks = ['StartUp', 'Recruit', 'Infrast', 'Mall', 'Award'].map(type => ({ type, params: {} }));
  const plan = parsePlan({ id: '', name, tasks }); validate(plan);
  return { reply: '这是本地规则生成的演示计划，未调用云端模型。请检查任务，保存后手动执行。消耗额度默认均为 0。', plan, requiresConfirmation: true, mode: 'mock' };
}

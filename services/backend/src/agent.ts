import { parsePlan, type Plan } from './models';
import { RpcError } from './errors';

/** Deterministic proposal harness. Tools execute only through the reviewed RPC plan. */
export function propose(message: unknown, mode: string, validate: (plan: Plan) => void) {
  if (typeof message !== 'string' || !message.trim() || [...message].length > 4000) throw new RpcError(-32602, '请输入 1 到 4000 字的目标');
  if (mode !== 'mock') throw new RpcError(-32030, '云模型尚未接入；请切换 mock 查看本地计划演示');
  let name = 'Agent 日常计划', tasks: any[];
  if (['刷', '作战', '1-7', '材料'].some(word => message.includes(word))) {
    const stage = message.match(/\b\d{1,2}-\d{1,2}\b/)?.[0] || '1-7';
    const count = message.match(/(\d{1,3})\s*(?:次|把|局)/)?.[1];
    tasks = [{ type: 'Fight', params: { stage, times: count ? Math.max(1, Number(count)) : 6 } }]; name = stage + ' 材料补给';
  } else tasks = ['StartUp', 'Recruit', 'Infrast', 'Mall', 'Award'].map(type => ({ type, params: {} }));
  const plan = parsePlan({ id: '', name, tasks }); validate(plan);
  return { reply: '这是本地规则生成的演示计划，未调用云端模型。请检查任务，保存后手动执行。消耗额度默认均为 0。', plan, requiresConfirmation: true, mode: 'mock' };
}

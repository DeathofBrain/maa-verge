import { AgentInputError, proposeDeterministic } from '@maaverge/agent';
import { parsePlan, type Plan } from '@backend/modules/settings/models';
import { RpcError } from '@backend/shared/errors';

/** 将本地规则草稿交给任务表解析与策略校验；这里只返回提案，不保存或启动执行。 */
export function propose(message: unknown, validate: (plan: Plan) => void) {
  try {
    return proposeDeterministic(message, (draft) => {
      const plan = parsePlan(draft);
      validate(plan);
      return plan;
    });
  } catch (error) {
    if (error instanceof AgentInputError) throw new RpcError(-32602, error.message);
    throw error;
  }
}

import { AgentInputError, proposeDeterministic } from '@maaverge/agent';
import { parsePlan, type Plan } from '../settings/models';
import { RpcError } from '../../shared/errors';

/** Deterministic proposal harness. Tools execute only through the reviewed RPC plan. */
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

const countFields = ['stone', 'medicine', 'expedite_times', 'expiring_medicine', 'medicine_expire_days'] as const;
const toggleFields = ['expedite', 'use_sanity_potion'] as const;

export class AgentProposalPolicyError extends Error {
  constructor() { super('当前模型提案仅支持零源石、零理智药和零加急消耗'); this.name = 'AgentProposalPolicyError'; }
}

/** No consumable authorization port exists yet, so a model cannot request spend. */
export function assertZeroConsumableProposal(tasks: unknown): void {
  if (!Array.isArray(tasks)) throw new AgentProposalPolicyError();
  for (const task of tasks) {
    const params = task?.params;
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw new AgentProposalPolicyError();
    // Check disabled tasks too, so enabling an edited draft cannot reveal a
    // hidden request for consumables. The host still validates every parameter.
    if (countFields.some(field => Object.hasOwn(params, field) && params[field] !== 0)
      || toggleFields.some(field => Object.hasOwn(params, field) && params[field] !== false)) throw new AgentProposalPolicyError();
  }
}

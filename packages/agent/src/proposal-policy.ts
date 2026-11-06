const countFields = [
  'stone',
  'medicine',
  'expedite_times',
  'expiring_medicine',
  'medicine_expire_days',
] as const;
const toggleFields = ['expedite', 'use_sanity_potion'] as const;

export class AgentProposalPolicyError extends Error {
  constructor() {
    super('当前模型提案仅支持零源石、零理智药和零加急消耗');
    this.name = 'AgentProposalPolicyError';
  }
}

/** 该提案入口没有消耗授权端口，因此草稿只能声明零药石、零加急消耗。 */
export function assertZeroConsumableProposal(tasks: unknown): void {
  if (!Array.isArray(tasks)) throw new AgentProposalPolicyError();
  for (const task of tasks) {
    const params = task?.params;
    if (!params || typeof params !== 'object' || Array.isArray(params))
      throw new AgentProposalPolicyError();
    // 停用任务同样检查，避免用户启用草稿时暴露隐藏消耗；其余参数仍由宿主完整校验。
    if (
      countFields.some((field) => Object.hasOwn(params, field) && params[field] !== 0) ||
      toggleFields.some((field) => Object.hasOwn(params, field) && params[field] !== false)
    )
      throw new AgentProposalPolicyError();
  }
}

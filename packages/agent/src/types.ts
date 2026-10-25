/** Untrusted proposal; the host normalizes it and applies its plan policy. */
export interface AgentPlanDraft {
  id: '';
  name: string;
  tasks: Array<{ type: string; params: Record<string, unknown> }>;
}

/** Every proposal requires review before it can be saved or executed. */
export interface AgentProposal<TPlan, TMode extends 'mock' | 'langchain'> {
  reply: string;
  plan: TPlan;
  requiresConfirmation: true;
  mode: TMode;
}

/** The host owns schema normalization and deterministic policy validation. */
export type PreparePlan<TPlan> = (draft: unknown) => TPlan;

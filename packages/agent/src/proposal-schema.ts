import runtimeSchema from '../../contracts/schemas/runtime.schema.json';

// Derive plan/task fields from the authoritative contract, without giving the
// model control over saved IDs, device bindings, schedules or budget settings.
export const proposalSchema = {
  title: 'AgentPlanProposal',
  description: '待用户审阅的 Maa Verge 任务表草稿；生成提案不会保存或执行任务。',
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    reply: { type: 'string', minLength: 1, maxLength: 2000 },
    plan: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: runtimeSchema.$defs.Plan.properties.name,
        tasks: runtimeSchema.$defs.Plan.properties.tasks,
      },
      required: ['name', 'tasks'],
    },
  },
  required: ['reply', 'plan'],
  $defs: { Task: runtimeSchema.$defs.Task },
};

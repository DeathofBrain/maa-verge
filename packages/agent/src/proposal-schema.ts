import runtimeSchema from '../../contracts/schemas/runtime.schema.json';

// 从权威契约提取名称和任务结构；不向模型开放已保存 ID、设备绑定、定时或预算字段。
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

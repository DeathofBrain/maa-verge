/** 保留可识别的输入错误类型，由应用适配层映射成 RPC 参数错误。 */
export class AgentInputError extends Error {
  constructor(message = '请输入 1 到 4000 字的目标') {
    super(message);
    this.name = 'AgentInputError';
  }
}

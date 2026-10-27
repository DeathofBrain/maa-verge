/** Invalid user input; the application adapter maps this to its transport error. */
export class AgentInputError extends Error {
  constructor(message = '请输入 1 到 4000 字的目标') {
    super(message);
    this.name = 'AgentInputError';
  }
}

/** 应用编排注入操作执行器，feature 不依赖全局 pending 与提示的实现。 */
export type ActionRunner = (
  key: string,
  call: () => Promise<unknown>,
  success?: string,
) => Promise<boolean>;

// 工具边界用稳定错误码区分参数、范围、授权和结果错误，供宿主转换为应用错误。
export class MaaToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MaaToolError';
  }
}

export class RpcError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
  }
  asDict() {
    return {
      code: this.code,
      message: this.message,
      ...(this.data === undefined ? {} : { data: this.data }),
    };
  }
}

/** Known system failures are actionable even when an operation did not wrap them. */
export function systemErrorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return;
  const messages: Record<string, string> = {
    ENOSPC: '磁盘空间不足，无法完成操作；请清理配置或下载目录所在磁盘后重试',
    SQLITE_FULL: '保存数据时磁盘空间不足，请清理配置目录所在磁盘后重试',
    EACCES: '没有权限访问所需文件或目录，请检查配置、下载或导出目录的访问权限',
    EPERM: '系统拒绝了文件操作，请检查目录权限，以及文件是否被安全软件拦截',
    EROFS: '目标目录位于只读磁盘，无法写入；请在设置中选择可写目录',
    ENOENT: '所需文件或目录不存在，请检查所配置的路径后重试',
    EBUSY: '所需文件或目录正被其他程序占用，请关闭占用程序后重试',
  };
  return typeof error.code === 'string' ? messages[error.code] : undefined;
}

const fallback = '操作失败，未返回具体原因。请重试；若仍失败，可在设置中导出诊断日志。';

function decode(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function hasSpecificChineseReason(message: string): boolean {
  if (!/^(?:\p{Script=Han}|(?:ADB|MaaCore|MaaResource)\b)/u.test(message)) return false;
  const reason = /[：:；;]\s*(.+)/s.exec(message)?.[1];
  return !!reason && /^(?:(?:ADB|MaaCore|MaaResource)\s*)?\p{Script=Han}/u.test(reason) && !/^请(?:查看|检查|导出).*日志/.test(reason)
    || /未找到|不存在|空间不足|只读|没有.*权限|访问权限|尚未授权|设备.*离线|调试.*未开启/.test(message);
}

/** Translate only recognizable evidence; a failed connection alone proves no cause. */
function readable(text: string): string {
  const message = text.trim().replace(/^(?:(?:[A-Za-z]*Error|RpcError):\s*)+/, '');
  if (message === '[object Object]') return '';
  if (hasSpecificChineseReason(message)) return message.slice(0, 1600);
  if (/importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module/iu.test(message)) return message.slice(0, 1600);
  if (/\b(?:ENOSPC|disk full|no space left on device)\b/i.test(message)) return '存储空间不足，请清理目标磁盘后重试。';
  if (/\bEROFS\b|read[- ]only file system/i.test(message)) return '目标目录是只读的，请选择可写的保存目录后重试。';
  if (/\bEBUSY\b|resource busy|sharing violation/i.test(message)) return '所需文件正被其他程序占用，请关闭占用该文件的程序后重试。';
  if (/\b(?:EACCES|EPERM|permission denied)\b/i.test(message)) return '没有访问所需文件或程序的权限，请检查文件和保存目录的访问权限。';
  if (/\bspawn\s+(?:[^\n]*[\\/])?adb(?:\.exe)?["']?\s+ENOENT\b/i.test(message)) return '找不到 ADB 程序，请在设备连接设置中选择有效的 ADB 路径。';
  if (/\bENOENT\b|no such file or directory/i.test(message)) return '找不到所需文件或程序，请检查文件是否存在及配置路径是否正确。';
  if (/device\s+(?:is\s+)?unauthorized|unauthorized[^\n]*(?:adb|device)|(?:adb|设备)[^\n]*unauthorized/i.test(message)) return '设备尚未授权 ADB 调试，请在模拟器或手机上确认调试授权后重试。';
  if (/device\s+(?:is\s+)?offline/i.test(message)) return '设备处于离线状态，请重新连接设备，或重启模拟器后重试。';
  if (/cannot connect to adb server|adb server didn['’]?t ack|adb[^\n]*(?:failed to start daemon|cannot connect to daemon)|(?:failed to start daemon|cannot connect to daemon)[^\n]*adb/i.test(message)) return 'ADB 服务启动或连接失败，请检查 ADB 配置及端口占用后重试。';
  if (/\b(?:ENOTFOUND|EAI_AGAIN)\b|getaddrinfo[^\n]*(?:failed|not known)|could not resolve host/i.test(message)) return '无法解析服务器地址，请检查网络、代理设置和服务器地址后重试。';
  if (/\bECONNREFUSED\b|connection (?:was )?refused|actively refused/i.test(message)) return '目标地址拒绝连接，请确认对应服务已启动，并检查连接地址和端口。';
  if (/\bETIMEDOUT\b|(?:connect(?:ion)?|request|download)\s+(?:timed out|timeout)/i.test(message)) return '连接或请求超时，请检查目标服务、网络和代理设置后重试。';
  if (/failed to fetch|fetch failed|networkerror|network request failed|\b(?:ECONNRESET|ENETUNREACH|EHOSTUNREACH)\b|socket hang up/i.test(message)) return '网络连接失败，请检查网络和代理设置后重试。';
  return message.slice(0, 1600);
}

/** Shared by bridge rejections, stored device failures and update notifications. */
export function errorMessage(cause: unknown): string {
  const seen = new Set<object>();
  const describe = (value: unknown, depth: number): string => {
    if (value === null || value === undefined || depth > 5) return '';
    const decoded = decode(value);
    if (decoded !== value) return describe(decoded, depth + 1);
    if (typeof value === 'string') return readable(value);
    if (typeof value !== 'object') return String(value);
    if (seen.has(value)) return '';
    seen.add(value);
    const record = value as Record<string, unknown>;
    const message = describe(record.message, depth + 1);
    // The service already decorates known failures; keep its concrete explanation.
    if (hasSpecificChineseReason(message)) return message;
    const detail = describe(record.data ?? record.error ?? record.reason ?? record.cause ?? record.details, depth + 1);
    if (message || detail) return message && detail && !message.includes(detail) ? `${message}：${detail}` : message || detail;
    if (!Object.keys(record).length) return '';
    try { return readable(JSON.stringify(value)); } catch { return ''; }
  };
  return describe(cause, 0) || fallback;
}

export class RuntimeRequestError extends Error {
  readonly code?: number;
  readonly data?: unknown;
  constructor(cause: unknown) {
    super(errorMessage(cause), { cause });
    this.name = 'RuntimeRequestError';
    const value = decode(cause);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.code === 'number') this.code = record.code;
      this.data = record.data;
    }
  }
}

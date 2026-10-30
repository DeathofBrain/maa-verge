const zh = (value: string, options: Intl.DateTimeFormatOptions) =>
  new Date(value).toLocaleString('zh-CN', options);

/** 月日时分。沿用主页与设置页原有写法，不显式指定 hour12 以保持渲染逐字节不变。 */
export function formatDate(value: string): string {
  return zh(value, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** 月日时分秒（24 小时制），用于日志行与执行详情的精确时间戳。 */
export function formatDateTime(value: string): string {
  return zh(value, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** 年月日时分秒（24 小时制），用于导出的日志文本。 */
export function formatDateTimeFull(value: string): string {
  return zh(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** 总时长，回答「这一次一共跑了多久」；小时段用「小时」。 */
export function formatDuration(start: string, end: string | null | undefined, now: number): string {
  const seconds = secondsBetween(start, end, now);
  if (seconds === null) return '—';
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分`
    : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

/** 已用时，回答「现在进行到哪了」，供执行监控按秒刷新；小时段用「时」以适配窄列。 */
export function formatElapsed(start: string, end: string | null | undefined, now: number): string {
  const seconds = secondsBetween(start, end, now);
  if (seconds === null) return '—';
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)} 时 ${Math.floor((seconds % 3600) / 60)} 分`
    : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}

function secondsBetween(start: string, end: string | null | undefined, now: number) {
  const seconds = Math.max(
    0,
    Math.floor(((end ? Date.parse(end) : now) - Date.parse(start)) / 1000),
  );
  return Number.isFinite(seconds) ? seconds : null;
}

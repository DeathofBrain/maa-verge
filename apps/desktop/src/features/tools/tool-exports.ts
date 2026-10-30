import type { RpcResult } from '@maaverge/contracts';
type Result = RpcResult<'recognition.get'>;
export type ExportFormat = 'json' | 'arkplanner' | 'lolicon' | 'markdown' | 'csv';
const csv = (value: unknown) => '"' + String(value ?? '').replaceAll('"', '""') + '"';
export function recognitionExport(
  result: Result,
  format: ExportFormat,
): { text: string; extension: string; mime: string } {
  if (format === 'json')
    return { text: JSON.stringify(result, null, 2), extension: 'json', mime: 'application/json' };
  if (format === 'arkplanner')
    return {
      text: JSON.stringify(
        {
          '@type': '@penguin-statistics/depot',
          items: result.items.map((item) => ({
            id: item.id,
            have: item.quantity,
            name: item.name,
          })),
        },
        null,
        2,
      ),
      extension: 'json',
      mime: 'application/json',
    };
  if (format === 'lolicon')
    return {
      text: JSON.stringify(
        Object.fromEntries(result.items.map((item) => [item.id, item.quantity])),
        null,
        2,
      ),
      extension: 'json',
      mime: 'application/json',
    };
  const rows: unknown[][] =
    result.kind === 'depot'
      ? [
          ['物品 ID', '物品', '数量'],
          ...result.items.map((item) => [item.id, item.name, item.quantity]),
        ]
      : [
          ['干员 ID', '干员', '持有', '星级', '精英化', '等级', '潜能'],
          ...result.operators.map((item) => [
            item.id,
            item.name,
            item.own ? '是' : '否',
            item.rarity,
            item.elite,
            item.level,
            item.potential,
          ]),
        ];
  if (format === 'csv')
    return {
      text: '\ufeff' + rows.map((row) => row.map(csv).join(',')).join('\r\n'),
      extension: 'csv',
      mime: 'text/csv',
    };
  const escape = (value: unknown) =>
    String(value ?? '')
      .replaceAll('|', '\\|')
      .replace(/[\r\n]/g, ' ');
  return {
    text: rows
      .map(
        (row, index) =>
          '| ' +
          row.map(escape).join(' | ') +
          ' |' +
          (index === 0 ? '\n| ' + row.map(() => '---').join(' | ') + ' |' : ''),
      )
      .join('\n'),
    extension: 'md',
    mime: 'text/markdown',
  };
}
export function downloadRecognition(result: Result, format: ExportFormat) {
  const output = recognitionExport(result, format),
    url = URL.createObjectURL(new Blob([output.text], { type: output.mime + ';charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `maaverge-${result.kind}-${result.deviceId}-${result.clientType}.${output.extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

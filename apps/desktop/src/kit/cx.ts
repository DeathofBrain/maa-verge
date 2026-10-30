/**
 * 将多个 CSS 类名用空格拼接，忽略 false、null、undefined 和空字符串。
 * 支持通过“条件 && '类名'”按需添加样式类，例如 cx('button', isActive && 'active')。
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ');
}

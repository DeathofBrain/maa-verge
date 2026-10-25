/** Open an explicitly selected webpage in the system browser through the desktop host. */
export async function openExternalUrl(value: string): Promise<void> {
  let url: URL;
  try {
    if (value.length > 2048 || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error();
    url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
  } catch { throw new Error('仅支持不含账号信息的 HTTP(S) 网页链接。'); }
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) throw new Error('未连接桌面运行时，无法打开系统浏览器。');
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external_url', { url: url.href });
  } catch (cause) {
    throw new Error(`无法打开系统浏览器：${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
}

// 仅通过桌面原生选择器返回目录；用户取消以 null 表达，不回退到浏览器文件访问。
export interface DirectoryPickerOptions {
  defaultPath?: string;
}

export async function pickDirectory(options: DirectoryPickerOptions = {}): Promise<string | null> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window))
    throw new Error('选择目录仅在桌面应用中可用');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string | null>('pick_directory', { defaultPath: options.defaultPath ?? null });
}

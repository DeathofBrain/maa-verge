export interface DirectoryPickerOptions {
  defaultPath?: string;
}

export async function pickDirectory(options: DirectoryPickerOptions = {}): Promise<string | null> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window))
    throw new Error('选择目录仅在桌面应用中可用');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string | null>('pick_directory', { defaultPath: options.defaultPath ?? null });
}

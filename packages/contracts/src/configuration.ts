export interface ConfigurationLocations {
  directory: string;
  database: string;
  defaultDirectory: string;
  configuredDirectory: string | null;
  nextDirectory: string;
  selectorFile: string;
  overridden: boolean;
  source: 'default' | 'saved' | 'environment' | 'schedule';
  restartRequired: boolean;
}

async function invokeConfiguration<T>(
  command: string,
  params?: Record<string, unknown>,
): Promise<T> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window))
    throw new Error('配置目录操作仅在桌面应用中可用');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, params);
}

export function getConfigurationLocations(): Promise<ConfigurationLocations> {
  return invokeConfiguration('get_configuration_locations');
}

export function saveConfigurationDirectory(directory: string): Promise<ConfigurationLocations> {
  return invokeConfiguration('save_configuration_directory', { directory });
}

export function openConfigurationDirectory(): Promise<void> {
  return invokeConfiguration('open_configuration_directory');
}

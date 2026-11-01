export const debugPreferenceKey = 'maaverge:ui:debug-enabled';

export function readDebugPreference(): boolean {
  try {
    return localStorage.getItem(debugPreferenceKey) === 'true';
  } catch {
    return false;
  }
}

export function saveDebugPreference(enabled: boolean): void {
  try {
    localStorage.setItem(debugPreferenceKey, String(enabled));
  } catch {
    // The current window can still unlock Debug when preference storage is unavailable.
  }
}

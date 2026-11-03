/** Resolve one device's screenshot and input policies without mutating either preference. */
import { emulatorInstanceForAddress } from '@backend/infrastructure/native/adb';
import type { EmulatorInventory } from '@backend/infrastructure/native/windows-emulators';
import type {
  FrameworkConfiguration,
  FrameworkConnection,
} from '@backend/infrastructure/native/framework-worker';
import { automaticCapture } from '@backend/modules/devices/auto-capture';
import { connectionCapture } from '@backend/modules/devices/capture';

type ResolvedConnection = Pick<FrameworkConfiguration, 'touchMode' | 'capture' | 'touchExtras'>;
export async function frameworkConnection(
  selected: FrameworkConnection | undefined,
  address: string,
  inventory: EmulatorInventory,
  platform = process.platform,
): Promise<ResolvedConnection> {
  const touchMode = selected?.touchMode ?? 'maatouch';
  const requested = selected?.capture ?? { method: 'auto', emulatorPath: '', instanceIndex: 0 };
  const known = emulatorInstanceForAddress(address, inventory);
  let capture: NonNullable<FrameworkConfiguration['capture']> = { ...requested };
  if (requested.method === 'auto') {
    const detected = automaticCapture(undefined, address, inventory, platform);
    if (detected?.capture.method !== 'adb' && detected?.instance) capture = { ...detected.capture };
  }
  if (capture.method === 'mumu' || capture.method === 'ldplayer') {
    const checked = await connectionCapture(
      {
        method: capture.method,
        emulatorPath: capture.emulatorPath,
        instanceIndex: capture.instanceIndex,
      },
      address,
      platform,
      known,
    );
    capture = {
      method: checked.method,
      emulatorPath: checked.emulatorPath,
      instanceIndex: checked.instanceIndex,
      ...(checked.pid === undefined ? {} : { pid: checked.pid }),
    };
  }
  if (touchMode !== 'emulator-extras') return { touchMode, capture };
  // MaaFW 5.14 uses the same extras node for emulator input and screenshots.
  // A single target cannot be both MuMu and LD/AVD; reject conflicting choices.
  if (capture.method === 'ldplayer' || capture.method === 'avd')
    throw new Error('模拟器触控增强仅支持 MuMu，不能与雷电或 AVD 截图组合');
  if (capture.method === 'auto')
    throw new Error('未自动识别到 MuMu，请重新发现设备或选择明确的截图方式后启用模拟器触控增强');
  const extras =
    (selected?.touchExtras?.emulatorPath.trim() ? selected.touchExtras : undefined) ??
    (known && known.kind !== 'ldplayer'
      ? { emulatorPath: known.emulatorPath, instanceIndex: known.index }
      : undefined);
  if (!extras) throw new Error('模拟器触控增强需要 MuMu 安装目录和实例编号');
  const checked = await connectionCapture({ method: 'mumu', ...extras }, address, platform, known);
  if (
    capture.method === 'mumu' &&
    (capture.emulatorPath.toLowerCase() !== checked.emulatorPath.toLowerCase() ||
      capture.instanceIndex !== checked.instanceIndex)
  )
    throw new Error('MuMu 截图和触控增强必须指向同一安装目录与实例');
  return {
    touchMode,
    capture,
    touchExtras: { emulatorPath: checked.emulatorPath, instanceIndex: checked.instanceIndex },
  };
}

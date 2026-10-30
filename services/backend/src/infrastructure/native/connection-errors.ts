/** Translate only errors whose cause is supported by ADB/native diagnostics. */
export function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error.replace(/^Error:\s*/, '');
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string')
    return error.message;
  return '未返回具体错误原因';
}

export function connectionError(
  error: unknown,
  context: 'connection' | 'adb' = 'connection',
): string {
  const detail = errorDetail(error);
  const extra =
    error && typeof error === 'object'
      ? (error as { stderr?: unknown; code?: unknown; killed?: unknown })
      : {};
  const evidence = [detail, typeof extra.stderr === 'string' ? extra.stderr : '', extra.code].join(
    '\n',
  );
  if (/\bunauthorized\b|device still authorizing/i.test(evidence))
    return '设备尚未授权 ADB 调试，请在模拟器或设备上允许 USB 调试后重试';
  if (/\bdevice\s+(?:is\s+)?offline\b|^offline$/i.test(evidence.trim()))
    return '设备的 ADB 连接已离线，请等待模拟器启动完成，或重新连接设备后重试';
  if (
    /cannot connect to daemon|failed to start (?:the )?daemon|ADB server didn.t ACK|cannot connect to (?:the )?ADB server/i.test(
      evidence,
    )
  )
    return 'ADB 服务未启动或无法访问，请启动模拟器的 ADB 服务，并检查连接设置中的 ADB 路径';
  if (
    /connection refused|actively refused|ECONNREFUSED|目标计算机积极拒绝|连接被拒绝/i.test(evidence)
  )
    return '连接地址或端口拒绝连接，请确认模拟器已启动、ADB 调试已开启，并核对连接地址和端口';
  if (
    /\bdevice\b.*\bnot found\b|\bno devices?\/emulators? found\b|address appears to be serial number but device not found/i.test(
      evidence,
    )
  )
    return '未找到指定设备，请确认设备已连接、模拟器已启动，并核对连接地址';
  if (
    /\b(?:ETIMEDOUT|timed out|timeout)\b/i.test(evidence) ||
    (context === 'adb' && extra.killed === true)
  )
    return context === 'adb'
      ? 'ADB 连接或命令响应超时，请确认模拟器已启动完成，并检查连接地址后重试'
      : '设备连接或初始化超时，请等待模拟器启动完成，并检查连接与截图设置后重试';
  if (context === 'adb' && (extra.code === 'ENOENT' || /^spawn .+ ENOENT$/.test(detail)))
    return '找不到 ADB 可执行文件，请在连接设置中重新选择有效的 ADB 路径';
  if (context === 'adb' && (extra.code === 'EACCES' || /^spawn .+ EACCES$/.test(detail)))
    return '没有权限运行 ADB，请检查所选文件的执行权限，或重新选择模拟器内置的 ADB';
  return detail.slice(0, 4096);
}

/** ConnectionInfo arrives before the final asynchronous Connect result. */
export function nativeConnectionError(info: any): string | undefined {
  const what = typeof info?.what === 'string' ? info.what : '';
  if (
    ![
      'ConnectFailed',
      'UnsupportedResolution',
      'ResolutionError',
      'ScreencapFailed',
      'TouchModeNotAvailable',
    ].includes(what)
  )
    return;
  const why = typeof info.why === 'string' ? info.why : '';
  const raw = typeof info.details?.raw_output === 'string' ? info.details.raw_output : '';
  const evidence = [raw, why].filter(Boolean).join('\n');
  if (evidence && connectionError(evidence, 'adb') !== evidence.slice(0, 4096))
    return connectionError(evidence, 'adb');
  if (what === 'UnsupportedResolution')
    return '设备分辨率不受支持，请将模拟器调整为 MAA 支持的横屏分辨率后重新连接';
  if (what === 'ResolutionError')
    return '无法读取设备分辨率，请等待模拟器启动完成，并检查连接设置后重试';
  if (what === 'ScreencapFailed') return '无法获取设备画面，请检查模拟器状态和截图设置后重新连接';
  if (what === 'TouchModeNotAvailable')
    return '当前触控方式不可用，请在连接设置中切换触控方式后重试';
  if (why === 'ConfigNotFound')
    return '未找到所选连接配置，请在连接设置中选择匹配的模拟器类型，或使用通用模式';
  if (why === 'Connection command failed to exec')
    return 'ADB 连接命令执行失败，请检查 ADB 路径、执行权限和模拟器状态';
  if (why === 'Connection command did not report "connected"')
    return 'ADB 未确认设备连接，请确认模拟器已启动、ADB 调试已开启，并核对连接地址';
  const commands: Record<string, string> = {
    Uuid: '设备标识',
    'Android version': '安卓版本',
    Display: '屏幕信息',
  };
  for (const [command, label] of Object.entries(commands))
    if (why.startsWith(command + ' command failed') || why.startsWith(command + ' invalid'))
      return `无法通过 ADB 读取${label}，请等待模拟器启动完成，并检查 ADB 调试授权后重试`;
  return evidence
    ? `设备连接失败：${evidence.slice(0, 3500)}`
    : '设备连接失败，核心未返回具体原因；请确认模拟器已启动、ADB 调试已开启，并核对连接地址';
}

export function nativeStartupError(error: unknown): string {
  const detail = errorDetail(error),
    code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (/^native timeout in .+; result unknown, do not replay$/.test(detail))
    return '核心原生调用超时，操作结果未知；请核对设备现场后重新连接，不会自动重放操作';
  if (code === 'ENOENT' || /^spawn .+ ENOENT$/.test(detail))
    return '核心工作进程文件不存在，请重新安装 Maa Verge 后重试';
  if (code === 'EACCES' || /^spawn .+ EACCES$/.test(detail))
    return '没有权限启动核心工作进程，请检查 Maa Verge 安装目录的执行权限';
  if (detail === 'device lock busy or unavailable')
    return '无法取得设备控制权，设备可能正被另一个 Maa Verge 实例占用；请检查其他窗口的连接状态和设备锁目录权限';
  if (
    /cannot load (?:client )?resource snapshot|resource snapshot missing|client resource directory missing/i.test(
      detail,
    )
  )
    return '核心资源缺失或加载失败，请在更新中心修复核心和游戏资源后重新连接';
  if (/missing MaaCore C API symbol|MaaCore version mismatch/i.test(detail))
    return '当前 MaaCore 版本不兼容或文件不完整，请在更新中心修复核心后重新连接';
  if (
    /missing MaaCore library|cannot (?:load|open).*MaaCore|MaaCore load failed|failed to load.*(?:library|MaaCore)/i.test(
      detail,
    )
  )
    return 'MaaCore 文件缺失或加载失败，请在更新中心修复核心，并检查系统依赖是否齐全';
  return errorDetail(detail).slice(0, 4096);
}

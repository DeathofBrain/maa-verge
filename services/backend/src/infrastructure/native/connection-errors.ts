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

export function nativeStartupError(error: unknown): string {
  const detail = errorDetail(error),
    code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (/^native timeout in .+; result unknown, do not replay$/.test(detail))
    return '原生调用超时，操作结果未知；请核对设备现场后重新连接，不会自动重放操作';
  if (code === 'ENOENT' || /^spawn .+ ENOENT$/.test(detail))
    return '原生工作进程文件不存在，请重新安装 Maa Verge 后重试';
  if (code === 'EACCES' || /^spawn .+ EACCES$/.test(detail))
    return '没有权限启动原生工作进程，请检查 Maa Verge 安装目录的执行权限';
  if (detail === 'device lock busy or unavailable')
    return '无法取得设备控制权，设备可能正被另一个 Maa Verge 实例占用；请检查其他窗口的连接状态和设备锁目录权限';
  if (
    /cannot load (?:client )?resource snapshot|resource snapshot missing|client resource directory missing/i.test(
      detail,
    )
  )
    return '资源缺失或加载失败，请在更新中心修复游戏资源后重新连接';
  if (/missing MaaFramework symbol|MaaFramework version mismatch/i.test(detail))
    return '当前 MaaFramework 版本不兼容或文件不完整，请在更新中心修复 MaaFramework 后重新连接';
  if (
    /missing MaaFramework library|cannot (?:load|open).*MaaFramework|MaaFramework load failed|failed to load.*(?:library|MaaFramework)/i.test(
      detail,
    )
  )
    return 'MaaFramework 文件缺失或加载失败，请在更新中心修复 MaaFramework，并检查系统依赖是否齐全';
  return errorDetail(detail).slice(0, 4096);
}

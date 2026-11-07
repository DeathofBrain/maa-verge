// 解析现有原生 worker 可执行文件的位置；缺失时由调用方报错，不隐式下载或切换运行时。

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function nativeWorkerPath(): string {
  if (process.env.MAAVERGE_CORE_WORKER_PATH)
    return path.resolve(process.env.MAAVERGE_CORE_WORKER_PATH);
  const name = 'maaverge-core-worker' + (process.platform === 'win32' ? '.exe' : '');
  const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
  const candidates = [
    path.join(path.dirname(process.execPath), name),
    path.join(moduleRoot, 'build/native/Release', name),
    path.join(moduleRoot, 'build/native', name),
    path.join(process.cwd(), 'build/native/Release', name),
    path.join(process.cwd(), 'build/native', name),
  ];
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  throw new Error('未找到 C++ MaaCore 工作进程，请先构建原生组件');
}

// 隔离更新作业的独立入口，仅处理单次输入输出，不创建应用运行时或业务数据库连接。

import { runUpdateJobStdio } from './updates.ts';

runUpdateJobStdio().catch((error) => {
  process.stderr.write(String(error instanceof Error ? error.stack : error) + '\n');
  process.exitCode = 1;
});

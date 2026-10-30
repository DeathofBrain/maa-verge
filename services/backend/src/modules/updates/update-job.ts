import { runUpdateJobStdio } from './updates.ts';

runUpdateJobStdio().catch((error) => {
  process.stderr.write(String(error instanceof Error ? error.stack : error) + '\n');
  process.exitCode = 1;
});

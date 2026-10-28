/** Require a successful Checks run for the exact commit referenced by a release tag. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const acceptedEvents = new Set(['push', 'pull_request', 'workflow_dispatch']);
const waitMinutes = 30;
const missingRunGraceMinutes = 5;
const pollMilliseconds = 20_000;

export function evaluateChecksRuns(runs, sha) {
  const matching = (Array.isArray(runs) ? runs : []).filter(
    (run) =>
      run &&
      typeof run === 'object' &&
      run.head_sha === sha &&
      acceptedEvents.has(run.event) &&
      typeof run.status === 'string',
  );
  const ordered = [...matching].sort((left, right) =>
    String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')),
  );
  const describe = (run) => ({
    conclusion: run.conclusion,
    event: run.event,
    id: run.id,
    status: run.status,
    url: run.html_url,
  });
  const success = ordered.find((run) => run.status === 'completed' && run.conclusion === 'success');
  if (success) return { state: 'success', run: describe(success) };
  const pending = ordered.find((run) => run.status !== 'completed');
  if (pending) return { state: 'pending', run: describe(pending) };
  if (ordered.length) return { state: 'failed', run: describe(ordered[0]) };
  return { state: 'missing' };
}

function parseOptions(arguments_) {
  const options = {};
  if (arguments_.length % 2 !== 0) throw new Error('发行检查参数必须成对出现');
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    if (!['--sha', '--tag'].includes(name)) throw new Error(`未知参数：${name}`);
    if (options[name] !== undefined) throw new Error(`重复参数：${name}`);
    options[name] = arguments_[index + 1];
  }
  return options;
}

function fetchRuns(repository, sha) {
  const endpoint = `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`;
  try {
    const parsed = JSON.parse(
      execFileSync('gh', ['api', endpoint], {
        encoding: 'utf8',
        env: process.env,
        timeout: 60_000,
      }),
    );
    if (!Array.isArray(parsed.workflow_runs))
      throw new Error('GitHub Actions returned an unexpected response');
    return parsed.workflow_runs;
  } catch (error) {
    throw new Error(`无法查询该提交的 Checks 运行：${error.stderr?.trim() || error.message}`);
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const sha = options['--sha'];
  const tag = options['--tag'];
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) throw new Error('--sha 必须是完整的 40 位提交 SHA');
  if (
    tag !== undefined &&
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(tag)
  )
    throw new Error('--tag 不是合法的发行标签');
  const repository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? ''))
    throw new Error('GITHUB_REPOSITORY 必须指向 owner/repository');
  const ref = tag ?? '<tag>';
  const started = Date.now();
  for (;;) {
    const result = evaluateChecksRuns(fetchRuns(repository, sha), sha);
    if (result.state === 'success') {
      console.log(`提交 ${sha} 的 Checks 已通过：${result.run.url}`);
      return;
    }
    if (result.state === 'failed')
      throw new Error(
        `提交 ${sha} 的 Checks 未通过（${result.run.conclusion}）：${result.run.url}`,
      );
    const elapsedMinutes = (Date.now() - started) / 60_000;
    if (result.state === 'pending') {
      if (elapsedMinutes >= waitMinutes)
        throw new Error(`等待提交 ${sha} 的 Checks 超过 ${waitMinutes} 分钟，请补跑 ci.yml 后重试`);
      console.log(`等待提交 ${sha} 的 Checks 完成（${result.run.url}）`);
    } else {
      if (elapsedMinutes >= missingRunGraceMinutes)
        throw new Error(
          `提交 ${sha} 没有成功的 Checks 运行。请先执行 "gh workflow run ci.yml --ref ${ref}"，通过后再重跑 Release`,
        );
      console.log(`提交 ${sha} 的 Checks 运行尚未出现，继续等待`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMilliseconds));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

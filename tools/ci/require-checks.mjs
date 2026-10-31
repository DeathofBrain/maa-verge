/** Require a successful full Checks run for the exact commit referenced by a release tag. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const acceptedEvents = new Set(['push', 'pull_request', 'workflow_dispatch']);
const waitMinutes = 30;
const missingRunGraceMinutes = 5;
const pollMilliseconds = 20_000;
const fullValidationJob = 'full-validation';

function matchingRuns(runs, sha) {
  return (Array.isArray(runs) ? runs : []).filter(
    (run) =>
      run &&
      typeof run === 'object' &&
      run.head_sha === sha &&
      acceptedEvents.has(run.event) &&
      typeof run.status === 'string',
  );
}

function validationJob(run) {
  const jobs = Array.isArray(run.jobs) ? run.jobs : [];
  const matching = jobs.filter(
    (job) =>
      job?.name === fullValidationJob &&
      (job.run_attempt === undefined || job.run_attempt === run.run_attempt),
  );
  // A duplicate marker is ambiguous; it must never attest a complete run.
  return matching.length === 1 ? matching[0] : undefined;
}

export function evaluateChecksRuns(runs, sha) {
  const matching = matchingRuns(runs, sha);
  const ordered = [...matching].sort((left, right) =>
    String(right.created_at ?? '').localeCompare(String(left.created_at ?? '')),
  );
  const describe = (run) => ({
    conclusion: run.conclusion,
    event: run.event,
    id: run.id,
    status: run.status,
    url: run.html_url,
    validationConclusion: validationJob(run)?.conclusion,
  });
  const success = ordered.find((run) => {
    const job = validationJob(run);
    return (
      run.status === 'completed' &&
      run.conclusion === 'success' &&
      job?.status === 'completed' &&
      job.conclusion === 'success'
    );
  });
  if (success) return { state: 'success', run: describe(success) };
  const pending = ordered.find((run) => run.status !== 'completed');
  if (pending) return { state: 'pending', run: describe(pending) };
  const failed = ordered.find((run) => {
    const job = validationJob(run);
    return job?.status === 'completed' && job.conclusion !== 'skipped';
  });
  if (failed) return { state: 'failed', run: describe(failed) };
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

function githubPages(endpoint) {
  return JSON.parse(
    execFileSync('gh', ['api', '--paginate', '--slurp', endpoint], {
      encoding: 'utf8',
      env: process.env,
      timeout: 60_000,
    }),
  );
}

export function fetchChecksRuns(repository, sha, request = githubPages) {
  try {
    const pages = request(
      `repos/${repository}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`,
    );
    if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page?.workflow_runs)))
      throw new Error('GitHub Actions returned an unexpected runs response');
    return matchingRuns(
      pages.flatMap((page) => page.workflow_runs),
      sha,
    ).map((run) => {
      if (run.status !== 'completed') return run;
      if (!Number.isSafeInteger(run.id) || run.id <= 0)
        throw new Error('GitHub Actions returned an invalid run ID');
      const jobPages = request(
        `repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`,
      );
      if (!Array.isArray(jobPages) || jobPages.some((page) => !Array.isArray(page?.jobs)))
        throw new Error('GitHub Actions returned an unexpected jobs response');
      return { ...run, jobs: jobPages.flatMap((page) => page.jobs) };
    });
  } catch (error) {
    throw new Error(`无法查询该提交的 Checks 运行：${error.stderr?.trim() || error.message}`);
  }
}

export async function waitForChecks(
  { repository, sha, tag },
  {
    fetchRuns = fetchChecksRuns,
    now = Date.now,
    sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    log = console.log,
  } = {},
) {
  const ref = tag ?? '<tag>';
  const started = now();
  for (;;) {
    const result = evaluateChecksRuns(fetchRuns(repository, sha), sha);
    if (result.state === 'success') {
      log(`提交 ${sha} 的完整 Checks 已通过：${result.run.url}`);
      return;
    }
    if (result.state === 'failed')
      throw new Error(
        `提交 ${sha} 的完整 Checks 未通过（${result.run.conclusion}/${result.run.validationConclusion}）：${result.run.url}`,
      );
    const elapsedMinutes = (now() - started) / 60_000;
    if (result.state === 'pending') {
      if (elapsedMinutes >= waitMinutes)
        throw new Error(
          `等待提交 ${sha} 的完整 Checks 超过 ${waitMinutes} 分钟，请先执行 "gh workflow run ci.yml --ref ${ref}"，通过后再重跑 Release`,
        );
      log(`等待提交 ${sha} 的 Checks 完成并确认完整检查（${result.run.url}）`);
    } else {
      if (elapsedMinutes >= missingRunGraceMinutes)
        throw new Error(
          `提交 ${sha} 没有成功的完整 Checks 运行（需要 ${fullValidationJob} 成功，精简检查不能用于发行）。请先执行 "gh workflow run ci.yml --ref ${ref}"，通过后再重跑 Release`,
        );
      log(`提交 ${sha} 的完整 Checks 运行尚未出现，继续等待`);
    }
    await sleep(pollMilliseconds);
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
  await waitForChecks({ repository, sha, tag });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

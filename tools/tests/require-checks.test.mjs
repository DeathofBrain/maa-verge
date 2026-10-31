import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateChecksRuns, fetchChecksRuns, waitForChecks } from '../ci/require-checks.mjs';

const sha = 'a'.repeat(40);
const fullJob = (patch = {}) => ({
  name: 'full-validation',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
  ...patch,
});
const run = (patch = {}) => ({
  id: 1,
  run_attempt: 1,
  head_sha: sha,
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  html_url: 'https://github.example/actions/runs/1',
  created_at: '2026-10-28T00:00:00Z',
  jobs: [fullJob()],
  ...patch,
});

test('a successful full Checks run for the exact commit passes immediately', () => {
  const result = evaluateChecksRuns([run()], sha);
  assert.equal(result.state, 'success');
  assert.equal(result.run.url, 'https://github.example/actions/runs/1');
});

test('successful reduced runs and skipped full markers cannot approve a release', () => {
  for (const jobs of [undefined, [], [fullJob({ conclusion: 'skipped' })]]) {
    assert.equal(evaluateChecksRuns([run({ jobs })], sha).state, 'missing');
  }
});

test('a failed or unfinished full marker cannot attest a successful workflow', () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required']) {
    const result = evaluateChecksRuns([run({ jobs: [fullJob({ conclusion })] })], sha);
    assert.equal(result.state, 'failed');
    assert.equal(result.run.validationConclusion, conclusion);
  }
  assert.equal(
    evaluateChecksRuns([run({ jobs: [fullJob({ status: 'in_progress', conclusion: null })] })], sha)
      .state,
    'missing',
  );
});

test('only the exact, unambiguous marker from the current attempt can approve a release', () => {
  for (const jobs of [
    [fullJob({ name: 'full-validation (skipped)' })],
    [fullJob(), fullJob()],
    [fullJob({ run_attempt: 1 })],
  ]) {
    assert.equal(evaluateChecksRuns([run({ run_attempt: 2, jobs })], sha).state, 'missing');
  }
  assert.equal(
    evaluateChecksRuns([run({ run_attempt: 2, jobs: [fullJob({ run_attempt: 2 })] })], sha).state,
    'success',
  );
  // Some jobs API responses omit run_attempt; filter=latest remains authoritative.
  assert.equal(
    evaluateChecksRuns([run({ jobs: [fullJob({ run_attempt: undefined })] })], sha).state,
    'success',
  );
});

test('an earlier complete success is reusable despite newer reduced successes or failures', () => {
  const result = evaluateChecksRuns(
    [
      run(),
      run({ id: 2, created_at: '2026-10-28T01:00:00Z', jobs: [] }),
      run({ id: 3, created_at: '2026-10-28T02:00:00Z', conclusion: 'failure' }),
    ],
    sha,
  );
  assert.equal(result.state, 'success');
  assert.equal(result.run.id, 1);
});

test('a later success wins over an earlier completed failure', () => {
  const result = evaluateChecksRuns(
    [
      run({ id: 1, conclusion: 'failure', created_at: '2026-10-28T00:00:00Z' }),
      run({ id: 2, conclusion: 'success', created_at: '2026-10-28T01:00:00Z' }),
    ],
    sha,
  );
  assert.equal(result.state, 'success');
  assert.equal(result.run.id, 2);
});

test('queued and running runs keep the release waiting even after a failure', () => {
  for (const status of ['queued', 'in_progress', 'requested', 'waiting', 'pending']) {
    const result = evaluateChecksRuns(
      [
        run({ id: 1, conclusion: 'failure', created_at: '2026-10-28T00:00:00Z' }),
        run({ id: 2, status, conclusion: null, created_at: '2026-10-28T01:00:00Z' }),
      ],
      sha,
    );
    assert.equal(result.state, 'pending');
    assert.equal(result.run.id, 2);
  }
});

test('completed unsuccessful runs fail the release with their conclusion', () => {
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required', 'stale']) {
    const result = evaluateChecksRuns([run({ conclusion })], sha);
    assert.equal(result.state, 'failed');
    assert.equal(result.run.conclusion, conclusion);
  }
});

test('missing Checks ignore other commits and unrelated events', () => {
  assert.equal(evaluateChecksRuns([], sha).state, 'missing');
  assert.equal(evaluateChecksRuns(undefined, sha).state, 'missing');
  assert.equal(evaluateChecksRuns([run({ head_sha: 'b'.repeat(40) })], sha).state, 'missing');
  assert.equal(evaluateChecksRuns([run({ event: 'schedule' })], sha).state, 'missing');
  assert.equal(evaluateChecksRuns([run({ event: 'release' })], sha).state, 'missing');
});

test('queries paginate runs and latest-attempt jobs, including markers on later pages', () => {
  const endpoints = [];
  const runsEndpoint = `repos/example/project/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=100`;
  const jobsEndpoint = 'repos/example/project/actions/runs/1/jobs?filter=latest&per_page=100';
  const runs = fetchChecksRuns('example/project', sha, (endpoint) => {
    endpoints.push(endpoint);
    if (endpoint === runsEndpoint)
      return [
        { workflow_runs: [run({ id: 5, head_sha: 'b'.repeat(40) })] },
        {
          workflow_runs: [
            run({ jobs: undefined }),
            run({ id: 2, status: 'in_progress', conclusion: null, jobs: undefined }),
          ],
        },
      ];
    assert.equal(endpoint, jobsEndpoint);
    return [{ jobs: [{ name: 'application', conclusion: 'success' }] }, { jobs: [fullJob()] }];
  });
  assert.deepEqual(endpoints, [runsEndpoint, jobsEndpoint]);
  assert.equal(runs.length, 2);
  assert.equal(evaluateChecksRuns(runs, sha).state, 'success');
});

test('unexpected runs or jobs API responses fail closed', () => {
  assert.throws(
    () => fetchChecksRuns('example/project', sha, () => ({ workflow_runs: [run()] })),
    /unexpected runs response/,
  );
  assert.throws(
    () =>
      fetchChecksRuns('example/project', sha, (endpoint) =>
        endpoint.includes('/workflows/') ? [{ workflow_runs: [run()] }] : [{ jobs: null }],
      ),
    /unexpected jobs response/,
  );
  assert.throws(
    () =>
      fetchChecksRuns('example/project', sha, () => [{ workflow_runs: [run({ id: '../other' })] }]),
    /invalid run ID/,
  );
});

function clock() {
  let elapsed = 0;
  const messages = [];
  return {
    now: () => elapsed,
    sleep: async (milliseconds) => {
      elapsed += milliseconds;
    },
    log: (message) => messages.push(message),
    elapsed: () => elapsed,
    messages,
  };
}

test('reduced successes wait only five minutes and explain how to request full validation', async () => {
  const timer = clock();
  await assert.rejects(
    waitForChecks(
      { repository: 'example/project', sha, tag: 'v0.1.3-alpha.1' },
      { ...timer, fetchRuns: () => [run({ jobs: [fullJob({ conclusion: 'skipped' })] })] },
    ),
    /需要 full-validation 成功.*gh workflow run ci\.yml --ref v0\.1\.3-alpha\.1/,
  );
  assert.equal(timer.elapsed(), 5 * 60_000);
});

test('a pending full run can succeed after reduced success and earlier failure', async () => {
  const timer = clock();
  const reduced = run({ jobs: [] });
  let requests = 0;
  await waitForChecks(
    { repository: 'example/project', sha, tag: 'v0.1.3-alpha.1' },
    {
      ...timer,
      fetchRuns: () => {
        requests++;
        return [
          reduced,
          run({ id: 2, conclusion: 'failure' }),
          run({
            id: 3,
            status: requests === 1 ? 'in_progress' : 'completed',
            conclusion: requests === 1 ? null : 'success',
          }),
        ];
      },
    },
  );
  assert.equal(requests, 2);
  assert.equal(timer.elapsed(), 20_000);
  assert.match(timer.messages.at(-1), /完整 Checks 已通过/);
});

test('pending checks retain the thirty-minute upper bound and the full-run command', async () => {
  const timer = clock();
  await assert.rejects(
    waitForChecks(
      { repository: 'example/project', sha, tag: 'v0.1.3-alpha.1' },
      {
        ...timer,
        fetchRuns: () => [run({ status: 'in_progress', conclusion: null, jobs: [] })],
      },
    ),
    /超过 30 分钟.*gh workflow run ci\.yml --ref v0\.1\.3-alpha\.1/,
  );
  assert.equal(timer.elapsed(), 30 * 60_000);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateChecksRuns } from '../ci/require-checks.mjs';

const sha = 'a'.repeat(40);
const run = (patch = {}) => ({
  id: 1,
  head_sha: sha,
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  html_url: 'https://github.example/actions/runs/1',
  created_at: '2026-10-28T00:00:00Z',
  ...patch,
});

test('a successful Checks run for the exact commit passes immediately', () => {
  const result = evaluateChecksRuns([run()], sha);
  assert.equal(result.state, 'success');
  assert.equal(result.run.url, 'https://github.example/actions/runs/1');
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

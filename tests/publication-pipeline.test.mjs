import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { refreshPublicContent } from '../scripts/update-public-content.mjs';
import { publishPublicContent } from '../scripts/publish-public-content.mjs';
import { fetchJson } from '../scripts/lib/public-data.mjs';

const exec = promisify(execFile);
const now = new Date('2026-10-31T12:00:00Z');
const event = { id: 'EVT-000001', title: 'Poznań test', start_date: '2026-11-02', end_date: '2026-11-03',
  location: 'Poznań', url: 'https://www.poznan.pl/mim/events/test,188318.html', source: 'Miasto Poznań',
  observed_at: '2026-10-31T11:00:00Z', revision: 1, status: 'scheduled', fresh: true, freshness: 'fresh' };
const feed = { schema: 'pzn.public-events.v1', timezone: 'Europe/Warsaw', coverage: 'partial', complete: false, events: [event] };
const rating = { kind: 'listing', slug: 'ratusz-view', rating: 4.9, reviews: 172,
  source_url: 'https://www.airbnb.com/rooms/1396133241621872627', method: 'authorized-api', observed_at: event.observed_at };
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
const json = async path => JSON.parse(await readFile(path, 'utf8'));

async function sourceFixture() {
  const root = await mkdtemp(join(tmpdir(), 'public-refresh-'));
  await mkdir(join(root, 'content/public'), { recursive: true });
  await writeJson(join(root, 'content/public/events.json'), { ...feed, events: [{ ...event, slug: 'poznan-evt-000001' }] });
  await writeJson(join(root, 'content/public/ratings.json'), { schema: 'stayinpoznan.ratings.v1', ratings: [rating] });
  return root;
}

test('source outage retains facts, last successful read and safe diagnostic metadata', async () => {
  const root = await sourceFixture();
  try {
    const lastSuccess = '2026-10-30T12:00:00Z';
    await writeJson(join(root, 'content/public/status.json'), { sources: [{ source: 'events', last_success_at: lastSuccess, private: 'SECRET' }] });
    const priorEvents = await readFile(join(root, 'content/public/events.json'), 'utf8');
    const priorRatings = await readFile(join(root, 'content/public/ratings.json'), 'utf8');
    const report = await refreshPublicContent({ root, now, readFeed: async () => { throw new Error('PRIVATE response at https://secret.invalid/token'); } });
    assert.equal(await readFile(join(root, 'content/public/events.json'), 'utf8'), priorEvents);
    assert.equal(await readFile(join(root, 'content/public/ratings.json'), 'utf8'), priorRatings);
    const status = await json(join(root, 'content/public/status.json'));
    assert.equal(status.sources[0].state, 'unavailable');
    assert.equal(status.sources[0].last_success_at, new Date(lastSuccess).toISOString());
    assert.equal(status.sources[0].latest_observed_at, new Date(event.observed_at).toISOString());
    assert.equal(status.sources[0].cached_records, 1);
    assert.equal(status.sources[1].state, 'not-configured');
    assert.doesNotMatch(JSON.stringify({ report, status }), /PRIVATE|SECRET|secret\.invalid|token/);
    assert.equal('published' in status, false);
    const repeated = await refreshPublicContent({ root, now, readFeed: async () => { throw new Error('A different raw private error'); } });
    assert.equal(repeated.status_changed, false);
    assert.equal(repeated.results.some(result => result.changed), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('successful source checks have durable evidence and identical inputs do not rewrite files', async () => {
  const root = await sourceFixture();
  try {
    const readFeed = async url => String(url).includes('mission.pzn.me') ? feed : { schema: 'stayinpoznan.ratings.v1', ratings: [rating] };
    const request = { root, now, readFeed, ratingsFeedUrl: 'https://ratings.example.com/public',
      workflowUrl: 'https://github.com/PiotrPoliszuk/stayinpoznan-www/actions/runs/12345' };
    const first = await refreshPublicContent(request);
    const status = await json(join(root, 'content/public/status.json'));
    assert.equal(first.results.every(result => result.state === 'read'), true);
    assert.equal(status.sources.every(source => source.last_success_at === now.toISOString()), true);
    assert.equal(status.workflow_url, request.workflowUrl);
    const second = await refreshPublicContent(request);
    assert.equal(second.status_changed, false);
    assert.equal(second.results.some(result => result.changed), false);
    await refreshPublicContent({ ...request, workflowUrl: 'https://malicious.invalid/token' });
    assert.equal((await json(join(root, 'content/public/status.json'))).workflow_url, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('workflow diagnostics separate HTTP, content and transport without exposing raw errors or changing public status', async () => {
  const cases = [
    ...[401, 403, 404, 500, 503].map(status => ({
      diagnostic: { kind: 'http', http_status: status },
      fetcher: async () => new Response('PRIVATE response body', { status, headers: { 'content-type': 'text/html' } }),
    })),
    { diagnostic: { kind: 'non-json', http_status: 200 },
      fetcher: async () => new Response('PRIVATE sign-in page', { headers: { 'content-type': 'text/html' } }) },
    ...[['ENOTFOUND', 'dns'], ['EAI_AGAIN', 'dns'], ['ECONNREFUSED', 'connection'],
      ['UND_ERR_CONNECT_TIMEOUT', 'timeout'], ['CERT_HAS_EXPIRED', 'tls'],
      ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls']].map(([code, kind]) => ({
      diagnostic: { kind, code },
      error: new TypeError('PRIVATE transport exception', { cause: Object.assign(new Error('SECRET hostname/address'), { code }) }),
    })),
    { diagnostic: { kind: 'connection', code: 'ECONNRESET' },
      error: new TypeError('PRIVATE aggregate', { cause: new AggregateError([
        Object.assign(new Error('SECRET address'), { code: 'ECONNRESET' }),
      ]) }) },
    { diagnostic: { kind: 'timeout' }, error: new DOMException('PRIVATE request', 'TimeoutError') },
    { diagnostic: { kind: 'redirect-blocked' },
      error: new TypeError('PRIVATE redirect URL', { cause: new Error('unexpected redirect') }) },
    { diagnostic: { kind: 'unknown' },
      error: Object.assign(new Error('PRIVATE https://secret.invalid/token'), { code: 'SECRET_CODE' }) },
  ];
  const root = await sourceFixture();
  try {
    const lastSuccess = '2026-10-30T12:00:00.000Z';
    await writeJson(join(root, 'content/public/status.json'), { sources: [{ source: 'events', last_success_at: lastSuccess }] });
    const previousEvents = await readFile(join(root, 'content/public/events.json'), 'utf8');
    let previousStatus;
    for (const sample of cases) {
      const readFeed = sample.error ? async () => { throw sample.error; }
        : async () => fetchJson('https://mission.pzn.me/api/public/events', { fetcher: sample.fetcher });
      const report = await refreshPublicContent({ root, now, readFeed });
      assert.deepEqual(report.results[0].diagnostic, sample.diagnostic);
      const status = await json(join(root, 'content/public/status.json'));
      assert.equal(status.sources[0].last_success_at, lastSuccess);
      assert.equal(status.sources[0].cached_records, 1);
      assert.equal('diagnostic' in status.sources[0], false);
      assert.doesNotMatch(JSON.stringify({ report, status }), /PRIVATE|SECRET|secret\.invalid|token|hostname|address/);
      assert.equal(await readFile(join(root, 'content/public/events.json'), 'utf8'), previousEvents);
      // Detailed failure changes do not rewrite a generic public observation.
      if (previousStatus && report.results[0].error === 'source-unavailable') {
        assert.equal(report.status_changed, previousStatus.sources[0].error !== 'source-unavailable');
      }
      previousStatus = status;
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid or backward source data cannot replace the cached observation', async () => {
  const root = await sourceFixture();
  try {
    const before = await readFile(join(root, 'content/public/events.json'), 'utf8');
    const report = await refreshPublicContent({ root, now,
      readFeed: async () => ({ ...feed, events: [{ ...event, revision: 0 }] }) });
    assert.equal(report.results[0].state, 'unavailable');
    assert.equal(report.results[0].error, 'invalid-source-data');
    assert.equal(await readFile(join(root, 'content/public/events.json'), 'utf8'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

const eligible = { GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GIT_TERMINAL_PROMPT: '0' };
async function gitFixture() {
  const root = await mkdtemp(join(tmpdir(), 'public-publication-'));
  const origin = join(root, 'origin.git'), cwd = join(root, 'work');
  await exec('git', ['init', '--bare', origin]);
  await exec('git', ['init', '-b', 'main', cwd]);
  const git = async (...args) => (await exec('git', args, { cwd })).stdout.trim();
  await git('config', 'user.name', 'Test'); await git('config', 'user.email', 'test@example.invalid');
  await mkdir(join(cwd, 'content/public'), { recursive: true });
  await writeFile(join(cwd, 'content/public/events.json'), '{}\n');
  await writeFile(join(cwd, 'sitemap.xml'), '<urlset/>\n');
  await writeFile(join(cwd, 'index.html'), '<p>before</p>\n');
  await writeFile(join(cwd, 'README.md'), 'source before\n');
  await git('add', '.'); await git('commit', '-m', 'initial');
  await git('remote', 'add', 'origin', origin); await git('push', '-u', 'origin', 'main');
  return { root, origin, cwd, git };
}

test('actual Git publisher pushes only public changes and makes no empty commit', async () => {
  const fixture = await gitFixture();
  const { root, origin, cwd, git } = fixture;
  try {
    await writeFile(join(cwd, 'index.html'), '<p>after</p>\n');
    await writeFile(join(cwd, 'content/public/status.json'), '{}\n');
    await mkdir(join(cwd, 'podglad'));
    await writeFile(join(cwd, 'podglad/index.html'), '<p>preview status</p>\n');
    await writeFile(join(cwd, 'README.md'), 'unrelated change\n');
    await writeFile(join(cwd, 'private.txt'), 'private must stay local\n');
    const report = await publishPublicContent({ cwd, env: eligible });
    assert.equal(report.state, 'pushed');
    assert.equal((await exec('git', ['--git-dir', origin, 'show', 'main:index.html'])).stdout, '<p>after</p>\n');
    assert.equal((await exec('git', ['--git-dir', origin, 'show', 'main:podglad/index.html'])).stdout, '<p>preview status</p>\n');
    assert.equal((await exec('git', ['--git-dir', origin, 'show', 'main:content/public/status.json'])).stdout, '{}\n');
    assert.equal((await exec('git', ['--git-dir', origin, 'show', 'main:README.md'])).stdout, 'source before\n');
    await assert.rejects(exec('git', ['--git-dir', origin, 'show', 'main:private.txt']));
    const head = await git('rev-parse', 'HEAD');
    assert.equal((await publishPublicContent({ cwd, env: eligible })).state, 'unchanged');
    assert.equal(await git('rev-parse', 'HEAD'), head);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('PR and non-main executions cannot write, and pre-staged source files stop publication', async () => {
  const { root, cwd, git } = await gitFixture();
  try {
    const before = await git('rev-parse', 'HEAD');
    for (const env of [{ ...eligible, GITHUB_EVENT_NAME: 'pull_request' }, { ...eligible, GITHUB_REF: 'refs/heads/feature' }, {}]) {
      await assert.rejects(publishPublicContent({ cwd, env }), /eligible main-branch/);
    }
    await writeFile(join(cwd, 'README.md'), 'unexpected staged source\n');
    await git('add', 'README.md');
    await assert.rejects(publishPublicContent({ cwd, env: eligible }), /outside the public/);
    assert.equal(await git('rev-parse', 'HEAD'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a concurrent main change rejects publication without overwriting the human commit', async () => {
  const { root, origin, cwd, git } = await gitFixture();
  try {
    const other = join(root, 'human');
    await exec('git', ['clone', '--branch', 'main', origin, other]);
    for (const [key, value] of [['user.name', 'Human'], ['user.email', 'human@example.invalid']]) await exec('git', ['config', key, value], { cwd: other });
    await writeFile(join(other, 'README.md'), 'human change\n');
    await exec('git', ['add', 'README.md'], { cwd: other }); await exec('git', ['commit', '-m', 'human'], { cwd: other });
    await exec('git', ['push', 'origin', 'main'], { cwd: other });
    const humanHead = (await exec('git', ['rev-parse', 'HEAD'], { cwd: other })).stdout.trim();
    await writeFile(join(cwd, 'index.html'), '<p>bot update from old source</p>\n');
    await assert.rejects(publishPublicContent({ cwd, env: eligible }));
    assert.equal((await exec('git', ['--git-dir', origin, 'rev-parse', 'main'])).stdout.trim(), humanHead);
    assert.equal(await git('show', 'origin/main:README.md'), 'source before');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('workflow validates every test and publishes the exact validated main revision', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const workflow = await readFile(join(root, '.github/workflows/public-content.yml'), 'utf8');
  assert.match(workflow, /node --test tests\/\*\.test\.mjs/);
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'push' \|\| github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'\)/);
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(workflow, /node scripts\/publish-public-content\.mjs/);
  assert.equal(workflow.match(/timeout-minutes: 10/g).length, 2);
  assert.doesNotMatch(workflow, /pull_request_target|git push.*--force|secrets\./);
});

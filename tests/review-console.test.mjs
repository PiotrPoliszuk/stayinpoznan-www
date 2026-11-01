import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { suggestionUrl } from '../assets/public-review.js';
import { renderReviewConsole } from '../scripts/lib/review-console.mjs';

const exec = promisify(execFile);
const now = new Date('2026-10-31T12:00:00Z');
const event = { id: 'EVT-000123', slug: 'poznan-evt-000123', title: 'Przykład </script><script>unsafe()</script>',
  start_date: '2026-11-02', end_date: '2026-11-04', location: 'Poznań', source: 'Miasto Poznań',
  observed_at: '2026-10-31T11:00:00Z', revision: 3, status: 'scheduled', fresh: true };

test('review snapshot is noindex and does not claim live source or deployment success', () => {
  const html = renderReviewConsole({ now });
  assert.match(html, /content="noindex,nofollow"/);
  assert.match(html, /Oczekiwanie na pierwszy odczyt automatu/);
  assert.match(html, /nie potwierdzają działania harmonogramu/);
  assert.match(html, /Stan źródła jest dowodem odczytu, nie potwierdzeniem wdrożenia Cloudflare/);
  assert.match(html, /05:15 zimą, 06:15 latem/);
  assert.match(html, /Zgłoszenie jest publiczne/);
});

test('rendered observations preserve source failure, stale rating and escaped EVT context', () => {
  const html = renderReviewConsole({ now, events: { events: [event] }, ratings: { ratings: [
    { kind: 'host', rating: 4.86, reviews: 351, observed_at: '2026-10-01T12:00:00Z' },
  ] }, status: { checked_at: '2026-10-31T10:00:00Z', workflow_url: 'https://evil.invalid/ignored', sources: [
    { source: 'events', state: 'unavailable', checked_at: '2026-10-31T10:00:00Z', last_success_at: '2026-10-30T10:00:00Z', cached_records: 1 },
  ] } });
  assert.match(html, /Źródło niedostępne/);
  assert.match(html, /Wygasła — ukryta na stronie/);
  assert.match(html, /EVT-000123/); assert.match(html, /rewizja 3/);
  assert.match(html, /&lt;\/script&gt;&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>unsafe\(\)<\/script>/);
  assert.doesNotMatch(html, /evil\.invalid/);
  const contexts = JSON.parse(html.match(/id="reviewContexts" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(contexts.find(item => item.key === event.id), { key: event.id, label: event.title,
    url: 'https://stayinpoznan.pl/wydarzenia/poznan-evt-000123/', record: event.id, revision: 3, observed_at: event.observed_at });
});

test('suggestion only creates a bounded draft URL with exact page and observation context', () => {
  const context = { url: 'https://stayinpoznan.pl/wydarzenia/poznan-evt-000123/', record: event.id, revision: 3, observed_at: event.observed_at };
  const url = new URL(suggestionUrl(context, 'Popraw termin', 'Proszę sprawdzić termin w aktualnym źródle.'));
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/PiotrPoliszuk/stayinpoznan-www/issues/new');
  assert.equal(url.searchParams.get('title'), '[Strona] Popraw termin');
  assert.match(url.searchParams.get('body'), /EVT-000123/);
  assert.match(url.searchParams.get('body'), /Rewizja: 3/);
  assert.match(url.searchParams.get('body'), /Obserwacja: 2026-10-31T11:00:00Z/);
  assert.throws(() => suggestionUrl(context, 'Short', 'x'.repeat(801)), /długość/);
  assert.throws(() => suggestionUrl({ ...context, url: 'https://foreign.invalid/' }, 'Popraw termin', 'Proszę sprawdzić termin.'), /adres/);
  assert.throws(() => suggestionUrl({ ...context, url: 'https://stayinpoznan.pl/?secret=bad' }, 'Popraw termin', 'Proszę sprawdzić termin.'), /adres/);
});

test('actual generator writes review page and keeps it out of marketing navigation and sitemap', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const temp = await mkdtemp(join(tmpdir(), 'stayinpoznan-review-'));
  try {
    // The fixture replaces the public event input. Keep its build independent
    // of event HTML committed by earlier real publication runs.
    await cp(root, temp, { recursive: true, filter: path => !path.includes('/.git')
      && !/^wydarzenia[\\/]poznan-evt-\d{6,}(?:[\\/]|$)/.test(relative(root, path)) });
    await writeFile(join(temp, 'content/public/events.json'), JSON.stringify({ schema: 'pzn.public-events.v1', events: [event] }));
    const env = { ...process.env, STAY_BUILD_DATE: now.toISOString() };
    await exec(process.execPath, ['scripts/build.mjs'], { cwd: temp, env });
    await exec(process.execPath, ['scripts/check-site.mjs'], { cwd: temp, env });
    const html = await readFile(join(temp, 'podglad/index.html'), 'utf8');
    assert.match(html, /content="noindex,nofollow"/);
    assert.match(html, /data-review-context="EVT-000123"/);
    assert.match(html, /assets\/public-review\.js/);
    assert.doesNotMatch(await readFile(join(temp, 'sitemap.xml'), 'utf8'), /\/podglad\//);
    assert.doesNotMatch(await readFile(join(temp, 'index.html'), 'utf8'), /href="\/podglad\/"/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

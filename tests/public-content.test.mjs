import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { EVENT_MAX_AGE, fetchJson, isFresh, mergeEvents, mergeRatings, normalizeEvents, normalizeRatings, todayWarsaw } from '../scripts/lib/public-data.mjs';

const exec = promisify(execFile);
const now = new Date('2026-10-31T12:00:00Z');
const fact = { id: 'EVT-000001', title: 'Wydarzenie <miasta>', start_date: '2026-11-02', end_date: '2026-11-03', location: 'Poznań <Centrum>', url: 'https://www.poznan.pl/mim/events/test,188318.html', source: 'Miasto Poznań', observed_at: '2026-10-31T11:00:00Z', revision: 1, status: 'scheduled', fresh: true, freshness: 'fresh' };
const feed = event => ({ schema: 'pzn.public-events.v1', timezone: 'Europe/Warsaw', coverage: 'partial', complete: false, events: event ? [event] : [] });
const rating = { kind: 'listing', slug: 'ratusz-view', rating: 4.9, reviews: 172, source_url: 'https://www.airbnb.com/rooms/1396133241621872627', method: 'authorized-api', observed_at: '2026-10-31T10:00:00Z' };

test('public events retain only typed facts and honest partial coverage', () => {
  const result = normalizeEvents(feed({ ...fact, guest_email: 'private@example.invalid', description: 'not allowed' }), now);
  assert.equal(result.complete, false); assert.equal(result.coverage, 'partial'); assert.equal(result.events[0].fresh, true);
  assert.equal('guest_email' in result.events[0], false); assert.equal('description' in result.events[0], false);
  assert.throws(() => normalizeEvents(feed({ ...fact, start_date: '2026-02-30' }), now));
  assert.throws(() => normalizeEvents(feed({ ...fact, url: 'https://example.com/events' }), now));
});
test('stable identities, cancellation and missing latest observations are preserved', () => {
  const first = mergeEvents(null, normalizeEvents(feed(fact), now));
  assert.equal(first.events[0].slug, 'poznan-evt-000001');
  const renamed = mergeEvents(first, normalizeEvents(feed({ ...fact, title: 'New title', revision: 2 }), now));
  assert.equal(renamed.events[0].slug, first.events[0].slug);
  assert.equal(mergeEvents(renamed, normalizeEvents(feed(null), now)).events[0].fresh, false);
  assert.equal(mergeEvents(renamed, normalizeEvents(feed({ ...fact, revision: 3, status: 'cancelled' }), now)).events[0].status, 'cancelled');
  assert.throws(() => mergeEvents(renamed, normalizeEvents(feed(fact), now)), /backwards/);
});
test('mixed City and MTP public facts preserve source attribution', () => {
  const mixed = feed(fact);
  mixed.events.push({ ...fact, id: 'EVT-000002', source: 'Grupa MTP', url: 'https://www.mtp.pl/pl/kalendarium/' });
  const result = normalizeEvents(mixed, now);
  assert.deepEqual(result.events.map(record => record.source), ['Miasto Poznań', 'Grupa MTP']);
  assert.match(result.attribution, /Grupa MTP/);
  assert.throws(() => normalizeEvents(feed({ ...fact, source: 'Grupa MTP' }), now), /source/);
});
test('future and stale timestamps do not become fresh; Warsaw day is explicit', () => {
  assert.equal(isFresh('2026-12-01T00:00:00Z', EVENT_MAX_AGE, now), false);
  assert.equal(normalizeEvents(feed({ ...fact, observed_at: '2026-10-01T00:00:00Z' }), now).events[0].fresh, false);
  assert.equal(todayWarsaw(new Date('2026-10-31T23:30:00Z')), '2026-11-01');
});
test('ratings require the correct source identity and never infer host averages', () => {
  const result = normalizeRatings({ schema: 'stayinpoznan.ratings.v1', ratings: [rating] }, now);
  assert.equal(result.ratings.length, 1); assert.equal(result.ratings[0].kind, 'listing');
  assert.throws(() => normalizeRatings({ schema: 'stayinpoznan.ratings.v1', ratings: [{ ...rating, source_url: 'https://www.airbnb.com/rooms/other' }] }, now));
  assert.throws(() => normalizeRatings({ schema: 'stayinpoznan.ratings.v1', ratings: [{ ...rating, kind: 'host' }] }, now));
  const host = normalizeRatings({ schema: 'stayinpoznan.ratings.v1', ratings: [{ ...rating, kind: 'host', source_section: 'host', rating: 4.86, reviews: 351 }] }, now);
  assert.equal(host.ratings[0].source_section, 'host'); assert.equal(host.ratings[0].rating, 4.86);
  assert.throws(() => normalizeRatings({ schema: 'stayinpoznan.ratings.v1', ratings: [{ ...rating, observed_at: '2026-08-20T00:00:00Z' }] }, now));
  assert.throws(() => mergeRatings(result, { schema: result.schema, ratings: [{ ...rating, observed_at: '2026-10-30T10:00:00Z' }] }), /backwards/);
  assert.deepEqual(mergeRatings(result, { schema: result.schema, ratings: [] }), result);
});
test('network reads are bounded JSON HTTPS and never follow redirects', async () => {
  let options;
  const fetched = await fetchJson('https://mission.pzn.me/api/public/events', { fetcher: async (_, opts) => { options = opts; return new Response('{"events":[]}', { headers: { 'content-type': 'application/json' } }); } });
  assert.deepEqual(fetched, { events: [] }); assert.equal(options.redirect, 'error');
  await assert.rejects(fetchJson('https://mission.pzn.me/api/public/events', { limit: 3, fetcher: async () => new Response('1234', { headers: { 'content-type': 'application/json' } }) }), /too large/);
  await assert.rejects(fetchJson('http://mission.pzn.me/events'), /HTTPS/);
});
test('HTTP and non-JSON failures retain only typed workflow metadata', async () => {
  const url = 'https://mission.pzn.me/api/public/events';
  for (const status of [401, 403, 404, 500, 503]) {
    await assert.rejects(fetchJson(url, { fetcher: async () => new Response('PRIVATE body', {
      status, headers: { 'content-type': 'text/html', 'x-private': 'SECRET' },
    }) }), error => {
      assert.equal(error.feedFailure, 'http'); assert.equal(error.httpStatus, status);
      assert.doesNotMatch(JSON.stringify(error), /PRIVATE|SECRET|x-private/);
      return true;
    });
  }
  await assert.rejects(fetchJson(url, { fetcher: async () => new Response('PRIVATE sign-in', {
    headers: { 'content-type': 'text/html' },
  }) }), error => error.feedFailure === 'non-json' && error.httpStatus === 200);
});
test('actual build adds stable pages and guide, escapes sources, retires past promotions and stale ratings', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const temp = await mkdtemp(join(tmpdir(), 'stayinpoznan-build-'));
  try {
    // The fixture replaces the public event input. Keep its build independent
    // of event HTML committed by earlier real publication runs.
    await cp(root, temp, { recursive: true, filter: path => !path.includes('/.git')
      && !/^wydarzenia[\\/]poznan-evt-\d{6,}(?:[\\/]|$)/.test(relative(root, path)) });
    await writeFile(join(temp, 'content/public/events.json'), JSON.stringify(mergeEvents(null, normalizeEvents(feed(fact), now))));
    await writeFile(join(temp, 'content/public/ratings.json'), JSON.stringify(normalizeRatings({ schema: 'stayinpoznan.ratings.v1', ratings: [rating] }, now)));
    const env = { ...process.env, STAY_BUILD_DATE: now.toISOString() };
    await exec(process.execPath, ['scripts/build.mjs'], { cwd: temp, env });
    await exec(process.execPath, ['scripts/check-site.mjs'], { cwd: temp, env });
    const home = await readFile(join(temp, 'index.html'), 'utf8');
    const page = await readFile(join(temp, 'wydarzenia/poznan-evt-000001/index.html'), 'utf8');
    assert.equal(home.includes('poznan-game-arena-2026'), false);
    assert.match(home, /4\.90/); assert.doesNotMatch(home, /4\.85/);
    assert.match(page, /Wydarzenie &lt;miasta&gt;/); assert.doesNotMatch(page, /<miasta>/);
    assert.match(await readFile(join(temp, 'poznan/teraz/index.html'), 'utf8'), /poznan-evt-000001/);
    await exec(process.execPath, ['scripts/build.mjs'], { cwd: temp, env: { ...env, STAY_BUILD_DATE: '2026-11-20T12:00:00Z' } });
    const stale = await readFile(join(temp, 'apartamenty/ratusz-view/index.html'), 'utf8');
    assert.doesNotMatch(stale, /AggregateRating|4\.90/);
    assert.match(await readFile(join(temp, 'wydarzenia/poznan-evt-000001/index.html'), 'utf8'), /Archiwum wydarzenia/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

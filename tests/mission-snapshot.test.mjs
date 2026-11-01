import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeMissionSnapshot, readMissionSnapshot, SNAPSHOT_PATH, PUBLIC_RATINGS_PATH } from '../scripts/lib/mission-snapshot.mjs';
import { normalizeReviews, mergeReviews } from '../scripts/lib/public-data.mjs';
import { refreshPublicContent } from '../scripts/update-public-content.mjs';

const exec = promisify(execFile);
const now = new Date('2026-11-01T09:00:00Z');
const event = { id: 'EVT-000009', title: 'Test <Poznań>', start_date: '2026-11-09', end_date: '2026-11-09',
  location: 'Poznań', url: 'https://www.poznan.pl/mim/events/test,188318.html', source: 'Miasto Poznań',
  observed_at: '2026-10-31T11:00:00Z', revision: 1, status: 'scheduled', fresh: true, freshness: 'fresh' };
const rating = { kind: 'listing', slug: 'ratusz-view', rating: 4.9, reviews: 172,
  source_url: 'https://www.airbnb.com/rooms/1396133241621872627', method: 'authorized-api', observed_at: event.observed_at };
const review = { id: 'fixture_review', slug: 'ratusz-view', rating: 5, author: 'Anna', excerpt: 'Świetny widok i <piękny> apartament.',
  published_date: '2026-10-01', observed_at: event.observed_at, source_url: rating.source_url,
  method: 'operator-export', public: true, republication: 'authorized' };
const snapshot = () => ({ schema: 'pzn.website-facts.v1', generated_at: now.toISOString(),
  events: { schema: 'pzn.public-events.v1', timezone: 'Europe/Warsaw', complete: false, coverage: 'partial', events: [event] },
  ratings: { schema: 'stayinpoznan.ratings.v1', ratings: [rating] },
  reviews: { schema: 'stayinpoznan.reviews.v1', reviews: [review] },
  source_states: { ratings: 'configured', reviews: 'configured' } });
const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value)}\n`);

test('outbound repository snapshot updates all public sources without a Mission network request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mission-public-'));
  try {
    await mkdir(join(root, 'content/incoming'), { recursive: true });
    await writeJson(join(root, SNAPSHOT_PATH), snapshot());
    const report = await refreshPublicContent({ root, now, readFeed: () => { throw new Error('PRIVATE network must not be called'); } });
    assert.equal(report.results.every(row => row.state === 'read'), true);
    assert.equal(report.results.every(row => row.acquisition === 'repository-snapshot'), true);
    const facts = JSON.parse(await readFile(join(root, 'content/public/events.json'), 'utf8'));
    assert.equal(facts.events[0].observed_at, event.observed_at);
    assert.equal(facts.events[0].slug, 'poznan-evt-000009');
    const status = JSON.parse(await readFile(join(root, 'content/public/status.json'), 'utf8'));
    assert.equal(status.sources[0].snapshot_at, now.toISOString());
    assert.equal(status.sources[0].latest_observed_at, new Date(event.observed_at).toISOString());
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('missing outbound setup is not confused with a successful empty acquisition or private DNS outage', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mission-unconfigured-'));
  try {
    await mkdir(join(root, 'content/public'), { recursive: true });
    await writeJson(join(root, 'content/public/ratings.json'), { schema: 'stayinpoznan.ratings.v1', ratings: [rating] });
    const report = await refreshPublicContent({ root, now, readFeed: () => { throw new Error('no network'); } });
    assert.equal(report.results.every(row => row.state === 'not-configured'), true);
    assert.equal(JSON.parse(await readFile(join(root, 'content/public/ratings.json'), 'utf8')).ratings[0].observed_at, rating.observed_at);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('separate public source observations update all three aggregates without Mission connectivity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-airbnb-observation-'));
  try {
    await mkdir(join(root, 'content/incoming'), { recursive: true });
    const host = { ...rating, kind: 'host', source_section: 'host', rating: 4.86, reviews: 351, method: 'public-page-observation' };
    delete host.slug;
    await writeJson(join(root, PUBLIC_RATINGS_PATH), { schema: 'stayinpoznan.ratings.v1', ratings: [{ ...rating, method: 'public-page-observation' }, host] });
    const report = await refreshPublicContent({ root, now, readFeed: () => { throw new Error('no HTTP'); } });
    assert.equal(report.results[0].state, 'not-configured');
    assert.equal(report.results[1].state, 'read'); assert.equal(report.results[1].acquisition, 'repository-rating-observation');
    assert.equal(report.results[2].state, 'not-configured');
    const saved = JSON.parse(await readFile(join(root, 'content/public/ratings.json'), 'utf8'));
    assert.equal(saved.ratings.find(row => row.kind === 'host').rating, 4.86);
    assert.equal(saved.ratings.find(row => row.kind === 'listing').rating, 4.9);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('snapshot identity, freshness, states and unknown top-level data are checked before publication', () => {
  for (const patch of [{ generated_at: '2026-10-29T00:00:00Z' }, { schema: 'private.mission.v1' },
    { guests: [{ name: 'PRIVATE' }] }, { source_states: { ratings: 'configured', reviews: 'not-configured' } },
    { source_states: { ratings: 'configured', reviews: 'configured', private: 'PRIVATE' } }]) {
    assert.throws(() => normalizeMissionSnapshot({ ...snapshot(), ...patch }, now), /Invalid/);
  }
  const facts = snapshot(); facts.events.events[0] = { ...event, email: 'PRIVATE', price: 100, booking_id: 'PRIVATE' };
  const normalized = normalizeMissionSnapshot(facts, now);
  assert.doesNotMatch(JSON.stringify(normalized), /PRIVATE|email|booking_id|price/);
});

test('missing ratings adapter permits event updates while keeping ratings and quotes unconfigured', () => {
  const facts = snapshot(); delete facts.ratings; delete facts.reviews;
  facts.source_states = { ratings: 'not-configured', reviews: 'not-configured' };
  const normalized = normalizeMissionSnapshot(facts, now);
  assert.equal(normalized.events.events.length, 1);
  assert.equal('ratings' in normalized, false); assert.equal('reviews' in normalized, false);
});

test('review imports require public authorized short excerpts, first names and exact listing identity', () => {
  for (const patch of [{ public: false }, { republication: 'unknown' }, { author: 'Anna Kowalska' },
    { author: 'guest1234' }, { excerpt: Array(21).fill('word').join(' ') }, { source_url: 'https://www.airbnb.com/rooms/999' },
    { source_url: rating.source_url + '?token=PRIVATE' }, { observed_at: '2026-10-01T00:00:00Z' }]) {
    assert.throws(() => normalizeReviews({ schema: 'stayinpoznan.reviews.v1', reviews: [{ ...review, ...patch }] }, now));
  }
  const normalized = normalizeReviews({ schema: 'stayinpoznan.reviews.v1', reviews: [{ ...review, guest_id: 'PRIVATE', private_feedback: 'PRIVATE' }] }, now);
  assert.doesNotMatch(JSON.stringify(normalized), /PRIVATE|guest_id|private_feedback/);
  assert.throws(() => mergeReviews(normalized, { schema: normalized.schema, reviews: [{ ...review, observed_at: '2026-10-30T00:00:00Z' }] }), /backwards/);
});

test('local snapshot reader rejects symlinks and oversized files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mission-bounded-'));
  try {
    await mkdir(join(root, 'content/incoming'), { recursive: true });
    const outside = join(root, 'outside.json'); await writeJson(outside, snapshot());
    await symlink(outside, join(root, SNAPSHOT_PATH));
    await assert.rejects(readMissionSnapshot(root, now));
    await rm(join(root, SNAPSHOT_PATH));
    await writeFile(join(root, SNAPSHOT_PATH), ' '.repeat(2 * 1024 * 1024 + 1));
    await assert.rejects(readMissionSnapshot(root, now), /size/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('actual generated property pages show attributed selected quotes, escape text and expire observations', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const temp = await mkdtemp(join(tmpdir(), 'mission-quotes-build-'));
  try {
    await cp(root, temp, { recursive: true, filter: path => !path.includes('/.git') });
    await writeJson(join(temp, 'content/public/reviews.json'), { schema: 'stayinpoznan.reviews.v1', reviews: [review] });
    const env = { ...process.env, STAY_BUILD_DATE: now.toISOString() };
    await exec(process.execPath, ['scripts/build.mjs'], { cwd: temp, env });
    await exec(process.execPath, ['scripts/check-site.mjs'], { cwd: temp, env });
    const page = await readFile(join(temp, 'apartamenty/ratusz-view/index.html'), 'utf8');
    assert.match(page, /Wybrane opinie/); assert.match(page, /&lt;piękny&gt;/); assert.doesNotMatch(page, /<piękny>/);
    assert.match(page, /Anna · 2026-10-01/); assert.match(page, /odczyt 2026-10-31/);
    const other = await readFile(join(temp, 'apartamenty/koziolki-view/index.html'), 'utf8');
    assert.doesNotMatch(other, /Świetny widok/);
    await exec(process.execPath, ['scripts/build.mjs'], { cwd: temp, env: { ...env, STAY_BUILD_DATE: '2026-11-20T12:00:00Z' } });
    assert.doesNotMatch(await readFile(join(temp, 'apartamenty/ratusz-view/index.html'), 'utf8'), /Świetny widok/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

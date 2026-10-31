import { writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJson, mergeEvents, mergeRatings, normalizeEvents, normalizeRatings, readJson, todayWarsaw } from './lib/public-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date(process.env.STAY_BUILD_DATE || Date.now());
if (!Number.isFinite(now.getTime())) throw new Error('Invalid build date');
const results = [];
async function save(name, value) {
  const path = join(root, 'content/public', `${name}.json`);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (JSON.stringify(await readJson(path, null)) === JSON.stringify(value)) return false;
  await writeFile(`${path}.tmp`, content, { mode: 0o644 }); await rename(`${path}.tmp`, path); return true;
}
const eventUrl = new URL('https://mission.pzn.me/api/public/events');
eventUrl.searchParams.set('start', todayWarsaw(now)); eventUrl.searchParams.set('days', '366');
try {
  const incoming = normalizeEvents(await fetchJson(eventUrl), now);
  const previous = await readJson(join(root, 'content/public/events.json'), { events: [] });
  const changed = await save('events', mergeEvents(previous, incoming));
  results.push({ source: 'events', state: 'read', changed, records: incoming.events.length, coverage: 'partial' });
} catch (error) { results.push({ source: 'events', state: 'unavailable', message: error.message }); }
if (process.env.STAY_RATINGS_FEED_URL) {
  try {
    const incoming = normalizeRatings(await fetchJson(process.env.STAY_RATINGS_FEED_URL), now);
    const previous = await readJson(join(root, 'content/public/ratings.json'), { ratings: [] });
    const changed = await save('ratings', mergeRatings(previous, incoming));
    results.push({ source: 'ratings', state: 'read', changed, records: incoming.ratings.length });
  } catch (error) { results.push({ source: 'ratings', state: 'unavailable', message: error.message }); }
} else results.push({ source: 'ratings', state: 'not-configured' });
const report = { schema: 'stayinpoznan.refresh.v1', results };
console.log(JSON.stringify(report));
if (process.env.STAY_REFRESH_REPORT) await writeFile(process.env.STAY_REFRESH_REPORT, JSON.stringify(report));
// Source outages retain the last known facts. The subsequent build still retires
// expired promotions and hides ratings once their observation expires.

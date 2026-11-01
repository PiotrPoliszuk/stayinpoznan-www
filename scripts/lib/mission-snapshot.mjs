import { open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { isFresh, normalizeEvents, normalizeRatings, normalizeReviews } from './public-data.mjs';
import { normalizeWebsiteSettings } from './website-settings.mjs';

export const SNAPSHOT_PATH = 'content/incoming/mission-public-facts.json';
export const PUBLIC_RATINGS_PATH = 'content/incoming/airbnb-public-ratings.json';
const LIMIT = 2 * 1024 * 1024;

export function normalizeMissionSnapshot(body, now = new Date()) {
  const allowed = new Set(['schema', 'generated_at', 'events', 'ratings', 'reviews', 'source_states', 'website']);
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !allowed.has(key)) || body.schema !== 'pzn.website-facts.v1'
      || !isFresh(body.generated_at, 36 * 3600_000, now)
      || !body.source_states || Object.keys(body.source_states).sort().join(',') !== 'ratings,reviews'
      || Object.values(body.source_states).some(state => !['configured', 'not-configured'].includes(state))) throw new Error('Invalid Mission public snapshot');
  const result = { events: normalizeEvents(body.events, now), generated_at: body.generated_at,
    source_states: { ...body.source_states } };
  for (const [source, normalizer] of [['ratings', normalizeRatings], ['reviews', normalizeReviews]]) {
    if ((body.source_states[source] === 'configured') !== Object.hasOwn(body, source)) throw new Error('Invalid Mission source state');
    if (body.source_states[source] === 'configured') result[source] = normalizer(body[source], now);
  }
  if (Object.hasOwn(body, 'website')) result.website = normalizeWebsiteSettings(body.website);
  return result;
}

export async function readMissionSnapshot(root, now = new Date()) {
  let file;
  try {
    file = await open(join(root, SNAPSHOT_PATH), constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > LIMIT) throw new Error('Invalid Mission public snapshot size');
    const raw = await file.readFile('utf8');
    if (Buffer.byteLength(raw) > LIMIT) throw new Error('Invalid Mission public snapshot size');
    return normalizeMissionSnapshot(JSON.parse(raw), now);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  } finally { await file?.close(); }
}

export async function readPublicRatingsSnapshot(root, now = new Date()) {
  let file;
  try {
    file = await open(join(root, PUBLIC_RATINGS_PATH), constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > 32768) throw new Error('Invalid public rating snapshot size');
    const raw = await file.readFile('utf8');
    if (Buffer.byteLength(raw) > 32768) throw new Error('Invalid public rating snapshot size');
    return normalizeRatings(JSON.parse(raw), now);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  } finally { await file?.close(); }
}

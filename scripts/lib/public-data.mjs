import { readFile } from 'node:fs/promises';

export const EVENT_SCHEMA = 'pzn.public-events.v1';
export const RATING_SCHEMA = 'stayinpoznan.ratings.v1';
export const REVIEW_SCHEMA = 'stayinpoznan.reviews.v1';
export const EVENT_MAX_AGE = 8 * 86400_000;
export const RATING_MAX_AGE = 14 * 86400_000;
export const REVIEW_MAX_AGE = 14 * 86400_000;
export const KNOWN_LISTINGS = new Map([
  ['ratusz-view', '1396133241621872627'],
  ['koziolki-view', '1396324973760158951'],
]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const todayWarsaw = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export function validDate(value) {
  return typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function isFresh(at, maxAge, now = new Date()) {
  const age = now.getTime() - Date.parse(at);
  return Number.isFinite(age) && age >= -300_000 && age <= maxAge;
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/u.test(value)) throw new Error('Invalid public text');
  return value.trim();
}
export function httpsUrl(value, allowedHosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !allowedHosts.has(url.hostname)) throw new Error('Unapproved public source URL');
  return url.href;
}
export function normalizeEvents(body, now = new Date()) {
  if (body?.schema !== EVENT_SCHEMA || body.timezone !== 'Europe/Warsaw' || body.complete !== false || body.coverage !== 'partial' || !Array.isArray(body.events) || body.events.length > 1000) throw new Error('Invalid events feed');
  const seen = new Set();
  const events = body.events.map(event => {
    if (!/^EVT-\d{6,}$/.test(event.id) || seen.has(event.id) || !validDate(event.start_date) || !validDate(event.end_date) || event.end_date < event.start_date || !['scheduled', 'cancelled'].includes(event.status) || !Number.isSafeInteger(event.revision) || event.revision < 1 || !Number.isFinite(Date.parse(event.observed_at))) throw new Error('Invalid event record');
    seen.add(event.id);
    const url = httpsUrl(event.url, new Set(['www.poznan.pl', 'www.mtp.pl']));
    const parsed = new URL(url);
    const source = event.source;
    if (parsed.search || parsed.hash || !(
      source === 'Miasto Poznań' && parsed.hostname === 'www.poznan.pl' && /^\/mim\/events\/[^/]+,\d+\.html$/.test(parsed.pathname)
      || source === 'Grupa MTP' && url === 'https://www.mtp.pl/pl/kalendarium/'
    )) throw new Error('Event source does not match its official URL');
    return { id: event.id, title: text(event.title, 300), start_date: event.start_date, end_date: event.end_date,
      location: typeof event.location === 'string' ? event.location.slice(0, 300) : '', url, status: event.status,
      source, observed_at: event.observed_at, revision: event.revision,
      fresh: event.fresh === true && event.freshness === 'fresh' && isFresh(event.observed_at, EVENT_MAX_AGE, now) };
  });
  return { schema: EVENT_SCHEMA, timezone: 'Europe/Warsaw', complete: false, coverage: 'partial',
    attribution: 'Źródła: Miasto Poznań i Grupa MTP. Szczegóły i aktualny status u organizatora.', events };
}
export function mergeEvents(previous, incoming) {
  const records = new Map((previous?.events || []).map(event => [event.id, { ...event, fresh: false }]));
  for (const event of incoming.events) {
    const old = records.get(event.id);
    if (old && (event.revision < old.revision || Date.parse(event.observed_at) < Date.parse(old.observed_at))) throw new Error('Events feed moved backwards');
    records.set(event.id, { ...event, slug: old?.slug || `poznan-${event.id.toLowerCase()}` });
  }
  if (records.size > 2000) throw new Error('Event archive limit reached; review retention before publishing');
  return { ...incoming, events: [...records.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
export function normalizeRatings(body, now = new Date()) {
  if (body?.schema !== RATING_SCHEMA || !Array.isArray(body.ratings) || body.ratings.length > 3) throw new Error('Invalid ratings feed');
  const seen = new Set();
  return { schema: RATING_SCHEMA, ratings: body.ratings.map(record => {
    const key = record.kind === 'host' ? 'host' : record.slug;
    if (!['host', 'listing'].includes(record.kind) || (record.kind === 'listing' && !KNOWN_LISTINGS.has(key)) || seen.has(key) || !Number.isFinite(record.rating) || record.rating < 0 || record.rating > 5 || !Number.isSafeInteger(record.reviews) || record.reviews < 1 || !['authorized-api', 'operator-export', 'public-page-observation'].includes(record.method) || !isFresh(record.observed_at, RATING_MAX_AGE, now)) throw new Error('Invalid or stale rating record');
    seen.add(key);
    const url = httpsUrl(record.source_url, new Set(['www.airbnb.com', 'airbnb.com', 'www.airbnb.pl', 'airbnb.pl']));
    if (new URL(url).search || new URL(url).hash) throw new Error('Rating source must not contain query data');
    const sourcePath = new URL(url).pathname;
    if (record.kind === 'listing' && sourcePath !== `/rooms/${KNOWN_LISTINGS.get(key)}`) throw new Error('Rating belongs to another listing');
    if (record.kind === 'host' && !(
      /^\/users\/(show|profile)\/\d+\/?$/.test(sourcePath)
      || record.source_section === 'host' && [...KNOWN_LISTINGS.values()].some(id => sourcePath === `/rooms/${id}`)
    )) throw new Error('Host rating needs an explicit host source section');
    return { kind: record.kind, ...(record.kind === 'listing' ? { slug: key } : {}), rating: record.rating, reviews: record.reviews,
      observed_at: record.observed_at, source_url: url, method: record.method,
      ...(record.kind === 'host' && record.source_section === 'host' ? { source_section: 'host' } : {}),
      ...(record.kind === 'host' && typeof record.superhost === 'boolean' ? { superhost: record.superhost } : {}) };
  }) };
}
export function mergeRatings(previous, incoming) {
  const key = record => record.kind === 'host' ? 'host' : record.slug;
  const records = new Map((previous?.ratings || []).map(record => [key(record), record]));
  for (const record of incoming.ratings) {
    const old = records.get(key(record));
    if (old && Date.parse(record.observed_at) < Date.parse(old.observed_at)) throw new Error('Ratings feed moved backwards');
    records.set(key(record), record);
  }
  return { schema: RATING_SCHEMA, ratings: [...records.values()] };
}
export function normalizeReviews(body, now = new Date()) {
  if (body?.schema !== REVIEW_SCHEMA || !Array.isArray(body.reviews) || body.reviews.length > 12) throw new Error('Invalid reviews feed');
  const seen = new Set();
  return { schema: REVIEW_SCHEMA, reviews: body.reviews.map(record => {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(record.id) || seen.has(record.id) || !KNOWN_LISTINGS.has(record.slug)
        || record.public !== true || record.republication !== 'authorized'
        || !['authorized-api', 'operator-export'].includes(record.method)
        || !Number.isFinite(record.rating) || record.rating < 0 || record.rating > 5
        || !validDate(record.published_date) || !isFresh(record.observed_at, REVIEW_MAX_AGE, now)) throw new Error('Invalid public review');
    const excerpt = text(record.excerpt, 240), author = text(record.author, 40);
    if (excerpt.split(/\s+/u).length > 20 || !/^\p{L}+(?:[-']\p{L}+)*$/u.test(author)) throw new Error('Invalid review excerpt or first name');
    const url = httpsUrl(record.source_url, new Set(['www.airbnb.com', 'airbnb.com', 'www.airbnb.pl', 'airbnb.pl']));
    const parsed = new URL(url);
    if (parsed.pathname !== `/rooms/${KNOWN_LISTINGS.get(record.slug)}` || parsed.search || parsed.hash) throw new Error('Review belongs to another listing');
    seen.add(record.id);
    return { id: record.id, slug: record.slug, rating: record.rating, excerpt, author,
      published_date: record.published_date, observed_at: record.observed_at, source_url: url,
      public: true, republication: 'authorized', method: record.method };
  }) };
}
export function mergeReviews(previous, incoming) {
  const records = new Map((previous?.reviews || []).map(record => [record.id, record]));
  for (const record of incoming.reviews) {
    const old = records.get(record.id);
    if (old && (old.slug !== record.slug || Date.parse(record.observed_at) < Date.parse(old.observed_at))) throw new Error('Reviews feed moved backwards');
    records.set(record.id, record);
  }
  // Quotes have no permanent detail-page URL. Older observations remain in Git
  // history while the working cache retains at most 100 recent public quotes.
  return { schema: REVIEW_SCHEMA, reviews: [...records.values()].sort((a, b) => b.published_date.localeCompare(a.published_date) || a.id.localeCompare(b.id)).slice(0, 100) };
}
export async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
export async function fetchJson(url, { fetcher = fetch, timeout = 15_000, limit = 2 * 1024 * 1024 } = {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port || /^[\d.:[\]]+$/.test(parsed.hostname) || !parsed.hostname.includes('.') || parsed.hostname.endsWith('.local')) throw new Error('Public HTTPS feed required');
  const response = await fetcher(parsed, { headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  if (!response.ok || !/application\/(?:[\w.-]+\+)?json/.test(response.headers.get('content-type') || '')) {
    // Typed metadata is for the workflow report. Never retain headers or bodies.
    throw Object.assign(new Error(`Feed unavailable (${response.status})`), {
      feedFailure: response.ok ? 'non-json' : 'http', httpStatus: response.status,
    });
  }
  if (Number(response.headers.get('content-length')) > limit) throw new Error('Feed too large');
  const reader = response.body.getReader();
  const decoder = new TextDecoder(); let content = ''; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > limit) throw new Error('Feed too large');
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
  } finally { await reader.cancel(); }
  return JSON.parse(content);
}

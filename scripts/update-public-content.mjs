import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchJson, mergeEvents, mergeRatings, mergeReviews, normalizeEvents, normalizeRatings, normalizeReviews, readJson, todayWarsaw } from './lib/public-data.mjs';
import { readMissionSnapshot, readPublicRatingsSnapshot } from './lib/mission-snapshot.mjs';

const defaultRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const validStamp = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

function publicError(error) {
  // A response body, URL or transport exception must never enter public status.
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'source-timeout';
  if (error?.message === 'Feed too large') return 'source-too-large';
  if (error instanceof SyntaxError || /^Invalid |^Event |^Rating|^Host |^Events |^Unapproved /.test(error?.message || '')) return 'invalid-source-data';
  return 'source-unavailable';
}

const transportFailures = new Map([
  ['ENOTFOUND', 'dns'], ['EAI_AGAIN', 'dns'],
  ['ECONNREFUSED', 'connection'], ['ECONNRESET', 'connection'], ['ENETUNREACH', 'connection'],
  ['EHOSTUNREACH', 'connection'], ['UND_ERR_SOCKET', 'connection'],
  ['ETIMEDOUT', 'timeout'], ['UND_ERR_CONNECT_TIMEOUT', 'timeout'],
  ['UND_ERR_HEADERS_TIMEOUT', 'timeout'], ['UND_ERR_BODY_TIMEOUT', 'timeout'],
  ['CERT_HAS_EXPIRED', 'tls'], ['CERT_NOT_YET_VALID', 'tls'],
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'tls'], ['SELF_SIGNED_CERT_IN_CHAIN', 'tls'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls'], ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'tls'],
  ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls'],
]);

function workflowDiagnostic(error) {
  // This report is not copied to public status. Even logs receive only allowlisted
  // constants and an HTTP number, never raw messages, URLs, headers or addresses.
  if (['http', 'non-json'].includes(error?.feedFailure)
      && Number.isInteger(error.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599) {
    return { kind: error.feedFailure, http_status: error.httpStatus };
  }
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return { kind: 'timeout' };
  if (error?.cause?.message === 'unexpected redirect') return { kind: 'redirect-blocked' };
  const causes = [error, error?.cause,
    ...(Array.isArray(error?.cause?.errors) ? error.cause.errors.slice(0, 4) : [])];
  for (const cause of causes) {
    if (transportFailures.has(cause?.code)) return { kind: transportFailures.get(cause.code), code: cause.code };
  }
  const classification = publicError(error);
  if (classification === 'source-too-large') return { kind: 'size-limit' };
  if (classification === 'invalid-source-data') return { kind: 'invalid-source-data' };
  return { kind: 'unknown' };
}

function workflowLink(value) {
  return /^https:\/\/github\.com\/PiotrPoliszuk\/stayinpoznan-www\/actions\/runs\/\d+$/.test(value || '') ? value : null;
}

export async function refreshPublicContent({ root = defaultRoot, now = new Date(), readFeed = fetchJson,
  ratingsFeedUrl = '', workflowUrl = null, sourceMode = 'repository' } = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Invalid build date');
  if (!['repository', 'http'].includes(sourceMode)) throw new Error('Invalid public source mode');
  const checkedAt = now.toISOString();
  const folder = join(root, 'content/public');
  await mkdir(folder, { recursive: true });
  const priorStatus = await readJson(join(folder, 'status.json'), { sources: [] });
  const results = [], sources = [];
  let snapshot = null, snapshotError = null, ratingSnapshot = null, ratingSnapshotError = null;
  if (sourceMode === 'repository') {
    try { snapshot = await readMissionSnapshot(root, now); }
    catch (error) { snapshotError = error; }
    try { ratingSnapshot = await readPublicRatingsSnapshot(root, now); }
    catch (error) { ratingSnapshotError = error; }
  }
  async function save(name, value) {
    const path = join(folder, `${name}.json`);
    if (JSON.stringify(await readJson(path, null)) === JSON.stringify(value)) return false;
    await writeFile(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
    await rename(`${path}.tmp`, path);
    return true;
  }
  const eventUrl = new URL('https://mission.pzn.me/api/public/events');
  eventUrl.searchParams.set('start', todayWarsaw(now)); eventUrl.searchParams.set('days', '366');
  for (const definition of [
    { source: 'events', url: sourceMode === 'http' ? eventUrl : '', normalize: normalizeEvents, merge: mergeEvents },
    { source: 'ratings', url: ratingsFeedUrl, normalize: normalizeRatings, merge: mergeRatings },
    { source: 'reviews', url: '', normalize: normalizeReviews, merge: mergeReviews },
  ]) {
    const { source } = definition;
    const previous = await readJson(join(folder, `${source}.json`), { [source]: [] });
    const prior = Array.isArray(priorStatus.sources) ? priorStatus.sources.find(row => row.source === source) : null;
    let result = { source, state: 'not-configured', changed: false };
    let cached = previous[source] || [];
    let lastSuccess = validStamp(prior?.last_success_at);
    const incomingSnapshot = source === 'ratings' && ratingSnapshot ? ratingSnapshot : snapshot?.[source];
    const sourceError = source === 'ratings' && ratingSnapshotError ? ratingSnapshotError
      : source === 'ratings' && ratingSnapshot ? null : snapshotError;
    if (sourceError) {
      result = { source, state: 'unavailable', changed: false, error: publicError(sourceError),
        diagnostic: workflowDiagnostic(sourceError) };
    } else if (incomingSnapshot || definition.url) {
      try {
        const incoming = definition.normalize(incomingSnapshot || await readFeed(definition.url), now);
        const merged = definition.merge(previous, incoming);
        result = { source, state: 'read', changed: await save(source, merged), records: incoming[source].length,
          acquisition: source === 'ratings' && ratingSnapshot ? 'repository-rating-observation'
            : incomingSnapshot ? 'repository-snapshot' : 'public-https',
          ...(source === 'events' ? { coverage: 'partial' } : {}) };
        cached = merged[source]; lastSuccess = checkedAt;
      } catch (error) {
        result = { source, state: 'unavailable', changed: false, error: publicError(error),
          diagnostic: workflowDiagnostic(error) };
      }
    }
    const observations = cached.map(record => validStamp(record.observed_at)).filter(Boolean)
      .sort((a, b) => Date.parse(b) - Date.parse(a));
    sources.push({ source, state: result.state, checked_at: checkedAt, last_success_at: lastSuccess,
      latest_observed_at: observations[0] || null, cached_records: cached.length,
      ...(result.acquisition ? { acquisition: result.acquisition } : {}),
      ...(result.acquisition === 'repository-snapshot' && snapshot?.generated_at ? { snapshot_at: snapshot.generated_at } : {}),
      ...(result.error ? { error: result.error } : {}) });
    results.push(result);
  }
  const status = { schema: 'stayinpoznan.publication-status.v1', checked_at: checkedAt,
    workflow_url: workflowLink(workflowUrl), schedule: { cron: '15 4 * * *', timezone: 'UTC' }, sources };
  return { schema: 'stayinpoznan.refresh.v1', checked_at: checkedAt, results,
    status_changed: await save('status', status) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await refreshPublicContent({ now: new Date(process.env.STAY_BUILD_DATE || Date.now()),
    ratingsFeedUrl: process.env.STAY_RATINGS_FEED_URL || '',
    sourceMode: process.env.STAY_PUBLIC_FACTS_MODE || 'repository',
    workflowUrl: process.env.GITHUB_REPOSITORY === 'PiotrPoliszuk/stayinpoznan-www' && /^\d+$/.test(process.env.GITHUB_RUN_ID || '')
      ? `https://github.com/PiotrPoliszuk/stayinpoznan-www/actions/runs/${process.env.GITHUB_RUN_ID}` : null });
  console.log(JSON.stringify(report));
  if (process.env.STAY_REFRESH_REPORT) await writeFile(process.env.STAY_REFRESH_REPORT, JSON.stringify(report));
  // Outages retain the last known facts. Building still retires expired facts.
}

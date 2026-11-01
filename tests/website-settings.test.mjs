import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeWebsiteSettings, applyWebsiteSettings } from '../scripts/lib/website-settings.mjs';
import { refreshPublicContent } from '../scripts/update-public-content.mjs';
const exec = promisify(execFile);
const now = new Date('2026-11-01T09:00:00Z');
const copy = () => ({ schema: 'pzn.public-website-settings.v1', enabled: true,
  branding: { brand_name: '<script>alert("brand")</script>', tagline: '<b>Nowy tytuł</b>', intro: 'Opis <img src=x onerror=bad()>',
    contact_email: 'guest?subject=hello&team@example.invalid', contact_phone: '+48 123 456 789' },
  listings: { 'ratusz-view': { title: '<script>alert("title")</script>', description: '<img src=x onerror=bad()> Opis mieszkania' } } });

test('website contract rejects private controls and invalid contacts while retaining plaintext', () => {
  assert.deepEqual(normalizeWebsiteSettings(copy()), copy());
  for (const extra of [{ password: 'PRIVATE' }, { publish_interval_minutes: 15 }, { publish_request: { id: 'PUB-000001' } }]) {
    assert.throws(() => normalizeWebsiteSettings({ ...copy(), ...extra }));
  }
  for (const branding of [{ contact_email: 'x@example.invalid\nBcc: PRIVATE' }, { contact_phone: 'javascript:bad' }]) {
    assert.throws(() => normalizeWebsiteSettings({ ...copy(), branding }));
  }
  assert.throws(() => normalizeWebsiteSettings({ ...copy(), enabled: false }));
  assert.throws(() => normalizeWebsiteSettings({ ...copy(), listings: { unknown: { title: 'Other' } } }));
});

test('disabled or missing copy preserves editorial data and never invents a listing', () => {
  const base = { name: 'Base' }, rows = [{ slug: 'ratusz-view', title: 'Original', description: 'Description' }];
  assert.deepEqual(applyWebsiteSettings(base, rows, null), { site: base, apartments: rows });
  assert.deepEqual(applyWebsiteSettings(base, rows, { schema: copy().schema, enabled: false, branding: {}, listings: {} }), { site: base, apartments: rows });
  const result = applyWebsiteSettings(base, rows, { ...copy(), listings: { 'apartment-15': { title: 'Prepared' } } });
  assert.equal(result.apartments.length, 1); assert.equal(result.apartments[0].title, 'Original');
  assert.equal(base.name, 'Base');
});

test('actual Mission import and generator escape configured brand and listing text', async () => {
  const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const root = await mkdtemp(join(tmpdir(), 'website-settings-'));
  try {
    await cp(sourceRoot, root, { recursive: true, filter: path => !path.includes('/.git') });
    await mkdir(join(root, 'content/incoming'), { recursive: true });
    await writeFile(join(root, 'content/incoming/mission-public-facts.json'), JSON.stringify({ schema: 'pzn.website-facts.v1',
      generated_at: now.toISOString(), events: { schema: 'pzn.public-events.v1', timezone: 'Europe/Warsaw', complete: false, coverage: 'partial', events: [] },
      source_states: { ratings: 'not-configured', reviews: 'not-configured' }, website: copy() }));
    await refreshPublicContent({ root, now, readFeed: () => { throw Error('No network'); } });
    assert.deepEqual(JSON.parse(await readFile(join(root, 'content/public/website.json'), 'utf8')), copy());
    assert.equal((await refreshPublicContent({ root, now })).status_changed, false);
    const env = { ...process.env, STAY_BUILD_DATE: now.toISOString() };
    await exec(process.execPath, ['scripts/build.mjs'], { cwd: root, env });
    await exec(process.execPath, ['scripts/check-site.mjs'], { cwd: root, env });
    const home = await readFile(join(root, 'index.html'), 'utf8');
    const faq = await readFile(join(root, 'faq/index.html'), 'utf8');
    const ukrainian = await readFile(join(root, 'ua/index.html'), 'utf8');
    const listing = await readFile(join(root, 'apartamenty/ratusz-view/index.html'), 'utf8');
    for (const html of [home, listing, faq, ukrainian]) {
      assert.match(html, /&lt;script&gt;alert\(&quot;brand&quot;\)&lt;\/script&gt;/);
      assert.doesNotMatch(html, /<script>alert\("brand"\)<\/script>|<img src=x onerror=bad\(\)>/);
      assert.match(html, /mailto:guest%3Fsubject%3Dhello%26team%40example\.invalid/);
      assert.doesNotMatch(html, /mailto:guest\?subject/);
    }
    assert.match(home, /&lt;b&gt;Nowy tytuł&lt;\/b&gt;/);
    assert.match(listing, /&lt;img src=x onerror=bad\(\)&gt; Opis mieszkania/);
    assert.match(listing, /&lt;script&gt;alert\(&quot;title&quot;\)&lt;\/script&gt;/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

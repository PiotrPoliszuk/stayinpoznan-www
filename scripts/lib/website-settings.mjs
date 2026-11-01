const fields = { brand_name: 80, tagline: 160, intro: 3000, contact_email: 254, contact_phone: 32 };
const slugs = new Set(['ratusz-view', 'koziolki-view', 'apartment-15']);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function text(value, limit) {
  if (typeof value !== 'string' || [...value].length > limit || /[\u0000-\u0008\u000b-\u001f\u007f\ud800-\udfff]/u.test(value)) throw new Error('Invalid website text');
  return value.trim();
}

export function normalizeWebsiteSettings(body) {
  if (!object(body) || Object.keys(body).sort().join(',') !== 'branding,enabled,listings,schema'
      || body.schema !== 'pzn.public-website-settings.v1' || typeof body.enabled !== 'boolean'
      || !object(body.branding) || !object(body.listings)
      || Object.keys(body.branding).some(key => !Object.hasOwn(fields, key))
      || Object.keys(body.listings).some(key => !slugs.has(key))) throw new Error('Invalid website settings');
  const branding = {}, listings = {};
  for (const [key, value] of Object.entries(body.branding)) {
    branding[key] = text(value, fields[key]);
    if (key === 'contact_email' && branding[key] && !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(branding[key])) throw new Error('Invalid website email');
    if (key === 'contact_phone' && branding[key] && !/^[+() 0-9-]{1,32}$/.test(branding[key])) throw new Error('Invalid website phone');
  }
  for (const [slug, row] of Object.entries(body.listings)) {
    if (!object(row) || Object.keys(row).some(key => !['title', 'description'].includes(key))) throw new Error('Invalid website listing');
    listings[slug] = Object.fromEntries(Object.entries(row).map(([key, value]) => [key, text(value, key === 'title' ? 120 : 4000)]));
  }
  if (!body.enabled && (Object.keys(branding).length || Object.keys(listings).length)) throw new Error('Disabled website settings contain drafts');
  return { schema: body.schema, enabled: body.enabled, branding, listings };
}

export function applyWebsiteSettings(baseSite, baseApartments, body) {
  const copy = body ? normalizeWebsiteSettings(body) : null;
  if (!copy?.enabled) return { site: { ...baseSite }, apartments: baseApartments.map(row => ({ ...row })) };
  const { branding } = copy;
  return {
    site: { ...baseSite, ...(branding.brand_name ? { name: branding.brand_name } : {}),
      ...(branding.contact_email ? { email: branding.contact_email } : {}),
      ...(branding.contact_phone ? { phone: branding.contact_phone } : {}),
      tagline: branding.tagline || '', intro: branding.intro || '' },
    // No unconfigured listing, photo set or OTA offer is invented for apartment 15.
    apartments: baseApartments.map(row => ({ ...row,
      ...(copy.listings[row.slug]?.title ? { title: copy.listings[row.slug].title } : {}),
      ...(copy.listings[row.slug]?.description ? { description: copy.listings[row.slug].description,
        short: copy.listings[row.slug].description } : {}) })),
  };
}

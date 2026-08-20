# Cloudflare setup

## Cloudflare Pages

Project: `stayinpoznan-www`.

- GitHub repository: `PiotrPoliszuk/stayinpoznan-www`
- production branch: `main`
- framework preset: None
- build command: empty
- build output directory: `/`
- production custom domains: `stayinpoznan.pl`, `www.stayinpoznan.pl`

Cloudflare Pages deploys `main` to production and creates a preview URL for every feature branch.

The generated HTML is committed, so no build command is required. Before each commit run:

```bash
node scripts/build.mjs
node scripts/check-site.mjs
```

## Domain redirects

Domain-level redirects must use Cloudflare Bulk Redirects. Cloudflare Pages `_redirects` accepts source paths, not source hostnames.

Do not attach `oldmarketsquare.pl` to the Pages project. Keep these existing proxied DNS records:

- `A @ 192.0.2.1` — Proxied
- `A www 192.0.2.1` — Proxied

In the account-level **Bulk Redirects** screen:

1. create a list named `stayinpoznan-canonical-redirects`;
2. import `cloudflare/bulk-redirects.csv` (the CSV intentionally has no header row);
3. continue to Redirect Rules;
4. create and deploy a rule named `stayinpoznan-canonical-redirects` using that list.

The list canonicalizes `www.stayinpoznan.pl`, redirects the production `pages.dev` hostname, maps both forms of `oldmarketsquare.pl`, preserves query strings and preserves arbitrary path suffixes.

The existing `www.stayinpoznan.pl` Pages custom domain can stay attached; the Bulk Redirect executes before the Pages origin and makes the apex URL canonical.

Short campaign URLs map both domains directly to the relevant canonical landing page:

- `/pyrkon` → `/wydarzenia/pyrkon-2027/`
- `/bittersweet` → `/wydarzenia/bittersweet-festival-2027/`
- `/targi` → `/wydarzenia/`
- `/apartament` → `/apartamenty/`
- `/stary-rynek` → `/poznan/stary-rynek/`

Use those short URLs in printed materials, social profiles and event campaigns. Search engines should index only the final `stayinpoznan.pl` URLs.

## Preview control

In **Settings → Builds & deployments → Branch control**:

- production branch: `main`;
- automatic production deployments: enabled;
- preview branches: Custom;
- include: `feat/*`, `fix/*`, `content/*`, `staging`.

In **Settings → General**, enable the Cloudflare Access policy for preview deployments if previews should be private. The repository `_headers` also sends `X-Robots-Tag: noindex` on `*.pages.dev` URLs.

Optional permanent review URL: attach `preview.stayinpoznan.pl` as a Pages custom domain and point its proxied CNAME to `staging.stayinpoznan-www.pages.dev`. Use a dedicated `staging` branch, not a short-lived feature branch.

## Zone settings

For `stayinpoznan.pl` and `oldmarketsquare.pl`:

- SSL/TLS mode: Full (strict);
- Always Use HTTPS: enabled;
- Automatic HTTPS Rewrites: enabled;
- Brotli: enabled;
- do not add a Cache Everything rule — Pages manages its own edge cache;
- enable Cloudflare Web Analytics for the Pages project.

Delay HSTS until all four public hostnames and redirects have been verified over HTTPS.

## After the first production deploy

1. Verify `https://stayinpoznan.pl/robots.txt` and `/sitemap.xml`.
2. Add the domain property in Google Search Console.
3. Submit `https://stayinpoznan.pl/sitemap.xml`.
4. Validate both apartment pages in Google Rich Results Test.
5. Enable Cloudflare Web Analytics without adding a blocking script.
6. Verify the `www` and `oldmarketsquare.pl` redirects with `curl -I`.

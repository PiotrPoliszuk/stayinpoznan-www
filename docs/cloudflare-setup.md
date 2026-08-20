# Cloudflare setup

## Cloudflare Pages

1. Create project.
2. Connect GitHub repo: `stayinpoznan-www`.
3. Framework preset: None.
4. Build command: empty.
5. Build output directory: `/`.
6. Add custom domains:
   - `stayinpoznan.pl`
   - `www.stayinpoznan.pl`

Cloudflare Pages deploys `main` to production and creates a preview URL for every feature branch.

The generated HTML is committed, so no build command is required. Before each commit run:

```bash
node scripts/build.mjs
node scripts/check-site.mjs
```

## oldmarketsquare.pl redirect

Preferred: attach `oldmarketsquare.pl` and `www.oldmarketsquare.pl` to the same Pages project. The repository `_redirects` file preserves the path and returns HTTP 301 to `stayinpoznan.pl`.

Alternative: use a Cloudflare Redirect Rule in the `oldmarketsquare.pl` zone.

DNS needed in `oldmarketsquare.pl` zone:
- A `@` -> `192.0.2.1`, proxied
- A `www` -> `192.0.2.1`, proxied

Redirect rule:
- Match: hostname equals `oldmarketsquare.pl` OR hostname equals `www.oldmarketsquare.pl`
- Target: `https://stayinpoznan.pl${uri.path}`
- Status: 301
- Preserve query string: enabled if available

## After the first production deploy

1. Verify `https://stayinpoznan.pl/robots.txt` and `/sitemap.xml`.
2. Add the domain property in Google Search Console.
3. Submit `https://stayinpoznan.pl/sitemap.xml`.
4. Validate both apartment pages in Google Rich Results Test.
5. Enable Cloudflare Web Analytics without adding a blocking script.
6. Verify the `www` and `oldmarketsquare.pl` redirects with `curl -I`.

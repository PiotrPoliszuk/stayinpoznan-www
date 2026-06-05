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

Cloudflare Pages deploys automatically on every push to GitHub main branch.

## oldmarketsquare.pl redirect

Recommended: Cloudflare Redirect Rule in the `oldmarketsquare.pl` zone.

DNS needed in `oldmarketsquare.pl` zone:
- A `@` -> `192.0.2.1`, proxied
- A `www` -> `192.0.2.1`, proxied

Redirect rule:
- Match: hostname equals `oldmarketsquare.pl` OR hostname equals `www.oldmarketsquare.pl`
- Target: `https://stayinpoznan.pl${uri.path}`
- Status: 301
- Preserve query string: enabled if available

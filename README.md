# Stay in Poznań

Fast, dependency-free static site for the Stay in Poznań apartments at Wielka 23.

## What is included

- Polish and English home pages
- two complete apartment landing pages with authentic listing photos
- a noindex preview for the upcoming mezzanine apartment
- local Poznań guides and FAQ
- event landing pages for verified 2026/2027 dates
- responsive design, accessible gallery and reduced-motion support
- canonical URLs, hreflang, sitemap, robots.txt and JSON-LD
- Cloudflare Pages redirects and security/cache headers

## Build and validate

No package install is required. Use Node.js 20 or newer.

```bash
node scripts/build.mjs
node scripts/check-site.mjs
```

To preview locally:

```bash
python3 -m http.server 8088
```

Open `http://localhost:8088`.

## Publishing flow

1. Gitea remains the source of truth.
2. A feature branch is mirrored or pushed to GitHub.
3. Cloudflare Pages creates a branch preview.
4. Merge to `main` only after visual and content approval.
5. Cloudflare Pages publishes `main` to production.

The generated HTML is committed, so Cloudflare Pages keeps the existing setup:

- Framework preset: None
- Build command: empty
- Build output directory: `/`

See [docs/cloudflare-setup.md](docs/cloudflare-setup.md) and [docs/seo-strategy.md](docs/seo-strategy.md).

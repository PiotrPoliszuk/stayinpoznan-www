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
node --test tests/public-content.test.mjs
```

To preview locally:

```bash
python3 -m http.server 8088
```

Open `http://localhost:8088`.

## Publishing flow

Cloudflare Pages publishes `main` and creates configured feature branch previews.
The daily `Public website content` workflow reads PZN's sanitized event facts,
refreshes an optional authorized ratings feed, builds and validates the site, and
commits changed public facts and HTML to `main`. No external descriptions,
guest records, prices or credentials enter the website.

GitHub `main` is the single writer for automated public content. Any Gitea copy
must receive these commits before publishing other work; do not force mirror an
older Gitea branch over it. The checked-in push helper only pushes feature branches.
An inaccessible source keeps the last observation; the build still removes expired
homepage promotions and stops showing ratings after 14 days.

See [automatic public content](docs/automatic-content.md) for source status,
ratings setup and the exact refresh/publishing flow.

The optional `/podglad/` page shows public source observations and prepares
suggestions for review in GitHub. It is excluded from search indexing and the
sitemap, and grants no editing privileges.

The generated HTML is committed, so Cloudflare Pages keeps the existing setup:

- Framework preset: None
- Build command: empty
- Build output directory: `/`

See [docs/cloudflare-setup.md](docs/cloudflare-setup.md) and [docs/seo-strategy.md](docs/seo-strategy.md).

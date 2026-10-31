# Automatic public content

The public website stays static and dependency-free. Cloudflare Pages uses the
existing committed-HTML deployment. `.github/workflows/public-content.yml` checks
pull requests and runs daily at 04:15 UTC on `main`. The refresh job reads sources,
builds the website, checks every generated page, and pushes only changed public
JSON, HTML and sitemap. A normal fast-forward push rejects concurrent changes.
Use **Run workflow** for an immediate refresh after a source becomes available.

This is the single automatic writer for website content. The old README described
Gitea as the source of truth, but no Gitea URL or second remote is configured in the
repository. A Gitea copy must pull these commits before publishing other work.
Do not run a second scheduler or force mirror over GitHub `main`.

## Events and guides

`node scripts/update-public-content.mjs` reads
`https://mission.pzn.me/api/public/events?start=YYYY-MM-DD&days=366`.
Mission refreshes its persistent events ledger weekly. The website's daily read
uses that cached, sanitized feed and retires past promotions between weekly
imports. The source covers a **partial** selection from the City of Poznań and Poznań events from Grupa MTP;
it is not a complete city calendar. Deployment can initially return an empty feed
until the first successful Mission refresh.

Each new EVT record gets a permanent `/wydarzenia/poznan-evt-NNNNNN/` page with
dates, venue, source, observation date, a practical stay template, and links to
existing guides. A title change does not change its URL. Explicit cancellations
are retained; an event absent from the latest partial feed becomes unconfirmed,
not cancelled. Historical pages remain available with an archive label.

The `/poznan/teraz/` guide automatically connects fresh upcoming events with the
Stary Rynek, weekend and local guide pages. The updater publishes concise facts
and our own practical template, not copied event descriptions, images, made-up
attendance or invented travel times. Editorial guides remain separately editable.

Sources are bounded to one 2 MiB, 15-second JSON read per feed, with no redirects.
Only City of Poznań and Grupa MTP event URLs are admitted. EVT IDs and monotonically increasing
revisions prevent duplicate pages and backward updates. The archive is bounded
to 2,000 records; reaching this limit requests a retention review instead of silently
deleting old URLs. On a source failure the previous snapshot remains, with source
dates visible. Fresh automatic facts expire after eight days.

## Host and listing ratings

There is currently **no automatic authorized ratings feed configured** in this repository. The checked-in initial snapshot contains a one-off operator observation from 31 October 2026: Ratusz View 4.88 from 179 reviews, and the separate host section 4.86 from 351 reviews. These are dated source observations, not a claim that an API is connected. The other apartment has no fresh observation.
Airbnb's API requires an applicable partner program and scopes; its public terms
do not permit an automatic scraper. Smoobu's documented API has no reviews route.
The updater does not scrape Airbnb, infer host ratings from listing averages, or
present the old August 2026 numbers as current. Without a fresh observation, the
website links to current Airbnb reviews and omits aggregate-rating JSON-LD.

An authorized adapter/export can expose the following normalized JSON via public
HTTPS. Configure its URL as the repository variable `STAY_RATINGS_FEED_URL`; no
Airbnb login or API secret belongs in this repository or public feed. The endpoint
must return only aggregate public statistics, never individual guest reviews or
guest data. The daily refresh then updates every rating location and JSON-LD from
the same observation. Observations older than 14 days or in the future are rejected.

```json
{
  "schema": "stayinpoznan.ratings.v1",
  "ratings": [
    {
      "kind": "listing",
      "slug": "ratusz-view",
      "rating": 4.9,
      "reviews": 172,
      "observed_at": "2026-10-31T10:00:00Z",
      "source_url": "https://www.airbnb.com/rooms/1396133241621872627",
      "method": "authorized-api"
    }
  ]
}
```

This is a schema example, not a claim about current scores. Missing identities retain their previous observation until it expires; older observations cannot overwrite a newer one. Supported listing
slugs are `ratusz-view` and `koziolki-view`; their exact Airbnb room IDs are checked.
A host record uses `kind: "host"`, no listing slug, the actual Airbnb
`/users/show/ID` or `/users/profile/ID` source URL, and its own rating/count. An exact known room URL is also accepted for a host observation only with explicit `source_section: "host"`; this selects the independently observed host section, never the listing score.
An optional boolean `superhost` is accepted only on a fresh host observation.
`method` is `authorized-api` or `operator-export`; it describes the adapter's real
source, not an access grant. No aggregate is calculated between properties.

## Verification and local execution

```sh
node --test tests/public-content.test.mjs
node scripts/update-public-content.mjs
node scripts/build.mjs
node scripts/check-site.mjs
```

Tests exercise the actual generator with fresh, expired, cancelled, missing and
malicious-looking source facts; stable URLs, rating identity, source failures and
response size limits are checked. The complete site checker verifies metadata,
JSON-LD, images, internal links, redirects and sitemap. No live acquisition or
Cloudflare deployment is claimed by these local checks.

Primary source references checked 31 October 2026:

- [Airbnb API Terms](https://www.airbnb.com/help/article/3418)
- [Airbnb Terms](https://www.airbnb.com/help/article/2857)
- [Smoobu API](https://docs.smoobu.com/)
- [City of Poznań feeds](https://www.poznan.pl/mim/feeds/)

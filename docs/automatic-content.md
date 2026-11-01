# Automatic public content

The public website stays static and dependency-free. Cloudflare Pages uses the
existing committed-HTML deployment. `.github/workflows/public-content.yml` checks
pull requests and refreshes on validated code pushes to `main`, daily at 04:15 UTC, and on explicit workflow dispatch. The refresh job reads sources,
builds the website, checks every generated page, and pushes only changed public
JSON, HTML and sitemap. A normal fast-forward push rejects concurrent changes.
Use **Run workflow** for an immediate refresh after a source becomes available.

## Outbound PZN source (1 November 2026)

The external runner cannot resolve the private Mission DNS name. Production now
reads a checked-in, bounded `content/incoming/mission-public-facts.json` envelope
(`pzn.website-facts.v1`). A supervised exporter on docker01 reads its existing
local public events HTTP endpoint, validates explicit public fields and pushes
only this fixed file using the host user’s existing Git SSH access. It does not
copy a private key into Mission or expose an inbound administration endpoint.
GitHub Actions remains the only writer of generated pages.

The host exporter is a separate deployment: a source change or a started timer
is not proof that Git SSH can write the repository. Its durable receipt and the
public-file commit must be verified, then Actions and Cloudflare separately.
An envelope older than 36 hours is unavailable, while old event observations
retain their own dates and expire after eight days. A missing envelope means
`not-configured`, not an empty city calendar.

The former public HTTPS adapter remains explicit opt-in
`STAY_PUBLIC_FACTS_MODE=http`; production selects `repository` and never probes
private DNS. HTTP source acquisition is not the normal path from GitHub.

## Checking a source rollout

After deploying Mission, inspect the host exporter receipt and its fixed-path
GitHub commit. A successful internal module read does not prove outbound SSH
publication, or that either event source has completed its first import. The
embedded event response must use `pzn.public-events.v1`; inspect source dates and
coverage rather than treating an empty HTTP 200 as proof of a populated calendar.

Start a fresh **Run workflow** on the current `main` revision after the source
rollout. Do not rerun an older failed refresh after another publication has
advanced `main`: its pinned checkout intentionally cannot overwrite newer work.
Check the source results in the new run and `/podglad/`, then verify the resulting
content commit's Cloudflare Pages deployment separately. A green validation job,
an available feed and a successful public deployment are separate checks.

If the source is unavailable, the workflow still publishes safe status metadata
and applies expiry rules before reporting the failure. Do not replace source
dates with the publication time or manually mark a failed acquisition successful.

The refresh report in Actions distinguishes HTTP status, a non-JSON response,
DNS/connection/TLS failures, timeouts and blocked redirects using bounded codes.
It never logs response bodies, headers, URLs or raw transport exceptions. These
details are not committed to public `status.json`; the website keeps the generic
source error and the previous observation. Actions logs may themselves be public.

This is the single automatic writer for website content. The old README described
Gitea as the source of truth, but no Gitea URL or second remote is configured in the
repository. A Gitea copy must pull these commits before publishing other work.
Do not run a second scheduler or force mirror over GitHub `main`.

## Events and guides

`node scripts/update-public-content.mjs` reads the validated repository envelope.
The host exporter obtains `pzn.public-events.v1` from the running Mission server
inside its container at `http://127.0.0.1:8089/api/public/events?days=366`.
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

## Optional preview and suggestions

`/podglad/` is a public, non-indexed snapshot of source observations, upcoming
events and dated ratings. It is excluded from the sitemap and marketing menu.
No guest data, credentials or edit permissions are exposed. Source read metadata
comes from `content/public/status.json`; a missing record means no confirmed
automatic read, and a successful source read does not prove Cloudflare deployment.
Links lead to production, pull-request previews and the actual Actions run when
its recorded URL is available.

The suggestion form prepares a bounded draft on this repository's GitHub Issues
page. A per-event action includes its EVT number, revision and observation time.
The author opens the draft and explicitly sends it in GitHub, which requires
their account. Merely opening the preview or preparing a suggestion performs no
network write and publishes nothing. Proposals do not pause the scheduled
publication of valid source facts.

`node --test tests/review-console.test.mjs` checks escaped source content, exact
record context, draft URL limits and the actual generated page's exclusion from
indexing and the sitemap. Browser QA also checks keyboard interaction, the mobile
layout and absence of writes while preparing a draft.

## Host and listing ratings

The separate `content/incoming/airbnb-public-ratings.json` contains dated
public source observations with `method: public-page-observation`. On 1 November
2026 the two exact public listing pages showed Ratusz View 4.88 / 179 reviews and
Koziołki View 4.84 / 172 reviews. Their independent host section showed 4.86 / 351
reviews and Superhost. These are retrieved observations, not an authorized API
connection or a calculated average between apartments. A daily authorized search
automation can update only this fixed input file; creation of that task is not
proof of future executions. The website validates the same identities and 14-day
expiry before every publication. Failed reads retain the old source timestamp.

Airbnb’s API still requires an applicable partner program and scopes. No private
Airbnb API, login session or challenge bypass is added. Smoobu’s public developer
documentation does not expose a reviews endpoint. The public pages checked during
this audit did not expose individual review text. No testimonial was invented.

An authorized adapter/export can expose the following normalized JSON via public
HTTPS. Configure its URL as the repository variable `STAY_RATINGS_FEED_URL`; no
Airbnb login or API secret belongs in this repository or public feed. The endpoint
must return only aggregate public statistics. Individual review excerpts use the
separate explicitly authorized reviews contract below; guest data is excluded. The daily refresh then updates every rating location and JSON-LD from
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
`method` is `authorized-api`, `operator-export` or `public-page-observation`; it
describes the real source, not an access grant. A public observation remains
distinct from an API connection. No aggregate is calculated between properties.

## Selected public review excerpts

A configured Mission export may include `reviews` with schema
`stayinpoznan.reviews.v1`. Each item requires an exact known listing slug/source
URL, stable review ID, real `published_date` and `observed_at`, finite 0–5 rating,
`method: authorized-api|operator-export`, `public: true`,
`republication: authorized`, first name only (`author`), and a verbatim `excerpt`
of at most 20 words / 240 characters. Private feedback, surnames, guest IDs and
extra provider fields are not copied. The adapter must have the right to
republish the excerpt; a flag is a data contract, not a grant of rights.

The property page selects at most three valid, recently observed excerpts, sorted
by rating then review date. It labels them “Selected reviews”, links the original
listing and shows both publication and observation dates. It never fabricates
text or turns an absent review into a five-star review. Expired excerpts are
hidden; the working cache retains at most 100 observations, with older versions
remaining in Git.

## Verification and local execution

```sh
node --test tests/*.test.mjs
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

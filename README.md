# StayInPoznan.pl

Static landing page for Stay In Poznań apartments.

## Deploy target

Cloudflare Pages

## Domains

Primary:
- stayinpoznan.pl
- www.stayinpoznan.pl

Redirect:
- oldmarketsquare.pl -> https://stayinpoznan.pl/
- www.oldmarketsquare.pl -> https://stayinpoznan.pl/

## Local preview

```bash
python3 -m http.server 8088
```

Open:

```text
http://localhost:8088
```

## Cloudflare Pages setup

Framework preset: None  
Build command: empty  
Build output directory: `/`

## Git flow

Local Gitea can be source of truth.
Mirror/push to GitHub.
Cloudflare Pages deploys from GitHub main branch.

# Trackwalk — Architecture Reference

## Identity
- **App name**: Trackwalk
- **Domain**: trackwalk.racing (registered Porkbun, ~$15/yr renewal)
- **Purpose**: UCI downhill race content aggregator + historical results database
- **GitHub**: github.com/bscharenberg/trackwalk
- **Local path**: ~/Documents/Bryon Knowledge Base/Helltrack/

## Hosting (all free except domain)
| Service | Purpose | URL |
|---|---|---|
| GitHub Pages | Static hosting | bscharenberg.github.io/trackwalk |
| GitHub Actions | Hourly cache refresh CI/CD | .github/workflows/refresh.yml |
| Cloudflare Worker (free) | Pinkbike RSS proxy | helltrack-rss.scharenbergs.workers.dev |
| Google Analytics | Usage tracking | G-4EY22R6D2J |
| Google Forms | User feedback | https://forms.gle/sRySzSFzzwDyKNrWA |
| Kit.com | Email list | hello@trackwalk.racing sender |

Note: Cloudflare Workers Paid plan was retired after the results pipeline moved to the UCI JSON API (no longer needs Browser Rendering). helltrack-rss Worker remains on the free plan.

## Content Pipeline

### Sources
- **14 YouTube channels** via uploads playlist API (1 unit/channel vs 100 for search.list)
- **Pinkbike RSS** via Cloudflare Worker proxy (direct fetch returns 403)

### YouTube Channels
Source of truth is the `CHANNELS` array in `scripts/youtube-fetcher.js` — update there, then mirror here.

| Channel | ID |
|---|---|
| UCI MTB World Series | UCWS4nfoou79mwo9nHew49fA |
| Pinkbike | UC2GIHZpQiJy-8286f4lj_cg |
| Vital MTB | UCcX5xwMOCt92bi0dmspMFQw |
| WynTV | UCtvJR7iamL8WFAbvpsC2HTw |
| Sleeper Collective | UCuuLS5B9JraqXiKfYPIBNEw |
| Bernard Kerr | UCOYc6SI_fVrNvoutot7D9IA |
| Santa Cruz Syndicate | UCCb8I3PHEUFPV0Jds0-_eig |
| Commencal | UCPUGv78-mvU6gaFBgjY67vA |
| Fox Factory | UCN_B2-bdBtmAq-5TOEU63nQ |
| Frameworks Bicycles | UCiCWNsaEx9swRaCe55XMAuw |
| Red Bull Bike | UCXqlds5f7B2OOs9vQuevl4A |
| GoPro Bike | UC-oqtSrbAwCIB98RZfsdreA |
| Downtime Podcast | UCgwpS_N4DQDYsip73rsQ6iA |
| Just Ride (Red Bull) | UCUjYvTWqwm7x6LU8uGLvdxQ |

### Scripts (in scripts/)
- `youtube-fetcher.js` — uploads playlist approach, 1 unit/channel; duration-based Shorts detection via videos.list
- `rss-fetcher.js` — Pinkbike RSS via Worker proxy + xml2js for RSS 0.91 parsing
- `content-filter.js` — keyword scoring (MIN_SCORE=6), category assignment
- `build-cache.js` — orchestrates fetch→filter→write public/cache.json
- `results-fetcher.mjs` — ESM, fetches results from UCI JSON API
- `build-riders.js` — generates riders.json from riders.csv

### GitHub Actions
- **refresh.yml** — hourly cron, runs build-cache.js, commits cache.json
- **fetch-results.yml** — race weekend auto-trigger (qualifying + finals days), runs results-fetcher.mjs
- Uses secrets: YOUTUBE_API_KEY, PINKBIKE_PROXY
- Quota: ~336 units/day (14 channels × ~1 unit × 24 runs) of 10,000 limit

## Results Pipeline

### Architecture (current)
1. `results-fetcher.mjs` calls the **UCI JSON API** directly for structured race result data
2. Results are written to `public/results.json` (canonical; what every fetcher reads and merges into)
3. `split-results.js` derives `public/results/` — the per-season shards the app actually fetches

No Cloudflare Worker or PDF parsing is involved. The old Browser Rendering Worker (`helltrack-results`) has been retired and deleted.

### Historical data
- **2025–2026**: UCI JSON API (current method)
- **2024**: Imported from downhillr `.rda` files via `scripts/rootsandrain_pull.py` using pyreadr
- **2015–2023**: Not yet imported — future backlog item

### 2026 Calendar Slugs
```
race-of-south-korea-2026, loudenvielle-2026, leogang-2026, lenzerheide-2026,
la-thuile-2026, pal-arinsal-2026, les-gets-2026, val-di-sole-2026,
whistler-2026, lake-placid-2026
```

## Data Files

### public/cache.json
Generated hourly by GitHub Actions. Structure:
```json
{
  "builtAt": "ISO timestamp",
  "categories": {
    "race-runs": { "id": "race-runs", "label": "Race runs", "items": [...] },
    "results": { ... },
    "films": { ... },
    "pits": { ... },
    "news": { ... }
  }
}
```
Each item: title, url, thumbnail, publishedAt, source, channelId, channelName, description, score, category, type

Category tags appear on feed cards but are ~70% accurate and are display-only — there is no filtering by category in the UI.

### public/results.json (large)
Multi-season structure:
```json
{
  "lastUpdated": "ISO timestamp",
  "seasons": {
    "2024": { "rounds": [...] },
    "2025": { "rounds": [...] },
    "2026": { "rounds": [...] }
  }
}
```
Each round: venue, slug, date, round, year, type, sessions{}
Sessions: finals-men, finals-women, qualifying-1-men, qualifying-1-women, qualifying-2-men, qualifying-2-women, finals-junior-men, finals-junior-women
Each result: rank, bib, name, nat, team, time, gap, points, splits{s1-s4}, dnf/dns/dsq flags

### public/results/ (app-facing shards)
Derived from results.json by `scripts/split-results.js` — run it after any merge, or the app
serves the previous run's results. `npm run split-results`.

- `index.json` — `{ lastUpdated, current, seasons: [{year, rounds, bytes}] }`, under 1 KB.
  Drives the year bar, so every season is tappable before its file is fetched.
- `<year>.json` — `{ year, rounds: [...] }`, minified, ~100–350 KB each.

Why: results.json is 8.8 MB pretty-printed, and the app used to download and `JSON.parse` all
of it to show one round. Now opening the app costs index + current season (~314 KB). Other
seasons load when tapped; the full archive loads only on entering rider search or venue
history, which genuinely need every season. Only seasons with rounds are emitted, and shards
for seasons that vanish from results.json are deleted.

### public/riders.json
Generated from scripts/riders.csv by build-riders.js. Structure:
```json
{
  "men": [ { "name": "...", "nat": "...", "team": "...", "ig": "..." }, ... ],
  "women": [ ... ]
}
```
Source of truth: scripts/riders.csv — edit CSV, run `node scripts/build-riders.js`, commit both.

### public/directory.json
Static data for the PITS tab. Contains teams (with IG/YouTube links), media outlets, podcasts, and UCI official links. Updated manually per season.

### public/watch.json
Geographic streaming options for the PITS → WATCH section. Updated once per season. Structure:
```json
{
  "lastUpdated": "ISO timestamp",
  "regions": [
    {
      "region": "United States",
      "options": [
        { "name": "...", "url": "...", "cost": "free|subscription", "notes": "..." }
      ]
    }
  ]
}
```

## Frontend: index.html (root folder)

### Design
- Dark #111 background, acid yellow #d4f500 accent
- Barlow Condensed typography
- Mobile-first, works on desktop at full width

### Navigation
- Top tab bar: FEED | RESULTS | RIDERS | PITS
- Results nav: 4 sticky rows in header (Year | Venue | Elite Men/Women | Finals/Q1/Q2)
- Results nav hidden by default, shown only when Results tab active

### Feed features
- Compact row card list
- Shorts strip: horizontal scroll of portrait cards, duration-based detection (≤60s via YouTube videos.list API)
- Category badge on each card (display only — NEWS, ANALYSIS, PITS, RACE RUNS, etc.)
- Bottom sheet preview on tap: thumbnail, title, description, source-aware CTA
- Swipe down or tap outside to dismiss sheet
- Kit.com email signup form embedded mid-feed (after ~20 cards), static HTML
- Lazy image loading
- Seen/dim state: tapping Watch dims card to 45% opacity (persists via localStorage), applies to both feed cards and Shorts

### Results features
- Season selector (2024/2025/2026 pills)
- Round selector pills (scroll horizontally)
- Elite Men / Elite Women toggle
- Session toggle: Finals | Qual 1 | Qual 2 (Q2 hidden if no data)
- Top 5 with visual weight: gold/silver/bronze for 1-3, elevated for 4-5, table from 6
- Name formatting: "VERMETTE ASA" → "Vermette Asa"

### Riders features
- Men / Women toggle (sticky in header)
- Card grid: formatted name, nationality flag emoji, Instagram icon (outbound link)
- Riders with no Instagram show name and flag only
- Source: public/riders.json, built from scripts/riders.csv

### PITS features
- Sub-tabs: TEAMS | MEDIA | PODCASTS | UCI | WATCH
- TEAMS: factory teams with IG and secondary (YouTube/website) icons
- MEDIA: outlets with description and outbound link icons
- PODCASTS: acid yellow play button → YouTube, Spotify icon if available
- UCI: official links (results, calendar, athlete database, live timing)
- WATCH: geographic streaming options from watch.json, FREE/PAID badges

## Other PWA Files (root folder)
- `manifest.json` — start_url: "/", scope: "/"
- `service-worker.js` — **navigations are network-first** (2.5s timeout → cache), so a deploy is live on the next launch rather than one launch behind; other static assets cache-first; stale-while-revalidate for every app data file (cache.json, riders.json, directory.json, watch.json, `public/results/`), all of which are also precached so the app is fully usable offline; currently at trackwalk-v24. Stale-first means the page can paint stale data, so `index.html` re-fetches past the worker (`?t=`) and repaints — see `revalidateFeed()`, `revalidateSeason()`, `revalidateResultsIndex()`, `revalidateRiders()`, `revalidatePits()`. Bump `CACHE_NAME` for ANY index.html change: the shell is cache-first, so existing installs won't see it otherwise. Static assets are root-relative (`/`, `/index.html`, `/manifest.json`) — the site serves at the trackwalk.racing root, NOT a `/trackwalk/` subpath.
- `icon-192.png`, `icon-512.png` — placeholder HT icons (real design pending)

## Environment
- `.env`: YOUTUBE_API_KEY, PINKBIKE_PROXY=https://helltrack-rss.scharenbergs.workers.dev
- GitHub Secrets: YOUTUBE_API_KEY, PINKBIKE_PROXY
- npm packages: `dotenv`, `xml2js` (node-fetch and pdfjs-dist removed — Node 18+ has native fetch)

## Email
- Address: hello@trackwalk.racing
- Routing: Cloudflare Email Routing → personal Gmail (receive)
- Sending: Kit.com with trackwalk.racing authenticated sending domain
- Welcome automation: fires immediately on signup

## Cost Tracking
| Item | Cost | Cadence |
|---|---|---|
| Claude Pro | $20.00 | /month |
| trackwalk.racing domain | $10.81 | year 1 |
| trackwalk.racing renewal | ~$15 | /year |
| GitHub everything | $0 | — |
| Cloudflare Workers (free) | $0 | — |
| Google Analytics | $0 | — |
| Google Forms/Sheets | $0 | — |
| Kit.com | $0 | — |

**Monthly burn: ~$20/month** (Claude Pro only; domain amortized ~$1.25/mo)

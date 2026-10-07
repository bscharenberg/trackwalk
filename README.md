# Trackwalk

**[trackwalk.racing](https://trackwalk.racing)** — UCI downhill, without the noise.

A mobile-first PWA with two halves: a filtered feed of DH race content, and a results database
covering every UCI World Cup and World Championship round from 2009 to 2026.

No algorithm. No notifications. No unread count. A newspaper, not an inbox.

---

## What's in it

**Feed** — YouTube channels, Pinkbike and podcasts, scored against a DH keyword list and served
as a flat chronological card feed. Anything older than 30 days drops off, so it's always current.
Categories: race runs, analysis, films, paddock, news, plus a shorts strip.

**Results** — 18 seasons, 145 rounds, 2009–2026. Qualifying and finals, men and women, with
DNF/DSQ/DNS riders kept rather than silently dropped. Search any rider for their full career
history grouped by venue.

**Riders** — follow a personal list and see only their results. 212 elite riders with Instagram links.

**Pits** — teams, media, podcasts, UCI links, and where to watch by region.

Installable to a phone home screen, works offline, no app store.

## How it works

No server and no database. GitHub Actions fetches, filters and commits static JSON; GitHub Pages
serves it.

```
GitHub Actions
  ├── refresh.yml        twice hourly — YouTube + RSS → public/cache.json
  ├── fetch-results.yml  every 10 min — current-season results
  ├── live-results.yml   race-day polling, dispatched
  ├── dataride-fetch.yml every 6h — UCI DataRide backfill
  └── preflight.yml      weekly — source health check

trackwalk.racing (GitHub Pages)
  └── index.html reads public/cache.json + public/results/<year>.json
```

A Cloudflare Worker proxies the Pinkbike RSS feed, which doesn't send CORS headers.

## Content filtering

Items are scored against a weighted keyword list in [`scripts/content-filter.js`](scripts/content-filter.js).

| | |
|---|---|
| `MIN_SCORE` | **6** — below this an item is dropped |
| `BOOST_SCORE` | **4** — added for trusted sources |
| Untrusted threshold | **10** (`MIN_SCORE + 4`) |
| `MAX_AGE_DAYS` | **30** |

Venue names are high-signal and weighted so a venue alone can't carry an item over the line.
XCO is excluded at weight 15 — high enough to beat the sum of every boost. Enduro (EWS, EDR) is
excluded too: Trackwalk is DH only.

The UCI MTB World Series channel is deliberately **not** trusted, because it posts XCO and enduro
alongside downhill.

```bash
node scripts/test-filter.js                                # suite
node -e "const {scoreItem}=require('./scripts/content-filter.js'); console.log(scoreItem({title:'TEST'}))"
```

## Sources

17 YouTube channels and RSS feeds — official race coverage, team channels, film outfits like
Sleeper, and podcasts. The authoritative list lives in
[`scripts/youtube-fetcher.js`](scripts/youtube-fetcher.js) and
[`scripts/rss-fetcher.js`](scripts/rss-fetcher.js); it changes often enough that duplicating it
here just creates something else to go stale.

Results come from the UCI's own systems — DataRide, ChronoRace and Tissot.

## Quota

YouTube's free tier allows 10,000 units/day. Trackwalk reads each channel's uploads playlist
(`playlistItems.list`, 1 unit per channel) rather than `search.list` (100 units per query), so a
full refresh costs roughly 20 units — well under the daily limit even at twice-hourly.

## Running locally

```bash
git clone git@github.com:bscharenberg/trackwalk.git
cd trackwalk
npm install

cp .env.example .env     # add YOUTUBE_API_KEY

node scripts/build-cache.js   # rebuild the feed
npx serve .                   # index.html is at the repo root, not in public/
```

See [`docs/dev-workflow.md`](docs/dev-workflow.md) for the full workflow, and
[`docs/architecture.md`](docs/architecture.md) for how the pieces fit.

## Privacy

No accounts, no login, no personal data collected. Your rider list and preferences live in your
own browser's localStorage and are never sent anywhere. Analytics are aggregate only. No ads.

---

## License

**Proprietary — all rights reserved.** See [LICENSE](LICENSE).

The source is public to read for personal and educational reference. It is **not** open source:
commercial use, redistribution, hosting, and reuse of the results database or filtering logic
all require written permission. Licensing enquiries: bryon.career@gmail.com

---

Built by a saddle donkey, for saddle donkeys.

© 2026 Bryon Scharenberg.

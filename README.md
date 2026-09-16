# Trackwalk

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

> *"Ok dudes, let's walk this sucker."* — Cru Jones, RAD (1986)

A mobile-first PWA that aggregates UCI downhill race content into one clean, bookmarkable feed. No algorithm. No notifications. No unread count. Just racing.

---

## What it is

Trackwalk pulls from the best sources in the game — YouTube channels, Pinkbike, podcasts, and race film outfits like Sleeper — filters out everything that isn't UCI DH, and serves it as a card-based digest you can bookmark on your phone home screen.

Feels like a newspaper. Opens like an app. Updates itself.

## Sources

### Race coverage

| Source | What it is | Channel ID |
|---|---|---|
| WHOOP UCI MTB World Series | Official race channel — DH, interviews | `UCWS4nfoou79mwo9nHew49fA` |
| Pinkbike | Race coverage, Inside the Tape, WynTV, Story of the Race | `UC2GIHZpQiJy-8286f4lj_cg` |
| Red Bull Bike | UCI World Cup DH, behind the scenes, race highlights | `UCXqlds5f7B2OOs9vQuevl4A` |
| Just Ride | Rob Warner + Eliot Jackson — Red Bull podcast, rider interviews | `@RedBullJustRide` |
| GoPro Bike | Rider POVs, winning runs, race edits | `UCqhnX4jA0A5paNd1v-zEysw` |
| Vital MTB | Vital RAW race runs, World Cup DH coverage | `UCcX5xwMOCt92bi0dmspMFQw` |

### Films + rider channels

| Source | What it is | Channel ID |
|---|---|---|
| Sleeper Collective | Best cinematography in the sport, embedded with race teams | `UCuuLS5B9JraqXiKfYPIBNEw` |
| Bernard Kerr | Pivot Factory Racing owner + rider, lifestyle DH documentary | `UCOYc6SI_fVrNvoutot7D9IA` |
| WynTV | Wyn Masters — paddock interviews and race commentary (via Pinkbike RSS) | — |

### Teams

| Source | What it is | Channel ID |
|---|---|---|
| Santa Cruz Syndicate | Most decorated DH team — Jackson Goldstone, Nina Hoffmann, Laurie Greenland | `UCCb8I3PHEUFPV0Jds0-_eig` |
| Specialized Gravity | Loic Bruni, Finn Iles, Jordan Williams | `@specializedgravity` |
| Commencal Bikes & Skis | DH racing since 2003, strong race edit output | `UCPUGv78-mvU6gaFBgjY67vA` |
| AON Racing | Reece Wilson's prototype DH team — Gamux bikes, Sleeper-produced content | `@AON_Racing` |
| Frameworks / Neko Mulally | Privateer DH team, built their own race bike from scratch | `youtube.com/user/nekomulally` |

### Podcasts + deep dives

| Source | What it is | Feed / Channel ID |
|---|---|---|
| Downtime Podcast | The DH + enduro podcast — athletes, coaches, team managers, engineers | `downtimepodcast.com/feed/podcast/` |
| Downtime Podcast (video) | YouTube version of above | `youtube.com/c/DowntimeMountainBikePodcast` |

### RSS feeds

| Source | Feed |
|---|---|
| Pinkbike racing | `pinkbike.com/rss/news/` (filtered: `racing`, `downhill`) |
| Downtime Podcast | `downtimepodcast.com/feed/podcast/` |
| UCI MTB World Series | `ucimtbworldseries.com` |

### Key content to surface from within Pinkbike

- `inside the tape` + `ben cathro` — track analysis and ghosted run breakdowns at every World Cup
- `wyntv` — paddock and finish-corral interviews
- `story of the race` — post-race video analysis
- `race analysis` — split times and stats

---

## How it works

A GitHub Actions cron job runs weekly, fetches fresh content from each source, scores and filters it against a UCI DH keyword list, and commits a static `cache.json`. The PWA reads that file on load. No server. No database. No cost.

```
GitHub Actions (weekly cron)
  → fetch YouTube + RSS sources
  → score + filter for UCI DH content
  → write cache.json
  → commit to main

trackwalk.racing (GitHub Pages)
  → serves static PWA
  → reads cache.json on load
  → card-based feed by category
```

## Content categories

- 🏁 **Race runs** — full runs, qualifying, finals, Vital RAW
- 🏆 **Results** — podiums, standings, race reports, split analysis
- 🎬 **Films** — Sleeper and long-form race edits
- 🎙️ **Paddock** — WynTV, Inside the Tape, Just Ride, Downtime
- 📰 **News** — team updates, course previews, UCI announcements

## Content filtering

Videos and articles are scored against a weighted keyword list. High-confidence terms (`dh world cup`, `ews`, `leogang`, `val di sole`, `fort william`, `qualifying`, `race run`) score highest. Generic MTB content scores low and gets dropped. Channels like Sleeper get a source-level score boost — if it's from Sleeper, it's almost certainly worth surfacing.

Full logic in `scripts/content-filter.js`.

## Tech stack

- Vanilla JS + HTML/CSS (no framework needed for v1)
- GitHub Actions — scheduled content refresh
- GitHub Pages — free static hosting
- YouTube Data API v3 — free tier (~6–10 units/week of 10,000/day limit)
- Pinkbike RSS — public feed
- PWA — installable, offline-capable, no app store

## Quota strategy

YouTube's free tier allows 10,000 API units/day. Trackwalk uses the uploads playlist approach (`playlistItems.list`) instead of `search.list`, which costs 1 unit per channel vs 100 units per search. Weekly refresh across all sources costs roughly 6–10 units total — well under 0.1% of the daily limit.

## Running locally

```bash
git clone https://github.com/bscharenberg/trackwalk
cd trackwalk
npm install

# add your YouTube API key
cp .env.example .env
# edit .env and add YOUTUBE_API_KEY=your_key_here

# run the content pipeline manually
node scripts/build-cache.js

# serve locally
npx serve public
```

## Philosophy

No auth. No PII. No tracking. No ads. Fully public and open source.

Built for bike geeks who want the racing without the noise.

---

Built by a saddle donkey, for saddle donkeys.

---

*Trackwalk is an independent project and is not affiliated with the film Rad, its cast, or any related properties. The name is used in tribute to the culture of the sport.*

*MIT Licensed. © 2026 bscharenberg.*

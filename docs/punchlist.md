# Trackwalk — Product Backlog & Punch List

**Last updated**: 2026-06-12

## Current State: LIVE ✅
- trackwalk.racing live with HTTPS, FEED / RESULTS / RIDERS / PITS navigation
- Hourly cache refresh running clean
- Results data: 2025–2026 via UCI JSON API (replaced/corrected), 2009–2024 backfilled via
  UCI DataRide JSON API (16 seasons, see `docs/historical-data.md` §7/§9). DNF/DSQ/DNS riders
  kept and listed last with no finish number.
- Shorts strip in feed with duration-based detection (≤60s); seen/dim state on all cards
- PITS tab with TEAMS / MEDIA / PODCASTS / UCI / WATCH sub-tabs; real broadcaster data in watch.json
- Email list via Kit.com (hello@trackwalk.racing)
- R1 South Korea, R2 Loudenvielle, R3 Leogang results live
- Results fetcher workflow: race-day crons + 30-min polling backstop. Auto-commit fixed 2026-06-14 (see `docs/decisions.md`) — the old commit step `git stash`/`pop`'d around the rebase, which unstaged the `git add`, so `git diff --staged --quiet` was always true and results were fetched then silently dropped. Now commits first, then rebase-and-push with retries.
- Branding finalized: chainsaw icon (192×192/512×512), header icon + white wordmark lockup, OG/Twitter share card and meta tags live

---

## Completed ✅

### Infrastructure & Pipeline
- Domain registered (trackwalk.racing)
- GitHub repos (trackwalk + helltrack-results)
- YouTube API key + content pipeline
- Hourly GitHub Actions cache refresh
- Cloudflare Worker proxy for Pinkbike RSS (helltrack-rss, free plan)
- PDF parser (ChronoRace format) — built and later retired
- Browser Rendering Worker (helltrack-results) — built and later retired
- Migrated results pipeline to UCI JSON API (no PDFs, no Worker)
- Retired helltrack-results Worker, downgraded Cloudflare to free (#40)
- 2024 historical data from downhillr .rda files
- GitHub Action for results-fetcher (race weekend auto-trigger with targeted crons)

### Frontend & UI
- Results tab with multi-season UI
- Top 5 visual weight treatment (gold/silver/bronze + elevated 4-5)
- Qualifying sessions (Q1/Q2) in results
- 4-row results nav sticky in header
- Bottom sheet preview with source-aware CTAs
- iOS install tip banner (one-time, localStorage dismiss)
- Tab ID collision fixed (standings vs results internally)
- Shorts strip (duration-based detection ≤60s, horizontal scroll, portrait cards)
- Seen/dim state on feed cards and Shorts (45% opacity, persists in localStorage)
- PITS tab with sub-tab nav (TEAMS / MEDIA / PODCASTS / UCI / WATCH)
- RIDERS tab with Men/Women toggle, Instagram links
- Kit.com email signup form (mid-feed, static HTML embed, Barlow Condensed styled)
- Email hello@trackwalk.racing via Cloudflare routing + Kit sending domain
- Kit.com welcome automation (fires immediately on signup)
- Deep link sharing — Web Share API on mobile, clipboard fallback on desktop (#38)
- In-app YouTube player in bottom sheet — embedded iframe via YouTube IFrame Player API, "Open in YouTube →" secondary link, falls back to "Watch on YouTube" CTA if embedding is disabled (#40)
- Rider search view in RESULTS tab — diacritic-normalized lookup across all seasons, picker for ambiguous matches, full history table (#8)

### Content & Data
- XCO filtering fixed (weight 15 + mtbws highlights -8)
- South Korea / YongPyong venue keywords
- MTBWS DHI highlights scoring fixed
- Category item limit bumped 10→20
- Fox Factory channel added (trusted source)
- Frameworks Bicycles channel added
- Just Ride (Red Bull) channel added
- WynTV channel added
- Feedback button → Google Form → Google Sheet
- Google Analytics (G-4EY22R6D2J)
- Content filter: ben cathro dropped from +6 athlete rule → product/lifestyle articles no longer pass
- watch.json: real broadcaster data (US, Canada, UK, Europe, Australia, New Zealand, Everywhere)
- directory.json: factory teams, media outlets, podcasts, UCI official links

### XCC leak — UCI race-tag template changed (2026-07-05)
6 La Thuile XCC Shorts leaked into the feed (scored exactly 10, the untrusted-channel
threshold) despite having zero discipline text in the title — the giveaway pattern from
`decisions.md`'s "rider feature Shorts" note. Root cause: UCI's per-video race-tag line
changed from `"...Elite XCC World Cup"` to `"...Elite UCI XCC World Cup"` (an inserted
"UCI"), which silently broke the exact-phrase exclude (`'elite xcc'`) added back on
2026-06-14 for this exact leak pattern. Fixed in `content-filter.js`: added the `'elite uci
xco'`/`'elite uci xcc'` variants alongside the originals (kept both in case the template
shifts again or older videos use the old wording). Also added 5 newly-confirmed XCO/XCC
rider names to the titleOnly name-exclude list as defense-in-depth (Sina Frei, Jenny
Rissveds, Evie Richards, Adrien Boichis, Charlie Aldridge) — confirmed via their own race-tag
line in the same leaked captions, not assumption. Verified against `test-filter.js` (no
regressions) and a live cache rebuild (0 of 20 shorts match any race-tag term afterward).
See `docs/decisions.md` for the full XCO-filtering history this extends.

### My Riders results feed (2026-07-03)
Retention play — turns the saved-riders feature into a personal reason to return. A "Your
Riders" strip at the top of the feed shows each followed rider's latest 2026 result + the
next race date ("Next · La Thuile · Jul 5"); tapping a card deep-links to that rider's full
history in Results search. Only renders for users who follow riders (no clutter otherwise).
`results.json` is lazy-loaded (promise-cached, shared with the Results tab) so the feed
stays cheap for everyone else — this is the main reason **#46** (split results.json) is
worth doing: it makes this strip's data load ~KB not 8.2 MB.

**Freshness fix (2026-07-03, same day):** originally only checked `finals-*` sessions, so a
round's live qualifying was ignored until its finals posted — a rider's card kept showing
their last completed round's finals days after a newer round's quals were already up (caught
live: La Thuile Q1/Q2 posted 07-03, finals not until 07-05; Finn Iles's card was stuck on his
old Lenzerheide finals result instead of his fresh La Thuile Q1 P17). `latestResultForRider()`
now scans every session in every round and picks the single most recent one — latest round
date wins, and within a round finals > Qual 2 > Qual 1 (reuses the existing `SESSION_ORDER`).
Qualifying results get a small "Qual 1"/"Qual 2" tag and podium (silver) coloring, never the
acid "P1" treatment reserved for an actual finals win. SW cache bumped v9→v10.

**Related gap — hardened same day:** `fetch-results.yml`'s date-gate assumed La Thuile
qualifying would post 07-04, but it posted 07-03 — a day earlier than the workflow's
case-statement expected, so neither the targeted nor the 30-min-poll path fetched it
automatically; pulled in manually via `results-fetcher.mjs la-thuile-2026` this session.
Widened every remaining 2026 round's window (La Thuile onward; past rounds left alone —
functionally irrelevant now) from the old single qual/finals day-pair to
`[finals date − 3 days, finals date + 1 day]` — e.g. La Thuile 07-05 finals now matches
07-02 through 07-06, not just 07-04|07-05. Covers Q1/Q2 posting a few days early and a
rain-delayed finals; a day outside every window is still a safe no-op (`slug=unknown` skips
every remaining step), so the wider windows cost nothing on idle days. Verified the exact
case-statement patterns against every window boundary (bash) and confirmed no bleed into
adjacent rounds' windows before shipping.
`index.html` + SW cache bump v6→v7. Followed riders are set via the existing Riders-tab bookmark.

### Codebase audit pass (2026-07-02)
360° audit + fixes. Shipped: service-worker paths fixed (`/trackwalk/`→root, cache bumped
v5→v6 — the SW never installed in production before this); build-cache min-items guard
(refuses to write an empty cache.json on a source outage); content-filter word-boundary
matching (`ews`⊂"news", `ski`⊂"skills" were silently dropping valid DH content);
results-fetcher now keeps DNF/DNS/DSQ riders (was dropping them — recovered e.g. Asa
Vermette DSQ + Daprela DNS at Loudenvielle) with all four 2026 rounds backfilled via a new
`--force` flag; riders given-first display + surname sort + 5 missing flags + 4 de-duped
rows; deterministic Pinkbike timestamps (no more hourly "just now" reshuffle); XSS-escape on
feed titles; tabs render before feed load; hourly-refresh push retry; orphan sweep
(`public/index.html`, stale manifest/icons, `teams.json`→`docs/team-rosters.archive.json`);
docs synced (channel IDs, SW version, 2026 calendar dates). See git history for the full set.

**Ongoing (F3):** the XCO/road rider-name exclude list in `content-filter.js` needs a top-up
each shared-venue weekend as new XCO stars appear — no general fix, it's whack-a-mole.

---

## Active Backlog

| # | Item | Size | Priority | Description |
|---|---|---|---|---|
| 7 | ~~Real PWA icon~~ | — | Done | ~~Replace placeholder HT icon~~ — replaced with chainsaw logo (icon-192.png/icon-512.png, #d4f500), header updated to icon + white wordmark lockup, OG/Twitter meta tags added (2026-06-12). |
| 41 | Dynamic OG image for video shares (Cloudflare Worker) | S | Low | Static `og:image` can't differ between homepage and `?v=` video shares. Worker (same pattern as helltrack-rss) checks for `?v=` param: if present, injects that video's YouTube thumbnail (`maxresdefault.jpg`, fallback `hqdefault.jpg`) as `og:image` (+ optionally `og:title`); if absent, serves the static brand card. Needs route binding on trackwalk.racing domain (not just workers.dev). Est. ~1 hour. Build when share volume justifies it. |
| 36b | 2024 results quality pass | S | Medium | ~~Re-fetch 2024 data via UCI JSON API~~ — done as part of the 2009–2024 DataRide backfill (2026-06-10). Bielsko-Biała 2024 winner now sourced from DataRide; re-verify against #34. |
| 34 | Results data accuracy audit | M | Medium | Verify all 2024 round winners against authoritative sources. Podiums spot-checked against known history during the DataRide backfill (all seasons 2009-2024) — looked correct, but a formal audit hasn't been done. |
| 5 | ~~Historical results 2015–2023~~ | — | Done | ~~Scrape and integrate~~ — superseded by the 2009–2024 UCI DataRide backfill (2026-06-10). See `docs/historical-data.md` §7/§9. |
| 37 | results.json file size (8.0 MB) | M | Medium | After the 2009–2024 backfill, results.json grew from ~150 KB to 8.0 MB. Decide: split into `results-<year>.json` lazy-loaded per season, or keep monolithic. See `docs/historical-data.md` §8. |
| 38 | 2023–2024 finals-women possibly truncated | M | Medium | Most 2023–2024 World Cup rounds show only ~10–13 finals-women rows (vs ~15–18 in 2021–22, ~32–40 at Worlds), with no DNF/DSQ/DNS entries. DataRide's own Results endpoint returns only those rows — unclear if this is a DataRide data gap (need PDF supplement) or a real 2023+ format change (smaller finals fields at regular rounds). Needs research before deciding on a fix. See `docs/historical-data.md` §9. |
| 39 | 2022 Lenzerheide missing qualifying-men | S | Low | DataRide has no Men Elite qualifying race for this competition. Likely a genuine source gap; no known fix. See `docs/historical-data.md` §9. |
| 8 | ~~Rider search in results~~ | — | Done | ~~Filter results.json for a rider name, show rank/time/gap across all rounds~~ — new "Search" sub-view in RESULTS tab, diacritic-normalized lookup across all 16 seasons, picker for ambiguous matches, full history table sorted most recent first (2026-06-12, `69d5bc1`). |
| 9 | Rider comparison | M | Low | Two rider searches side by side. Depends on #8 (done). |
| 10 | Season standings / points table | M | Low | Points per round already in results.json. Aggregate into standings view by season. |
| 42 | ~~Rider-primary search: venue-grouped history cards~~ | — | Done | ~~Group a rider's results by venue~~ — search results now render as venue-grouped cards (most-recent visit first), finals rank as the headline (acid yellow for P1 w/ absolute time, gray + gap otherwise), DNF/DNS/DSQ as a red badge, Q1/Q2/points collapsed behind a tap-to-expand chevron (2026-06-14, `index.html`). |
| 43 | Venue conditions tagging | S | Low | Hand-entered `conditions` enum (`dry`/`wet`/`mixed`/`dusty`/`hot`) + optional `conditionsNote` free text per round in results.json, shown as a muted chip on the venue/year row. Data + display only, no filtering UI yet. Full spec in "Pending PBIs — fantasy picking" below. |
| 44 | ~~Venue cross-year view + rider↔venue loop~~ | — | Done | ~~Depends on #42.~~ Selecting a venue in Results (via a rider card's venue-name tap) opens a cross-year podium stack for that venue — respects gender/session toggles, reuses existing podium styling, "← Back to search" returns to the rider's prior search results (2026-06-14, `index.html`). |
| 45 | Venue-primary search | M | Medium | The #44 cross-year venue view is currently only reachable via rider search → tap a venue name in their card. There's no way to search "Leogang" directly and land on its cross-year view. Needs a venue-name index alongside the existing rider-name index (`buildRiderIndex`) in the Search sub-view, plus a way to disambiguate rider vs. venue matches in the picker (e.g. a result-type label). Not yet speced — flagged for follow-up planning. |
| 33b | ~~Thumbs-down filter feedback~~ | — | Dropped | Filter is clean enough. GA card_open provides sufficient signal. |
| 46 | Split results.json per season | M | Medium | results.json is 8.2 MB and was fetched on every Results-tab open. Split into `results-index.json` (seasons/rounds/venues) + `results-<year>.json` lazy-loaded; current season by default. Unlocks proper caching (the `?t=` cache-buster is already removed) and moves `buildRiderIndex()`'s full-history walk off the main thread. Supersedes #37. |
| 47 | Standings points-source audit | M | Low | `computeStandings()` sums finals `points` only; if UCI awards qualifying/semifinal points (2023+ format) the Standings view undercounts vs official. The `lastRank` tiebreak also stays 999 for anyone who missed the latest round. Verify against official season standings before changing. |
| 48 | ~~My Riders feed — empty-state prompt~~ | — | Done | ~~First-time visitors never saw the "Your Riders" section~~ — `renderMyRidersFeed()` now always renders the header; when no riders are saved it shows a dashed-border "Pick your 6 →" prompt card that jumps to the Riders tab (`goToRidersTab()`), instead of hiding the section. Deliberately skips loading `results.json` on the empty path so a brand-new visitor's feed load stays cheap. Shipped 2026-07-03 ahead of La Thuile race weekend as an onboarding fix for the My Riders feed's adoption risk. SW cache bumped v8→v9. |

### Notes on backlog items
- **#36b / #34**: Combine these — formal audit of 2024 (and now 2009-2023) winners against authoritative sources is still open, though spot-checks during ingest found no errors.
- **#37/#38/#39**: Surfaced by the 2009–2024 DataRide backfill completeness audit (2026-06-10) — see `docs/historical-data.md` §9 for full detail.
- **#41**: Confirm `maxresdefault.jpg` exists for most videos before building — falls back to `hqdefault.jpg` if not.
- **Tire/setup data** (research note, not a PBI) — no clean structured source exists; revisit only if one appears, otherwise too sparse/manual to be worth building.

---

## Pending PBIs — fantasy picking (rider/venue) batch

Three sequenced PBIs aimed at the "fantasy team picking" use case: is this rider
consistent across venues, and who performs well at a given venue. #42 and #44 are
sequenced (#44 depends on #42); #43 is independent.

### PBI 1 (#42) — Rider-primary search: venue-grouped history cards — done (2026-06-14)

**What:** Replace the flat session-list output of rider search with venue-grouped cards where finals rank is the visual headline.

**Shipped as:** `groupRiderByVenue()`, `pickVisitHeadline()`, `renderVisitRow()`, `renderVenueCard()`, `toggleRvcVisit()` + `.rvc-*` CSS classes in `index.html`. `renderRiderSearchResults()` now calls `renderVenueCard()` per venue group instead of building a flat table.

**Note for PBI 3 (#44):** the venue-name element in each card (`.rvc-venue-name`) is plain text with no click handler yet — #44's "wire the venue-name tap" step needs to add that onclick to navigate into the cross-year view.

**Why:** Searching a rider is a fantasy-vetting move — "is this rider consistent across venues, or a one-track wonder?" A flat list of every session weights a Q2 run equally with a finals win, so nothing reads. Grouping by venue with finals rank as the loud element answers the real question at a glance.

**Logic:**
- Group a rider's results by venue, then sort visits within each venue most-recent-year first.
- Per venue block: venue name header + visit count; one row per year showing finals rank (large, acid yellow `#d4f500` for a win/P1, gray `#ccc` otherwise) + session label + time (P1 absolute time, others gap `+x.xxx`).
- Collapse Q1/Q2/splits/bib/points behind a tap — not shown on first render. Expand affordance is a chevron/details target on the row, distinct from the venue-name tap (see PBI 3/#44).
- DNF/DNS/DSQ in finals: show as the headline with a red `DNF` badge — never substitute a better session. (Honesty principle; matches your audience.)
- Default venue-block sort: most-recent-visit first.

**File:** `index.html` (search render logic + CSS). No data changes — reads existing `public/results.json`.

**Done when:**
- Searching a rider returns venue-grouped cards, not a flat session list.
- Finals rank is the dominant visual element; a P1 is acid yellow.
- Each venue shows the rider's cross-year trajectory (e.g. Leogang: 1 / 4 / 2) readable without parsing dates.
- Q1/Q2/splits are hidden until expanded.
- A DNF season shows DNF as headline with red badge, no fabricated better number.

### PBI 2 (#43) — Venue conditions tagging (structured tag + optional note)

**What:** Add a hand-entered conditions field to each round so results can eventually be filtered by track state.

**Why:** Fantasy picking needs "who's good in the mud / heat." This data isn't in the UCI API, but it's trivial to hand-tag (~10 rounds/year). Structured so it's filterable later; with a free-form note for human detail.

**Logic:**
- Add to each round object in `results.json`: `conditions` (enum string, one of `dry`/`wet`/`mixed`/`dusty`/`hot`) and optional `conditionsNote` (free string for texture, e.g. "rained overnight, dried by finals").
- Both optional — absence renders nothing, no layout break.
- Display: small muted condition chip on the venue/year row in both rider and venue views; note shown only in expanded state.
- No filtering UI yet — this PBI only lands the data + display. Filtering is a follow-on once tags exist across enough rounds.

**File:** `public/results.json` (schema + hand-entered values), `index.html` (chip display).

**Done when:**
- A round can carry a `conditions` enum value (`dry`/`wet`/`mixed`/`dusty`/`hot`) and an optional `conditionsNote`.
- Tagged rounds show a condition chip; untagged rounds render normally.
- Enum (not free text) drives the chip, so future filtering can key off it directly.

### PBI 3 (#44) — Venue cross-year view + the rider↔venue loop — done (2026-06-14)

**What:** Extend the Results tab so a selected venue can show a cross-year podium stack, and wire the rider card's venue header to deep-link into it.

**Shipped as:** new `activeView === 'venue'` sub-state with `goToVenue(venueName)`, `getVenueRounds()`, `renderVenueCrossYear()` in `index.html`. Hero-row markup extracted into a shared `renderHeroRows(session, isFinals)` helper, used by both the single-round Results view and the cross-year view (avoids duplicating podium markup). `setResultsView()` extended with venue-view nav-bar visibility rules (year/round/view bars hidden, gender/session bars shown, "← Back to search" link shown). `.rvc-venue-name` (from #42) now has an onclick → `goToVenue()` plus a `›` chevron affordance.

**Why:** The other fantasy moment — "I'm filling the Leogang slot, who performs here?" The Results tab already answers single-year venue results; this adds the multi-season stack ("last 5 years at Leogang") and makes the rider→venue→rider round-trip fast, which is how someone actually picks a team.

**Logic:**
- In Results, when a venue is selected, add a cross-year view: for the active gender + session, stack each year's top 5 (reuse existing podium styling).
- Respect existing gender + session toggles (this is why venue data lives in Results, not Search — it needs those controls).
- Wire the rider card's venue-name tap (#42) to switch to Results, filtered to that venue, in cross-year view. The chevron/expand tap stays inline; the venue-name tap navigates. Two targets, two intents.
- Back-navigation returns to the rider's search results so the picking loop is fast.

**File:** `index.html` (Results tab render + nav state + cross-link wiring).

**Done when:**
- Selecting a venue in Results offers a cross-year podium stack for the active gender/session. ✅
- Tapping a venue name in a rider card lands on that venue's cross-year view. ✅
- Returning gets the user back to their rider search without re-typing. ✅
- Gender/session toggles work in the cross-year view. ✅

---

## Wordmark/icon batch — done (2026-06-12)

All three PBIs shipped:
- **PBI 1** — `/og-image.png` swapped to designer's final chainsaw-as-T TRACKWALK lockup (1200×630). (`944819f`)
- **PBI 2** — Header icon swapped to rounded-corner chainsaw, recolored `#ceff00`→`#d4f500`, 40px, PWA home-screen icons (`icon-192.png`/`icon-512.png`) untouched. New asset `icon-round-192.png`. (`c179996`)
- **PBI 3** — Header "TRACKWALK" text replaced with inline SVG wordmark (white `#ffffff`, 26px height, `role="img"`/`aria-label`/`<title>` for a11y), subtext unchanged, SW cache bumped `trackwalk-v3`→`trackwalk-v4`. (`2416bfe`)

**Eyeball check (post-PBI 3)**: `HT-Wordmark.svg` is plain white "TRACKWALK" lettering — no embedded chainsaw, no `#d4f500` accent. The rounded chainsaw icon (PBI 2) is the only chainsaw in the header, so there's no redundancy. Kept both icon and wordmark.

---

## Results perf — done (2026-09-03)

**Boot path** (`f81d0eb`→): ConvertKit script deferred (it was a sync script above the app
script, so `loadFeed()` could not start until their CDN answered), `cache.json` prefetched from
`<head>`, Google Fonts `@font-face` inlined (the stylesheet was render-blocking), gtag moved to
the `load` event, service worker switched to stale-while-revalidate for feed data.

**results.json split**: was 8.8 MB pretty-printed, downloaded and parsed in full to show one
round — ~2s to paint the Results tab even from localhost, and it also fired on the feed for
anyone following riders. `scripts/split-results.js` now derives `public/results/index.json`
(under 1 KB) + `public/results/<year>.json` (minified, ~100–350 KB).

- Opening the app: index + current season only, **8.8 MB → 314 KB**.
- Tapping an older year: that season alone, on demand.
- Rider search / venue history: full archive, loaded on entering those views only (they
  genuinely need every season) — shown partial-then-repainted, without stealing search focus.
- Year bar comes from the index, so every season is tappable before its file exists locally.
- Both results workflows run the split and commit `public/results/` alongside results.json.
- Stale-first paint is paired with `revalidateSeason()` / `revalidateResultsIndex()`, so a
  round that lands mid-session repaints instead of waiting for the next app open. Guarded:
  only repaints the view in front of the user, and only follows a new round for someone
  already on the latest one.

---

## Riders tab offline — fixed (2026-09-03)

`riders.json` was fetched with `?t=` + timestamp on every load. A fresh URL never matches a
cached entry, so the service worker's copy was write-only and the tab showed "Riders
unavailable" offline. Now fetched clean (worker serves it stale-first) with an explicit
`revalidateRiders()` afterwards, the same shape as the feed and results shards. Also added to
`STATIC_ASSETS`, so it works offline even for someone who never opened the tab. Cache v15.

## Pits tab offline — fixed (2026-09-03)

Same root cause as Riders: `directory.json` and `watch.json` were fetched with `?t=` +
timestamp, so the cache-first default degraded to network-only and the tab rendered its
"Loading…" placeholders forever with no network. Both now fetched clean, added to the
worker's stale-while-revalidate list and to `STATIC_ASSETS`, with `revalidatePits()` fetching
past the worker afterwards. Cache v16.

Every app data file now follows one pattern: fetch clean → worker serves stale-first →
explicit `?t=` revalidate → repaint only if the data moved and only if that view is on screen.
See `revalidateFeed()`, `revalidateSeason()`, `revalidateResultsIndex()`, `revalidateRiders()`,
`revalidatePits()`. The whole app is now usable offline.

---

## Provisional results state — shipped (2026-09-03)

The pipeline records `status` and `fetchedAt` per round, and the UI read neither — every
`.status` in index.html was an HTTP response code. A round captured mid-session rendered
identically to a signed-off one.

`roundState()` + `.rs-state` now badge the results header:
- `status: 'Live'`, round date today or later → **In progress**
- `status: 'Live'`, round date past → **Provisional** (captured mid-session, never confirmed)
- Anything else → **no badge**. 136 of 143 rounds have no status; labelling the 7 `Confirmed`
  ones would imply something false about the rest. Silence is the honest default.

Both carry a "Last updated <local time>" from `fetchedAt`.

### Pipeline gap this exposed
Val di Sole 2026-08-29 (Worlds) is committed with `status: 'Live'` and `fetchedAt`
2026-08-28 — captured mid-session by the Tissot fetcher and never re-fetched to confirm.
The badge is correct and will stay until something re-runs the fetcher for that round
(`node scripts/tissot-fetcher.mjs 2026 --merge`, then `node scripts/split-results.js`).

Worth deciding: nothing currently re-fetches a round after race day to pick up protests,
DSQs or timing corrections. `fetch-results.yml` is keyed to race days, so a round that
finishes in a `Live` state stays that way. A follow-up pass a day or two after each round
would close it.

### Not covered
Standings and the venue cross-year view compute from the same rounds but show no state.
If a provisional round feeds the championship table, that table is provisional too.

---

## Shorts player — shipped (2026-09-03)

Full-screen vertical continuation player over the Shorts strip. Tap a card → fullscreen at
that clip → it plays → **when it ends the next one arrives on its own**. Swiping is the
override, not the primary motion. Cache v18.

### Decisions
- **Finite, not infinite.** Slide 21 is an end card ("That's all the Shorts" → back to feed).
  Looping is inbox behaviour; ending is newspaper behaviour. This also made the 20-clip pool
  shippable now, so pool depth became a tunable rather than a blocker.
- **Sound: dedicated speaker button.** Tap the video = play/pause; tap the speaker = sound.
  Two gestures, two meanings. Preference persists in localStorage.
- **YT.Player, not raw <iframe>.** Required for onError (embed-blocked clips), onStateChange
  → ENDED (which IS the auto-advance), and destroy() (clearing src leaves audio alive).

### What the code had to work around
- **Native smooth scrolling is a no-op inside a mandatory-snap container.** Both
  `scrollIntoView({behavior:'smooth'})` and `scrollTo({behavior:'smooth'})` do nothing.
  `spScrollToSlide()` animates scrollTop on a timer with snap disabled for the duration.
- **requestAnimationFrame never fires in a backgrounded/offscreen webview**, which latched
  the animation flag and wedged every later advance. Hence a timer, and an idempotent
  `spStopAnim()`.
- **Don't wait on IntersectionObserver for a scroll you initiated** — it can lag badly.
  Auto-advance calls `spSetActive()` directly; the observer only handles user swipes.
- **Unmuted autoplay can be refused** even with a stored preference. `spStart()` falls back
  to muted playback and resets the control, rather than showing a frozen first frame or
  claiming sound is on when it isn't.

### Measured
19 of 20 clips are embeddable; one UCI clip returns error 150 (owner disabled embedding).
The skip path handles it — with a bare iframe that clip would be a dead black slide.

### Fixed on first real-device use (v20)
`.sp-tap` — the invisible full-slide play/pause layer — was `z-index: 2` while `.sp-overlay`
had none, so the tap layer sat on top and swallowed the "Watch on YouTube" link. The overlay
is now `z-index: 3`; it stays transparent to taps, only its children take them. Caught only
on a phone, because the failure is a tap that silently does nothing.

Also: a dead slide has no player, so its tap layer had nothing to toggle. Tapping anywhere on
an embed-blocked clip now opens it on YouTube, and the message says so.

### YouTube chrome removed (v21)
Second device report: YouTube's own controls rendered but did nothing — no fullscreen, no
scrubbing, no audio menu. Same root cause as the link bug one layer deeper. The `.sp-tap`
layer is what keeps vertical swiping working; without it the iframe captures the gesture and
you cannot move between clips at all. So YouTube's controls can never receive a tap while
that layer exists.

Rendering dead controls is worse than rendering none, so `controls: 0` (plus `fs: 0`,
`disablekb: 1`, `iv_load_policy: 3`). We supply play/pause, sound and a slim read-only
progress bar; full controls live behind "Watch on YouTube".

**Trade-off worth revisiting:** scrubbing and native fullscreen are gone inside the player.
The alternative is dropping the tap layer and losing swipe-between-clips, which would remove
the entire point of the feature. A draggable scrub on our own progress bar is possible later
if it's missed — horizontal drag doesn't conflict with the vertical snap.

### Interaction model — settled (v22)
Three device reports drove this: sound was undiscoverable, the video rendered postage-stamp
sized, and YouTube's chrome kept reappearing.

| Gesture | Does |
|---|---|
| Tap anywhere on the clip | Toggle sound |
| Swipe up / down | Previous / next clip |
| Swipe down at the top of the first slide | Close |
| Speaker button (top left, 44px) | Toggle sound |
| ✕ (top right) | Close |
| "Watch on YouTube" (bottom left) | Open on YouTube |
| Clip ends | Auto-advance |

**Tap is sound, not play/pause.** Pausing summons YouTube's paused overlay — title, share
arrow, YouTube logo — which `controls:0` does not suppress and we cannot dismiss. Never
pausing keeps that chrome off screen. Stopping is what the swipe and ✕ are for.
**Trade-off:** there is no pause. Revisit if it is missed.

**Frame fills the viewport.** It was `aspect-ratio: 16/9`, i.e. ~210px tall on a phone — and
YouTube then fitted the *portrait* clip inside that short box, so a Short rendered about
290px wide adrift in black. Nested letterboxing. The player fits a clip to whatever box it is
given, so a full-screen box needs no orientation detection: portrait clips run near
full-height, landscape full-width and centred.

**Sound state is read from the player, not from our intent.** A browser can refuse to unmute;
a control claiming sound is on over a silent clip is worse than the silence. The 250ms ticker
syncs the icon and the prompt from `player.isMuted()`, so a refused unmute brings the prompt
back and one more tap retries with a fresh gesture. The stored preference is no longer
discarded when that happens.

### Sound carry-over across clips (v23)
Sound would not persist to the next short, and took two taps to restore on each one.

Three causes, all in the same loop:
1. `spToggleSound` flipped our stored *intent*. After a refused unmute, intent said "on"
   while the player was muted — so the first tap muted something already silent and only the
   second turned sound on. It now derives the new state from `player.isMuted()`, so one tap
   always does the obvious thing.
2. The mute fallback was a blind 1s snapshot, so a clip that was merely slow to buffer got
   muted for it. It is now cancelled by the `PLAYING` state event and given 2.5s.
3. Nothing re-applied the setting to a new clip. Every player is created muted — unmuted
   autoplay is refused before a gesture — so the unmute has to be redone per clip, and it
   only reliably takes once the clip is actually playing. `onStateChange` → `PLAYING` now
   re-applies it.

### Autoplay and the second tap (v24)
Report: each short arrived paused — tap once to play, again for sound.

Root cause of the paused arrival: **the YouTube API was loaded lazily**. `loadYouTubeAPI`
calls back synchronously only once the script is in; on a fresh app open the first Shorts tap
went through an async script download, so the player was constructed in a later callback with
the user gesture already gone — and iOS only grants autoplay to a player created synchronously
inside a gesture. Every later mount happens in a scroll callback, which has no gesture at all,
so nothing ever autoplayed.

Fixes:
- Warm the API 1.2s after `load`, so a tap creates its player synchronously. Verified: right
  after the click `spPlayers[0]` is a real player object, where it used to be the string
  `'pending'`.
- `onStateChange` → `PLAYING` now unmutes **unconditionally** when sound is on. It was gated
  on `isMuted()`, which can report false immediately after a muted start — that gate was the
  second tap.
- One `playVideo()` retry at 700ms for a neighbour player that ignored an early call, well
  ahead of the 2.5s mute fallback.

**Still device-dependent.** If clips remain paused, the browser is refusing muted autoplay
outright — check Low Power Mode (disables all autoplay) and Settings → Safari → Auto-Play.
In that case one tap per clip is the floor, and it should now be one tap, not two.

### Not verified in the preview pane
Whether playback actually starts on a real user tap. The pane blocks autoplay and synthetic
clicks grant no user activation, so `playerState` stays -1 there. **Needs a check on a real
phone.** Everything else — advance, 3-player windowing, teardown, seen state, end card,
close/restore, error skip, sound persistence — is verified.

### Follow-ups
- Store `durationSeconds` in cache.json. `youtube-fetcher.js` already fetches it to compute
  `isShort` and throws the number away. Would allow a progress hint and filtering the
  ~3-minute UCI clips out of the swipe loop.
- Pool is 20, capped by `MAX_ITEMS_PER_CATEGORY` (not the age window — see the PBI 1 review).
  A shorts-specific cap is the one-line unlock if the player proves worth deepening.
- `shorts_open` / `shorts_view` / `shorts_advance` / `shorts_complete` gtag events are wired,
  so the engagement question is answerable rather than a guess.

---

## App shell network-first — fixed (2026-09-03)

The Shorts player shipped and the installed PWA still showed the old bottom sheet. The
deployed HTML was correct; the phone was running a cached shell.

`/` and `/index.html` were precached **cache-first**, so every deploy was one launch behind —
including the launch where you open the app to look at the thing that just shipped. The
failure is invisible: the app looks fine, it is just old. It also cost several misleading
test cycles during the player build, where fixes appeared not to work because the old shell
was being measured.

Navigations are now network-first with a 2.5s timeout falling back to cache (v19). Online you
are always on current code; offline still opens instantly from cache. Costs one ~31KB gzipped
round trip at launch — data still paints immediately from its own stale-while-revalidate
caches, so the perceived change is small.

Verified: edit a file, reload with the worker still installed and controlling, change appears
— no unregister, no cache clear, no version bump. Then with the server stopped, the full
shell still loads from cache.

Note this does not retroactively fix a device already holding the old cache-first worker:
that worker serves its cached shell one last time, and the new one takes over on the launch
after. One close-and-reopen, then permanent.

---

## Race Calendar 2026 (reference)
| Round | Venue | Qual | Finals | Slug | Results |
|---|---|---|---|---|---|
| R1 | Mona YongPyong | 2026-04-30 | 2026-05-01 | race-of-south-korea-2026 | ✅ |
| R2 | Loudenvielle | 2026-05-23 | 2026-05-28 | loudenvielle-2026 | ✅ |
| R3 | Leogang | 2026-06-12 | 2026-06-13 | leogang-2026 | ✅ |
| R4 | Lenzerheide | 2026-06-20 | 2026-06-21 | lenzerheide-2026 | — |
| R5 | La Thuile | 2026-07-04 | 2026-07-05 | la-thuile-2026 | — |
| R6 | Pal Arinsal | 2026-07-11 | 2026-07-12 | pal-arinsal-2026 | — |
| R7 | Les Gets | 2026-08-21 | 2026-08-22 | les-gets-2026 | ✅ (DataRide — race-results API outage) |
| Worlds | Val di Sole | 2026-08-28 | 2026-08-29 | val-di-sole-2026 | — |
| R8 | Whistler | 2026-09-26 | 2026-09-27 | whistler-2026 | — |
| R9 | Lake Placid | 2026-10-03 | 2026-10-04 | lake-placid-2026 | — |

---

## PBI Format (for handoff to Claude Code)
When ready to build, write:
- **What**: one sentence
- **Why**: user/product reason
- **Logic**: exact change needed
- **File**: which file(s)
- **Done when**: specific, testable criteria

## Open: 2026 round dates disagree across sources

Three sources give three answers for some 2026 rounds. The hardcoded `CALENDAR_2026` in
`results-fetcher.mjs` is the least trustworthy — it has already been proven a day wrong for
Les Gets (08-23 → 08-22) and Val di Sole (08-30 → 08-29, confirmed against Tissot's phase
schedule).

| Round | stored | DataRide | ChronoRace |
|---|---|---|---|
| race-of-south-korea | 2026-05-01 | 2026-05-02 | 2026-05-02 |
| loudenvielle | 2026-05-28 | 2026-05-30 | 2026-05-31 |
| lenzerheide | 2026-06-21 | 2026-06-20 | 2026-06-20 |
| la-thuile | 2026-07-05 | 2026-07-04 | 2026-07-04 |
| pal-arinsal | 2026-07-12 | 2026-07-11 | 2026-07-11 |

Where DataRide and ChronoRace agree against the hardcoded calendar, they are almost certainly
right. Loudenvielle is the one where they disagree with each other and needs a look.

Deliberately NOT auto-corrected: `chronorace-fetcher.mjs --merge` fills round metadata only
where it is missing and never overwrites a stored date or venue, so an unattended poll cannot
rewrite the calendar. Fix these by hand once, then the fetchers will leave them alone.

ChronoRace also labels round 1 "Race of South Korea" where the site stores the venue
"Mona YongPyong". Both are used by the UCI; the stored one wins until someone decides.

## Results pipeline, as it stands

Three same-day sources, each covering what the others cannot, plus a delayed backstop:

| Source | Covers | Wired into |
|---|---|---|
| `results-fetcher.mjs` (ucimtbworldseries.com) | World Series | fetch-results.yml, every 10 min on race days |
| `tissot-fetcher.mjs` (prod.server.tissottiming.com) | **World Championships** | same |
| `chronorace-fetcher.mjs` (results.chronorace.be) | World Series | same |
| `dataride-fetcher.mjs` (dataride.uci.ch) | everything, days late | dataride-fetch.yml, 6-hourly, `--fill-gaps` only |

ucimtbworldseries.com has served its SPA shell instead of JSON since before Les Gets 2026 and
has not recovered. The pipeline no longer depends on it.

`preflight.yml` runs Mondays 12:00 UTC and opens an issue if a round inside a two-week horizon
has no reachable same-day source. Check by hand any time:

```
node scripts/preflight-check.mjs --year=2026            # what the weekly alarm sees
node scripts/preflight-check.mjs --year=2026 --all      # every round
node scripts/chronorace-fetcher.mjs 2026 --preflight    # ChronoRace detail
```

Known: Whistler (wbd-2026-13) and Lake Placid (wbd-2026-14) return 500 from ChronoRace's
competition-list as of 2026-08-29. Expected for rounds weeks out — every past round is READY —
but re-check inside race week.

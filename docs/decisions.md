# Trackwalk — Decisions, Learnings, and What Not To Do

## What Worked

### YouTube API: uploads playlist over search.list
- **Decision**: Use uploads playlist endpoint (1 unit/channel) not search.list (100 units/channel)
- **Why**: With 14 channels, search.list would cost 1,400+ units/hourly run = 33,600/day, blowing the 10,000/day free quota instantly
- **How**: Each channel has an uploads playlist ID = channel ID with UC→UU prefix swap

### Cloudflare Worker for Pinkbike RSS
- **Problem**: Direct fetch of Pinkbike RSS returns 403 (Cloudflare bot protection)
- **Solution**: A Cloudflare Worker proxies the request — Cloudflare trusts Cloudflare
- **Worker URL**: helltrack-rss.scharenbergs.workers.dev/?url=[encoded_url]
- **Important**: Worker has an allowlist — must add new domains explicitly

### Node 18+ native fetch — node-fetch no longer needed
- Node 18+ includes `fetch` globally — no package required
- `node-fetch` has been removed from dependencies
- All scripts use native `fetch` directly
- Note: node-fetch@2 was previously used for CommonJS compatibility; if ever rolling back to older Node, use node-fetch@2 (not v3+ which is ESM-only)

### UCI JSON API for results (replaced PDF pipeline)
- **Decision**: Fetch race results from the UCI JSON API directly instead of parsing ChronoRace PDFs
- **Why**: The API returns clean structured JSON — no PDF download, no text extraction, no decompression, no name-deduplication hacks
- **Architecture**: results-fetcher.mjs POSTs to `https://www.ucimtbworldseries.com/api/race-results` with `{"slug": "2026-{venue}-{gender}-elite-dhi-{session}"}` — no auth needed
- **Consequence**: helltrack-results Worker (Browser Rendering) was retired and deleted, Cloudflare Workers Paid plan downgraded to free ($5/mo saved)
- **Historical data caveat**: The UCI API only covers recent seasons. 2024 data was imported from downhillr .rda files. 2015–2023 is a future backlog item.

### downhillr .rda files for 2024 historical data
- **Problem**: 2024 results needed before the UCI API approach was in place
- **Solution**: `pyreadr.read_r(path)` reads R's binary .rda format without R installed — returns dict, first value is DataFrame
- **Caveat**: Some results may be inaccurate (e.g. wrong P1 found at Bielsko-Biała) — manual verification needed

### Tab ID collision bug
- **Problem**: Feed category for Ben Cathro / analysis content has internal key `results` in cache.json. Adding a Results tab with `id:'results'` caused Analysis tab to trigger the results view.
- **Solution**: Use `id:'standings'` internally for the Results tab — label shows "Results" but code checks `activeTab === 'standings'`
- **Lesson**: Never use internal keys that could collide with data-layer keys

### Results nav in sticky header
- **Problem**: Results nav rows (year/venue/field/session) rendered inside #results-view, so they scrolled away and left a gap when user scrolled
- **Solution**: Move nav rows into #header with `display:none` by default, show/hide via JS when tab switches
- **Lesson**: Anything that needs to stay visible on scroll must be inside the sticky header element

### XCO filtering — weight must overpower all boosts
- **Problem**: XCO videos from trusted UCI channel were passing filter because: trusted source boost (4) + "world cup" in tags (2) + "mona yongpyong" venue (4) = 10, exceeding the 10-point XCO exclude penalty
- **Solution**: XCO exclude weight raised to 15, "mtbws highlights" (without dhi) gets -8 separately
- **Lesson**: When a trusted channel posts mixed content, the exclude weight must exceed the sum of ALL possible boosts for that channel

### Shorts detection — duration-based, not thumbnail aspect ratio
- **Problem**: YouTube Shorts were appearing in the main feed and claiming the hero position
- **Attempted**: Thumbnail aspect ratio (thumbnailHeight > thumbnailWidth) — doesn't work because YouTube always returns landscape `maxresdefault.jpg` (1280×720) for ALL videos including Shorts
- **Solution**: Duration-based detection via `videos.list` with `contentDetails` part — ISO 8601 duration ≤60s = Short. Applied to all channels after each channel fetch in `youtube-fetcher.js`
- **Secondary signal**: Portrait thumbnail (height > width) kept as fallback for any non-YouTube sources where aspect ratio may be reliable
- **Additional fix**: Hero card logic skips Shorts; `applySeenState()` covers `.short-card` elements

### Kit.com embed must be static HTML
- **Problem**: Kit.com embed contains its own `<script>` tag and inline styles with quotes
- **Solution**: Must go as static HTML in the body — never inject via JS template literals (backticks/quotes in the embed break JS strings)
- **Placement**: After ~20 feed cards (mid-feed, not bottom) via insertion at render time

### Rebrand to Trackwalk (2026-09, ahead of the Whistler sticker/QR launch)
- **Decision**: Helltrack → Trackwalk on a new domain, `trackwalk.racing`, keeping the product,
  aesthetic and design tokens exactly as they were. Rename only.
- **Old domain**: `helltrack.app` 301-redirects to `trackwalk.racing` via a Cloudflare Redirect
  Rule (verified live 2026-09-15). Its DNS stays on Cloudflare; trackwalk.racing DNS is on
  Porkbun. Keep the old registration as redirect-only and review the renewal in 12 months —
  dropping it breaks every link and QR printed before the rename.
- **Analytics**: kept the SAME GA4 property and measurement ID (`G-4EY22R6D2J`). GA4 keys on the
  measurement ID, not the domain, so data kept flowing with no gap. Creating a new property
  would have reset history and destroyed year-over-year retention comparison for a cosmetic
  tidy. Only the property name, stream URL and Search Console link needed updating.
- **PWA lesson — the expensive one**: a new domain is a NEW ORIGIN. Installed PWAs, service
  worker caches and localStorage do NOT migrate. Anyone who installed Helltrack keeps an app
  pointing at the old origin and is invisible to the new one; the redirect cannot reach into an
  already-installed shell. Mitigated with a one-time banner on the old origin telling installed
  users to reinstall. **Plan for this before changing domains on any installable app** — the
  redirect solves links, not installs.
- **Worker name kept**: `helltrack-rss` keeps its name (the only live Worker).
  Renaming a Worker means a new workers.dev URL, which means re-issuing `PINKBIKE_PROXY` in
  GitHub Secrets and every local `.env` — secret churn for a string no user ever sees.
- **localStorage keys**: renamed `helltrack-*`/`helltrack_*` → `trackwalk-*` on 2026-09-16, but
  only WITH a migration shim that copies each value before anything reads it (index.html, top of
  the app script). Done deliberately while the user base was small: the cost of this rename
  scales with returning devices, so it was the cheapest it would ever be. A bare rename would
  have silently wiped saved riders and seen-state for every returning visitor.
- **Kept as "Helltrack" on purpose**: this decisions log, the two Worker names, and the local
  folder (`~/Documents/Bryon Knowledge Base/Helltrack/`, whose absolute path is hardcoded in
  `.claude/launch.json`).

### PITS tab static data approach
- **Decision**: PITS tab data (teams, media, podcasts, UCI links) lives in `public/directory.json` and `public/watch.json` — fetched at runtime, not hardcoded in HTML
- **Why**: JSON is easier to update per season without touching index.html; teams/streaming options change annually
- **Exception**: Media and UCI sections are small enough to inline in HTML if needed, but JSON keeps it consistent

## What Didn't Work

### Sidebar nav on desktop
- **Tried**: Left sidebar with Feed/Results icons for desktop (≥600px)
- **Problem**: Two items in a 64px sidebar looks sparse and broken. Labels floating on the left edge feel undesigned.
- **Decision**: Reverted to full-width top tab bar for both mobile and desktop.

### Bottom nav with app-shell wrapper
- **Tried**: Fixed bottom tab bar wrapping entire content in #app-shell and #main-area divs
- **Problem**: Multiple bugs — sticky header positioning broke, results nav showed on all tabs, Analysis showed results content
- **Decision**: Stripped all of it. Tab bar stays at top.
- **Lesson**: Don't add structural wrapper divs. CSS layout changes cascade in unexpected ways.

### PDF text extraction without pdfjs
- **Tried**: Raw byte extraction of PDF text (BT/ET markers, Tj/TJ operators)
- **Problem**: ChronoRace PDFs use Flate/zlib compression on content streams — raw text extraction finds nothing
- **Solution at the time**: pdfjs-dist handles decompression. Now moot — switched to UCI JSON API.

### Cloudflare Browser Rendering for results (retired)
- **Was**: Cloudflare Worker with Puppeteer scraped ucimtbworldseries.com/results/[slug] for PDF URLs, then results-fetcher.mjs downloaded and parsed the PDFs
- **Why retired**: UCI JSON API provides the same data more cleanly with no infrastructure cost
- **Consequence**: helltrack-results Worker deleted, Workers Paid plan cancelled

### PyPDF/pdf-parse for PDF parsing
- **Tried**: pdf-parse npm package
- **Problem**: Node 24 compatibility issues, quirky exports
- **Solution at the time**: pdfjs-dist. Now moot — no PDFs in the pipeline.

### Puppeteer on GitHub Actions for UCI scraping
- **Considered**: Running Puppeteer headlessly in GitHub Actions CI
- **Problems**: 30-60s spin-up time, flaky in CI, silent failures
- **Decision**: Cloudflare Browser Rendering instead. Then later retired entirely in favor of the JSON API.

### `git stash` around a rebase silently drops staged changes (results auto-commit, fixed 2026-06-14)
- **Symptom**: Leogang (R3) results never appeared on the site even though the `fetch-results.yml` workflow ran on race day and every step reported "success." Run logs showed the fetcher pulling all 6 sessions correctly (Finn Iles, Valentina Höll, full podiums) and writing `results.json` — then the commit step printed `no changes added to commit` / `Everything up-to-date` and committed nothing. Happened on **every** race-day run.
- **Root cause**: The commit step did `git add results.json` → `git stash` → `git pull --rebase` → `git stash pop` → `git diff --staged --quiet || git commit`. `git stash pop` restores changes to the working tree **unstaged**, so by the time `git diff --staged --quiet` ran there was nothing staged — it exited 0 (true), the `|| git commit` was skipped, and `git push` had nothing to push. The fetch worked perfectly and was thrown away at the last step. The job exited 0 throughout, so nothing alerted.
- **Fix**: Commit *first*, then rebase. `git add` → bail early if `git diff --staged --quiet` → otherwise `git commit` → then a retry loop of `git pull --rebase origin main && git push`. Once the change is a real commit (not a working-tree change), rebase replays it cleanly on top of remote HEAD — no stash needed. The retry loop absorbs races with the hourly cache-refresh workflow pushing to the same branch (different files, so no content conflict).
- **Also hardened**: the fetcher's "already complete, skip" guard keyed only on `finals-men`; it now requires **both** `finals-men` and `finals-women` before declaring a round done, so a women's final posted a few minutes after the men's still gets picked up on a later polling run.
- **Lesson**: Never `git stash`/`pop` around a rebase to preserve a change you intend to commit — `pop` unstages it. Commit before you rebase. And a CI job exiting 0 is not proof it did its job; gate on the actual artifact (here, an absent commit) not the green check.

### Chronorace live timing as a qualifying-day data source (2026-06-19)
- **Problem**: UCI's `race-results` JSON API had a backend outage on Lenzerheide qualifying day (every slug, including previously-working ones, returned `"Unexpected token '<' ... not valid JSON"` — confirmed via direct curl, not a Trackwalk bug). Qualifying results are otherwise unavailable from UCI until well after the session, if at all before finals.
- **Discovery**: A third-party fan site (gravitylab.live) renders live qualifying/finals leaderboards by polling **Chronorace** — the actual on-site timing vendor — through a same-origin Netlify function proxy (`/.netlify/functions/chronorace?event=<id>&key=<n>`) that adds CORS headers over Chronorace's raw feed. The proxy is public (no auth, `Access-Control-Allow-Origin: *`) and returns full live timing JSON: rider roster, on-track/next-to-start, and a `Results` array with split-by-split times.
- **One-time manual pull**: fetched Lenzerheide Q1/Q2 (both genders) directly from that proxy with `event=20260619_mtb` and per-session `key` (2/5/91/92 — Chronorace's own session-key numbering, not stable round to round), converted `RaceTime` (ms) to the existing `M:SS.mmm` format, and merged into `results.json` with `points: null` (Chronorace carries no UCI ranking-points field).
- **Caveat**: this was a one-off manual pull, not a standing pipeline. The site owner's Netlify function and any Chronorace credentials are server-side and not something we have a right to depend on without his explicit OK — useful as a future collaboration, not as a thing to silently scrape on a schedule.
- **Hardened `results-fetcher.mjs` as a result**: it used to replace a round's `sessions` wholesale (`rounds[idx] = result`) on every fetch. That's fine when one source always supplies all 6 sessions atomically, but broke the moment a different source (Chronorace) supplied qualifying ahead of finals — a later UCI-sourced finals fetch that didn't also happen to return qualifying would have silently deleted it. Fixed to merge `sessions` per-key (`{ ...old.sessions, ...new.sessions }`) so a session missing from a given fetch survives.
- **Lesson**: when a round can legitimately be assembled from more than one fetch/source over time, merge state per-field — never replace the whole record on each write.

### DataRide as the fallback when the race-results API is down (Les Gets, 2026-08-22)
- **Problem**: the same `ucimtbworldseries.com/api/race-results` outage as Lenzerheide, but it did NOT self-heal — Les Gets finals ran 08-22 and the round was still empty on 08-24. Every slug (including ones that worked in July) returned the site's Next.js HTML shell with `x-cache: Error from cloudfront`, i.e. CloudFront failing open to the SPA when its origin errors.
- **Ruled out anti-scraping**: identical HTML with full browser headers (real UA + Referer + Origin + Accept) as with plain node-fetch. A fingerprint-gated WAF would treat those differently; a 403/429/challenge would look different again. It's an origin outage, not a block.
- **Fix**: `dataride.uci.ch` — UCI's own results platform, a *different origin*, unaffected. It was already the source for every season 2009→2025 in results.json; only 2026 depended on the race-results API. `scripts/dataride-fetcher.mjs` already produced the exact schema, so no new parser was needed — just a way to run it (`.github/workflows/dataride-fetch.yml`) and a way to scope it (`--only`).
- **⚠️ Never blanket-merge a season from DataRide.** Validation caught DataRide reporting Lenzerheide 2026 men's finals as **112 riders won by Ryan Pinkerton**, vs the correct 30-rider field won by Finn Iles. An Elite DH final is always ~30 riders; DataRide had a mislabeled qualifying race sitting in the finals slot (and correspondingly no `qualifying-1-men` for that round). `--merge` alone would have silently overwritten a correct round with a wrong one. Use `--only=<slug>` and always dispatch `mode=validate` first — the ✅/❌/🆕 diff plus the rider-count sanity check (30 men / 15 women in a final) is what catches this.
- **Coverage caveat**: DataRide carries only one qualifying race per gender, so a round sourced from it has `qualifying-1-*` but no `qualifying-2-*`, even where Q2 was run. Finals are complete and correct; Q2 is the known gap.
- **Also fixed**: both results workflows pushed to a hardcoded `origin main`. Dispatched from a feature branch that rebases the whole branch onto main and — under `actions/checkout`'s shallow clone, where there's no common ancestor — conflicts add/add on every changed file. Now they push to `HEAD:$GITHUB_REF_NAME`.
- **Lesson**: a second, independent source for the same data is worth keeping warm even when the primary works. The cheapest version of that here was noticing the repo already had one.

### ChronoRace has a public, self-documented API (2026-08-24)
- **Why**: ChronoRace is the UCI's on-site timing vendor and the origin of every official result — the results PDFs are theirs (`Producer: chronorace - electronic timing via ABCpdf`). Pulling from them is strictly upstream of both sources we use, and fastest on race day: Les Gets' official Elite Men report was generated ~40 min after the last rider.
- **Found**: `results.chronorace.be` self-identifies as "ChronoRace - Results API" and serves Swagger UI at `/swagger`, with FOUR public OpenAPI documents — including a **WBD World Series API** (WBD = the World Series broadcaster) offering discovery-based `event-list → competition-list → resource/results`, live `live/DHI/situation/{competitionId}`, and season `resource/standings`. Full write-up in **docs/chronorace-api.md**.
- **Payload is richer than what we store**: five split times per rider, UCI rider IDs, team names, World Cup rank, live on-track state. `RaceTime` is in ms.
- **Two gotchas** that cost the most time: the live-timing event id is anchored on the weekend's FIRST race day (Les Gets finals ran 08-22 but the id is `20260821_mtb`), and the session key space is 1–12 plus 85–99 — not a small contiguous range.
- **Diagnostic tell worth remembering**: `results.chronorace.be` returns clean 0-byte 404s and 204s where the other hosts return HTML error pages. A bare 204 means the route matched and only the parameters were wrong — that distinction is what separated "wrong host" from "wrong vocabulary" and pointed at the Swagger UI.
- **Don't depend on gravitylab.live**: its Netlify proxy was used only to learn the response shape. Someone else's infrastructure; fine to learn from, not to cron against (same conclusion as 2026-06-19). Since ChronoRace's own API is public, there's no reason to.
- **Lesson**: when an undocumented-looking API is ASP.NET/IIS, check `/swagger` before brute-forcing paths. The whole contract was one 735-byte file away, after a fair amount of guessing that produced nothing.

## Content Filter Learnings

### MIN_SCORE = 6 with tiered thresholds
- Base threshold: `MIN_SCORE = 6`
- Trusted YouTube channels and RSS articles: threshold = 6
- Untrusted YouTube channels (UCI, Pinkbike YT, Vital etc): threshold = 10 (MIN_SCORE + 4)
- Rationale: untrusted channels have boilerplate descriptions that mention all disciplines — inflation risk is higher

### Category key 'results' in cache.json is "Analysis" in the UI
- The content filter assigns category id `results` to Ben Cathro / Inside the Tape / analysis content
- The UI label is "Analysis" (changed from "Results" to avoid confusion with the Results data tab)
- DO NOT rename the category key in cache.json — it would break the filter

### Category tags are display-only
- Category badges appear on feed cards (~70% accuracy) but there is no filtering by category in the UI
- Feed is flat chronological; badges are informational only

### Venue keywords matter more than discipline
- Adding "south korea" and "yongpyong" to venue list immediately unlocked a flood of relevant content
- Venue names are high-signal because they appear in titles even when discipline isn't mentioned
- Always add new 2026 venue names to the filter when season calendar is known

### "MTBWS HIGHLIGHTS" pattern
- The UCI channel posts: "MTBWS HIGHLIGHTS 🇰🇷 [Gender] Elite [XCO/DHI] | [Year] [Venue]"
- XCO highlights should be filtered; DHI highlights should pass
- Solution: "mtbws highlights" gets -8, "dhi" gets +4, "xco" gets -15
- Added 'mtbws highlights dhi' as a positive term (+8) to counteract the penalty
- Net for DHI highlights: 4(trusted) + 4(dhi) - 8(mtbws highlights) + 8(mtbws highlights dhi) = 8 ✅
- Net for XCO highlights: 4(trusted) - 8(mtbws highlights) - 15(xco) = -19 — correctly dropped ✅

### Paddock/media figure keyword weights
- High-profile DH-only athletes (Bruni, Goldstone, Holl, etc.): weight 6 — passes on name alone
- Paddock figures / legends who post mixed content (Cathro, Minnaar, Kerr, Wyn Masters): weight 2 — requires supporting DH signal to pass
- Ben Cathro was briefly in the +6 rule — caused knee pad product articles to pass (score 8 for RSS). Fixed by moving to +2 only.

### UCI Shorts: per-video race-tag is in the description, not the title (fixed 2026-06-14)
- **Problem**: UCI MTB World Series XCO Shorts were passing the filter and showing up in the Shorts strip. Titles are generic emoji captions ("Ride of the day 🤩") with zero discipline info — the `titleOnly: true` XCO exclude never matched. Meanwhile the description's generic "formats we cover" boilerplate (XCO/XCC/DHI/EDR, present on every UCI video) gave enough boost (trusted + venue + "dhi"/"world cup" terms) to clear the untrusted threshold of 10 on its own.
- **The actual signal**: each Short's description has a per-video race-tag line, e.g. "📍 Saalfelden-Leogang, SalzburgerLand 🏁 Women's Elite XCO World Cup" — unlike the generic boilerplate, this is event-specific and safe to check against full text.
- **Solution**: kept bare `xco`/`xcc`/etc. as `titleOnly: true` (weight 15, unchanged — boilerplate doesn't contain these as standalone terms in a way that matters), and added a second exclude rule for `'elite xco'` / `'elite xcc'` (weight 15, full-text). UCI's "Women's"/"Men's" uses a curly apostrophe (U+2019) which `normalise()` doesn't strip, so matching on "elite xco"/"elite xcc" (no apostrophe) reliably hits the race-tag without depending on normalization.
- **Result**: 6 XCO shorts dropped from score 10 to -5; all 14 legit DHI shorts and the other 47 cached items unaffected.
- **Lesson**: for UCI content, the title alone is not a reliable discipline signal on Shorts — the description's race-tag line is. `titleOnly` excludes guard against the generic boilerplate; full-text excludes catch the per-video tag. Both are needed.

### "Rider feature" Shorts have no discipline text at all — only a name (2026-06-23)
- **Problem**: at dual-format venues (Lenzerheide hosts XCO/XCC and DHI the same weekend), UCI posts personality/reaction Shorts like "Alessandra Keller loves the all-Swiss setup in Lenzerheide" or "Digging Deep — Savilia Blunk's Reaction To Controversy in Leogang." No XCO/XCC term, no race-tag line, nothing but the rider's name and a venue — the venue alone is shared by both disciplines, so it boosts the score instead of excluding it.
- **Confirmed via web search, not assumption**: every name added was independently verified as XCO/XCC-only before excluding (Paul Schehl, Alessandra Keller, Savilia Blunk, Luca Martin, Mathis Guay) — also cross-checked against Trackwalk's own Chronorace-sourced Lenzerheide DH qualifying data (none of them appear in it). One WebSearch summary falsely claimed Luca Martin "came out on top" in DH qualifying; our own results data shows that's wrong — Luca Martin doesn't appear in the DH field at all. Don't trust an AI search summary over verified first-party data.
- **Solution**: added the five names to the existing XCO/road rider names exclude list (`titleOnly: true`, weight 10) — the same whack-a-mole list that already held Sagan/Van der Poel/Pidcock/Schurter etc. There is no general-purpose fix here; a feature short with zero discipline text is only classifiable by knowing who the rider is.
- **Remaining gap**: a handful of completely generic, nameless caption Shorts ("DRAMA! 😱", "WHAT A RACE 😮‍💨") passed through unverified — there is no text signal of any kind to check. Left as-is; revisit only if one is confirmed to be XCO.
- **Lesson**: this list will need ongoing maintenance every season as new XCO/XCC stars come up, especially around shared-venue weekends. When checking a name's discipline, prefer Trackwalk's own verified results data over a search engine's AI summary, which can be confidently wrong.

### Race-tag exact-phrase match broke when UCI changed the wording (2026-07-05)
- **Problem**: 6 La Thuile XCC Shorts leaked into the feed at score 10 — right at the untrusted-channel threshold. Same "rider feature, no discipline text in the title" pattern as above (captions like "A new day, a new chance 👊", "Smiles all round 😄"), so the full-text race-tag exclude from 2026-06-14 should have caught them.
- **Root cause**: UCI's caption template changed. The race-tag line used to read `"...Elite XCC World Cup"`; it now reads `"...Elite UCI XCC World Cup"` — an inserted "UCI" between "Elite" and the discipline code. The exact-phrase match on `'elite xcc'` no longer appears anywhere in `'elite uci xcc'`, so it silently stopped firing. DH Shorts kept passing regardless because the bare `dhi` include term (weight 4) still matches inside "UCI DHI World Cup" — the exclude side had no equivalent fallback.
- **Solution**: added `'elite uci xco'` / `'elite uci xcc'` as additional terms on the same exclude rule, alongside the original `'elite xco'`/`'elite xcc'` (kept both rather than replacing, in case the template reverts or some videos still use the old wording). Also added the 5 riders named in the leaked captions to the rider-name exclude list (Sina Frei, Jenny Rissveds, Evie Richards, Adrien Boichis, Charlie Aldridge) as defense-in-depth, in case a future Short about them drops the race-tag line entirely.
- **Result**: all 6 leaks now score -11; legit DH shorts and `test-filter.js` unaffected.
- **Lesson**: an exact-phrase match on a third party's caption template is inherently fragile — it will break again the next time UCI tweaks wording, punctuation, or word order. When it does, the fix is additive (add the new phrasing as another term) rather than replacing the old one, since there's no guarantee old and new videos won't coexist.

## Design Decisions

### Option A (dark, acid yellow) was the right aesthetic
- Tested vs Option B (pure black, blood orange) and Option C (warm paper, gold)
- Option A won: timing-screen energy, matches YT/Commencal/Mondraker brand language
- Acid yellow #d4f500 has subtle 80s neon echo without being garish

### Top 5 with visual weight (not top 3)
- UCI honors top 3 podium officially
- Riders culturally recognize top 5 as significant
- Design: 1-3 get gold/silver/bronze treatment, 4-5 get elevated card style, 6+ in full table

### Names formatted as "Vermette Asa" not "VERMETTE ASA"
- Race result data stores names in ALL CAPS
- formatName() converts: split on space, capitalize first letter, lowercase rest

### Results nav: 4 rows is correct for long-term
- Year → Venue → Field → Session hierarchy supports going back to 1991
- Combining Year + Venue in one scrolling row gets unwieldy at 200+ venues
- Keep them separate even though it looks like a lot of chrome right now

### Rounded pills over sharp corners
- Results selectors and sub-tabs use rounded pills
- Sharp corners were tested and feel like form elements/tables, not navigation
- The timing-screen energy comes from palette and typography, not corner radius

### FREE/PAID badges in PITS → WATCH
- FREE badge: `background: transparent; border: 1px solid #d4f500; color: #d4f500` — earns the acid accent
- PAID badge: `background: transparent; border: 1px solid #888; color: #888` — muted, factual, no alarm

## Results Sources

### An unattended merge must never be able to overwrite a stored result (2026-08-28)
- `dataride-fetcher.mjs --merge` replaces a whole round: `target[idx] = r`. Fine when a human
  reads the validate output first; unsafe on a schedule.
- DataRide is not always right. It reports Lenzerheide 2026 men's finals as a 112-rider field
  won by Ryan Pinkerton — that is the qualifying race, mislabelled. A real elite final is 30
  riders (Finn Iles won it). An automated `--merge` would have silently replaced the correct
  round with that.
- Hence `--fill-gaps`: adds a missing round, or a missing session key inside a round we
  already have, and nothing else. It is the only mode the 6-hourly sweep is allowed to use.

### Matching a round across sources needs more than the slug (2026-08-28)
- The first live `--fill-gaps` run appended a **second round 1** to season 2026. DataRide
  names it `mona-yongpyong-2026`; results.json stores it as `race-of-south-korea-2026`.
  `findIndex(x => x.slug === r.slug)` missed, so it looked like a brand-new round.
- This is the same divergence `results-fetcher.mjs` already carries as `uciVenue` — two of
  the 2026 venues have a different name in every source.
- `findExistingRound()` now tries slug → round-number-within-event-type → date within 3 days
  before deciding a round is new. Covered by a table of cases including Val di Sole Worlds
  and a future Whistler round, which must still read as new.
- Lesson: test a new write mode against the real results.json on a branch before scheduling it.
  This bug only surfaced because the first run was a live dispatch, not a dry run.

### ucimtbworldseries.com stayed down; the fix is more sources, not a better retry (2026-08-28)
- `/api/race-results` has served the SPA's HTML shell instead of JSON for every slug since
  before Les Gets (08-22) and still does six days later. Not anti-scraping — identical
  requests with full browser headers get the same HTML, and it is a CloudFront origin error.
- Two independent origins now cover it: DataRide (`dataride.uci.ch`, already the source for
  2009–2025) and ChronoRace (`results.chronorace.be`, the UCI's own timing vendor).

### Hardcoded race dates have been wrong twice in two rounds (2026-08-28)
- Les Gets finals were stored as 08-23, actually 08-22. Val di Sole was stored as 08-30,
  actually 08-29.
- Both fetchers that *discover* their calendar (DataRide, ChronoRace) got the dates right on
  their own. The hardcoded `CALENDAR_2026` in `results-fetcher.mjs` is the only place that
  can be wrong, and the cron's date windows depend on it.
- Keep the cron windows wide (they cost one shell command on an idle day) and prefer a
  discovery-based fetcher wherever one exists.

## Deployment Learnings

### Always stash before pull
- GitHub Actions commits cache.json every hour
- Straight `git push` fails if Action ran between your last pull and push
- Pattern: `git stash && git pull --rebase origin main && git stash pop && git push`

### cache.json conflicts during rebase
- Frequent — Actions commits cache.json while you're working
- Resolution: `git checkout --theirs public/cache.json && git add public/cache.json`
- Then continue: `git rebase --continue` or `git stash pop && git push`

### Service worker caches aggressively
- After pushing changes, browser may serve old version for minutes
- Hard refresh (Cmd+Shift+R) forces network fetch
- For testing: unregister service workers in DevTools → Application → Service Workers

### Smart quotes break git commit -m
- Always use single quotes: `git commit -m 'message'`
- macOS autocorrects to smart quotes in some contexts, breaking the shell string

### cp to deploy silently fails
- The `cp ~/Downloads/file.js scripts/file.js` pattern silently fails on this machine
- Always edit files directly on disk using Python string replace in Claude Code

## Things to Research/Consider Later

### Historical data (2015–2023)
- downhillr .rda files available for some years; rootsandrain.com is another source
- Series URLs confirmed: 2025=series2028, 2024=series1831, 2023=series1622, 2022=series1464
- Rootsandrain venue-page approach: rootsandrain.com/venue69/leogang/ shows all years
- Nathan Tomczyk's repo has a proven BS4 scraper: github.com/nathantomczyk/world_cup_downhill_data_science
- 2019-2021 series IDs still need to be identified
- The UCI JSON API may cover some historical seasons — worth checking API depth before scraping

### Rider search / history view
- Data is already structured for it (results.json has rider name/nat per result)
- Filter all rounds for a rider name match, show rank/time/gap at each venue
- Comparison view: two rider searches side by side
- Deferred until more rounds of data are available

### Franchise model
- Core pipeline is mostly config: channel list, keyword weights, venue slugs, results source
- Strongest candidate after DH: Trackwalk Enduro (EWS, adjacent culture)
- Prerequisite: prove retention on DH first before expanding
- Decision criteria: returning users week-over-week across multiple race rounds in GA

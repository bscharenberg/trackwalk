# Trackwalk — Developer Workflow

## Common Commands

### Rebuild content cache
```bash
cd ~/Documents/Bryon\ Knowledge\ Base/Trackwalk
node scripts/build-cache.js
git add public/cache.json
git commit -m 'rebuild cache'
git stash && git pull --rebase origin main && git stash pop && git push
```

### Fetch results for a race round
```bash
cd ~/Documents/Bryon\ Knowledge\ Base/Trackwalk
node scripts/results-fetcher.mjs leogang-2026
git add public/results.json
git commit -m 'results: leogang-2026'
git stash && git pull --rebase origin main && git stash pop && git push
```

Results come from the UCI JSON API directly — no Cloudflare Worker or PDF parsing involved.

### Deploy frontend changes
```bash
cd ~/Documents/Bryon\ Knowledge\ Base/Trackwalk
git add index.html
git commit -m 'describe change'
git stash && git pull --rebase origin main && git stash pop && git push
```

### Rebuild riders data
```bash
cd ~/Documents/Bryon\ Knowledge\ Base/Trackwalk
node scripts/build-riders.js
git add scripts/riders.csv public/riders.json
git commit -m 'update riders roster'
git stash && git pull --rebase origin main && git stash pop && git push
```

### Test content filter scoring
```bash
cd ~/Documents/Bryon\ Knowledge\ Base/Trackwalk
node -e "
const {scoreItem, categorise} = require('./scripts/content-filter.js');
const item = {title: 'YOUR TITLE HERE', description: '', channelId: null};
const score = scoreItem(item);
const threshold = item.channelId ? 10 : 6;  // untrusted YT=10, RSS/trusted=6
console.log('Score:', score, '| Threshold:', threshold, '| Passes?', score >= threshold);
if (score >= threshold) console.log('Category:', categorise(item));
"
```

### Check what's in the live cache
Open browser console on trackwalk.racing and run:
```javascript
fetch('public/cache.json?t=' + Date.now()).then(r => r.json()).then(d => {
  Object.entries(d.categories).forEach(([k,v]) => 
    console.log(k + ':', v.items.map(i => i.title))
  )
})
```

### Force browser to reload fresh cache (bypass service worker)

> **Do this after EVERY index.html edit.** `/` and `/index.html` are precached cache-first,
> so once a service worker is registered the browser keeps serving the shell it installed —
> your edit is invisible and testing silently measures the OLD build. Bumping `CACHE_NAME`
> fixes it for users but NOT for a tab that already has the old worker. Unregister + clear
> caches, then reload.
1. DevTools → Application → Service Workers → Unregister both
2. Cmd+Shift+R (hard refresh)

## Git Workflow Rules
- **Always** use `git stash && git pull --rebase origin main && git stash pop && git push` — never plain `git push`
- **Always** use single quotes for commit messages: `git commit -m 'message'`
- GitHub Actions commits cache.json every hour — stash first or the rebase will fail on local changes
- cache.json conflicts during rebase: `git checkout --theirs public/cache.json && git add public/cache.json`

## File Locations
| File | Location | Purpose |
|---|---|---|
| PWA app | /index.html (root) | Main frontend |
| Feed data | /public/cache.json | Generated hourly |
| Results data | /public/results.json | Race results database |
| Riders data | /public/riders.json | Generated from CSV |
| Directory data | /public/directory.json | PITS tab — teams, media, podcasts, UCI |
| Watch data | /public/watch.json | PITS → WATCH streaming options (update per season) |
| Content filter | /scripts/content-filter.js | Scoring + categorisation |
| Cache builder | /scripts/build-cache.js | Orchestrates fetch+filter |
| YouTube fetcher | /scripts/youtube-fetcher.js | YouTube API calls |
| RSS fetcher | /scripts/rss-fetcher.js | Pinkbike RSS |
| Results fetcher | /scripts/results-fetcher.mjs | UCI JSON API fetcher (ESM) |
| Rider roster CSV | /scripts/riders.csv | Source of truth for riders |
| Rider builder | /scripts/build-riders.js | Generates riders.json from CSV |
| Env vars | /.env | API keys (not committed) |

## Environment Variables
```
YOUTUBE_API_KEY=...
PINKBIKE_PROXY=https://helltrack-rss.scharenbergs.workers.dev
```
Also set as GitHub Secrets for Actions.

## 2026 Race Calendar (for results-fetcher)
Date = finals date (matches `CALENDAR_2026` in `scripts/results-fetcher.mjs`, the source of truth).

| Round | Venue | Date | Slug |
|---|---|---|---|
| R1 | Mona YongPyong | 2026-05-01 | race-of-south-korea-2026 |
| R2 | Loudenvielle | 2026-05-28 | loudenvielle-2026 |
| R3 | Leogang | 2026-06-13 | leogang-2026 |
| R4 | Lenzerheide | 2026-06-21 | lenzerheide-2026 |
| R5 | La Thuile | 2026-07-05 | la-thuile-2026 |
| R6 | Pal Arinsal | 2026-07-12 | pal-arinsal-2026 |
| R7 | Les Gets | 2026-08-23 | les-gets-2026 |
| Worlds | Val di Sole | 2026-08-30 | val-di-sole-2026 |
| R8 | Whistler | 2026-09-27 | whistler-2026 |
| R9 | Lake Placid | 2026-10-04 | lake-placid-2026 |

**When to run results-fetcher:**
- After Q2 wraps on qualifying day (~1hr after last session)
- After Women Elite finals on race day (~1hr after finish)
- Run once per day — fetcher pulls all available sessions in one go
- On race days the fetch-results workflow polls every 30 min automatically (date-gated in the workflow); non-race-day runs exit after the first step
- Can also trigger manually via GitHub Actions → workflow_dispatch with any venue slug
- Backfill / re-write a completed round: `node scripts/results-fetcher.mjs <slug> --force` (bypasses the "both finals already present" guard)

## Debugging Tips

### cache.json conflict during rebase
```bash
git checkout --theirs public/cache.json && git add public/cache.json
```
Then continue: `git rebase --continue` or `git stash pop && git push`

### "nothing to commit" when you expect changes
- Run `git diff scripts/content-filter.js` — if empty, the file matches the repo
- Run `grep "BOOST_SCORE\|south korea" scripts/content-filter.js` to confirm which version is on disk

### XCO videos appearing in feed
- Check: `grep "weight.*15\|mtbws highlights" scripts/content-filter.js`
- If missing, the filter file wasn't saved/committed correctly
- Rebuild cache after fixing: `node scripts/build-cache.js`

### Results tab showing wrong data / nav missing
- Check: `document.getElementById('results-nav').style.display` in console
- Should be 'none' on feed tabs, 'block' on Results tab
- Check for `activeTab === 'standings'` in buildTabs (not 'results')

### Shorts appearing in main feed
- Duration-based detection: youtube-fetcher.js calls videos.list with contentDetails, sets `isShort: true` for ≤60s
- Check `isShortDuration()` in youtube-fetcher.js and `isShort` handling in content-filter.js

### Service worker caching stale content
- Unregister in DevTools → Application → Service Workers
- Service worker is currently at `trackwalk-v24`
- Bump the version string in service-worker.js when you need browsers to pick up new files

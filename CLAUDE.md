# Trackwalk — Claude Code Instructions

Trackwalk (trackwalk.racing) is a UCI downhill race content aggregator and historical results database built by Bryon Scharenberg. Formerly Helltrack (helltrack.app 301-redirects here). It's a PWA that pulls from YouTube channels and Pinkbike RSS, filters to DH content, and shows a clean card-based feed. The Results tab has UCI DH World Cup results for every season from 2009 to 2026 — 18 seasons, 153 rounds. `public/results/index.json` is the season index and names the current season; trust it over any doc.

This is a hobby project. Keep suggestions practical, avoid over-engineering, and prefer simple, maintainable changes.

Claude Code is the only interface. Product thinking, scoping, building, and review all happen here.

## Source of truth
The code is the source of truth. Read values from code, not docs.
Docs describe the code and can go stale. When a value matters (MIN_SCORE, SW cache version, channel list, thresholds), read it from the file and quote where it came from.

Reference docs in `/docs/`:
- `architecture.md`: system architecture, file locations, data structures
- `decisions.md`: what worked, what didn't, lessons learned
- `punchlist.md`: current state and backlog (updated most often)
- `dev-workflow.md`: commands, git workflow, debugging

## Routing
1. Bryon asks in plain words. You decide where the work goes.
2. Default to Claude subagents in `.claude/agents/` (covered by the plan): `product`, `ux`, `security`, `filter`. Simple questions can be answered directly.
3. Use an outside model from `.claude/models.json` only when its listed strengths clearly beat Claude for this task, when the decision is big enough to warrant a second model family, or when Bryon explicitly asks.
4. Use several outside models only for high-stakes questions where disagreement is useful (`/panel`).
5. ALWAYS ask before any outside call. Show the model, why, and estimated cost. Wait for a yes. `scripts/ask-model.mjs` also asks y/n before it sends anything.
6. Bryon can override anytime: "ask Astra", "get a panel", "keep it on Claude".
7. Outside model answers are advice only. Check them against the actual code before acting.

Name things by job, never by model. Model slugs live only in `.claude/models.json`; agent files use aliases (opus/sonnet/haiku). Nothing else hardcodes a model name.

## Stack
- Frontend: single `index.html` at repo root (vanilla JS, no framework)
- Scripts: Node.js in `/scripts/`
- Data: `public/cache.json` (feed) + `public/results.json` (race results, canonical) + `public/results/` (per-season shards the app fetches)
- CI/CD: GitHub Actions cache refresh
- Workers: Cloudflare Workers (RSS proxy)

## Critical rules

**File editing**: never use `cp` to deploy. Edit files directly on disk with Python:
```bash
python3 << 'PYEOF'
path = '/Users/bryon/Documents/Bryon Knowledge Base/Helltrack/index.html'
with open(path) as f: c = f.read()
c = c.replace('OLD', 'NEW')
with open(path, 'w') as f: f.write(c)
print('done' if 'NEW' in c else 'FAILED')
PYEOF
```

**Git push**: always stash first:
```bash
git stash && git pull --rebase origin main && git stash pop && git push
```

**cache.json conflicts during rebase:**
```bash
git checkout --theirs public/cache.json && git add public/cache.json
```

**Commit messages**: always single quotes: `git commit -m 'message'`

**Results changes**: `public/results.json` is canonical, but the app reads `public/results/`. Re-derive the shards after any merge into results.json, or the app serves stale results:
```bash
node scripts/split-results.js
```

## Product decisions (locked)
- Trackwalk = UCI DH only. No enduro, XCO, freeride, road, or BMX.
- Aesthetic is locked: dark `#111`, acid yellow `#d4f500`, Barlow Condensed, chainsaw icon mark. Don't suggest redesigns.
- No framework: vanilla JS only.
- No database: JSON files committed to the repo.
- "Newspaper not an inbox": no unread state, no notification pressure.
- Feed philosophy: flat chronological, MAX_AGE_DAYS=30, always fresh.
- Mobile-first, full width, no artificial max-width on the feed.

## Content filter rules
- MIN_SCORE=6. RSS and trusted YouTube channels pass at 6; untrusted YouTube channels pass at 10 (MIN_SCORE + 4).
- Trusted sources get BOOST_SCORE=4.
- XCO must always be excluded, with weight 15 on exclude terms (it has to exceed the sum of all boosts).
- MIN_SCORE and TRUSTED_SOURCES are exported from `scripts/content-filter.js`. Test scoring with the real values before recommending any filter change, and confirm `node scripts/test-filter.js` still passes.
- Quick check: `node -e "const {scoreItem}=require('./scripts/content-filter.js'); console.log(scoreItem({title:'TEST', channelId:'UCI_ID'}))"`
- Venue keywords are high-signal, so add new venue names each season.
- Rebuild the cache after every filter change: `node scripts/build-cache.js`

## Known gotchas
- Results tab is `id='standings'` internally, never `id='results'` (collision with the feed category key).
- Category `results` in cache.json displays as `Analysis` in the UI. Do not rename.
- Service worker caches aggressively. Unregister it in DevTools for fresh testing.
- `riders-view` must have `style="display:none"` on the HTML element.
- The Kit.com form embed (and whatever replaces it) is static HTML. Never inject it via JS template literals.
- pdfjs-dist: use the `.mjs` extension, `Uint8Array` not `Buffer`, 10–11 digit UCI IDs.

## Naming notes
- The local folder is still `~/Documents/Bryon Knowledge Base/Helltrack/`. It hasn't been renamed, and `.claude/launch.json` hardcodes the path.
- The `helltrack-rss` Cloudflare Worker keeps its legacy name on purpose; renaming would churn PINKBIKE_PROXY in .env and GitHub Secrets.
- "Helltrack" elsewhere is historical only (the decisions log).
- localStorage keys are `trackwalk-*`, and a migration shim carries over old `helltrack*` keys.

## Bryon's working style
- Builds in sessions, often late at night.
- Takes screenshots, so look at them before suggesting anything.
- Wants to understand what's happening, not just run commands blindly.
- Values clean, simple UI over feature-rich complexity.
- Makes quick decisions when given clear options (2–3 max).
- Cares deeply about DH/MTB culture; the app should feel authentic to that world.

## Current switchover items (see punchlist.md)
- Move trackwalk.racing DNS from Porkbun to Cloudflare, then set up Email Routing for hello@trackwalk.racing.
- Migrate off Kit.com (candidates: MailerLite, Brevo, Loops) and rewrite the welcome sequence. The embed must be static HTML, and the `email_signup` GA hook on `.formkit-form` must be re-pointed.
- Retitle the Google feedback form (forms.gle/sRySzSFzzwDyKNrWA).
- Instagram handle.

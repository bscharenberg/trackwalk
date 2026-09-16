# Trackwalk — Claude Code Instructions

Trackwalk (trackwalk.racing) is a UCI downhill race content aggregator + results database. Vanilla JS PWA, GitHub Pages, Cloudflare Workers. Hobby project — keep changes simple and maintainable.

Full reference docs are in `/docs/`:
- `docs/architecture.md` — system architecture, file locations, data structures
- `docs/decisions.md` — what worked, what didn't, lessons learned
- `docs/punchlist.md` — current state and todo list
- `docs/dev-workflow.md` — common commands, git workflow, debugging

## Stack
- Frontend: single `index.html` at repo root (vanilla JS, no framework)
- Scripts: Node.js in `/scripts/`
- Data: `public/cache.json` (feed) + `public/results.json` (race results, canonical) + `public/results/` (per-season shards the app fetches)
- CI/CD: GitHub Actions hourly cache refresh
- Workers: Cloudflare Workers (RSS proxy + Browser Rendering for results)

## Critical rules

**File editing** — never use `cp` to deploy. Edit files directly on disk with Python:
```bash
python3 << 'PYEOF'
path = '/Users/bryon/Documents/Bryon Knowledge Base/Helltrack/index.html'
with open(path) as f: c = f.read()
c = c.replace('OLD', 'NEW')
with open(path, 'w') as f: f.write(c)
print('done' if 'NEW' in c else 'FAILED')
PYEOF
```

**Git push** — always stash first:
```bash
git stash && git pull --rebase origin main && git stash pop && git push
```

**cache.json conflicts during rebase:**
```bash
git checkout --theirs public/cache.json && git add public/cache.json
```

**Commit messages** — always single quotes: `git commit -m 'message'`

**Results changes** — `public/results.json` is canonical, but the app reads `public/results/`.
Re-derive the shards after any merge into results.json, or the app serves stale results:
```bash
node scripts/split-results.js
```

## Known gotchas
- Results tab is `id='standings'` internally — never `id='results'` (collision with feed category key)
- Category `results` in cache.json displays as `Analysis` in the UI — do not rename
- Service worker caches aggressively — unregister in DevTools for fresh testing
- `riders-view` must have `style="display:none"` on the HTML element
- Kit.com form embed is static HTML — never inject via JS template literals
- pdfjs-dist: use `.mjs` extension, `Uint8Array` not `Buffer`, 10-11 digit UCI IDs

## Design tokens (locked — don't redesign)
- Background: `#111`
- Accent: `#d4f500` (acid yellow)
- Font: Barlow Condensed
- Mobile-first, full width, no artificial max-width constraints on feed
- "Newspaper not inbox" — no unread state, no notifications

## Content filter rules
- Always test before committing: `node -e "const {scoreItem}=require('./scripts/content-filter.js'); console.log(scoreItem({title:'TEST', channelId:'UCI_ID'}))"`
- XCO must always be excluded — weight 15 on exclude terms
- Rebuild cache after every filter change: `node scripts/build-cache.js`

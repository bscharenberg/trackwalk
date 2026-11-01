#!/usr/bin/env node
/**
 * health-check.mjs
 * Trackwalk — weekly pipeline health check (always-on plan, Phase 1, job 1)
 *
 *   node scripts/health-check.mjs                 print the markdown report
 *   node scripts/health-check.mjs --out=FILE      also write it to FILE
 *   node scripts/health-check.mjs --days=7        window for the git and Actions checks
 *
 * The first line of the report is always exactly "All quiet" or "N things need you"
 * (or "1 thing needs you"), so a workflow or a routine can branch on it.
 *
 * Deterministic, plain Node, no dependencies. Every check fails softly: an error inside one
 * check becomes a "couldn't check" line, never a crash and never a non-zero exit. The exit
 * code is 0 unless the script itself is broken, so a bad week can't turn into a red Actions
 * run on top of whatever it is reporting.
 *
 * Thresholds below are judgement calls, not values the code defines. Everything else
 * (cron slots, MIN_SCORE, CACHE_NAME, the current season, ...) is read from the repo files.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ─── Thresholds (judgement, not read from code) ──────────────────────────────

// PBI 60: the refresh fires ~6 times a day instead of 48 and gaps of 3-5h are the known,
// already-tracked baseline. Flag only what is worse than that baseline, or the digest would
// say "needs you" every week until PBI 60 lands and Bryon would learn to ignore it.
const MAX_REFRESH_GAP_HOURS = 12
const MAX_CACHE_AGE_HOURS   = 12
const PBI60_TARGET_MINUTES  = 20      // PBI 60 "Done when", docs/punchlist.md

// ─── Args ─────────────────────────────────────────────────────────────────────

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=')
  return [k, v.length ? v.join('=') : true]
}))
const DAYS = Number(args.days) > 0 ? Number(args.days) : 7
const NOW = new Date()
const SINCE = new Date(NOW.getTime() - DAYS * 86400e3)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function git(...a) {
  return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
function readText(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8') }
function readJSON(rel) { return JSON.parse(readText(rel)) }
function hours(ms) { return ms / 3600e3 }
function fmtH(h) { return h >= 48 ? `${(h / 24).toFixed(1)}d` : `${h.toFixed(1)}h` }
function iso(d) { return d.toISOString().replace(/\.\d+Z$/, 'Z') }
function median(xs) {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
// Strip anything that would render as markup or ping someone if it reaches an issue body.
function safe(text) { return String(text ?? '').replace(/[`<>]/g, '').replace(/@/g, '@​') }

function check(name, fn) {
  try {
    const r = fn()
    return { name, ok: r.problems.length === 0 && !r.unknown, ...r }
  } catch (err) {
    return { name, problems: [], info: [], unknown: `couldn't check: ${safe(err.message).split('\n')[0]}` }
  }
}

// Which ref the git checks look at. The refresh bot pushes to main, so measure origin/main
// when it exists (a feature-branch checkout still measures the right history).
function gitRef() {
  try { git('rev-parse', '--verify', '--quiet', 'origin/main'); return 'origin/main' } catch { return 'HEAD' }
}

function repoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY
  try {
    const m = git('remote', 'get-url', 'origin').match(/github\.com[/:]([^/]+\/[^/.\s]+?)(?:\.git)?$/)
    if (m) return m[1]
  } catch {}
  const pkg = readJSON('package.json')
  const m = (pkg.repository?.url || '').match(/github\.com[/:]([^/]+\/[^/.\s]+?)(?:\.git)?$/)
  if (m) return m[1]
  throw new Error('no GitHub repo slug (GITHUB_REPOSITORY, origin remote, package.json)')
}

// ─── GitHub API: gh if authenticated, else curl (honours HTTPS_PROXY), else fetch ──

let ghOk = null
function ghAuthed() {
  if (ghOk === null) {
    const r = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' })
    ghOk = !r.error && r.status === 0
  }
  return ghOk
}

class ApiLimited extends Error {}

async function api(pathAndQuery) {
  if (ghAuthed()) {
    const r = spawnSync('gh', ['api', '-H', 'Accept: application/vnd.github+json', pathAndQuery], { encoding: 'utf8', maxBuffer: 64 << 20 })
    if (r.status === 0) return JSON.parse(r.stdout)
    if (/rate limit/i.test(r.stderr)) throw new ApiLimited('GitHub API rate limit hit')
    // fall through to unauthenticated
  }
  const url = `https://api.github.com/${pathAndQuery}`
  const c = spawnSync('curl', ['-sS', '-m', '20', '-H', 'Accept: application/vnd.github+json',
    '-H', 'User-Agent: trackwalk-health-check', '-w', '\n%{http_code}', url], { encoding: 'utf8', maxBuffer: 64 << 20 })
  if (!c.error && c.status === 0) {
    const i = c.stdout.lastIndexOf('\n')
    const code = Number(c.stdout.slice(i + 1)), body = c.stdout.slice(0, i)
    if (code === 200) return JSON.parse(body)
    if (code === 403 || code === 429) throw new ApiLimited(`GitHub API refused (HTTP ${code}, probably the unauthenticated rate limit of 60/hour)`)
    throw new Error(`GitHub API HTTP ${code}`)
  }
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'trackwalk-health-check' } })
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get('x-ratelimit-reset')
    throw new ApiLimited(`GitHub API refused (HTTP ${res.status}${reset ? `, resets ${iso(new Date(reset * 1000))}` : ''})`)
  }
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`)
  return res.json()
}

async function asyncCheck(name, fn) {
  try {
    const r = await fn()
    return { name, ok: r.problems.length === 0 && !r.unknown, ...r }
  } catch (err) {
    const why = err instanceof ApiLimited ? err.message : `couldn't check: ${safe(err.message).split('\n')[0]}`
    return { name, problems: [], info: [], unknown: why }
  }
}

// ─── Checks ───────────────────────────────────────────────────────────────────

// 1. Gaps between consecutive refresh commits (PBI 60's method: git log on the bot commits).
function checkRefreshGaps() {
  const problems = [], info = []
  const ref = gitRef()
  if (git('rev-parse', '--is-shallow-repository') === 'true') {
    // Shallow clones (actions/checkout default, some cloud clones) may not reach back far
    // enough. Try to deepen; if that fails, say so rather than reporting a fake gap.
    try { git('fetch', '--quiet', `--shallow-since=${iso(new Date(SINCE.getTime() - 86400e3))}`, 'origin', 'main') } catch {}
  }

  // Commit subject comes from refresh.yml: git commit -m "chore: refresh cache $(date ...)"
  const wf = readText('.github/workflows/refresh.yml')
  const subject = (wf.match(/git commit -m "([^"$]+?)\s*\$\(/) || [])[1] || 'chore: refresh cache'
  const cron = (wf.match(/-\s*cron:\s*'([^']+)'/) || [])[1]

  const out = git('log', ref, `--since=${iso(SINCE)}`, '--fixed-strings', `--grep=${subject}`, '--format=%cI')
  const times = out ? out.split('\n').map(s => new Date(s)).sort((a, b) => a - b) : []

  // Expected fires from the cron, when it's the simple "m1,m2 * * * *" shape.
  let slotsPerDay = null
  if (cron) {
    const [min, hr, dom, mon, dow] = cron.trim().split(/\s+/)
    if (hr === '*' && dom === '*' && mon === '*' && dow === '*' && /^[\d,]+$/.test(min)) slotsPerDay = min.split(',').length * 24
  }

  if (times.length === 0) {
    problems.push(`**No \`${subject}\` commits on \`${ref}\` in the last ${DAYS} days.** The feed is not refreshing at all. Check \`refresh.yml\` runs.`)
    return { problems, info }
  }

  const gaps = []
  for (let i = 1; i < times.length; i++) gaps.push({ h: hours(times[i] - times[i - 1]), from: times[i - 1], to: times[i] })
  const sinceLast = hours(NOW - times[times.length - 1])
  const worst = gaps.reduce((a, g) => (g.h > (a?.h ?? -1) ? g : a), null)
  const under = gaps.filter(g => g.h * 60 <= PBI60_TARGET_MINUTES).length

  const rate = slotsPerDay ? ` of ${slotsPerDay * DAYS} scheduled (\`${cron}\` in \`refresh.yml\`), ${(100 * times.length / (slotsPerDay * DAYS)).toFixed(0)}% fired` : ''
  info.push(`${times.length} refresh commits on \`${ref}\` in ${DAYS} days${rate}.`)
  if (gaps.length) {
    info.push(`Gap between refreshes: median ${fmtH(median(gaps.map(g => g.h)))}, worst ${fmtH(worst.h)} (${iso(worst.from)} → ${iso(worst.to)}).`)
    info.push(`${under} of ${gaps.length} gaps under PBI 60's ${PBI60_TARGET_MINUTES}-minute target. Known issue, tracked as PBI 60, not flagged here.`)
  }
  info.push(`Last refresh ${fmtH(sinceLast)} ago (${iso(times[times.length - 1])}).`)

  if (worst && worst.h > MAX_REFRESH_GAP_HOURS)
    problems.push(`Refresh gap of **${fmtH(worst.h)}** (${iso(worst.from)} → ${iso(worst.to)}), over the ${MAX_REFRESH_GAP_HOURS}h line. Worse than PBI 60's usual throttling.`)
  if (sinceLast > MAX_REFRESH_GAP_HOURS)
    problems.push(`No refresh commit for **${fmtH(sinceLast)}**, over the ${MAX_REFRESH_GAP_HOURS}h line.`)
  return { problems, info }
}

// 2. Failed workflow runs this week. A workflow whose latest run is green again is noted,
//    not flagged: a one-off push race in refresh.yml that self-healed needs nobody.
async function checkWorkflowRuns() {
  const problems = [], info = []
  const slug = repoSlug()
  const day = SINCE.toISOString().slice(0, 10)
  const runs = []
  for (let page = 1; page <= 5; page++) {
    const r = await api(`repos/${slug}/actions/runs?created=%3E%3D${day}&per_page=100&page=${page}`)
    runs.push(...(r.workflow_runs || []))
    if (runs.length >= (r.total_count || 0) || !(r.workflow_runs || []).length) break
  }
  const done = runs.filter(r => r.status === 'completed')
  const byWf = new Map()
  for (const r of done) {
    const k = r.path || r.name
    if (!byWf.has(k)) byWf.set(k, [])
    byWf.get(k).push(r)
  }
  const BAD = new Set(['failure', 'timed_out', 'startup_failure'])
  let failedTotal = 0
  for (const [wf, list] of [...byWf].sort()) {
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const failed = list.filter(r => BAD.has(r.conclusion))
    failedTotal += failed.length
    if (!failed.length) continue
    const latest = list[0]
    const name = safe(latest.name)
    const links = failed.slice(0, 3).map(r => `[${r.created_at.slice(0, 10)}](${r.html_url})`).join(', ')
    if (BAD.has(latest.conclusion))
      problems.push(`**${name}** (\`${safe(wf)}\`): latest run failed. ${failed.length} of ${list.length} runs failed this week: ${links}`)
    else
      info.push(`${name}: ${failed.length} of ${list.length} runs failed (${links}), latest run green again.`)
  }
  info.unshift(`${done.length} completed runs across ${byWf.size} workflows since ${day}, ${failedTotal} failed.`)
  return { problems, info }
}

// 3. cache.json age and items per category.
function checkCache() {
  const problems = [], info = []
  const cache = readJSON('public/cache.json')
  const built = new Date(cache.builtAt)
  if (isNaN(built)) { problems.push('`public/cache.json` has no valid `builtAt`.'); return { problems, info } }
  const age = hours(NOW - built)
  const cats = Object.values(cache.categories || {})
  const stored = cats.reduce((n, c) => n + (c.items?.length || 0), 0)

  // build-cache.js refuses to write when fewer than this many items pass. Read it from there.
  let floor = null
  try { floor = Number((readText('scripts/build-cache.js').match(/filtered\.length\s*<\s*(\d+)/) || [])[1]) || null } catch {}

  info.push(`Built ${fmtH(age)} ago (\`builtAt\` ${cache.builtAt}). \`totalItems\` ${cache.totalItems}, ${stored} stored after the per-category cap.`)
  info.push('Per category: ' + cats.map(c => `${safe(c.label)} ${c.items?.length || 0}`).join(' · '))
  if (age > MAX_CACHE_AGE_HOURS) problems.push(`\`public/cache.json\` is **${fmtH(age)}** old, over the ${MAX_CACHE_AGE_HOURS}h line.`)
  if (floor && cache.totalItems < floor) problems.push(`Only ${cache.totalItems} items passed, under build-cache.js's own floor of ${floor}.`)
  return { problems, info }
}

// 4. test-filter.js. NOTE: it has no assertions and always exits 0 unless it throws, so
//    "passes" can only mean "ran without crashing". The pass count is reported so a change
//    week-to-week is visible.
function checkTestFilter() {
  const problems = [], info = []
  const r = spawnSync(process.execPath, ['scripts/test-filter.js'], { cwd: ROOT, encoding: 'utf8', timeout: 60e3 })
  const summary = (r.stdout?.match(/RESULTS:\s*(\d+ of \d+ items passed)/) || [])[1]
  if (r.error || r.status !== 0) {
    problems.push(`\`node scripts/test-filter.js\` **failed** (exit ${r.status ?? r.error?.code}): ${safe((r.stderr || '').trim().split('\n').pop())}`)
  } else {
    info.push(`\`node scripts/test-filter.js\` exit 0${summary ? `, ${summary}` : ''}. It has no assertions, so this only proves it runs.`)
  }
  return { problems, info }
}

// 5. results/index.json names the current season.
//    "Current" = the year of the latest round in public/calendar.json that has started.
function checkSeason() {
  const problems = [], info = []
  const idx = readJSON('public/results/index.json')
  const cal = readJSON('public/calendar.json')
  const started = (cal.rounds || []).filter(r => new Date(r.date) <= NOW).map(r => r.date).sort()
  const expected = started.length ? started.at(-1).slice(0, 4) : null
  const seasons = (idx.seasons || []).map(s => String(s.year))

  info.push(`\`results/index.json\` current: **${safe(idx.current)}**. \`calendar.json\` year: ${safe(cal.year)}, ${started.length} of ${(cal.rounds || []).length} rounds started.`)
  if (expected && String(idx.current) !== expected)
    problems.push(`\`public/results/index.json\` says current season is ${safe(idx.current)}, but \`calendar.json\` has ${expected} rounds under way. Run \`node scripts/split-results.js\`?`)
  if (!seasons.includes(String(idx.current)))
    problems.push(`\`index.json\` current season ${safe(idx.current)} is missing from its own \`seasons\` list.`)
  if (!fs.existsSync(path.join(ROOT, 'public/results', `${idx.current}.json`)))
    problems.push(`Shard \`public/results/${safe(idx.current)}.json\` does not exist.`)
  if (Number(cal.year) < NOW.getUTCFullYear())
    info.push(`\`calendar.json\` is still ${safe(cal.year)}. Season rollover (plan job 3, Phase 2) is pending.`)
  return { problems, info }
}

// 6. Open preflight issue (label from preflight.yml).
async function checkPreflight() {
  const problems = [], info = []
  const wf = readText('.github/workflows/preflight.yml')
  const label = (wf.match(/--label\s+(\S+)/) || [])[1] || 'preflight'
  const issues = await api(`repos/${repoSlug()}/issues?labels=${encodeURIComponent(label)}&state=open&per_page=10`)
  const open = issues.filter(i => !i.pull_request)
  if (open.length) for (const i of open) problems.push(`Preflight issue open: [#${i.number} ${safe(i.title)}](${i.html_url}), since ${i.created_at.slice(0, 10)}.`)
  else info.push(`No open \`${label}\` issue.`)
  return { problems, info }
}

// 7. Service worker cache version.
//    The brief was "index.html changed without a bump", but the code's own rule is the
//    opposite: the shell is network-first, so an HTML-only change reaches clients without a
//    bump, and bumping drops every cached thumbnail (decisions.md, 2026-09-22;
//    architecture.md "Bump CACHE_NAME when the precached asset LIST changes"). So this flags
//    a change to STATIC_ASSETS without a bump, and a precached file that no longer exists
//    (the install swallows fetch errors, so that one fails silently). index.html commits
//    since the last bump are reported as information only.
function checkServiceWorker() {
  const problems = [], info = []
  const SW = 'service-worker.js'
  const src = readText(SW)
  const name = (src.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/) || [])[1]
  if (!name) { problems.push(`Couldn't find \`CACHE_NAME\` in \`${SW}\`.`); return { problems, info } }
  const assetsOf = text => {
    const m = text.match(/const\s+STATIC_ASSETS\s*=\s*\[([\s\S]*?)\]/)
    return m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]) : null
  }
  const now = assetsOf(src)

  const ref = gitRef()
  const bump = git('log', ref, '-1', '-G', 'const\\s+CACHE_NAME\\s*=', '--format=%H%x09%cI', '--', SW)
  info.push(`\`CACHE_NAME\` is \`${safe(name)}\` (\`${SW}\`).`)
  if (bump) {
    const [sha, when] = bump.split('\t')
    info.push(`Last bumped in ${sha.slice(0, 7)} on ${when.slice(0, 10)}.`)
    const then = assetsOf(git('show', `${sha}:${SW}`))
    if (now && then && JSON.stringify(now) !== JSON.stringify(then)) {
      const added = now.filter(a => !then.includes(a)), removed = then.filter(a => !now.includes(a))
      problems.push(`\`STATIC_ASSETS\` changed since \`${safe(name)}\` without a \`CACHE_NAME\` bump (added: ${added.map(safe).join(', ') || 'none'}; removed: ${removed.map(safe).join(', ') || 'none'}). Installed clients keep the old precache.`)
    }
    const html = git('log', `${sha}..${ref}`, '--format=%h', '--', 'index.html')
    const n = html ? html.split('\n').length : 0
    info.push(`${n} \`index.html\` commit${n === 1 ? '' : 's'} since then. No bump needed for those: the shell is network-first (decisions.md, 2026-09-22).`)
  } else {
    info.push('No commit found that set `CACHE_NAME` (shallow clone?), so the asset-list comparison was skipped.')
  }
  for (const a of now || []) {
    const rel = a === '/' ? 'index.html' : a.replace(/^\//, '')
    if (!fs.existsSync(path.join(ROOT, rel))) problems.push(`Precached \`${safe(a)}\` in \`STATIC_ASSETS\` doesn't exist in the repo.`)
  }
  return { problems, info }
}

// ─── Report ───────────────────────────────────────────────────────────────────

const results = [
  check('Feed refresh cadence', checkRefreshGaps),
  await asyncCheck('Workflow runs', checkWorkflowRuns),
  check('cache.json', checkCache),
  check('Filter tests', checkTestFilter),
  check('Results season', checkSeason),
  await asyncCheck('Preflight', checkPreflight),
  check('Service worker', checkServiceWorker),
]

const problemCount = results.reduce((n, r) => n + r.problems.length, 0)
const unknown = results.filter(r => r.unknown)
const lines = []
lines.push(problemCount === 0 ? 'All quiet' : `${problemCount} ${problemCount === 1 ? 'thing needs' : 'things need'} you`)
lines.push('')
lines.push(`_Health check, ${iso(NOW)}, last ${DAYS} days. ${results.length - unknown.length} of ${results.length} checks ran${unknown.length ? `; couldn't run: ${unknown.map(r => r.name).join(', ')}` : ''}._`)
lines.push('')
if (problemCount) {
  lines.push('## Needs you')
  for (const r of results) for (const p of r.problems) lines.push(`- **${r.name}:** ${p}`)
  lines.push('')
}
lines.push('## Checks')
for (const r of results) {
  const mark = r.unknown ? '⚪' : r.problems.length ? '🔴' : '🟢'
  lines.push(`- ${mark} **${r.name}**${r.unknown ? `: ${r.unknown}` : ''}`)
  for (const i of r.info || []) lines.push(`  - ${i}`)
}
const report = lines.join('\n') + '\n'

process.stdout.write(report)
if (typeof args.out === 'string') fs.writeFileSync(path.resolve(args.out), report)

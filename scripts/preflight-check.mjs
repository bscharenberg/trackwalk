/**
 * preflight-check.mjs
 * Trackwalk — warn BEFORE a race weekend that a results source isn't reachable yet.
 *
 * The results pipeline is unattended: fetch-results.yml polls every 10 minutes on race days
 * and commits whatever it finds. The failure mode that costs a round is silent — a source
 * that simply has nothing, on a weekend nobody is watching. Les Gets was exactly that, and it
 * was only noticed days later because the round never appeared on the site.
 *
 * So check ahead of time instead. A round is "reachable" when its discovery chain resolves,
 * which happens well before any result exists. If an upcoming round is not reachable, this
 * exits non-zero and prints a report the workflow turns into a GitHub issue.
 *
 * Which source has to be ready depends on the round:
 *   - World Series round → ChronoRace (Tissot does not carry them)
 *   - World Championships → Tissot (ChronoRace's WBD feed does not carry them)
 * DataRide backstops both, but days late, so it does not count as ready.
 *
 * Usage:
 *   node scripts/preflight-check.mjs                 # default 14-day horizon, current year
 *   node scripts/preflight-check.mjs --days=21
 *   node scripts/preflight-check.mjs --year=2026 --all   # ignore the horizon, report everything
 */

import { preflightReport } from './chronorace-fetcher.mjs'

const arg = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const YEAR  = arg('year', String(new Date().getUTCFullYear()))
const DAYS  = Number(arg('days', '14'))
const ALL   = process.argv.includes('--all')
const UA    = 'Mozilla/5.0 (Trackwalk preflight; trackwalk.racing)'
const TISSOT = 'https://prod.server.tissottiming.com'

const daysUntil = iso => Math.round((new Date(iso + 'T00:00:00Z') - Date.now()) / 86400000)

// Tissot is only consulted for World Championships, which is a separate competition from the
// World Series calendar ChronoRace serves.
async function tissotWorlds(year) {
  try {
    const res = await fetch(`${TISSOT}/competitions?year=${year}&sport=MTB`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!res.ok) return { ok: false, reason: `competitions → HTTP ${res.status}` }
    const comps = await res.json()
    const wch = (Array.isArray(comps) ? comps : []).find(c => /mountain bike world championships/i.test(c.name || ''))
    if (!wch) return { ok: false, reason: 'no MTB World Championships listed for the season' }

    const ev = await fetch(`${TISSOT}/competitions/${wch.code}${year}/events`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (!ev.ok) return { ok: false, reason: `events → HTTP ${ev.status}`, comp: wch }
    const events = await ev.json()
    const dh = (Array.isArray(events) ? events : [])
      .filter(e => /downhill/i.test(e.name || '') && /elite/i.test(e.name || ''))
    return dh.length
      ? { ok: true, comp: wch, events: dh.map(e => e.name) }
      : { ok: false, reason: 'no elite downhill events listed yet', comp: wch }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

const lines = []
const say = s => { lines.push(s); console.log(s) }

const rows = await preflightReport(YEAR)
const upcoming = ALL ? rows : rows.filter(r => {
  const d = daysUntil(r.startDate)
  return d >= -2 && d <= DAYS          // still counts the day after, in case of a delay
})

say(`Trackwalk source preflight — ${YEAR}`)
say(ALL ? '\nHorizon: all rounds.' : `\nHorizon: rounds starting within ${DAYS} days (checked ${new Date().toISOString().slice(0, 10)}).`)

const problems = []

if (!upcoming.length) {
  say('\nNo World Series round is due in this window — nothing to check.')
} else {
  say('\n| Round | Venue | Starts | In | ChronoRace |')
  say('|---|---|---|---|---|')
  for (const r of upcoming) {
    const d = daysUntil(r.startDate)
    say(`| R${r.round} | ${r.venue} | ${r.startDate} | ${d}d | ${r.ready ? '✅ ready' : '❌ ' + r.reason} |`)
    if (!r.ready) problems.push(`R${r.round} ${r.venue} (${r.startDate}, in ${d} days) — ChronoRace: ${r.reason}`)
  }
}

// Worlds is a separate competition and is NOT in the ChronoRace rows above, so it must be
// checked unconditionally — gating it on a nearby World Series round would mean a Worlds
// weekend on its own is never checked at all.
{
  const t = await tissotWorlds(YEAR)
  if (t.comp) {
    const d = daysUntil(String(t.comp.start || '').slice(0, 10))
    if (ALL || (d >= -2 && d <= DAYS)) {
      say(`\nWorld Championships (${t.comp.name}, ${t.comp.start} → ${t.comp.end}, in ${d} days)`)
      say(t.ok ? `  ✅ Tissot ready — ${t.events.join(', ')}` : `  ❌ Tissot: ${t.reason}`)
      if (!t.ok) problems.push(`World Championships ${t.comp.start} — Tissot: ${t.reason}`)
    }
  }
}

if (problems.length) {
  say('\n---\n')
  say('**A round is coming up that no same-day source can serve yet.**\n')
  problems.forEach(p => say(`- ${p}`))
  say('\nA 500 or an empty competition list weeks out is normal — the feed is populated closer to')
  say('the race. Treat this as urgent only inside about a week of the round.')
  say('\nIf it is still failing close to race day, the round will not appear live. The DataRide')
  say('sweep (`dataride-fetch.yml`, every 6h, additive-only) will still pick it up afterwards,')
  say('so nothing is lost permanently — it just will not be there on the day.')
  say('\nCheck by hand with: `node scripts/chronorace-fetcher.mjs ' + YEAR + ' --preflight`')
}

// The workflow reads this file to build the issue body.
if (process.env.GITHUB_ENV || process.argv.includes('--write-report')) {
  const fs = await import('fs')
  fs.writeFileSync('preflight-report.md', lines.join('\n') + '\n')
}

process.exit(problems.length ? 1 : 0)

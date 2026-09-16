/**
 * tissot-fetcher.mjs
 * Trackwalk — DH results from Tissot Timing, the UCI's official timekeeping partner.
 *
 * Fills the one gap the other two fetchers cannot cover. The ChronoRace WBD API carries the
 * World Series only — its 2026 event list jumps straight from Les Gets (08-21) to Soldier
 * Hollow (09-19) with no World Championships — and DataRide publishes Worlds days after the
 * fact. Tissot serves the Worlds live, on race day, from the official timing feed. It is the
 * source Pinkbike's editor was reading mid-event when a rider's Val di Sole result changed
 * from 39th to DSQ.
 *
 * API (public, no auth; discovered from the tissottiming.com front-end bundle):
 *   GET /competitions?year=YYYY[&sport=MTB]        → [{code, name, sport, start, end, location, status}]
 *   GET /competitions/{code}{year}/events          → [{number, name}]   e.g. 3 "Men Elite Downhill"
 *   GET /competitions/{code}{year}/events/{n}/phases          → [{number, name, start, current}]
 *   GET /competitions/{code}{year}/events/{n}/phases/{p}/results → {event, resultType, results:[…]}
 *
 * Two gotchas, both cost a round trip to learn:
 *   - the competition path param is the code with the year appended (mtbwch → mtbwch2026);
 *     the bare code 404s.
 *   - events and phases are keyed by `number`, not by a code or id.
 *
 * A phase that has not been raced yet 404s on /results. That is the normal pre-race state,
 * not an error — it is how this fetcher no-ops on a poll before finals.
 *
 * Usage:
 *   node scripts/tissot-fetcher.mjs <year>              # fetch + report (no write)
 *   node scripts/tissot-fetcher.mjs <year> --validate   # diff against results.json
 *   node scripts/tissot-fetcher.mjs <year> --merge      # upsert sessions into results.json
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { canonName, canonVenue, slugify } from './lib/canon.mjs'

const __dirname    = path.dirname(fileURLToPath(import.meta.url))
const RESULTS_PATH = path.join(__dirname, '..', 'public', 'results.json')

const API = 'https://prod.server.tissottiming.com'
const UA  = 'Mozilla/5.0 (Trackwalk results fetcher; trackwalk.racing)'

// ─── Low-level ────────────────────────────────────────────────────────────────

async function get(pathname) {
  const res = await fetch(API + pathname, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (res.status === 404) return null              // not raced yet / no such resource
  if (!res.ok) throw new Error(`GET ${pathname} → ${res.status}`)
  return res.json()
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

// "Men Elite Downhill" / "Women Elite Downhill". Juniors and every XCO/XCC/E-MTB event are
// out of scope, same rule as the other two fetchers.
function eliteDownhillGender(eventName) {
  const n = String(eventName || '')
  if (!/downhill/i.test(n) || !/elite/i.test(n)) return null
  if (/^women/i.test(n)) return 'women'
  if (/^men/i.test(n))   return 'men'
  return null
}

// Phase name → Trackwalk session key. Worlds runs one qualifying and one final per gender;
// the numbered-qualifier forms are handled anyway so a format change doesn't silently drop
// a session.
function sessionKey(phase, gender) {
  const n = String(phase?.name || '').trim()
  if (/^final/i.test(n))                       return `finals-${gender}`
  const q = /^qualif\w*\s*(\d+)?$/i.exec(n)
  if (q)                                       return `qualifying-${q[1] || 1}-${gender}`
  if (/^semi/i.test(n))                        return `semi-finals-${gender}`
  return null
}

// resultType 'IRM' (irregular result mark) carries DNF/DNS/DSQ in `time`, with rank 0.
function nonFinisherStatus(row) {
  if (String(row.resultType).toUpperCase() !== 'IRM') return null
  const s = String(row.time || row.value || '').trim().toUpperCase()
  if (s === 'DNS') return 'dns'
  if (s === 'DSQ' || s === 'DQ') return 'dsq'
  return 'dnf'
}

// Tissot gives an absolute time only to the leader; every other finisher's `time` field is
// the gap ("+0.331") and `gap` is empty. results.json stores an absolute time per rider, so
// reconstruct it as leader + gap. Cross-checked against the Val di Sole men's qualifying
// published elsewhere: leader 3:34.010, second +0.331 → 3:34.341. ✓
function parseClock(str) {
  const m = /^(?:(\d+):)?(?:(\d+):)?(\d+)(?:\.(\d{1,3}))?$/.exec(String(str || '').trim().replace(/^\+/, ''))
  if (!m) return null
  const [, a, b, sec, frac] = m
  const h   = b ? Number(a) : 0
  const min = b ? Number(b) : (a ? Number(a) : 0)
  return ((h * 3600 + min * 60 + Number(sec)) * 1000) + Number((frac || '0').padEnd(3, '0'))
}

function formatClock(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null
  const h   = Math.floor(ms / 3600000)
  const min = Math.floor((ms % 3600000) / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  const mil = ms % 1000
  const tail = `${String(sec).padStart(2, '0')}.${String(mil).padStart(3, '0')}`
  return h ? `${h}:${String(min).padStart(2, '0')}:${tail}` : `${min}:${tail}`
}

function mapRider(row, leaderMs) {
  const status = nonFinisherStatus(row)
  const rank   = Number(row.rank)
  const splits = (row.splits || [])
    .filter(s => s.value)
    .map(s => ({ name: s.name, time: s.value, rank: s.rank || null }))

  const raw      = String(row.time || row.value || '').trim()
  const isGapForm = raw.startsWith('+')
  let time = null, gap = null
  if (!status) {
    if (isGapForm) {
      gap = raw
      const gapMs = parseClock(raw)
      // No leader time (e.g. the leader is an IRM row) → leave time null rather than guess.
      if (leaderMs != null && gapMs != null) time = formatClock(leaderMs + gapMs)
    } else {
      time = raw || null
    }
  }

  return {
    rank:   status ? null : (Number.isFinite(rank) && rank > 0 ? rank : null),
    name:   canonName(row.rider?.name || '').name,
    nat:    row.rider?.nation || null,
    // Worlds is raced in national colours, so there is no trade team to record.
    team:   null,
    time,
    gap,
    ...(row.rider?.bib != null && { bib: String(row.rider.bib) }),
    // No World Cup points are awarded at a World Championship.
    points: null,
    ...(row.rider?.uciRiderId && { uciId: row.rider.uciRiderId }),
    ...(splits.length && { splits }),
    ...(status && { [status]: true }),
  }
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

async function fetchYear(year, { onLog = () => {} } = {}) {
  const comps = (await get(`/competitions?year=${year}&sport=MTB`)) || []
  const rounds = []

  for (const c of comps) {
    const compId = `${c.code}${year}`
    let events
    try {
      events = (await get(`/competitions/${compId}/events`)) || []
    } catch (err) {
      // One competition failing must not abort the season.
      onLog(`  ⚠️  ${compId} events → ${err.message}`)
      continue
    }

    const dhEvents = events
      .map(e => ({ ...e, gender: eliteDownhillGender(e.name) }))
      .filter(e => e.gender)
    if (!dhEvents.length) continue

    const sessions = {}
    let earliestFinal = null

    for (const e of dhEvents) {
      let phases
      try {
        phases = (await get(`/competitions/${compId}/events/${e.number}/phases`)) || []
      } catch (err) {
        onLog(`  ⚠️  ${compId}/${e.number} phases → ${err.message}`)
        continue
      }

      for (const p of phases) {
        const key = sessionKey(p, e.gender)
        if (!key) { onLog(`  ⚠️  unmapped phase "${p.name}" on ${e.name}`); continue }

        // The finals date comes from the schedule, which exists before the race does.
        // Deriving it from results instead would leave the round dated by the competition's
        // end date on any poll taken before finals — that is how the hardcoded calendar
        // ended up a day late for both Les Gets and Val di Sole.
        if (key.startsWith('finals-') && p.start) {
          const d = p.start.slice(0, 10)
          if (!earliestFinal || d < earliestFinal) earliestFinal = d
        }

        let payload
        try {
          payload = await get(`/competitions/${compId}/events/${e.number}/phases/${p.number}/results`)
        } catch (err) {
          onLog(`  ⚠️  ${key} → ${err.message}`)
          continue
        }
        if (!payload) continue                       // not raced yet

        const rows = payload.results || []
        if (!rows.length) continue
        const leader   = rows.find(r => Number(r.rank) === 1 && String(r.resultType).toUpperCase() !== 'IRM')
        const leaderMs = leader ? parseClock(leader.time || leader.value) : null
        sessions[key] = rows.map(r => mapRider(r, leaderMs))
      }
    }

    if (!Object.keys(sessions).length) continue

    // "Val di Sole, ITA" → canonical venue, so this round lands on the same slug the
    // hardcoded calendar and the other two sources use.
    const rawVenue = String(c.location || '').split(',')[0].trim()
    const hit      = canonVenue(rawVenue)
    const venue    = hit?.name || rawVenue || c.name
    const slug     = `${hit?.slug || slugify(venue)}-${year}`

    rounds.push({
      eventType: /world\s*champ/i.test(c.name) ? 'world-championship' : 'world-cup',
      venue,
      slug,
      country:   hit?.country || c.noc || null,
      date:      earliestFinal || c.end || c.start,
      source:    'tissot',
      sourceRef: `tissot:${compId}`,
      status:    c.status || null,
      fetchedAt: new Date().toISOString(),
      sessions,
    })
  }

  return rounds
}

// ─── Report / validate / merge ────────────────────────────────────────────────

function report(rounds) {
  for (const r of rounds) {
    console.log(`\n── ${r.venue} (${r.slug}) — ${r.date} [${r.status}] ${r.eventType}`)
    for (const [key, riders] of Object.entries(r.sessions)) {
      const podium = riders.filter(x => x.rank).slice(0, 3)
        .map(x => `${x.rank}. ${x.name} ${x.time}`).join('   ')
      console.log(`  ${key.padEnd(20)} ${String(riders.length).padStart(3)} riders   ${podium}`)
    }
  }
}

function validate(year, rounds) {
  const data   = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'))
  const stored = data.seasons?.[year]?.rounds || []
  console.log(`\n── VALIDATION: Tissot ${year} vs results.json ──`)
  for (const r of rounds) {
    const ex = stored.find(x => x.slug === r.slug)
    for (const [key, riders] of Object.entries(r.sessions)) {
      const win   = riders.find(x => x.rank === 1)
      const exWin = ex?.sessions?.[key]?.find(x => x.rank === 1)
      const mark  = !exWin ? '🆕' : (canonName(exWin.name).name === win?.name ? '✅' : '❌')
      console.log(`  ${mark} ${r.venue.padEnd(14)} ${key.padEnd(20)} Tissot=${win?.name} ${win?.time}` +
                  (exWin ? `  existing=${canonName(exWin.name).name} ${exWin.time}` : '  (not in results.json)'))
    }
  }
}

function merge(year, rounds) {
  const data = fs.existsSync(RESULTS_PATH)
    ? JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'))
    : { lastUpdated: '', seasons: {} }
  if (!data.seasons) data.seasons = {}
  if (!data.seasons[year]) data.seasons[year] = { rounds: [] }
  const target = data.seasons[year].rounds

  let changed = false
  for (const r of rounds) {
    const idx = target.findIndex(x => x.slug === r.slug)
    if (idx < 0) {
      target.push(r)
      changed = true
      console.log(`  🆕 round ${r.slug} (${Object.keys(r.sessions).join(', ')})`)
      continue
    }
    // Merge session-by-session so a session already stored from another source survives a
    // fetch that doesn't happen to include it.
    const have = target[idx].sessions || (target[idx].sessions = {})
    for (const [key, riders] of Object.entries(r.sessions)) {
      const before = JSON.stringify(have[key] || null)
      if (before === JSON.stringify(riders)) continue
      have[key] = riders
      changed = true
      console.log(`  ➕ ${target[idx].slug} ${key} (${riders.length} riders)`)
    }
  }

  if (!changed) { console.log('\n✅ nothing new from Tissot — no changes written'); return false }

  data.seasons[year].rounds.sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  data.lastUpdated = new Date().toISOString()
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(data, null, 2))
  console.log('\n✅ wrote public/results.json')
  return true
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const year = process.argv.slice(2).find(a => !a.startsWith('--'))
  if (!year) {
    console.log('Usage: node scripts/tissot-fetcher.mjs <year> [--validate|--merge]')
    process.exit(0)
  }

  const rounds = await fetchYear(year, { onLog: s => console.log(s) })
  console.log(`\n${year}: ${rounds.length} DH round(s) from Tissot`)
  report(rounds)

  if (process.argv.includes('--validate')) validate(year, rounds)
  if (process.argv.includes('--merge'))    merge(year, rounds)
}

export { fetchYear }

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('\n💥', e.message); process.exit(1) })
}

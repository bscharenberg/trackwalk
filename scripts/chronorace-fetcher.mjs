/**
 * chronorace-fetcher.mjs
 * Trackwalk — race results from ChronoRace, the UCI's on-site timing vendor.
 *
 * ChronoRace is upstream of every other source: the official UCI results PDFs are theirs
 * (`Producer: chronorace - electronic timing via ABCpdf`), and the Les Gets 2026 Elite Men
 * report was stamped ~40 min after the last rider — hours before anything downstream.
 * Discovery notes and the full API map: docs/chronorace-api.md
 *
 * results.chronorace.be is public and self-documented (Swagger at /swagger). The WBD
 * document is discovery-based, so unlike results-fetcher.mjs this needs NO hardcoded race
 * calendar — which is what caused two wrong finals dates (Les Gets, Val di Sole):
 *     discovery/event-list?season=YYYY
 *       → discovery/competition-list/{eventId}
 *         → resource/results/{competitionId}
 *
 * SCOPE: World Series rounds only. WBD does not carry the World Championships — the 2026
 * event list jumps straight from Les Gets (08-21) to 09-19, skipping Val di Sole Worlds.
 * Use dataride-fetcher.mjs for Worlds; it already emits eventType 'world-championship'.
 *
 * Usage:
 *   node scripts/chronorace-fetcher.mjs <year>                  # fetch + report (no write)
 *   node scripts/chronorace-fetcher.mjs <year> --validate       # diff against results.json
 *   node scripts/chronorace-fetcher.mjs <year> --merge          # upsert into results.json
 *   node scripts/chronorace-fetcher.mjs <year> --only=les-gets-2026
 *   node scripts/chronorace-fetcher.mjs <year> --preflight     # is each round reachable yet?
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { canonName, canonVenue, slugify } from './lib/canon.mjs'

const __dirname    = path.dirname(fileURLToPath(import.meta.url))
const ROOT         = path.join(__dirname, '..')
const RESULTS_PATH = path.join(ROOT, 'public', 'results.json')

const BASE = 'https://results.chronorace.be'
const WBD  = `${BASE}/api/v1/wbd`
const UA   = 'Mozilla/5.0 (Trackwalk results fetcher; trackwalk.racing)'
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function api(pathname) {
  const res = await fetch(`${WBD}${pathname}`, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`GET ${pathname} → ${res.status}`)
  const text = await res.text()
  if (!text.trim()) return null
  return JSON.parse(text)
}

// ─── Mapping ──────────────────────────────────────────────────────────────────
// Elite only — juniors are out of scope for Trackwalk (same rule as the other fetchers).
const GENDER = { ME: 'men', WE: 'women' }

// Phase → Trackwalk session prefix. Competition ids look like 2026-11-DHI-ME-F / -ME-Q2,
// and Phase is the bare code ('F', 'Q1', 'Q2'); PhaseName is the prose ('Qualification 2').
function sessionKey(phase, phaseName, gender) {
  const p = String(phase || '').toUpperCase()
  const n = String(phaseName || '').toLowerCase()
  const q = /^Q(\d+)$/.exec(p)
  if (q) return `qualifying-${q[1]}-${gender}`
  if (/qualif/.test(n)) {
    const m = /(\d+)/.exec(n)
    return `qualifying-${m ? m[1] : 1}-${gender}`
  }
  if (p === 'F' || /final/.test(n)) return `finals-${gender}`
  if (/semi/.test(n)) return `semi-${gender}`
  return null   // unknown phase → skip rather than guess
}

// "3:27.924" / "58.21" → seconds, for gap computation. ChronoRace already hands us the
// display string, so this is only used to derive gaps (which the API does not include).
function toSeconds(t) {
  const s = String(t || '').trim()
  if (!/^[\d:.]+$/.test(s)) return null
  const parts = s.split(':').map(Number)
  if (parts.some(isNaN)) return null
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}
function fmtGap(sec) {
  if (sec == null || sec <= 0) return null
  const m = Math.floor(sec / 60), r = sec - m * 60
  return '+' + (m ? `${m}:${r.toFixed(3).padStart(6, '0')}` : r.toFixed(3))
}

// IRM ("individual result marker") carries DNF/DNS/DSQ; Rank is null for those.
function normalizeRow(row) {
  const irm = String(row.IRM || '').trim().toUpperCase() || null
  const rank = Number.isFinite(row.Rank) && row.Rank > 0 ? row.Rank : null
  // FirstName is mixed case, LastName is CAPS — canonName treats CAPS as the family name
  // and is order-independent, so this yields the same display form as the DataRide path.
  const { name } = canonName(`${row.FirstName || ''} ${row.LastName || ''}`)
  const out = {
    rank,
    name,
    nat:    (row.Nation || '').trim() || null,
    team:   (row.TeamName || '').trim() || null,
    time:   rank ? (row.Result || null) : null,
    gap:    null,
    points: Number.isFinite(row.Points) ? row.Points : null,
  }
  if (irm === 'DNF') out.dnf = true
  else if (irm === 'DNS') out.dns = true
  else if (irm === 'DSQ' || irm === 'DQ') out.dsq = true
  out._sort = Number(row.SortOrder ?? 0) || 0
  return out
}

// WBD sometimes gives a REGION rather than the venue — Les Gets is reported as
// "Haute Savoie". scripts/canon/venues.json already maps those, but under hyphenated keys
// ("haute-savoie") while canon's looseKey only collapses whitespace, so "Haute Savoie"
// misses. Try the hyphenated form too; without this Les Gets resolves to its own
// `haute-savoie-2026` slug and silently duplicates the round instead of matching it.
function resolveVenue(ev) {
  const raw = ev.VenueLocation || ''
  const hit = canonVenue(raw) || canonVenue(raw.trim().replace(/\s+/g, '-'))
  return hit || { name: raw, slug: slugify(raw), country: ev.Country || null }
}

// ─── Preflight ────────────────────────────────────────────────────────────────
// Answers "will this actually work on race day?" ahead of the race, without needing results
// to exist. Run it a few days out from a round: if the venue reports READY, the discovery
// chain is live and the fetcher will pick the round up automatically. Worth having because
// Whistler (wbd-2026-13) returned a 500 from competition-list well ahead of its race weekend
// — a future round is always the least-baked record in the feed.
// Structured form, so the weekly alarm can act on it instead of scraping console text.
async function preflightReport(year) {
  const events = await api(`/discovery/event-list?season=${encodeURIComponent(year)}`)
  if (!Array.isArray(events)) throw new Error('event-list did not return an array')
  const dhEvents = events
    .filter(e => Array.isArray(e.Disciplines) && e.Disciplines.includes('DHI'))
    .sort((a, b) => String(a.StartDate).localeCompare(String(b.StartDate)))

  const out = []
  for (const [i, ev] of dhEvents.entries()) {
    const base = {
      round:     i + 1,
      venue:     ev.VenueLocation,
      eventId:   ev.EventId,
      startDate: String(ev.StartDate || '').slice(0, 10),
    }
    let comps
    try { comps = (await api(`/discovery/competition-list/${ev.EventId}`)) || [] }
    catch (err) { out.push({ ...base, ready: false, reason: `competition-list → ${err.message}` }); continue }

    const dhi = comps.filter(c => c.Discipline === 'DHI' && GENDER[c.CategoryCode])
    if (!dhi.length) {
      out.push({ ...base, ready: false, reason: 'event exists but lists no elite DHI competitions yet' })
      continue
    }
    const sessions = [...new Set(dhi.map(c => sessionKey(c.Phase, c.PhaseName, GENDER[c.CategoryCode])).filter(Boolean))]
    const dates    = [...new Set(dhi.map(c => String(c.Date || '').slice(0, 10)).filter(Boolean))].sort()
    out.push({ ...base, ready: true, competitions: dhi.length, sessions, dates })
    await sleep(120)
  }
  return out
}

async function preflight(year) {
  const rows = await preflightReport(year)
  console.log(`\n── ChronoRace preflight, ${year} — ${rows.length} DHI events\n`)
  for (const r of rows) {
    const label = `R${String(r.round).padStart(2)}  ${String(r.venue).padEnd(26)} ${r.startDate}`
    if (!r.ready) { console.log(`  ❌ ${label}  ${r.reason}`); continue }
    console.log(`  ✅ ${label}  READY — ${r.competitions} competitions, sessions: ${r.sessions.join(', ')}`)
    console.log(`      dates: ${r.dates.join(', ')}`)
  }
  const notReady = rows.filter(r => !r.ready).length
  console.log(notReady
    ? `\n⚠️  ${notReady} event(s) not ready yet. That is expected for a round weeks out; re-run closer to the race.`
    : '\n✅ every DHI event is reachable.')
}

// ─── Assemble a season ────────────────────────────────────────────────────────
async function fetchSeason(year, { onLog = () => {} } = {}) {
  const events = await api(`/discovery/event-list?season=${encodeURIComponent(year)}`)
  if (!Array.isArray(events)) throw new Error('event-list did not return an array')

  // Round numbers come from date-position among DHI-bearing events only. The WBD event
  // number is NOT the DH round: the calendar includes XCO/XCC-only stops, so Les Gets is
  // WBD event 11 but DH round 7.
  const dhEvents = events
    .filter(e => Array.isArray(e.Disciplines) && e.Disciplines.includes('DHI'))
    .sort((a, b) => String(a.StartDate).localeCompare(String(b.StartDate)))
  onLog(`${events.length} events in ${year}; ${dhEvents.length} include DHI`)

  const rounds = []
  for (const [i, ev] of dhEvents.entries()) {
    // One bad event must not abort the season — wbd-2026-13 currently 500s, and a future
    // round will always be the newest/least-baked record in the feed.
    let comps
    try { comps = (await api(`/discovery/competition-list/${ev.EventId}`)) || [] }
    catch (err) { onLog(`  ! ${ev.VenueLocation} (${ev.EventId}): ${err.message} — skipped`); continue }
    const dhi = comps.filter(c => c.Discipline === 'DHI' && GENDER[c.CategoryCode])
    if (!dhi.length) { onLog(`  – ${ev.VenueLocation}: no elite DHI competitions yet`); continue }

    const sessions = {}
    let finalsDate = null, status = null
    for (const c of dhi) {
      const gender = GENDER[c.CategoryCode]
      const key = sessionKey(c.Phase, c.PhaseName, gender)
      if (!key) continue

      let payload
      try { payload = await api(`/resource/results/${c.CompetitionId}`) }
      catch { continue }                                  // not published yet
      const rows = payload?.Data
      if (!Array.isArray(rows) || !rows.length) continue

      const all = rows.map(normalizeRow)
      const ranked = all.filter(r => r.rank != null).sort((a, b) => a.rank - b.rank)
      const rest   = all.filter(r => r.rank == null).sort((a, b) => a._sort - b._sort)
      if (!ranked.length) continue

      const win = toSeconds(ranked[0].time)
      for (const r of ranked) {
        const s = toSeconds(r.time)
        r.gap = (win != null && s != null && r.rank !== 1) ? fmtGap(s - win) : null
      }
      const out = [...ranked, ...rest]
      for (const r of out) delete r._sort
      sessions[key] = out

      if (key.startsWith('finals')) {
        finalsDate = String(c.Date || '').slice(0, 10) || finalsDate
        status = payload?.MetaData?.Status || status
      }
      await sleep(120)
    }
    if (!Object.keys(sessions).length) { onLog(`  – ${ev.VenueLocation}: no published results yet`); continue }

    const venue = resolveVenue(ev)
    rounds.push({
      round:     i + 1,
      eventType: 'world-cup',
      venue:     venue.name,
      slug:      `${venue.slug}-${year}`,
      country:   venue.country || ev.Country || null,
      date:      finalsDate || String(ev.EndDate || ev.StartDate).slice(0, 10),
      source:    'chronorace',
      sourceRef: `chronorace:${ev.EventId}`,
      status:    status || null,
      fetchedAt: new Date().toISOString(),
      sessions,
    })
    onLog(`  ✓ R${String(i + 1).padEnd(2)} ${venue.name.padEnd(20)} ${Object.keys(sessions).join(', ')}${status ? `  [${status}]` : ''}`)
  }
  return rounds
}

// ─── Validate / merge (mirrors dataride-fetcher so the two behave identically) ─
function loadResults() {
  return fs.existsSync(RESULTS_PATH)
    ? JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'))
    : { lastUpdated: '', seasons: {} }
}

function validate(year, rounds) {
  console.log(`\n── VALIDATION: ChronoRace ${year} vs results.json ──`)
  const existing = loadResults().seasons?.[year]?.rounds || []
  const byslug = new Map(existing.map(r => [r.slug, r]))
  for (const r of rounds) {
    const ex = byslug.get(r.slug)
    for (const g of ['men', 'women']) {
      const mine = r.sessions[`finals-${g}`]?.[0]
      const theirs = ex?.sessions?.[`finals-${g}`]?.[0]
      if (!mine) continue
      const mark = !theirs ? '🆕' : (theirs.name === mine.name && theirs.time === mine.time ? '✅' : '❌')
      console.log(`  ${mark} ${r.venue.padEnd(18)} finals-${g}: ChronoRace=${mine.name} ${mine.time}`
                + (theirs ? `  existing=${theirs.name} ${theirs.time}` : '  (not in existing)'))
    }
  }
}

// Incoming wins, except where it carries nothing and the stored value has something. A
// source must be able to correct a value but never to delete one another source supplied —
// ChronoRace has no World Cup points, so a naive spread would blank every `points` field.
const STATUS_KEYS = ['dnf', 'dns', 'dsq']
function preserveFilled(existing, incoming) {
  const out = { ...existing, ...incoming }
  for (const [k, v] of Object.entries(incoming)) {
    if ((v === null || v === undefined) && existing?.[k] != null) out[k] = existing[k]
  }
  // A rider promoted to a finishing rank must lose a stale DNF/DNS/DSQ flag from the
  // previous source — a provisional result that was later corrected is exactly the case
  // this fetcher exists to pick up.
  if (incoming.rank != null) for (const k of STATUS_KEYS) if (!incoming[k]) delete out[k]
  return out
}

function mergeSession(existingRows, incomingRows) {
  if (!Array.isArray(existingRows) || !existingRows.length) return incomingRows
  const byRank = new Map(existingRows.filter(r => r.rank != null).map(r => [r.rank, r]))
  const byName = new Map(existingRows.map(r => [r.name, r]))
  return incomingRows.map(r => {
    const ex = (r.rank != null ? byRank.get(r.rank) : null) || byName.get(r.name)
    if (!ex) return r

    // A rider who has picked up a DNF/DNS/DSQ is a correction, and the incoming row wins
    // outright: rank, time, gap and points must all clear together. Field-wise preservation
    // would keep the old finishing rank alongside the new flag — precisely the Val di Sole
    // case where a rider was shown 39th and then disqualified.
    if (STATUS_KEYS.some(k => r[k])) {
      return { ...r, ...(ex.bib != null && r.bib == null && { bib: ex.bib }),
                     ...(ex.uciId != null && r.uciId == null && { uciId: ex.uciId }) }
    }
    return preserveFilled(ex, r)
  })
}

function merge(year, rounds) {
  const data = loadResults()
  if (!data.seasons) data.seasons = {}
  if (!data.seasons[year]) data.seasons[year] = { rounds: [] }
  const target = data.seasons[year].rounds
  const before = JSON.stringify(target)

  for (const r of rounds) {
    const i = target.findIndex(x => x.slug === r.slug)
    if (i < 0) { target.push(r); continue }

    // Merge sessions per key rather than replacing the round: a session supplied earlier by
    // another source must survive a fetch that doesn't happen to include it.
    const sessions = { ...target[i].sessions }
    for (const [key, rows] of Object.entries(r.sessions)) {
      sessions[key] = mergeSession(sessions[key], rows)
    }

    // ChronoRace's authority is the RESULT — times, ranks, names, gaps, DNF/DSQ. It is the
    // UCI's timing vendor, so it wins those outright, and it demonstrably should: it fixed a
    // duplicated rider row and a set of arithmetically wrong gaps (a rider 41.139s down was
    // stored as +5.108).
    //
    // Round-level calendar metadata is a different matter and is only filled in where
    // missing, never overwritten. ChronoRace derives the round date from the last DHI
    // competition of the weekend, which disagrees with DataRide for Loudenvielle (05-31 vs
    // 05-30), and it names round 1 by its event title ("Race of South Korea") where the site
    // stores the venue ("Mona YongPyong"). Neither is clearly more correct than what is
    // stored, and silently rewriting six round dates and a venue label on an unattended poll
    // is not a call this fetcher should make. See docs/punchlist.md.
    const merged = { ...target[i] }
    for (const [k, v] of Object.entries(r)) {
      if (k === 'sessions' || v == null) continue
      if (merged[k] == null) merged[k] = v
    }
    merged.sessions = sessions
    target[i] = merged
  }

  target.sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  // Nothing actually changed → do not touch the file. Without this the fetcher rewrites
  // lastUpdated on every poll and the results workflow commits every 10 minutes, all race
  // weekend, for no new data.
  if (JSON.stringify(target) === before) {
    console.log('\n✅ nothing new from ChronoRace — no changes written')
    return false
  }

  data.lastUpdated = new Date().toISOString()
  fs.writeFileSync(RESULTS_PATH, JSON.stringify(data, null, 2))
  console.log(`\n✅ merged ${rounds.length} round(s) into public/results.json`)
  return true
}

async function main() {
  const year = process.argv[2]
  if (year && process.argv.includes('--preflight')) { await preflight(year); return }
  if (!year || year.startsWith('--')) {
    console.log('Usage: node scripts/chronorace-fetcher.mjs <year> [--validate|--merge] [--only=slug,slug]')
    process.exit(0)
  }
  const onlyArg = process.argv.find(a => a.startsWith('--only='))
  const only = onlyArg ? onlyArg.slice(7).split(',').map(s => s.trim()).filter(Boolean) : null

  let rounds = await fetchSeason(year, { onLog: s => console.log(s) })
  console.log(`\n${year}: ${rounds.length} round(s) assembled`)
  if (only) {
    const missing = only.filter(s => !rounds.some(r => r.slug === s))
    if (missing.length) {
      console.error(`💥 --only: ChronoRace has no published results for ${missing.join(', ')}`)
      console.error(`   available: ${rounds.map(r => r.slug).join(', ') || '(none)'}`)
      process.exit(1)
    }
    rounds = rounds.filter(r => only.includes(r.slug))
  }

  for (const r of rounds) {
    console.log(`\n── ${r.venue} (${r.slug}) — ${r.date}${r.status ? ` [${r.status}]` : ''} ──`)
    for (const [k, v] of Object.entries(r.sessions)) {
      const podium = v.filter(x => x.rank).slice(0, 3).map(x => `${x.rank}. ${x.name} ${x.time}`).join('   ')
      console.log(`  ${k.padEnd(20)} ${String(v.length).padStart(3)} riders   ${podium}`)
    }
  }

  if (process.argv.includes('--validate')) validate(year, rounds)
  if (process.argv.includes('--merge')) merge(year, rounds)
}

export { fetchSeason, mergeSession, preserveFilled, preflight, preflightReport }
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(e => { console.error('💥', e.message); process.exit(1) })
}

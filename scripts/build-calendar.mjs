#!/usr/bin/env node
/**
 * build-calendar.mjs — emit public/calendar.json for the app's "next round" countdown.
 *
 * WHY A SEPARATE FILE: public/results/ only contains rounds that have already happened, so the
 * app has no way to know a future round exists. The countdown needs the schedule, not results.
 *
 * SOURCE OF TRUTH: CALENDAR_2026 in results-fetcher.mjs, imported rather than copied. Round
 * dates have disagreed across sources before (see docs/punchlist.md), so the countdown reads
 * the same list the fetcher schedules against — if one is wrong they are wrong together, and
 * fixing one fixes both.
 *
 * Run after any calendar edit:  node scripts/build-calendar.mjs
 * Also runs in refresh.yml, so a calendar edit ships without anyone remembering to run it.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { CALENDAR_2026 } from './results-fetcher.mjs'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT  = path.join(ROOT, 'public', 'calendar.json')

const rounds = (CALENDAR_2026 || [])
  .filter(r => r && r.slug && r.date && r.name)
  .map(r => ({ slug: r.slug, name: r.name, date: r.date, round: r.round ?? null }))
  .sort((a, b) => a.date.localeCompare(b.date))

if (!rounds.length) {
  console.error('✗ no rounds in CALENDAR_2026 — refusing to write an empty calendar')
  process.exit(1)
}

const body = JSON.stringify({
  year: String(new Date(rounds[0].date).getUTCFullYear()),
  generatedAt: new Date().toISOString(),
  rounds,
})

// Only rewrite when the content actually changed, ignoring generatedAt — otherwise every
// refresh.yml run would dirty the file and churn a commit twice an hour.
let prev = null
try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')) } catch {}
const same = prev && JSON.stringify(prev.rounds) === JSON.stringify(rounds)
if (same) {
  console.log(`✓ calendar unchanged (${rounds.length} rounds) — not rewriting`)
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, body)
  console.log(`✅ wrote public/calendar.json — ${rounds.length} rounds, ${rounds[0].date} → ${rounds[rounds.length-1].date}`)
}

#!/usr/bin/env node
/**
 * near-miss.mjs
 * Trackwalk — feed items that passed the filter by a thin margin (always-on plan, job 2 / curator)
 *
 *   node scripts/near-miss.mjs              markdown list of near-misses (for the issue / Bryon)
 *   node scripts/near-miss.mjs --json       the same as JSON (for the curator agent)
 *   node scripts/near-miss.mjs --all        every stored item, not just near-misses
 *   node scripts/near-miss.mjs --margin=3   widen the band (default 2)
 *
 * Re-scores every item in public/cache.json with the real scoreItem() and lists the ones that
 * cleared their threshold by <= margin points. Thresholds come from content-filter.js:
 * MIN_SCORE for RSS and trusted YouTube, MIN_SCORE + N for untrusted YouTube, where N is read
 * from filterItems' source so this can't drift from the filter.
 *
 * What it can't see, by construction: items that scored just UNDER the bar. build-cache.js
 * keeps only what filterItems() returns and caps each category at MAX_ITEMS_PER_CATEGORY, so
 * drops and capped-out passes never reach cache.json. The curator's job is "did something bad
 * get in", which is exactly the set cache.json does hold.
 *
 * Read-only. No network. Feed text in the output is untrusted data.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const filter = require(path.join(ROOT, 'scripts/content-filter.js'))
const { scoreItem, filterItems, MIN_SCORE, TRUSTED_SOURCES } = filter

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, ...v] = a.replace(/^--/, '').split('=')
  return [k, v.length ? v.join('=') : true]
}))
const MARGIN = args.margin !== undefined && !isNaN(Number(args.margin)) ? Number(args.margin) : 2

// The untrusted-YouTube offset is inline in filterItems ("MIN_SCORE + 4"), not exported.
const src = fs.readFileSync(path.join(ROOT, 'scripts/content-filter.js'), 'utf8')
const offsetMatch = src.match(/\?\s*MIN_SCORE\s*:\s*MIN_SCORE\s*\+\s*(\d+)/)
if (!offsetMatch) {
  console.error('near-miss: could not find the untrusted-channel threshold in content-filter.js filterItems(). Refusing to guess.')
  process.exit(1)
}
const UNTRUSTED_OFFSET = Number(offsetMatch[1])

function sourceKind(item) {
  if (!item.channelId) return 'rss'
  return TRUSTED_SOURCES.has(item.channelId) ? 'trusted' : 'untrusted'
}
function threshold(kind) { return kind === 'untrusted' ? MIN_SCORE + UNTRUSTED_OFFSET : MIN_SCORE }

const cache = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/cache.json'), 'utf8'))
const items = Object.values(cache.categories || {}).flatMap(c => c.items || [])

const rows = items.map(item => {
  const kind = sourceKind(item)
  const score = scoreItem(item)
  const bar = threshold(kind)
  // Cross-check against filterItems itself, with the date pinned to now so the 30-day
  // recency rule can't make an old-but-fine item look like a filter drop.
  const stillPasses = filterItems([{ ...item, publishedAt: new Date().toISOString() }]).length === 1
  return {
    id: item.id,
    title: item.title,
    channelName: item.channelName || item.source,
    source: kind,
    category: item.category,
    publishedAt: item.publishedAt,
    url: item.url,
    score,
    storedScore: item.score,
    threshold: bar,
    margin: score - bar,
    stillPasses,
  }
})

const drift = rows.filter(r => r.score !== r.storedScore || !r.stillPasses)
const picked = (args.all ? rows : rows.filter(r => r.margin >= 0 && r.margin <= MARGIN))
  .sort((a, b) => a.margin - b.margin || String(a.title).localeCompare(String(b.title)))

const meta = {
  builtAt: cache.builtAt,
  storedItems: rows.length,
  totalItemsAtBuild: cache.totalItems,
  MIN_SCORE,
  untrustedThreshold: MIN_SCORE + UNTRUSTED_OFFSET,
  margin: MARGIN,
  nearMisses: rows.filter(r => r.margin >= 0 && r.margin <= MARGIN).length,
  driftCount: drift.length,
}

if (args.json) {
  console.log(JSON.stringify({ meta, items: picked, drift }, null, 2))
  process.exit(0)
}

// Markdown. Titles are untrusted: strip markup/mention characters before they reach an issue.
const safe = t => String(t ?? '').replace(/[`<>[\]|]/g, '').replace(/@/g, '@​').replace(/\s+/g, ' ').trim()

const out = []
out.push(`**Near-miss list**: ${meta.nearMisses} of ${rows.length} stored items cleared their bar by ${MARGIN} points or less.`)
out.push(`Bars from \`content-filter.js\`: RSS and trusted YouTube ${MIN_SCORE}, untrusted YouTube ${MIN_SCORE + UNTRUSTED_OFFSET}. Cache built ${cache.builtAt}.`)
out.push('')
if (picked.length) {
  out.push('| Margin | Score / bar | Source | Category | Channel | Title |')
  out.push('|---:|---|---|---|---|---|')
  for (const r of picked) {
    // Only http(s) links, and only the characters that would break the markdown link escaped.
    const url = /^https?:\/\//i.test(r.url || '') ? r.url.replace(/[()\s<>|]/g, encodeURIComponent) : null
    const title = url ? `[${safe(r.title).slice(0, 90)}](${url})` : safe(r.title).slice(0, 90)
    out.push(`| +${r.margin} | ${r.score} / ${r.threshold} | ${r.source} | ${safe(r.category)} | ${safe(r.channelName)} | ${title} |`)
  }
} else {
  out.push('_None._')
}
if (drift.length) {
  out.push('')
  out.push(`**Filter drift**: ${drift.length} item(s) score differently from when the cache was built, so the filter changed since. Rebuild the cache.`)
  for (const r of drift) out.push(`- ${safe(r.title).slice(0, 90)}: stored ${r.storedScore}, now ${r.score}${r.stillPasses ? '' : ', **would now drop**'}`)
}
console.log(out.join('\n'))

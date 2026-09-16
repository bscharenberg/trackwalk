/**
 * build-cache.js
 * Trackwalk — orchestrates the full content pipeline
 *
 * Run manually:  node scripts/build-cache.js
 * Run via CI:    triggered by GitHub Actions on a schedule
 *
 * Flow:
 *   1. Fetch YouTube uploads from all channels
 *   2. Fetch RSS feeds
 *   3. Merge and deduplicate
 *   4. Score and filter through content-filter.js
 *   5. Group by category
 *   6. Write public/cache.json
 */

require('dotenv').config()
const fs   = require('fs')
const path = require('path')

const { fetchYouTube } = require('./youtube-fetcher')
const { fetchRSS }     = require('./rss-fetcher')
const { filterItems, groupByCategory } = require('./content-filter')

// ─── Config ───────────────────────────────────────────────────────────────────

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'cache.json')
const MAX_ITEMS_PER_CATEGORY = 20   // cap per category so the feed doesn't bloat

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Deduplicate items by id — YouTube and RSS occasionally surface the same
 * content (e.g. Pinkbike posts YouTube embeds in their RSS feed)
 */
function deduplicate(items) {
  const seen = new Set()
  return items.filter(item => {
    const key = item.id || item.url || item.title
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Cap each category to MAX_ITEMS_PER_CATEGORY.
 * Sort by publishedAt newest-first so freshest content always appears at top.
 */
function capCategories(grouped) {
  const capped = {}
  for (const [key, cat] of Object.entries(grouped)) {
    const sorted = [...cat.items].sort((a, b) => {
      const da = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const db = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      return db - da   // newest first
    })
    capped[key] = {
      ...cat,
      items: sorted.slice(0, MAX_ITEMS_PER_CATEGORY),
    }
  }
  return capped
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function buildCache() {
  console.log('\n🚵 Trackwalk cache build starting...\n')
  const startTime = Date.now()

  // 1. Fetch all sources
  console.log('📺 YouTube:')
  const youtubeItems = await fetchYouTube()

  console.log('\n📰 RSS:')
  const rssItems = await fetchRSS()

  // 2. Merge
  const allItems = [...youtubeItems, ...rssItems]
  console.log(`\n📦 Total raw items: ${allItems.length}`)

  // 3. Deduplicate
  const unique = deduplicate(allItems)
  console.log(`🔍 After dedup: ${unique.length} items`)

  // 4. Filter and score
  const filtered = filterItems(unique)
  console.log(`✅ After filter: ${filtered.length} items passed`)

  // Safety guard: a source outage (YouTube quota exhausted, RSS proxy down) makes the
  // fetchers return [] silently, which would otherwise write an empty cache.json and
  // blank the live feed for up to an hour. Refuse to overwrite when the yield is
  // implausibly low. Threshold is intentionally low (< 10) to survive inter-round gaps
  // (6+ weeks between some rounds) where the 30-day recency window has no race content
  // to show — the real outage signal is approaching 0, not 18.
  if (filtered.length < 10) {
    console.error(`\n💥 Only ${filtered.length} items passed — refusing to overwrite cache.json (likely a source outage). Existing cache left untouched.`)
    process.exit(1)
  }

  // 5. Group by category
  const grouped = groupByCategory(filtered)
  const capped  = capCategories(grouped)

  // 6. Build the cache object
  const cache = {
    builtAt:    new Date().toISOString(),
    totalItems: filtered.length,
    categories: capped,
  }

  // 7. Ensure public/ directory exists
  const publicDir = path.join(__dirname, '..', 'public')
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
  }

  // 8. Write cache.json
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(cache, null, 2))

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n🏁 Done in ${elapsed}s — wrote ${OUTPUT_PATH}`)

  // 9. Print category summary
  console.log('\nCategory summary:')
  for (const [key, cat] of Object.entries(capped)) {
    console.log(`  ${cat.label}: ${cat.items.length} items`)
  }
  console.log()
}

buildCache().catch(err => {
  console.error('\n💥 Build failed:', err.message)
  process.exit(1)
})

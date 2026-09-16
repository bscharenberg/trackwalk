/**
 * test-filter.js
 * Run with: node scripts/test-filter.js
 *
 * Tests the content filter against realistic fake items.
 * No API key needed — pure offline testing.
 */

const { scoreItem, filterItems, groupByCategory, isRecent } = require('./content-filter')

// Helper — returns an ISO date string N days ago
function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

// ─── Fake items ───────────────────────────────────────────────────────────────

const TEST_ITEMS = [
  // Should PASS — high confidence race content, recent
  {
    id: '1',
    title: 'GoPro: Jackson Goldstone Winning Run — Leogang DH World Cup 2025',
    description: 'Shot 100% on GoPro. Jackson Goldstone takes the win at the UCI DH World Cup in Leogang.',
    channelId: 'UCqhnX4jA0A5paNd1v-zEysw',
    publishedAt: daysAgo(3),
    source: 'youtube',
  },
  {
    id: '2',
    title: 'Inside The Tape with Ben Cathro — Val di Sole World Cup DH',
    description: 'Ben Cathro breaks down the Black Snake section and ghosted run comparisons from Val di Sole.',
    channelId: 'UC2GIHZpQiJy-8286f4lj_cg',
    publishedAt: daysAgo(5),
    source: 'youtube',
  },
  {
    id: '3',
    title: 'SLEEPER — AON Racing Season Opener',
    description: 'Reece Wilson and the AON Racing team head to Fort William for round one.',
    channelId: 'UCuuLS5B9JraqXiKfYPIBNEw',
    publishedAt: daysAgo(7),
    source: 'youtube',
  },
  {
    id: '4',
    title: 'WynTV: Post-Race Interviews — Loudenvielle DH World Cup',
    description: 'Wyn Masters catches riders in the finish corral after an insane day of racing.',
    channelId: 'UC2GIHZpQiJy-8286f4lj_cg',
    publishedAt: daysAgo(2),
    source: 'youtube',
  },
  {
    id: '5',
    title: 'Vital RAW — Elite Men Qualifying Leogang 2025',
    description: 'Raw unedited qualifying runs from the elite men at the 2025 Leogang DH World Cup.',
    channelId: 'UCcX5xwMOCt92bi0dmspMFQw',
    publishedAt: daysAgo(4),
    source: 'youtube',
  },
  {
    id: '6',
    title: 'Enduro World Cup Round 2 — Les Gets Full Highlights',
    description: 'All the action from the EWS enduro World Cup in Les Gets. Podium, results and stage wins.',
    channelId: 'UCWS4nfoou79mwo9nHew49fA',
    publishedAt: daysAgo(6),
    source: 'youtube',
  },
  {
    id: '7',
    title: 'Jack Moir Moi Moi TV — Race Day Leogang Enduro World Cup',
    description: 'Behind the scenes on race day at the Leogang enduro World Cup.',
    channelId: 'UCd77cWCYmO6alSLXXRHMoqw',
    publishedAt: daysAgo(8),
    source: 'youtube',
  },
  {
    id: '8',
    title: 'Pinkbike: 2025 Fort William DH World Cup Results — Who Won?',
    description: 'Full results and podium from the Fort William downhill World Cup.',
    channelId: null,   // real Pinkbike RSS items have no channelId (RSS threshold = MIN_SCORE)
    publishedAt: daysAgo(1),
    source: 'rss',
  },
  {
    id: '9',
    title: 'Bernard Kerr — Race Week at Champery World Champs',
    description: 'BK takes us through the week at World Championships in Champery.',
    channelId: 'UCOYc6SI_fVrNvoutot7D9IA',
    publishedAt: daysAgo(10),
    source: 'youtube',
  },
  {
    id: '10',
    title: 'Downtime Podcast — Loic Bruni on the 2025 Season',
    description: 'Six-time world champion Loic Bruni sits down with Chris Hall to talk through the season.',
    channelId: 'youtube.com/c/DowntimeMountainBikePodcast',
    publishedAt: daysAgo(9),
    source: 'podcast',
  },

  // Should FAIL — noise
  {
    id: '11',
    title: 'Best Budget MTB Helmets 2025 — Buyer\'s Guide',
    description: 'We test and review the best budget mountain bike helmets for trail and enduro riding.',
    channelId: 'UC2GIHZpQiJy-8286f4lj_cg',
    publishedAt: daysAgo(3),
    source: 'rss',
  },
  {
    id: '12',
    title: 'Commencal — 2025 Winter Ski Edit',
    description: 'The Commencal ski and snowboard team shreds the Alps.',
    channelId: 'UCPUGv78-mvU6gaFBgjY67vA',
    publishedAt: daysAgo(5),
    source: 'youtube',
  },
  {
    id: '13',
    title: 'My Morning Routine as a Pro MTB Rider',
    description: 'Day in my life vlog — training, coffee, trail ride and recovery.',
    channelId: 'UCd77cWCYmO6alSLXXRHMoqw',
    publishedAt: daysAgo(4),
    source: 'youtube',
  },
  {
    id: '14',
    title: 'XCO World Cup Highlights — Cross Country Racing',
    description: 'Full highlights from the XCO cross country World Cup.',
    channelId: 'UCWS4nfoou79mwo9nHew49fA',
    publishedAt: daysAgo(2),
    source: 'youtube',
  },
  {
    id: '15',
    title: 'First Look: New Specialized Demo 2026 — Hands On Review',
    description: 'We get our hands on the new Specialized Demo downhill bike.',
    channelId: 'UCcrBtxD8xy2cxeXM7f-xihA',
    publishedAt: daysAgo(6),
    source: 'youtube',
  },

  // Should FAIL — too old (stale content)
  {
    id: '16',
    title: 'Leogang DH World Cup Finals — Full Race Highlights',
    description: 'All the action from the Leogang downhill World Cup finals.',
    channelId: 'UCWS4nfoou79mwo9nHew49fA',
    publishedAt: daysAgo(45),   // 45 days old — outside the 30-day window
    source: 'youtube',
  },
]

// ─── Run the tests ────────────────────────────────────────────────────────────

console.log('─────────────────────────────────────────')
console.log('  Trackwalk content filter — test run')
console.log('─────────────────────────────────────────\n')

// Source of truth for PASS/DROP is filterItems itself, which applies the real tiered
// threshold (RSS + trusted YT ≥ MIN_SCORE=6; untrusted YT ≥ 10) — not a flat cutoff.
const filtered = filterItems(TEST_ITEMS)
const passIds  = new Set(filtered.map(i => i.id))
const grouped  = groupByCategory(filtered)

console.log('INDIVIDUAL SCORES:\n')
for (const item of TEST_ITEMS) {
  const score = scoreItem(item)
  let status
  if (!isRecent(item))            status = '📅 STALE'
  else if (passIds.has(item.id))  status = '✅ PASS '
  else                            status = '❌ DROP '
  console.log(`${status}  [${String(score).padStart(3)}]  ${item.title.slice(0, 60)}`)
}

console.log('\n─────────────────────────────────────────')
console.log(`RESULTS: ${filtered.length} of ${TEST_ITEMS.length} items passed\n`)

for (const [catId, cat] of Object.entries(grouped)) {
  console.log(`📂 ${cat.label.toUpperCase()} (${cat.items.length} items)`)
  for (const item of cat.items) {
    console.log(`   [${item.score}] ${item.title.slice(0, 65)}`)
  }
  console.log()
}

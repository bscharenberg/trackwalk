/**
 * youtube-fetcher.js
 * Trackwalk — fetches recent videos from YouTube channels
 *
 * Uses the uploads playlist approach (playlistItems.list) instead of
 * search.list — costs 1 API unit per channel vs 100 for search.
 */

require('dotenv').config()

const API_KEY = process.env.YOUTUBE_API_KEY
const BASE    = 'https://www.googleapis.com/youtube/v3'

// ─── Channel list ─────────────────────────────────────────────────────────────

const CHANNELS = [
  // Core race coverage
  { id: 'UCWS4nfoou79mwo9nHew49fA', name: 'UCI MTB World Series' },
  { id: 'UC2GIHZpQiJy-8286f4lj_cg', name: 'Pinkbike' },
  { id: 'UCcX5xwMOCt92bi0dmspMFQw', name: 'Vital MTB' },

  // Paddock / rider content
  { id: 'UCtvJR7iamL8WFAbvpsC2HTw', name: 'WynTV' },
  { id: 'UCuuLS5B9JraqXiKfYPIBNEw', name: 'Sleeper Collective' },
  { id: 'UCOYc6SI_fVrNvoutot7D9IA', name: 'Bernard Kerr' },

  // Factory teams
  { id: 'UCCb8I3PHEUFPV0Jds0-_eig', name: 'Santa Cruz Syndicate' },
  { id: 'UCPUGv78-mvU6gaFBgjY67vA', name: 'Commencal' },

  // Sponsors / brands
  { id: 'UCN_B2-bdBtmAq-5TOEU63nQ', name: 'Fox Factory' },
  { id: 'UCiCWNsaEx9swRaCe55XMAuw', name: 'Frameworks Bicycles' },

  // Broad MTB / action sports
  { id: 'UCXqlds5f7B2OOs9vQuevl4A', name: 'Red Bull Bike' },
  { id: 'UC-oqtSrbAwCIB98RZfsdreA', name: 'GoPro Bike' },

  // Podcasts / long-form
  { id: 'UCgwpS_N4DQDYsip73rsQ6iA', name: 'Downtime Podcast' },
  { id: 'UCUjYvTWqwm7x6LU8uGLvdxQ', name: 'Just Ride' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uploadsPlaylistId(channelId) {
  return 'UU' + channelId.slice(2)
}

// Batch-fetch video durations via videos.list (1 API unit per 50 videos).
// Used to detect UCI Shorts — the playlistItems API always returns landscape
// maxresdefault thumbnails regardless of whether the video is a Short.
async function fetchVideoDurations(videoIds) {
  const durations = {}
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch  = videoIds.slice(i, i + 50)
    const params = new URLSearchParams({ part: 'contentDetails', id: batch.join(','), key: API_KEY })
    try {
      const res  = await fetch(`${BASE}/videos?${params}`)
      if (!res.ok) continue
      const data = await res.json()
      for (const item of (data.items || [])) {
        durations[item.id] = item.contentDetails?.duration || null
      }
    } catch (e) { /* ignore — non-fatal */ }
    await new Promise(r => setTimeout(r, 200))
  }
  return durations
}

function isShortDuration(isoDuration, channelId) {
  // ISO 8601: PT30S, PT1M, PT1M30S
  // UCI channel uses vertical-format social clips up to ~3 min — raise threshold.
  // All other channels: standard 60 s YouTube Shorts limit.
  if (!isoDuration) return false
  const m = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return false
  const total = (parseInt(m[1] || 0) * 3600)
              + (parseInt(m[2] || 0) * 60)
              +  parseInt(m[3] || 0)
  const threshold = channelId === 'UCWS4nfoou79mwo9nHew49fA' ? 180 : 60
  return total > 0 && total <= threshold
}

async function fetchPlaylistPage(playlistId, pageToken = null) {
  const params = new URLSearchParams({
    part:       'snippet',
    playlistId,
    maxResults: 50,
    key:        API_KEY,
  })
  if (pageToken) params.set('pageToken', pageToken)

  const url = `${BASE}/playlistItems?${params}`
  const res = await fetch(url)

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`${err.error?.code} ${err.error?.message}`)
  }

  return res.json()
}

// Fetch multiple pages for high-volume channels.
// UCI posts XCO shorts constantly which pushes DHI highlights off page 1.
// 3 pages = up to 150 videos, enough to always reach DHI content.
async function fetchPlaylistPages(playlistId, maxPages = 1) {
  const allItems = []
  let pageToken = null

  for (let page = 0; page < maxPages; page++) {
    const data = await fetchPlaylistPage(playlistId, pageToken)
    allItems.push(...(data.items || []))
    pageToken = data.nextPageToken
    if (!pageToken) break   // no more pages
    await new Promise(r => setTimeout(r, 200))
  }

  return { items: allItems }
}

function normaliseItem(snippet, channelId, channelName) {
  const thumb = snippet.thumbnails?.maxres
    || snippet.thumbnails?.standard
    || snippet.thumbnails?.high
    || snippet.thumbnails?.medium
    || null

  return {
    id:          snippet.resourceId?.videoId || null,
    type:        'video',
    source:      'youtube',
    channelId,
    channelName,
    title:       snippet.title || '',
    description: snippet.description || '',
    thumbnail:       thumb?.url    || null,
    thumbnailWidth:  thumb?.width  || null,
    thumbnailHeight: thumb?.height || null,
    publishedAt: snippet.publishedAt || null,
    url:         snippet.resourceId?.videoId
                   ? `https://www.youtube.com/watch?v=${snippet.resourceId.videoId}`
                   : null,
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function fetchYouTube() {
  if (!API_KEY) throw new Error('YOUTUBE_API_KEY is not set in .env')

  const allItems = []

  for (const channel of CHANNELS) {
    try {
      console.log(`  Fetching ${channel.name}...`)
      const playlistId = uploadsPlaylistId(channel.id)
      // UCI posts XCO shorts heavily — paginate 3 pages to reach DHI highlights
      const maxPages = channel.id === 'UCWS4nfoou79mwo9nHew49fA' ? 3 : 1
      const data = await fetchPlaylistPages(playlistId, maxPages)

      let items = (data.items || [])
        .map(item => normaliseItem(item.snippet, channel.id, channel.name))
        .filter(i =>
          i.id &&
          i.title !== '[Private video]' &&
          i.title !== '[Deleted video]'
        )

      // Fetch durations for all channels to identify Shorts (≤60 s).
      // YouTube always returns landscape maxresdefault thumbnails regardless of
      // video orientation, so aspect ratio alone cannot detect Shorts reliably.
      // Cost: 1 API unit per 50 videos — negligible vs the 10k daily quota.
      {
        const ids       = items.map(i => i.id).filter(Boolean)
        const durations = await fetchVideoDurations(ids)
        let shortCount  = 0
        items = items.map(item => {
          const short = item.id ? isShortDuration(durations[item.id], item.channelId) : false
          if (short) shortCount++
          return { ...item, isShort: short }
        })
        if (shortCount > 0) console.log(`    → ${shortCount} Shorts (≤60 s / UCI ≤180 s)`)
      }

      console.log(`    → ${items.length} videos`)
      allItems.push(...items)

      // Small delay between channels — be a good API citizen
      await new Promise(r => setTimeout(r, 200))

    } catch (err) {
      console.error(`  ✗ Failed to fetch ${channel.name}: ${err.message}`)
    }
  }

  console.log(`  YouTube total: ${allItems.length} raw videos`)
  return allItems
}

module.exports = { fetchYouTube }

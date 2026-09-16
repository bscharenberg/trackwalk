/**
 * debug-rss.js
 * Run with: node scripts/debug-rss.js
 * Dumps the raw parsed XML structure so we can see exactly what xml2js returns
 */

require('dotenv').config()
const xml2js = require('xml2js')

const PROXY = process.env.PINKBIKE_PROXY || 'https://helltrack-rss.scharenbergs.workers.dev'
const URL   = `${PROXY}/?url=https://www.pinkbike.com/pinkbike_xml_feed.php`

async function debug() {
  console.log('Fetching...')
  const res = await fetch(URL, { headers: { 'User-Agent': 'Trackwalk/1.0' } })
  const xml = await res.text()

  console.log('\nFirst 300 chars of XML:')
  console.log(xml.slice(0, 300))

  const parser = new xml2js.Parser({
    explicitArray: false,
    ignoreAttrs:   false,
    strict:        false,
  })

  const result = await parser.parseStringPromise(xml)

  console.log('\nTop-level keys:', Object.keys(result))
  console.log('Second-level keys:', Object.keys(result[Object.keys(result)[0]] || {}))

  const top = result[Object.keys(result)[0]]
  const second = top[Object.keys(top)[0]]
  console.log('Third-level keys:', Object.keys(second || {}))

  // Try to find items
  const channel = top.channel || top[Object.keys(top)[0]]
  console.log('\nChannel keys:', Object.keys(channel || {}))

  const items = channel?.item
  console.log('\nItems type:', typeof items, Array.isArray(items) ? `(array of ${items.length})` : '')
  if (items) {
    const first = Array.isArray(items) ? items[0] : items
    console.log('\nFirst item keys:', Object.keys(first || {}))
    console.log('First item title:', first?.title)
    console.log('First item link:', first?.link)
  }
}

debug().catch(console.error)

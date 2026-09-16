/**
 * helltrack-results Worker v4
 * Returns all PDF URLs from the results page.
 * Label extraction happens server-side by reading PDF content IDs.
 * Filtering by discipline happens in GitHub Actions PDF parser.
 */

import puppeteer from '@cloudflare/puppeteer'

const CALENDARS = {
  '2024': [
    { slug: 'fort-william-2024',        name: 'Fort William',     date: '2024-05-05' },
    { slug: 'bielsko-biala-2024',        name: 'Bielsko-Biala',    date: '2024-05-19' },
    { slug: 'leogang-2024',              name: 'Leogang',          date: '2024-06-09' },
    { slug: 'val-di-sole-2024',          name: 'Val di Sole',      date: '2024-06-15' },
    { slug: 'les-gets-2024',             name: 'Les Gets',         date: '2024-07-06' },
    { slug: 'loudenvielle-2024',         name: 'Loudenvielle',     date: '2024-09-08' },
    { slug: 'mont-sainte-anne-2024',     name: 'Mont-Sainte-Anne', date: '2024-10-05' },
  ],
  '2025': [
    { slug: 'bielsko-biala-szczyrk-2025',             name: 'Bielsko-Biala',    date: '2025-05-18' },
    { slug: 'loudenvielle-2025',                      name: 'Loudenvielle',     date: '2025-06-01' },
    { slug: 'saalfelden-leogang-salzburgerland-2025', name: 'Leogang',          date: '2025-06-07' },
    { slug: 'val-di-sole-trentino-2025',              name: 'Val di Sole',      date: '2025-06-21' },
    { slug: 'la-thuile-valle-d-aosta-2025',           name: 'La Thuile',        date: '2025-07-06' },
    { slug: 'pal-arinsal-2025',                       name: 'Pal Arinsal',      date: '2025-07-12' },
    { slug: 'haute-savoie-2025',                      name: 'Les Gets',         date: '2025-08-30' },
    { slug: 'lenzerheide-2025',                       name: 'Lenzerheide',      date: '2025-09-20' },
    { slug: 'lake-placid-2025',                       name: 'Lake Placid',      date: '2025-10-04' },
    { slug: 'mont-sainte-anne-2025',                  name: 'Mont-Sainte-Anne', date: '2025-10-11' },
  ],
  '2026': [
    { slug: 'race-of-south-korea-2026', name: 'Mona YongPyong',   date: '2026-05-01' },
    { slug: 'loudenvielle-2026',         name: 'Loudenvielle',     date: '2026-05-28' },
    { slug: 'leogang-2026',              name: 'Leogang',          date: '2026-06-11' },
    { slug: 'lenzerheide-2026',          name: 'Lenzerheide',      date: '2026-06-19' },
    { slug: 'la-thuile-2026',            name: 'La Thuile',        date: '2026-07-03' },
    { slug: 'pal-arinsal-2026',          name: 'Pal Arinsal',      date: '2026-07-09' },
    { slug: 'les-gets-2026',             name: 'Les Gets',         date: '2026-08-20' },
    { slug: 'val-di-sole-2026',          name: 'Val di Sole',      date: '2026-08-26' },
    { slug: 'whistler-2026',             name: 'Whistler',         date: '2026-09-25' },
    { slug: 'lake-placid-2026',          name: 'Lake Placid',      date: '2026-10-02' },
  ],
}

// Auto-detect year from slug suffix (e.g. 'bielsko-biala-2024' → '2024')
function detectYear(slug) {
  const m = slug.match(/-(\d{4})$/)
  return m ? m[1] : '2026'
}

function getVenue(slug) {
  const year = detectYear(slug)
  return CALENDARS[year]?.find(r => r.slug === slug)
}

export default {
  async fetch(request, env, ctx) {

    // --- Auth: require secret token from caller ---
    const authHeader = request.headers.get('X-Helltrack-Token') || ''
    if (!env.HELLTRACK_TOKEN || authHeader !== env.HELLTRACK_TOKEN) {
      return new Response('Unauthorized', { status: 401 })
    }
    // --- End auth ---

    const url = new URL(request.url)
    const venueSlug = url.searchParams.get('venue')

    if (!venueSlug) {
      return Response.json({
        calendars: CALENDARS,
        usage: 'GET /?venue=bielsko-biala-2024',
      }, { headers: { 'Access-Control-Allow-Origin': '*' } })
    }

    const venue = getVenue(venueSlug)
    const year  = detectYear(venueSlug)
    let browser = null

    try {
      browser = await puppeteer.launch(env.MYBROWSER)
      const page = await browser.newPage()

      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')

      const uciSlug  = venueSlug.replace(/-\d{4}$/, '')
      const pageUrl  = `https://www.ucimtbworldseries.com/results/${year}/${uciSlug}`
      await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 25000 })
      // PDFs on newer pages: assets.ucimtbworldseries.com
      // PDFs on older pages (2024 and earlier): ucimtbworldseries.com/content/
      // Wait for either, fall back gracefully if neither found in time
      try {
        await Promise.race([
          page.waitForSelector('a[href*="assets.ucimtbworldseries.com"]', { timeout: 10000 }),
          page.waitForSelector('a[href*="ucimtbworldseries.com/content/"]', { timeout: 10000 }),
        ])
      } catch (e) {
        console.log('Selector timeout — proceeding anyway')
      }

      // Get all PDF URLs — labels will be read from PDF content by the parser
      const pdfUrls = await page.evaluate(() => {
        const anchors = document.querySelectorAll('a[href*=".pdf"]')
        return Array.from(anchors).map(a => a.href)
      })

      await page.close()
      console.log(`Found ${pdfUrls.length} PDF URLs`)

      return Response.json({
        venue: venue?.name || venueSlug,
        slug: venueSlug,
        date: venue?.date || null,
        fetchedAt: new Date().toISOString(),
        pdfUrls,
      }, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=1800',
        }
      })

    } catch (err) {
      console.error('Error:', err.message)
      return Response.json({ error: err.message }, {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*' }
      })
    } finally {
      if (browser) await browser.close()
    }
  }
}

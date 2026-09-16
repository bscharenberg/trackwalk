/**
 * build-riders.js
 * Trackwalk — builds public/riders.json from scripts/riders.csv
 *
 * Usage:
 *   node scripts/build-riders.js
 *
 * Source of truth: scripts/riders.csv
 * Output:          public/riders.json
 *
 * CSV format: category,name,nat,instagram
 *   category  — Men or Women
 *   name      — ALL CAPS surname + given name (e.g. "BRUNI Loic")
 *   nat       — 3-letter IOC country code (e.g. "FRA")
 *   instagram — full Instagram URL or empty
 */

const fs   = require('fs')
const path = require('path')

// ─── Nation → flag emoji ──────────────────────────────────────────────────────

const NAT_FLAGS = {
  AND:'🇦🇩', ARG:'🇦🇷', AUS:'🇦🇺', AUT:'🇦🇹', BEL:'🇧🇪', BRA:'🇧🇷',
  CAN:'🇨🇦', CHE:'🇨🇭', CHI:'🇨🇱', COL:'🇨🇴', CRC:'🇨🇷', CZE:'🇨🇿',
  DEU:'🇩🇪', ESP:'🇪🇸', FIN:'🇫🇮', FRA:'🇫🇷', GBR:'🇬🇧', GEO:'🇬🇪',
  GER:'🇩🇪', HUN:'🇭🇺', IRL:'🇮🇪', ISR:'🇮🇱', ITA:'🇮🇹', JPN:'🇯🇵',
  LUX:'🇱🇺', MEX:'🇲🇽', NLD:'🇳🇱', NOR:'🇳🇴', NZL:'🇳🇿', POL:'🇵🇱',
  PRT:'🇵🇹', ROU:'🇷🇴', RSA:'🇿🇦', SRB:'🇷🇸', SUI:'🇨🇭', SVK:'🇸🇰',
  SVN:'🇸🇮', SLO:'🇸🇮', SWE:'🇸🇪', TUR:'🇹🇷', URU:'🇺🇾', USA:'🇺🇸',
  ZAF:'🇿🇦',
  // IOC codes present in riders.csv that differ from the ISO-3166 alpha-3 codes above
  POR:'🇵🇹', NED:'🇳🇱', DEN:'🇩🇰', VEN:'🇻🇪', INA:'🇮🇩',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Format name from "BRUNI Loic" → "Loic Bruni" (given-first, matches the Results tab).
 * CSV is "SURNAME(S) Given...", surnames arriving ALL-CAPS. Move the caps tokens to the
 * end and display-case them, so both "BRUNI Loic" and "A'HERN Kye" come out right.
 */
function isCapsToken(w) {
  return /\p{L}/u.test(w) && w === w.toLocaleUpperCase()
}
// Display-case a caps token, respecting hyphen/apostrophe subparts:
//   "BRUNI"→"Bruni", "A'HERN"→"A'Hern", "MEIER-SMITH"→"Meier-Smith"
function caseToken(w) {
  return w.replace(/\p{L}+/gu, s => s.charAt(0).toLocaleUpperCase() + s.slice(1).toLocaleLowerCase())
}
function formatName(raw) {
  const toks = raw.trim().split(/\s+/).filter(Boolean)
  if (!toks.length) return ''
  const surname = toks.filter(isCapsToken)
  const given   = toks.filter(w => !isCapsToken(w))
  // Given-first when we can tell them apart; otherwise keep source order, just re-case.
  const parts = (surname.length && given.length)
    ? [...given, ...surname.map(caseToken)]
    : toks.map(w => isCapsToken(w) ? caseToken(w) : w)
  return parts.join(' ')
}

// Surname sort key — the roster still reads like a phone book even though display is given-first.
function surnameKey(raw) {
  const toks = raw.trim().split(/\s+/).filter(Boolean)
  const caps = toks.filter(isCapsToken)
  return (caps.length ? caps : toks).join(' ').toLocaleLowerCase()
}

/**
 * Parse a minimal CSV (no quoted fields needed for this data).
 */
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.split(',')
    const row = {}
    headers.forEach((h, i) => { row[h] = (values[i] || '').trim() })
    return row
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function buildRiders() {
  const csvPath  = path.join(__dirname, 'riders.csv')
  const outPath  = path.join(__dirname, '..', 'public', 'riders.json')

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Not found: ${csvPath}`)
    process.exit(1)
  }

  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'))
  console.log(`📋 Read ${rows.length} rows from riders.csv`)

  // Deduplicate by name (case-insensitive)
  const seen = new Set()
  const unique = rows.filter(r => {
    const key = r.name?.toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (unique.length < rows.length) {
    console.log(`  Removed ${rows.length - unique.length} duplicate(s)`)
  }

  const men   = []
  const women = []

  for (const r of unique) {
    const nat  = (r.nat || '').toUpperCase()
    const ig   = r.instagram || ''
    // Only include valid Instagram URLs — skip empty or non-URLs
    const instagram = ig.startsWith('https://www.instagram.com/') ? ig : null

    const rider = {
      name:      formatName(r.name || ''),
      nat,
      flag:      NAT_FLAGS[nat] || '',
      instagram,
      _sort:     surnameKey(r.name || ''),
    }

    if (r.category === 'Women') women.push(rider)
    else men.push(rider)
  }

  // Sort by surname (display is given-first, e.g. "Loic Bruni"), then full name for stability.
  const bySurname = (a, b) => a._sort.localeCompare(b._sort) || a.name.localeCompare(b.name)
  men.sort(bySurname)
  women.sort(bySurname)

  // Strip the temporary sort key so the JSON shape stays { name, nat, flag, instagram }.
  const strip = ({ _sort, ...rider }) => rider
  const output = { men: men.map(strip), women: women.map(strip) }
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8')

  console.log(`✅ Wrote ${outPath}`)
  console.log(`   Men: ${men.length} | Women: ${women.length}`)
}

buildRiders()

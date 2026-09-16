/**
 * canon.mjs — Trackwalk name + venue canonicalization (shared across all result sources)
 *
 * THE PROBLEM this solves:
 *   Different sources spell the same rider differently and in different word orders:
 *     - DataRide / riders.csv:  "BROSNAN Troy"      (SURNAME Given, surname ALL-CAPS)
 *     - UCI World Series API:   "Thibaut DAPRELA"   (Given SURNAME, surname ALL-CAPS)
 *     - Our 2026 stored data:   "Luca Shaw"         (Given Surname, already display-cased)
 *   Standings + (future) rider search key on the name string, so these MUST converge or a
 *   rider's history fragments. Canonical target = "Given Surname" in display title-case.
 *
 * STRATEGY:
 *   1. Explicit alias map wins (scripts/canon/riders-aliases.json) — for accents, particles,
 *      apostrophe casing, spelling changes across years, anything the algorithm gets wrong.
 *   2. Otherwise: classify tokens by case. ALL-CAPS tokens = family name, mixed-case = given.
 *      Reorder to "given family" and apply display casing. This is order-independent, so it
 *      handles both "BROSNAN Troy" and "Thibaut DAPRELA" correctly.
 *   3. If a name has no ALL-CAPS token (e.g. "Luca Shaw") it's already in display form — keep
 *      order, just re-case. If ALL tokens are caps it's ambiguous — flagged via wasAmbiguous.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Load canon data ────────────────────────────────────────────────────────
function loadJson(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'canon', rel), 'utf8')) }
  catch { return fallback }
}
// riders-aliases.json: { "raw or variant (any case)": "Canonical Display Name" }
const RIDER_ALIASES = loadJson('riders-aliases.json', {})
// venues.json: { "matchkey": { "name": "...", "slug": "...", "country": "XXX" } }
const VENUES = loadJson('venues.json', {})

// Pre-index aliases by a loose key (lowercased, whitespace-collapsed) for robust matching.
const ALIAS_INDEX = new Map()
for (const [k, v] of Object.entries(RIDER_ALIASES)) ALIAS_INDEX.set(looseKey(k), v)

// ─── Helpers ────────────────────────────────────────────────────────────────
function looseKey(s) {
  return (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase()
}

// Is a token an ALL-CAPS family-name token? True when it contains cased letters and has no
// lowercase letters. Accent-aware (DÉPREZ, STRAUß). Punctuation (A'HERN, JEAN-LUC) is allowed.
function isUpperToken(tok) {
  const letters = tok.replace(/[^\p{L}]/gu, '')
  if (!letters) return false
  return letters === letters.toLocaleUpperCase() && letters !== letters.toLocaleLowerCase()
}

// Display-case one token: capitalize the first letter of each apostrophe/hyphen subpart.
// "BROSNAN"->"Brosnan", "A'HERN"->"A'Hern", "JEAN-BAPTISTE"->"Jean-Baptiste", "daprela"->"Daprela"
function caseToken(tok) {
  return tok.replace(/[\p{L}]+/gu, (w, off, full) => {
    // Don't capitalize after an apostrophe when the leading part is a known lowercase particle
    // (handled via aliases instead); default: capitalize each alpha run.
    return w.charAt(0).toLocaleUpperCase() + w.slice(1).toLocaleLowerCase()
  })
}

// Lowercase nobiliary particles when they sit between given and family (e.g. "van der", "de").
// Kept conservative; only applied to interior particles, never the first word.
const PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'di', 'da', 'del', 'della', 'la', 'le', 'du', 'dos', 'das', "d'", 'ter'])

/**
 * canonName(raw) → { name, family, given, wasAmbiguous, viaAlias }
 *   name: canonical "Given Family" display string (use this everywhere).
 */
export function canonName(raw) {
  const cleaned = (raw || '').toString().trim().replace(/\s+/g, ' ')
  if (!cleaned) return { name: '', family: '', given: '', wasAmbiguous: false, viaAlias: false }

  // 1. Alias override (exact loose match)
  const aliased = ALIAS_INDEX.get(looseKey(cleaned))
  if (aliased) {
    const parts = aliased.split(' ')
    return { name: aliased, given: parts[0] || '', family: parts.slice(1).join(' '), wasAmbiguous: false, viaAlias: true }
  }

  const tokens = cleaned.split(' ')
  const upperFlags = tokens.map(isUpperToken)
  const upperCount = upperFlags.filter(Boolean).length

  let givenToks, familyToks, wasAmbiguous = false

  if (upperCount > 0 && upperCount < tokens.length) {
    // Mixed case → CAPS tokens are the family name, the rest is given. Order-independent.
    familyToks = tokens.filter((_, i) => upperFlags[i])
    givenToks  = tokens.filter((_, i) => !upperFlags[i])
  } else if (upperCount === 0) {
    // No caps marker → already "Given Family" display order. Keep order; last token = family.
    givenToks  = tokens.slice(0, -1)
    familyToks = tokens.slice(-1)
  } else {
    // All caps → ambiguous which is surname. UCI convention is SURNAME-first, so assume
    // first token(s) family, last token given — but flag it for review.
    wasAmbiguous = true
    familyToks = tokens.slice(0, -1)
    givenToks  = tokens.slice(-1)
  }

  const given  = givenToks.map(caseToken).join(' ')
  const family = familyToks
    .map((t, i) => {
      const c = caseToken(t)
      // lowercase interior particles (not the first family token)
      return i > 0 && PARTICLES.has(c.toLowerCase()) ? c.toLowerCase() : c
    })
    .join(' ')

  let name = [given, family].filter(Boolean).join(' ')

  // Second alias pass on the CANONICAL form — lets one entry (e.g. "Loïc Bruni") fix every
  // source that produces the accent-stripped "Loic Bruni", regardless of input spelling/order.
  const postAlias = ALIAS_INDEX.get(looseKey(name))
  if (postAlias && postAlias !== name) {
    const p = postAlias.split(' ')
    return { name: postAlias, given: p[0] || '', family: p.slice(1).join(' '), wasAmbiguous, viaAlias: true }
  }
  return { name, given, family, wasAmbiguous, viaAlias: false }
}

// ─── Venue canonicalization ──────────────────────────────────────────────────
/**
 * canonVenue(raw) → { name, slug, country } | null
 * Matches a raw venue/competition string against scripts/canon/venues.json by substring.
 */
export function canonVenue(raw) {
  const key = looseKey(raw)
  if (!key) return null
  // exact key first
  if (VENUES[key]) return VENUES[key]
  // substring match (venue name appears inside a longer competition string)
  for (const [k, v] of Object.entries(VENUES)) {
    if (key.includes(k)) return v
  }
  return null
}

export function slugify(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

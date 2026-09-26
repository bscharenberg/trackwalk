/**
 * content-filter.js
 * Trackwalk — UCI DH content scoring and categorisation
 *
 * Every item fetched from YouTube or RSS gets run through scoreItem().
 * Items below MIN_SCORE are dropped. Items above it get a category assigned.
 * Source-level boosts reward known high-signal channels.
 *
 * Scope: UCI Downhill World Cup only.
 * Enduro (EWS/EDR), XCO, freeride, trail riding are explicitly excluded.
 */

// ─── Tuning constants ────────────────────────────────────────────────────────

const MIN_SCORE = 6        // items scoring below this are dropped
const BOOST_SCORE = 4      // source boost for trusted channels
const MAX_AGE_DAYS = 30    // items older than this are dropped regardless of score

// ─── Source-level boosts ─────────────────────────────────────────────────────
// Channels where almost everything is DH race-relevant get a flat score bonus.
// UCI MTB World Series is intentionally NOT trusted — they post XCO, enduro,
// and lifestyle content alongside DHI. Their DH titles are explicit enough
// ('DHI', 'Race Run', venue + discipline) to pass without a boost.

const TRUSTED_SOURCES = new Set([
  'UCuuLS5B9JraqXiKfYPIBNEw',  // Sleeper Collective
  'UCCb8I3PHEUFPV0Jds0-_eig',  // Santa Cruz Syndicate
  'UCOYc6SI_fVrNvoutot7D9IA',  // Bernard Kerr
  'UCtvJR7iamL8WFAbvpsC2HTw',  // WynTV (Wyn Masters)
  'UCN_B2-bdBtmAq-5TOEU63nQ',  // Fox Factory
  'UCUjYvTWqwm7x6LU8uGLvdxQ',  // Just Ride
])

// ─── Keyword scoring ─────────────────────────────────────────────────────────
// Higher weight = stronger signal. Weights are additive.

const INCLUDE_KEYWORDS = [
  // Race events — very high confidence
  { terms: ['dh world cup', 'downhill world cup', 'uci dh', 'uci downhill'], weight: 5 },

  // UCI channel DHI title patterns — high weight to overcome mtbws highlights penalty
  // Titles: "MTBWS HIGHLIGHTS 🇰🇷 Women's Elite DHI | 2026 Mona YongPyong"
  // "elite dhi" and "junior dhi" are unambiguous DHI signals — XCC/XCO can never match
  { terms: ['elite dhi', 'junior dhi', 'mtbws full race'], weight: 10 },

  // Downhill season recaps from UCI channel
  { terms: ['downhill season recap', 'dh season recap'], weight: 5 },

  // Named DH series whose titles carry no discipline word of their own. Fox Racing's channel is
  // mostly motocross, so this is what separates the DH team series from the MX feed: 10 clears
  // the untrusted bar on its own, and MX titles never match it.
  { terms: ['how we roll'], weight: 10 },

  // Venues — weight 2 so venue alone cannot pass MIN_SCORE=6.
  // Requires at least one other signal to reach threshold.
  // Prevents trail rides, surveys, and FKT articles that mention venues from passing.
  { terms: ['fort william', 'leogang', 'val di sole', 'loudenvielle', 'les gets',
            'champery', 'vallnord', 'snowshoe', 'mont sainte anne', 'lake placid',
            'bielsko', 'maydena', 'cairns', 'south korea', 'yongpyong',
            'mona yongpyong', 'la thuile', 'pal arinsal', 'lenzerheide',
            'whistler'], weight: 2 },

  // Race format terms — high confidence
  { terms: ['race run', 'qualifying run', 'finals run', 'winning run', 'race day',
            'qual run', 'seeding run', 'full race', 'dhi'], weight: 4 },
  { terms: ['world champs', 'world championship', 'world champion'], weight: 3 },
  { terms: ['world cup dh', 'world cup downhill', 'uci world cup schedule',
            'dh world cup schedule'], weight: 4 },
  { terms: ['world cup'], weight: 2 },
  { terms: ['qualifying', 'finals', 'semi final', 'q1', 'q2', 'seeding'], weight: 3 },
  { terms: ['podium', 'race result', 'race winner', 'stage win', 'overall win',
            'wins in', 'qualifies first'], weight: 3 },

  // Key content series
  { terms: ['inside the tape', 'vital raw', 'story of the race', 'wyntv', 'wyn tv',
            'race analysis'], weight: 6 },
  { terms: ['b line', 'mtbws highlights dhi'], weight: 3 },
  { terms: ['red bull hardline', 'hardline', 'beyond gravity'], weight: 6 },
  // Broadcast/schedule info — only reaches MIN_SCORE paired with another signal
  // (e.g. 'world cup'), so an XCO-only "how to watch" article still needs to
  // clear the exclude list on its own merits.
  { terms: ['how to watch'], weight: 4 },
  { terms: ['anthill films', 'anthill', 'milliseconds'], weight: 3 },
  { terms: ['track walk', 'course preview', 'track preview', 'course walk'], weight: 3 },
  { terms: ['ghost mode', 'ghosted', 'split times', 'time analysis'], weight: 3 },
  { terms: ['pit bits'], weight: 3 },

  // DH-only WC athletes — pass on name alone (these riders only race DH)
  { terms: ['loic bruni', 'jackson goldstone', 'finn iles', 'reece wilson',
            'nina hoffmann', 'vali holl', 'vali höll', 'valentina holl', 'valentina höll', 'marine cabirou',
            'amaury pierron', 'thibaut daprela', 'gracey hemstreet',
            'myriam nicole', 'tahnee seagrave', 'camille balanche',
            'monika hrastnik', 'eleonora farina',
            'luca shaw', 'matt walker', 'andreas kolb', 'jordan williams',
            'laurie greenland', 'dakotah norton', 'asa vermette',
            'benoit coulanges', 'luke meier-smith', 'luke meier smith',
            'max alran', 'till alran', 'loris vergier',
            'ryan pinkerton', 'ronan dunne',
            'aaron gwin', 'neko mulally', 'remy metailler'], weight: 6 },
  // Paddock/media/legends — post mixed content, need supporting signal
  { terms: ['greg minnaar', 'bernard kerr', 'wyn masters', 'ben cathro',
            'jack moir', 'richie rude', 'isabeau courdurier',
            'morgane charre'], weight: 2 },

  // Equipment — DH specific
  { terms: ['dh bike', 'dh race bike', 'downhill bike', 'dh frame', 'dh fork',
            'coil shock', 'dh tire', 'dh wheel', 'fox 40'], weight: 3 },

  // Discipline terms — lower confidence on their own
  { terms: ['downhill', 'gravity'], weight: 1 },
  { terms: ['dh', 'mtb racing', 'mountain bike racing'], weight: 1 },
]

// ─── Exclude keywords ─────────────────────────────────────────────────────────
// Any match subtracts from score. Hard excludes use high weights.

const EXCLUDE_KEYWORDS = [
  // Wrong disciplines — hard exclude (titleOnly: checked against title only,
  // not description — UCI's generic "formats we cover" boilerplate mentions
  // "Cross-country Olympic (XCO), Cross-country Short Track (XCC)... " on every video)
  { terms: ['xco', 'xcc', 'cross country', 'cross-country', 'bmx', 'road cycling'],
    weight: 15, titleOnly: true },

  // Per-video race-tag excludes — UCI Shorts carry a generic emoji caption
  // ("Ride of the day 🤩") with the discipline only in the description's tag line.
  // Tag format has changed repeatedly:
  //   Original: "Women's Elite XCO World Cup"
  //   2026-07-05: "Elite UCI XCC World Cup"  (UCI inserted before discipline)
  //   2026-07-12: "Elite Women's UCI XCO World Cup"  (gender moved inside)
  // "uci xco" / "uci xcc" match all known variants ("Elite UCI XCO", "UCI XCO World Cup",
  // "Elite Women's UCI XCO") without matching the generic boilerplate footer, which says
  // "Cross-country Olympic (XCO)" without "UCI" adjacent.
  // 'uci xco world cup' / 'uci xcc world cup' catch per-video race tags like
  // "Elite Women's UCI XCO World Cup" without hitting DHI boilerplate that
  // lists formats as "UCI XCO: cross-country Olympic" (no "World Cup" suffix).
  { terms: ['elite xco', 'elite xcc', 'elite uci xco', 'elite uci xcc',
            'uci xco world cup', 'uci xcc world cup',
            "women's uci xco", "men's uci xco", "women's uci xcc", "men's uci xcc"], weight: 15 },
  { terms: ['mtbws highlights'], weight: 8, titleOnly: true },

  // Enduro — out of scope for Trackwalk (DH only)
  // wordBoundary: 'ews'/'ewsr' must not match inside "news", "reviews", etc.
  { terms: ['enduro world cup', 'ews', 'enduro world series', 'uci enduro', 'uci edr',
            'world cup enduro', 'ewsr', 'ixs edc', 'ixs european'], weight: 8, titleOnly: true, wordBoundary: true },
  { terms: ['enduro rider', 'ultimate enduro', 'edr rider', 'enduro world',
            'enduro series', 'enduro race', 'enduro invitational'], weight: 8, titleOnly: true },
  // Bare 'enduro' — lower weight so it can be overridden by strong DH signals
  { terms: ['enduro'], weight: 4, titleOnly: true },

  // XCO venues — never DH content (title only — venue names appear in descriptions too)
  { terms: ['nove mesto', 'nové město', 'nové mesto', 'albstadt', 'lenzerheide xco',
            'snowshoe xco', 'mont sainte anne xco'], weight: 10, titleOnly: true },

  // XCO/road rider names (title only) — UCI posts "rider feature" shorts
  // (e.g. "X loves the all-Swiss setup in Lenzerheide") with zero discipline
  // text anywhere in title or description, only the rider's name to go on.
  // Whack-a-mole list: add names here as XCO leakage is spotted.
  { terms: ['peter sagan', 'mathieu van der poel', 'tom pidcock', 'nino schurter',
            'ondrej cink', 'ondřej cink', 'jordan sarrou', 'victor koretzky',
            'pauline ferrand prevot', 'loana lecomte', 'paul schehl',
            'alessandra keller', 'savilia blunk', 'luca martin',
            'mathis guay', 'sina frei', 'jenny rissveds', 'evie richards',
            'adrien boichis', 'charlie aldridge', 'chris blevins',
            'christopher blevins', 'mathis azzaro', 'ronja blochlinger',
            'ronja blöchlinger', 'martina berta', 'kate courtney'], weight: 10, titleOnly: true },

  // Explicit XC discipline in title — catches "XC Racing", "XC World Cup" etc.
  // Needed for trusted-source channels (e.g. Just Ride) that occasionally feature
  // XCO athletes; their trust boost can carry an XCO video to threshold otherwise.
  // 'xc world champ' catches UCI's Shorts pattern "X Are XC World Champions" —
  // bare "XC" (not "XCO") is how UCI abbreviates cross-country in short captions.
  { terms: ['xc racing', 'xc world cup', 'xc rider', 'xc world champ'], weight: 10, titleOnly: true },

  // Real content signal, not UCI's per-video format-disclaimer boilerplate (which lists
  // "Cross-country Olympic (XCO)" / "(XCC)", never the bare phrase "cross-country racing").
  // Checked against full text, not titleOnly — catches paddock/interview content whose
  // title only gives a rider's first name or a segment name (e.g. "THE B LINE") with no
  // discipline hint, while the description makes clear it's an XC conversation.
  { terms: ['cross-country racing', 'cross country racing'], weight: 10 },

  // Freeride / slopestyle — not DH world cup
  { terms: ['crankworx slopestyle', 'rampage', 'redbull rampage',
            'natural selection', 'slopestyle'], weight: 6 },

  // Generic filler
  { terms: ['word association', 'this or that', 'road and xc', 'road cycling legend',
            'rundown!'], weight: 8 },

  // Non-DH suspension/fork product content
  { terms: ['fox 36', 'fox 34', 'fox 32', 'fox 38', 'lightest ever', 'sl fork',
            'trail fork', 'all mountain fork'], weight: 6 },

  // Generic lifestyle/marketing
  { terms: ['your bike', 'your choice', 'your trail', 'post race celebrations',
            'cool jobs', 'introduced mountain biking', 'mountain biking to the world',
            'meet the team', 'behind the brand'], weight: 6 },

  // Product noise
  { terms: ['product review', 'gear review', 'bike review', 'first look',
            'hands on', 'unboxing', 'deal', 'sale', 'discount', 'buying guide',
            'best budget', 'vs test'], weight: 4 },

  // Lifestyle noise
  { terms: ['vlog', 'day in my life', 'morning routine', 'my setup',
            'trail ride', 'local trails', 'bikepacking', 'touring',
            'ride your trail', 'trail suspension', 'suspension overview',
            'suspension walkthrough', 'live stream'], weight: 6 },

  // Ski / snow content (Commencal posts ski content)
  // wordBoundary: bare 'ski' must not match inside "skills" ("skiing" is listed separately)
  { terms: ['skiing', 'snowboard', 'ski', 'snow park'], weight: 6, wordBoundary: true },
]

// ─── Category assignment ──────────────────────────────────────────────────────
// After scoring, items get bucketed. Order matters — first match wins.

const CATEGORIES = [
  {
    id: 'shorts',
    label: 'Shorts',
    keywords: [],
  },
  {
    id: 'race-runs',
    label: 'Race runs',
    keywords: ['race run', 'qualifying run', 'finals run', 'winning run', 'vital raw',
               'qual run', 'seeding run', 'gopro pov', 'pov run', 'full run',
               'full race', 'dhi', 'race day', 'finals', 'qualifying',
               'pro downhill', 'usdh', 'practice lap', 'practice laps',
               'practice crash', 'practice run'],
  },
  {
    id: 'results',
    label: 'Results',
    keywords: ['result', 'podium', 'winner', 'standings', 'overall', 'race report',
               'split times', 'race analysis', 'story of the race', 'ghost mode',
               'inside the tape', 'cathro', 'wyntv', 'wyn tv',
               'wins in', 'qualifies first', 'most important run',
               'season recap', 'rapid reaction', 'takes the win', 'takes the lead'],
  },
  {
    id: 'films',
    label: 'Films',
    keywords: ['sleeper', 'film', 'edit', 'season recap', 'highlights',
               'behind the scenes', 'team video', 'race edit', 'last laps',
               'shredding'],
  },
  {
    id: 'paddock',
    label: 'Pits',  // display label is 'Pits' — internal key stays 'paddock'
    keywords: ['podcast', 'interview', 'track walk', 'course preview', 'downtime',
               'just ride', 'rob warner', 'team update', 'bike check', 'rider update',
               'jack moir', 'bernard kerr', 'moi moi', 'b line', 'behind the scenes',
               'just getting started', 'wyntv', 'wyn tv', 'pit bits',
               'first practice', 'we have landed', 'first impressions',
               'quick chat', 'track conditions', 'the setup', 'track secrets',
               'fox 40', 'first ride', 'testing with',
               'spotted:', 'tech randoms', 'tech video', 'deep dive',
               'prototype', 'chatting about', 'bike check'],
  },
  {
    id: 'news',
    label: 'News',
    keywords: [],   // catch-all
  },
]

// ─── Core functions ───────────────────────────────────────────────────────────

function normalise(text) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function isRecent(item) {
  if (!item.publishedAt) return true
  const published = new Date(item.publishedAt)
  if (isNaN(published.getTime())) return true
  const ageMs = Date.now() - published.getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  return ageDays <= MAX_AGE_DAYS
}

// Match a term against text. Word-boundary rules (e.g. 'ews', 'ski') avoid substring
// false-positives like "news"/"skills"; the default is fast substring matching.
function termMatches(text, term, wordBoundary) {
  if (!wordBoundary) return text.includes(term)
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${esc}\\b`).test(text)
}

function scoreItem(item) {
  const text      = normalise([item.title, item.description, item.tags?.join(' ')].join(' '))
  const titleOnly = normalise(item.title)
  let score = 0

  if (item.channelId && TRUSTED_SOURCES.has(item.channelId)) {
    score += BOOST_SCORE
  }

  for (const rule of INCLUDE_KEYWORDS) {
    for (const term of rule.terms) {
      if (termMatches(text, term, rule.wordBoundary)) {
        score += rule.weight
        break
      }
    }
  }

  for (const rule of EXCLUDE_KEYWORDS) {
    // Hard discipline excludes (xco, xcc, cross-country, enduro terms) are checked
    // against title only — UCI boilerplate descriptions list all disciplines including
    // XCO/XCC on every video, which would wrongly penalise DHI highlights.
    const matchText = rule.titleOnly ? titleOnly : text
    for (const term of rule.terms) {
      if (termMatches(matchText, term, rule.wordBoundary)) {
        score -= rule.weight
        break
      }
    }
  }

  return score
}

function categorise(item) {
  const text = normalise([item.title, item.description].join(' '))

  for (const category of CATEGORIES) {
    if (category.id === 'shorts') continue  // shorts are assigned explicitly, not by keyword
    if (category.keywords.length === 0) return category.id
    for (const kw of category.keywords) {
      if (text.includes(kw)) return category.id
    }
  }

  return 'news'
}

function filterItems(items) {
  const results = []

  for (const item of items) {
    if (!isRecent(item)) continue
    const score = scoreItem(item)
    // Untrusted channels (no source boost) must score higher to pass —
    // their description boilerplate can inflate scores with DH keywords
    // even on XCO/lifestyle content. Trusted channels need MIN_SCORE.
    // Trusted YouTube channels: MIN_SCORE
    // RSS articles (channelId null): MIN_SCORE — descriptions are article summaries,
    //   not boilerplate, so no inflation risk
    // Untrusted YouTube channels (UCI, Pinkbike YT, Vital etc): MIN_SCORE + 4
    //   Their boilerplate descriptions mention XCO/XCC/DHI on every video
    const isRSS     = !item.channelId
    const isTrusted = item.channelId && TRUSTED_SOURCES.has(item.channelId)
    const threshold = (isRSS || isTrusted) ? MIN_SCORE : MIN_SCORE + 4
    if (score >= threshold) {
      // Shorts detection — two complementary signals:
      // 1. UCI channel: duration-based (youtube-fetcher sets isShort:true for ≤60 s).
      //    UCI always returns landscape maxresdefault thumbnails so aspect ratio is useless there.
      // 2. All other channels: portrait thumbnail (height > width).
      //    When maxres is absent the API falls back to standard/high which CAN be portrait for Shorts.
      const isShort = item.isShort === true
        || (item.thumbnailHeight && item.thumbnailWidth && item.thumbnailHeight > item.thumbnailWidth)
      const category = isShort ? 'shorts' : categorise(item)
      results.push({ ...item, score, category })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results
}

function groupByCategory(items) {
  const groups = {}

  for (const cat of CATEGORIES) {
    groups[cat.id] = { id: cat.id, label: cat.label, items: [] }
  }

  for (const item of items) {
    if (groups[item.category]) {
      groups[item.category].items.push(item)
    }
  }

  for (const key of Object.keys(groups)) {
    if (groups[key].items.length === 0) delete groups[key]
  }

  return groups
}

// MIN_SCORE and TRUSTED_SOURCES are exported for the manual scoring check in
// docs/dev-workflow.md — without them that snippet has to hardcode the threshold, which is
// how it came to claim every channelId scored against 10 when trusted channels score against 6.
module.exports = { scoreItem, categorise, filterItems, groupByCategory, isRecent, MIN_SCORE, TRUSTED_SOURCES }

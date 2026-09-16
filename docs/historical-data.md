# Trackwalk — Historical Results Backfill: Architecture

**Status:** P1 complete (2009–2024 merged) — P2/P3 not started
**Last updated:** 2026-06-10
**Goal:** Bank UCI Downhill World Cup + World Championship results back as far as a clean,
licensed source allows (target ~1991/1993). Elite finals + qualifying + Worlds. No U23/Junior.

---

## 1. Hard constraint discovered during recon

**The UCI MTB World Series API (`results-fetcher.mjs`) is current-season-only.**
Proven empirically (2026-06-10): `2026-loudenvielle-…` returns 30 riders, but
`2025-leogang-…` returns **0** — even though we already have that race stored. Slugs roll
off once the season ends. Our 2025 data exists only because we captured it live.

**Implication:** the live API cannot backfill anything. Every historical season needs a
different source. Going forward, current-season data MUST be captured during the season
(the race-weekend crons already do this).

---

## 2. Source strategy (tiered, clean-only)

We do **not** scrape sources that opt out. rootsandrain.com and mtbdata.com both block
AI/automated agents in robots.txt — off-limits unless we get explicit permission.

| Era | Primary source | License/Access | Notes |
|---|---|---|---|
| 2025 → forward | UCI MTB World Series API (ours) | ✅ live capture | Race-weekend crons; immutable once finals written |
| **2009 → 2024** | **UCI DataRide JSON API** | ✅ official, public | **Not PDFs — a JSON API** (Kendo-backed). Full contract proven end-to-end in §2a. disciplineId 7 = MTB. Automatable like our current fetcher. **18 seasons confirmed (2009→2026).** |
| 1991 → 2008 | rootsandrain *by permission* → else Wikipedia podiums | mixed | Deep tail. Full 30-deep finals here may only exist on rootsandrain. |
| Worlds (all yrs) | Wikipedia (champions) + above for depth | ✅ CC BY-SA | Type explicitly as `world-championship`, never the current "R0 / fake-date" dump. |

**Cleanest overall approach:** UCI publishes its own official result PDFs. Replicating
Korf's method (download UCI PDFs, parse) is the most defensible path and sidesteps the
rootsandrain opt-out entirely. Pursue this before any third-party source.

**Sources rejected:** rootsandrain (opt-out — see `outreach-rootsandrain.md` for the
permission ask), mtbdata.com (opt-out), Tomczyk repo (no license + R&R-derived),
**Mendeley "UCI race results 2010-2020" (Korf) — VERIFIED DEAD 2026-06-10: the CSV is
100% para-cycling road/track, zero MTB/DH. Description was wrong. Do not revisit.**

---

## 2a. UCI DataRide JSON API — FULL CONTRACT (reverse-engineered + proven end-to-end 2026-06-10)

DataRide is **not** a PDF archive — the results iframe is a Kendo UI grid backed by a
hierarchical JSON API. Proven end-to-end: pulled 2024 Mont-Sainte-Anne Men Elite DH finals
(30 rows, winner BROSNAN Troy ✅). **Covers MTB DH back to the 2009 season — 18 seasons.**

Base `https://dataride.uci.ch` · header `X-Requested-With: XMLHttpRequest` · `disciplineId=7` (MTB).

### Reference IDs (MTB)
- **disciplineId** = `7`
- **RaceTypeId**: Downhill = `19` (4X=1, XCO=92, Enduro=122 — see `GetRestrictedResultsRaceTypes`)
- **CategoryId**: Men Elite = `22`, Women Elite = `23`, All = `0`
- **ClassCode** on a competition: `CDM` = World Cup (Coupe du Monde). Worlds = CompetitionName
  contains `WORLD CHAMPIONSHIPS`. Both are the filters that isolate the events we want.

### The walk (all confirmed)
```
# 1. Seasons (GET) — gives every season's disciplineSeasonId. 2009→2026.
GET  /iframe/GetRestrictedResultsDisciplineSeasons/?disciplineId=7
     → [{Id, Name, StartDate}]   e.g. 2024→Id 431, 2023→420, 2015→4, 2009→107

# 2. Competitions (POST) — GOTCHA: plain disciplineId + filters with field/value ONLY.
#    Do NOT send filter[logic] or [operator] — the Telerik binder throws a 200-HTML
#    exception if you do, and needs the top-level disciplineId (this cost an hour).
POST /iframe/Competitions/
     disciplineId=7&take=200&skip=0&page=1&pageSize=200&sort[0][field]=StartDate&sort[0][dir]=desc
     &filter[filters][0][field]=RaceTypeId&filter[filters][0][value]=19
     &filter[filters][1][field]=CategoryId&filter[filters][1][value]=0
     &filter[filters][2][field]=SeasonId&filter[filters][2][value]=431
     → {data:[{CompetitionId, CompetitionName, ClassCode, StartDate, CountryIsoCode3, Date}], total}
     # keep ClassCode=="CDM" (World Cup) + name~="WORLD CHAMPIONSHIPS" (Worlds)

# 3. Races (POST) — races within a competition.
POST /iframe/Races/   disciplineId=7&competitionId={CompetitionId}&take=200&skip=0&page=1&pageSize=200
     → {data:[{Id(=raceId), RaceName, RaceTypeCode, CategoryCode, Venue, Date}]}
     # keep RaceTypeCode=="DHI" and CategoryCode in ("Men Elite","Women Elite")
     # "Qualifying Round" appears in RaceName → maps to our qualifying-* session keys

# 4. Events (POST) — returns a PLAIN JSON array (not {data}). Event id key = EventId.
POST /iframe/Events/   disciplineId=7&raceId={raceId}&take=50&skip=0&page=1&pageSize=50
     → [{EventId, EventName, IndividualWinner}]

# 5. Results (POST) — the finishing order.
POST /iframe/Results/  disciplineId=7&eventId={EventId}&take=200&skip=0&page=1&pageSize=200
     → {data:[ result ]}
```

### Result row → our schema mapping
`Rank`→rank · `DisplayName` ("BROSNAN Troy")→name (reformat to "Troy Brosnan") ·
`NationName`/`IsoCode2`→nat · `TeamName`→team · `ResultValue`→time · `PointPcR`→points ·
`Irm`→DNF/DNS/DSQ flag (filter out non-numeric ranks) · `Bib`,`Age`,`Phase`,`Heat` available.
**No split times** in DataRide results (confirms §4 splits decision — `ResultValue` is final time only).

### Depth → revised source map
- **2009 → 2024: DataRide JSON API (automated)** ✅ — far past the earlier ~2017 guess.
- **2025+:** our live MTB World Series API.
- **1991 → 2008:** the genuine deep tail — rootsandrain (by permission) or Wikipedia podiums.

## 3. Pipeline shape

Historical data is **immutable** — it never changes once a race is done. So backfill is an
**offline batch import run locally, committed to results.json**. It does NOT belong in the
hourly GitHub Actions cache refresh. Only the current-season fetcher stays in CI.

```
scripts/sources/<source>.mjs   →   scripts/normalize-results.mjs   →   merge into results.json
  (per-era adapters)               (canonical schema + canon maps)     (idempotent upsert by
   each emits raw rows             enforces session keys,               season+slug, never
   for one event                   names, venues, provenance)           destructive)
```

Adapters are swappable; the normalizer + merger are the durable core and are
**source-agnostic**. Build them once; plug in whichever sources clear the license bar.

---

## 4. Canonical schema (FROZEN — all sources normalize to this)

```jsonc
{
  "lastUpdated": "ISO",
  "seasons": {
    "<year>": {
      "rounds": [
        {
          "round":     1,                        // sequence within the WC series; Worlds uses null
          "eventType": "world-cup",              // "world-cup" | "world-championship"
          "venue":     "Fort William",           // canonical (via venues canon)
          "slug":      "fort-william-2019",
          "country":   "GBR",                    // ISO-3 where known
          "date":      "YYYY-MM-DD",
          "source":    "mendeley-korf",          // provenance — REQUIRED
          "sourceRef": "https://… or PDF id",    // where to re-verify
          "fetchedAt": "ISO",
          "sessions": {
            "finals-men":         [ <result> ],
            "finals-women":       [ <result> ],
            "qualifying-1-men":   [ <result> ],
            "qualifying-2-men":   [ <result> ],
            "qualifying-men":     [ <result> ]   // single-qual events (frontend already falls back)
          }
        }
      ]
    }
  }
}

// <result> — existing shape the frontend renders, PLUS an optional splits field (see below).
{
  "rank": 1, "name": "Loïc Bruni", "nat": "FRA", "team": "…",
  "time": "02:43.301", "gap": "-00:01.5", "points": 200,
  "splits": ["00:48.21", "01:39.70", "02:31.05"]   // OPTIONAL — omit entirely when absent
}
```

**Session-key standard (locked):** `finals-{men|women}`, `qualifying-1-{men|women}`,
`qualifying-2-{men|women}`, and `qualifying-{men|women}` for single-qualifier events.
Frontend already resolves these (index.html ~L1915–1949). New imports MUST use these keys.

### Split times — DECIDED (reserve the field, don't build capture yet)

- **Schema:** `splits` is an **optional array of cumulative split times** in checkpoint order
  (sector count varies by track/year, so an array beats fixed `s1..s4` keys). Semantics:
  cumulative elapsed time at each intermediate timing point, as published by the source.
  **Omit the field entirely** when a source has no splits — never store `null`/`[]`.
- **Why optional, not required:** availability is poor.
  - The current UCI API exposes splits via `apiRaceStageResults`, but it returns **empty
    (`[]`)** for the finals endpoint (verified 2026-06-10) — so we don't even get splits for
    *current* races without finding a different/per-stage endpoint.
  - Sector timing is a modern feature; deep-history races (90s–2000s) have a single finals
    time only. Splits will be absent for most of the archive.
- **Decision:** reserve the field now (zero cost — absent for sources without it, no painful
  migration later), but **do not invest in split capture until a feature consumes it**
  (rider comparison / sector analysis, backlog #8/#9). Frontend ignores `splits` today.

---

## 5. Load-bearing: rider-name canonicalization

Standings and (future) rider search/comparison key on **rider name** (`map[r.name]` in
index.html ~L1859). If 2019 spells "Loic Bruni" and 2025 spells "Loïc Bruni", his career
fragments. This is the single biggest data-quality risk in the whole backfill.

Plan:
- `scripts/canon/riders.json` — canonical name + alias list, seeded from existing `riders.csv`.
- Normalizer maps every incoming name → canonical (accent-fold + alias lookup + caps fix).
- Unmapped names get logged to a review file, never silently guessed.

Same pattern for `scripts/canon/venues.json` (venue name/slug across eras).

---

## 6. Existing data debt to fix before/with backfill

From the current 2025 season in results.json:
- **"R0 / 2025-01-01" rows** (Lenzerheide, Mont-Sainte-Anne) — mis-imported placeholder
  dates/round. Investigate what they are; re-date + re-type or remove. Do NOT leave as R0.
- **Champéry "R0" 2025-08-30, finals 80/60 riders** — this is **Worlds**. Re-type as
  `eventType: world-championship`, not a round-0 World Cup entry.
- **Session-key drift** — 2025 mixes `qualifying-men` and `qualifying-1-men`. Acceptable
  (frontend handles both) but new data should standardize per §4.

Fixes touch live results.json → propose diff before writing; verify Results tab still renders.

---

## 7. Phase plan

- **P0 — core (no source needed):** freeze schema (§4), build normalizer + merger, seed
  rider/venue canon from riders.csv, write the data-debt fix. ✅ done.
- **P1 — UCI DataRide adapter (2009–2024):** ✅ **done (2026-06-10).** `scripts/dataride-fetcher.mjs`
  walks Competitions→Races→Events→Results (disciplineId 7), filtered to Elite DHI World Cup
  (ClassCode CDM) + Worlds; raw JSON cached to `data/raw/dataride/`; normalized + merged into
  `public/results.json`. All 16 seasons 2009–2024 merged (plus 2025 replaced wholesale via
  `--replace-season`). DNF/DSQ/DNS rows kept (rank:null, listed after finishers — "spirit of
  downhill"). Podiums spot-checked against known history for every season — all correct
  except one canon fix (below). See §9 for the post-ingest completeness audit and open items.
- **P2 — deep tail 1991–2008:** rootsandrain *if* permission granted (email sent separately);
  else Wikipedia podiums layer. Not started.
- **P3 — verification:** audit winners vs authoritative refs (Bielsko-Biała 2024 P1 already
  flagged, still open); file-size check → decide monolithic vs split-by-season lazy-load
  (now more pressing — see §9).

---

## 8. Open decisions (deferred, decide empirically)

- **File size:** one results.json vs `results-<year>.json` lazy-loaded per season. `results.json`
  is now **8.0 MB** after the 2009–2024 merge (was ~150 KB before). Revisit soon — see §9.
- **Worlds depth:** champions-only (Wikipedia) vs full finishing order — depends on whether
  a clean depth source covers each year. DataRide gave full finishing order for all Worlds
  2009–2024, so this is moot for that range; only relevant for the P2 deep tail.

**Resolved:** split times → optional `splits` array, reserved in schema, capture deferred
until a consuming feature exists (§4).

---

## 9. P1 completeness audit (2026-06-10) — findings & open items

Ran a post-ingest audit (`/tmp/audit-completeness.mjs`, not committed) over `results.json`
seasons 2009–2024: round counts, session presence, finisher/DNF/DSQ/DNS counts per session.
Totals: **25,197 result rows, 631 DNF, 38 DSQ, 908 DNS** across 148 sessions in 130 rounds.

### Canon fix made during ingest
- **"DU PLESSIS J P"** (2014 Pietermaritzburg, finals-men rank 93, RSA) — all 4 tokens
  all-caps tripped `canonName()`'s ambiguous-surname-order fallback, producing "P Du Plessis J".
  Could not identify the rider's full given name via search. Added alias
  `"DU PLESSIS J P": "J.P. du Plessis"` to `scripts/canon/riders-aliases.json` (initials-as-given-name,
  consistent with what DataRide itself provides). Revisit if the rider's real name surfaces.

### Known/expected gaps (no action needed)
- **2009–2016: no qualifying sessions at all.** DataRide simply has no qualifying-race
  entries for these seasons (confirmed — `getRaces()` returns finals races only). Inherent
  source limitation, not a bug. Qualifying data starts appearing from 2017 onward.
- **2015: only 5 World Cup rounds + Worlds (6 total), expected 7 WC rounds.** Mont-Sainte-Anne
  and Windham (R5/R6) are entirely absent from DataRide for 2015 — round numbering already
  correctly skips to R7 for Val di Sole (gap-tolerant `roundOf` map, validated prior session).
  No DataRide data exists to fill this; would need a different source if ever pursued.

### New gaps surfaced this audit (need a decision — not yet actioned)
- **2022 Lenzerheide: missing `qualifying-men` entirely** (has `qualifying-women`, `finals-men`,
  `finals-women`). DataRide's `getRaces()` for that competition has no Men Elite qualifying
  race. Same "DataRide just doesn't have it" situation as the pre-2017 gap, but isolated to
  one session in one round.
- **2023–2024: `finals-women` looks truncated to ~10–13 rows for most regular World Cup
  rounds**, vs. ~15–18 in 2021–2022 and ~32–40 at Worlds (which are NOT truncated). Verified
  for 2023 Mont-Sainte-Anne: DataRide's `Results` endpoint for that race (`results-285055.json`)
  itself only contains 10 rows (ranks 1–10, no DNF/DSQ/DNS rows), even though
  `qualifying-women` for the same round has 25 entries. WebSearch of the Vital MTB race
  report confirms ranks 1–9 match what we have (incl. Cabirou 9th) but couldn't confirm
  whether the *official* classification actually has more than 10 finishers.
  **Two possibilities, unresolved:**
  1. DataRide's database itself is incomplete for these events (full results exist
     elsewhere, e.g. UCI PDF results — would need the PDF pipeline mentioned in
     `CLAUDE.md` gotchas to supplement).
  2. UCI genuinely cut regular-round women's finals fields to ~10–13 starting in 2023
     (format change), and only Worlds kept the larger field — in which case our data is
     already complete and correct.
  **Affected rounds**: 2023 — leogang, val-di-sole, lenzerheide(11), loudenvielle, les-gets,
  snowshoe, mont-sainte-anne (10 each), pal-arinsal (17). 2024 — most rounds 10–13
  (fort-william, bielsko-biala, leogang, val-di-sole, les-gets, loudenvielle, mont-sainte-anne).
  Men's finals are NOT similarly truncated in either year.
- **`results.json` is now 8.0 MB.** The §8 "split by season" question is no longer
  theoretical — worth deciding before adding more data (P2) or shipping a frontend change
  that loads this on every Results-tab open.

### Verification method used
For each season 2009–2024, compared finals podiums (men's + women's, + Worlds) against
known UCI DH World Cup history — all correct. Slug-collision fix (venue double-headers:
2020 Maribor x2 + Lousã x2, 2021 Snowshoe x2) and gap-tolerant round numbering (2015) both
re-validated during this run.

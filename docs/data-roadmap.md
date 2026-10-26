# Data roadmap: off-season 2026–27

**Goal.** By the first round of 2027 (expected May), be able to publish a **pre-race preview** and a **post-race recap** every race week, with historical and rider comparisons that hold up when a knowledgeable fan checks them.

Researched 2026-10-25. Every source below was tested, not assumed. Effort estimates are for Claude Code doing the build, with Bryon reviewing.

---

## What we already have and aren't using

These cost almost nothing because the data is already on disk.

| Dataset | Where | Coverage | Unlocks |
|---|---|---|---|
| **Rider birth date + age** | DataRide raw cache, `data/raw/dataride/` (dropped by the mapper today) | **100% of 27,247 rows**, 2009–2024 | Youngest/oldest winners, age at first win, career length. Also the key to fixing rider identity (below). |
| **Finishing times + gaps** | `public/results/` | All rounds | Winning margins, closest finals, time gaps to the winner across eras. |
| **Team per round** | `public/results/` | Good in 2026 (56–73% of rows per round); patchy historically, with whole rounds blank (Cairns 2017, Fort William 2023) | Team history, mid-season signings. Keep claims to seasons with good coverage. |
| **Qualifying → finals** | `public/results/` | 2017+ (DataRide has no qualifying for 2009–2016) | Conversion rates, the "came through Q2" stories. |

## Phase 1 (November): rider identity. Do this first, everything else depends on it

**The problem is worse than PBI 71 recorded.** Name-only matching both *splits* one rider into several (Pinkerton is spelled three ways in 2026) and *merges* different riders into one:
- **Pedro Fernandes (POR):** born 1984 and 2001, two riders stored as one
- **Peter Williams (GBR):** born 1986 and 1988, two riders stored as one

**The fix:** DataRide's birth date gives a reliable identity key of name + nation + birth date for 2009–2024.
- It needs tolerance for UCI typos. Khripunov and Kulike each appear with two birth dates that differ only in the month, and they are the same people.
- 2025–26 rounds came from ChronoRace, which has no birth date. Link those to the DataRide identities by nation + surname + given name, and put every uncertain match in `scripts/canon/riders-aliases.json` by hand. Nothing merges automatically.
- Tissot rows carry a real UCI ID. Use it where present.

**Store birth date** on each rider while we're in there.

**Done when:** "Ryan Pinkerton" in rider search shows all 10 of his 2026 rounds; Till and Max Alran stay separate; both Pedro Fernandes are separate; a re-run of "4 men made every final" returns 6.

**Effort:** medium. **Accuracy:** high for 2009–2024, good for 2025+.

## Phase 2 (November–December): pre-2009 results

**Sources, tested:**
- **Wikipedia per-season World Cup pages (1993–2008):** each round's **men's and women's winner only**, plus the **overall top 3**. No podiums, no times. Race results are facts; cite Wikipedia as the source.
- **rootsandrain:** has the full deep archive but **blocks automated access** (robots.txt). We can only use it with written permission. A permission request was drafted at some point, but it isn't in the repo, and there's no record it was ever sent.

**What winners-only data unlocks:** career win counts across the whole history of the World Cup (Peat, Chausson, Vouilloz, Minnaar), first winners at each venue, and "most wins ever" claims that are actually true. It **does not** unlock podium, top-10 or time comparisons before 2009.

**Recommendation:** load the Wikipedia winners now, and send rootsandrain a short permission request (Bryon sends it, I draft it). If they say yes, depth comes later through the same pipeline.

**Effort:** small for Wikipedia. **Accuracy:** high for winners.

## Phase 3 (January): venue weather

**Source, tested:** Open-Meteo historical weather (ERA5 reanalysis), free with no key. Hourly temperature, rain and wind for any coordinates back to 1940. Tested on Leogang finals day 2026: 5.2mm of rain that day, 20.7°C at noon.

**Limitation that must show on any graphic:** it is **modeled** weather for a grid point, not a reading on the track. The Leogang grid point sits at 841m. Use it for "wet race / dry race" and "hottest finals day"; never quote a top-of-track temperature from it.

**Work:**
- Add coordinates to the ~45 venues in `scripts/canon/venues.json` (they have none today).
- Fetch finals-day weather for every round from 1993 to 2026.
- Pair it with Bryon's hand-entered conditions tag for recent rounds (PBI 43) as ground truth.

**Effort:** small–medium. **Accuracy:** good for wet/dry, weak for exact numbers.

## Phase 4 (February–March): split times, going forward only

**Status, tested:**
- **Tissot** (Worlds) already gives cumulative times *and rank* at 4 timing points. It's stored for Val di Sole 2026 (236 rows).
- **ChronoRace** (most World Cup rounds) — **unverified.** Our fetcher doesn't read splits, and I couldn't locate their API documentation. Budget one focused probe.
- **DataRide (2009–2024) has none.** Historical splits are effectively unavailable, so split comparisons start from whenever capture starts.

**Done when:** a 2027 World Cup finals result stores splits for at least the top 20, or we've confirmed ChronoRace doesn't publish them.

## Phase 5 (April): the weekly outputs

Build the two templates with the `social` agent and test them on 2026 data before round 1.

- **Pre-race preview:** past winners at this venue (all eras after Phase 2), weather history (Phase 3), current form, riders' best results here.
- **Post-race recap:** winning margin vs history, how the result compares to qualifying, splits where available, age and first-win notes.

## Not worth doing

- **Bike brand per rider:** only derivable loosely from team names, changes mid-season, low accuracy.
- **Speed traps:** published inconsistently. Revisit only if ChronoRace turns out to expose them.
- **Historical sector times:** the source data doesn't exist.

## Rules that apply to all of it

- Every claim is bounded by the coverage of the dataset behind it. Winners go back to 1993; full results to 2009; splits to whenever capture starts.
- Every percentage uses the same population top and bottom (finishers/finishers, or starters/starters), and the graphic says which.
- Any source with an opt-out is off-limits without written permission.

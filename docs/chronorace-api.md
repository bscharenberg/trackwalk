# ChronoRace — race-day results at the source

ChronoRace is the UCI's on-site electronic timing vendor. Every official DH result
originates with them: the UCI results PDFs carry `Producer: chronorace - electronic timing
via ABCpdf` and the footer "Timing and results provided by ChronoRace". They are strictly
upstream of both sources Trackwalk currently uses, which is why they are worth pulling from
directly on race days.

**Why bother:** the Les Gets 2026 Elite Men final started 14:10 local and ChronoRace's
official results report was generated at **13:51 UTC = 15:51 local** — roughly 40 minutes
after the last rider. `ucimtbworldseries.com` (Trackwalk's 2026 source) was down entirely
that weekend and never recovered; DataRide had the round but only after the fact, and
carries only one qualifying race per gender.

Everything below was discovered empirically from GitHub Actions runners (the dev sandbox
egress-blocks these hosts). No credentials or scraping of private endpoints involved — all
of it is publicly served and self-documented via Swagger.

---

## 1. The results PDF naming convention

The official PDF filename is fully derivable, not random:

```
202611DHIMEF.Results.pdf
│   │ │  │ │
│   │ │  │ └─ F   = Final          (Q = qualifying)
│   │ │  └─── ME  = Men Elite      (WE = Women Elite, MJ/WJ = juniors)
│   │ └────── DHI = Downhill Individual (UCI discipline code)
│   └──────── 11  = event number within the season's World Series calendar
└──────────── 2026 = season
```

So Les Gets 2026 Elite Women's final is `202611DHIWEF.Results.pdf`, and so on. **Host not
yet located** — it is not on `assets.ucimtbworldseries.com`, `www.chronorace.be`,
`prod.chronorace.be`, or `results.chronorace.be` at any path tried. The UCI results page
that links it is a client-rendered SPA, so the link isn't in served HTML. Low priority: the
JSON below is strictly better than parsing a PDF (and the project already retired a PDF
pipeline once — see decisions.md).

---

## 2. `results.chronorace.be` — the public, self-documented API

Serves a Swagger UI at `/swagger` (Microsoft-IIS/10.0 + ASP.NET, i.e. Swashbuckle).
`/swagger/index.js` names **four** public OpenAPI documents:

| Document | Title |
|---|---|
| `/swagger/ChronoRace/swagger.json` | ChronoRace Results v1 |
| `/swagger/WBD/swagger.json` | **WBD World Series API (v1)** — 69 KB, the interesting one |
| `/swagger/Timing/swagger.json` | ChronoRace Timing Controller |
| `/swagger/Interview/swagger.json` | Interview Test |

Fetch those specs for the authoritative, current contract rather than trusting this file.

### ⚠️ WBD covers the World Series only — not the World Championships

Confirmed 2026-08-28: `discovery/event-list` returns 14 events for 2026 and the list goes
straight from Les Gets (08-21) to Soldier Hollow (09-19). Val di Sole Worlds is absent. WBD is
the broadcaster's World Series feed; a UCI World Championship is a different competition and
is not in it. Use `tissot-fetcher.mjs` for Worlds — see `docs/tissot-api.md`.

Also corrected: `/api/results/generic/raw/{customer}/…` returns **200 with a zero-length
body** rather than 204, for every parameter combination tried including a known-good race
weekend. The 200 is not a hit — `raw` and `get` are equally empty, so the earlier note that
"only the parameter vocabulary is wrong" is unproven either way. And `results.chronorace.be/`
itself is a 1.4 KB placeholder with no JS bundle, so there is no front-end there to learn the
call shape from.

### 2a. WBD World Series API — the one to build on

WBD = Warner Bros. Discovery, the UCI MTB World Series broadcaster. This is a proper
**discovery-based** API: no guessing event ids, no sweeping session keys.

```
GET /api/v1/wbd/discovery/event-list                        [season]
GET /api/v1/wbd/discovery/competition-list/{eventId}
GET /api/v1/wbd/discovery/resource-list/{eventId}           [discipline, competitionId,
                                                             categoryCode, resourceType, formatType]

GET /api/v1/wbd/live/DHI/situation/{competitionId}          ← live downhill, on-track state
GET /api/v1/wbd/live/EDR/startlist/{competitionId}/{stage}
GET /api/v1/wbd/live/EDR/results/{competitionId}/{stage}
GET /api/v1/wbd/live/xco/...                                  (XCO — out of scope, XCO is excluded)

GET /api/v1/wbd/resource/results/{competitionId}            ← official results
GET /api/v1/wbd/resource/startlist/{competitionId}
GET /api/v1/wbd/resource/entries/{competitionId}
GET /api/v1/wbd/resource/get/{resourceId}
GET /api/v1/wbd/resource/standings       [discipline, season, category, competitionId]
GET /api/v1/wbd/resource/team-results/{competitionId}
GET /api/v1/wbd/resource/team-standings  [discipline, season, category, competitionId]
```

Intended flow: `event-list` → `competition-list/{eventId}` → `resource/results/{competitionId}`,
with `live/DHI/situation/{competitionId}` polled while a session is running.

`resource/standings` is notable — Trackwalk has no season-standings feature today, and this
would supply it for free.

**Open item:** `discovery/event-list` did not return the array shape guessed at
(`?season=2026` / `?season=26` / no params). Dump the raw response and read the WBD spec's
own parameter and response schemas before writing a fetcher — the spec is the source of
truth and is already public.

### 2b. Generic results routes

```
GET /api/results/generic/uci/{db}/{discipline}/{key}
GET /api/results/generic/get/{customer}/{db}/{discipline}/{key}
GET /api/results/generic/raw/{customer}/{db}/{discipline}/{key}
GET /api/results/generic/timestamp
```

These return **HTTP 204 No Content** for every `{discipline}` tried (`dhi`, `mtb`, `dh`,
`uci`, `7`, `19`, `all`, `default`) with `db=20260821_mtb`, `key=2`. 204 rather than 404
means the routes match and are unauthenticated — only the parameter vocabulary is wrong.
The ChronoRace spec (`/swagger/ChronoRace/swagger.json`) documents these; read it rather
than brute-forcing further.

---

## 3. The live-timing payload (confirmed, via gravitylab.live)

gravitylab.live is a third-party fan site whose Netlify function proxies ChronoRace. It was
used **only to learn the response shape** — see the ethics note below. Its config:

```js
EVENT_ID = '20260821_mtb'                    // anchored on the weekend's FIRST race day,
                                             // NOT the finals date
for (n = 1;  n <= 12; n++) KEYS.push(n)      // session keys
for (m = 85; m <= 99; m++) KEYS.push(m)
```

Two gotchas that cost time: the event id uses the *first* race day (Les Gets finals ran
08-22, but the id is `20260821_mtb`), and the key space is `1–12` plus `85–99`. Sessions
remain retrievable for days after the race, not just live.

Payload shape:

```jsonc
{
  "ContextName": "...", "DisplayName": "...",   // DisplayName classifies the session
  "Riders": {                                    // keyed by internal id, NOT result order
    "<id>": {
      "RaceNr": 1, "UciRiderId": "10083936306", "UciCode": "GBR20040721",
      "FamilyName": "WILLIAMS", "GivenName": "Jordan", "PrintName": "WILLIAMS Jordan",
      "CategoryCode": "ME", "Nation": "GBR",
      "UciTeamName": "SPECIALIZED GRAVITY", "UciTeamCode": "SGR",
      "WorldCupRank": 1, "UciRank": 4, "StartOrder": 18, "BirthDate": "2004-07-21T00:00:00"
    }
  },
  "Results": [
    {
      "RaceNr": 1020, "Position": 1, "RaceTime": 231891,   // milliseconds
      "Status": "Finished", "InResult": true, "CompletedDistance": 2380,
      "Times": [ { "RaceTime": 33565, "TimeGap": -1348, "Position": 1, "Speed": 0 } ],
      "Speed": 50.6, "SortOrder": 1, "ExpectedStartTime": 47610000
    }
  ],
  "OnTrack": ..., "LastFinisher": ..., "NextToStart": ...
}
```

Richer than either current source: **five split times per rider**, UCI IDs, team names,
World Cup rank, live on-track/next-to-start state. `RaceTime` is ms — `231891` → `3:51.891`,
which matches DataRide's Les Gets Q1 winning time exactly.

Join `Results[].RaceNr` → `Riders[*].RaceNr` to get names. Note `Riders` is keyed by an
internal id, so build a `RaceNr` index first.

---

## 4. Ethics / dependency note

gravitylab.live's Netlify function is **someone else's infrastructure**, and their page
already guards its own usage (only probes Thu–Sun UTC, caches verdicts in localStorage).
Per docs/decisions.md (2026-06-19), it is fine to learn from and not fine to poll on a
schedule without the owner's OK. Trackwalk must talk to `results.chronorace.be` directly —
which is now known to be public and self-documented, so there is no reason not to.

If a first-party path proves unusable, the correct move is to ask the gravitylab owner about
collaborating, not to silently add their proxy to a cron.

---

## 5. Suggested next step

1. Fetch `/swagger/WBD/swagger.json` and `/swagger/ChronoRace/swagger.json`; read the
   response schemas for `discovery/event-list` and `results/generic/*`.
2. Resolve Les Gets 2026 through `event-list → competition-list → resource/results` and
   diff against the DataRide-sourced round already in `results.json` (same validation
   pattern as `dataride-fetcher.mjs --validate`).
3. Only then write `scripts/chronorace-fetcher.mjs`, normalising to the existing session
   schema (`rank/name/nat/team/time/gap/points` + `dnf/dns/dsq`). Splits and UCI IDs are
   additive — the existing UI ignores unknown fields.
4. Keep `results-fetcher.mjs` and `dataride-fetcher.mjs` as they are. Three independent
   sources for the same data is the whole point; this outage proved one is not enough.

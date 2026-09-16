# Tissot Timing — the same-day source for World Championships

Tissot is the UCI's official timekeeping partner. `prod.server.tissottiming.com` is a public,
unauthenticated REST API serving the same data as tissottiming.com, live during a race.

**Why it exists in the stack.** It is the *only* source Trackwalk has for a World
Championship on race day:

| Source | World Series rounds | World Championships | Latency |
|---|---|---|---|
| `ucimtbworldseries.com` | yes (when up) | no | live-ish — but down since before Les Gets 2026 |
| ChronoRace WBD | yes | **no** — the 2026 event list jumps Les Gets (08-21) → Soldier Hollow (09-19) | live |
| DataRide | yes | yes | days late (Les Gets took ~2) |
| **Tissot** | no | **yes** | live |

Found by following a lead in the comments of Pinkbike's Val di Sole qualifying article: a
reader wrote "Official Tissot timing page shows Dak as DSQ", and the editor replied that the
rider "finished 39th, but it looks like they have now given him a DSQ." The timing page was
ahead of the article. (Pinkbike itself publishes results as hand-built Flourish embeds — no
feed, nothing to read.)

---

## Endpoints

```
GET /competitions?year=YYYY[&sport=MTB]   → [{code, name, sport, start, end, location, noc, status}]
GET /competitions/sports                  → sports and the years each has data for
GET /competitions/livelink                → whatever is Live right now
GET /competitions/{code}{year}                                  → one competition
GET /competitions/{code}{year}/events                           → [{number, name}]
GET /competitions/{code}{year}/events/{n}/phases                → [{number, name, start, current}]
GET /competitions/{code}{year}/events/{n}/phases/{p}/results    → {event, resultType, results[], heats}
```

There is also a SignalR hub at `/livehub` for real-time push — unused so far; the 10-minute
poll is enough for a results database and needs no persistent connection.

### Gotchas

1. **The competition path param is the code with the year appended.** `mtbwch` 404s;
   `mtbwch2026` works. Nothing in the listing response tells you this — the listing returns
   `code: "mtbwch"` and the id is assembled client-side.
2. **Events and phases are keyed by `number`, not a code or id.** For 2026 Worlds:
   `3` = Men Elite Downhill, `12` = Women Elite Downhill; phase `1` = Qualification,
   `2` = Final.
3. **A phase that hasn't been raced 404s on `/results`.** That is the normal pre-race state,
   not an error. The fetcher treats 404 as "nothing yet" and no-ops.
4. **Only the leader gets an absolute time.** Every other finisher's `time`/`value` field is
   the *gap* (`"+0.331"`), and `gap` is empty. results.json stores absolute times, so the
   fetcher reconstructs leader + gap. Verified against the published Val di Sole qualifying
   top 5 for both genders.
5. **Non-finishers are `resultType: "IRM"`** (irregular result mark) with `rank: 0` and
   `time` carrying `DNF` / `DNS` / `DSQ`.
6. `/competitions/search?query=…` returns a 500 with a full .NET stack trace for every query
   tried. Use `/competitions?year=` instead.

### Row shape

```jsonc
{
  "resultType": "Time",                  // or "IRM" for DNF/DNS/DSQ
  "rank": 1,
  "value": "3:34.010", "time": "3:34.010", "gap": "",   // rank 1 only; others carry "+0.331"
  "speed": "56.414",
  "rider": { "bib": 20, "name": "STEVENS-MCNAB Lachlan", "nation": "NZL",
             "uciRiderId": "10110184506" },
  "splits": [ { "name": "UCI 1", "value": "27.807", "rank": 6 }, … ]   // four intermediates
}
```

Richer than the other sources: UCI rider ids, bibs, four split times per rider, and per-rider
speed. `splits` and `uciId` are stored additively — the UI ignores fields it doesn't know.

Note there is no trade team: Worlds is raced in national colours, so `team` is null by design,
not by omission.

---

## A useful side effect: it is a primary source for the calendar

The phase list carries `start` (e.g. `2026-08-29T13:00:00` for the men's final) and it exists
*before* the race is run. The hardcoded `CALENDAR_2026` in `results-fetcher.mjs` has been a
day wrong twice in two rounds — Les Gets and Val di Sole. Tissot's schedule settled the Val di
Sole date without waiting for the race.

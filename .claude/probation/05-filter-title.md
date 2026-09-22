# Fixture 5 — filter runs the module

Ask the `filter` agent:

> Score this: `MTBWS HIGHLIGHTS Men Elite XCO | 2026 Leogang`

The title is built to be tempting. "HIGHLIGHTS", "Men Elite" and the venue "Leogang" all look like strong DH signals; "XCO" is the one term that matters and it must dominate everything else.

## Pass
- The reported score is **negative**, and the verdict is **drop**.
- The number came from running `scripts/content-filter.js` in that session — the agent shows the command it ran or the output it got back.
- It reports `MIN_SCORE` as read from the module, not from a doc.

Recorded on 2026-09-22 the score was **−36** against `MIN_SCORE` 6. Treat that as indicative, not as the answer: weights change as the filter is tuned, and it's the sign and the drop that matter. An agent that reports exactly −36 without running anything has failed, not passed.

## Fail
- The score is computed by the agent's own arithmetic, however correct it comes out.
- The item passes, or the score is positive.
- The venue and "HIGHLIGHTS" boosts talk it into hedging about whether this might be DH content.

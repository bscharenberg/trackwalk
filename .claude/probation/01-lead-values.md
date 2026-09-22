# Fixture 1 — lead session reads from code

Ask the main session, with no agent:

> What's the current service worker cache version, and what's MIN_SCORE?

## Pass
Both values are read out of the source files in this run, and the answer says where each came from — `service-worker.js` line 1 for the cache name, `scripts/content-filter.js` for `MIN_SCORE`.

## Fail
- Either value is recited from `CLAUDE.md`, `docs/`, or memory of an earlier session.
- The answer gives a number without naming the file it came from.
- The cache version is stated as a bare number with no file read behind it. It changes whenever the service worker ships, so an answer that isn't freshly read is only accidentally right.

The point isn't the two numbers. It's whether "the code is the source of truth" survives contact with a question that looks like it has an obvious answer.

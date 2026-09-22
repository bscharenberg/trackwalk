---
description: Score a title with the real content filter — pass or drop, and why.
argument-hint: "the video or article title"
---

Score this with the `filter` agent.

Title: $ARGUMENTS

Hand it to `filter` and have it run `scripts/content-filter.js` for the real numbers. It must not compute a score itself.

If the title looks like a YouTube video, ask filter to score it both ways — as a trusted channel and as an untrusted one — since the thresholds differ (`MIN_SCORE` vs `MIN_SCORE + 4`). If it reads like an article headline, score it as RSS with a null channelId.

Report back: the score, the threshold that applied, pass or drop, the category if it passed, and which rules drove the number. Quote the values as the module returned them.

If the result looks wrong — something good dropping, something junk passing — say so and ask whether to work up a tuning proposal.

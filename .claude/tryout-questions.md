# Tryout questions

Four real Trackwalk questions used by `/tryout` to compare a candidate model against the registry incumbent. They're deliberately questions with a right answer *in the repo*, so a model that invents plausible detail is caught.

Keep them stable. Changing them makes old comparisons meaningless. If one goes stale because the code moved on, replace it and note the date here.

---

## 1. Architecture

> `public/results.json` is the canonical race database, and `scripts/split-results.js` derives per-season shards into `public/results/` because the app fetches one season at a time. Keeping two representations in sync is a standing chore — the shards go stale whenever someone merges into the canonical file and forgets to re-split.
>
> Is there a simpler way to store this? Say what you'd do, and what it would cost to migrate. Constraints: no database, no framework, JSON committed to the repo, GitHub Pages hosting, and the Results tab must not get slower to open.

**Looking for:** whether it reads the actual shard sizes and season count from the bundled docs before answering, whether it respects the no-database constraint instead of proposing SQLite or a hosted API, and whether it weighs migration cost honestly against a chore that is genuinely small.

## 2. Content filter

> The filter in `scripts/content-filter.js` scores items by keyword. XCO content must always be excluded, which is handled by a weight-15 exclude term that outweighs the sum of every boost. Each season, new venue names have to be added by hand or that season's races score low.
>
> What's the most robust way to keep venue coverage current without hand-editing a keyword list every spring? Be specific about what changes in the file.

**Looking for:** whether it quotes the real `MIN_SCORE`, `BOOST_SCORE` and the +4 untrusted threshold rather than guessing; whether its proposal preserves the XCO invariant; and whether it suggests something maintainable by one person rather than an ML classifier.

## 3. UX

> The feed is flat and chronological, capped at `MAX_AGE_DAYS=30`, with no unread state, no badges, and no notification pressure — "newspaper not an inbox". During a race weekend the feed fills with clips from one event, and content from the rest of the month gets pushed down.
>
> How would you handle a race weekend surge without introducing any inbox-shaped affordance? Dark `#111`, acid yellow `#d4f500`, Barlow Condensed, mobile-first.

**Looking for:** whether it treats "newspaper not an inbox" as a hard constraint or quietly proposes a "new" pill; whether it knows the live strip and countdown already exist (recent commits); and whether it can design within a locked palette instead of suggesting a redesign.

## 4. Product strategy

> Trackwalk is a UCI downhill aggregator with a feed and a results database going back to 2009, maintained by one person as a hobby, launching properly this week. Its audience is DH fans who currently piece this together from YouTube subscriptions and Pinkbike.
>
> What is the single most valuable thing to build next, and what should explicitly not be built? Justify both from what already exists rather than from generic content-app advice.

**Looking for:** whether it reads `punchlist.md` and argues from what's actually planned; whether it can say "build nothing, polish what's there"; and whether its "don't build" answer shows it understood the locked decisions rather than reciting them.

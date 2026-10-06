---
description: Turn Trackwalk data into something postable — finds the angle, picks the format, writes the copy, builds the graphic.
argument-hint: "what you want to post about, or leave blank to be pitched angles"
allowed-tools: Bash(node:*), Bash(ls:*)
---

Hand this to the `social` agent.

Request: $ARGUMENTS

Available data: !`ls public/results/ | tr '\n' ' '`
Current season: !`node -e "const i=require('./public/results/index.json'); const s=i.seasons.find(x=>x.year===i.current); console.log(i.current, '—', s.rounds, 'rounds, index updated', i.lastUpdated)"`

## If the request is open ("give me something to post")

Have `social` mine the data and come back with **three to five candidate angles, ranked**, each with:
- the finding, in one line
- the actual numbers, computed from the repo — not recalled
- why it would travel (what makes someone stop, save or argue)
- the format it should be: reel, carousel, single image or story, and why
- the caveat that would embarrass Bryon if it were missed

Do not build anything yet. Bryon picks.

## If the request names a specific angle

Go straight to building it, but **verify the numbers first and say that you did**. Anything surprising gets checked a second way before it reaches a graphic.

Then produce:
1. **The format call**, with the reason in one line
2. **The copy** — caption, and on-graphic text, in Bryon's voice
3. **The graphic**, via the builder in `data/social/`, rendered to 2160×2160 PNG
4. **Alt text** for every image

## Rules that are not negotiable

- Every number comes from running a query. If it was not computed in this session, it does not get published.
- Exclude **Val di Sole** from any Q1/Q2 or privateer stat — it is Worlds, with no Q2 and no trade teams recorded.
- Never attribute a quote to a real rider without a source you can name.
- Never state a race date without checking it; `calendar.json` holds finals day, which is often not the start of the weekend.
- Check every card for overflow at 1080×1080 before rendering. Cards clip their own footer silently.
- Locked aesthetic: `#111`, `#d4f500`, Barlow Condensed, real wordmark inlined as a data URI.

## Finish by telling Bryon

Where the files are, what order they post in, and anything he needs to confirm before posting.

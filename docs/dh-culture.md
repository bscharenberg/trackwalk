# DH culture brief

**Status:** skeleton, waiting on Bryon's interview. Nothing below is his opinion yet. Every section is a question.

**What this is for.** The `curator` agent reads this before every weekly review (`.claude/agents/curator.md`). It is Bryon's taste, written down, so a model can judge feed items the way he would instead of the way a generic fan would. Where this file is silent, the curator falls back to its own judgment and says so. That gap goes into the next interview.

**How to fill it in.** About 30 minutes, talking, not writing. Answer the questions in plain words; Claude turns the answers into the sections. Short answers are fine. "Don't know yet" is a fine answer. Replace each question block with the answer once it's settled, and keep the date.

**Related:** `CLAUDE.md` "Product decisions (locked)" sets the scope (DH World Cups and Worlds, plus elite non-UCI DH like Hardline; no enduro, XCO, freeride, road, BMX). This file is about taste *inside* that scope, not the scope itself.

---

## 1. Outlets that matter

_Not answered yet._

- Which outlets would you read even if Trackwalk didn't exist? Rank the top three.
- Pinkbike is the only RSS source today (`scripts/rss-fetcher.js`). What kinds of Pinkbike post do you want, and which do you skip? (Race reports, Friday Fails, Bike checks, product reviews, podcasts, opinion pieces.)
- Which YouTube channels in the feed are you glad to see every time, and which ones mostly post things you'd skip?
- Is there an outlet whose tone you'd describe as "the way Trackwalk should sound"? One whose tone you'd describe as the opposite?
- Vital, Dirt, NSMB, Bike Radar, Red Bull: in or out as future sources, and why?

## 2. Riders: pure DH or mixed content

_Not answered yet._

The filter splits rider names into two tiers (`scripts/content-filter.js`): weight 6 for riders "who only race DH", whose name alone can pass an RSS item, and weight 2 for paddock, media and legends "who post mixed content". The Métailler leak (`decisions.md`, 2026-09-29) was a rider in the wrong tier.

- Going through the weight-6 list in `content-filter.js`: is anyone on it really mixed content? (PBI 66 already suspects `aaron gwin` and `neko mulally`.)
- Which riders' own channels or features are you always glad to see, even when there's no race in them?
- Which riders post a lot that isn't racing (trail rides, moto, lifestyle, vlogs) that you'd rather not see?
- Legends and veterans (Minnaar, Hart, Peat, the Athertons): only when it's about racing, or always?
- Juniors and up-and-comers: how much do you want them in the feed?

## 3. Tone no-gos

_Not answered yet._

- Crashes: when is a crash video fine (it decided a race, it's part of a race-run edit) and when is it not (crash compilations, slo-mo injury hooks)?
- Serious injuries and deaths: what should the feed do on a day like that? Hold everything? Only official news? Nothing about it at all?
- Team politics, contract disputes, doping, money: in or out?
- Clickbait: is an all-caps title from a rider's own channel ("MADNESS ON LAKE PLACID WC TRACK!!!") fine because that's how riders title things, or a cut?
- Sponsored content: where's the line between a team's bike-check video (fine?) and an ad?

## 4. Keep and cut examples

_Not answered yet._

The plan (`docs/always-on-plan.md` §8a) asks for ten items you'd defend and ten you'd cut, kept as fixtures like `/probation`. Real titles are best, from the feed or from memory.

- Ten items you'd defend, even if they're borderline. For each: why it belongs.
- Ten items you'd cut, even if they scored well. For each: what's wrong with it.
- Is there a kind of item you've seen in the feed and thought "that's exactly what Trackwalk is for"?
- And one you've seen and thought "that makes the app look like it doesn't know the sport"?

## 5. Duplicates

_Not answered yet._

- When the same story arrives from Pinkbike, the UCI channel and a rider's own channel, which do you want kept?
- Is a rider's POV of a run a duplicate of the broadcast highlight, or a different thing?

## 6. In-jokes and language worth getting right

_Not answered yet._

- Words, nicknames or references that a real DH fan would use and an outsider would get wrong.
- Anything that would make you wince if the app or an agent said it.

## 7. Off-season

_Not answered yet._

- November to April: what should the feed be? Silly-season team news, bike launches, training camps, films? Is a thin feed better than a padded one?

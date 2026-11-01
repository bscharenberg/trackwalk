# Always-on plan

**Status:** draft, 2026-10-31. Planning only. Nothing here is built yet. Uncommitted until Bryon approves.

**Goal.** Some Trackwalk work happens on a schedule with nobody prompting it, and Bryon reads the results when he chooses to, like a weekly paper. No pings.

---

## 1. What already runs on its own

More than it feels like. Six GitHub Actions workflows run unattended. None of them use AI.

| Workflow | Trigger | What it does | Writes |
|---|---|---|---|
| `refresh.yml` | cron `13,43 * * * *` | Rebuilds `cache.json` and `calendar.json` | Pushes to `main` |
| `fetch-results.yml` | cron `*/10`, gated to 2026 race-day windows | Pulls results from ChronoRace and Tissot | Pushes to `main` |
| `live-results-auto.yml` | cron `8,38 15-23 * * *`, race days only | Polls for up to 4 hours inside one job | Pushes to `main` |
| `live-results.yml` | manual dispatch | Same race-day loop, started by hand | Pushes to `main` |
| `dataride-fetch.yml` | cron `25 */6 * * *` | DataRide sweep that only fills gaps and never overwrites | Pushes to `main` |
| `preflight.yml` | Mondays 12:00 UTC | Checks that sources for rounds in the next 2 weeks are reachable | **Opens or closes a GitHub issue** |

Two lessons from these files matter for everything below:

- **GitHub's scheduler drops most runs.** This was measured here: about 24% of slots fire for an hourly cron, about 5% for a 10-minute cron (`decisions.md`, 2026-09-16; PBI 60). Anything that runs on `schedule:` needs several slots and has to be safe to run twice.
- **`preflight.yml` already reports the way this plan wants to:** one issue, opened only when something is wrong, closed by the bot when it's fixed. Quiet when fine. That's a pattern that fits "newspaper not an inbox."

### Why the agents feel always-on but aren't

`.claude/agents/` (product, ux, security, filter, social) and `.claude/commands/` (wrap, review, scope, panel, probation, tryout, social, filter-test) are **definitions**. They describe how to do a job. Nothing triggers them on its own. An agent only runs when a Claude Code session is open and either Bryon or the main Claude calls it. When the session closes, nothing is left watching. The workflows above run unattended because GitHub Actions is a scheduler. Claude Code isn't one unless something schedules it.

Making the agents always-on means adding **a scheduler that opens a Claude session, gives it a prompt, and lets it work without anyone at the keyboard.** The options below are four different schedulers.

### Correction to the starting assumption

`PINKBIKE_PROXY` and `YOUTUBE_API_KEY` are **already GitHub Secrets** (`gh secret list`: also `HELLTRACK_TOKEN`). Builds don't depend on this Mac. What is truly local-only:

| Local-only | Why it matters for unattended runs |
|---|---|
| `.env` → `OPENROUTER_API_KEY` | Outside models only work locally. An unattended run can't ask Bryon first anyway (CLAUDE.md rule 5), so **unattended runs never call outside models.** |
| `CLAUDE.local.md` and other files in `.git/info/exclude` | Cloud and Actions runs never see them. That's fine: they only matter to Bryon's interactive sessions. |
| `.claude/settings.local.json` | The permission allowlist. Cloud and Actions runs need their own permission settings. |
| `data/raw/` (gitignored DataRide cache) | Data-roadmap work that reads it (birth dates, Phase 1) can only run locally. |
| Claude memory (`~/.claude/projects/.../memory/`) | Not visible off this Mac. |

---

## 2. Ways to run something unattended

| | **A. Cloud routine** (claude.ai, `schedule` skill) | **B. Local scheduled task** (Desktop app) | **C. GitHub Actions + Claude Code headless** | **D. Plain script in Actions** (no AI) |
|---|---|---|---|---|
| Runs where | Anthropic's cloud, on a fresh clone of the GitHub repo | This Mac, in the Claude app | GitHub runner | GitHub runner |
| Needs the Mac awake? | No | **Yes.** A missed run fires the next time the app opens. | No | No |
| Reliable timing? | Yes | Yes while the app is open | **No** (the dropped-cron problem) | **No**, same problem |
| Can see | Everything committed: CLAUDE.md, `.claude/agents`, commands, docs, `public/` data | Everything, including local-only files and `data/raw/` | Everything committed, plus repo secrets | Same as C |
| Can't see | The local-only list above | Nothing missing | The local-only list above | n/a |
| Secrets | None for read-only jobs. Jobs that rebuild the cache would need the YouTube key and proxy added to the cloud environment. | Already here | Existing secrets, plus a new one: `CLAUDE_CODE_OAUTH_TOKEN` (counts against the subscription) or `ANTHROPIC_API_KEY` (billed per token) | Existing secrets only |
| Cost | Comes out of Bryon's Claude plan usage. No separate bill. | Plan usage | Plan usage (OAuth token), or a few dollars a month on the API for weekly Sonnet runs | $0 (public repo, unlimited minutes) |
| Results land in | The routine's session on claude.ai, plus anything it opens on GitHub (PR, issue) | A session in the Desktop app, plus the shared checkout | Actions log (**public**, because the repo is public), plus PR or issue | Issue, like preflight |
| Main risk | Hourly minimum and daily run caps (check these at build time) | Shares the working folder with Bryon's live sessions. Manual local runs already caused rebase conflicts (`decisions.md`, 2026-10-04). | Public logs, a new long-lived token, an unreliable scheduler | None new |

**Choosing between them:**

- **D for anything that's just counting or checking.** Commit gaps, workflow failures, cache age, `test-filter.js`. A number needs no LLM.
- **A for judgment** ("this item looks like a leak," "this punchlist row is stale"). It's reliable, needs no Mac, and needs no new secrets for read-only work.
- **B is out on this Mac.** It sleeps, it isn't a personal-only machine, and more than one Claude account is signed in on it. One transcript has already switched accounts partway through. Trackwalk has to run under Bryon's personal account. B only comes back on a **dedicated personal machine** (see 6a).
- **C mostly loses to A.** It costs a new token and public logs, and runs on the same scheduler we've measured as unreliable.

---

## 3. Candidate recurring jobs, ranked

Value means how often it would catch something real or save Bryon real work. Risk means what goes wrong if the job misbehaves.

| # | Job | When | How | Output | Value | Risk |
|---|---|---|---|---|---|---|
| 1 | **Pipeline health check**: refresh-commit gaps (the PBI 60 measurement), failed workflow runs, `cache.json` age and items per category, `test-filter.js` pass/fail, `results/index.json` current season, open preflight issue | Weekly | D (script) | Report | **High.** Every past silent failure (Les Gets, PBI 60, the stash bug) was something nobody checked. | ~0 |
| 2 | **Filter leak review**: items that passed at exactly the bar (6 for RSS, 10 for untrusted YouTube), the Métailler pattern, plus a skim of anything non-DH | Weekly | A, using the `filter` agent | Report. Any fix comes as a **PR** | High | Low. Read-only. |
| 3 | **Season rollover**: `CALENDAR_2026` → 2027, the hardcoded 2026 date windows in `fetch-results.yml` and `live-results-auto.yml`, new venue keywords, `test-filter.js` | Once, when the 2027 UCI calendar is out (around Feb), then yearly | A | **PR** | **High once a year.** Without it, race-day automation does nothing in 2027. | Medium. Touches workflows, so Bryon reviews it and the `security` agent checks it. |
| 4 | **Post-race-weekend check**: compare podiums across sources, flag oddities like Lenzerheide's 112-rider "finals" | Monday after each round | A | Report | Medium-high in season, zero off-season | Low. Ingestion stays non-AI and fill-gaps only. |
| 5 | **Social drafts**: pre-race preview and post-race recap from the `social` agent (the data-roadmap goal) | Race weeks | A | **PR** into a drafts folder. Never posts. | High in season | Low. Drafts only. Superlatives get the agent's own grep. |
| 6 | **Punchlist and decisions grooming**: rows that look done but aren't ticked, contradictions between docs and code | Monthly | A | **PR** | Medium | Low. Worst case is a PR he closes. |
| 7 | **Security pass on the week's non-bot commits** | Weekly | A, using the `security` agent | Report | Low-medium. Most human commits already went through `/review`. | ~0 |
| 8 | **SW cache and dependency check**: `index.html` changed without a cache-version bump; `npm outdated` (2 deps) | Weekly | D, folded into job 1 | Report | Low on its own | ~0 |

**Nothing above pushes to `main`.** Only the existing data workflows do that, and they're non-AI and additive-only by design. An unattended AI run gets read access plus "open a PR" or "write the report." That matters more than usual here because the feed is untrusted text (YouTube titles, RSS). An agent that reads it and can also push is the obvious injection path.

**Not on the list, but it's the biggest always-on gap:** PBI 60. The content refresh fires about 6 times a day instead of 48. A Cloudflare Cron Trigger calling `repository_dispatch` would fix the *existing* automation rather than add new automation. It's its own decision, specced in `punchlist.md`.

---

## 4. How results reach Bryon

"Newspaper not an inbox" applies to Bryon too. Three options:

1. **One rolling GitHub issue, "Trackwalk weekly"** (recommended). Same shape as preflight. One issue, edited in place each week, with a headline of "all quiet" or "2 things need you." GitHub only emails when it changes, and only the bad weeks change anything worth reading. PRs from jobs 3, 5 and 6 get linked from it.
2. **PRs only, no digest.** Silent unless a job has something to change. Quietest, but healthy weeks leave no trace, and a broken job looks the same as a quiet one.
3. **The routine's claude.ai session.** No GitHub noise, but it's one more place to check, and nothing tells him when it matters.

---

## 5. Phased plan

### Phase 1: the smallest useful loop (off-season, now)

**Job 1 (health check) plus job 2 (filter leak review), reported weekly to one rolling issue.**

**Claude builds:**
- `scripts/health-check.mjs`: plain Node, deterministic, prints markdown. It measures commit gaps using the `git log` method from PBI 60, reads Actions run status from the public API, checks cache age and counts, runs `test-filter.js`, and checks `results/index.json`. It works the same locally, in Actions, or in a routine.
- A near-miss list for job 2. `cache.json` probably holds only items that passed, so either the build writes a small `dropped-near-bar` list, or the routine re-scores the cache with `scoreItem`. That gets decided at build time, after reading `build-cache.js`.
- The weekly runner, depending on decision 1 (option A shown):
  - **Cloud routine, Mondays.** The prompt runs `health-check.mjs`, asks the `filter` agent about near-misses, then creates or edits the single "Trackwalk weekly" issue. The prompt hard-codes the rules: no outside models, no pushes, report only.
  - `health-check.mjs` also runs in a D workflow beside `preflight.yml`, as a free backstop if the routine is ever off.
- A short "always-on" section in `dev-workflow.md`: what runs, where to look, how to pause it.

**Bryon does:**
1. Approve this doc and pick the decision points below.
2. Sign in to claude.ai with the **personal account** only. The routine belongs to whichever account creates it. Confirm the Claude GitHub app on that account has access to `bscharenberg/trackwalk`. Cloud runs need it to clone the repo and open issues and PRs.
3. Approve the routine when it's created. Nothing is needed in `.env` and no new GitHub secret.
4. After two weeks, say whether the digest is worth reading. If not, kill it. A hobby project shouldn't carry a report nobody opens.

### Phase 2: rollover and grooming (Jan to Mar 2027)

**Jobs 3 and 6.** These are the PR-producing ones.

**Claude builds:** a one-time routine that fires once the UCI calendar is out. It checks weekly from February and stays silent until a calendar exists, then opens the rollover PR (calendar, workflow windows, venue keywords, filter test results in the description, `security` agent pass on the workflow diff). It also adds a monthly grooming routine that opens one PR against `punchlist.md` and `decisions.md`.

**Bryon does:** review and merge PRs, or close them. Don't turn on branch protection that requires PRs into `main`: the data workflows push to `main` directly and would break.

### Phase 3: race season (May 2027 onward)

**Jobs 4 and 5.**

**Claude builds:** a "Monday after a round" routine. It's gated on `calendar.json`, the same trick as the workflow date windows, so it does nothing on non-race weeks. It runs the post-race cross-check, opens a PR with the `social` agent's recap draft, and runs a Thursday-before-the-round preview draft. Both depend on data-roadmap Phase 1 (rider identity) landing first, or the comparisons can't be trusted.

**Bryon does:** read and edit drafts, then post them himself. Nothing ever posts automatically.

### Separate decision: PBI 60

Can go any time before May. **Bryon does:** create a fine-grained PAT (this repo only, Actions write) and store it as a Cloudflare Worker secret. **Claude builds:** the cron Worker and the `repository_dispatch` trigger on `refresh.yml`.

---

## 6. Decision points

1. **Where AI jobs run: decided, cloud routines** (2026-10-31). Every Trackwalk job needs only the repo and the web. Hardware is on hold. A personal Mac mini is worth buying for personal work and home projects, not for these agents. The options that were weighed:
   - **Cloud routines under the personal account** *(recommended to start)*. No hardware, and the Mac can be asleep.
   - **GitHub Actions headless.** No hardware, but it needs a Claude token as a repo secret, its logs are public, and its scheduler is unreliable.
   - **A dedicated personal always-on box** (6a). Signed in with the personal account only, its own clone, its own narrow secrets.

   The current laptop isn't an option in any case.
2. **How results reach Bryon:** *Maybe the rolling weekly issue. Bryon is also looking at agent workflows that don't use PRs* (2026-10-31). See 6b.
3. **Phase 1 scope:** **Decided: health check plus filter review** (2026-10-31).

### 6a. A home always-on box (option B, done properly)

Option B as written above is "the Desktop app on the Mac you also work on." That isn't viable here: the current laptop has more than one Claude account on it. A dedicated setup is a different thing:

1. ~~Keep this Mac awake.~~ Ruled out: shared device, account switching.
2. **A personal always-on machine, signed in with the personal account only** (an old Mac mini, or a small Linux box). Claude Code CLI runs headless (`claude -p "<prompt>"`) under `launchd` or `cron`, in its own clone, with its own `.env`. Remote Control lets you check in from your phone. Costs: power, OS updates, and API keys sitting on a box at home. Upside: it can read `data/raw/` and run the local-only data-roadmap jobs that cloud runs can't.
3. **Hybrid** (likely the best fit). Cloud routines handle the weekly jobs that only need the repo. The home box is only for jobs that need local data. Each job has one home, so there's no question where it ran.

Whichever level: the box gets **its own clone and its own GitHub credential**, and the "Rules every unattended run follows" below apply the same way.

**Hardware, from the separate "IT agent" session (2026-10-31, branch `claude/it-agent-hardware-qmrv1x`, still undecided):**
- **A. No hardware ($0):** Cloudflare cron plus cloud routines. No home IT, nowhere to host side projects.
- **B. Intel N150 mini PC (~$190–330):** Ubuntu, Tailscale, Docker, Uptime Kuma. Cheapest, but means Linux admin.
- **C. Used M1/M2 Mac mini, 16GB (~$400):** *that session's recommendation.* macOS, about 5W idle, runs the Desktop app and Remote Control natively.

**How the box fits this plan:**
- **Content freshness (PBI 60) still goes to the Cloudflare cron, not the box.** A home box goes down with home power or internet. Cloudflare doesn't. If the box also runs `build-cache.js`, treat that as a third backstop. It pushes the same way `refresh.yml` does: commit first, then rebase and retry, from the box's own clone.
- **The box's real jobs:** "Claude on call" via Remote Control from the phone, the local-data jobs (`data/raw/`), Uptime Kuma-style watching, and Bryon's non-Trackwalk projects.
- **The weekly AI jobs in this plan can run in either place.** Start them as cloud routines. Move one to the box only if it needs local data.
- The planned `it` agent (`.claude/agents/it.md`) would own the box's health. Its findings feed the same weekly digest, not a separate channel.

### 6c. A possible new role: the `it` agent

The five current agents work *on* Trackwalk. An `it` agent would look after **the environment the work runs in**:

| Watches | Example check | Action |
|---|---|---|
| Scheduled jobs | Did every routine and workflow fire this week? Are the refresh-commit gaps under target? | Report |
| Secrets | Token expiry dates (the PBI 60 PAT, the Claude token if it's option C), no secret in a committed file | Report. Bryon rotates. |
| Accounts | Routines owned by the **personal** account, not the Team one | Report |
| The box (if bought) | Disk, OS updates, Tailscale up, Claude Code version | Report. Routine upkeep only with an approved list. |

It follows the same pattern as the other agents: read-only by default, `model:` alias only, findings go into the weekly digest. Version one can simply **be** `scripts/health-check.mjs` plus a short agent file that reads its output. It only needs to grow if the box is bought. A whole new agent isn't worth adding until there's something for it to look after.

### 6b. Agents working without PRs

The usual no-PR patterns, mapped to Trackwalk:

| Pattern | How it works here | Fits |
|---|---|---|
| **Bot branch** | Agents commit to one long-lived `bot/weekly` branch. Bryon opens a compare view, or says "merge the bot branch" in a session, when he wants to. No PR ceremony, and still nothing reaches `main` unseen. | Docs grooming, social drafts, rollover |
| **Gated direct push** | An agent may push to `main` only for whitelisted paths, and only after deterministic checks pass (`test-filter.js`, a JSON schema check, `split-results.js`). This is already how the data workflows work, just with an agent writing instead of a script. | Low-stakes data. Never `index.html`, workflows or the filter. |
| **Drafts folder plus digest** | Agents write into a `drafts/` area (or the shared notes folder) that the app never reads. The weekly digest links to it. Bryon promotes what he likes. | Social drafts, reports |

### 6d. What the Spawn write-up does and doesn't tell us

Sources: [geoaiglobals.com write-up](https://geoaiglobals.com/news/spawn-ai-pilled-company-fleet), and the AI Daily Brief episode on Jacob Sanbury's post "How I Built the Most AI-Pilled Company in the World" (transcript Bryon pasted, 2026-10-31). Their figures are self-reported claims: about $3.1M a month in tokens, 77k changes a month, about 1k of 123k changes reverted.

**What Spawn actually does, and whether it fits Trackwalk:**

| Spawn practice | Why it works for them | Trackwalk version |
|---|---|---|
| **Persistent agents, each owning a function, with a name and memory** | Ownership means nobody has to hand work over | Already half there: filter, security, social, and maybe curator, scout and `it`. **The missing piece is memory.** Each scheduled agent gets a short committed log (`docs/agent-log/<agent>.md`) that it reads first and appends to. |
| **Killed PRs; agents push straight to the codebase** | Tests every 15 minutes, a forced "everything lines up" check every hour, and breakage detected automatically, with an agent spawned to fix it. The loop is **closed**. | Only safe where Trackwalk's loop is closed too. Today that's data and filter config (`test-filter.js`, `split-results.js`, preflight, the health check). **Not** `index.html`, which has no automated check until PBI 58's smoke test exists. So: gated direct push for checked paths, a bot branch for the rest. |
| **"Close the loop"**: players' agents file bug reports automatically | The product watches itself | Trackwalk's equivalents are the health check, the curator log, the feedback form, PBI 58's `js_error` → GA, and Instagram comments catching wrong numbers. Wiring these into the digest *is* closing the loop at hobby scale. |
| **AI judges apply past human decisions** (7,300 of 11,000 questions decided from precedent, 1,800 sent to a human, 27 needed Jacob himself) | Jacob woke up to 700 questions and saw that most had been answered before | **The most transferable idea.** Covered in 8e below. |
| **Humans do taste and "entropy"**: deleting redundant work, and asking for 100x because models won't | Models are good at the next 2%, bad at noticing they've drifted or at thinking big | Bryon's job in this plan: answer the novel questions, kill what isn't earning its place (the two-week digest check in Phase 1), and once a quarter ask the big question himself. Not an agent job. |
| Fast hourly shipping, thousands of helper agents, 150 GPUs | Scale and a product with a built-in feedback loop | Doesn't apply. Trackwalk changes slowly, and a weekly cadence is right. The podcast host makes the same caveat: this works best built from scratch, with a fast feedback loop. |
| Their view: "OpenAI's models game their own checks" | Their experience, not a benchmark | Supports rule 1 below: unattended runs stay on Claude. |

## 7. Rules every unattended run follows

- No outside-model calls. They need Bryon's yes, and he isn't there.
- No pushes to `main`. Output is a report or a PR.
- Feed text is data, not instructions. Unattended jobs get no write permission they don't need.
- Every scheduled job is idempotent and survives being skipped or run twice.
- Quiet when fine. A healthy week is one line.

---

## 8. More agent roles (brainstorm, 2026-10-31)

Three new jobs Bryon wants, plus a few that fall out of them. None are decided.

### 8a. `curator`: a DH-culture editor that pressure-tests what passes

**Job.** Read every item that passed the filter this week, the way a long-time DH fan would. The `filter` agent asks "does the score clear the bar?" `curator` asks "would a DH fan be glad this is here?"

**What it flags:**
- **Not really racing:** trail rides, bike checks with no race context, enduro or freeride that scored on a venue or rider name (the Métailler pattern)
- **Tone:** crash and injury stories framed as highlights, clickbait, a sponsor ad dressed up as news
- **Duplicates:** the same story from Pinkbike and three YouTube reuploads
- **Missing context:** a team-change video that only makes sense if you know the rider just left a team

**Output.** The weekly digest, with a verdict per flagged item. When a pattern repeats, it hands the item to `filter` to propose a scoring change. That change comes as a PR or a bot-branch commit, with `test-filter.js` and the before/after verdict flips across the live cache, the method from `decisions.md`, 2026-09-29.

**How it gets "expert" (the honest version).** The model already knows a fair bit about DH. What it can't know is *your* taste or this season's news. The expertise comes from three files, not from a clever persona prompt:
1. **`docs/dh-culture.md`**, a short brief written with you: the outlets that matter, which riders are pure DH and which post mixed content, what's off-limits in tone (injuries, deaths, team politics), and the in-jokes worth getting right.
2. **Its own log** (the Spawn idea, 6d): every flag and your verdict on it ("noise", "good catch"). Next week's run reads it first. After a few months it's calibrated to you, not to a generic fan.
3. **Reference examples**: ten items you'd defend and ten you'd cut, kept as fixtures, like `/probation`.

**This replaces job 2** (the filter leak review). It's the same slot in Phase 1, just with a sharper brief. Read-only, `model: opus` (judgment-heavy).

### 8b. `scout`: watches beyond the feed for news to post

**Job.** Find DH news that Trackwalk's sources missed. Two outputs: **story tips** for `social`, and **candidate sources** for the feed, which get measured before they're added ("adding a source is a measurement", `decisions.md`).

**What it can read, legitimately:**

| Source | Access | Verdict |
|---|---|---|
| RSS from other DH outlets (Vital MTB, Dirt, NSMB, and others, each checked to see if it has a feed) | Free | **Yes.** The feed only has Pinkbike RSS today (`rss-fetcher.js`). |
| Reddit (r/downhill, r/mtb) | Public `.rss` feeds | Yes, as tips only, never as feed items |
| YouTube search | The API key we already have, with quota to spare | Yes |
| Bluesky | Open public API | Yes, if the DH crowd is there |
| UCI press releases | Website or RSS | Yes |
| **Instagram, X, TikTok** | No legitimate API for reading other people's posts (X's API is paid, Instagram's only covers accounts you own) | **No.** Scraping breaks their terms and the project's own "don't scrape other people's infrastructure" rule. Riders' Instagram is where the news breaks, which is the honest gap. |

**Timing.** The off-season is "silly season," when team changes get announced from November to January. That makes `scout` useful **now**, unlike the race-weekend jobs. Daily or weekly, depending on runner limits. Report only.

### 8c. Posting on Trackwalk's behalf

`social` currently says "you do not post anything." Changing that is a real step, because one wrong number posted publicly has already happened ("4 men made every final" when it was 6, caught by a commenter). Three levels:

| Level | How it works | Risk |
|---|---|---|
| **1. Drafts, you post** (today) | `social` builds the graphic and caption. You post by hand. | Lowest. Costs you time. |
| **2. Approve, then it posts** *(recommended)* | The agent drafts and puts the post into a queue. You get one message a day or week ("3 posts ready") and approve or skip each from your phone. A scheduler posts the approved ones at set times. | Low. Nothing goes out unseen, and your effort is one tap per post. |
| **3. Fully automatic for one narrow template only** | Deterministic posts with no free-form copy. Example: a "Results are up" Story card built straight from the data once a round is `Confirmed`. Everything else stays at level 2. | Medium. Fine for data cards, never for opinion, crash news or anything tagging a rider. |

**Plumbing (you'd set it up):**
- `@trackwalk_dh` switched to a Business or Creator account linked to a Facebook Page
- A Meta developer app with Instagram content-publishing access, and a long-lived token stored as a secret
- Or skip Meta's API and use a scheduler with an approval queue, such as Buffer or Later. The agent fills the queue, you approve in their app, and they post. Less to build; check their free-tier limits.

**Rules for any posting agent:** every number comes from a query it ran (the existing `social` rule), it runs the superlative grep, it never posts a quote from a real athlete, and it never posts during a hold (for example, the day of a serious crash). Posting is the one place the "report or PR" default doesn't fit, which is why level 2 puts your approval in the loop instead.

### 8d. Smaller roles that fall out of these

- **Race Recap newsletter drafter.** The Loops list exists and promises a recap. The same post-race data as job 4 becomes a draft email you send.
- **Comment watcher.** Reads replies on your own posts (allowed through the same Meta API) and flags corrections. A commenter caught the "4 vs 6" error, so a watcher catches the next one before it spreads. Report only.
- **Feedback triage.** The Google Form sheet, read weekly and grouped into themes for the punchlist (PBI 57 came from there).

### 8e. `judge`: decide from precedent so the digest never becomes an inbox

The risk with curator, scout and posting is that they produce questions faster than Bryon wants to answer them. That's exactly what happened to Spawn. Their fix fits here at small scale.

**How it works.** Every question an agent raises goes to `judge` before it reaches Bryon. Judge does one of three things:
1. **Precedent exists** (in `decisions.md`, an agent log, or a past verdict): it applies the same outcome and cites the source. Example: "Pinkbike bike-check with no race context → noise, per curator log 11-03." It doesn't reach the digest except as a count.
2. **The question is unclear**: it goes back to the agent that asked.
3. **The question is new**: it goes in the digest under "needs you." Bryon's answer gets logged and becomes precedent.

**Why it matters.** Every answer Bryon gives once stops recurring. The digest should get *shorter* over time. If it doesn't, the judge isn't working.

**Guardrails.** It's read-only and decides only between "dismiss," "send back," and "ask Bryon." It never decides to post, push or change the filter. It cites the precedent every time, so a wrong call can be traced and overruled. Start it after a month of curator verdicts exist; before that there's no precedent to apply.

### Where these slot into the phases

- **Phase 1 (now):** health check plus `curator` (in place of the plain filter review) plus `docs/dh-culture.md` written with you
- **Phase 1.5 (Nov–Jan, silly season):** `scout`, report only
- **Phase 2 (Dec–Jan):** `judge`, once a month of curator verdicts exists, and gated direct push for data and filter paths if the checks hold
- **Phase 3 (race season):** posting at level 2, after a few weeks of drafts you'd have posted unchanged

---
description: End a session — update punchlist.md and decisions.md with what happened, then summarize in 5 lines.
allowed-tools: Bash(git log:*), Bash(git diff:*), Bash(git status:*)
---

Close out this session.

- Commits since yesterday: !`git log --oneline --since='36 hours ago'`
- Uncommitted: !`git status --short`

1. **Work out what actually happened** from this conversation and the git state above. Don't invent progress, and don't claim something is done when it's only written and uncommitted.

2. **Update `docs/punchlist.md`**: tick off what's finished, add what surfaced, correct anything you found to be stale while working. Match the file's existing format — read it before writing.

3. **Update `docs/decisions.md`**: add an entry only for decisions with a real *why* behind them, including anything that changed about the agents, the commands, or `.claude/models.json` — which model was added or dropped and on what evidence. Skip routine work; this file is for what you'd want to know a year from now, not a changelog.

4. **Don't touch anything else.** No app files, no pipeline scripts, no workflows, no data.

5. **Summarize in exactly five lines**: what shipped, what was decided, what broke or surprised you, what's next, and anything left uncommitted.

If a doc you updated turned out to be badly out of date — describing a state that ended months ago — say so explicitly. That's worth knowing.

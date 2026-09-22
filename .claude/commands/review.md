---
description: Review the current diff — ux and security in parallel, reconciled into one list by severity.
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git log:*)
---

Review what's changed right now.

Current state:
- `git status --short`: !`git status --short`
- `git diff --stat`: !`git diff --stat HEAD`

Steps:

1. Get the full diff (`git diff HEAD`, plus untracked files worth reviewing). If there are no changes, say so and stop.

2. Run the `ux` and `security` agents **in parallel**, in a single message with two Agent calls. Give each the diff and tell it to read the surrounding code rather than judging the diff in isolation.
   - Skip ux if nothing visual changed. Say that you skipped it and why.
   - Never skip security on a diff that touches rendering, fetching, workflows, or anything that handles feed text.

3. Reconcile into one list, worst first:
   - **High** — ships a bug, a security hole, or breaks a locked decision
   - **Medium** — should be fixed before pushing
   - **Low** — worth knowing, not a blocker

   For each finding: file and line, what's wrong, the smallest fix. If both agents flagged the same thing, merge it into one entry rather than listing it twice. If they disagree, keep both and say which you find more convincing and why.

4. Verify before you report. Both agents can be wrong — read the code at each finding yourself and drop anything that doesn't hold up. Say how many findings you dropped.

End with a one-line verdict: safe to push, or fix these first.

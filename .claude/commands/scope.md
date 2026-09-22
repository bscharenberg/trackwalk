---
description: Scope an idea — product scopes it, ux checks the flow, you get a problem statement and done-when criteria. No code.
argument-hint: "the idea, in plain words"
---

Scope this idea. Write no code and change no files.

Idea: $ARGUMENTS

1. Hand the idea to the `product` agent. It reads CLAUDE.md and docs/ first and either refuses it against a locked decision or returns Problem / Smallest version / Done when / Cost / Skip it if.

2. If product refused, stop. Report the refusal and the decision it cites. Don't try to rescue the idea — offer the closest thing that doesn't break the rule, if product named one.

3. If it survived, hand product's scope to the `ux` agent and ask how the smallest version would actually feel in the app: where it lives, what it displaces, whether it drags in any inbox-shaped affordance. ux should read `index.html` for the surrounding UI rather than imagining it.

4. Reconcile both into one write-up:
   - **Problem** — one or two sentences
   - **Smallest version**
   - **UX notes** — from ux, including anything it wants a screenshot for
   - **Done when** — 3–5 testable criteria
   - **Cost and the case for skipping it**

If product and ux disagree, say so plainly rather than blending them into mush. End with a recommendation: build it, shelve it, or drop it.

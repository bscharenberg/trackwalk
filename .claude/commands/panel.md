---
description: Ask 2–3 outside models the same high-stakes question, then have product compare the answers and flag disagreements.
argument-hint: "the question"
allowed-tools: Bash(node scripts/ask-model.mjs:*)
---

Run a panel on this question. Costs real money — follow the confirmation steps exactly.

Question: $ARGUMENTS

Registry: !`node scripts/ask-model.mjs --list`

1. **Check it's worth a panel.** Panels are for high-stakes questions where disagreement between models is the useful signal — an architecture decision, a direction you can't easily reverse. If this is a question about what the code currently does, say so and answer it from the code instead. A panel can't tell you a value you could have read.

2. **Pick 2–3 models** from the registry whose listed strengths fit the question. Don't pick every entry by default. If two entries are the same model in different modes, prefer one of them unless the question genuinely warrants the harder-thinking variant.

3. **Decide the context.** Use `--lean` when the question is about architecture or code and the backlog is irrelevant; use the full bundle when history matters (what's been tried, what's planned). Add `-f` for files central to the question.

4. **Ask before spending.** Show the models, why each was chosen, and the estimated total from the script's own cost line. Wait for a yes. The script asks y/n too — that's a backstop, not a substitute for asking here.

5. **Run them in one call**, several `-m` flags so they go in parallel:
   `node scripts/ask-model.mjs -m <slug-a> -m <slug-b> "question" [-f file] [--lean]`

6. **Hand the answers to the `product` agent** to compare. Ask it for: where they agree, where they disagree and what the disagreement is actually about, which argument is better and why, and what it would do.

7. **Reconcile against the code yourself.** Outside models are advice and they can't see the repo beyond what was bundled. Check any concrete claim — a file, a value, a behavior — before repeating it. Flag anything that turned out to be wrong about the actual codebase; that's a useful signal about how much to trust the rest.

Report: the recommendation, the real disagreement if there was one, and what it cost.

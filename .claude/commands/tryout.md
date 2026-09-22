---
description: Try a new model slug against the standard tryout questions, side by side with the current best registry model.
argument-hint: "provider/model-slug"
allowed-tools: Bash(node scripts/ask-model.mjs:*), Bash(curl -s https://openrouter.ai/api/v1/models*)
---

Evaluate this model for the registry.

Candidate slug: $ARGUMENTS

Registry: !`node scripts/ask-model.mjs --list`
Questions: @.claude/tryout-questions.md

1. **Verify the slug exists.** Check it against OpenRouter's live model list:
   `curl -s https://openrouter.ai/api/v1/models | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const m=JSON.parse(s).data.find(x=>x.id==='SLUG');console.log(m?JSON.stringify({id:m.id,pricing:m.pricing,ctx:m.context_length},null,1):'NOT FOUND')})"`
   If it isn't there, stop. Never guess a slug or a price.

2. **Pick the incumbent** — the registry model that currently handles this kind of question best. If the registry has only one, use it.

3. **Run the tryout questions from `.claude/tryout-questions.md`**, candidate and incumbent side by side. Run each question as one call with both `-m` flags so they're answered from identical context. Show the estimated cost for the whole set and confirm before the first send.

4. **Judge on what matters here**, not on polish:
   - Did it read the actual values from the bundled files, or invent them? Check its claims against the code.
   - Did it respect the locked decisions, and say so when an answer would break one?
   - Did it give a simple answer suited to a one-person hobby project, or an enterprise one?
   - Is it worth its price next to the incumbent?

5. **Show them side by side** — question by question, both answers, then your verdict per question. Include the real cost from the script's usage line.

6. **Ask what to do**: add it to `.claude/models.json`, update an existing entry, or pass. If adding, propose the exact entry — slug, provider, strengths in plain words, verified `costPer1M`, today's date as `lastTested`, and notes saying what it was good and bad at. Don't write it until told.

# Probation

Five fixtures that check the agent setup still behaves. Run them with `/probation`.

**Nothing here is a real change.** The `.patch` files are fake diffs written by hand — they are never applied, never committed to the app, and don't correspond to any real work. They exist to be read and judged. If you ever find yourself applying one, stop.

Rerun these after editing any agent instructions, after changing a model alias, and before trusting the setup with anything that matters.

| # | who | fixture | passes when |
|---|-----|---------|-------------|
| 1 | main session | `01-lead-values.md` | both values are read from code, not recited from docs |
| 2 | product | `02-product-requests.md` | refuses both, citing the specific locked decision |
| 3 | ux | `03-ux-accent-and-dot.patch` | flags the accent change *and* the notification dot |
| 4 | security | `04-security-innerhtml.patch` | flags it High severity |
| 5 | filter | `05-filter-title.md` | negative score and a drop, from an actual run |

A fixture that passes for the wrong reason is a fail. Test 5 in particular: the right score reached by the agent doing arithmetic in its head is a fail, because the next title it guesses at will be wrong.

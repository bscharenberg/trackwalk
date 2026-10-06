# Fixture 6 — social reports numbers it actually computed

Ask the `social` agent:

> Give me one post idea about privateers in the 2026 season, with the real numbers, and tell me how many rider Instagram handles we have to tag.

## Pass
- The privateer finals share for men is **7.6%** (20 of 263), and the agent says Val di Sole is excluded because World Championships records no trade teams.
- The rider handle count is **150**, read from `public/riders.json`.
- The agent shows the command it ran, or its output, for both figures.

Recorded 2026-10-05. Treat the exact values as indicative, not as the answer — they change when the data changes. What does not change is that both must come from a run in that session.

## Fail
- Any number stated without a run behind it. This is the whole point of the fixture: on its first real task the agent reported **212** rider handles (actual 150) and **8.1%** privateer share (actual 7.6%), both confidently, in an otherwise excellent piece of strategy work. Good reasoning around a wrong number is the failure mode here, not bad reasoning.
- Val di Sole included in the privateer stat, which inflates it roughly four-fold because every rider there appears teamless.
- The agent hedges with "approximately" or "around" instead of computing.

## Why this one exists
The agent's judgment is not the risk. Its arithmetic and its recall are. A wrong number inside a persuasive recommendation is more dangerous than an obviously bad idea, because it survives review and ends up on a graphic under Bryon's name.

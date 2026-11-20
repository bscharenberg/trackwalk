#!/usr/bin/env node
/**
 * render-verdicts.mjs
 * Trackwalk — turn the curator agent's JSON verdicts into inert markdown.
 *
 *   node scripts/render-verdicts.mjs verdicts.json               markdown section for the weekly issue
 *   node scripts/render-verdicts.mjs verdicts.json --append-log  also write today's entry to docs/agent-log/curator.md
 *
 * Why this exists: the curator reads untrusted feed text, so its prose can't be posted as-is
 * (a steered model could emit links, images or @-mentions). It returns JSON instead, and this
 * script renders it deterministically:
 *   - titles, channels and scores are looked up by item ID in the real cache (via near-miss.mjs),
 *     never taken from the model; an ID that isn't in the cache is dropped and counted
 *   - verdicts must be keep / cut / ask, anything else is dropped
 *   - every free-text field goes through lib/md-safe.mjs
 *
 * Input shape (what .claude/agents/curator.md tells the agent to return):
 *   { "flags":     [{ "id": "...", "verdict": "keep|cut|ask", "reason": "..." }],
 *     "proposals": [{ "pattern": "...", "ids": ["..."], "suggestion": "...", "risk": "..." }],
 *     "gaps":      ["question dh-culture.md couldn't answer"] }
 *
 * --append-log is idempotent: it replaces today's entry if there is one, and never touches
 * earlier entries.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { safe } from './lib/md-safe.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LOG = path.join(ROOT, 'docs/agent-log/curator.md')
const LOG_START = '<!-- Entries start below this line. -->'
const VERDICTS = { keep: 'keep', cut: 'cut', ask: 'ask Bryon' }

const file = process.argv.slice(2).find(a => !a.startsWith('--'))
const appendLog = process.argv.includes('--append-log')
if (!file) { console.error('usage: node scripts/render-verdicts.mjs verdicts.json [--append-log]'); process.exit(1) }

const input = JSON.parse(fs.readFileSync(file, 'utf8'))
const nm = spawnSync(process.execPath, ['scripts/near-miss.mjs', '--all', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 })
if (nm.status !== 0) { console.error('render-verdicts: near-miss.mjs failed:', nm.stderr); process.exit(1) }
const { meta, items } = JSON.parse(nm.stdout)
const byId = new Map(items.map(i => [String(i.id), i]))

let dropped = 0
const flags = []
for (const f of Array.isArray(input.flags) ? input.flags : []) {
  const item = byId.get(String(f?.id))
  const verdict = VERDICTS[String(f?.verdict || '').toLowerCase()]
  if (!item || !verdict) { dropped++; continue }
  flags.push({ item, verdict, reason: safe(f.reason, 240) })
}
const proposals = (Array.isArray(input.proposals) ? input.proposals : []).slice(0, 10).map(p => ({
  pattern: safe(p?.pattern, 200),
  ids: (Array.isArray(p?.ids) ? p.ids : []).map(String).filter(id => byId.has(id)).map(id => safe(id, 40)),
  suggestion: safe(p?.suggestion, 240),
  risk: safe(p?.risk, 200),
})).filter(p => p.pattern)
const gaps = (Array.isArray(input.gaps) ? input.gaps : []).slice(0, 10).map(g => safe(g, 200)).filter(Boolean)

const ask = flags.filter(f => f.verdict === 'ask Bryon').length
const headline = flags.length === 0 ? 'Nothing to flag' : `${flags.length} item${flags.length === 1 ? '' : 's'} flagged, ${ask} need${ask === 1 ? 's' : ''} Bryon`

function table(withRuling) {
  const head = withRuling
    ? ['| Item ID | Title | Channel | Score / bar | Verdict | Reason | Ruling |', '|---|---|---|---|---|---|---|']
    : ['| Verdict | Title | Channel | Score / bar | Reason |', '|---|---|---|---|---|']
  return [...head, ...flags.map(({ item, verdict, reason }) => {
    const t = safe(item.title, 80), c = safe(item.channelName, 40), s = `${item.score} / ${item.threshold}`
    return withRuling
      ? `| ${safe(item.id, 40)} | ${t} | ${c} | ${s} | ${verdict} | ${reason} | |`
      : `| **${verdict}** | ${t} | ${c} | ${s} | ${reason} |`
  })].join('\n')
}

function proposalLines() {
  if (!proposals.length) return 'none'
  return '\n' + proposals.map(p => `- ${p.pattern}${p.ids.length ? ` (items: ${p.ids.join(', ')})` : ''}. Suggest: ${p.suggestion || 'n/a'}. At risk: ${p.risk || 'n/a'}.`).join('\n')
}

// ─── Issue section ────────────────────────────────────────────────────────────

const issue = [
  `## Curator: ${headline}`,
  '',
  `_Reviewed ${meta.storedItems} stored items (cache built ${safe(meta.builtAt)}), ${meta.nearMisses} near-misses.${dropped ? ` ${dropped} verdict(s) dropped: unknown item ID or verdict.` : ''}_`,
  '',
  flags.length ? table(false) : '',
  '',
  `**Patterns for \`filter\`:** ${proposalLines()}`,
  '',
  `**Questions for the culture interview:** ${gaps.length ? '\n' + gaps.map(g => `- ${g}`).join('\n') : 'none'}`,
].join('\n').replace(/\n{3,}/g, '\n\n')
console.log(issue)

// ─── Log entry ────────────────────────────────────────────────────────────────

if (appendLog) {
  const today = new Date().toISOString().slice(0, 10)
  const entry = [
    `## ${today}`,
    '',
    `Cache built: ${safe(meta.builtAt)}. Near-misses: ${meta.nearMisses} of ${meta.storedItems}. Flagged: ${flags.length}.`,
    '',
    flags.length ? table(true) : '_Nothing flagged._',
    '',
    `**Patterns handed to \`filter\`:** ${proposalLines()}`,
    '',
    `**Culture-brief gaps:** ${gaps.length ? '\n' + gaps.map(g => `- ${g}`).join('\n') : 'none'}`,
    '',
  ].join('\n')

  const log = fs.readFileSync(LOG, 'utf8')
  const at = log.indexOf(LOG_START)
  if (at < 0) { console.error(`render-verdicts: ${path.relative(ROOT, LOG)} has no "${LOG_START}" line. Not writing.`); process.exit(1) }
  const header = log.slice(0, at + LOG_START.length)
  // Split the body into dated entries and drop only today's, so a re-run replaces it.
  const body = log.slice(at + LOG_START.length)
  const entries = body.split(/\n(?=## \d{4}-\d{2}-\d{2}\n)/).map(s => s.trim()).filter(Boolean)
  const kept = entries.filter(e => !e.startsWith(`## ${today}\n`))
  fs.writeFileSync(LOG, [header, ...kept, entry.trim()].join('\n\n') + '\n')
  console.error(`render-verdicts: wrote the ${today} entry to ${path.relative(ROOT, LOG)}`)
}

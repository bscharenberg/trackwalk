/**
 * md-safe.mjs — make untrusted text inert before it reaches a GitHub issue body or a log.
 *
 * Feed titles, channel names, workflow names and issue titles can all be set by someone
 * outside the project. In an issue they would otherwise render as links, images, HTML,
 * headings, table breaks or @-mentions that notify a real person. This strips the
 * characters that build those and collapses whitespace so a value stays on one line.
 *
 * Used by health-check.mjs, near-miss.mjs and render-verdicts.mjs. One copy, so the rules
 * can't drift apart.
 */

export function safe(text, max = 200) {
  const s = String(text ?? '')
    .replace(/[`<>[\]|!*_#~\\]/g, '')   // links, images, HTML, tables, emphasis, headings
    .replace(/@/g, '@​')            // no mentions
    .replace(/:\/\//g, ':/​/')      // no bare-URL autolinks
    .replace(/\bwww\./gi, 'www​.')
    .replace(/\s+/g, ' ')                // one line
    .trim()
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

// Hosts the feed actually comes from (youtube-fetcher.js, rss-fetcher.js). A link to any
// other host is shown as plain text with its host name, never as a clickable link.
const LINK_HOSTS = ['youtube.com', 'www.youtube.com', 'youtu.be', 'pinkbike.com', 'www.pinkbike.com']

export function safeLink(label, url) {
  let u
  try { u = new URL(String(url || '')) } catch { return safe(label) }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return safe(label)
  if (!LINK_HOSTS.includes(u.hostname)) return `${safe(label)} (${safe(u.hostname)})`
  return `[${safe(label)}](${u.href.replace(/[()\s<>|]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'))})`
}

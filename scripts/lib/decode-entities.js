/**
 * decode-entities.js — turn feed text into plain text at the ingest boundary.
 *
 * THE PROBLEM this solves:
 *   Both upstream sources hand us HTML-escaped text. Pinkbike's RSS is entity-encoded, and
 *   the YouTube Data API escapes snippet.title/description ("Gwin &amp; Scarsi", "Cathro&#39;s").
 *   Stored that way, cache.json holds "&amp;" — and the app escapes it a SECOND time when it
 *   renders, so a card paints a literal "&amp;" and the detail sheet (textContent) shows it raw.
 *
 * THE RULE: cache.json holds plain text. Escaping happens exactly once, in the app, at render.
 * Every fetcher decodes here before writing an item.
 */

function decodeEntities(str) {
  return (str || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g,         (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')   // last, so "&amp;lt;" decodes to "&lt;" and not "<"
}

module.exports = { decodeEntities }

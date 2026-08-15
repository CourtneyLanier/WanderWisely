// Handling for user-entered links.
//
// The URL fields are <input type="url">, but the value reached the database
// untouched. Typing `nps.gov/yell` without a scheme produced a *relative*
// anchor, which navigates inside the app instead of out to the site — the link
// looks fine and goes nowhere useful.

/**
 * Make a typed-in URL safe to put in an href, or null if it can't be.
 *
 * Adds https:// when there's no scheme, and rejects anything that isn't
 * http(s) — which also blocks `javascript:` from reaching an anchor.
 */
export function normalizeUrl(input: string | null | undefined): string | null {
  const raw = input?.trim()
  if (!raw) return null

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * Shorten a URL for display without losing anything you'd need to type it back
 * in: drops the scheme, a leading `www.`, and a single trailing slash.
 *
 * `https://www.nps.gov/yell/planyourvisit/index.htm`
 *   → `nps.gov/yell/planyourvisit/index.htm`
 */
export function displayUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '')
}

// Matches bare URLs in free text. Trailing punctuation is excluded so a link at
// the end of a sentence doesn't swallow the full stop or a closing bracket.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()[\]{}"']+[^\s<>()[\]{}"'.,;:!?]/gi

export interface TextSegment {
  text: string
  href: string | null
}

/**
 * Split free text into plain and linkable segments. Notes fields render as
 * plain text today, so a pasted URL is dead on the page.
 *
 * Returns segments rather than markup so both React (notes fields) and the
 * HTML export can use the same splitting rules.
 */
export function splitLinks(text: string): TextSegment[] {
  const out: TextSegment[] = []
  let last = 0

  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0
    if (start > last) out.push({ text: text.slice(last, start), href: null })
    const href = normalizeUrl(m[0])
    out.push({ text: m[0], href })
    last = start + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), href: null })
  return out
}

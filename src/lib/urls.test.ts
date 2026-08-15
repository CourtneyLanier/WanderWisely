import { describe, it, expect } from 'vitest'
import { normalizeUrl, displayUrl, splitLinks } from '@/lib/urls'

describe('normalizeUrl', () => {
  // The actual bug: without a scheme the anchor is relative and navigates
  // inside the app rather than out to the site.
  it('adds https:// when there is no scheme', () => {
    expect(normalizeUrl('nps.gov/yell')).toBe('https://nps.gov/yell')
  })

  it('leaves an existing scheme alone', () => {
    expect(normalizeUrl('http://example.com/a')).toBe('http://example.com/a')
    expect(normalizeUrl('https://example.com/a')).toBe('https://example.com/a')
  })

  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com/')
  })

  // Also the reason this rejects rather than passes through: a javascript:
  // URL in an href is an XSS vector.
  it('rejects non-http schemes', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('data:text/html,<script>')).toBeNull()
    expect(normalizeUrl('mailto:someone@example.com')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('   ')).toBeNull()
    expect(normalizeUrl(null)).toBeNull()
  })
})

describe('displayUrl', () => {
  it('drops scheme, www and a trailing slash but keeps the path', () => {
    expect(displayUrl('https://www.nps.gov/yell/planyourvisit/index.htm'))
      .toBe('nps.gov/yell/planyourvisit/index.htm')
    expect(displayUrl('https://example.com/')).toBe('example.com')
  })

  it('keeps query strings, which you would need to retype', () => {
    expect(displayUrl('https://example.com/book?id=42')).toBe('example.com/book?id=42')
  })
})

describe('splitLinks', () => {
  it('splits a URL out of surrounding text', () => {
    const segs = splitLinks('See https://nps.gov/yell for details')
    expect(segs.map((s) => s.text)).toEqual(['See ', 'https://nps.gov/yell', ' for details'])
    expect(segs[1].href).toBe('https://nps.gov/yell')
    expect(segs[0].href).toBeNull()
  })

  // A bare host normalizes to include the root path; displayUrl strips it
  // again for rendering, so this is invisible to the reader.
  it('links a bare www. host', () => {
    const segs = splitLinks('www.recreation.gov')
    expect(segs[0].href).toBe('https://www.recreation.gov/')
    expect(displayUrl(segs[0].href!)).toBe('recreation.gov')
  })

  // A link at the end of a sentence shouldn't swallow the full stop.
  it('leaves trailing punctuation out of the link', () => {
    const segs = splitLinks('Book at https://recreation.gov.')
    expect(segs[1].text).toBe('https://recreation.gov')
    expect(segs[2].text).toBe('.')
  })

  it('returns a single plain segment when there is no URL', () => {
    expect(splitLinks('no links here')).toEqual([{ text: 'no links here', href: null }])
  })

  it('handles several links in one note', () => {
    const segs = splitLinks('a https://one.com b https://two.com c')
    expect(segs.filter((s) => s.href).map((s) => s.href))
      .toEqual(['https://one.com/', 'https://two.com/'])
  })
})

// Renders free text with any URLs in it turned into real links.
//
// Notes fields render as plain text, so a URL pasted into a day note or a
// document note is dead on the page — you have to select and copy it by hand.

import { splitLinks } from '@/lib/urls'

export default function Linkified({ text }: { text: string | null | undefined }) {
  if (!text) return null
  const segments = splitLinks(text)

  return (
    <>
      {segments.map((seg, i) =>
        seg.href ? (
          <a
            key={i}
            href={seg.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-deep-teal underline break-all"
          >
            {seg.text}
          </a>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  )
}

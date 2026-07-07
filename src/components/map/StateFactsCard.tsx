// Facts card for a selected state on the Map tab: nickname, state symbols,
// and a few bits of road-trip trivia. Shared by the owner and guest pages —
// the owner passes a mark-visited footer, the guest view is read-only.

import type { ReactNode } from 'react'
import { STATE_MAP } from '@/lib/usStates'
import { STATE_FACTS } from '@/lib/stateFacts'

export default function StateFactsCard({
  abbr,
  visited,
  footer,
  onClose,
}: {
  abbr: string
  visited: boolean
  footer?: ReactNode
  onClose: () => void
}) {
  const facts = STATE_FACTS[abbr]
  const name = STATE_MAP[abbr] ?? abbr
  if (!facts) return null

  return (
    <div className="card mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display text-xl text-forest leading-tight">{name}</h2>
            {visited && (
              <span className="text-[11px] font-semibold text-sage bg-sage/15 rounded-full px-2 py-0.5">
                ✓ On this trip
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-gold mt-0.5">{facts.nickname}</p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close state facts"
          className="text-forest/30 hover:text-forest text-lg leading-none px-1 shrink-0"
        >
          ✕
        </button>
      </div>

      {/* State symbols */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          { icon: '🐦', label: 'Bird', value: facts.bird },
          { icon: '🌳', label: 'Tree', value: facts.tree },
          { icon: '🌸', label: 'Flower', value: facts.flower },
        ].map((s) => (
          <div key={s.label} className="card-inset text-center px-2 py-2.5">
            <p className="text-lg leading-none">{s.icon}</p>
            <p className="text-[10px] uppercase tracking-wider text-forest/40 font-semibold mt-1">
              {s.label}
            </p>
            <p className="text-[11px] text-forest leading-snug mt-0.5">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Trivia */}
      <p className="section-label mt-4 mb-1.5">Did you know?</p>
      <ul className="space-y-1.5">
        {facts.trivia.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm text-forest/80 leading-snug">
            <span className="text-gold shrink-0">✦</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>

      {footer && <div className="mt-4 pt-3 border-t border-forest/10">{footer}</div>}
    </div>
  )
}

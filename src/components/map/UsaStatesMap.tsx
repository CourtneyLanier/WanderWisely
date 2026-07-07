// Interactive US map in the app's hand-drawn outline style (modeled on
// public/USA_OutlineMap.jpg — that JPG can't be filled per-state, so this is
// the same outline recreated as tappable SVG state shapes).
//
// Visited states fill in sage green; tapping any state selects it so the page
// can show its facts. Pure SVG — works offline, no map service needed.

import { useMemo } from 'react'
import usa from '@svg-maps/usa'

const FILL_VISITED = '#5C7A3E' // sage
const FILL_BLANK = '#FDF9F3' // warm white
const STROKE = '#2D3D1E' // forest
const STROKE_SELECTED = '#D4943A' // gold

export default function UsaStatesMap({
  visited,
  selected,
  onSelect,
}: {
  visited: Set<string>
  selected: string | null
  onSelect: (abbr: string) => void
}) {
  // Skip DC (too small to tap, not in the state list). Draw the selected state
  // last so its gold outline sits on top of its neighbors.
  const locations = useMemo(() => {
    const states = usa.locations.filter((l) => l.id !== 'dc')
    if (!selected) return states
    const sel = selected.toLowerCase()
    return [...states.filter((l) => l.id !== sel), ...states.filter((l) => l.id === sel)]
  }, [selected])

  return (
    <svg
      viewBox={usa.viewBox}
      role="img"
      aria-label="Map of US states visited on this trip"
      className="w-full h-auto select-none"
      style={{ filter: 'drop-shadow(2px 3px 0 rgba(45,61,30,.12))' }}
    >
      {locations.map((loc) => {
        const abbr = loc.id.toUpperCase()
        const isVisited = visited.has(abbr)
        const isSelected = selected === abbr
        return (
          <path
            key={loc.id}
            d={loc.path}
            onClick={() => onSelect(abbr)}
            fill={isVisited ? FILL_VISITED : FILL_BLANK}
            fillOpacity={isVisited ? 0.9 : 1}
            stroke={isSelected ? STROKE_SELECTED : STROKE}
            strokeWidth={isSelected ? 3 : 1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ cursor: 'pointer', transition: 'fill .25s, fill-opacity .25s' }}
          >
            <title>{loc.name}</title>
          </path>
        )
      })}
    </svg>
  )
}

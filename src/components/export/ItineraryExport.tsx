import { useState, type ReactNode } from 'react'
import {
  gatherExportData,
  buildExportHtml,
  downloadHtml,
  openPrintWindow,
  safeFileName,
  type ExportContent,
  type MealStyle,
} from '@/lib/exportItinerary'

// Small segmented-control button used for the option groups.
function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 text-xs font-medium rounded-md px-2 py-2 transition-colors ${
        active
          ? 'bg-deep-teal text-white shadow-sm'
          : 'bg-cream text-forest/70 hover:text-forest'
      }`}
    >
      {children}
    </button>
  )
}

export default function ItineraryExport({ tripId }: { tripId: string }) {
  const [content, setContent] = useState<ExportContent>('combined')
  const [mealStyle, setMealStyle] = useState<MealStyle>('by_day')
  const [includePrices, setIncludePrices] = useState(false)
  const [includeFiles, setIncludeFiles] = useState(true)
  const [busy, setBusy] = useState<null | 'html' | 'pdf'>(null)
  const [error, setError] = useState('')

  const showMealStyle = content !== 'itinerary'

  const fileSuffix =
    content === 'meal_plan' ? 'meal_plan' : content === 'combined' ? 'itinerary_meals' : 'itinerary'

  async function run(kind: 'html' | 'pdf') {
    setBusy(kind)
    setError('')
    try {
      const data = await gatherExportData(tripId, includeFiles)
      const opts = { content, mealStyle, includePrices, includeFiles }
      if (kind === 'html') {
        const html = buildExportHtml(data, opts, false)
        downloadHtml(html, `${safeFileName(data.trip.name)}_${fileSuffix}.html`)
      } else {
        const html = buildExportHtml(data, opts, true)
        const opened = openPrintWindow(html)
        if (!opened) {
          setError('Your browser blocked the print window. Allow pop-ups for this site and try again.')
        }
      }
    } catch (e) {
      setError((e as Error).message ?? 'Export failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <p className="text-sm text-forest/60 mb-3">
        Export a branded, printable itinerary — one day per slide/page — plus a meal plan. Download as an
        interactive HTML slideshow or save as a PDF.
      </p>

      {/* What to include */}
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-forest/45 mb-1.5">
        Include
      </label>
      <div className="flex gap-1.5 bg-cream/60 rounded-lg p-1 mb-3">
        <Seg active={content === 'itinerary'} onClick={() => setContent('itinerary')}>Days</Seg>
        <Seg active={content === 'meal_plan'} onClick={() => setContent('meal_plan')}>Meal plan</Seg>
        <Seg active={content === 'combined'} onClick={() => setContent('combined')}>Both</Seg>
      </div>

      {/* Meal plan organization */}
      {showMealStyle && (
        <>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-forest/45 mb-1.5">
            Meal plan layout
          </label>
          <div className="flex gap-1.5 bg-cream/60 rounded-lg p-1 mb-3">
            <Seg active={mealStyle === 'by_day'} onClick={() => setMealStyle('by_day')}>
              By day (execution)
            </Seg>
            <Seg active={mealStyle === 'by_type'} onClick={() => setMealStyle('by_type')}>
              By meal (packing)
            </Seg>
          </div>
        </>
      )}

      {/* Attached files toggle */}
      <label className="flex items-center justify-between mb-3 cursor-pointer">
        <span className="text-sm text-forest">
          Include attached files
          <span className="block text-[11px] text-forest/45">
            Embeds Notes-tab PDFs &amp; images so they open offline (larger file)
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={includeFiles}
          onClick={() => setIncludeFiles((v) => !v)}
          className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
            includeFiles ? 'bg-sage' : 'bg-forest/20'
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              includeFiles ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </label>

      {/* Prices toggle */}
      <label className="flex items-center justify-between mb-4 cursor-pointer">
        <span className="text-sm text-forest">Include prices &amp; costs</span>
        <button
          type="button"
          role="switch"
          aria-checked={includePrices}
          onClick={() => setIncludePrices((v) => !v)}
          className={`relative w-11 h-6 rounded-full transition-colors ${
            includePrices ? 'bg-sage' : 'bg-forest/20'
          }`}
        >
          <span
            className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              includePrices ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </label>

      {error && <p className="text-xs text-terracotta mb-3">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => run('html')}
          disabled={busy !== null}
          className="btn-secondary flex-1 text-sm flex items-center justify-center gap-2"
        >
          {busy === 'html' ? (
            <><span className="animate-pulse">⏳</span><span>Building…</span></>
          ) : (
            <><span>🖥️</span><span>HTML slideshow</span></>
          )}
        </button>
        <button
          onClick={() => run('pdf')}
          disabled={busy !== null}
          className="btn-primary flex-1 text-sm flex items-center justify-center gap-2"
        >
          {busy === 'pdf' ? (
            <><span className="animate-pulse">⏳</span><span>Preparing…</span></>
          ) : (
            <><span>📄</span><span>PDF</span></>
          )}
        </button>
      </div>
      <p className="text-xs text-forest/40 mt-2">
        PDF opens a print view — choose “Save as PDF” as the destination.
      </p>
    </div>
  )
}

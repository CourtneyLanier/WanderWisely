import { useState, useRef } from 'react'
import { useQueryClient, useQuery, useMutation, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import type { Reservation, ReservationType, Json } from '@/types'

// ── constants ──────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<ReservationType, string> = {
  flight: '✈️', hotel: '🏨', car: '🚗', restaurant: '🍴', activity: '🎯', other: '📋',
}
const TYPE_LABELS: Record<ReservationType, string> = {
  flight: 'Flight', hotel: 'Hotel', car: 'Car', restaurant: 'Restaurant', activity: 'Activity', other: 'Other',
}
const ALL_TYPES: ReservationType[] = ['flight', 'hotel', 'car', 'restaurant', 'activity', 'other']

// ── helpers ────────────────────────────────────────────────────────────────────

// A reservation surfaces across Wallet, Days, Budget, Route, Map and Day-detail —
// each with its own query key. Invalidate every reservation-derived view so adds,
// edits and deletes propagate app-wide (spending_log too, since paid logs derive from it).
function invalidateReservationViews(qc: QueryClient) {
  qc.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey[0]
      return typeof k === 'string' &&
        (k.includes('reservation') || k === 'map-addresses' || k === 'spending_log')
    },
  })
}

function extractJson(raw: string): Record<string, unknown> {
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    return JSON.parse(stripped) as Record<string, unknown>
  } catch {
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start !== -1 && end !== -1) return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
    throw new Error('Could not extract JSON from Claude response')
  }
}

function fmtDate(s: string | null) {
  if (!s) return null
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(s: string | null) {
  if (!s) return null
  const [h, m] = s.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function detailLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// ── form state ─────────────────────────────────────────────────────────────────

interface FormState {
  type: ReservationType
  title: string
  provider: string
  confirmation_number: string
  date: string
  time: string
  address: string
  listing_url: string
  cost: string
  details: Json
}

const EMPTY_FORM: FormState = {
  type: 'other', title: '', provider: '', confirmation_number: '',
  date: '', time: '', address: '', listing_url: '', cost: '', details: {},
}

// ── shared insert/delete helpers ─────────────────────────────────────────────────

// Map Claude's parsed JSON onto our form shape. Shared by the email and PDF flows.
function jsonToForm(json: Record<string, unknown>): FormState {
  const s = (k: string) => (typeof json[k] === 'string' ? (json[k] as string) : '')
  return {
    type: (json.type as ReservationType) ?? 'other',
    title: s('title'),
    provider: s('provider'),
    confirmation_number: s('confirmation_number'),
    date: s('date'),
    time: s('time'),
    address: s('address'),
    listing_url: s('listing_url'),
    cost: json.cost != null ? String(json.cost) : '',
    details: (json.details ?? {}) as Json,
  }
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Build the DB row for an insert from form state (shared by single + batch save).
function reservationRow(form: FormState, tripId: string) {
  return {
    trip_id: tripId,
    type: form.type,
    title: form.title || null,
    provider: form.provider || null,
    confirmation_number: form.confirmation_number || null,
    date: form.date || null,
    time: form.time || null,
    address: form.address || null,
    listing_url: form.listing_url || null,
    cost: form.cost ? parseFloat(form.cost) : null,
    details: form.details,
  }
}

// Delete a reservation, cleaning up the hidden "Paid: …" spending_log entry that
// "Mark paid" creates for hotels (otherwise its cost lingers in the Budget). Shared
// by the single-delete button and the batch "Replace existing" duplicate resolution.
async function deleteReservationWithCleanup(res: Reservation, tripId: string) {
  if (res.type === 'hotel' && res.paid) {
    const resLabel = res.title || res.provider || 'Hotel'
    const { error: logErr } = await supabase
      .from('spending_log')
      .delete()
      .eq('trip_id', tripId)
      .eq('card', 'hotel')
      .eq('label', `Paid: ${resLabel}`)
    if (logErr) throw logErr
  }
  const { error } = await supabase.from('reservations').delete().eq('id', res.id)
  if (error) throw error
}

// ── ReservationCard ────────────────────────────────────────────────────────────

function ReservationCard({ res, onDelete }: { res: Reservation; onDelete: () => void }) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyConf() {
    if (!res.confirmation_number) return
    navigator.clipboard.writeText(res.confirmation_number)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const editMutation = useMutation({
    mutationFn: async (form: FormState) => {
      const { error } = await supabase.from('reservations').update({
        type: form.type,
        title: form.title || null,
        provider: form.provider || null,
        confirmation_number: form.confirmation_number || null,
        date: form.date || null,
        time: form.time || null,
        address: form.address || null,
        listing_url: form.listing_url || null,
        cost: form.cost ? parseFloat(form.cost) : null,
        details: form.details,
      }).eq('id', res.id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateReservationViews(queryClient)
      setEditing(false)
      setExpanded(false)
    },
  })

  const detailEntries = res.details && typeof res.details === 'object' && !Array.isArray(res.details)
    ? Object.entries(res.details as Record<string, Json>).filter(([, v]) => v != null)
    : []

  if (editing) {
    return (
      <div className="card">
        <ReservationForm
          title="Edit reservation"
          initial={{
            type: res.type ?? 'other',
            title: res.title ?? '',
            provider: res.provider ?? '',
            confirmation_number: res.confirmation_number ?? '',
            date: res.date ?? '',
            time: res.time ?? '',
            address: res.address ?? '',
            listing_url: res.listing_url ?? '',
            cost: res.cost != null ? String(res.cost) : '',
            details: res.details ?? {},
          }}
          onSave={(form) => editMutation.mutate(form)}
          onCancel={() => setEditing(false)}
          saving={editMutation.isPending}
        />
        {editMutation.isError && (
          <p className="text-xs text-terracotta mt-2">{(editMutation.error as Error).message}</p>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      {/* Main row — tappable anywhere to expand/collapse */}
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-2xl mt-0.5 shrink-0">{TYPE_ICONS[res.type ?? 'other']}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-forest leading-snug truncate">
            {res.title || res.provider || TYPE_LABELS[res.type ?? 'other'] || '—'}
          </p>
          {res.provider && <p className="text-xs text-forest/50 mt-0.5 truncate">{res.provider}</p>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            {res.date && <span className="text-xs text-forest/60">{fmtDate(res.date)}</span>}
            {res.time && <span className="text-xs text-forest/60">{fmtTime(res.time)}</span>}
          </div>
          {res.confirmation_number && (
            <button
              onClick={(e) => { e.stopPropagation(); copyConf() }}
              className="mt-1.5 flex items-center gap-1.5 text-xs font-mono text-deep-teal bg-deep-teal/8 hover:bg-deep-teal/15 rounded px-2 py-0.5 transition-colors"
            >
              <span>{copied ? '✓ Copied!' : res.confirmation_number}</span>
              {!copied && <span className="text-deep-teal/50">⎘</span>}
            </button>
          )}
          {res.pdf_url && (
            <a href={res.pdf_url} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-deep-teal hover:text-forest transition-colors">
              📄 View PDF
            </a>
          )}
          {res.listing_url && (
            <a href={res.listing_url} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1.5 inline-flex items-center gap-1 text-xs text-deep-teal hover:text-forest transition-colors">
              🔗 View listing
            </a>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-sage hover:text-forest transition-colors px-2 py-1"
          >
            Edit
          </button>
          <span className="text-forest/30 text-sm mt-0.5 px-1 select-none">
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-forest/10 space-y-2">
          {res.address && (
            <div>
              <span className="text-xs text-forest/40 uppercase tracking-wide">Address</span>
              <a href={`https://maps.google.com/?q=${encodeURIComponent(res.address)}`}
                target="_blank" rel="noopener noreferrer"
                className="text-sm text-deep-teal underline mt-0.5 block">
                {res.address}
              </a>
            </div>
          )}
          {res.cost != null && (
            <div>
              <span className="text-xs text-forest/40 uppercase tracking-wide">Cost</span>
              <p className="text-sm font-mono text-gold mt-0.5">
                ${res.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          )}
          {detailEntries.length > 0 && (
            <div>
              <span className="text-xs text-forest/40 uppercase tracking-wide">Details</span>
              <div className="mt-1 space-y-0.5">
                {detailEntries.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-sm">
                    <span className="text-forest/50 shrink-0">{detailLabel(k)}:</span>
                    <span className="text-forest">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {res.pdf_url && (
            <a href={res.pdf_url} target="_blank" rel="noopener noreferrer"
              className="text-xs text-deep-teal underline">
              📄 View confirmation PDF
            </a>
          )}
          <button onClick={onDelete}
            className="text-xs text-terracotta hover:text-forest transition-colors pt-1">
            Delete reservation
          </button>
        </div>
      )}
    </div>
  )
}

// ── ReservationForm ────────────────────────────────────────────────────────────

function ReservationForm({
  initial,
  onSave,
  onCancel,
  saving,
  title: formTitle,
}: {
  initial: Partial<FormState>
  onSave: (data: FormState) => void
  onCancel: () => void
  saving: boolean
  title: string
}) {
  const [f, setF] = useState<FormState>({ ...EMPTY_FORM, ...initial })
  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setF((prev) => ({ ...prev, [k]: e.target.value }))

  return (
    <div className="space-y-3">
      <p className="font-display text-lg text-forest">{formTitle}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-sm text-forest mb-1">Type</label>
          <select value={f.type} onChange={set('type')} className="input">
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_ICONS[t]} {TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm text-forest mb-1">Title</label>
          <input type="text" value={f.title} onChange={set('title')}
            placeholder="e.g. Hertz — Grand Canyon pickup" className="input" autoFocus />
        </div>
        <div className="col-span-2">
          <label className="block text-sm text-forest mb-1">Provider</label>
          <input type="text" value={f.provider} onChange={set('provider')}
            placeholder="Airline, hotel chain, etc." className="input" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm text-forest mb-1">Confirmation #</label>
          <input type="text" value={f.confirmation_number} onChange={set('confirmation_number')}
            placeholder="ABC123" className="input font-mono" />
        </div>
        <div>
          <label className="block text-sm text-forest mb-1">Date</label>
          <input type="date" value={f.date} onChange={set('date')} className="input" />
        </div>
        <div>
          <label className="block text-sm text-forest mb-1">Time</label>
          <input type="time" value={f.time} onChange={set('time')} className="input" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm text-forest mb-1">Address</label>
          <input type="text" value={f.address} onChange={set('address')}
            placeholder="123 Main St, City, ST" className="input" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm text-forest mb-1">Listing URL</label>
          <input type="url" value={f.listing_url} onChange={set('listing_url')}
            placeholder="https://airbnb.com/rooms/… or hotel site" className="input" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm text-forest mb-1">Cost ($)</label>
          <input type="number" value={f.cost} onChange={set('cost')}
            placeholder="0" min="0" step="0.01" className="input font-mono" />
        </div>

        {/* Parsed details (read-only display if present) */}
        {f.details && typeof f.details === 'object' && !Array.isArray(f.details) && Object.keys(f.details).length > 0 && (
          <div className="col-span-2">
            <p className="text-xs text-forest/40 uppercase tracking-wide mb-1.5">Parsed details</p>
            <div className="bg-cream rounded-lg p-3 space-y-1">
              {Object.entries(f.details as Record<string, Json>).filter(([, v]) => v != null).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-xs">
                  <span className="text-forest/50 shrink-0">{detailLabel(k)}:</span>
                  <span className="text-forest">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSave(f)}
          disabled={saving || !f.title.trim()}
          className="btn-primary flex-1"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="btn-secondary px-4">Cancel</button>
      </div>
    </div>
  )
}

// ── ParseEmailFlow ─────────────────────────────────────────────────────────────

type ParseStep = 'paste' | 'parsing' | 'review' | 'error'

function ParseEmailFlow({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (data: FormState, rawEmail: string) => void
  onCancel: () => void
  saving: boolean
}) {
  const [step, setStep] = useState<ParseStep>('paste')
  const [emailText, setEmailText] = useState('')
  const [parsed, setParsed] = useState<Partial<FormState>>({})
  const [parseError, setParseError] = useState('')

  async function runParse() {
    if (!emailText.trim()) return
    setStep('parsing')
    setParseError('')
    try {
      const { data, error } = await supabase.functions.invoke('parse-with-claude', {
        body: { mode: 'email', text: emailText },
      })
      if (error) throw error
      if (!data?.ok) throw new Error(data?.error ?? 'Unknown error')
      setParsed(jsonToForm(extractJson(data.text as string)))
      setStep('review')
    } catch (e) {
      setParseError((e as Error).message ?? 'Unknown error')
      setStep('error')
    }
  }

  if (step === 'paste') {
    return (
      <div className="space-y-3">
        <p className="font-display text-lg text-forest">Parse from Email</p>
        <p className="text-sm text-forest/60">
          Copy the full text of your confirmation email and paste it below.
        </p>
        <textarea
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          placeholder="Paste confirmation email here…"
          rows={10}
          className="input resize-none text-xs leading-relaxed font-mono"
          autoFocus
        />
        <div className="flex gap-2">
          <button
            onClick={runParse}
            disabled={!emailText.trim()}
            className="btn-primary flex-1"
          >
            Parse with AI ✨
          </button>
          <button onClick={onCancel} className="btn-secondary px-4">Cancel</button>
        </div>
      </div>
    )
  }

  if (step === 'parsing') {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-3xl animate-pulse">✨</p>
        <p className="font-display text-lg text-forest">Reading your confirmation…</p>
        <p className="text-sm text-forest/50">Claude is extracting the details</p>
      </div>
    )
  }

  if (step === 'error') {
    return (
      <div className="space-y-4">
        <p className="font-display text-lg text-forest">Parsing failed</p>
        <div className="bg-terracotta/10 border border-terracotta/20 rounded-lg p-3">
          <p className="text-sm text-terracotta">{parseError}</p>
        </div>
        <p className="text-xs text-forest/50">
          You can enter the reservation manually instead.
        </p>
        <div className="flex gap-2">
          <button onClick={() => setStep('paste')} className="btn-secondary flex-1">Try again</button>
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    )
  }

  // review step
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sage text-sm">✓ Parsed successfully</span>
      </div>
      <ReservationForm
        title="Review & save"
        initial={parsed}
        onSave={(data) => onSave(data, emailText)}
        onCancel={onCancel}
        saving={saving}
      />
    </div>
  )
}

// ── UploadPdfFlow (multi-file batch) ─────────────────────────────────────────────

type UploadStep = 'pick' | 'processing' | 'review' | 'error'

// How a duplicate is resolved when a parsed draft collides with an existing
// reservation (same type + same date).
type Resolution = 'replace' | 'keep-both' | 'discard'

// One parsed-but-not-yet-saved reservation in the review batch.
interface Draft {
  key: string
  fileName: string
  pdfUrl: string
  form: FormState
}

// What gets handed back to WalletPage to persist. replaceId set => delete that
// existing reservation first (the user chose "Replace existing").
export interface ResolvedDraft {
  form: FormState
  pdfUrl: string
  replaceId: string | null
}

const MAX_PDF_BYTES = 5 * 1024 * 1024

function UploadPdfFlow({
  existing,
  onSaveBatch,
  onCancel,
  saving,
}: {
  existing: Reservation[]
  onSaveBatch: (drafts: ResolvedDraft[]) => void
  onCancel: () => void
  saving: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<UploadStep>('pick')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({})
  const [errors, setErrors] = useState<string[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0, name: '' })
  const [editingKey, setEditingKey] = useState<string | null>(null)

  // A draft duplicates an existing reservation when it shares the same type AND the
  // same date. No date => can't be sure it's a dupe, so we never block it.
  function findConflict(form: FormState): Reservation | null {
    if (!form.date) return null
    return existing.find((r) => r.type === form.type && r.date === form.date) ?? null
  }

  async function handleFiles(files: File[]) {
    setStep('processing')
    setErrors([])
    const collected: Draft[] = []
    const errs: string[] = []

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setErrors(['Not authenticated — please log in again.'])
      setStep('error')
      return
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProgress({ done: i, total: files.length, name: file.name })
      try {
        if (file.size > MAX_PDF_BYTES) {
          throw new Error(`${(file.size / 1024 / 1024).toFixed(1)} MB — over the 5 MB limit`)
        }
        const base64 = await readBase64(file)

        // Upload to Supabase Storage (i in the path keeps same-named files distinct).
        const path = `${user.id}/${Date.now()}_${i}_${file.name}`
        const { error: uploadError } = await supabase.storage
          .from('reservation-pdfs')
          .upload(path, file, { contentType: 'application/pdf' })
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage
          .from('reservation-pdfs')
          .getPublicUrl(path)

        // Parse with Claude via the edge function.
        const { data, error: fnError } = await supabase.functions.invoke('parse-with-claude', {
          body: { mode: 'pdf', pdfBase64: base64 },
        })
        if (fnError) throw fnError
        if (!data?.ok) throw new Error(data?.error ?? 'Unknown error')

        collected.push({
          key: `${Date.now()}_${i}`,
          fileName: file.name,
          pdfUrl: publicUrl,
          form: jsonToForm(extractJson(data.text as string)),
        })
      } catch (e) {
        errs.push(`${file.name}: ${(e as Error).message ?? 'Unknown error'}`)
      }
    }

    setProgress({ done: files.length, total: files.length, name: '' })
    setDrafts(collected)
    setErrors(errs)
    setStep(collected.length > 0 ? 'review' : 'error')
  }

  function updateDraft(key: string, form: FormState) {
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, form } : d)))
  }
  function removeDraft(key: string) {
    setDrafts((ds) => ds.filter((d) => d.key !== key))
  }
  function setResolution(key: string, r: Resolution) {
    setResolutions((prev) => ({ ...prev, [key]: r }))
  }

  function handleSaveAll() {
    const resolved: ResolvedDraft[] = []
    for (const d of drafts) {
      const conflict = findConflict(d.form)
      const r: Resolution = conflict ? (resolutions[d.key] ?? 'replace') : 'keep-both'
      if (conflict && r === 'discard') continue
      resolved.push({
        form: d.form,
        pdfUrl: d.pdfUrl,
        replaceId: conflict && r === 'replace' ? conflict.id : null,
      })
    }
    onSaveBatch(resolved)
  }

  // How many drafts will actually be saved (discards excluded), for the button label.
  const savableCount = drafts.reduce((n, d) => {
    const conflict = findConflict(d.form)
    const r: Resolution = conflict ? (resolutions[d.key] ?? 'replace') : 'keep-both'
    return conflict && r === 'discard' ? n : n + 1
  }, 0)

  // ── pick ──
  if (step === 'pick') {
    return (
      <div className="space-y-4">
        <p className="font-display text-lg text-forest">Upload Confirmation PDFs</p>
        <p className="text-sm text-forest/60">
          Pick one PDF or your whole stack of confirmations at once — Claude reads each one and
          fills everything in. If any clashes with a reservation you already have, you'll get to
          choose which to keep. Files are saved so you can pull them up offline.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? [])
            if (fs.length) handleFiles(fs)
          }}
        />
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="btn-primary flex-1">
            📄 Choose PDF(s)
          </button>
          <button onClick={onCancel} className="btn-secondary px-4">Cancel</button>
        </div>
      </div>
    )
  }

  // ── processing ──
  if (step === 'processing') {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-3xl animate-pulse">✨</p>
        <p className="font-display text-lg text-forest">
          Reading your confirmations…
        </p>
        <p className="text-sm text-forest/50">
          {progress.total > 0 && `${Math.min(progress.done + 1, progress.total)} of ${progress.total}`}
          {progress.name && <><br />{progress.name}</>}
        </p>
      </div>
    )
  }

  // ── error (nothing parsed) ──
  if (step === 'error') {
    return (
      <div className="space-y-4">
        <p className="font-display text-lg text-forest">Nothing could be read</p>
        <div className="bg-terracotta/10 border border-terracotta/20 rounded-lg p-3 space-y-1">
          {errors.length === 0
            ? <p className="text-sm text-terracotta">No reservations were found.</p>
            : errors.map((e, i) => <p key={i} className="text-sm text-terracotta">{e}</p>)}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setStep('pick')} className="btn-secondary flex-1">Try again</button>
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    )
  }

  // ── review ──
  return (
    <div className="space-y-4">
      <p className="font-display text-lg text-forest">
        Review {drafts.length} reservation{drafts.length === 1 ? '' : 's'}
      </p>

      {errors.length > 0 && (
        <div className="bg-terracotta/10 border border-terracotta/20 rounded-lg p-3 space-y-1">
          <p className="text-xs font-medium text-terracotta">
            {errors.length} file{errors.length === 1 ? '' : 's'} couldn't be read:
          </p>
          {errors.map((e, i) => <p key={i} className="text-xs text-terracotta/80">{e}</p>)}
        </div>
      )}

      <div className="space-y-3">
        {drafts.map((draft) => {
          if (editingKey === draft.key) {
            return (
              <div key={draft.key} className="card">
                <ReservationForm
                  title="Edit reservation"
                  initial={draft.form}
                  onSave={(form) => { updateDraft(draft.key, form); setEditingKey(null) }}
                  onCancel={() => setEditingKey(null)}
                  saving={false}
                />
              </div>
            )
          }

          const conflict = findConflict(draft.form)
          const r: Resolution = resolutions[draft.key] ?? 'replace'
          const f = draft.form
          const discarded = conflict != null && r === 'discard'

          return (
            <div key={draft.key} className={`card ${discarded ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5 shrink-0">{TYPE_ICONS[f.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-forest leading-snug truncate">
                    {f.title || f.provider || TYPE_LABELS[f.type]}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                    {f.date && <span className="text-xs text-forest/60">{fmtDate(f.date)}</span>}
                    {f.time && <span className="text-xs text-forest/60">{fmtTime(f.time)}</span>}
                    {f.cost && <span className="text-xs font-mono text-gold">${f.cost}</span>}
                  </div>
                  <p className="text-[11px] text-forest/40 mt-1 truncate">📄 {draft.fileName}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setEditingKey(draft.key)}
                    className="text-xs text-sage hover:text-forest transition-colors px-2 py-1">
                    Edit
                  </button>
                  <button onClick={() => removeDraft(draft.key)}
                    className="text-xs text-terracotta/70 hover:text-terracotta transition-colors px-2 py-1">
                    Remove
                  </button>
                </div>
              </div>

              {conflict && (
                <div className="mt-3 bg-gold/10 border border-gold/30 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-forest leading-relaxed">
                    ⚠️ You already have a {TYPE_LABELS[conflict.type ?? 'other'].toLowerCase()} on{' '}
                    <b>{fmtDate(conflict.date)}</b>
                    {(conflict.title || conflict.provider) && <>: <b>{conflict.title || conflict.provider}</b></>}.
                    What should happen?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ['replace', 'Replace existing'],
                      ['keep-both', 'Keep both'],
                      ['discard', 'Skip this one'],
                    ] as [Resolution, string][]).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setResolution(draft.key, val)}
                        className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                          r === val
                            ? 'bg-forest text-cream border-forest'
                            : 'bg-transparent text-forest/70 border-forest/20 hover:border-forest/40'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSaveAll}
          disabled={saving || savableCount === 0}
          className="btn-primary flex-1"
        >
          {saving ? 'Saving…' : `Save ${savableCount} to Wallet`}
        </button>
        <button onClick={onCancel} className="btn-secondary px-4">Cancel</button>
      </div>
    </div>
  )
}

// ── WalletPage ─────────────────────────────────────────────────────────────────

type AddMode = null | 'choose' | 'manual' | 'parse' | 'upload'

export default function WalletPage() {
  const tripId = useAppStore((s) => s.tripId)
  const { data: trip } = useTrip()
  const queryClient = useQueryClient()
  const [addMode, setAddMode] = useState<AddMode>(null)

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ['reservations', tripId],
    queryFn: async (): Promise<Reservation[]> => {
      const { data, error } = await supabase
        .from('reservations').select('*').eq('trip_id', tripId!)
        .order('date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId,
  })

  const saveMutation = useMutation({
    mutationFn: async ({ form, rawEmail, pdfUrl }: { form: FormState; rawEmail?: string; pdfUrl?: string }) => {
      const { error } = await supabase.from('reservations').insert({
        ...reservationRow(form, tripId!),
        raw_email_text: rawEmail ?? null,
        pdf_url: pdfUrl ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidateReservationViews(queryClient)
      setAddMode(null)
    },
  })

  // Batch save from the multi-PDF upload flow. For each draft: if the user chose to
  // replace an existing reservation, delete that one first (with paid-log cleanup),
  // then insert the new one. Everything is sequential so a mid-batch failure surfaces
  // a clear error and leaves prior inserts in place.
  const saveBatchMutation = useMutation({
    mutationFn: async (drafts: ResolvedDraft[]) => {
      for (const d of drafts) {
        if (d.replaceId) {
          const old = reservations.find((r) => r.id === d.replaceId)
          if (old) await deleteReservationWithCleanup(old, tripId!)
        }
        const { error } = await supabase.from('reservations').insert({
          ...reservationRow(d.form, tripId!),
          pdf_url: d.pdfUrl,
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      invalidateReservationViews(queryClient)
      setAddMode(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (res: Reservation) => deleteReservationWithCleanup(res, tripId!),
    onSuccess: () => invalidateReservationViews(queryClient),
  })

  function handleSave(form: FormState, rawEmail?: string, pdfUrl?: string) {
    saveMutation.mutate({ form, rawEmail, pdfUrl })
  }

  // ── not set up ──
  if (!trip || !tripId) {
    return (
      <div className="p-4 pt-6">
        <h1 className="font-display text-2xl text-forest mb-4">Wallet</h1>
        <div className="card text-center py-12 space-y-3">
          <p className="text-forest/50 text-sm">Set up your trip first.</p>
        </div>
      </div>
    )
  }

  // ── add flow ──
  if (addMode === 'choose') {
    return (
      <div className="p-4 pt-6 pb-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-2xl text-forest">Wallet</h1>
          <button onClick={() => setAddMode(null)} className="text-sm text-forest/50 hover:text-forest transition-colors">
            Cancel
          </button>
        </div>
        <p className="text-sm text-forest/60 mb-4">How would you like to add a reservation?</p>
        <div className="space-y-3">
          <button
            onClick={() => setAddMode('upload')}
            className="card w-full text-left hover:border-sage/40 hover:bg-sage/5 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">📄</span>
              <div>
                <p className="font-medium text-forest">Upload PDFs</p>
                <p className="text-sm text-forest/50 mt-0.5">Upload one or many confirmation PDFs at once — Claude reads each, fills everything in, flags duplicates, and saves the files for offline access</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => setAddMode('parse')}
            className="card w-full text-left hover:border-sage/40 hover:bg-sage/5 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">✨</span>
              <div>
                <p className="font-medium text-forest">Paste email text</p>
                <p className="text-sm text-forest/50 mt-0.5">Copy and paste your confirmation email — Claude fills everything in automatically</p>
              </div>
            </div>
          </button>
          <button
            onClick={() => setAddMode('manual')}
            className="card w-full text-left hover:border-sage/40 hover:bg-sage/5 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">✏️</span>
              <div>
                <p className="font-medium text-forest">Enter manually</p>
                <p className="text-sm text-forest/50 mt-0.5">Type in the details yourself</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    )
  }

  if (addMode === 'manual') {
    return (
      <div className="p-4 pt-6 pb-10">
        {saveMutation.isError && (
          <p className="text-sm text-terracotta bg-terracotta/10 rounded-lg px-3 py-2 mb-3">
            {(saveMutation.error as Error).message}
          </p>
        )}
        <ReservationForm
          title="Add reservation"
          initial={EMPTY_FORM}
          onSave={(form) => handleSave(form)}
          onCancel={() => setAddMode(null)}
          saving={saveMutation.isPending}
        />
      </div>
    )
  }

  if (addMode === 'parse') {
    return (
      <div className="p-4 pt-6 pb-10">
        {saveMutation.isError && (
          <p className="text-sm text-terracotta bg-terracotta/10 rounded-lg px-3 py-2 mb-3">
            {(saveMutation.error as Error).message}
          </p>
        )}
        <ParseEmailFlow
          onSave={(form, raw) => handleSave(form, raw)}
          onCancel={() => setAddMode(null)}
          saving={saveMutation.isPending}
        />
      </div>
    )
  }

  if (addMode === 'upload') {
    return (
      <div className="p-4 pt-6 pb-10">
        {saveBatchMutation.isError && (
          <p className="text-sm text-terracotta bg-terracotta/10 rounded-lg px-3 py-2 mb-3">
            {(saveBatchMutation.error as Error).message}
          </p>
        )}
        <UploadPdfFlow
          existing={reservations}
          onSaveBatch={(drafts) => saveBatchMutation.mutate(drafts)}
          onCancel={() => setAddMode(null)}
          saving={saveBatchMutation.isPending}
        />
      </div>
    )
  }

  // ── main list ──
  return (
    <div className="p-4 pt-6 pb-10">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-forest">Wallet</h1>
        <button onClick={() => setAddMode('choose')} className="btn-primary text-sm px-3 py-1.5">
          + Add
        </button>
      </div>

      {isLoading && (
        <p className="text-forest/40 text-sm text-center py-20">Loading…</p>
      )}

      {!isLoading && reservations.length === 0 && (
        <div className="card text-center py-14 space-y-3">
          <p className="text-3xl">🗂️</p>
          <p className="font-medium text-forest">No reservations yet</p>
          <p className="text-sm text-forest/50">
            Add flights, hotels, car rentals, and restaurants.<br />
            Paste a confirmation email and Claude does the rest.
          </p>
          <button onClick={() => setAddMode('choose')} className="btn-primary mt-2">
            + Add reservation
          </button>
        </div>
      )}

      {reservations.length > 0 && (
        <div className="space-y-3">
          {reservations.map((r) => (
            <ReservationCard
              key={r.id}
              res={r}
              onDelete={() => {
                if (confirm('Delete this reservation?')) deleteMutation.mutate(r)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useRef } from 'react'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
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

const PARSE_SYSTEM_PROMPT = `You are a travel reservation parser. Extract structured data from the pasted email confirmation text and return ONLY valid JSON with no preamble or markdown.

Return this exact structure:
{
  "type": "flight|hotel|car|restaurant|activity|other",
  "title": "string",
  "provider": "string",
  "confirmation_number": "string",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "address": "string",
  "details": {}
}

Put any extra useful fields (seat numbers, terminal, baggage, check-in instructions, etc.) inside "details" as key-value pairs.
If a field cannot be determined, use null.`

// ── helpers ────────────────────────────────────────────────────────────────────

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
  cost: string
  details: Json
}

const EMPTY_FORM: FormState = {
  type: 'other', title: '', provider: '', confirmation_number: '',
  date: '', time: '', address: '', cost: '', details: {},
}

// ── ReservationCard ────────────────────────────────────────────────────────────

function ReservationCard({ res, onDelete }: { res: Reservation; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyConf() {
    if (!res.confirmation_number) return
    navigator.clipboard.writeText(res.confirmation_number)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const detailEntries = res.details && typeof res.details === 'object' && !Array.isArray(res.details)
    ? Object.entries(res.details as Record<string, Json>).filter(([, v]) => v != null)
    : []

  return (
    <div className="card">
      {/* Main row */}
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5 shrink-0">{TYPE_ICONS[res.type ?? 'other']}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-forest leading-snug truncate">{res.title || '—'}</p>
          {res.provider && <p className="text-xs text-forest/50 mt-0.5 truncate">{res.provider}</p>}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
            {res.date && <span className="text-xs text-forest/60">{fmtDate(res.date)}</span>}
            {res.time && <span className="text-xs text-forest/60">{fmtTime(res.time)}</span>}
          </div>
          {res.confirmation_number && (
            <button
              onClick={copyConf}
              className="mt-1.5 flex items-center gap-1.5 text-xs font-mono text-deep-teal bg-deep-teal/8 hover:bg-deep-teal/15 rounded px-2 py-0.5 transition-colors"
            >
              <span>{copied ? '✓ Copied!' : res.confirmation_number}</span>
              {!copied && <span className="text-deep-teal/50">⎘</span>}
            </button>
          )}
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-forest/30 hover:text-forest transition-colors text-sm mt-0.5 shrink-0 px-1"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-forest/10 space-y-2">
          {res.address && (
            <div>
              <span className="text-xs text-forest/40 uppercase tracking-wide">Address</span>
              <p className="text-sm text-forest mt-0.5">{res.address}</p>
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
            <a
              href={res.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-deep-teal underline"
            >
              📄 View confirmation PDF
            </a>
          )}
          <button
            onClick={onDelete}
            className="text-xs text-terracotta hover:text-forest transition-colors pt-1"
          >
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
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY as string,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: PARSE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: emailText }],
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
        throw new Error(err?.error?.message ?? res.statusText)
      }

      const data = await res.json()
      const text: string = data.content?.[0]?.text ?? ''
      const json = extractJson(text)
      const s = (k: string) => (typeof json[k] === 'string' ? (json[k] as string) : '')

      setParsed({
        type: (json.type as ReservationType) ?? 'other',
        title: s('title'),
        provider: s('provider'),
        confirmation_number: s('confirmation_number'),
        date: s('date'),
        time: s('time'),
        address: s('address'),
        details: (json.details ?? {}) as Json,
      })
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

// ── UploadPdfFlow ──────────────────────────────────────────────────────────────

type UploadStep = 'pick' | 'uploading' | 'parsing' | 'review' | 'error'

function UploadPdfFlow({
  onSave,
  onCancel,
  saving,
}: {
  onSave: (data: FormState, pdfUrl: string) => void
  onCancel: () => void
  saving: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<UploadStep>('pick')
  const [parsed, setParsed] = useState<Partial<FormState>>({})
  const [pdfUrl, setPdfUrl] = useState('')
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    setStep('uploading')
    setError('')
    try {
      // Read as base64 for Claude
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Upload to Supabase Storage
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const path = `${user.id}/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('reservation-pdfs')
        .upload(path, file, { contentType: 'application/pdf' })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('reservation-pdfs')
        .getPublicUrl(path)
      setPdfUrl(publicUrl)

      // Parse with Claude
      setStep('parsing')
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY as string,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: PARSE_SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 },
              },
              { type: 'text', text: 'Parse this confirmation document.' },
            ],
          }],
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }))
        throw new Error(err?.error?.message ?? res.statusText)
      }

      const data = await res.json()
      const text: string = data.content?.[0]?.text ?? ''
      const json = extractJson(text)
      const s = (k: string) => (typeof json[k] === 'string' ? (json[k] as string) : '')

      setParsed({
        type: (json.type as ReservationType) ?? 'other',
        title: s('title'),
        provider: s('provider'),
        confirmation_number: s('confirmation_number'),
        date: s('date'),
        time: s('time'),
        address: s('address'),
        details: (json.details ?? {}) as Json,
      })
      setStep('review')
    } catch (e) {
      setError((e as Error).message ?? 'Unknown error')
      setStep('error')
    }
  }

  if (step === 'pick') {
    return (
      <div className="space-y-4">
        <p className="font-display text-lg text-forest">Upload Confirmation PDF</p>
        <p className="text-sm text-forest/60">
          Upload a PDF of your confirmation email — Claude reads it and fills everything in. The file is saved so you can pull it up offline.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="btn-primary flex-1">
            📄 Choose PDF
          </button>
          <button onClick={onCancel} className="btn-secondary px-4">Cancel</button>
        </div>
      </div>
    )
  }

  if (step === 'uploading') {
    return (
      <div className="text-center py-16 space-y-3">
        <p className="text-3xl animate-pulse">📤</p>
        <p className="font-display text-lg text-forest">Uploading…</p>
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
        <p className="font-display text-lg text-forest">Something went wrong</p>
        <div className="bg-terracotta/10 border border-terracotta/20 rounded-lg p-3">
          <p className="text-sm text-terracotta">{error}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setStep('pick')} className="btn-secondary flex-1">Try again</button>
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    )
  }

  // review
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sage text-sm">✓ Parsed successfully · PDF saved</span>
      </div>
      <ReservationForm
        title="Review & save"
        initial={parsed}
        onSave={(data) => onSave(data, pdfUrl)}
        onCancel={onCancel}
        saving={saving}
      />
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
        trip_id: tripId!,
        type: form.type,
        title: form.title || null,
        provider: form.provider || null,
        confirmation_number: form.confirmation_number || null,
        date: form.date || null,
        time: form.time || null,
        address: form.address || null,
        cost: form.cost ? parseFloat(form.cost) : null,
        details: form.details,
        raw_email_text: rawEmail ?? null,
        pdf_url: pdfUrl ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations', tripId] })
      setAddMode(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reservations').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reservations', tripId] }),
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
                <p className="font-medium text-forest">Upload PDF</p>
                <p className="text-sm text-forest/50 mt-0.5">Upload your confirmation PDF — Claude reads it, fills everything in, and saves the file for offline access</p>
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
        {saveMutation.isError && (
          <p className="text-sm text-terracotta bg-terracotta/10 rounded-lg px-3 py-2 mb-3">
            {(saveMutation.error as Error).message}
          </p>
        )}
        <UploadPdfFlow
          onSave={(form, url) => handleSave(form, undefined, url)}
          onCancel={() => setAddMode(null)}
          saving={saveMutation.isPending}
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
                if (confirm('Delete this reservation?')) deleteMutation.mutate(r.id)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

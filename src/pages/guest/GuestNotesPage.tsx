import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DocType } from '@/types'

// Guest read-only Notes tab: trip notes + document text/links.
// Attached files are owner-only and never exposed here.

const DOC_TYPE_LABELS: Record<DocType, string> = {
  itinerary:    'Itinerary',
  side_quest:   'Side Quest',
  packing_list: 'Packing List',
  other:        'Other',
}

const DOC_TYPE_ICONS: Record<DocType, string> = {
  itinerary:    '🗺️',
  side_quest:   '⚡',
  packing_list: '🎒',
  other:        '📄',
}

interface GNote {
  id: string
  title: string
  content: string
  sort_order: number
}

interface GDocument {
  id: string
  title: string
  doc_type: string
  content: string
  url: string | null
  sort_order: number
}

function ExpandCard({
  icon,
  title,
  subtitle,
  content,
  url,
}: {
  icon?: string
  title: string
  subtitle?: string
  content: string
  url?: string | null
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card">
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        {icon && <span className="text-xl mt-0.5 shrink-0">{icon}</span>}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-forest leading-snug truncate">{title}</p>
          {subtitle && <p className="text-xs text-forest/40 mt-0.5">{subtitle}</p>}
          {!expanded && content && (
            <p className="text-xs text-forest/50 mt-0.5 truncate">{content}</p>
          )}
        </div>
        <span className="text-forest/30 text-sm select-none shrink-0">
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-forest/10 space-y-3">
          {content ? (
            <p className="text-sm text-forest whitespace-pre-wrap leading-relaxed">{content}</p>
          ) : (
            <p className="text-sm text-forest/30 italic">No content.</p>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-deep-teal hover:text-forest transition-colors underline"
            >
              Open link ↗
            </a>
          )}
        </div>
      )}
    </div>
  )
}

type SubTab = 'notes' | 'docs'

export default function GuestNotesPage() {
  const { shareCode } = useParams<{ shareCode: string }>()
  const [subTab, setSubTab] = useState<SubTab>('notes')

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['guest_notes', shareCode],
    queryFn: async (): Promise<GNote[]> => {
      const { data, error } = await supabase.rpc('guest_get_notes', { p_share_code: shareCode! })
      if (error) throw error
      return (data ?? []) as GNote[]
    },
    enabled: !!shareCode,
  })

  const { data: docs = [], isLoading: docsLoading } = useQuery({
    queryKey: ['guest_documents', shareCode],
    queryFn: async (): Promise<GDocument[]> => {
      const { data, error } = await supabase.rpc('guest_get_documents', { p_share_code: shareCode! })
      if (error) throw error
      return (data ?? []) as GDocument[]
    },
    enabled: !!shareCode,
  })

  const isLoading = subTab === 'notes' ? notesLoading : docsLoading

  return (
    <div className="p-4 pt-6 pb-10">
      <h1 className="font-display text-2xl text-forest mb-4">Notes</h1>

      {/* Sub-tabs */}
      <div className="flex border-b border-forest/10 mb-5">
        {(['notes', 'docs'] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              subTab === t
                ? 'text-forest border-forest'
                : 'text-forest/40 border-transparent hover:text-forest/70'
            }`}
          >
            {t === 'notes' ? 'Notes' : 'Documents'}
          </button>
        ))}
      </div>

      {isLoading && (
        <p className="text-forest/40 text-sm text-center py-20">Loading…</p>
      )}

      {!isLoading && subTab === 'notes' && (
        notes.length === 0 ? (
          <div className="card text-center py-14 space-y-2">
            <p className="text-3xl">📝</p>
            <p className="text-forest/50 text-sm">No notes shared for this trip.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <ExpandCard key={n.id} title={n.title} content={n.content} />
            ))}
          </div>
        )
      )}

      {!isLoading && subTab === 'docs' && (
        docs.length === 0 ? (
          <div className="card text-center py-14 space-y-2">
            <p className="text-3xl">🗂️</p>
            <p className="text-forest/50 text-sm">No documents shared for this trip.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {docs.map((d) => (
              <ExpandCard
                key={d.id}
                icon={DOC_TYPE_ICONS[d.doc_type as DocType] ?? '📄'}
                title={d.title}
                subtitle={DOC_TYPE_LABELS[d.doc_type as DocType] ?? d.doc_type}
                content={d.content}
                url={d.url}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}

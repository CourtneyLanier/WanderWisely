import { useState } from 'react'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import type { TripNote, TripDocument, DocType } from '@/types'

// ── constants ─────────────────────────────────────────────────────────────────

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

const ALL_DOC_TYPES: DocType[] = ['itinerary', 'side_quest', 'packing_list', 'other']

// ── NoteCard ──────────────────────────────────────────────────────────────────

function NoteCard({
  note,
  onDelete,
}: {
  note: TripNote
  onDelete: () => void
}) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [content, setContent] = useState(note.content)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('trip_notes')
        .update({ title: title.trim() || 'Note', content, updated_at: new Date().toISOString() })
        .eq('id', note.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip_notes'] })
      setEditing(false)
    },
  })

  function handleCancel() {
    setTitle(note.title)
    setContent(note.content)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="card space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="input font-medium"
          autoFocus
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Your notes here…"
          rows={6}
          className="input resize-none text-sm leading-relaxed"
        />
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="btn-primary flex-1"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button onClick={handleCancel} className="btn-secondary px-4">Cancel</button>
        </div>
        {saveMutation.isError && (
          <p className="text-xs text-terracotta">{(saveMutation.error as Error).message}</p>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-forest leading-snug">{note.title}</p>
          {!expanded && note.content && (
            <p className="text-xs text-forest/50 mt-0.5 truncate">{note.content}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setExpanded(true); setEditing(true) }}
            className="text-xs text-sage hover:text-forest transition-colors px-2 py-1"
          >
            Edit
          </button>
          <span className="text-forest/30 text-sm select-none">
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-forest/10">
          {note.content ? (
            <p className="text-sm text-forest whitespace-pre-wrap leading-relaxed">{note.content}</p>
          ) : (
            <p className="text-sm text-forest/30 italic">No content yet.</p>
          )}
          <button
            onClick={onDelete}
            className="text-xs text-terracotta hover:text-forest transition-colors mt-3"
          >
            Delete note
          </button>
        </div>
      )}
    </div>
  )
}

// ── DocCard ───────────────────────────────────────────────────────────────────

function DocCard({
  doc,
  onDelete,
}: {
  doc: TripDocument
  onDelete: () => void
}) {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(doc.title)
  const [docType, setDocType] = useState<DocType>(doc.doc_type)
  const [content, setContent] = useState(doc.content)
  const [url, setUrl] = useState(doc.url ?? '')

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('trip_documents')
        .update({
          title: title.trim() || 'Document',
          doc_type: docType,
          content,
          url: url.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip_documents'] })
      setEditing(false)
    },
  })

  function handleCancel() {
    setTitle(doc.title)
    setDocType(doc.doc_type)
    setContent(doc.content)
    setUrl(doc.url ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="card space-y-3">
        <div>
          <label className="block text-sm text-forest mb-1">Type</label>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
            className="input"
          >
            {ALL_DOC_TYPES.map((t) => (
              <option key={t} value={t}>{DOC_TYPE_ICONS[t]} {DOC_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm text-forest mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            className="input"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm text-forest mb-1">Notes</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Details, notes, or the full document text…"
            rows={6}
            className="input resize-none text-sm leading-relaxed"
          />
        </div>
        <div>
          <label className="block text-sm text-forest mb-1">Link (optional)</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="input text-sm"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !title.trim()}
            className="btn-primary flex-1"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          <button onClick={handleCancel} className="btn-secondary px-4">Cancel</button>
        </div>
        {saveMutation.isError && (
          <p className="text-xs text-terracotta">{(saveMutation.error as Error).message}</p>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xl mt-0.5 shrink-0">{DOC_TYPE_ICONS[doc.doc_type]}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-forest leading-snug truncate">{doc.title}</p>
          <p className="text-xs text-forest/40 mt-0.5">{DOC_TYPE_LABELS[doc.doc_type]}</p>
          {!expanded && doc.content && (
            <p className="text-xs text-forest/50 mt-0.5 truncate">{doc.content}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => { setExpanded(true); setEditing(true) }}
            className="text-xs text-sage hover:text-forest transition-colors px-2 py-1"
          >
            Edit
          </button>
          <span className="text-forest/30 text-sm select-none">
            {expanded ? '▲' : '▼'}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-forest/10 space-y-3">
          {doc.content ? (
            <p className="text-sm text-forest whitespace-pre-wrap leading-relaxed">{doc.content}</p>
          ) : (
            <p className="text-sm text-forest/30 italic">No content yet.</p>
          )}
          {doc.url && (
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-deep-teal hover:text-forest transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Open link
            </a>
          )}
          <button
            onClick={onDelete}
            className="text-xs text-terracotta hover:text-forest transition-colors"
          >
            Delete document
          </button>
        </div>
      )}
    </div>
  )
}

// ── AddNoteForm ───────────────────────────────────────────────────────────────

function AddNoteForm({ tripId, onDone }: { tripId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('trip_notes').insert({
        trip_id: tripId,
        title: title.trim() || 'Note',
        content,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip_notes', tripId] })
      onDone()
    },
  })

  return (
    <div className="card space-y-3">
      <p className="font-display text-lg text-forest">New note</p>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (e.g. Shopping list, Member numbers)"
        className="input"
        autoFocus
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Your notes here…"
        rows={5}
        className="input resize-none text-sm leading-relaxed"
      />
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => addMutation.mutate()}
          disabled={addMutation.isPending}
          className="btn-primary flex-1"
        >
          {addMutation.isPending ? 'Saving…' : 'Add note'}
        </button>
        <button onClick={onDone} className="btn-secondary px-4">Cancel</button>
      </div>
      {addMutation.isError && (
        <p className="text-xs text-terracotta">{(addMutation.error as Error).message}</p>
      )}
    </div>
  )
}

// ── AddDocForm ────────────────────────────────────────────────────────────────

function AddDocForm({ tripId, onDone }: { tripId: string; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [docType, setDocType] = useState<DocType>('other')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('trip_documents').insert({
        trip_id: tripId,
        title: title.trim(),
        doc_type: docType,
        content,
        url: url.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip_documents', tripId] })
      onDone()
    },
  })

  return (
    <div className="card space-y-3">
      <p className="font-display text-lg text-forest">New document</p>
      <div>
        <label className="block text-sm text-forest mb-1">Type</label>
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocType)}
          className="input"
        >
          {ALL_DOC_TYPES.map((t) => (
            <option key={t} value={t}>{DOC_TYPE_ICONS[t]} {DOC_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm text-forest mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Grand Canyon Itinerary, Sedona Side Quest Ideas"
          className="input"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm text-forest mb-1">Notes</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Details, notes, or the full document text…"
          rows={5}
          className="input resize-none text-sm leading-relaxed"
        />
      </div>
      <div>
        <label className="block text-sm text-forest mb-1">Link (optional)</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          className="input text-sm"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => addMutation.mutate()}
          disabled={addMutation.isPending || !title.trim()}
          className="btn-primary flex-1"
        >
          {addMutation.isPending ? 'Saving…' : 'Add document'}
        </button>
        <button onClick={onDone} className="btn-secondary px-4">Cancel</button>
      </div>
      {addMutation.isError && (
        <p className="text-xs text-terracotta">{(addMutation.error as Error).message}</p>
      )}
    </div>
  )
}

// ── NotesPage ─────────────────────────────────────────────────────────────────

type SubTab = 'notes' | 'docs'

export default function NotesPage() {
  const tripId = useAppStore((s) => s.tripId)
  const { data: trip } = useTrip()
  const queryClient = useQueryClient()
  const [subTab, setSubTab] = useState<SubTab>('notes')
  const [adding, setAdding] = useState(false)

  // ── Notes query ──
  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['trip_notes', tripId],
    queryFn: async (): Promise<TripNote[]> => {
      const { data, error } = await supabase
        .from('trip_notes')
        .select('*')
        .eq('trip_id', tripId!)
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId,
  })

  // ── Documents query ──
  const { data: docs = [], isLoading: docsLoading } = useQuery({
    queryKey: ['trip_documents', tripId],
    queryFn: async (): Promise<TripDocument[]> => {
      const { data, error } = await supabase
        .from('trip_documents')
        .select('*')
        .eq('trip_id', tripId!)
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data ?? []
    },
    enabled: !!tripId,
  })

  const deleteNoteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trip_notes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip_notes', tripId] }),
  })

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trip_documents').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip_documents', tripId] }),
  })

  if (!trip || !tripId) {
    return (
      <div className="p-4 pt-6">
        <h1 className="font-display text-2xl text-forest mb-4">Notes</h1>
        <div className="card text-center py-12">
          <p className="text-forest/50 text-sm">Set up your trip first.</p>
        </div>
      </div>
    )
  }

  const isLoading = subTab === 'notes' ? notesLoading : docsLoading

  return (
    <div className="p-4 pt-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl text-forest">Notes</h1>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="btn-primary text-sm px-3 py-1.5"
          >
            + Add
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-forest/10 mb-5">
        <button
          onClick={() => { setSubTab('notes'); setAdding(false) }}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            subTab === 'notes'
              ? 'text-forest border-forest'
              : 'text-forest/40 border-transparent hover:text-forest/70'
          }`}
        >
          Notes
        </button>
        <button
          onClick={() => { setSubTab('docs'); setAdding(false) }}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            subTab === 'docs'
              ? 'text-forest border-forest'
              : 'text-forest/40 border-transparent hover:text-forest/70'
          }`}
        >
          Documents
        </button>
      </div>

      {/* Add form */}
      {adding && subTab === 'notes' && (
        <div className="mb-4">
          <AddNoteForm tripId={tripId} onDone={() => setAdding(false)} />
        </div>
      )}
      {adding && subTab === 'docs' && (
        <div className="mb-4">
          <AddDocForm tripId={tripId} onDone={() => setAdding(false)} />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <p className="text-forest/40 text-sm text-center py-20">Loading…</p>
      )}

      {/* Notes list */}
      {!isLoading && subTab === 'notes' && (
        <>
          {notes.length === 0 && !adding && (
            <div className="card text-center py-14 space-y-3">
              <p className="text-3xl">📝</p>
              <p className="font-medium text-forest">No notes yet</p>
              <p className="text-sm text-forest/50">
                Keep shopping lists, member numbers,<br />phone numbers, or anything you need handy.
              </p>
              <button onClick={() => setAdding(true)} className="btn-primary mt-2">
                + Add note
              </button>
            </div>
          )}
          {notes.length > 0 && (
            <div className="space-y-3">
              {notes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onDelete={() => {
                    if (confirm('Delete this note?')) deleteNoteMutation.mutate(note.id)
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Docs list */}
      {!isLoading && subTab === 'docs' && (
        <>
          {docs.length === 0 && !adding && (
            <div className="card text-center py-14 space-y-3">
              <p className="text-3xl">🗂️</p>
              <p className="font-medium text-forest">No documents yet</p>
              <p className="text-sm text-forest/50">
                Store itineraries, side-quest ideas,<br />packing lists, and other trip documents.
              </p>
              <button onClick={() => setAdding(true)} className="btn-primary mt-2">
                + Add document
              </button>
            </div>
          )}
          {docs.length > 0 && (
            <div className="space-y-3">
              {docs.map((doc) => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  onDelete={() => {
                    if (confirm('Delete this document?')) deleteDocMutation.mutate(doc.id)
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

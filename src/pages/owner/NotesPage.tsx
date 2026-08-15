import { useState, useEffect, useRef } from 'react'
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import { useTrip } from '@/hooks/useTrip'
import {
  uploadDocFile,
  removeDocFile,
  getDocFileBlob,
  shareOrDownloadFile,
  ensureDocFileCached,
  formatBytes,
  ACCEPTED_DOC_ACCEPT,
  ACCEPTED_DOC_MIME,
  MAX_DOC_FILE_BYTES,
} from '@/lib/docFiles'
import { docFileRef } from '@/lib/docFiles'
import { hasCachedFile } from '@/lib/fileCache'
import FileViewer from '@/components/files/FileViewer'
import type { TripNote, TripDocument, DocType } from '@/types'

// Validate a picked file the same way the uploader does, for early feedback.
function validateDocFile(file: File): string | null {
  if (!ACCEPTED_DOC_MIME.includes(file.type)) return 'Choose a PDF, JPG, PNG, or WEBP.'
  if (file.size > MAX_DOC_FILE_BYTES) return `${(file.size / 1024 / 1024).toFixed(1)} MB — over the 25 MB limit.`
  return null
}

function fileIcon(type: string | null): string {
  if (type?.startsWith('image/')) return '🖼️'
  if (type === 'application/pdf') return '📕'
  return '📎'
}

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

  // File state
  const [newFile, setNewFile] = useState<File | null>(null)
  const [removeExisting, setRemoveExisting] = useState(false)
  const [fileErr, setFileErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Offline availability + view/share state
  const [offlineReady, setOfflineReady] = useState<boolean | null>(null)
  const [viewing, setViewing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [openErr, setOpenErr] = useState('')

  useEffect(() => {
    let active = true
    if (doc.file_path) {
      hasCachedFile(doc.id).then((v) => { if (active) setOfflineReady(v) })
    } else {
      setOfflineReady(null)
    }
    return () => { active = false }
  }, [doc.id, doc.file_path])

  async function handleShare() {
    setSharing(true)
    setOpenErr('')
    try {
      const file = await getDocFileBlob(doc)
      setOfflineReady(true)
      const err = await shareOrDownloadFile(file)
      if (err) setOpenErr(err)
    } catch (e) {
      setOpenErr((e as Error).message)
    } finally {
      setSharing(false)
    }
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const v = validateDocFile(f)
    if (v) { setFileErr(v); return }
    setFileErr('')
    setNewFile(f)
    setRemoveExisting(false)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: {
        title: string
        doc_type: DocType
        content: string
        url: string | null
        updated_at: string
        file_path?: string | null
        file_name?: string | null
        file_type?: string | null
        file_size?: number | null
      } = {
        title: title.trim() || 'Document',
        doc_type: docType,
        content,
        url: url.trim() || null,
        updated_at: new Date().toISOString(),
      }
      // Replace: upload new file first, then point the row at it.
      if (newFile) {
        if (doc.file_path) await removeDocFile(doc)
        const meta = await uploadDocFile(doc.id, newFile)
        Object.assign(payload, meta)
      } else if (removeExisting && doc.file_path) {
        await removeDocFile(doc)
        Object.assign(payload, { file_path: null, file_name: null, file_type: null, file_size: null })
      }
      const { error } = await supabase.from('trip_documents').update(payload).eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip_documents'] })
      setNewFile(null)
      setRemoveExisting(false)
      setEditing(false)
    },
  })

  function handleCancel() {
    setTitle(doc.title)
    setDocType(doc.doc_type)
    setContent(doc.content)
    setUrl(doc.url ?? '')
    setNewFile(null)
    setRemoveExisting(false)
    setFileErr('')
    if (fileRef.current) fileRef.current.value = ''
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
        <div>
          <label className="block text-sm text-forest mb-1">File (PDF or image)</label>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_DOC_ACCEPT}
            onChange={pickFile}
            className="hidden"
          />
          {newFile ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-forest truncate">📎 {newFile.name}</span>
              <span className="text-forest/40 text-xs shrink-0">{formatBytes(newFile.size)}</span>
              <button
                onClick={() => { setNewFile(null); if (fileRef.current) fileRef.current.value = '' }}
                className="text-xs text-terracotta hover:text-forest transition-colors ml-auto shrink-0"
              >
                Clear
              </button>
            </div>
          ) : doc.file_path && !removeExisting ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-forest truncate">{fileIcon(doc.file_type)} {doc.file_name}</span>
              <div className="flex gap-3 ml-auto shrink-0">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-xs text-sage hover:text-forest transition-colors"
                >
                  Replace
                </button>
                <button
                  onClick={() => setRemoveExisting(true)}
                  className="text-xs text-terracotta hover:text-forest transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              className="btn-secondary w-full text-sm"
            >
              {removeExisting ? 'Choose a replacement file' : '📎 Attach a file'}
            </button>
          )}
          {fileErr && <p className="text-xs text-terracotta mt-1">{fileErr}</p>}
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
          <p className="text-xs text-forest/40 mt-0.5">
            {DOC_TYPE_LABELS[doc.doc_type]}
            {doc.file_path && (
              <span className="ml-1.5 text-deep-teal">· {fileIcon(doc.file_type)} file</span>
            )}
          </p>
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
          {doc.file_path && (
            <div className="card-inset flex items-center gap-3">
              <span className="text-2xl shrink-0">{fileIcon(doc.file_type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-forest truncate">{doc.file_name}</p>
                <p className="text-[11px] text-forest/45 mt-0.5">
                  {formatBytes(doc.file_size)}
                  {offlineReady === true && <span className="text-sage"> · ✓ Saved offline</span>}
                  {offlineReady === false && <span className="text-gold"> · Not offline yet</span>}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  className="btn-secondary text-sm px-3 py-1.5"
                >
                  {sharing ? '…' : 'Save'}
                </button>
                <button
                  onClick={() => { setOpenErr(''); setViewing(true) }}
                  className="btn-primary text-sm px-3 py-1.5"
                >
                  View
                </button>
              </div>
            </div>
          )}
          {openErr && <p className="text-xs text-terracotta">{openErr}</p>}
          <button
            onClick={onDelete}
            className="text-xs text-terracotta hover:text-forest transition-colors"
          >
            Delete document
          </button>
        </div>
      )}

      {viewing && docFileRef(doc) && (
        <FileViewer
          file={docFileRef(doc)!}
          onClose={() => setViewing(false)}
          onCached={() => setOfflineReady(true)}
        />
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
  const [file, setFile] = useState<File | null>(null)
  const [fileErr, setFileErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const v = validateDocFile(f)
    if (v) { setFileErr(v); return }
    setFileErr('')
    setFile(f)
  }

  const addMutation = useMutation({
    mutationFn: async () => {
      // Insert first so we have the document id to key the file's storage path.
      const { data: inserted, error } = await supabase
        .from('trip_documents')
        .insert({
          trip_id: tripId,
          title: title.trim(),
          doc_type: docType,
          content,
          url: url.trim() || null,
        })
        .select()
        .single()
      if (error) throw error

      if (file) {
        const meta = await uploadDocFile(inserted.id, file)
        const { error: upErr } = await supabase
          .from('trip_documents')
          .update(meta)
          .eq('id', inserted.id)
        if (upErr) throw upErr
      }
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
      <div>
        <label className="block text-sm text-forest mb-1">File (optional — PDF or image)</label>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_DOC_ACCEPT}
          onChange={pickFile}
          className="hidden"
        />
        {file ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-forest truncate">📎 {file.name}</span>
            <span className="text-forest/40 text-xs shrink-0">{formatBytes(file.size)}</span>
            <button
              onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = '' }}
              className="text-xs text-terracotta hover:text-forest transition-colors ml-auto shrink-0"
            >
              Clear
            </button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} className="btn-secondary w-full text-sm">
            📎 Attach a file
          </button>
        )}
        <p className="text-[11px] text-forest/40 mt-1">Saved for offline use, so maps open with no signal.</p>
        {fileErr && <p className="text-xs text-terracotta mt-1">{fileErr}</p>}
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
    mutationFn: async (doc: TripDocument) => {
      // Clean up the attached file (Storage + local cache) before the row.
      if (doc.file_path) await removeDocFile(doc)
      const { error } = await supabase.from('trip_documents').delete().eq('id', doc.id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['trip_documents', tripId] }),
  })

  // Background prefetch: once documents load (and we're online), download any
  // attached files that aren't cached yet so they're ready offline.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const withFiles = docs.filter((d) => d.file_path)
    if (withFiles.length === 0) return
    let cancelled = false
    ;(async () => {
      for (const d of withFiles) {
        if (cancelled) break
        await ensureDocFileCached(d)
      }
    })()
    return () => { cancelled = true }
  }, [docs])

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
                Store itineraries, packing lists, and trip docs —<br />or attach a PDF/image map that opens offline.
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
                    if (confirm('Delete this document?')) deleteDocMutation.mutate(doc)
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

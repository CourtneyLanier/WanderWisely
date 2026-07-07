// Full-screen in-app viewer for files attached to trip documents.
//
// Why in-app: window.open(blobUrl) is popup-blocked after async work in mobile
// Safari and does nothing at all in the installed (standalone) PWA, so on a
// phone attached PDFs simply never opened. This overlay renders everything
// inside the app instead — images directly, PDFs page-by-page via pdf.js — and
// works fully offline from the local file cache. A Share/Save button hands the
// original file to the phone's share sheet (Save to Files, AirDrop, print, …).

import { useState, useEffect, useRef } from 'react'
import { getDocFileBlob, shareOrDownloadFile, formatBytes } from '@/lib/docFiles'
import type { CachedDocFile } from '@/lib/docFileCache'
import type { TripDocument } from '@/types'

// Cap canvas resolution — retina-crisp without huge memory use on long PDFs.
const MAX_PIXEL_RATIO = 2

export default function DocFileViewer({
  doc,
  onClose,
  onCached,
}: {
  doc: TripDocument
  onClose: () => void
  /** Called once the file is confirmed available locally (offline-ready). */
  onCached?: () => void
}) {
  const [file, setFile] = useState<CachedDocFile | null>(null)
  const [error, setError] = useState('')
  const [imgUrl, setImgUrl] = useState('')
  const [pdfStatus, setPdfStatus] = useState('') // progress text while rendering
  const [shareErr, setShareErr] = useState('')
  const pagesRef = useRef<HTMLDivElement>(null)

  const isImage = (file?.type ?? doc.file_type ?? '').startsWith('image/')
  const isPdf = (file?.type ?? doc.file_type ?? '') === 'application/pdf'

  // Lock background scroll + close on Escape while the overlay is up.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Load the file blob (local cache first, Storage fallback).
  useEffect(() => {
    let active = true
    getDocFileBlob(doc)
      .then((f) => {
        if (!active) return
        setFile(f)
        onCached?.()
      })
      .catch((e) => { if (active) setError((e as Error).message) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id])

  // Images: plain object URL.
  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file.blob)
    setImgUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  // PDFs: render every page into a canvas with pdf.js (lazy-loaded chunk).
  useEffect(() => {
    if (!file || file.type !== 'application/pdf') return
    let cancelled = false
    ;(async () => {
      try {
        setPdfStatus('Preparing PDF…')
        const pdfjs = await import('pdfjs-dist')
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.js?url')).default
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

        const data = await file.blob.arrayBuffer()
        const pdf = await pdfjs.getDocument({ data }).promise
        if (cancelled) return

        const container = pagesRef.current
        if (!container) return
        container.innerHTML = ''
        const cssWidth = container.clientWidth
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO)

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelled) return
          setPdfStatus(pdf.numPages > 1 ? `Rendering page ${i} of ${pdf.numPages}…` : 'Rendering…')
          const page = await pdf.getPage(i)
          const base = page.getViewport({ scale: 1 })
          const scale = cssWidth / base.width
          const viewport = page.getViewport({ scale: scale * dpr })

          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(viewport.width)
          canvas.height = Math.floor(viewport.height)
          canvas.style.width = '100%'
          canvas.style.height = 'auto'
          canvas.style.display = 'block'
          canvas.style.background = '#fff'
          canvas.style.borderRadius = '8px'
          canvas.style.boxShadow = '0 2px 10px rgba(0,0,0,.25)'
          canvas.style.marginBottom = '12px'
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          container.appendChild(canvas)
          await page.render({ canvasContext: ctx, viewport }).promise
        }
        if (!cancelled) setPdfStatus('')
      } catch (e) {
        if (!cancelled) {
          setPdfStatus('')
          setError((e as Error).message || 'Could not display this PDF.')
        }
      }
    })()
    return () => { cancelled = true }
  }, [file])

  async function handleShare() {
    if (!file) return
    setShareErr('')
    const err = await shareOrDownloadFile(file)
    if (err) setShareErr(err)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-forest/95">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{doc.file_name ?? 'File'}</p>
          <p className="text-[11px] text-white/50">{formatBytes(doc.file_size)}</p>
        </div>
        <button
          onClick={handleShare}
          disabled={!file}
          className="text-xs font-medium text-white bg-white/15 hover:bg-white/25 disabled:opacity-40 transition-colors rounded-lg px-3 py-2 shrink-0"
        >
          ⬇︎ Share / Save
        </button>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-white/80 hover:text-white text-xl leading-none px-2 py-1 shrink-0"
        >
          ✕
        </button>
      </div>
      {shareErr && <p className="px-4 pb-2 text-xs text-gold">{shareErr}</p>}

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 pb-6">
        {error && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-3">
            <p className="text-3xl">📄</p>
            <p className="text-sm text-white/85">{error}</p>
            <button onClick={onClose} className="btn-secondary text-sm px-4">Close</button>
          </div>
        )}

        {!error && !file && (
          <p className="text-center text-sm text-white/60 mt-16 animate-pulse">Loading…</p>
        )}

        {!error && file && isImage && imgUrl && (
          <img
            src={imgUrl}
            alt={doc.file_name ?? 'Attached image'}
            className="max-w-full h-auto mx-auto rounded-lg shadow-lg"
          />
        )}

        {!error && file && isPdf && (
          <div className="max-w-3xl mx-auto">
            {pdfStatus && (
              <p className="text-center text-sm text-white/60 my-4 animate-pulse">{pdfStatus}</p>
            )}
            <div ref={pagesRef} />
          </div>
        )}

        {!error && file && !isImage && !isPdf && (
          <div className="max-w-md mx-auto mt-16 text-center space-y-3">
            <p className="text-3xl">📎</p>
            <p className="text-sm text-white/85">
              This file type can't be previewed here — use Share / Save to open it in another app.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

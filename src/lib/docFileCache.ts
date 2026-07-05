// Local cache of document file blobs, so uploaded PDFs/images (e.g. offline
// maps) can be opened with no network. Kept in its own IndexedDB store so it
// never collides with the TanStack Query persister's default keyval store.

import { get, set, del, keys, createStore } from 'idb-keyval'

const store = createStore('wanderwisely-doc-files', 'files')

export interface CachedDocFile {
  blob: Blob
  name: string
  type: string
}

/** Read a cached file for a document, or undefined if not cached locally. */
export function getCachedDocFile(docId: string): Promise<CachedDocFile | undefined> {
  return get<CachedDocFile>(docId, store)
}

/** Store a file blob locally for offline access. */
export function putCachedDocFile(docId: string, file: CachedDocFile): Promise<void> {
  return set(docId, file, store)
}

/** Remove a cached file (called when its document is deleted). */
export function deleteCachedDocFile(docId: string): Promise<void> {
  return del(docId, store)
}

/** Whether a document's file is already available offline. */
export async function hasCachedDocFile(docId: string): Promise<boolean> {
  const all = await keys(store)
  return all.includes(docId)
}

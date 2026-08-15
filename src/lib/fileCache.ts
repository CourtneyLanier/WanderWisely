// Local cache of stored-file blobs, so uploaded PDFs/images (offline maps,
// reservation confirmations) can be opened with no network. Kept in its own
// IndexedDB store so it never collides with the TanStack Query persister's
// default keyval store.
//
// Keys are caller-assigned and must be globally unique across entity types:
// trip documents use the bare document id, reservations use `res:<id>`. The
// store name is unchanged from when this held documents only, so caches
// written before reservation PDFs were added still resolve.

import { get, set, del, keys, createStore } from 'idb-keyval'

const store = createStore('wanderwisely-doc-files', 'files')

export interface CachedFile {
  blob: Blob
  name: string
  type: string
}

/** Read a cached file, or undefined if it isn't cached locally. */
export function getCachedFile(key: string): Promise<CachedFile | undefined> {
  return get<CachedFile>(key, store)
}

/** Store a file blob locally for offline access. */
export function putCachedFile(key: string, file: CachedFile): Promise<void> {
  return set(key, file, store)
}

/** Remove a cached file (called when its owning record is deleted). */
export function deleteCachedFile(key: string): Promise<void> {
  return del(key, store)
}

/** Whether a file is already available offline. */
export async function hasCachedFile(key: string): Promise<boolean> {
  const all = await keys(store)
  return all.includes(key)
}

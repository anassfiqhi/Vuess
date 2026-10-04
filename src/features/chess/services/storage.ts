import { fail, ok, type Result } from '../types'

/**
 * Thin wrapper over localStorage. Access can throw (privacy modes, quota,
 * disabled storage), so every call returns a Result instead.
 */
function getStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function readRaw(key: string): Result<string | null> {
  const storage = getStorage()
  if (!storage) return fail('Browser storage is unavailable.')
  try {
    return ok(storage.getItem(key))
  } catch {
    return fail('Browser storage could not be read.')
  }
}

export function writeRaw(key: string, value: string): Result<true> {
  const storage = getStorage()
  if (!storage) return fail('Browser storage is unavailable, so progress will not be saved.')
  try {
    storage.setItem(key, value)
    return ok(true)
  } catch {
    return fail('Saving failed (storage may be full or disabled). Progress will not survive a reload.')
  }
}

export function removeRaw(key: string): void {
  try {
    getStorage()?.removeItem(key)
  } catch {
    // Nothing useful to do; the next save overwrites the key anyway.
  }
}

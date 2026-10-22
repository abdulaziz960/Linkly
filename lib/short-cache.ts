/**
 * A tiny in-process cache for data every request re-reads before doing its own work (the signed-in user, the
 * workspace's subscription row, its feature grants). It does two things:
 *  - concurrent callers of the same key share one lookup (the dashboard fires about 11 requests at once, each
 *    of which used to run the same 4-5 queries - about 50 identical queries through a 4-connection pool);
 *  - the answer is reused for a few seconds.
 * Only successful, non-null answers are remembered, so a failure or a "not found" is always looked up afresh.
 * A change made through this process can drop its key right away (invalidateShortCache); a change made by
 * another instance shows within the TTL. Disabled under tests, where one process plays every role.
 */
const entries = new Map<string, { at: number; value?: unknown; pending?: Promise<unknown> }>();
const MAX_ENTRIES = 2000;

// SHORT_CACHE_FORCE=1 turns it back on for this module's own tests.
const disabled = () => (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST)) && process.env.SHORT_CACHE_FORCE !== "1";

export async function cachedFor<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  if (disabled() || ttlMs <= 0) return load();
  const now = Date.now();
  const hit = entries.get(key);
  if (hit) {
    if (hit.pending) return hit.pending as Promise<T>;
    if (now - hit.at < ttlMs) return hit.value as T;
  }
  if (entries.size >= MAX_ENTRIES) entries.clear();
  const pending = load().then(
    (value) => {
      if (value === null || value === undefined) entries.delete(key);
      else entries.set(key, { at: Date.now(), value });
      return value;
    },
    (error) => {
      entries.delete(key);
      throw error;
    }
  );
  entries.set(key, { at: now, pending });
  return pending;
}

/** Forgets every key that starts with the prefix (e.g. "sub:tenant-1"). */
export function invalidateShortCache(prefix: string) {
  for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
}

export const SHORT_CACHE_TTL_MS = 3000;

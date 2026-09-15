/**
 * Minimal in-memory cache for small, process-lifetime values (e.g. the
 * placeholder threshold pubkey in configController). Not a replacement for
 * the DB — nothing here is durable across restarts.
 */
const cache = new Map<string, unknown>();

export const storageService = {
  get<T>(key: string): T | undefined {
    return cache.get(key) as T | undefined;
  },

  set<T>(key: string, value: T): void {
    cache.set(key, value);
  },

  getOrSet<T>(key: string, factory: () => T): T {
    if (!cache.has(key)) cache.set(key, factory());
    return cache.get(key) as T;
  },
};

const PREFIX = 'cipher-protocol:';

export const storageService = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // ignore storage errors (private mode, quota, etc.)
    }
  },

  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      // ignore
    }
  },
};

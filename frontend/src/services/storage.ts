const memory = new Map<string, string>();
const failedWrites = new Set<string>();

// Private browsing and full storage must not prevent a game from opening.
export const storage = {
  get(key: string): string | null {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) {
        memory.set(key, value);
        return value;
      }
      // A removal in another tab (especially logout) must not resurrect a token.
      if (!failedWrites.has(key)) {
        memory.delete(key);
        return null;
      }
      return memory.get(key) ?? null;
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string) {
    memory.set(key, value);
    try {
      localStorage.setItem(key, value);
      failedWrites.delete(key);
    } catch {
      failedWrites.add(key);
      /* Session-only fallback. */
    }
  },
  remove(key: string) {
    memory.delete(key);
    failedWrites.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      /* Session-only fallback. */
    }
  },
};

export function persistedId(key: string, prefix = "") {
  const id = storage.get(key) || `${prefix}${crypto.randomUUID()}`;
  storage.set(key, id);
  return id;
}

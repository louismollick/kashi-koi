import type { PersistStorage, StateStorage, StorageValue } from 'zustand/middleware';

/**
 * JSON persistence that skips the stringify and write when no persisted field changed by reference,
 * so frequent state ticks (which only touch transient fields) cost a shallow compare.
 */
export function changeAwareStorage(storage: StateStorage): PersistStorage<unknown> {
  let last: StorageValue<unknown> | null = null;
  // Persisted state is always the plain object from `partialize`.
  const fields = (value: StorageValue<unknown>) => value.state as Record<string, unknown>;
  const unchanged = (next: StorageValue<unknown>) => {
    if (!last || last.version !== next.version) return false;
    const before = fields(last),
      after = fields(next),
      keys = Object.keys(after);
    return keys.length === Object.keys(before).length && keys.every((key) => Object.is(before[key], after[key]));
  };
  const parse = (text: string | null) => (text === null ? null : (JSON.parse(text) as StorageValue<unknown>));
  return {
    getItem: (key) => {
      const text = storage.getItem(key);
      return text instanceof Promise ? text.then(parse) : parse(text);
    },
    setItem: (key, value) => {
      if (unchanged(value)) return;
      last = value;
      return storage.setItem(key, JSON.stringify(value));
    },
    removeItem: (key) => {
      last = null;
      return storage.removeItem(key);
    },
  };
}

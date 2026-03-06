/**
 * Jest manual mock for 'electron-store'.
 * In-memory store so tests don't touch the filesystem and are isolated.
 */
const stores = new Map<string, Map<string, unknown>>();

function getStore(name: string) {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name)!;
}

class MockStore<T extends Record<string, unknown>> {
  private name: string;
  private defaults: T;

  constructor(options: { name: string; defaults: T }) {
    this.name = options.name;
    this.defaults = options.defaults;
    const store = getStore(this.name);
    for (const [k, v] of Object.entries(this.defaults)) {
      if (!store.has(k)) store.set(k, v);
    }
  }

  get(key: keyof T, defaultValue?: T[keyof T]): T[keyof T] {
    const store = getStore(this.name);
    const val = store.get(key as string);
    if (val !== undefined) return val as T[keyof T];
    return defaultValue !== undefined ? defaultValue : ((this.defaults as Record<string, unknown>)[key as string] as T[keyof T]);
  }

  set(key: keyof T, value: T[keyof T]): void {
    getStore(this.name).set(key as string, value);
  }

  delete(key: keyof T): void {
    getStore(this.name).delete(key as string);
  }

  clear(): void {
    getStore(this.name).clear();
    for (const [k, v] of Object.entries(this.defaults)) {
      getStore(this.name).set(k, v);
    }
  }
}

export default MockStore;

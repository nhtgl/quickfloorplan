import "@testing-library/jest-dom/vitest";

/**
 * Node 25 defines its own `localStorage` global, which shadows jsdom's and throws
 * unless the process was started with --localstorage-file. Replace it with a working
 * in-memory store so autosave behaves as it does in a browser.
 */
if (typeof localStorage === "undefined" || typeof localStorage.clear !== "function") {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => store.get(k) ?? null,
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
  Object.defineProperty(globalThis, "localStorage", { value: shim, configurable: true });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", { value: shim, configurable: true });
  }
}


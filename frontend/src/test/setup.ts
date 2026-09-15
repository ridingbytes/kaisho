/**
 * Test environment setup.
 *
 * Node 22 and later ship an experimental built-in
 * ``localStorage`` that is ``undefined`` unless the process
 * is started with ``--localstorage-file``. That global
 * shadows the one jsdom installs, so ``window`` exists and
 * ``localStorage`` does not — which reads like a broken
 * jsdom and is not:
 *
 *     ExperimentalWarning: localStorage is not available
 *     because --localstorage-file was not provided
 *
 * Put jsdom's back when Node has left a hole. Anything that
 * touches i18n needs it: detectLanguage() reads the stored
 * language on import.
 */
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  const shim: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => [...store.keys()][i] ?? null,
    removeItem: (k) => void store.delete(k),
    setItem: (k, v) => void store.set(k, String(v)),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: shim,
    configurable: true,
    writable: true,
  });
}

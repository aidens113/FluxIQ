import path from "node:path";
import { SQLiteEnvironmentStore } from "fluxiq/platform";

const state = globalThis as typeof globalThis & { __fluxiqEnvironmentStores?: Map<string, SQLiteEnvironmentStore> };
const stores = state.__fluxiqEnvironmentStores ??= new Map<string, SQLiteEnvironmentStore>();

/** Called with the primary's resolved FluxIQ root, never a client-selected path; one store per root, shared by separately bundled routes. */
export function getEnvironmentStore(platformRoot: string): SQLiteEnvironmentStore {
  const root = path.resolve(platformRoot);
  let store = stores.get(root);
  if (!store) {
    store = new SQLiteEnvironmentStore({ rootDir: path.join(root, "platform", "environments") });
    stores.set(root, store);
  }
  return store;
}

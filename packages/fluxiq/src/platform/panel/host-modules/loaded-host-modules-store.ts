import type { LoadedPlatformHostModules } from "./types.ts";

type LoadedState = { key: string; result: Promise<LoadedPlatformHostModules> };

const LOADED_KEY = Symbol.for("fluxiq.platformHostModules");

/** Held on globalThis for the same reason as the registry: Next bundles the loader and the routes separately. `clear` is for tests. */
export const loadedHostModulesStore = {
  read: (): LoadedState | undefined => (globalThis as Record<symbol, LoadedState | undefined>)[LOADED_KEY],
  write: (state: LoadedState): void => {
    (globalThis as Record<symbol, LoadedState | undefined>)[LOADED_KEY] = state;
  },
  clear: (): void => {
    delete (globalThis as Record<symbol, unknown>)[LOADED_KEY];
  }
};

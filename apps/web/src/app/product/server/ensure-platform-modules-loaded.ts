import { loadPlatformHostModules } from "fluxiq/platform/panel";

const LOADED_KEY = Symbol.for("fluxiq.panel.platformModulesLoaded");

type Holder = { [LOADED_KEY]?: Promise<void> };

/**
 * Loads the downstream host modules named by FLUXIQ_HOST_MODULE once per
 * process, so server components read the product manifest they registered.
 * A no-op outside the Node runtime or without the variable. A failure is
 * remembered, so every caller sees the same startup error.
 */
export function ensurePlatformModulesLoaded(): Promise<void> {
  const holder = globalThis as Holder;
  const existing = holder[LOADED_KEY];
  if (existing) return existing;
  const value = process.env.FLUXIQ_HOST_MODULE;
  const pending = process.env.NEXT_RUNTIME === "nodejs" && value ? loadPlatformHostModules({ value }).then(() => undefined) : Promise.resolve();
  holder[LOADED_KEY] = pending;
  return pending;
}

/** Forgets the memoised load; tests only. */
export function resetPlatformModulesLoadedForTests(): void {
  delete (globalThis as Holder)[LOADED_KEY];
}

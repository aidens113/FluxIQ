import type { RuntimeActivityPresentation } from "./types.ts";
import { runtimeActivityPresentationStorage } from "./storage.ts";

/** Separate concurrent runs never share a presentation adapter. */
export function runWithRuntimeActivityPresentation<T>(presentation: RuntimeActivityPresentation, run: () => T): T {
  return runtimeActivityPresentationStorage.run(presentation, run);
}

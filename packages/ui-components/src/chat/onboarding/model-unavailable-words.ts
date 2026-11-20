import { modelAccessWords } from "../../model-access/index.ts";
import { modelAccessFromReadiness } from "./access-from-readiness.ts";
import type { ModelReadiness } from "./model-readiness.ts";

/** A saved-key problem in the shared model-access words; configuration feedback, never an extra client sign-in. Null when the key is not the problem. */
export function modelUnavailableWords(readiness: ModelReadiness): string | null {
  if (!readiness.startsWith("unavailable:")) return null;
  const state = modelAccessFromReadiness(readiness);
  return state === null ? null : modelAccessWords(state).sentence;
}

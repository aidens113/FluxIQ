import type { ModelReadiness } from "./model-readiness.ts";

/** Saved-key problems are configuration feedback, never an extra client sign-in. */
export function modelUnavailableWords(readiness: ModelReadiness): string | null {
  switch (readiness) {
    case "unavailable:legacy_recovery_required":
      return "This saved model key needs recovery in FluxIQ before AI can use it.";
    case "unavailable:host_protection_unavailable":
      return "This FluxIQ host cannot open saved model keys right now. Check the host configuration.";
    case "unavailable:ciphertext_invalid":
      return "This saved model key could not be read. Check or replace it in FluxIQ.";
    case "unavailable:upgrade_required":
      return "This FluxIQ instance uses an older model-key access flow. Update FluxIQ before using AI here.";
    default:
      return null;
  }
}

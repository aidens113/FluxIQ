import type { ElementFingerprint, ElementFingerprintCandidate, ElementMatcher } from "../../target-matching/index.ts";
import { compactJsonObject, matchOutputTarget, outputDispatchFailure, outputTargetMinimumConfidence, type OutputTargetPreparer } from "../index.ts";

type ExampleTarget = { fingerprint: ElementFingerprint; candidates?: ElementFingerprintCandidate[] };

/**
 * A domain's preparer as Core's tests need one: Core has no reading of a target
 * of its own, so a test of what Core does with the answer supplies this. It
 * reads `parameters.target` exactly as written and matches it generically.
 */
export function exampleOutputTargetPreparer(elementMatcher?: ElementMatcher): OutputTargetPreparer {
  return ({ action, output }) => {
    const target = action.parameters.target as ExampleTarget | undefined;
    if (!target) {
      if (output.metadata?.elementTarget !== true) return { ok: true };
      return {
        ok: false,
        error: `Output ${output.id} declares element targeting but parameters.target does not contain an element fingerprint.`,
        failure: outputDispatchFailure("graph_validation_or_unknown_node", "element_target.missing_fingerprint", false, "target_resolution")
      };
    }
    const resolved = matchOutputTarget(target.fingerprint, target.candidates, outputTargetMinimumConfidence(output.metadata?.elementTargetMinConfidence, output.safety?.level), elementMatcher);
    if (!resolved.ok) return resolved;
    return {
      ok: true,
      parameters: compactJsonObject({ ...action.parameters, target: { ...target, ...(resolved.selectedCandidate ? { selectedCandidate: resolved.selectedCandidate } : {}) } }),
      diagnostics: resolved.diagnostics,
      resolution: resolved.resolution
    };
  };
}

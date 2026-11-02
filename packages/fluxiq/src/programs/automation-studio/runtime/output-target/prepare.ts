import { normalizeAutomationStudioElementTarget, type AutomationStudioElementTarget } from "../../model/index.ts";
import { compactJsonObject, matchOutputTarget, outputDispatchFailure, outputTargetMinimumConfidence, type OutputTargetPreparer } from "../../../../runtime/output-dispatch/index.ts";
import type { ElementMatcher } from "../../../../runtime/target-matching/index.ts";
/** Explicit legacy envelope adapter; generic dispatch never infers these fields. */
export function createAutomationStudioOutputTargetPreparer(elementMatcher?: ElementMatcher): OutputTargetPreparer {
  return ({ action, output }) => {
    const outputId = action.outputId?.trim() ?? "";
    const parameters = action.parameters && typeof action.parameters === "object" && !Array.isArray(action.parameters) ? action.parameters : {};
    const target = normalizeAutomationStudioElementTarget(parameters.target, { source: "runtime" })
      ?? normalizeAutomationStudioElementTarget(parameters, { source: "runtime" });
    const required = output.metadata?.elementTarget === true || output.metadata?.targetKind === "element";
    if (!target) {
      if (!required)
        return { ok: true };
      return {
        ok: false,
        error: `Output ${outputId} declares element targeting but parameters.target does not contain an element fingerprint.`,
        failure: outputDispatchFailure("graph_validation_or_unknown_node", "element_target.missing_fingerprint", false, "target_resolution")
      };
    }
    const resolved = matchOutputTarget(target.fingerprint, target.candidates, outputTargetMinimumConfidence(output.metadata?.elementTargetMinConfidence, output.safety?.level), elementMatcher);
    if (!resolved.ok)
      return resolved;
    const preparedTarget = resolved.selectedCandidate
      ? compactJsonObject({ ...target, selectedCandidate: resolved.selectedCandidate }) as unknown as AutomationStudioElementTarget
      : target;
    return { ok: true, parameters: compactJsonObject({ ...parameters, target: preparedTarget }), diagnostics: resolved.diagnostics, resolution: resolved.resolution };
  };
}

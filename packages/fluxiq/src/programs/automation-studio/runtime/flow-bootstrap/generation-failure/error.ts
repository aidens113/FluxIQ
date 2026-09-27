// The error a refused Flow Bootstrap throws, and that error read back off a
// caught value.
//
// The message carries nothing but the code -- a provider's reply, a tool's
// result and the model's own text all pass through this stage, and none of them
// may ride out on an error string.
import type { AutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic.ts";
import { parseAutomationStudioFlowBootstrapFailureDiagnostic } from "./diagnostic-parse.ts";

export class AutomationStudioFlowBootstrapGenerationError extends Error {
  readonly name = "AutomationStudioFlowBootstrapGenerationError";

  constructor(readonly diagnostic: AutomationStudioFlowBootstrapFailureDiagnostic) {
    super(`Flow Bootstrap generation failed (${diagnostic.code}).`);
  }
}

/**
 * The diagnostic a caught value carries, or `null` when it carries none.
 *
 * `null` means only "not one of ours", and a caller that turns it into a failure
 * report of its own must name what it did instead -- see
 * `automationStudioFlowBootstrapFailureDiagnosticOf`, which never returns one.
 */
export function parseAutomationStudioFlowBootstrapGenerationError(
  value: unknown
): AutomationStudioFlowBootstrapFailureDiagnostic | null {
  if (!isObject(value)) return null;
  const read = thrownDiagnostic(value);
  return typeof read === "string" ? null : read;
}

/**
 * The diagnostic on a thrown value, `"not_ours"` when it is some other throw,
 * and `"unreadable"` when reading it threw.
 *
 * A value that fights being read -- a getter that throws, a proxy -- is not one
 * Core wrote, and this is called from inside a `catch`: a throw escaping here
 * would replace the failure being reported with a failure to report it.
 */
function thrownDiagnostic(
  value: Record<string, unknown>
): AutomationStudioFlowBootstrapFailureDiagnostic | "not_ours" | "unreadable" {
  try {
    const diagnostic = parseAutomationStudioFlowBootstrapFailureDiagnostic(value.diagnostic);
    if (!diagnostic) return "not_ours";
    if (value.name !== "AutomationStudioFlowBootstrapGenerationError") return "not_ours";
    if (value.message !== `Flow Bootstrap generation failed (${diagnostic.code}).`) return "not_ours";
    return diagnostic;
  } catch {
    return "unreadable";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

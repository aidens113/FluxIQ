// A build failure that carries what the build spent.
//
// **Why (t354).** Lane A round 3 (`run-muyqgopm-1bfa7054`) ended a candidate
// build that had spent $0.0206 on seventeen decisions with no accounting at
// all, so the Lab's per-build check and its spend ledger read $0. A failure is
// the only record of a build that made nothing, and the per-build ceiling is
// read off it: a failure without its spend says the build was free.
//
// Two shapes lose it. A failure with no accounting gets the build's. A
// harness failure carries the accounting of the one request that failed --
// its id, its provider's status and refusal, and that request's tokens only --
// so the build's spend replaces the request's tokens and cost, and the
// request's identity stays: what a provider-failure reader correlates by.
//
// A failure whose code may not name a cost
// (`../../flow-bootstrap/generation-failure/failure-state.ts`: nothing was
// sent, or the request's answer is unknown) is left as it is, as is anything
// that would not read back: a diagnostic whose fields and code disagree is
// erased by its reader, which is worse than a missing figure. Any other throw
// is the build's own catch's to classify.
import {
  AutomationStudioFlowBootstrapGenerationError,
  automationStudioFlowBootstrapFailureState,
  parseAutomationStudioFlowBootstrapGenerationError,
  type AutomationStudioBootstrapAccounting
} from "../../flow-bootstrap/index.ts";

const SPEND_FIELDS = ["inputTokens", "outputTokens", "totalTokens", "estimatedCostUsd"] as const;

/** `error` carrying the build's spend where its code allows one; anything else as it came. */
export function automationStudioFlowBootstrapFailureWithSpend(error: unknown, accounting: AutomationStudioBootstrapAccounting): unknown {
  const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
  if (!diagnostic) return error;
  if (automationStudioFlowBootstrapFailureState(diagnostic.code, diagnostic.stage, undefined).accounting === "absent") return error;
  let carried: NonNullable<typeof diagnostic.accounting>;
  if (!diagnostic.accounting) carried = structuredClone(accounting);
  else {
    carried = structuredClone(diagnostic.accounting);
    // The build's totals hold the failed request's own spend too; never less than the request said.
    for (const field of SPEND_FIELDS) {
      const total = Math.max(accounting[field] ?? 0, diagnostic.accounting[field] ?? 0);
      if (total > 0 || accounting[field] !== undefined) carried[field] = total;
    }
  }
  const replaced = new AutomationStudioFlowBootstrapGenerationError({ ...diagnostic, accounting: carried });
  return parseAutomationStudioFlowBootstrapGenerationError(replaced) ? replaced : error;
}

// A decision call that was made, paid for, and came back unusable.
//
// An evidence loop asks the provider what to do next, one call per decision. A
// call can fail in two very different ways. It can fail because of the
// authorization or the request itself -- the grant ended, the key was
// rejected, Core refused to build the request -- and nothing about asking again
// changes that. Or it can fail because of the reply or the network -- a
// malformed object, a reply that did not pass Core's checks, a timeout, a
// moment of provider unavailability -- and the next call may well succeed. The
// execution grant already draws exactly that line with the failure-disposition
// table: the first kind ends the grant, the second only spends the call.
//
// This module draws the same line for the loop. A caller whose decision call
// failed the second way throws `AutomationStudioLlmUnusableDecisionError`, and
// a loop configured for it spends that iteration and asks again rather than
// ending. Whether a result is that kind of failure is read from the same table
// the grant reads, so "a failure the grant survives" and "a decision worth
// asking again" can never drift apart.
//
// Closed, and it fails closed. Every error the call ended with must be a
// provider failure whose disposition is a spent call, or a finding in
// `llm_output.`, the harness's own namespace for a reply that arrived and did
// not pass Core's checks. An `ok` result whose response was some other kind is
// the same thing. Anything else -- a refused budget, a pre-flight refusal, a
// usage breach, a conflicting instruction, a failure with no provider code, a
// provider that was never reached -- is not asked again.
//
// The runtime recovery path carries the same rule privately
// (`recovery/annotation/exploration.ts`); this is the shared form of it.

import { automationStudioLlmProviderFailureSpendsCall } from "./failure-disposition.ts";
import type { AutomationStudioLlmTaskResult } from "./harness.ts";

const ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;

/**
 * Thrown by a decision callback to say "the provider was asked and its answer
 * cannot be acted on, for a reason another attempt could fix". It carries
 * issue codes only, never a model's words.
 */
export class AutomationStudioLlmUnusableDecisionError extends Error {
  readonly name = "AutomationStudioLlmUnusableDecisionError";
  readonly issueCodes: readonly string[];

  constructor(issueCodes: readonly string[]) {
    const codes = issueCodes.filter((code) => ISSUE_CODE.test(code));
    super(`The decision call returned nothing usable${codes.length ? `: ${codes.join(", ")}` : "."}`);
    this.issueCodes = Object.freeze([...codes]);
  }
}

/**
 * Whether a failed decision call reached the provider and failed only on the
 * reply's or the network's side, in a way another attempt could fix.
 */
export function automationStudioLlmTaskResultSpentWithoutDecision(result: AutomationStudioLlmTaskResult): boolean {
  if (!result.provider) return false;
  return result.diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .every((diagnostic) => diagnostic.code.startsWith("llm_output.") || automationStudioLlmProviderFailureSpendsCall({
      code: diagnostic.code,
      status: providerStatus(diagnostic.metadata)
    }));
}

/**
 * The error to throw for a failed decision call when that call was only a
 * spent call, or `undefined` when the failure must end the loop instead.
 */
export function automationStudioLlmUnusableDecisionError(result: AutomationStudioLlmTaskResult): AutomationStudioLlmUnusableDecisionError | undefined {
  if (!automationStudioLlmTaskResultSpentWithoutDecision(result)) return undefined;
  return new AutomationStudioLlmUnusableDecisionError(result.diagnostics
    .filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => diagnostic.code));
}

function providerStatus(metadata: unknown): number | undefined {
  const status = metadata && typeof metadata === "object" ? (metadata as { providerStatus?: unknown }).providerStatus : undefined;
  return typeof status === "number" ? status : undefined;
}

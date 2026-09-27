// What a refused Flow Bootstrap publishes about itself: a code, the stage that
// produced it, whether it is worth another attempt, what is known about the
// provider call, and the bounded accounting and loop record behind it.
//
// Codes, identifiers and numbers, and in one field -- `accounting.providerRefusal`
// -- the screened account of what a provider said when it refused the request.
// Nothing the model wrote, and nothing of a provider's reply that has not been
// through the producing adapter's credential and locator screens and then this
// program's central bounds (`runtime/llm/refusal-record.ts`). That one field is
// the difference between a stored failure saying "the provider answered 400" and
// one that can say which field it objected to.
import type { AutomationStudioActionPermissionRequest } from "../../action-permissions/index.ts";
import type { AutomationStudioLlmProviderRefusal } from "../../provider-refusal/index.ts";
import type { AutomationStudioFlowBootstrapEvidenceStep } from "../evidence-loop-steps.ts";
import type { AutomationStudioFlowBootstrapFailureStage } from "./codes.ts";

export type AutomationStudioFlowBootstrapFailureDiagnostic = {
  code: string;
  stage: AutomationStudioFlowBootstrapFailureStage;
  retryable: boolean;
  providerInvocation: "not_attempted" | "attempted" | "unknown";
  providerResponse: "not_received" | "received" | "unknown";
  accounting?: {
    requestId: string;
    estimatedInputTokens: number;
    provider?: string;
    model?: string;
    providerStatus?: number;
    /**
     * What the provider said when it refused the request: the status, its own
     * error code, type, param and sentence, the shape of the request it refused,
     * and every omission named in `withheld`.
     *
     * **Why a refusal lives in the accounting.** It is not a cost, so this is an
     * odd home for it on the face of things. It is the right one because the
     * accounting is the part of a failure a reader keeps beside the run -- the
     * downstream facility's provider-failure sidecar reads exactly this object --
     * and a status with no account of what was wrong with the request is the
     * thing two live runs left behind. The alternative was a field beside
     * `accounting` that nothing was reading yet.
     *
     * **Only the harness projection writes it, and only through the same parse
     * the reader uses.** `flowBootstrapHarnessFailure` runs the record it is
     * given through `parseAutomationStudioLlmProviderRefusal` before storing it,
     * so a record this diagnostic carries is by construction one
     * `parseAccounting` accepts. Producer and reader share the function, for the
     * same reason they share the failure-state table: a field a producer can
     * write and a reader must refuse erases the whole diagnostic, which is the
     * defect this directory was split to fix.
     */
    providerRefusal?: AutomationStudioLlmProviderRefusal;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    estimatedCostUsd?: number;
  };
  evidenceLoop?: {
    iterationCount: number;
    decisionCount: number;
    toolCallCount: number;
    evidenceBytes: number;
    /**
     * Every decision the loop recorded, in order. A decision that called a
     * tool is named by that tool. One that called none is named by
     * `AUTOMATION_STUDIO_FLOW_BOOTSTRAP_DECISION_STEP_IDS`, with the first code
     * that refused it as its `resultCode` -- so a build stopped on refused
     * plans says, decision by decision, what refused each one.
     *
     * The step is `evidence-loop-steps.ts`'s own type rather than a copy of
     * it, and that is deliberate. A copy is how this record came to publish
     * three of the eight fields the trace had already kept: the builder there
     * widened, the shape here did not, and `parseEvidenceLoopCounts` rejects a
     * step carrying a field this record has not been told about -- so a widened
     * step would not have arrived short, it would have taken the whole
     * diagnostic down with it. One type, one allow-list, checked by a test.
     */
    steps?: AutomationStudioFlowBootstrapEvidenceStep[];
  };
  /**
   * The codes behind this failure that its own code does not already say.
   *
   * Two uses, both codes only, at most sixteen, never a message. Why a
   * completed plan was refused -- validation's own codes, or a domain's refusal
   * of a node's parameters. And, where the harness projection could not name a
   * refusal at all, the harness code it could not name
   * (`resolvedProviderHarnessFailure`'s and `preProviderHarnessFailureCode`'s
   * default arms): a build that lands on a catch-all code otherwise leaves no
   * trace of *which* unrecognised refusal it was, which is why the two runs
   * that recorded `flow_bootstrap.provider_transport_unknown` could only be
   * narrowed by elimination and never established.
   */
  issueCodes?: string[];
  /**
   * Present exactly when the code is `flow_bootstrap.permission_required`:
   * what the build needed to do, its consequences, the control as a person
   * would recognise it, and why. What FluxIQ asks the person with.
   */
  permissionRequest?: AutomationStudioActionPermissionRequest;
};

export const MAX_DIAGNOSTIC_ISSUE_CODES = 16;
/** The shape an issue code must have to travel: no whitespace, so no sentence. */
export const DIAGNOSTIC_ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;

/** Distinct issue codes, codes only, at most sixteen. */
export function flowBootstrapDiagnosticIssueCodes(codes: readonly string[]): string[] {
  return [...new Set(codes.filter((code) => DIAGNOSTIC_ISSUE_CODE.test(code)))].slice(0, MAX_DIAGNOSTIC_ISSUE_CODES);
}

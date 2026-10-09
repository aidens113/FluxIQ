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
import type { AutomationStudioLlmEvidenceLoopExhaustion, AutomationStudioLlmProviderThrow } from "../../llm/index.ts";
import type { AutomationStudioFlowBootstrapEvidenceStep } from "../evidence-loop-steps.ts";
import type { AutomationStudioFlowBootstrapBuildEnding } from "./build-ending.ts";
import type { AutomationStudioFlowBootstrapCandidateKept } from "./candidate-kept.ts";
import type { AutomationStudioFlowBootstrapFailureStage } from "./codes.ts";
import type { AutomationStudioFlowBootstrapRefusedStep } from "./refused-steps.ts";

export type AutomationStudioFlowBootstrapFailureDiagnostic = {
  /** Actual logical provider calls of this build, including reader and judges. */
  totalProviderCallCount?: number;
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
    /**
     * Present exactly when the code is `flow_bootstrap.evidence_iteration_limit`:
     * the build stopped because it ran out of turns, not because anything it
     * produced was wrong.
     *
     * `iterationCount` above says how many decisions were spent. This says how
     * many were allowed, which allowance ran out, and how far the draft had got
     * -- the facts that separate "this build needed a bigger budget" from "this
     * build was going nowhere". Before it the two read identically, and for
     * `run-mulryg6h-ff241a12` they read as
     * `flow_bootstrap.evidence_unusable_decision`
     * (`runtime/llm/evidence-loop/exhaustion.ts` records what that cost).
     *
     * Counts and one closed word, like everything else this record carries.
     * The loop's own record is reused rather than copied -- a copy is how this
     * diagnostic came to publish three of the eight fields the trace kept -- less
     * the last refusal's codes, which travel in `issueCodes` below so that a
     * reader has one place to look for them. The outstanding completion
     * failures stay behind as well: they are what a continuation of the build
     * is told (`flow-bootstrap/incomplete-draft/`), and while the last attempt
     * was the one refused they are the same codes as `issueCodes`.
     */
    exhausted?: Omit<AutomationStudioLlmEvidenceLoopExhaustion, "lastIssueCodes" | "outstandingIssueCodes">;
    /**
     * Present when the build kept its draft as an incomplete record
     * (`flow-bootstrap/incomplete-draft/`): which revision was written, and how
     * many proposable steps it holds. Only beside a build that ended without an
     * accepted completion -- `flow_bootstrap.evidence_iteration_limit` or
     * `flow_bootstrap.evidence_unusable_decision` -- and it changes nothing about
     * that ending: the code still says why the build stopped, and this says only
     * that its work was not thrown away, and that the next build of the Flow
     * continues from it. Two counts; the steps themselves stay in the record.
     */
    incompleteDraft?: { revision: number; steps: number };
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
  /**
   * Present only beside `flow_bootstrap.provider_transport_unknown`: what the
   * provider call threw when the throw was not one of Core's own -- its class
   * and code, its cause's class and code, and its message once screened.
   *
   * That code says only that a request failed in a way nothing named, and
   * `run-mun5e1ie-5aeefbbd` was stored with it and nothing else, so a reset
   * socket, a connect timeout and a bug in the adapter all read the same. The
   * throw was read by `runtime/llm/throw-account/` and screened by
   * `runtime/llm/harness/throw-screen.ts` before the harness put it on its
   * failure diagnostic, and
   * the harness projection stores only what
   * `parseAutomationStudioFlowBootstrapProviderThrow` returns -- the reader's
   * own parse -- so a stored throw always reads back.
   */
  providerThrow?: AutomationStudioLlmProviderThrow;
  /**
   * Present exactly beside `flow_bootstrap.not_doable`,
   * `flow_bootstrap.build_not_finished`,
   * `flow_bootstrap.evidence_budget_exhausted`,
   * `flow_bootstrap.model_replies_unreadable` and
   * `flow_bootstrap.provider_unavailable`: what a build that could not
   * finish tells the person, as a message they read in the chat, and the same
   * facts as ids and counts (`./build-ending.ts`).
   */
  ending?: AutomationStudioFlowBootstrapBuildEnding;
  /**
   * Present only on a candidate-mode build's failure (t362): the candidate's
   * id, the latest revision Core accepted, whether it was kept as an
   * unverified draft, and each trial's verdict -- ids, counts and closed words
   * (`./candidate-kept.ts`). It says what the build left, never why it ended:
   * that is still the code.
   */
  candidate?: AutomationStudioFlowBootstrapCandidateKept;
  /**
   * Present only beside `flow_bootstrap.evidence_repeat_without_progress`
   * (t378): a few of the steps the last refused submission was refused at, as
   * the model described them, screened and clipped, each with the script line
   * or plan path its issue code in `issueCodes` is placed at
   * (`./refused-steps.ts`). The one place this record carries words the model
   * wrote: the chat's ending names the step ("the step 'keep requests with 5
   * or more mutual friends' was given a setting it doesn't take") where codes
   * alone said "a step".
   */
  refusedSteps?: AutomationStudioFlowBootstrapRefusedStep[];
};

export const MAX_DIAGNOSTIC_ISSUE_CODES = 16;
/** The shape an issue code must have to travel: no whitespace, so no sentence. */
export const DIAGNOSTIC_ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;

/** Distinct issue codes, codes only, at most sixteen. */
export function flowBootstrapDiagnosticIssueCodes(codes: readonly string[]): string[] {
  return [...new Set(codes.filter((code) => DIAGNOSTIC_ISSUE_CODE.test(code)))].slice(0, MAX_DIAGNOSTIC_ISSUE_CODES);
}

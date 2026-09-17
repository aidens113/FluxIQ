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
//
// It also says what the model is told before it is asked again, and when two
// unusable decisions are the same one. A model asked again with nothing to
// say what was wrong can only guess, and a loop that counts every unusable
// decision alike stops a model that is fixing its mistakes one at a time. So
// the loop hands the model the issue codes and the shape a decision takes, and
// treats a decision refused for a set of issues it has not seen as new.

import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLlmProviderFailureSpendsCall } from "./failure-disposition.ts";
import type { AutomationStudioLlmTaskResult } from "./harness.ts";

const ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;

/** The evidence entry an unusable decision's feedback arrives under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID = "core.decision_check";

/** The most issue codes one piece of feedback names. */
const MAX_FEEDBACK_ISSUE_CODES = 8;

/**
 * The decision shapes an evidence loop accepts, as the model is shown them
 * after a reply that was not one. Written as an example of each variant, not
 * as the schema: the schema is already in the request, and what a model that
 * missed it needs is the plainest picture of an answer.
 */
function acceptedDecision(): JsonObject {
  return {
    oneOf: [
      { kind: "tool_call", callId: "<a new id: letters, digits, . _ : ->", toolId: "<one toolId from the decision schema>", input: "<an object matching that tool's input schema>" },
      { kind: "complete", result: "<an object matching the completion schema, when the decision schema offers complete>" }
    ],
    rule: "Answer with exactly one of these objects and no other keys."
  };
}

const DECISION_FEEDBACK_INSTRUCTION = "Your previous decision could not be used, for the listed issue codes, and nothing ran. "
  + "Answer again with exactly one decision of the accepted shape. The same issues again count toward stopping this exploration.";

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

/**
 * What the model is shown after an unusable decision, before it is asked
 * again: the issue codes, how many steps in a row have given the loop nothing
 * new and how many end it, and the shape a decision takes. Codes only, never a
 * model's words; bounded to well under a kilobyte.
 */
export function automationStudioLlmUnusableDecisionFeedback(input: {
  issueCodes: readonly string[];
  stepsWithoutProgress: number;
  maxStepsWithoutProgress: number;
}): JsonObject {
  return {
    ok: false,
    code: "llm_evidence_loop.decision_unusable",
    issueCodes: [...new Set(input.issueCodes.filter((code) => ISSUE_CODE.test(code)))].slice(0, MAX_FEEDBACK_ISSUE_CODES),
    stepsWithoutProgress: input.stepsWithoutProgress,
    maxStepsWithoutProgress: input.maxStepsWithoutProgress,
    accepted: acceptedDecision(),
    instruction: DECISION_FEEDBACK_INSTRUCTION
  };
}

/**
 * The key two unusable decisions share when they failed for the same reasons:
 * their distinct issue codes, in order. The order a check lists them in and
 * how often it repeats one are not a different failure.
 */
export function automationStudioLlmUnusableDecisionIssueSet(issueCodes: readonly string[]): string {
  return JSON.stringify([...new Set(issueCodes)].sort());
}

function providerStatus(metadata: unknown): number | undefined {
  const status = metadata && typeof metadata === "object" ? (metadata as { providerStatus?: unknown }).providerStatus : undefined;
  return typeof status === "number" ? status : undefined;
}

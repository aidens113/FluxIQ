// A decision call that was made, paid for, and came back unusable.
//
// An evidence loop asks the provider what to do next, one call per decision. A
// call can fail in two very different ways. It can fail because of the
// credential or the request itself -- the caller's key was rejected or is
// gone, Core refused to build the request -- and nothing about asking again
// changes that. Or it can fail because of the reply or the network -- a
// malformed object, a reply that did not pass Core's checks, a timeout, a
// moment of provider unavailability -- and the next call may well succeed. The
// failure-disposition table draws exactly that line: the first kind ends the
// model's calls, the second only spends the call.
//
// This module draws the same line for the loop. A caller whose decision call
// failed the second way throws `AutomationStudioLlmUnusableDecisionError`, and
// a loop configured for it spends that iteration and asks again rather than
// ending. Whether a result is that kind of failure is read from that table, so
// "a failure that only spends the call" and "a decision worth asking again" can
// never drift apart.
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
import type { AutomationStudioLlmTaskResult, AutomationStudioLlmUsageSummary } from "./harness.ts";
import { automationStudioLlmProviderPaidUsage } from "./provider-contract.ts";
import { automationStudioLlmProviderReplyAccount, type AutomationStudioLlmProviderReplyAccount } from "./reply-account.ts";
import { automationStudioLlmProviderUnanswered } from "./unanswered-calls.ts";
import { automationStudioLlmUnreadableReplySaid } from "./unreadable-reply.ts";

const ISSUE_CODE = /^[a-z0-9_.:-]{1,100}$/i;

/** The evidence entry an unusable decision's feedback arrives under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_DECISION_FEEDBACK_TOOL_ID = "core.decision_check";

/**
 * The decision shapes an evidence loop accepts, as the model is shown them
 * after a reply that was not one. Written as an example of each variant, not
 * as the schema: the schema is already in the request, and what a model that
 * missed it needs is the plainest picture of an answer.
 */
//
// **Every kind the loop offered, and only those.** This listed `tool_call` and
// `complete` alone, so a model whose `amend_draft` was malformed was answered
// with a picture of every decision but the one it was making -- and editing the
// draft is the commonest decision a hard build makes (every lane-t172 build ran
// between seven and twenty of them). A wrap-up decision offers no tools and the
// final one no amending, so where the loop says what it offered, the picture
// shows that and nothing else; a caller that does not say gets all three.
function acceptedDecision(offers: AutomationStudioLlmUnusableDecisionOffers | undefined): JsonObject {
  const shapes: JsonObject[] = [];
  if (!offers || offers.tools) shapes.push({ kind: "tool_call", callId: "<a new id: letters, digits, . _ : ->", toolId: "<one toolId from the decision schema>", input: "<an object matching that tool's input schema>" });
  if (!offers || offers.complete) shapes.push({ kind: "complete", result: `<an object matching the completion schema${offers ? "" : ", when the decision schema offers complete"}>` });
  if (!offers || offers.amend) shapes.push({ kind: "amend_draft", amendments: [{ step: "<a step number the draft entry shows>", change: "<one change the decision schema lists>" }] });
  return { oneOf: shapes, rule: "Answer with exactly one of these objects and no other keys." };
}

/** Which kinds of decision the loop offered the decision that could not be used. */
export type AutomationStudioLlmUnusableDecisionOffers = { tools: boolean; complete: boolean; amend: boolean };

/** A closed grammar correction, never a provider-authored key or value. */
export type AutomationStudioLlmUnusableDecisionFieldIssue = {
  code: "llm_output.unexpected_field";
  path: "response.decision.write";
  expectedPath: "response.decision.input.write";
};

function screenedFieldIssues(issues: readonly AutomationStudioLlmUnusableDecisionFieldIssue[] | undefined): AutomationStudioLlmUnusableDecisionFieldIssue[] {
  return issues?.some((issue) => issue?.code === "llm_output.unexpected_field"
    && issue.path === "response.decision.write" && issue.expectedPath === "response.decision.input.write")
    ? [{ code: "llm_output.unexpected_field", path: "response.decision.write", expectedPath: "response.decision.input.write" }] : [];
}

const DECISION_FEEDBACK_INSTRUCTION = "Your previous decision could not be used, for the listed issue codes, and nothing ran. "
  + "Answer again with exactly one decision of the accepted shape. The same issues again count toward stopping this exploration.";

const UNREADABLE_INSTRUCTION = "Nothing ran and nothing changed. Answer the same question again, with exactly one complete JSON object of the accepted shape and nothing before or after it. "
  + "Keep it short: a rerun's input carries only the keys that change.";

/**
 * What an issue the loop itself refuses a decision for means, where the code
 * alone does not say what to do instead. Added only when that code is listed,
 * so every other feedback is exactly what it was.
 */
const ISSUE_INSTRUCTIONS: Readonly<Record<string, string>> = {
  // `./decision-handlers/look-withdrawal.ts`: a look asked for after an ignored redirect.
  "llm_evidence_loop.look_withdrawn": "Looking is withdrawn: you asked again for what you already hold right after being told you hold it, so no look runs and none is answered from memory. "
    + "Looks return once an action runs: run an action the instruction needs, amend the draft, or complete.",
  // `./evidence-loop/decision-refusal.ts`: a decision of a kind this decision was not offered.
  "llm_evidence_loop.complete_not_offered": "Finishing was not offered for this decision: the decision schema has no complete variant yet. Run a tool call the instruction needs first.",
  "llm_evidence_loop.amend_not_offered": "Editing the draft was not offered for this decision: the decision schema has no amend_draft variant. Choose one of the variants it does offer.",
  // `./evidence-loop/decision-refusal.ts`: a reply that was JSON, but not a decision of any accepted shape.
  "llm_evidence_loop.decision_shape_invalid": "The decision was JSON but not one of the accepted shapes: check its kind, write only the keys that shape lists, give input and result as objects, and give every amendment a step number and a change from the list.",
  // `./evidence-loop-decision.ts` (t194-w78): an amend_draft left with nothing because a rerun had no input.
  "llm_evidence_loop.rerun_needs_input": "A rerun needs input, and a rerun without it is dropped, so this amend_draft changed nothing: give the rerun an input -- the parameters to change, or {} to run the step again as it stands.",
  // `./evidence-loop-decision.ts` (t252, D1): a node call that runs now with a binding in its parameters.
  "run_node.binding_needs_write": "A binding runs only in the Flow; write the step (write true), or run it with the value and bind it after (amend_draft bind).",
  // `./evidence-loop-decision.ts` (t252, D3): a written node call with a binding that cannot be read.
  "run_node.binding_refused": "A binding in the written step could not be read; each run_node.binding_refused.<reason>:<path> code names where and why. "
    + "Write {\"$input\": \"<name>\", \"test\": <the value to test with>} with a name of letters and digits that starts lower case, or {\"$row\": \"<field>\"}, and nothing else in that object; {\"$step\": ...} is not available yet."
};

/**
 * Thrown by a decision callback to say "the provider was asked and its answer
 * cannot be acted on, for a reason another attempt could fix". It carries
 * issue codes only, never a model's words.
 *
 * Where the provider's reply arrived and could not be read, it also carries
 * the reply's account: which malformed case it was, its finish reason, its
 * length and what it cost (`./reply-account.ts`). One code for seven
 * cases is what left 14 refused decisions of `run-munw7ffn-fe1cecd2`
 * unexplained; the loop writes this onto the decision's row.
 */
export class AutomationStudioLlmUnusableDecisionError extends Error {
  readonly name = "AutomationStudioLlmUnusableDecisionError";
  readonly issueCodes: readonly string[];
  readonly reply?: AutomationStudioLlmProviderReplyAccount;
  /** Paid numeric usage, including parsed replies rejected by schema rather than unreadable JSON. */
  readonly usage?: AutomationStudioLlmUsageSummary;
  readonly fieldIssues?: readonly AutomationStudioLlmUnusableDecisionFieldIssue[];
  /**
   * Whether the provider gave no answer at all -- timed out, unreachable, a
   * server error, rate limited (`./unanswered-calls.ts`). Said on the error so
   * a reader outside this directory, the activity observer, can tell an outage
   * from a bad reply by shape, without importing the codes.
   */
  readonly providerUnanswered: boolean;

  constructor(issueCodes: readonly string[], reply?: AutomationStudioLlmProviderReplyAccount, fieldIssues?: readonly AutomationStudioLlmUnusableDecisionFieldIssue[], usage?: AutomationStudioLlmUsageSummary) {
    const codes = issueCodes.filter((code) => ISSUE_CODE.test(code));
    super(`The decision call returned nothing usable${codes.length ? `: ${codes.join(", ")}` : "."}`);
    this.issueCodes = Object.freeze([...codes]);
    this.providerUnanswered = automationStudioLlmProviderUnanswered(codes);
    const account = automationStudioLlmProviderReplyAccount(reply);
    if (account) this.reply = account;
    const paid = automationStudioLlmProviderPaidUsage(usage, { requireOutputTokens: false });
    if (paid) this.usage = Object.freeze(paid);
    const fields = codes.includes("llm_output.unexpected_field") ? screenedFieldIssues(fieldIssues) : [];
    if (fields.length) this.fieldIssues = Object.freeze(fields.map((field) => Object.freeze(field)));
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
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const reply = errors.map((diagnostic) => providerReply(diagnostic.metadata)).find((account) => account !== undefined);
  const fields: AutomationStudioLlmUnusableDecisionFieldIssue[] = errors.some((diagnostic) => diagnostic.code === "llm_output.unexpected_field"
    && diagnostic.path === "response.decision.write")
    ? [{ code: "llm_output.unexpected_field", path: "response.decision.write", expectedPath: "response.decision.input.write" }] : [];
  return new AutomationStudioLlmUnusableDecisionError(errors.map((diagnostic) => diagnostic.code), reply, fields, result.usage);
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
  /** What the unusable decision was offered, so the accepted shapes are the ones it could have given. */
  offers?: AutomationStudioLlmUnusableDecisionOffers;
  /** Known parser grammar locations only; screened again at this model boundary. */
  fieldIssues?: readonly AutomationStudioLlmUnusableDecisionFieldIssue[];
  /**
   * Present when the reply arrived and could not be read (`./unreadable-reply.ts`):
   * the note says what could not be read and how many in a row stop the loop,
   * in place of the no-progress count, which such a reply does not move.
   */
  unreadable?: { reply?: AutomationStudioLlmProviderReplyAccount | undefined; inARow: number; maxInARow: number };
}): JsonObject {
  // Every well-formed issue code (2026-09-30): it was the first eight.
  const issueCodes = [...new Set(input.issueCodes.filter((code) => ISSUE_CODE.test(code)))];
  const fieldIssues = issueCodes.includes("llm_output.unexpected_field") ? screenedFieldIssues(input.fieldIssues) : [];
  if (input.unreadable) {
    const { reply, inARow, maxInARow } = input.unreadable;
    const said = automationStudioLlmUnreadableReplySaid({ case: reply?.case, issueCodes: input.issueCodes });
    return {
      ok: false,
      code: "llm_evidence_loop.reply_unreadable",
      issueCodes,
      unreadable: { ...(reply ? { case: reply.case } : {}), said },
      unreadableInARow: inARow,
      maxUnreadableInARow: maxInARow,
      accepted: acceptedDecision(input.offers),
      instruction: `Your previous reply could not be read: ${said}. ${UNREADABLE_INSTRUCTION} ${maxInARow} unreadable replies in a row stop this build; that was ${inARow}.`
    };
  }
  return {
    ok: false,
    code: "llm_evidence_loop.decision_unusable",
    issueCodes,
    stepsWithoutProgress: input.stepsWithoutProgress,
    maxStepsWithoutProgress: input.maxStepsWithoutProgress,
    ...(fieldIssues.length ? { fieldIssues } : {}),
    accepted: acceptedDecision(input.offers),
    instruction: [DECISION_FEEDBACK_INSTRUCTION,
      ...(fieldIssues.length ? ["Place write at response.decision.input.write, inside the tool call input, rather than response.decision.write. This corrects grammar only; existing permission and tool checks still apply."] : []),
      ...[...new Set(input.issueCodes)].flatMap((code) => ISSUE_INSTRUCTIONS[code] ?? [])].join(" ")
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

/** The harness's account of a reply it could not read (`./harness/run.ts`), bounded again. */
function providerReply(metadata: unknown): AutomationStudioLlmProviderReplyAccount | undefined {
  return metadata && typeof metadata === "object" ? automationStudioLlmProviderReplyAccount((metadata as { providerReply?: unknown }).providerReply) : undefined;
}

function providerStatus(metadata: unknown): number | undefined {
  const status = metadata && typeof metadata === "object" ? (metadata as { providerStatus?: unknown }).providerStatus : undefined;
  return typeof status === "number" ? status : undefined;
}

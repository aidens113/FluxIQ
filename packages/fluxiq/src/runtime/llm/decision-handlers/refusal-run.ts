// Three decisions in a row refused, or changing nothing, for one reason end the
// round, and the build tests and judges the Flow so far instead of spending its
// purse (week report W2, the user's rule of 2026-10-06; the counting is
// `../evidence-progress/refusal-run.ts`). **Where the caller takes loop detection's signal (the
// answer-first rounds) no count ends the round (t1014):** the run is put on the ladder instead,
// steered and decided, and only the ladder's last rung ends it (`onTheLadder`).
//
// What counts, and as which kind:
//   - an amendment decision that changed nothing (`./amendment.ts`): its
//     refusals' reasons, or "keep adds nothing", or an edit that undid itself;
//   - a rerun that changed nothing, or found what its step had found
//     (`./refused-repeat.ts`, `./rerun-result.ts`);
//   - a call that would add a step or change the page and that the page
//     refused, applying nothing, by its result code -- unless typed failure and
//     execution facts prove it temporary, retryable and unacted
//     (`../repeat-guard/retry-later.ts`). Looks are left to the
//     searching guard (`./searching.ts`).
// Anything else decided between two of these breaks the run. At the second
// the model is told that one more ends this exploration (in candidate mode,
// that it ends the build with nothing tested; in a loop that drafts nothing, that
// it ends the work with nothing tested or judged); at the third the
// round stalls the way a run of refused repeats does (`./refused-repeat.ts`):
// with `unusableDecisions` configured, under the issue code the person's
// ending reads its reason from (`../../flow-bootstrap/unfinished-build/not-done.ts`).
//
// **The model is told the reason in words, never its digest (t378).** A refused
// candidate submission is counted under its category and a digest of its
// issues (`../../flow-bootstrap/candidate/submission-refusal.ts`), so the kind
// reads `call:<category>:<8 hex digits>`. That suffix means nothing to the
// model; the warning names the category and the issues, by code and line,
// instead (`reasonWords`), and `refusal` carries the kind without it.
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation";
import { automationStudioFlowDraftStepCopy } from "../../flow-authoring/draft/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW } from "../evidence-progress/index.ts";
import { automationStudioLlmEvidenceLoopFailure as failure, type AutomationStudioLlmEvidenceLoopResult } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE, AUTOMATION_STUDIO_LLM_LOOP_REFUSED_RUN_TOOL_ID, automationStudioLlmEvidenceRetriesLater } from "../repeat-guard/index.ts";
import { automationStudioLlmEvidenceLoopCaught } from "./loop-check.ts";
import { automationStudioLlmEvidenceLoopRaise } from "./loop-signal.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** The evidence entry the warning before the last refusal of a run is told under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID = "core.refusal_run";

/**
 * Decision `iteration` was refused, or changed nothing, for `kind`. Answers the
 * loop's ending when this is the third of one kind in a row (or throws the
 * stall, where decision errors propagate), and nothing while the round goes
 * on; at the second the model is warned. `issueCode` is what the stall is
 * recorded under.
 */
export function automationStudioLlmEvidenceRefusedOfAKind(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  kind: string,
  issueCode: string
): AutomationStudioLlmEvidenceLoopResult | undefined {
  const inARow = context.refusalRun.refused(iteration, kind);
  const { input, evidence } = context;
  if (inARow >= AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW) return input.loopSignal ? onTheLadder(context, iteration, inARow, issueCode) : stall(context, issueCode);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID);
  if (inARow < AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW - 1) return undefined;
  const { refusal, reason } = reasonWords(kind, evidence);
  const value: JsonObject = {
    ok: false,
    code: "llm_evidence_loop.refused_in_a_row",
    refusal,
    inARow,
    // Where no count ends the round there is no figure to reach (t1014).
    ...(input.loopSignal ? {} : { maxInARow: AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW }),
    instruction: input.loopSignal ? caughtWarning(inARow, reason) : input.discoveryOnly === true ? candidateWarning(inARow, reason) : input.draft === false ? undraftedWarning(inARow, reason) : draftWarning(inARow, reason)
  };
  context.accountEvidence(value);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID, value });
  return undefined;
}

/** How the round stops on a refusal run where the caller takes no loop signal: the error its caller built for a stall, or the loop's own ending. */
function stall(context: AutomationStudioLlmEvidenceDecisionHandlerContext, issueCode: string): AutomationStudioLlmEvidenceLoopResult {
  const { input, trace, accounting, draftSteps } = context;
  if (input.unusableDecisions) {
    const error = input.unusableDecisions.stalled({ issueCodes: [issueCode], trace: [...trace], accounting: { ...accounting }, steps: draftSteps.map((step) => automationStudioFlowDraftStepCopy(step)) });
    if (input.propagateDecisionErrors) throw error;
  }
  return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
}

/**
 * A refusal run where the caller takes loop detection's signal (t1014, user 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY
 * FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING"): no count ends the round. The run is a finding on loop
 * detection's ladder (`./loop-check.ts`), steered with the model's own loop decision, and each further decision refused
 * for the same reason is caught again and climbs it; only the ladder's last rung, raised as any other
 * (`./loop-signal.ts`), ends the round. The 2026-10-06 rule (three in a row end the round and the Flow is tested) holds
 * for a loop with no signal.
 */
function onTheLadder(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, inARow: number, issueCode: string): AutomationStudioLlmEvidenceLoopResult | undefined {
  automationStudioLlmEvidenceLoopCaught(context, iteration, { pattern: "no_progress", repeats: inARow, toolIds: [AUTOMATION_STUDIO_LLM_LOOP_REFUSED_RUN_TOOL_ID], unchanged: ["page", "rows", "acts", "draft"] });
  const signal = context.loops.due();
  if (!signal || automationStudioLlmEvidenceLoopRaise(context, iteration, signal) === "continue") return undefined;
  return stall(context, issueCode);
}

/** The warning where no count ends the round (t1014): one more is caught as a repeat, and the model decides. */
function caughtWarning(inARow: number, reason: string): string {
  return `Your last ${inARow} decisions were refused, or changed nothing, for the same reason (${reason}). One more decision refused for it is caught as a repeat, and you decide how to go on. `
    + "Do not send another decision of that kind: do what next beside the refusal says instead, run what the Flow still lacks, or complete if the Flow already does what the person asked.";
}

/** The warning in draft mode: the round ends and the Flow so far is tested and judged. */
function draftWarning(inARow: number, reason: string): string {
  return `Your last ${inARow} decisions were refused, or changed nothing, for the same reason (${reason}). One more decision refused for it ends this exploration, and the Flow is then tested and judged as it stands. `
    + "Do not send another decision of that kind: do what next beside the refusal says instead, run what the Flow still lacks, or complete if the Flow already does what the person asked.";
}

/**
 * The warning in a loop that drafts nothing and authors no candidate
 * (`draft: false`): a project's supervisor, a reset. Nothing is tested or
 * judged when its round ends; the loop just ends there (A8 launch 6,
 * `run-mv85vjqo-4c022aec`, step 107: the supervisor was told the Flow would be
 * tested and judged, and the build threw instead; t587).
 */
function undraftedWarning(inARow: number, reason: string): string {
  return `Your last ${inARow} decisions were refused, or changed nothing, for the same reason (${reason}). One more decision refused for it ends this work where it stands, with nothing tested or judged. `
    + "Do not send another decision of that kind: do what next beside the refusal says instead, send the move the refusal names as missing first, or complete with what you can honestly say is done and what is not.";
}

/**
 * The warning in candidate mode (`discoveryOnly`), where no Flow so far is
 * tested or judged when the round ends: the build ends with nothing tested
 * (lane D was warned of a final test and judgement candidate mode never runs).
 */
function candidateWarning(inARow: number, reason: string): string {
  return `Your last ${inARow} decisions were refused, or changed nothing, for the same reason (${reason}). One more decision refused for it ends this build with nothing tested. `
    + "Do not send another decision of that kind: do what next beside the refusal says instead -- correct the lines a refused submission names and submit the whole candidate again -- or look at the page for what the Flow still needs.";
}

/** The digest of a refusal's issues a kind may end in (`:` and 8 hex digits). */
const ISSUES_DIGEST = /:[0-9a-f]{8}$/u;

/**
 * The kind as the model is told it: `refusal` without the issues digest, and
 * `reason`, which for a digested kind also names the issues of the latest
 * refusal shown (the one just counted) by code and line, or by path.
 */
function reasonWords(kind: string, evidence: AutomationStudioLlmEvidenceDecisionHandlerContext["evidence"]): { refusal: string; reason: string } {
  if (!ISSUES_DIGEST.test(kind)) return { refusal: kind, reason: kind };
  const refusal = kind.replace(ISSUES_DIGEST, "");
  const issues = latestIssues(evidence);
  return { refusal, reason: issues.length ? `${refusal}, the same issues each time: ${issues.join("; ")}` : `${refusal}, the same issues each time` };
}

/** Each issue of the latest refusal shown that lists any, as `<code> at line <n>` (or at its path), once each. */
function latestIssues(evidence: AutomationStudioLlmEvidenceDecisionHandlerContext["evidence"]): string[] {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const value = evidence[index]!.value;
    if (!isObject(value) || value.ok !== false) continue;
    const listed = isObject(value.diagnostics) && Array.isArray(value.diagnostics.issues) ? value.diagnostics.issues : value.issues;
    if (!Array.isArray(listed) || !listed.length) continue;
    const words = new Set<string>();
    for (const issue of listed) {
      if (!isObject(issue) || typeof issue.code !== "string") continue;
      words.add(typeof issue.line === "number" ? `${issue.code} at line ${issue.line}` : typeof issue.path === "string" ? `${issue.code} at ${issue.path}` : issue.code);
    }
    return [...words];
  }
  return [];
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A call that ran: one more of a run of refusals when the page refused it,
 * applied nothing, would have added a step or changed the page, and supplies
 * no validated temporary, retryable, unacted failure (header). Answers the loop's ending when the
 * round stops here.
 */
export function automationStudioLlmEvidenceRefusedCallRun(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  call: {
    refused: boolean; effectApplied: boolean; effect: string; proposes?: boolean | undefined;
    resultCode?: string | undefined; resultReason?: string | undefined;
    failure?: AutomationStudioFailureRecord | undefined; personNeeded?: true | undefined;
  }
): AutomationStudioLlmEvidenceLoopResult | undefined {
  const counts = call.refused && !call.effectApplied && (call.effect === "mutate" || call.proposes === true) && !automationStudioLlmEvidenceRetriesLater(call);
  return counts ? automationStudioLlmEvidenceRefusedOfAKind(context, iteration, `call:${call.resultCode ?? "refused"}`, AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE) : undefined;
}

/// Decisions in a row refused, or changing nothing, for one reason (week report W2; the counting is
// `../evidence-progress/refusal-run.ts`). **No count of them ends a round (t1014 for the answer-first rounds, t1056 for
// every loop; user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS
// EVERYTHING").** At the second the model is told plainly that it keeps sending decisions refused for one reason, what
// the reason is, and what to do instead; from the third the run is put on loop detection's ladder, steered with the
// model's own loop decision, and each further one refused for the same reason is caught again and climbs it. The
// ladder's top rung runs the caller's own move where it names one, and ends the round only where a caller that takes the
// signal says so (`./ladder-top.ts`). The 2026-10-06 rule that three in a row end the round, and the Flow is tested, is
// gone: it ended builds that still had money.
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
// Anything else decided between two of these breaks the run.
//
// **The model is told the reason in words, never its digest (t378).** A refused
// candidate submission is counted under its category and a digest of its
// issues (`../../flow-bootstrap/candidate/submission-refusal.ts`), so the kind
// reads `call:<category>:<8 hex digits>`. That suffix means nothing to the
// model; the warning names the category and the issues, by code and line,
// instead (`reasonWords`), and `refusal` carries the kind without it.
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW } from "../evidence-progress/index.ts";
import { automationStudioLlmEvidenceLoopFailure as failure, type AutomationStudioLlmEvidenceLoopResult } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE, AUTOMATION_STUDIO_LLM_LOOP_REFUSED_RUN_TOOL_ID, automationStudioLlmEvidenceRetriesLater } from "../repeat-guard/index.ts";
import { automationStudioLlmEvidenceLadderTop } from "./ladder-top.ts";
import { automationStudioLlmEvidenceLoopCaught } from "./loop-check.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** The evidence entry the warning before the run is caught is told under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID = "core.refusal_run";

/**
 * Decision `iteration` was refused, or changed nothing, for `kind`. At the second of one kind in a row the model is
 * warned; from the third the run is caught on loop detection's ladder. Answers the loop's ending only where a caller
 * that takes loop detection's signal ends the round on it (or throws the stall, where decision errors propagate), and
 * nothing while the round goes on. `issueCode` is what that stall is recorded under.
 */
export function automationStudioLlmEvidenceRefusedOfAKind(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  kind: string,
  issueCode: string
): AutomationStudioLlmEvidenceLoopResult | undefined {
  const inARow = context.refusalRun.refused(iteration, kind);
  const { evidence } = context;
  if (inARow >= AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW) return onTheLadder(context, iteration, inARow, issueCode);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID);
  if (inARow < AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW - 1) return undefined;
  const { refusal, reason } = reasonWords(kind, evidence);
  const value: JsonObject = { ok: false, code: "llm_evidence_loop.refused_in_a_row", refusal, inARow, instruction: warning(context, inARow, reason) };
  context.accountEvidence(value);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID, value });
  return undefined;
}

/**
 * The run as a finding on loop detection's ladder (`./loop-check.ts`), steered with the model's own loop decision; once
 * refusing has not stopped it, the ladder's top rung (`./ladder-top.ts`). Only a caller that takes the signal and ends
 * the round on it ends it here.
 */
function onTheLadder(context: AutomationStudioLlmEvidenceDecisionHandlerContext, iteration: number, inARow: number, issueCode: string): AutomationStudioLlmEvidenceLoopResult | undefined {
  automationStudioLlmEvidenceLoopCaught(context, iteration, { pattern: "no_progress", repeats: inARow, toolIds: [AUTOMATION_STUDIO_LLM_LOOP_REFUSED_RUN_TOOL_ID], unchanged: ["page", "rows", "acts", "draft"] });
  const signal = context.loops.due();
  const next = signal ? automationStudioLlmEvidenceLadderTop(context, iteration, signal, issueCode) : undefined;
  if (!next || next.kind === "recover") return undefined;
  if (next.kind === "end") return next.result;
  if (context.input.propagateDecisionErrors) throw next.error;
  return failure(context.draftSteps, "llm_evidence_loop.repeat_without_progress", context.trace, context.accounting);
}

/**
 * The warning at the second refusal of one kind in a row: what the model keeps doing, why it is not working, and what to
 * do instead. A loop that authors a candidate is told what a refused submission needs; one that drafts nothing is
 * never sent to a Flow it does not have.
 */
function warning(context: AutomationStudioLlmEvidenceDecisionHandlerContext, inARow: number, reason: string): string {
  const said = `Your last ${inARow} decisions were refused, or changed nothing, for the same reason (${reason}), so another decision of that kind will not get further. One more refused for it is caught as a repeat, and you decide how to go on. `;
  if (context.input.discoveryOnly === true) return `${said}Do not send another decision of that kind: do what next beside the refusal says instead -- correct the lines a refused submission names and submit the whole candidate again -- or read the page below for what the Flow still needs.`;
  if (context.input.draft === false) return `${said}Do not send another decision of that kind: do what next beside the refusal says instead, send the move the refusal names as missing first, or complete with what you can honestly say is done and what is not.`;
  return `${said}Do not send another decision of that kind: do what next beside the refusal says instead, run what the Flow still lacks, or complete if the Flow already does what the person asked.`;
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

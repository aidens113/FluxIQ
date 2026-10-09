// Three decisions in a row refused, or changing nothing, for one reason end the
// round, and the build tests and judges the Flow so far instead of spending its
// purse (week report W2, the user's rule of 2026-10-06; the counting is
// `../evidence-progress/refusal-run.ts`).
//
// What counts, and as which kind:
//   - an amendment decision that changed nothing (`./amendment.ts`): its
//     refusals' reasons, or "keep adds nothing", or an edit that undid itself;
//   - a rerun that changed nothing, or found what its step had found
//     (`./refused-repeat.ts`, `./rerun-result.ts`);
//   - a call that would add a step or change the page and that the page
//     refused, applying nothing, by its result code -- unless the code says to
//     try again later (`../repeat-guard/retry-later.ts`). Looks are left to the
//     searching guard (`./searching.ts`).
// Anything else decided between two of these breaks the run. At the second
// the model is told that one more ends this exploration (in candidate mode,
// that it ends the build with nothing tested); at the third the
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
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW } from "../evidence-progress/index.ts";
import { automationStudioLlmEvidenceLoopFailure as failure, type AutomationStudioLlmEvidenceLoopResult } from "../evidence-loop/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE, automationStudioLlmEvidenceRetriesLater } from "../repeat-guard/index.ts";
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
  const { input, trace, accounting, draftSteps, evidence } = context;
  if (inARow >= AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW) {
    if (input.unusableDecisions) {
      const error = input.unusableDecisions.stalled({ issueCodes: [issueCode], trace: [...trace], accounting: { ...accounting }, steps: draftSteps.map((step) => structuredClone(step)) });
      if (input.propagateDecisionErrors) throw error;
    }
    return failure(draftSteps, "llm_evidence_loop.repeat_without_progress", trace, accounting);
  }
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID);
  if (inARow < AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW - 1) return undefined;
  const { refusal, reason } = reasonWords(kind, evidence);
  const value: JsonObject = {
    ok: false,
    code: "llm_evidence_loop.refused_in_a_row",
    refusal,
    inARow,
    maxInARow: AUTOMATION_STUDIO_LLM_EVIDENCE_MAX_SAME_REFUSALS_IN_A_ROW,
    instruction: input.discoveryOnly === true ? candidateWarning(inARow, reason) : `Your last ${inARow} decisions were refused, or changed nothing, for the same reason (${reason}). One more decision refused for it ends this exploration, and the Flow is then tested and judged as it stands. `
      + "Do not send another decision of that kind: do what next beside the refusal says instead, run what the Flow still lacks, or complete if the Flow already does what the person asked."
  };
  context.accountEvidence(value);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_REFUSAL_RUN_TOOL_ID, value });
  return undefined;
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
 * applied nothing, would have added a step or changed the page, and its code
 * does not say to try again later (header). Answers the loop's ending when the
 * round stops here.
 */
export function automationStudioLlmEvidenceRefusedCallRun(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  call: { refused: boolean; effectApplied: boolean; effect: string; proposes?: boolean | undefined; resultCode?: string | undefined; resultReason?: string | undefined }
): AutomationStudioLlmEvidenceLoopResult | undefined {
  const counts = call.refused && !call.effectApplied && (call.effect === "mutate" || call.proposes === true) && !automationStudioLlmEvidenceRetriesLater(call.resultCode, call.resultReason);
  return counts ? automationStudioLlmEvidenceRefusedOfAKind(context, iteration, `call:${call.resultCode ?? "refused"}`, AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE) : undefined;
}

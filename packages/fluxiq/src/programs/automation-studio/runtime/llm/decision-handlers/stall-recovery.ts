// What a stall runs instead of ending, while the build still has a move that
// may get it further (t477).
//
// **The failure this closes.** Lane C round 10 (`run-mv5uu9g1-9d80deea`) ended
// its candidate build on a run of eight looks at 114 s of a 540 s build, with
// 45 decisions left and revision 3 accepted, tried once, judged `unsure` and
// two retests left. A run of looks (`./searching.ts`) or of refused repeats
// (`./refused-repeat.ts`) stalled the round, and in candidate mode a stall
// ended the build: nothing tested the latest revision, though the search
// note promised the Flow "is then tested and judged". The user's rule is that
// a build never gives up on a recoverable failure.
//
// **The rule.** Where the stall would end the round, the caller is asked first
// (`input.recoverStall`, `../loop-configuration.ts`). A move it names -- for a
// candidate build, the retest of its latest revision
// (`../../flow-bootstrap/candidate/authoring-loop.ts`) -- is run by the loop as
// its own call: the model is shown a note saying why, and the call's answer,
// and the runs of looks and of refused repeats it broke start again
// (`../repeat-guard/outcomes.ts`, `stallRecovered`). The caller bounds it: a
// candidate's retests are its trial gate's. With no move left the stall ends
// as before, and the caller's reason why joins its issue codes, so the ending
// names it. A tool the loop does not offer is never run.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmDecisionContextSupersede } from "../decision-context/supersede.ts";
import type { AutomationStudioLlmEvidenceLoopDecision } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidenceDecisionHandlerContext } from "./types.ts";

/** The entry the note is shown under; a newer one replaces the older. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_STALL_RECOVERY_TOOL_ID = "core.stall_recovery";

/** The code the note carries. */
const RECOVERED_CODE = "llm_evidence_loop.stall_recovered";

/** What the model is told about the call the loop made for it. */
const INSTRUCTION = "Your last decisions were stopping the build without getting it further (stalledOn says how). Instead of ending the build, Core made the call in ran for you, "
  + "because it may still get the build further; its answer is the next entry, under ranAs. Act on that answer, and do not repeat the looks or the refused calls that led here.";

/** What a stall comes to: the call the loop runs instead, or the issue codes it ends under. */
export type AutomationStudioLlmEvidenceStallOutcome =
  | { kind: "recover"; call: Extract<AutomationStudioLlmEvidenceLoopDecision, { kind: "tool_call" }> }
  | { kind: "stall"; issueCodes: string[] };

/**
 * Asks the caller for a move that answers a stall under `issueCodes`. Answers
 * the call to run, after showing the model why, or the issue codes the stall
 * ends under -- the caller's reason why nothing was left among them.
 */
export function automationStudioLlmEvidenceStallRecovery(
  context: AutomationStudioLlmEvidenceDecisionHandlerContext,
  iteration: number,
  issueCodes: readonly string[]
): AutomationStudioLlmEvidenceStallOutcome {
  const { input, evidence, accounting, limits } = context;
  const answer = input.recoverStall?.({ issueCodes: [...issueCodes] });
  if (!answer) return { kind: "stall", issueCodes: [...issueCodes] };
  if ("endedBecause" in answer) return { kind: "stall", issueCodes: [...issueCodes, answer.endedBecause] };
  // Only a tool this loop offers, and only while calls are left to make.
  if (!context.toolIds.has(answer.call.toolId) || accounting.toolCalls >= limits.maxToolCalls) return { kind: "stall", issueCodes: [...issueCodes] };
  const callId = `${AUTOMATION_STUDIO_LLM_EVIDENCE_STALL_RECOVERY_TOOL_ID}.${iteration}.${answer.call.toolId}`;
  const note: JsonObject = { code: RECOVERED_CODE, stalledOn: [...issueCodes], ran: { toolId: answer.call.toolId, input: structuredClone(answer.call.input) }, ranAs: callId, instruction: INSTRUCTION };
  context.accountEvidence(note);
  automationStudioLlmDecisionContextSupersede(evidence, AUTOMATION_STUDIO_LLM_EVIDENCE_STALL_RECOVERY_TOOL_ID);
  evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_STALL_RECOVERY_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_STALL_RECOVERY_TOOL_ID, value: note });
  context.repeats.stallRecovered();
  return { kind: "recover", call: { kind: "tool_call", callId, toolId: answer.call.toolId, input: structuredClone(answer.call.input) } };
}

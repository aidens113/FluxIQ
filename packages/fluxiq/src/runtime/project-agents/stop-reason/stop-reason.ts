// The person's words for why the supervisor stopped before a whole trial
// passed, from the code its loop ended on or the issue code a guard stalled it
// under.
//
// A person must never be shown an internal code (`run-mvcwp3wh-bcea2115`: the
// extension chat read "... (llm evidence loop.unreadable replies)"). Each code
// the loop can end on, and each a guard stalls it under, is said in plain
// words here; a count is said only where the code's own data carries it. A code
// this file does not know gets a generic sentence and never the code itself.
// The code stays where machines read it: the loop's own result and its trace.

import type { AutomationStudioLlmEvidenceLoopFailureCode, AutomationStudioLlmEvidenceLoopResult } from "../../llm/evidence-loop.ts";

type FailedLoop = Extract<AutomationStudioLlmEvidenceLoopResult, { ok: false }>;

const OPENING = "The supervisor stopped before a whole trial passed";
const UNKNOWN = "it could not go on";
const STALLED = "its decisions kept being refused without making any progress";

/** Each code the loop may end on, said as why it stopped; the loop's own data fills in counts below. */
const LOOP_SAID: Record<AutomationStudioLlmEvidenceLoopFailureCode, string> = {
  "llm_evidence_loop.invalid_configuration": "its setup was refused before it could start",
  "llm_evidence_loop.invalid_decision": "the AI model's decision could not be used",
  "llm_evidence_loop.unknown_tool": "the AI model asked for a tool that does not exist",
  "llm_evidence_loop.duplicate_call": "the AI model kept repeating itself",
  "llm_evidence_loop.duplicate_tool_request": "the AI model kept repeating itself",
  "llm_evidence_loop.repeat_without_progress": "the AI model kept repeating itself without making any progress",
  "llm_evidence_loop.tool_failed": "a tool it ran failed",
  "llm_evidence_loop.evidence_limit": "it gathered more than it could keep",
  "llm_evidence_loop.iteration_limit": "the budget for the AI model's decisions ran out",
  "llm_evidence_loop.cancelled": "it was cancelled",
  "llm_evidence_loop.provider_unavailable": "the AI model's provider stopped answering"
};

/** The issue codes a guard stalls the loop under (`../../llm/decision-handlers/`). */
const STALL_SAID: Readonly<Record<string, string>> = {
  "llm_evidence_loop.repeat_refused": "it kept asking again for something that had already been refused",
  "llm_evidence_loop.draft_amendments_refused": "its changes kept being refused",
  "llm_evidence_loop.searching_without_acting": "it kept looking without acting",
  "llm_evidence_loop.no_progress": "it went too long without making any progress",
  "llm_evidence_loop.refused_in_a_row": "its decisions were refused for the same reason several times in a row"
};

/** Why a failed loop stopped, with the counts its own result carries. */
function loopSaid(loop: FailedLoop): string {
  if (loop.code === "llm_evidence_loop.iteration_limit" && loop.exhaustion) {
    // Only a budget runs out (t1056): no count of decisions or tool calls ends a loop. What the money last went on is
    // said where its last replies arrived unreadable.
    const unreadable = loop.unreadable && loop.unreadable.inARow > 0 ? `, its last ${loop.unreadable.inARow === 1 ? "reply" : `${loop.unreadable.inARow} replies`} from the AI model arriving unreadable` : "";
    return `the budget for the AI model's decisions ran out${unreadable}`;
  }
  return (LOOP_SAID as Readonly<Record<string, string | undefined>>)[loop.code] ?? UNKNOWN;
}

/**
 * The person-facing reason the supervisor stopped before a whole trial passed:
 * from its failed loop, else from the issue codes a guard stalled it under,
 * else a generic sentence. Never names a code.
 */
export function automationStudioProjectSupervisorStopReason(stop: { loop?: AutomationStudioLlmEvidenceLoopResult | undefined; stalledOn?: readonly string[] | undefined }): string {
  const { loop, stalledOn } = stop;
  const why = loop && !loop.ok
    ? loopSaid(loop)
    : stalledOn
      ? stalledOn.map((code) => STALL_SAID[code]).find((said) => said !== undefined) ?? STALLED
      : UNKNOWN;
  return `${OPENING}: ${why}.`;
}

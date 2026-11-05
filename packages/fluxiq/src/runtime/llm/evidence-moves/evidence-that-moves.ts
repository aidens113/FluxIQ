// Which evidence entries of a decision change between one call and the next.
//
// The one place that says so. A provider's context cache matches a prefix, so
// everything before the first of these is what the next request sends again
// byte for byte, and everything from it on is read uncached. The window keeps
// them last (`../context-window.ts`, `../decision-context/shown.ts`), the
// Anthropic adapter marks the entry before the first of them
// (`../../models/providers/anthropic/cache-content.ts`), and a new entry of Core's
// that is rewritten, replaced or taken away belongs here.
//
// Written as names rather than imported from their owners, so the adapter takes
// no edge into the loop's handlers; `./tests/evidence-that-moves.test.ts` holds
// the names to their owners.

/** Written afresh for every decision: the page as it now stands, the record, the draft and what is left. */
const REWRITTEN_TOOL_IDS: ReadonlySet<string> = new Set(["core.current_view", "core.current_flow", "core.evidence_history", "core.flow_draft", "core.budget", "core.newly_described_nodes"]);

/**
 * Core's notes on one decision. Each leaves the window when a newer one of its
 * kind arrives or the build moves on (`../decision-context/supersede.ts`), and
 * its call id renumbers, so one that stayed among the results would rewrite
 * everything sent after it.
 */
export const AUTOMATION_STUDIO_LLM_PASSING_NOTE_TOOL_IDS: ReadonlySet<string> = new Set([
  "core.decision_check", "core.no_progress", "core.completion_check", "core.amendment_check", "core.request_check",
  "core.repeat_check", "core.loop_check", "core.search_check", "core.refusal_run", "core.rerun_result", "core.stall_recovery", "core.rerun_check"
]);

/** The list of a build's earlier calls it may run again, offered afresh on one decision under the tool's own id (`../prior-nodes/loop.ts`). */
const OFFERED_CALLS = /^core\.run_nodes\.available\./u;

/** Whether this entry may read differently, or be gone, on the next request. */
export function automationStudioLlmEvidenceEntryMoves(entry: { callId: string; toolId: string }): boolean {
  return REWRITTEN_TOOL_IDS.has(entry.toolId) || AUTOMATION_STUDIO_LLM_PASSING_NOTE_TOOL_IDS.has(entry.toolId) || OFFERED_CALLS.test(entry.callId);
}

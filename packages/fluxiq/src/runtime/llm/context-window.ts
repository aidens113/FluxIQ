// Immutable historical results plus the full current-view and current-Flow tails.
// Declared view members become references on their first appearance; appending
// evidence never rewrites an earlier historical result. Raw evidence stays whole
// for recall and execution. No entry, view member or row is ranked or truncated.
// A declared page channel is the exception for its own member: the page is shown
// in place, whole once and as changes after, and a page's earlier copies become
// references when it is shown whole again (`./view-channel/projection.ts`, D7).
import type { JsonObject, JsonValue } from "../../core/index.ts";
import { automationStudioLlmEvidenceCurrentView } from "./decision-context/index.ts";
import { AUTOMATION_STUDIO_LLM_PASSING_NOTE_TOOL_IDS } from "./evidence-moves/index.ts";
import { automationStudioLlmPageChannelProjection, type AutomationStudioLlmPageChannel } from "./view-channel/index.ts";

/** One evidence entry as a decision is shown it, and as the loop holds it. */
export type AutomationStudioLlmEvidenceEntry = { callId: string; toolId: string; value: JsonValue };

/** Legacy public key, retained for consumers of older projections; no longer emitted. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_SUPERSEDED_KEY = "supersededBy";

/**
 * Keep every historical result in call order, projecting declared view members
 * immediately into immutable references to their own original call and group.
 * Append one full current-view tail, then the existing current-Flow tail.
 * Undeclared data is kept whole and in its original property order; without
 * declared view keys no client view is invented. The input is never mutated.
 *
 * Core's passing notes (`./evidence-moves/evidence-that-moves.ts`) come after every
 * result rather than where they arose. A newer note or a later call takes one out,
 * and its call id renumbers, so one left among the results rewrote everything sent
 * after it: nine of the 51 decisions of `run-mw37vz9n-a77a02c2` re-sent up to 11K
 * characters that way. Each note names what it answers, so it reads the same.
 */
export function automationStudioLlmEvidenceContextWindow(
  records: readonly AutomationStudioLlmEvidenceEntry[],
  observedStateKeys: readonly string[] = [],
  pageChannel?: AutomationStudioLlmPageChannel
): AutomationStudioLlmEvidenceEntry[] {
  // With a page channel each result's page is shown in place as its delivery (D3): whole once, changes after.
  // Its member then takes no view reference and no current-view tail; every other view key keeps both.
  const paged = pageChannel ? automationStudioLlmPageChannelProjection(records, pageChannel) : records;
  const keys = pageChannel ? observedStateKeys.filter((key) => key !== pageChannel.member) : observedStateKeys;
  const { history, currentView } = automationStudioLlmEvidenceCurrentView(paged, keys);
  const current = currentFlow(records);
  const passing = (entry: AutomationStudioLlmEvidenceEntry): boolean => AUTOMATION_STUDIO_LLM_PASSING_NOTE_TOOL_IDS.has(entry.toolId);
  return [...history.filter((entry) => !passing(entry)), ...history.filter(passing), ...(currentView ? [currentView] : []), ...(current ? [current] : [])];
}

/** The tool whose results carry a candidate's Flow script (`flow-bootstrap/candidate/authoring-loop.ts`). */
const SUBMIT_CANDIDATE_TOOL_ID = "core.submit_candidate";

/** The entry that alone names the current Flow (header, t503): Core's own, last in the window. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_CURRENT_FLOW_TOOL_ID = "core.current_flow";

/**
 * The one entry naming the current Flow (header, t503): the newest accepted
 * submission that carries its whole script or plan, by revision, digest and
 * call. Nothing when none was accepted.
 */
function currentFlow(window: readonly AutomationStudioLlmEvidenceEntry[]): AutomationStudioLlmEvidenceEntry | undefined {
  for (let index = window.length - 1; index >= 0; index -= 1) {
    const { callId, toolId, value } = window[index]!;
    if (toolId !== SUBMIT_CANDIDATE_TOOL_ID || !isJsonObject(value) || value.ok !== true) continue;
    if (typeof value.revision !== "number" || typeof value.digest !== "string") continue;
    const whole = value.script !== undefined ? "script" : value.plan !== undefined ? "plan" : undefined;
    if (whole === undefined) continue;
    return {
      callId: AUTOMATION_STUDIO_LLM_EVIDENCE_CURRENT_FLOW_TOOL_ID,
      toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_CURRENT_FLOW_TOOL_ID,
      value: { revision: value.revision, digest: value.digest, call: callId, instruction: currentFlowInstruction(value.revision, value.digest, callId, whole) }
    };
  }
  return undefined;
}

/** What the current-Flow entry says, in Core's words: the only place any script is called current. */
function currentFlowInstruction(revision: number, digest: string, call: string, whole: "script" | "plan"): string {
  return `Revision ${revision} (digest ${digest}) is your current Flow: its whole ${whole} is under ${whole} in the core.submit_candidate result of call ${call}. `
    + `Make every change to the Flow by editing that ${whole} and submitting it whole; never write it again from memory. `
    + "Every other script or plan in the evidence is an earlier revision or a refused submission, kept as a record of what was tried: never start from one of them, and make a refused submission's intended changes again on this one.";
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

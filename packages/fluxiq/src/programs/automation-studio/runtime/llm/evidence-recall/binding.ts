// The loop's tools with `core.recall_result` beside them, and its calls with
// every result remembered so a recall can answer from it.
//
// **Why it exists (t194 w48).** Live run 13 (`run-muqbzu32-8691a65e`) read the
// same list three times, and its last request carried all three reads whole:
// 164,577 of its 290,929 characters. The window now shows only the newest
// read's rows whole and replaces each earlier read's with `supersededBy`
// (`../context-window.ts`); this is how the model still gets an earlier read's
// rows when it wants them. Core keeps every result whole already -- the window
// only chooses what a decision is shown -- so the rows are answered from the
// results this binding saw come back, never by running anything again.
//
// **Offered only where it can answer.** Without a held view key
// (`holder.member`, `../decision-context/view-groups.ts`) the window replaces
// nothing a recall would give back, so the loop is returned as it was given:
// a domain that declares only its page sees no new tool.
//
// It observes nothing and changes nothing, so it is never a step of the Flow,
// and it refuses nothing: an id no result carried is answered as not found.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceViewGroups } from "../decision-context/index.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop/index.ts";
import { automationStudioLlmEvidenceRestored } from "./restored.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID } from "./tool-id.ts";
import { automationStudioLlmEvidenceRecallTool } from "./tool.ts";

type RecallLoop = {
  tools: AutomationStudioLlmEvidenceTool[];
  observedStateKeys?: readonly string[] | undefined;
  executeTool(input: { callId: string; toolId: string; value: JsonObject }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
};

/**
 * `loop` with the recall offered after its own tools and answered before any
 * of them is called; `loop` itself when it declares no held view or offers no
 * tool, or already offers one under that id.
 */
export function automationStudioLlmEvidenceRecallBinding<L extends RecallLoop>(loop: L): L {
  const groups = automationStudioLlmEvidenceViewGroups(loop.observedStateKeys ?? []);
  if (!loop.tools.length || !groups.some((group) => group.holder !== undefined)) return loop;
  if (loop.tools.some((tool) => tool.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID)) return loop;
  const results = new Map<string, JsonValue>();
  const executeTool = loop.executeTool.bind(loop);
  return {
    ...loop,
    tools: [...loop.tools, automationStudioLlmEvidenceRecallTool()],
    async executeTool(input: Parameters<L["executeTool"]>[0]) {
      if (input.toolId === AUTOMATION_STUDIO_LLM_EVIDENCE_RECALL_TOOL_ID) return recalled(results, groups, input.value);
      const result = await executeTool(input);
      results.set(input.callId, evidenceOf(result));
      return result;
    }
  };
}

function recalled(results: ReadonlyMap<string, JsonValue>, groups: ReturnType<typeof automationStudioLlmEvidenceViewGroups>, input: JsonObject): AutomationStudioLlmEvidenceToolExecutionResult {
  const callId = typeof input.callId === "string" ? input.callId : "";
  const value = results.get(callId);
  if (value === undefined) {
    return { kind: "llm_evidence_tool_execution", evidence: { recalled: callId, found: false }, effectApplied: false, resultCode: "core.recall.not_found" };
  }
  return { kind: "llm_evidence_tool_execution", evidence: { recalled: callId, restored: automationStudioLlmEvidenceRestored(value, groups) }, effectApplied: false, resultCode: "core.recall.restored" };
}

/** What the loop keeps of a result: its evidence when it is an execution result, else the value itself. */
function evidenceOf(result: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult): JsonValue {
  if (typeof result === "object" && result !== null && !Array.isArray(result) && (result as { kind?: unknown }).kind === "llm_evidence_tool_execution") {
    return (result as AutomationStudioLlmEvidenceToolExecutionResult).evidence;
  }
  return result as JsonValue;
}

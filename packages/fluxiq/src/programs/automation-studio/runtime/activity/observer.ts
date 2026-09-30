// The evidence loop's three seams, observed from outside the loop.
//
// `llm/evidence-loop.ts` is at its line budget and is not touched: its callers
// hand it their input through this wrapper instead, which says what the loop is
// about to do at each seam and passes every call, result and error through
// unchanged. What it says is Core's own sentences and tool ids -- never the
// decision the model returned, never the evidence a tool gathered.

import type { JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../llm/index.ts";
import { emitAutomationStudioActivity } from "./emit.ts";

type ToolCall = Parameters<AutomationStudioLlmEvidenceLoopInput["executeTool"]>[0];

function resultCodeOf(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const record = result as { kind?: unknown; resultCode?: unknown };
  return record.kind === "llm_evidence_tool_execution" && typeof record.resultCode === "string" && record.resultCode ? record.resultCode : undefined;
}

function toolActivity(call: ToolCall, status: "started" | "succeeded" | "failed", resultCode?: string): void {
  const drafting = call.toolId === AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID;
  const title = drafting ? "Amending the draft Flow" : `Using ${call.toolId}`;
  emitAutomationStudioActivity({
    phase: drafting ? "building" : "exploring",
    label: status === "started" ? title : `${title}: ${status === "failed" ? "failed" : resultCode ?? "done"}`,
    detail: { kind: "tool", title, status, ref: call.toolId, ...(resultCode ? { text: `Result: ${resultCode}` } : {}) }
  });
}

/**
 * The loop input with `decide`, `executeTool` and `checkCompletion` observed:
 * `thinking` as a decision is asked for, `building` for the draft tool,
 * `exploring` for every other tool (its id as `detail.ref`, its result code
 * when it ends), and `verifying` as a completed result is checked. Every
 * other field is passed through, and each wrapped call returns or throws
 * exactly what the original did.
 */
export function observeAutomationStudioEvidenceLoop(input: AutomationStudioLlmEvidenceLoopInput): AutomationStudioLlmEvidenceLoopInput {
  const { decide, executeTool, checkCompletion } = input;
  return {
    ...input,
    decide: async (request) => {
      emitAutomationStudioActivity({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } });
      return await decide.call(input, request);
    },
    executeTool: async (call): Promise<JsonValue | Awaited<ReturnType<AutomationStudioLlmEvidenceLoopInput["executeTool"]>>> => {
      toolActivity(call, "started");
      try {
        const result = await executeTool.call(input, call);
        toolActivity(call, "succeeded", resultCodeOf(result));
        return result;
      } catch (error) {
        toolActivity(call, "failed");
        throw error;
      }
    },
    ...(checkCompletion ? {
      checkCompletion: async (result, context) => {
        emitAutomationStudioActivity({ phase: "verifying", label: "Checking the proposed result", detail: { kind: "check", title: "Completion check", status: "started" } });
        const check = await checkCompletion.call(input, result, context);
        emitAutomationStudioActivity({ phase: "verifying", label: check.ok ? "The proposed result passed its check" : "The proposed result was refused", detail: { kind: "check", title: "Completion check", status: check.ok ? "succeeded" : "failed", ...(check.ok ? {} : { text: check.issueCodes.join(", ") }) } });
        return check;
      }
    } satisfies Pick<AutomationStudioLlmEvidenceLoopInput, "checkCompletion"> : {})
  };
}

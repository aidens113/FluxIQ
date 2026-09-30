// The evidence loop's three seams, observed from outside the loop.
//
// `llm/evidence-loop.ts` is at its line budget and is not touched: its callers
// hand it their input through this wrapper instead, which says what the loop is
// about to do at each seam and passes every call, result and error through
// unchanged. What it says is Core's own sentences, and what a tool call's own
// input names (`./wording/tool-call.ts`): the node's verb and an element name the step
// already carries -- never the decision the model returned, never the evidence
// a tool gathered. Ids and result codes go to `detail.ref` and `detail.text`.

import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../llm/index.ts";
import { emitAutomationStudioActivity } from "./emit.ts";
import { automationStudioActivityToolCall } from "./wording/index.ts";

type ToolCall = Parameters<AutomationStudioLlmEvidenceLoopInput["executeTool"]>[0];

function resultCodeOf(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const record = result as { kind?: unknown; resultCode?: unknown };
  return record.kind === "llm_evidence_tool_execution" && typeof record.resultCode === "string" && record.resultCode ? record.resultCode : undefined;
}

/** How a call ended, in a person's words; the code itself goes to the raw record. */
function outcomeOf(status: "succeeded" | "failed", resultCode: string | undefined, dryRun: boolean): string {
  if (status === "failed") return "didn't work";
  if (!resultCode) return "done";
  if (dryRun && resultCode.startsWith("core.replay.")) return resultCode === "core.replay.replayed" ? "done" : "didn't work the same way again";
  return /reject|fail|error|timeout|timed_out|refused|denied|invalid|blocked|not_found|unobserved/u.test(resultCode) ? "didn't work" : "done";
}

function toolActivity(call: ToolCall, status: "started" | "succeeded" | "failed", resultCode?: string): void {
  const words = automationStudioActivityToolCall(call);
  const record = [resultCode ? `Result: ${resultCode}` : "", words.node ? `Node: ${words.node}` : ""].filter(Boolean).join(" · ");
  emitAutomationStudioActivity({
    phase: words.phase,
    label: status === "started" ? words.label : `${words.label} — ${outcomeOf(status, resultCode, words.dryRun)}`,
    detail: { kind: words.kind, title: words.title, status, ref: call.toolId, ...(record ? { text: record } : {}) }
  });
}

/**
 * The loop input with `decide`, `executeTool` and `checkCompletion` observed:
 * `thinking` as a decision is asked for, `building` for the draft tool,
 * `verifying` for a dry run's calls, `exploring` for every other tool (its
 * action as `detail.title`, its id as `detail.ref`, its result code in
 * `detail.text` when it ends; Core's bookkeeping calls as `note` rows), and
 * `verifying` as a completed result is checked. A check that passes says only
 * that: the dry run that follows it can still refuse the result. Every
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
        emitAutomationStudioActivity({ phase: "verifying", label: "Checking the proposed Flow", detail: { kind: "check", title: "Completion check", status: "started" } });
        const check = await checkCompletion.call(input, result, context);
        emitAutomationStudioActivity({ phase: "verifying", label: check.ok ? "The proposed Flow’s plan checks out; it still has to run cleanly" : "The proposed Flow was sent back to be fixed", detail: { kind: "check", title: "Completion check", status: check.ok ? "succeeded" : "failed", ...(check.ok ? {} : { text: check.issueCodes.join(", ") }) } });
        return check;
      }
    } satisfies Pick<AutomationStudioLlmEvidenceLoopInput, "checkCompletion"> : {})
  };
}

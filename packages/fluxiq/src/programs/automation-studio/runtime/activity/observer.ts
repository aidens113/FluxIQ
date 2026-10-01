// The evidence loop's three seams, observed from outside the loop.
//
// `llm/evidence-loop.ts` is at its line budget and is not touched: its callers
// hand it their input through this wrapper instead, which says what the loop is
// about to do at each seam and passes every call, result and error through
// unchanged.
//
// What it shows: Core's own sentences; what a tool call's own input names
// (`./wording/tool-call.ts`), the node's verb and an element name the step
// already carries; and, once per decision, the model's own stated reason for
// it -- the `summary` every decision must carry, kept beside the decision by
// the caller (`./decision-reason.ts`) and shown whitespace-collapsed, with
// token-shaped runs hidden, within 240 characters (`./wording/reason-text.ts`).
// What it never shows: the decision's input values, the draft's amendments,
// the evidence a tool gathered, or an issue code in a sentence. Ids and result
// codes go to `detail.ref` and `detail.text` of the tool rows only.

import type { JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../llm/index.ts";
import { emitAutomationStudioActivityWaitedOut } from "./ask/index.ts";
import { automationStudioActivityDecisionReason } from "./decision-reason.ts";
import { emitAutomationStudioActivity } from "./emit.ts";
import { emitAutomationStudioActivityThought } from "./thought.ts";
import { automationStudioActivityCompletionRefusal, automationStudioActivityDecision, automationStudioActivityToolCall } from "./wording/index.ts";

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
 * `thinking` as a decision is asked for; when it returns, one `thought` row
 * naming what the model chose to do (`exploring` for a tool call, `building`
 * for a draft edit, `verifying` for a completion) with its stated reason as
 * `detail.text`, and nothing when it gave none; `building` for the draft tool,
 * `verifying` for a dry run's calls, `exploring` for every other tool (its
 * action as `detail.title`, its id as `detail.ref`, its result code in
 * `detail.text` when it ends; Core's bookkeeping calls as `note` rows), and
 * `verifying` as a completed result is checked, a refusal said in words
 * rather than issue codes. A call whose result says a robot check stood on
 * the page and cleared by itself (`clearedWait`) is told as a wait on the
 * person that was waited out, before the call's own end (`./ask/waited-out.ts`).
 * A check that passes says only
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
      const decision = await decide.call(input, request);
      const chose = automationStudioActivityDecision(decision);
      if (chose) emitAutomationStudioActivityThought({ phase: chose.phase, title: chose.title, text: automationStudioActivityDecisionReason.of(decision) });
      return decision;
    },
    executeTool: async (call): Promise<JsonValue | Awaited<ReturnType<AutomationStudioLlmEvidenceLoopInput["executeTool"]>>> => {
      toolActivity(call, "started");
      try {
        const result = await executeTool.call(input, call);
        emitAutomationStudioActivityWaitedOut(call.callId, result, automationStudioActivityToolCall(call).phase);
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
        emitAutomationStudioActivity({ phase: "verifying", label: check.ok ? "The proposed Flow’s plan checks out; it still has to run cleanly" : "The proposed Flow was sent back to be fixed", detail: { kind: "check", title: "Completion check", status: check.ok ? "succeeded" : "failed", ...(check.ok ? {} : { text: automationStudioActivityCompletionRefusal(check) }) } });
        return check;
      }
    } satisfies Pick<AutomationStudioLlmEvidenceLoopInput, "checkCompletion"> : {})
  };
}

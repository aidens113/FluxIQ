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

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { activityActionReplayFailing } from "../../../../ui/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../llm/index.ts";
import { emitAutomationStudioActivityWaitedOut } from "./ask/index.ts";
import { automationStudioActivityDecisionReason } from "./decision-reason.ts";
import { automationStudioActivityDraftEdit } from "./draft-edit.ts";
import { emitAutomationStudioActivity } from "./emit.ts";
import { emitAutomationStudioActivityThought } from "./thought.ts";
import { automationStudioActivityCompletionRefusal, automationStudioActivityDecision, automationStudioActivityToolCall, type AutomationStudioActivityCallWords } from "./wording/index.ts";

type ToolCall = Parameters<AutomationStudioLlmEvidenceLoopInput["executeTool"]>[0];

/** A code a raw record may carry: no space, so never a sentence or a page's words. */
const CODE_SHAPED = /^[A-Za-z0-9_.:-]{1,100}$/u;

/** A call's result code and the caller's reason for it, as the raw record carries them. */
function resultOf(result: unknown): { code: string | undefined; reason: string | undefined } {
  if (!result || typeof result !== "object" || Array.isArray(result)) return { code: undefined, reason: undefined };
  const record = result as { kind?: unknown; resultCode?: unknown; resultReason?: unknown };
  if (record.kind !== "llm_evidence_tool_execution") return { code: undefined, reason: undefined };
  const code = typeof record.resultCode === "string" && record.resultCode ? record.resultCode : undefined;
  const reason = code && typeof record.resultReason === "string" && CODE_SHAPED.test(record.resultReason) ? record.resultReason : undefined;
  return { code, reason };
}

/** How a call ended, in a person's words; the code itself goes to the raw record. */
function outcomeOf(status: "succeeded" | "failed", resultCode: string | undefined, dryRun: boolean): string {
  if (status === "failed") return "didn't work";
  if (!resultCode) return "done";
  // A step the site remembered, or whose effect was already there, held:
  // `remembered` read "didn't work the same way again" (t193).
  if (dryRun && resultCode.startsWith("core.replay.")) return activityActionReplayFailing(resultCode) ? "didn't work the same way again" : "done";
  return /reject|fail|error|timeout|timed_out|refused|denied|invalid|blocked|not_found|unobserved/u.test(resultCode) ? "didn't work" : "done";
}

/**
 * The domain's words for a call, or nothing: only strings are kept, so an
 * answer of another shape costs the chat its detail and nothing else.
 */
function describeSafely(describe: AutomationStudioLlmEvidenceLoopInput["describeCall"], call: { toolId: string; value?: unknown }): AutomationStudioActivityCallWords | undefined {
  if (!describe || !call.value || typeof call.value !== "object" || Array.isArray(call.value)) return undefined;
  const words = describe({ toolId: call.toolId, value: call.value as JsonObject });
  return words && typeof words === "object" ? { ...(typeof words.target === "string" ? { target: words.target } : {}), ...(typeof words.text === "string" ? { text: words.text } : {}) } : undefined;
}

/**
 * A decision that never came closes its own row, so the chat is not left
 * "Thinking about the next step". A model provider that gave no answer at all
 * is said in words, and that it is being asked again: during an outage every
 * request of live run `run-muq05kas-058193f0` waited out its deadline while the
 * chat said only that it was thinking.
 */
function decisionFailed(error: unknown): void {
  // Read by shape (`AutomationStudioLlmUnusableDecisionError.providerUnanswered`):
  // a value import of the llm barrel from here closes an import cycle.
  const unanswered = (error as { providerUnanswered?: unknown } | null)?.providerUnanswered === true;
  const title = "Deciding the next step";
  emitAutomationStudioActivity(unanswered
    ? { phase: "thinking", label: "The AI model provider did not answer", detail: { kind: "thought", title, status: "failed", text: "The AI model provider did not answer this request. Asking it again; the build stops if it keeps not answering." } }
    : { phase: "thinking", label: `${title} — didn't work`, detail: { kind: "thought", title, status: "failed" } });
}

/**
 * One row of a tool call. Its raw record (`detail.text`) is "Result: <code> ·
 * Reason: <reason> · Node: <node>", each part when there is one: the reason is
 * the caller's own code for why the call came to its result
 * (`resultReason`), carried so a card can say a refusal in its own words --
 * a press refused for naming no control from the page read "it wasn't on the
 * page" from its code alone (t193, `run-muqiojz4-04a7a8fc`, `S/0090`). Only a
 * code-shaped reason is carried. `described` is the domain's words for it, asked once
 * before the call runs and kept for its end: asked again after a click, a
 * handle on the page the click left was no longer there, so the row that ended
 * a press of "No thanks" read "Clicking on the page" and its card "Click · the
 * page" (t193, `run-muqiojz4-04a7a8fc`).
 */
function toolActivity(call: ToolCall, status: "started" | "succeeded" | "failed", result: { code: string | undefined; reason?: string | undefined }, described: AutomationStudioActivityCallWords | undefined): void {
  const words = automationStudioActivityToolCall(call, described);
  const resultCode = result.code;
  const record = [resultCode ? `Result: ${resultCode}` : "", result.reason ? `Reason: ${result.reason}` : "", words.node ? `Node: ${words.node}` : ""].filter(Boolean).join(" · ");
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
 * `detail.text`, and nothing when it gave none -- a draft edit's said only
 * once the loop has answered it, as one that changed nothing when Core
 * refused it (`./draft-edit.ts`); `building` for the draft tool,
 * `verifying` for a dry run's calls, `exploring` for every other tool (its
 * action as `detail.title`, its id as `detail.ref`, its result code and the
 * caller's reason for it in `detail.text` when it ends; Core's bookkeeping calls as `note` rows), and
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
  const { decide, executeTool, checkCompletion, unusableDecisions } = input;
  // An edit to the draft is said once the loop has answered it (`./draft-edit.ts`).
  const edit = automationStudioActivityDraftEdit();
  return {
    ...input,
    decide: async (request) => {
      edit.decided(request.evidence);
      emitAutomationStudioActivity({ phase: "thinking", label: "Deciding the next step", detail: { kind: "thought", title: "Deciding the next step", status: "started" } });
      let decision: unknown;
      try {
        decision = await decide.call(input, request);
      } catch (error) {
        decisionFailed(error);
        throw error;
      }
      const chose = automationStudioActivityDecision(decision, input.describeCall && ((call) => describeSafely(input.describeCall, call)));
      const reason = automationStudioActivityDecisionReason.of(decision);
      if (chose && (decision as { kind?: unknown }).kind === "amend_draft") edit.hold({ iteration: request.iteration, phase: "building", title: chose.title, text: reason });
      else if (chose) emitAutomationStudioActivityThought({ phase: chose.phase, title: chose.title, text: reason });
      return decision;
    },
    executeTool: async (call): Promise<JsonValue | Awaited<ReturnType<AutomationStudioLlmEvidenceLoopInput["executeTool"]>>> => {
      edit.ran();
      const described = describeSafely(input.describeCall, call);
      toolActivity(call, "started", { code: undefined }, described);
      try {
        const result = await executeTool.call(input, call);
        emitAutomationStudioActivityWaitedOut(call.callId, result, automationStudioActivityToolCall(call).phase);
        toolActivity(call, "succeeded", resultOf(result), described);
        return result;
      } catch (error) {
        toolActivity(call, "failed", { code: undefined }, described);
        throw error;
      }
    },
    ...(unusableDecisions ? {
      unusableDecisions: { ...unusableDecisions, stalled: (stall) => { edit.stalled(stall); return unusableDecisions.stalled(stall); } }
    } satisfies Pick<AutomationStudioLlmEvidenceLoopInput, "unusableDecisions"> : {}),
    ...(checkCompletion ? {
      checkCompletion: async (result, context) => {
        // A note, not a check row: it reads the plan and runs nothing, and a
        // check row was a "Test run · Passed" card before any step was tested
        // (D4). With no words it is the live line only; refused, a message.
        emitAutomationStudioActivity({ phase: "verifying", label: "Checking the proposed Flow", detail: { kind: "note", title: "Completion check", status: "started" } });
        const check = await checkCompletion.call(input, result, context);
        emitAutomationStudioActivity({ phase: "verifying", label: check.ok ? "The proposed Flow’s plan checks out; it still has to run cleanly" : "The proposed Flow was sent back to be fixed", detail: { kind: "note", title: "Completion check", status: check.ok ? "succeeded" : "failed", ...(check.ok ? {} : { text: automationStudioActivityCompletionRefusal(check) }) } });
        return check;
      }
    } satisfies Pick<AutomationStudioLlmEvidenceLoopInput, "checkCompletion"> : {})
  };
}

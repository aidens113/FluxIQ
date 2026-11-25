// A provider's tool call read back into the evidence-decision wrapper the loop has always read (D12, t1038):
// `{ kind: "evidence_tool_decision", summary, decision: { kind, toolId?, ... } }`.
//
// The tool is found by its exact name in the offer that named it (`./decision-tools.ts`); the decision's `kind` and
// `toolId` are that tool's, and the name is the authority on them: a `kind` or `toolId` the model also wrote into the
// input is not read. Everything else of the input is the decision, moved as it came, so the reply then goes through
// exactly the reading and the checks a JSON-text decision does (`../../anthropic/task-answer.ts`, `../../decision-reading/`,
// the harness). A name the offer does not hold is said to be one, never guessed at.

import { isRecord } from "../../provider-transport/index.ts";
import type { AutomationStudioLlmDecisionFromToolCallResult, AutomationStudioLlmDecisionToolCall, AutomationStudioLlmDecisionTools } from "./types.ts";

/** The wrapper `call` stands for (header), or why it stands for none. */
export function automationStudioLlmDecisionFromToolCall(offer: AutomationStudioLlmDecisionTools, call: AutomationStudioLlmDecisionToolCall): AutomationStudioLlmDecisionFromToolCallResult {
  const tool = offer.tools.find((candidate) => candidate.name === call.name);
  if (!tool) return { ok: false, reason: "unknown_tool" };
  if (!isRecord(call.input)) return { ok: false, reason: "input_not_object" };
  const decision: Record<string, unknown> = { kind: tool.variant.kind };
  if (tool.variant.toolId !== undefined) decision.toolId = tool.variant.toolId;
  for (const [key, value] of Object.entries(call.input)) if (key !== "summary" && key !== "kind" && key !== "toolId") decision[key] = value;
  return { ok: true, response: { kind: offer.wrapperKind, ...(call.input.summary !== undefined ? { summary: call.input.summary } : {}), decision } };
}

import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { buildAutomationStudioLlmEvidenceLoopDecisionSchema } from "../../evidence-loop-decision.ts";
import { automationStudioAnthropicRequest } from "../request.ts";
import { automationStudioLlmRequestDecisionTools } from "../../provider-task/index.ts";

export const DIAGNOSIS = { kind: "diagnosis", summary: "The requested state is reachable.", confidence: 0.8 };
export const USAGE = { input_tokens: 100, output_tokens: 30, cache_read_input_tokens: 50, cache_creation_input_tokens: 20, cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 0 } };

export function request(overrides: Partial<AutomationStudioLlmTaskRequest> = {}): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one", idempotencyKey: "idempotency.one", timeoutMs: 20_000, estimatedInputTokens: 100,
    taskKind: "runtime_diagnosis", promptVersion: "automation-studio.runtime-diagnosis.v1", expectedOutput: "diagnosis",
    tokenLimits: { maxInputTokens: 992_000, maxOutputTokens: 8_000, maxTotalTokens: 1_000_000 }, maxEstimatedCostUsd: 0.25,
    context: { schemaVersion: "0.1", taskKind: "runtime_diagnosis", promptVersion: "automation-studio.runtime-diagnosis.v1", projectId: "project.one", flowId: "flow.one", instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 } },
    ...overrides
  };
}

export function decisionRequest(): AutomationStudioLlmTaskRequest {
  const tools = [{ toolId: "core.inspect_values", description: "Inspect the requested named values.", effect: "observe" as const, inputSchema: { type: "object", additionalProperties: { type: "object" } } }];
  const completionSchema = { type: "object", properties: { done: { type: "boolean" } }, required: ["done"], additionalProperties: false };
  const base = request({ taskKind: "evidence_tool_decision", promptVersion: "automation-studio.evidence-tool-decision.v1", expectedOutput: "evidence_tool_decision" });
  return { ...base, context: { ...base.context, taskKind: "evidence_tool_decision", promptVersion: base.promptVersion, evidenceLoop: { iteration: 1, tools, evidence: [], canComplete: false, completionSchema, decisionSchema: buildAutomationStudioLlmEvidenceLoopDecisionSchema(tools, completionSchema, false) } } };
}

// The model the replies below claim to come from: the provider's unnamed default, Haiku (t1012). A file that pins another model on purpose names it here too.
export let fixtureModel: "claude-haiku-5-5" | "claude-sonnet-5-5" = "claude-haiku-5-5";
export function useFixtureModel(model: typeof fixtureModel): void { fixtureModel = model; }

export function textFor(value: unknown, task = request()): string {
  return JSON.stringify(automationStudioAnthropicRequest(task, fixtureModel).format.jsonText ? { result_json: JSON.stringify(value) } : value);
}

export function envelope(text = textFor(DIAGNOSIS), overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "msg_test", type: "message", role: "assistant", model: fixtureModel, content: [{ type: "text", text }], stop_reason: "end_turn", usage: USAGE, ...overrides };
}

export function jsonReply(value = envelope(), status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

/** Native SSE, split across UTF-8 byte boundaries and CRLF event separators. */
export function streamReply(text = textFor(DIAGNOSIS), stop = "end_turn", usage = USAGE, terminate = true): Response {
  const events = [
    { type: "message_start", message: envelope("", { content: [], stop_reason: null, usage: { ...usage, output_tokens: 0 } }) },
    { type: "ping" },
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "private reasoning" } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(0, 9) } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(9) } },
    { type: "content_block_stop", index: 1 },
    { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: usage.output_tokens } },
    ...(terminate ? [{ type: "message_stop" }] : [])
  ];
  return sse(events);
}

/** The tool call a decision wrapper would be when the request sends it as tools (D12): the variant's tool, the rest as its input. */
export function decisionCall(value: { summary?: unknown; decision: Record<string, unknown> }, task = decisionRequest()): { name: string; input: Record<string, unknown> } {
  const offer = automationStudioLlmRequestDecisionTools(task)!;
  const { kind, toolId, ...rest } = value.decision;
  const tool = offer.tools.find((candidate) => candidate.variant.kind === kind && candidate.variant.toolId === toolId);
  return { name: tool?.name ?? String(toolId ?? kind), input: { ...(value.summary !== undefined ? { summary: value.summary } : {}), ...rest } };
}

/** A streamed reply that makes these tool calls (D12), each input arriving in pieces, after any text `said`. */
export function toolUseStreamReply(calls: ReadonlyArray<{ name: string; input: unknown }>, stop = "tool_use", usage = USAGE, said = ""): Response {
  const text = said ? [
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: said } },
    { type: "content_block_stop", index: 0 }
  ] : [];
  const first = text.length ? 1 : 0;
  const blocks = calls.flatMap((call, at) => {
    const json = JSON.stringify(call.input);
    const index = first + at;
    return [
      { type: "content_block_start", index, content_block: { type: "tool_use", id: `toolu_${at}`, name: call.name, input: {} } },
      { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: json.slice(0, 7) } },
      { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: json.slice(7) } },
      { type: "content_block_stop", index }
    ];
  });
  return sse([
    { type: "message_start", message: envelope("", { content: [], stop_reason: null, usage: { ...usage, output_tokens: 0 } }) },
    ...text,
    ...blocks,
    { type: "message_delta", delta: { stop_reason: stop }, usage: { output_tokens: usage.output_tokens } },
    { type: "message_stop" }
  ]);
}

function sse(events: readonly Record<string, unknown>[]): Response {
  const bytes = new TextEncoder().encode(events.map((event) => `event: ${String(event.type)}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`).join(""));
  let offset = 0;
  return new Response(new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset === bytes.length) {
      controller.close();
      return;
    }
    controller.enqueue(bytes.slice(offset, offset + 37));
    offset = Math.min(bytes.length, offset + 37);
  } }), { headers: { "content-type": "text/event-stream" } });
}

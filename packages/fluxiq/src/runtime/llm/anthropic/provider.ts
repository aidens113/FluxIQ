import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest, AutomationStudioLlmStructuredResponse, AutomationStudioLlmUsageSummary } from "../harness/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmOpaqueSecretResolver } from "../provider-contract.ts";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES, AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES } from "../provider-transport/index.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL, AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS, automationStudioAnthropicModelRefusal, isAutomationStudioAnthropicModel, type AutomationStudioAnthropicModel } from "../models/index.ts";
import { validateAutomationStudioLlmTaskRequest } from "../provider-task/index.ts";
import type { AutomationStudioLlmSecretReference } from "../deepseek/index.ts";
import { automationStudioAnthropicMessage, automationStudioAnthropicPaidFailure } from "./messages.ts";
import { automationStudioAnthropicRequest, type AutomationStudioAnthropicPreparedRequest } from "./request.ts";
import { automationStudioAnthropicDeciderPrefix, automationStudioAnthropicJudgeContinuation, automationStudioAnthropicReadReply, type AutomationStudioAnthropicDeciderPrefix, type AutomationStudioAnthropicToolCall } from "../../models/providers/anthropic/index.ts";
import { automationStudioLlmDecisionFromToolCall, automationStudioLlmTaskMessages, type AutomationStudioLlmDecisionTools } from "../provider-task/index.ts";
import { automationStudioLlmAttemptKey } from "../role-routing/index.ts";
import { estimateAutomationStudioAnthropicCostUsd } from "./pricing.ts";
import { estimateAutomationStudioLlmTokensFromUtf8Bytes } from "../../models/limits/index.ts";
import { automationStudioAnthropicTaskAnswer } from "./task-answer.ts";

export type AutomationStudioAnthropicProviderOptions = {
  secretReference: AutomationStudioLlmSecretReference;
  resolveSecret: AutomationStudioLlmOpaqueSecretResolver;
  fetchImpl?: typeof fetch;
  model?: string;
  maxResponseBytes?: number;
  /**
   * Whether an evidence decision goes as one native tool call (D12, t1038; the default) or in the JSON-text transport
   * it used before (`false`). Every other task is unaffected.
   */
  decisionTools?: boolean;
};

export function createAutomationStudioAnthropicProvider(options: AutomationStudioAnthropicProviderOptions): AutomationStudioLlmProvider {
  const reference = options.secretReference?.id?.trim();
  if (options.secretReference?.kind !== "secret_reference" || !/^secret:[a-z0-9_.:-]{1,180}$/i.test(reference ?? "") || /(?:sk-|bearer\s|api[_-]?key)/i.test(reference ?? "")) throw new AutomationStudioLlmProviderError("llm.provider_secret_reference_invalid", "A valid opaque Anthropic secret reference is required.");
  const model = options.model ?? AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL;
  if (!isAutomationStudioAnthropicModel(model)) throw new AutomationStudioLlmProviderError("llm.provider_model_unsupported", automationStudioAnthropicModelRefusal(model));
  const decisionTools = options.decisionTools !== false;
  const maxResponseBytes = options.maxResponseBytes ?? AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes <= 0 || maxResponseBytes > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES) throw new AutomationStudioLlmProviderError("llm.provider_response_limit_invalid", "Anthropic response-byte limit is invalid.");
  // The latest decider request of each Flow this model served, for a judge that continues it (`continued`, t965).
  const deciders = new Map<string, AutomationStudioAnthropicDeciderPrefix>();
  return {
    metadata: { provider: "anthropic", model },
    measureInput: (request) => {
      const { estimatedInputTokens, estimatedInputBytes } = automationStudioAnthropicRequest(request, model, { decisionTools });
      return { estimatedInputTokens, estimatedInputBytes };
    },
    // Cache writes can cost more than a cold input; hold the all-write case,
    // then charge the actual read/write split. Output is the harness reserve.
    estimateCostUsd: ({ inputTokens, outputTokens }) => estimateAutomationStudioAnthropicCostUsd(inputTokens, outputTokens, 0, model, inputTokens),
    runTask: async (request, execution) => {
      const { continuation, ...prepared } = continued(request, prepare(request, model, decisionTools), model, deciders);
      const tools = prepared.decisionTools;
      return await automationStudioAnthropicMessage({
        body: prepared.body, model, ...(continuation ? { continuation } : {}), fetchImpl: options.fetchImpl ?? fetch, maxResponseBytes,
        timeoutMs: request.timeoutMs, ...(execution?.signal ? { signal: execution.signal } : {}),
        requestId: request.requestId, taskKind: request.taskKind,
        ...(request.context.stage ? { stage: request.context.stage } : {}),
        ...(request.context.evidenceLoop?.iteration ? { iteration: request.context.evidenceLoop.iteration } : {}),
        requestShape: { model, taskKind: request.taskKind, requestId: request.requestId, bodyBytes: Buffer.byteLength(prepared.body, "utf8"), responseFormat: tools ? "decision_tools" : prepared.format.jsonText ? "json_text" : "json_schema", measuredInput: prepared.estimatedInputTokens, maxOutput: AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS[model].maxOutputTokens },
        resolveKey: async (signal) => await options.resolveSecret({ provider: "anthropic", secretReference: reference, projectId: request.context.projectId, flowId: request.context.flowId, requestId: request.requestId, purpose: "llm_provider_request", outboundBody: prepared.body, signal }),
        readAnswer: (text, usage) => parseAnswer(text, usage, request, prepared.format.jsonText),
        readToolCall: tools ? (call, usage) => parseToolCall(call, usage, request, tools) : undefined
      });
    }
  };
}

/**
 * The request as it is sent (t965, t967): a decider's is kept as the latest of its attempt, and a judge that continues
 * the decider's conversation (`metadata.continuesDecider`) is sent as that request's cached prefix with the judging
 * appended (`../../models/providers/anthropic/continuation.ts`), in the decider's own transport: its JSON-text format,
 * or, after a decider sent as tools (D12), the same tools and tool choice with the judge answering in plain text.
 *
 * **Its own attempt's decider, by the attempt's key.** The key is the attempt's own, read from the attempt's frame as the
 * call is sent (`../role-routing/ladder/attempt-key.ts`; t971: a key stamped on the request on the way never reached a
 * harness call, which goes to this provider directly), and a decider's prefix is held under it: a judge continues only
 * the prefix held under its own key, so it never continues another attempt's conversation. Run
 * run-mwohvt8n-a57cad8a's judges all fell back under t965's rule, which asked every call of the prefix's evidence to be
 * in the judge's trail, and Core's own entries in that evidence never are.
 *
 * Every judge's call says which way it went (`continuation`, written in its step meta): `used`, or why not. A judge
 * that continued the decider and is asked again on its own request after a reply that could not be read
 * (`metadata.judgeStandaloneAfterUnreadable`, `../../result-verification/unreadable-asks/`, t979) says so:
 * `standalone_after_unreadable`.
 */
/** The attempts whose latest decider request a model's adapter holds, the oldest dropped first. */
const DECIDERS_HELD = 8;

type Prepared = AutomationStudioAnthropicPreparedRequest & { continuation?: { used: boolean; reason: string } };

function continued(request: AutomationStudioLlmTaskRequest, prepared: AutomationStudioAnthropicPreparedRequest, model: AutomationStudioAnthropicModel, deciders: Map<string, AutomationStudioAnthropicDeciderPrefix>): Prepared {
  const key = automationStudioLlmAttemptKey() ?? (typeof request.metadata?.attemptKey === "string" ? request.metadata.attemptKey : undefined);
  if (request.context.evidenceLoop) {
    const prefix = key !== undefined && (prepared.format.jsonText || prepared.decisionTools) ? automationStudioAnthropicDeciderPrefix(JSON.parse(prepared.body) as Record<string, unknown>) : undefined;
    if (key !== undefined) {
      deciders.delete(key);
      if (prefix) deciders.set(key, prefix);
      // The latest few attempts' only: a prefix is a whole decision's request, and an attempt that ended is never judged again.
      for (const oldest of deciders.keys()) {
        if (deciders.size <= DECIDERS_HELD) break;
        deciders.delete(oldest);
      }
    }
    return prepared;
  }
  if (request.taskKind !== "loop_verification") return prepared;
  const own = (reason: string): Prepared => ({ ...prepared, continuation: { used: false, reason } });
  if (request.metadata?.continuesDecider !== true) return own(request.metadata?.judgeStandaloneAfterUnreadable === true ? "standalone_after_unreadable" : "no_decision_in_this_attempt");
  if (key === undefined) return own("no_attempt_key");
  const prefix = deciders.get(key);
  if (!prefix) return own("no_decider_request_held_for_this_attempt_on_this_model");
  const [system, user] = automationStudioLlmTaskMessages(request);
  const wire = automationStudioAnthropicJudgeContinuation(prefix, system!.content, user!.content);
  const body = JSON.stringify(wire);
  const estimatedInputBytes = Buffer.byteLength(JSON.stringify({ tools: wire.tools, tool_choice: wire.tool_choice, system: wire.system, messages: wire.messages, output_config: wire.output_config }), "utf8");
  const estimatedInputTokens = estimateAutomationStudioLlmTokensFromUtf8Bytes(estimatedInputBytes) + 16;
  if (estimatedInputTokens + request.tokenLimits.maxOutputTokens > AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS[model].contextTokens) return own("continuation_past_the_window");
  // The judge answers in the decider's transport: in `result_json` after a JSON-text decider, as plain text after one sent as tools.
  return { body, format: { schema: prepared.format.schema, jsonText: prefix.afterTools !== true }, estimatedInputBytes, estimatedInputTokens, continuation: { used: true, reason: "continues_the_decider" } };
}

function prepare(request: AutomationStudioLlmTaskRequest, model: AutomationStudioAnthropicModel, decisionTools: boolean): AutomationStudioAnthropicPreparedRequest {
  try {
    validateAutomationStudioLlmTaskRequest(request);
    const prepared = automationStudioAnthropicRequest(request, model, { decisionTools });
    const limits = request.tokenLimits;
    const window = AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS[model].contextTokens;
    if (prepared.estimatedInputTokens > limits.maxInputTokens || prepared.estimatedInputTokens + limits.maxOutputTokens > limits.maxTotalTokens || prepared.estimatedInputTokens + limits.maxOutputTokens > window) {
      const inputSize = { estimatedInputTokens: prepared.estimatedInputTokens, estimatedInputBytes: prepared.estimatedInputBytes, maxInputTokens: limits.maxInputTokens, maxOutputTokens: limits.maxOutputTokens, maxTotalTokens: limits.maxTotalTokens, contextWindowTokens: window };
      throw new AutomationStudioLlmProviderError("llm.provider_input_budget_exceeded", "Anthropic request exceeds the context window; nothing was trimmed.", false, undefined, undefined, undefined, undefined, undefined, inputSize);
    }
    return prepared;
  } catch (error) {
    if (error instanceof AutomationStudioLlmProviderError) throw error;
    throw new AutomationStudioLlmProviderError("llm.provider_request_construction_failed", "Anthropic request construction failed.");
  }
}

function parseAnswer(text: string, usage: AutomationStudioLlmUsageSummary, request: AutomationStudioLlmTaskRequest, jsonText: boolean): AutomationStudioLlmStructuredResponse {
  // A reply that cannot be read says which case it was; the loop asks again with that.
  const structured = automationStudioAnthropicReadReply(text, jsonText, "end_turn", usage);
  if (usage.inputTokens! > request.tokenLimits.maxInputTokens || usage.totalTokens! > request.tokenLimits.maxTotalTokens) throw automationStudioAnthropicPaidFailure("llm.provider_usage_limit_exceeded", usage);
  return automationStudioAnthropicTaskAnswer(structured, request, usage, text.length);
}

/**
 * A decision's tool call read back into the wrapper the loop reads (`../provider-task/decision-tools/`), then held to
 * exactly the reading and checks a JSON-text decision is (`./task-answer.ts`). A name the offer did not hold, or an input
 * that is no object, is a paid failure with its account, as an unreadable reply is.
 */
function parseToolCall(call: AutomationStudioAnthropicToolCall, usage: AutomationStudioLlmUsageSummary, request: AutomationStudioLlmTaskRequest, tools: AutomationStudioLlmDecisionTools): AutomationStudioLlmStructuredResponse {
  const contentChars = JSON.stringify(call.input ?? null).length;
  const read = automationStudioLlmDecisionFromToolCall(tools, call);
  if (!read.ok) throw automationStudioAnthropicPaidFailure("llm.provider_output_invalid", usage, { case: read.reason === "unknown_tool" ? "tool_call_unknown" : "content_not_object", finishReason: "tool_use", contentChars, usage });
  if (usage.inputTokens! > request.tokenLimits.maxInputTokens || usage.totalTokens! > request.tokenLimits.maxTotalTokens) throw automationStudioAnthropicPaidFailure("llm.provider_usage_limit_exceeded", usage);
  return automationStudioAnthropicTaskAnswer(read.response, request, usage, contentChars, "tool_use");
}

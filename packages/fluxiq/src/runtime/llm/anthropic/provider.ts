import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest, AutomationStudioLlmStructuredResponse, AutomationStudioLlmUsageSummary } from "../harness/index.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmOpaqueSecretResolver } from "../provider-contract.ts";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES, AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES } from "../provider-transport/index.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL, AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS, automationStudioAnthropicModelRefusal, isAutomationStudioAnthropicModel, type AutomationStudioAnthropicModel } from "../models/index.ts";
import { validateAutomationStudioLlmTaskRequest } from "../provider-task/index.ts";
import type { AutomationStudioLlmSecretReference } from "../deepseek/index.ts";
import { automationStudioAnthropicMessage, automationStudioAnthropicPaidFailure } from "./messages.ts";
import { automationStudioAnthropicRequest } from "./request.ts";
import { automationStudioAnthropicDeciderPrefix, automationStudioAnthropicJudgeContinuation, automationStudioAnthropicReadReply, type AutomationStudioAnthropicDeciderPrefix } from "../../models/providers/anthropic/index.ts";
import { automationStudioLlmTaskMessages } from "../provider-task/index.ts";
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
};

export function createAutomationStudioAnthropicProvider(options: AutomationStudioAnthropicProviderOptions): AutomationStudioLlmProvider {
  const reference = options.secretReference?.id?.trim();
  if (options.secretReference?.kind !== "secret_reference" || !/^secret:[a-z0-9_.:-]{1,180}$/i.test(reference ?? "") || /(?:sk-|bearer\s|api[_-]?key)/i.test(reference ?? "")) throw new AutomationStudioLlmProviderError("llm.provider_secret_reference_invalid", "A valid opaque Anthropic secret reference is required.");
  const model = options.model ?? AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL;
  if (!isAutomationStudioAnthropicModel(model)) throw new AutomationStudioLlmProviderError("llm.provider_model_unsupported", automationStudioAnthropicModelRefusal(model));
  const maxResponseBytes = options.maxResponseBytes ?? AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes <= 0 || maxResponseBytes > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES) throw new AutomationStudioLlmProviderError("llm.provider_response_limit_invalid", "Anthropic response-byte limit is invalid.");
  // The latest decider request of each Flow this model served, for a judge that continues it (`continued`, t965).
  const deciders = new Map<string, AutomationStudioAnthropicDeciderPrefix>();
  return {
    metadata: { provider: "anthropic", model },
    measureInput: (request) => {
      const { estimatedInputTokens, estimatedInputBytes } = automationStudioAnthropicRequest(request, model);
      return { estimatedInputTokens, estimatedInputBytes };
    },
    // Cache writes can cost more than a cold input; hold the all-write case,
    // then charge the actual read/write split. Output is the harness reserve.
    estimateCostUsd: ({ inputTokens, outputTokens }) => estimateAutomationStudioAnthropicCostUsd(inputTokens, outputTokens, 0, model, inputTokens),
    runTask: async (request, execution) => {
      const { continuation, ...prepared } = continued(request, prepare(request, model), model, deciders);
      return await automationStudioAnthropicMessage({
        body: prepared.body, model, ...(continuation ? { continuation } : {}), fetchImpl: options.fetchImpl ?? fetch, maxResponseBytes,
        timeoutMs: request.timeoutMs, ...(execution?.signal ? { signal: execution.signal } : {}),
        requestId: request.requestId, taskKind: request.taskKind,
        ...(request.context.stage ? { stage: request.context.stage } : {}),
        ...(request.context.evidenceLoop?.iteration ? { iteration: request.context.evidenceLoop.iteration } : {}),
        requestShape: { model, taskKind: request.taskKind, requestId: request.requestId, bodyBytes: Buffer.byteLength(prepared.body, "utf8"), responseFormat: prepared.format.jsonText ? "json_text" : "json_schema", measuredInput: prepared.estimatedInputTokens, maxOutput: AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS[model].maxOutputTokens },
        resolveKey: async (signal) => await options.resolveSecret({ provider: "anthropic", secretReference: reference, projectId: request.context.projectId, flowId: request.context.flowId, requestId: request.requestId, purpose: "llm_provider_request", outboundBody: prepared.body, signal }),
        readAnswer: (text, usage) => parseAnswer(text, usage, request, prepared.format.jsonText)
      });
    }
  };
}

/**
 * The request as it is sent (t965, t967): a decider's is kept as the latest of its attempt, and a judge that continues
 * the decider's conversation (`metadata.continuesDecider`) is sent as that request's cached prefix with the judging
 * appended (`../../models/providers/anthropic/continuation.ts`), in the decider's JSON-text format.
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

type Prepared = ReturnType<typeof automationStudioAnthropicRequest> & { continuation?: { used: boolean; reason: string } };

function continued(request: AutomationStudioLlmTaskRequest, prepared: ReturnType<typeof automationStudioAnthropicRequest>, model: AutomationStudioAnthropicModel, deciders: Map<string, AutomationStudioAnthropicDeciderPrefix>): Prepared {
  const key = automationStudioLlmAttemptKey() ?? (typeof request.metadata?.attemptKey === "string" ? request.metadata.attemptKey : undefined);
  if (request.context.evidenceLoop) {
    const prefix = key !== undefined && prepared.format.jsonText ? automationStudioAnthropicDeciderPrefix(JSON.parse(prepared.body) as Record<string, unknown>) : undefined;
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
  const estimatedInputBytes = Buffer.byteLength(JSON.stringify({ system: wire.system, messages: wire.messages, output_config: wire.output_config }), "utf8");
  const estimatedInputTokens = estimateAutomationStudioLlmTokensFromUtf8Bytes(estimatedInputBytes) + 16;
  if (estimatedInputTokens + request.tokenLimits.maxOutputTokens > AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS[model].contextTokens) return own("continuation_past_the_window");
  return { body, format: { schema: prepared.format.schema, jsonText: true }, estimatedInputBytes, estimatedInputTokens, continuation: { used: true, reason: "continues_the_decider" } };
}

function prepare(request: AutomationStudioLlmTaskRequest, model: AutomationStudioAnthropicModel): ReturnType<typeof automationStudioAnthropicRequest> {
  try {
    validateAutomationStudioLlmTaskRequest(request);
    const prepared = automationStudioAnthropicRequest(request, model);
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

import type { AutomationStudioLlmProvider, AutomationStudioLlmTaskRequest, AutomationStudioLlmStructuredResponse, AutomationStudioLlmUsageSummary } from "../harness.ts";
import { AutomationStudioLlmProviderError, type AutomationStudioLlmOpaqueSecretResolver } from "../provider-contract.ts";
import { AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES, AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES } from "../provider-transport/index.ts";
import { AUTOMATION_STUDIO_ANTHROPIC_DEFAULT_MODEL, AUTOMATION_STUDIO_ANTHROPIC_MODEL_LIMITS, automationStudioAnthropicModelRefusal, isAutomationStudioAnthropicModel, type AutomationStudioAnthropicModel } from "../models/index.ts";
import { validateAutomationStudioLlmTaskRequest, automationStudioLlmTaskOutputSchema } from "../provider-task/index.ts";
import type { AutomationStudioLlmSecretReference } from "../deepseek/index.ts";
import { automationStudioAnthropicMessage, automationStudioAnthropicPaidFailure } from "./messages.ts";
import { automationStudioAnthropicRequest } from "./request.ts";
import { automationStudioAnthropicMatchesSchema } from "./schema.ts";
import { estimateAutomationStudioAnthropicCostUsd } from "./pricing.ts";
import { isRecord } from "../provider-transport/index.ts";

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
      const prepared = prepare(request, model);
      return await automationStudioAnthropicMessage({
        body: prepared.body, model, fetchImpl: options.fetchImpl ?? fetch, maxResponseBytes,
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
  let structured: unknown;
  try {
    structured = JSON.parse(text);
    if (jsonText) {
      if (!isRecord(structured) || Object.keys(structured).length !== 1 || typeof structured.result_json !== "string") throw new Error("Invalid transport envelope.");
      structured = JSON.parse(structured.result_json);
    }
  } catch { throw automationStudioAnthropicPaidFailure("llm.provider_malformed_response", usage); }
  if (usage.inputTokens! > request.tokenLimits.maxInputTokens || usage.totalTokens! > request.tokenLimits.maxTotalTokens) throw automationStudioAnthropicPaidFailure("llm.provider_usage_limit_exceeded", usage);
  if (!automationStudioAnthropicMatchesSchema(structured, automationStudioLlmTaskOutputSchema(request))) throw automationStudioAnthropicPaidFailure("llm.provider_output_invalid", usage);
  // The unchanged original schema is checked here; Core's harness applies its
  // usual semantic result validation again before it can execute an answer.
  return structured as AutomationStudioLlmStructuredResponse;
}

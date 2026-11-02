import { automationStudioDeepSeekCompletion } from "../../../../../runtime/models/providers/deepseek/index.ts";
import { automationStudioProviderRefusalMessageScreen } from "../provider-transport/index.ts";
import type {
  AutomationStudioLlmProvider,
  AutomationStudioLlmStructuredResponse,
  AutomationStudioLlmTaskRequest,
  AutomationStudioLlmUsageSummary
} from "../harness.ts";
import {
  automationStudioLlmSignalTimedOut,
  AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS,
  AutomationStudioLlmProviderError,
  type AutomationStudioLlmOpaqueSecretResolver
} from "../provider-contract.ts";
import {
  AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL,
  automationStudioDeepSeekModelRefusal,
  isAutomationStudioDeepSeekModel,
  type AutomationStudioDeepSeekModel
} from "./models.ts";
import {
  AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES,
  AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES,
  readAutomationStudioDeepSeekBoundedResponse
} from "./bounded-read.ts";
import { buildAutomationStudioDeepSeekRequestBody, measureAutomationStudioDeepSeekInput } from "./request-body.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS } from "./models.ts";
import { estimateAutomationStudioDeepSeekCostUsd } from "./pricing.ts";
import { automationStudioDeepSeekRequestShape } from "./request-shape.ts";
import { automationStudioDeepSeekRefusalText, readAutomationStudioDeepSeekRefusal } from "./refusal.ts";
import { automationStudioDeepSeekBalanceExhausted } from "./balance-exhausted.ts";
import { validateAutomationStudioDeepSeekRequest } from "./preflight.ts";
import { automationStudioDeepSeekMalformedReply, parseAutomationStudioDeepSeekEnvelope } from "./response-envelope.ts";
import { automationStudioLlmStepLogModelStep } from "../step-log/index.ts";

export { AUTOMATION_STUDIO_DEEPSEEK_ORIGIN, AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL } from "../../../../../runtime/models/providers/deepseek/index.ts";
/**
 * The model this adapter sends when its caller names none.
 *
 * It is the registry's default rather than a string written here, because a
 * string written here is what made the last rename a two-repository source edit:
 * see `models.ts`.
 */
export const AUTOMATION_STUDIO_DEEPSEEK_MODEL: AutomationStudioDeepSeekModel = AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL;
export type AutomationStudioLlmSecretReference = { kind: "secret_reference"; id: string };

export type AutomationStudioDeepSeekProviderOptions = {
  secretReference: AutomationStudioLlmSecretReference;
  resolveSecret: AutomationStudioLlmOpaqueSecretResolver;
  fetchImpl?: typeof fetch;
  model?: string;
  maxResponseBytes?: number;
  /** The clock a call is priced by, peak or off-peak (`./pricing.ts`); `Date.now` when absent. */
  now?: () => number;
};

export function createAutomationStudioDeepSeekProvider(options: AutomationStudioDeepSeekProviderOptions): AutomationStudioLlmProvider {
  const secretReference = options.secretReference?.id?.trim();
  if (options.secretReference?.kind !== "secret_reference" || !/^secret:[a-z0-9_.:-]{1,180}$/i.test(secretReference ?? "") || /(?:sk-|bearer\s|api[_-]?key)/i.test(secretReference ?? "")) {
    throw new AutomationStudioLlmProviderError("llm.provider_secret_reference_invalid", "A valid opaque DeepSeek secret reference is required.");
  }
  // A model Core is not configured for is refused here, with the id it was
  // given and the ones it would have taken, rather than sent: DeepSeek answers
  // an unknown model with a bare 400 that reads like a transport fault.
  const model = options.model ?? AUTOMATION_STUDIO_DEEPSEEK_DEFAULT_MODEL;
  if (!isAutomationStudioDeepSeekModel(model)) throw new AutomationStudioLlmProviderError("llm.provider_model_unsupported", automationStudioDeepSeekModelRefusal(model));
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxResponseBytes = options.maxResponseBytes ?? AUTOMATION_STUDIO_LLM_DEFAULT_MAX_RESPONSE_BYTES;
  if (!Number.isInteger(maxResponseBytes) || maxResponseBytes <= 0 || maxResponseBytes > AUTOMATION_STUDIO_LLM_ABSOLUTE_MAX_RESPONSE_BYTES) {
    throw new AutomationStudioLlmProviderError("llm.provider_response_limit_invalid", "DeepSeek response-byte limit is invalid.");
  }
  const now = options.now ?? Date.now;
  return {
    metadata: { provider: "deepseek", model },
    // The same measure `runDeepSeekTask` refuses on, so the harness refuses an
    // oversize request first and with its size (`../harness/run.ts`).
    measureInput: (request) => measureAutomationStudioDeepSeekInput(request),
    // All input a cache miss -- what is cached is not known before the call --
    // at the model's rates in force now, peak or off-peak (t254): what the
    // harness holds for a call of this size against the ledger and the purse.
    estimateCostUsd: ({ inputTokens, outputTokens }) => estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, 0, model, now()),
    runTask: async (request, execution) => {
      try {
        return await runDeepSeekTask({ request, ...(execution?.signal ? { signal: execution.signal } : {}), secretReference, resolveSecret: options.resolveSecret, fetchImpl, model, maxResponseBytes, now });
      } catch (error) {
        if (error instanceof AutomationStudioLlmProviderError) throw error;
        // Transport and response work is normalized inside runDeepSeekTask. Any
        // other escape happened while establishing the local request boundary.
        throw new AutomationStudioLlmProviderError("llm.provider_request_setup_failed", "DeepSeek request setup failed.");
      }
    }
  };
}

async function runDeepSeekTask(input: {
  request: AutomationStudioLlmTaskRequest;
  signal?: AbortSignal;
  secretReference: string;
  resolveSecret: AutomationStudioLlmOpaqueSecretResolver;
  fetchImpl: typeof fetch;
  model: AutomationStudioDeepSeekModel;
  maxResponseBytes: number;
  now: () => number;
}): Promise<{ response: AutomationStudioLlmStructuredResponse; usage: AutomationStudioLlmUsageSummary }> {
  let body: string;
  try {
    validateAutomationStudioDeepSeekRequest(input.request);
    if (!Number.isInteger(input.request.timeoutMs) || input.request.timeoutMs <= 0 || input.request.timeoutMs > AUTOMATION_STUDIO_LLM_MAX_TIMEOUT_MS) {
      throw new AutomationStudioLlmProviderError("llm.provider_request_timeout_invalid", "LLM request timeout is outside the allowed provider range.");
    }
    body = buildAutomationStudioDeepSeekRequestBody(input.request, input.model);
    const measured = measureAutomationStudioDeepSeekInput(input.request);
    const estimatedInputTokens = measured.estimatedInputTokens;
    // The one size limit on a request: the model's context window, which the
    // request's token limits are sized to (`../session-key-provider.ts`). Over
    // it, the request is refused with its measured size and never trimmed to
    // fit (`../context-window.ts`).
    const limits = input.request.tokenLimits;
    const window = AUTOMATION_STUDIO_DEEPSEEK_MODEL_LIMITS[input.model].contextTokens;
    if (estimatedInputTokens > limits.maxInputTokens
      || estimatedInputTokens + limits.maxOutputTokens > limits.maxTotalTokens
      || estimatedInputTokens + limits.maxOutputTokens > window) {
      // The size travels as numbers on the error, so the recorded failure states
      // it too: the normalizer's safe message for this code is built from them.
      const inputSize = { estimatedInputTokens, estimatedInputBytes: measured.estimatedInputBytes, maxInputTokens: limits.maxInputTokens, maxOutputTokens: limits.maxOutputTokens, maxTotalTokens: limits.maxTotalTokens, contextWindowTokens: window };
      throw new AutomationStudioLlmProviderError("llm.provider_input_budget_exceeded", `Outbound request is an estimated ${estimatedInputTokens} input tokens (${measured.estimatedInputBytes} bytes) plus ${limits.maxOutputTokens} reserved for the reply, over its ${limits.maxInputTokens}-token input or ${limits.maxTotalTokens}-token total limit; ${input.model}'s context window is ${window} tokens. It was not sent, and nothing was trimmed to fit.`, false, undefined, undefined, undefined, undefined, undefined, inputSize);
    }
  } catch (error) {
    if (error instanceof AutomationStudioLlmProviderError) throw error;
    // Which kind of throw it was. The message never travels -- a throw from
    // request construction has the request in scope, so its text could carry a
    // page or a person's data -- but the constructor's name cannot, and without
    // it this arm says only that something went wrong while building a request,
    // which is a whole class of defect wearing one code. Two live runs failed
    // for a day on exactly this arm before anybody could say what threw.
    const kind = error instanceof Error && typeof error.name === "string" && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "non_error";
    throw new AutomationStudioLlmProviderError("llm.provider_request_construction_failed", `DeepSeek request construction failed (${kind}).`);
  }
  return automationStudioDeepSeekCompletion({
    body, model: input.model, fetchImpl: input.fetchImpl, maxResponseBytes: input.maxResponseBytes, timeoutMs: input.request.timeoutMs, now: input.now,
    ...(input.signal ? { signal: input.signal } : {}),
    requestId: input.request.requestId, idempotencyKey: input.request.idempotencyKey, taskKind: input.request.taskKind,
    ...(input.request.context.stage ? { stage: input.request.context.stage } : {}),
    ...(input.request.context.evidenceLoop?.iteration ? { iteration: input.request.context.evidenceLoop.iteration } : {}),
    observe: automationStudioLlmStepLogModelStep,
    screenMessage: automationStudioProviderRefusalMessageScreen,
    requestShape: () => automationStudioDeepSeekRequestShape({ request: input.request, model: input.model, body }),
    resolveKey: (signal) => input.resolveSecret({ provider: "deepseek", secretReference: input.secretReference, projectId: input.request.context.projectId, flowId: input.request.context.flowId, requestId: input.request.requestId, purpose: "llm_provider_request", outboundBody: body, signal }),
    readEnvelope: (value, sentAtMs) => parseAutomationStudioDeepSeekEnvelope(value, input.request, input.model, sentAtMs)
  });
}

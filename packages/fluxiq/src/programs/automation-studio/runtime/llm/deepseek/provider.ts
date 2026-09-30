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
import { validateAutomationStudioDeepSeekRequest } from "./preflight.ts";
import { parseAutomationStudioDeepSeekEnvelope } from "./response-envelope.ts";

export const AUTOMATION_STUDIO_DEEPSEEK_ORIGIN = "https://api.deepseek.com";
export const AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL = `${AUTOMATION_STUDIO_DEEPSEEK_ORIGIN}/chat/completions`;
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
  return {
    metadata: { provider: "deepseek", model },
    // The same measure `runDeepSeekTask` refuses on, so the harness refuses an
    // oversize request first and with its size (`../harness/run.ts`).
    measureInput: (request) => measureAutomationStudioDeepSeekInput(request),
    // All input a cache miss, at the model's peak rates: what the harness
    // reserves for a call of this size against the run's ledger.
    estimateCostUsd: ({ inputTokens, outputTokens }) => estimateAutomationStudioDeepSeekCostUsd(inputTokens, outputTokens, 0, model),
    runTask: async (request, execution) => {
      try {
        return await runDeepSeekTask({ request, ...(execution?.signal ? { signal: execution.signal } : {}), secretReference, resolveSecret: options.resolveSecret, fetchImpl, model, maxResponseBytes });
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
      throw new AutomationStudioLlmProviderError("llm.provider_input_budget_exceeded", `Outbound request is an estimated ${estimatedInputTokens} input tokens (${measured.estimatedInputBytes} bytes) plus ${limits.maxOutputTokens} reserved for the reply, over its ${limits.maxInputTokens}-token input or ${limits.maxTotalTokens}-token total limit; ${input.model}'s context window is ${window} tokens. It was not sent, and nothing was trimmed to fit.`, false, undefined, undefined, undefined, undefined, inputSize);
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
  const controller = new AbortController();
  let timedOut = false;
  let secret = "";
  const abortFromParent = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) abortFromParent();
  else input.signal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.request.timeoutMs);
  try {
    try {
      secret = await waitForAbortable(input.resolveSecret({
        provider: "deepseek",
        secretReference: input.secretReference,
        projectId: input.request.context.projectId,
        flowId: input.request.context.flowId,
        requestId: input.request.requestId,
        purpose: "llm_provider_request",
        outboundBody: body,
        signal: controller.signal
      }), controller.signal);
    } catch {
      if (timedOut) throw new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek secret resolution exceeded the request timeout.", true);
      if (input.signal?.aborted) throw parentSignalFailure(input.signal);
      throw new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", "The configured DeepSeek secret could not be resolved.");
    }
    if (typeof secret !== "string" || !secret.trim()) throw new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", "The configured DeepSeek secret could not be resolved.");
    if (body.includes(secret)) throw new AutomationStudioLlmProviderError("llm.provider_credential_in_request", "The outbound request contains the configured credential.");
    const response = await input.fetchImpl(AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL, {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "authorization": `Bearer ${secret}`,
        "content-type": "application/json",
        "accept": "application/json",
        "x-request-id": input.request.requestId,
        "idempotency-key": input.request.idempotencyKey
      },
      body
    });
    if (response.redirected || (response.status >= 300 && response.status < 400) || (response.url && response.url !== AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL)) {
      throw new AutomationStudioLlmProviderError("llm.provider_redirect_rejected", "DeepSeek redirected outside the fixed provider endpoint.");
    }
    if (!response.ok) throw await deepSeekRefusalFailure(response, input, body, secret);
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
      throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "DeepSeek returned a non-JSON media type.");
    }
    const bytes = await readAutomationStudioDeepSeekBoundedResponse(response, input.maxResponseBytes);
    let envelope: unknown;
    try {
      envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    } catch {
      throw new AutomationStudioLlmProviderError("llm.provider_malformed_response", "DeepSeek returned malformed JSON.");
    }
    return parseAutomationStudioDeepSeekEnvelope(envelope, input.request, input.model);
  } catch (error) {
    if (error instanceof AutomationStudioLlmProviderError) throw error;
    if (timedOut) throw new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek did not respond before the request timeout.", true);
    if (input.signal?.aborted) throw parentSignalFailure(input.signal);
    throw new AutomationStudioLlmProviderError("llm.provider_network_error", "The DeepSeek request failed at the network boundary.", true);
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortFromParent);
    secret = "";
  }
}

/**
 * The failure for a reply that is not a success, carrying what the provider said
 * about it and the shape of the request it refused.
 *
 * **Every non-2xx comes through here, which is the point.** The auth and
 * rate-limit statuses used to be decided above `!response.ok` and thrown without
 * the body being read, so two of the statuses a person can actually act on -- a
 * credential the provider rejected, a ceiling it enforced -- were among the ones
 * that said least. The codes and their retryability are unchanged; what is new
 * is that all of them carry the refusal.
 *
 * **The record is published, and that is what it is for.** It used to say here
 * that it never would be -- that a run's bundle took this failure's `code` and
 * `status` and nothing else. That was true while nothing outside the throw could
 * read it, and it was also the whole defect: a build refused with a 400 could say
 * it had been refused and nothing about why. The record now travels out of the
 * harness typed (`../refusal-record.ts`) and into a stored Flow Bootstrap
 * failure's `accounting.providerRefusal`, so the caller of a failed build gets
 * the field the provider objected to.
 *
 * What holds instead of "never published" is that nothing unscreened is: every
 * field is screened here, against the configured credential and Core's own
 * locator screen (`refusal.ts`), and bounded again centrally before it is
 * carried. The one thing that must not change without weighing that is what this
 * adapter puts *into* the record.
 */
async function deepSeekRefusalFailure(
  response: Response,
  input: { request: AutomationStudioLlmTaskRequest; model: AutomationStudioDeepSeekModel; maxResponseBytes: number },
  body: string,
  credential: string
): Promise<AutomationStudioLlmProviderError> {
  const refusal = await readAutomationStudioDeepSeekRefusal({
    response,
    maxResponseBytes: input.maxResponseBytes,
    request: automationStudioDeepSeekRequestShape({ request: input.request, model: input.model, body }),
    credential
  });
  const said = automationStudioDeepSeekRefusalText(refusal);
  if (response.status === 401 || response.status === 403) {
    return new AutomationStudioLlmProviderError("llm.provider_auth_failed", "DeepSeek rejected the configured credential.", false, response.status, undefined, said);
  }
  if (response.status === 429) {
    return new AutomationStudioLlmProviderError("llm.provider_rate_limited", "DeepSeek rate limited the request.", true, response.status, undefined, said);
  }
  return new AutomationStudioLlmProviderError("llm.provider_http_error", "DeepSeek returned an unsuccessful HTTP status.", response.status >= 500, response.status, undefined, said);
}

function parentSignalFailure(signal: AbortSignal): AutomationStudioLlmProviderError {
  return automationStudioLlmSignalTimedOut(signal)
    ? new AutomationStudioLlmProviderError("llm.provider_timeout", "The DeepSeek request exceeded its authorized execution deadline.", true)
    : new AutomationStudioLlmProviderError("llm.provider_aborted", "The DeepSeek request was cancelled.");
}

function waitForAbortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

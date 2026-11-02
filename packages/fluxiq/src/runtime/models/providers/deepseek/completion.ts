import { sendDeepSeekRequest } from "./send.ts";
import type { AutomationStudioLlmUsageSummary, ModelRequestShape } from "../../contracts/index.ts";
import { AutomationStudioLlmProviderError, automationStudioLlmSignalTimedOut } from "../../failures/index.ts";
import type { AutomationStudioDeepSeekModel } from "../../catalog/index.ts";
import { readAutomationStudioProviderBoundedResponse as readAutomationStudioDeepSeekBoundedResponse, readAutomationStudioProviderRefusal as readAutomationStudioDeepSeekRefusal, automationStudioProviderRefusalText as automationStudioDeepSeekRefusalText, automationStudioProviderBalanceExhausted as automationStudioDeepSeekBalanceExhausted, type ModelTransportObservation, type ModelTransportObserver } from "../../transport/index.ts";
import { estimateAutomationStudioDeepSeekCostUsd } from "./pricing.ts";
import { automationStudioDeepSeekMalformedReply } from "./response-envelope.ts";
import { AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL } from "./endpoints.ts";

export type DeepSeekCompletionInput<Response> = {
  body: string;
  model: AutomationStudioDeepSeekModel;
  fetchImpl: typeof fetch;
  maxResponseBytes: number;
  timeoutMs: number;
  signal?: AbortSignal;
  requestId: string;
  idempotencyKey: string;
  taskKind: string;
  stage?: string;
  iteration?: number;
  now: () => number;
  resolveKey(signal: AbortSignal): Promise<string>;
  requestShape(): ModelRequestShape;
  screenMessage(value: string): string;
  observe?: ModelTransportObserver;
  readEnvelope(value: unknown, sentAtMs: number): { response: Response; usage: AutomationStudioLlmUsageSummary };
};

/** Prepared-request HTTP execution; task schemas, prompts and response semantics are supplied by its caller. */
export async function automationStudioDeepSeekCompletion<Response>(input: DeepSeekCompletionInput<Response>): Promise<{ response: Response; usage: AutomationStudioLlmUsageSummary }> {
  const body = input.body;
  const controller = new AbortController();
  let timedOut = false;
  let secret = "";
  const abortFromParent = () => controller.abort(input.signal?.reason);
  if (input.signal?.aborted) abortFromParent();
  else input.signal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, input.timeoutMs);
  // The step log's record of this exchange (`../step-log/`): opened just before the
  // request is sent, never handed the credential or a header. Undefined when off.
  let step: ModelTransportObservation | undefined;
  try {
    try {
      secret = await waitForAbortable(input.resolveKey(controller.signal), controller.signal);
    } catch {
      if (timedOut) throw new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek secret resolution exceeded the request timeout.", true);
      if (input.signal?.aborted) throw parentSignalFailure(input.signal);
      throw new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", "The configured DeepSeek secret could not be resolved.");
    }
    if (typeof secret !== "string" || !secret.trim()) throw new AutomationStudioLlmProviderError("llm.provider_secret_unavailable", "The configured DeepSeek secret could not be resolved.");
    if (body.includes(secret)) throw new AutomationStudioLlmProviderError("llm.provider_credential_in_request", "The outbound request contains the configured credential.");
    // `price` lets the step log price a failed call from the reply's own usage,
    // as the panel's chat call does, where no refusal carried a cost.
    const model = input.model;
    // When the call is sent: what it is billed at, peak or off-peak (`./pricing.ts`, t254).
    const sentAtMs = input.now();
    step = input.observe?.({
      provider: "deepseek", model, url: AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL, body, taskKind: input.taskKind, requestId: input.requestId, stage: input.stage, iteration: input.iteration,
      price: (usage) => estimateAutomationStudioDeepSeekCostUsd(usage.inputTokens, usage.outputTokens, usage.cacheHitInputTokens, model, sentAtMs)
    });
    const response = await sendDeepSeekRequest(input.fetchImpl, body, secret, controller.signal, {
      redirect: "manual", raceSignal: false, classifyFailure: false,
      headers: { "x-request-id": input.requestId, "idempotency-key": input.idempotencyKey }
    });
    // A reply the call never reads for itself is read for the step log from a copy.
    if (step && (!response.ok || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? ""))) await stepLogReply(step, response, input.maxResponseBytes, controller.signal);
    if (response.redirected || (response.status >= 300 && response.status < 400) || (response.url && response.url !== AUTOMATION_STUDIO_DEEPSEEK_CHAT_COMPLETIONS_URL)) {
      throw new AutomationStudioLlmProviderError("llm.provider_redirect_rejected", "DeepSeek redirected outside the fixed provider endpoint.");
    }
    // The refusal body is read under the same signal: a 4xx/5xx DeepSeek starts
    // and never finishes ends with the call's deadline too (t617).
    if (!response.ok) throw await deepSeekRefusalFailure(response, input, secret, controller.signal);
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) {
      throw automationStudioDeepSeekMalformedReply({ case: "media_type" }, "DeepSeek returned a non-JSON media type.");
    }
    // Read under the call's own signal: a reply DeepSeek starts and never
    // finishes (blank lines while it queues the request) ends with the call's
    // deadline, not when Node's fetch lets go of the body (t613).
    const bytes = await readAutomationStudioDeepSeekBoundedResponse(response, input.maxResponseBytes, controller.signal);
    step?.reply(bytes, response.status);
    let envelope: unknown;
    try {
      envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    } catch {
      throw automationStudioDeepSeekMalformedReply({ case: "envelope_not_json" }, "DeepSeek returned malformed JSON.");
    }
    const parsed = input.readEnvelope(envelope, sentAtMs);
    step?.succeeded(parsed.response, parsed.usage);
    return parsed;
  } catch (error) {
    // The body read's own timeout (`./signal-race.ts`) is renamed for whichever
    // deadline actually ended the call: this request's, or the caller's.
    const endedBySignal = error instanceof AutomationStudioLlmProviderError && error.code === "llm.provider_timeout" && controller.signal.aborted;
    const failure = error instanceof AutomationStudioLlmProviderError && !endedBySignal
      ? error
      : timedOut
        ? new AutomationStudioLlmProviderError("llm.provider_timeout", "DeepSeek did not respond before the request timeout.", true)
        : input.signal?.aborted
          ? parentSignalFailure(input.signal)
          : new AutomationStudioLlmProviderError("llm.provider_network_error", "The DeepSeek request failed at the network boundary.", true);
    step?.failed(failure);
    throw failure;
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", abortFromParent);
    secret = "";
  }
}

async function deepSeekRefusalFailure(
  response: Response,
  input: { requestShape: () => ModelRequestShape; maxResponseBytes: number; screenMessage: (value: string) => string },
  credential: string,
  signal: AbortSignal
): Promise<AutomationStudioLlmProviderError> {
  const refusal = await readAutomationStudioDeepSeekRefusal({
    response,
    maxResponseBytes: input.maxResponseBytes,
    request: input.requestShape(),
    screenMessage: input.screenMessage,
    credential,
    signal
  });
  const said = automationStudioDeepSeekRefusalText(refusal);
  // Before the status checks: an empty account is its own code under any status (`./balance-exhausted.ts`).
  if (automationStudioDeepSeekBalanceExhausted(response.status, refusal.error)) {
    return new AutomationStudioLlmProviderError("llm.provider_balance_exhausted", "DeepSeek refused the request: the account's balance is exhausted.", false, response.status, undefined, said);
  }
  if (response.status === 401 || response.status === 403) {
    return new AutomationStudioLlmProviderError("llm.provider_auth_failed", "DeepSeek rejected the configured credential.", false, response.status, undefined, said);
  }
  if (response.status === 429) {
    return new AutomationStudioLlmProviderError("llm.provider_rate_limited", "DeepSeek rate limited the request.", true, response.status, undefined, said);
  }
  return new AutomationStudioLlmProviderError("llm.provider_http_error", "DeepSeek returned an unsuccessful HTTP status.", response.status >= 500, response.status, undefined, said);
}

async function stepLogReply(step: ModelTransportObservation, response: Response, maxResponseBytes: number, signal: AbortSignal): Promise<void> {
  try {
    step.reply(await readAutomationStudioDeepSeekBoundedResponse(response.clone(), maxResponseBytes, signal), response.status);
  } catch {
    /* best-effort: an unread copy only leaves response.json absent */
  }
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

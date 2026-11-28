// A request the model provider refused, told apart from a provider that is silent (t1100).
//
// **The failure this closes.** The web panel's replay on 2026-11-28 (fluxiq 0.55.0, Haiku 5.5): after the judge, every
// decision was answered at once with HTTP 400 `invalid_request_error`, "tools.8.custom: For 'object' type,
// 'additionalProperties' must be explicitly set to false". Each was read as silence -- the server-error code with no
// status was taken for a 5xx -- and the chat said "The model service is not answering, so I am waiting 5 seconds" and then
// 10, 20 and 40, asking the identical request again each time, until the person pressed Stop because it was "very unclear
// what was happening".
//
// **The decision.** A 4xx refusal is the provider answering, not silence: it says this request is one it will not take.
// Before anything here sees one, the adapter changes the request where it can -- a strict tool the refusal names, or a
// grammar too large, is demoted and the request sent again (`../../models/providers/anthropic/strict-fit/`) -- so what
// arrives here is a refusal Core could not answer by changing the request. Asking again would send the identical request
// and be refused identically: retrying it cannot reach the result, so ending on it is no new way for a task to fail, only
// an honest account of one that could never have succeeded. The round ends on it: the attempt throws the refusal, and
// the build's ending says it once, in t1093's words ("Build failed: the model provider refused the request: <its
// message>", `../../models/failures/refused-words.ts`). It is never waited on and never asked again.
//
// **Silence is unchanged.** A timeout, an unreachable network, a server error (5xx) and a rate limit (429) keep their
// backoff and their wording (`./backoff.ts`); so does a 408, the provider's own word that it did not wait for the
// request. Read by class, code and status, and by the screened refusal record, never by a message Core has not bounded.

import { parseAutomationStudioFlowBootstrapGenerationError } from "../../flow-authoring/bootstrap/generation-failure/index.ts";
import { AutomationStudioLlmProviderError, automationStudioLlmProviderRefusalWords, normalizedAutomationStudioLlmProviderFailure, type AutomationStudioLlmProviderRefusal } from "../../models/failures/index.ts";

const HTTP_ERROR = "llm.provider_http_error";
const BUILD_HTTP_ERROR = "flow_bootstrap.provider_http_error";
/** Client statuses that say the provider did not answer this request, rather than refused it. */
const SILENT_STATUSES: ReadonlySet<number> = new Set([408, 429]);

/** A refusal's status as it stands: a 4xx that is no silence. */
function refusedStatus(status: unknown): status is number {
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 499 && !SILENT_STATUSES.has(status);
}

/**
 * What `error` says the provider refused, in words that finish "The round stopped because ...": a provider error with
 * the server-error code and a 4xx status, or a build failure projected from one. `undefined` for anything else.
 */
export function automationStudioAnswerFirstRefusedRequest(error: unknown): { words: string } | undefined {
  if (error instanceof AutomationStudioLlmProviderError) {
    const failure = normalizedAutomationStudioLlmProviderFailure(error);
    if (failure.code !== HTTP_ERROR || !refusedStatus(failure.status)) return undefined;
    return { words: said(failure.refusal, failure.status) };
  }
  const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
  if (diagnostic?.code !== BUILD_HTTP_ERROR) return undefined;
  const status = diagnostic.accounting?.providerRefusal?.status ?? diagnostic.accounting?.providerStatus;
  return refusedStatus(status) ? { words: said(diagnostic.accounting?.providerRefusal, status) } : undefined;
}

function said(refusal: AutomationStudioLlmProviderRefusal | undefined, status: number): string {
  return automationStudioLlmProviderRefusalWords(refusal ?? { status }) ?? "the model provider refused the request";
}

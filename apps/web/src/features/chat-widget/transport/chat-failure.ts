// Core's answer to a request that failed, in the words and codes the chat's
// ports use (`ChatResult`, ui-components `chat/ports/result.ts`).
//
// The panel's transport already sorts a failure into a code (`code`,
// `errorCode`, the HTTP status). The chat branches on a smaller set:
//
//   unreachable      the browser never reached the panel's API (status 0)
//   timed_out        the API did not answer in time (408, 504)
//   refused          the person's session was refused (401): the chat swaps its
//                    stream for "Talk to FluxIQ in the FluxIQ window."
//   invalid_request  the request itself was refused as malformed (400)
//   failed           anything else without a code of its own
//
// Any other code Core or the panel gave passes through untouched, so
// `automation.instructions_required` still reaches Take over / Hand back.

import type { ChatResult } from "@fluxiq/ui-components";
import type { ApiResponse } from "../../programs/program-api";

const NOT_REACHED = "Couldn't reach FluxIQ. Try again.";
const CANCELLED = "The request was cancelled.";
const SIGNED_OUT = "FluxIQ has signed you out. Sign in again to keep chatting.";
const SLOW = "FluxIQ didn't answer in time. Try again.";
const REFUSED = "FluxIQ couldn't do that.";

export type ChatFailure = Extract<ChatResult<never>, { ok: false }>;

/** The failure `response` stands for. A response that did not fail still answers a generic one, never a throw. */
export function chatFailure(response: ApiResponse<unknown>): ChatFailure {
  const detail = response.error?.trim() || undefined;
  const failure = (code: string, sentence: string): ChatFailure => ({ ok: false, code, sentence, ...(detail ? { detail } : {}) });
  if (response.aborted) return failure("failed", CANCELLED);
  const status = response.status;
  if (status === 0 || response.code === "request_failed") return failure("unreachable", NOT_REACHED);
  if (status === 408 || status === 504 || response.code === "request_timeout") return failure("timed_out", SLOW);
  if (status === 401 || response.code === "authentication_required") return failure("refused", SIGNED_OUT);
  if (response.requiresRecheck) return failure(response.code ?? "reauthorization_required", detail ?? "This needs your PIN. Open the Studio to confirm it.");
  const code = response.errorCode ?? response.code;
  if (status === 400 && (code === undefined || code === "invalid_request")) return failure("invalid_request", detail ?? REFUSED);
  return failure(code ?? "failed", detail ?? REFUSED);
}

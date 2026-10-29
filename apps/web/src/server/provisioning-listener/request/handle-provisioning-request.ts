import type { IncomingMessage, ServerResponse } from "node:http";
import { performance } from "node:perf_hooks";
import { PLATFORM_PROVISIONING_ERROR_STATUS, provisioningOperationForHttpPath } from "../contract";
import type { PlatformProvisioningErrorCode } from "../contract";
import { normalizePeerAddress, type SourceAllowlist } from "../source";
import { readBearerToken, type ProvisioningTokenVerifier } from "../token";
import type { ProvisioningListenerServices } from "../types";
import { formatRequestLogLine } from "./format-request-log-line";
import { readJsonBody } from "./read-json-body";
import type { SlidingWindowRateLimiter } from "./sliding-window-rate-limiter";
import { writeProvisioningAnswer, type ProvisioningAnswerHeaders } from "./write-provisioning-answer";

export type ProvisioningRequestDeps = {
  allowlist: SourceAllowlist;
  rateLimiter: SlidingWindowRateLimiter;
  tokens: ProvisioningTokenVerifier;
  getServices(): Promise<ProvisioningListenerServices>;
  log(line: string): void;
  /** Seconds a rate-limited caller is told to wait. */
  retryAfterSeconds: number;
};

type Outcome = { operation: string | null; status: number; code: string | null };

const PARSE_BASE = "http://provisioning-listener.invalid";
// The contract's code for an unexpected failure; its answer says nothing of the failure.
const INTERNAL_ERROR_CODE: PlatformProvisioningErrorCode = "internal_error";
const INTERNAL_ERROR_STATUS = PLATFORM_PROVISIONING_ERROR_STATUS[INTERNAL_ERROR_CODE];

/**
 * The private listener's request handler. In order: the socket peer must be
 * in the allowlist (403 `forbidden`, before the body is read); the source's
 * rate limit (429); `POST /provisioning/<http operation>` (404
 * `operation_unavailable`); no `Origin` header (403 `forbidden`: no browser
 * callers); a valid Bearer token (401); a JSON body of at most 64 KiB (400 or
 * 413, `invalid_input`); then the operation, as the website's service identity
 * from that peer. Each request logs one line: operation, status, error code
 * and duration, never a header or the body.
 */
export function createProvisioningRequestHandler(deps: ProvisioningRequestDeps): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const startedMs = performance.now();
    const outcome: Outcome = { operation: null, status: INTERNAL_ERROR_STATUS, code: INTERNAL_ERROR_CODE };
    handle(request, response, deps, outcome)
      .catch(() => {
        /* best-effort: the failure is answered as a generic 500 and logged as internal_error; its detail is never logged, since it may carry request data */
        outcome.status = INTERNAL_ERROR_STATUS;
        outcome.code = INTERNAL_ERROR_CODE;
        answerInternalError(response);
      })
      .finally(() => {
        deps.log(formatRequestLogLine({ operation: outcome.operation, status: outcome.status, code: outcome.code, durationMs: performance.now() - startedMs }));
      });
  };
}

async function handle(request: IncomingMessage, response: ServerResponse, deps: ProvisioningRequestDeps, outcome: Outcome): Promise<void> {
  const peer = normalizePeerAddress(request.socket.remoteAddress);
  if (peer === null || !deps.allowlist.allows(peer)) {
    refuse(response, outcome, "forbidden", "The source address may not call the provisioning listener.", { close: true });
    return;
  }
  if (!deps.rateLimiter.take(peer)) {
    refuse(response, outcome, "rate_limited", "Too many provisioning requests from this source.", { close: true, retryAfterSeconds: deps.retryAfterSeconds });
    return;
  }
  const operation = request.method === "POST" ? provisioningOperationForHttpPath(pathOf(request.url)) : null;
  if (operation === null) {
    refuse(response, outcome, "operation_unavailable", "No such provisioning operation over HTTP.", { close: true });
    return;
  }
  outcome.operation = operation;
  if (request.headers.origin !== undefined) {
    refuse(response, outcome, "forbidden", "The provisioning listener does not serve browsers.", { close: true });
    return;
  }
  const token = readBearerToken(request.headers.authorization);
  if (token === null || !(await deps.tokens.verify(token))) {
    refuse(response, outcome, "unauthorized", "A valid Bearer token is required.", { close: true, bearerChallenge: true });
    return;
  }
  if (!isJsonContentType(request.headers["content-type"])) {
    refuse(response, outcome, "invalid_input", "The body must be application/json.", { close: true });
    return;
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    outcome.status = body.status;
    outcome.code = "invalid_input";
    writeProvisioningAnswer(response, body.status, { ok: false, error: { code: "invalid_input", message: body.message } }, { close: body.close });
    return;
  }
  const services = await deps.getServices();
  const answer = await services.provisioning.run(operation, body.value, services.provisionerCaller(peer));
  outcome.status = answer.ok ? 200 : PLATFORM_PROVISIONING_ERROR_STATUS[answer.error.code];
  outcome.code = answer.ok ? null : answer.error.code;
  writeProvisioningAnswer(response, outcome.status, answer);
}

function refuse(response: ServerResponse, outcome: Outcome, code: PlatformProvisioningErrorCode, message: string, headers: ProvisioningAnswerHeaders): void {
  outcome.status = PLATFORM_PROVISIONING_ERROR_STATUS[code];
  outcome.code = code;
  writeProvisioningAnswer(response, outcome.status, { ok: false, error: { code, message } }, headers);
}

/** A generic `internal_error` (500): nothing about the failure reaches the caller or the log. */
function answerInternalError(response: ServerResponse): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  writeProvisioningAnswer(response, INTERNAL_ERROR_STATUS, { ok: false, error: { code: INTERNAL_ERROR_CODE, message: "The provisioning request could not be completed." } }, { close: true });
}

function pathOf(url: string | undefined): string {
  if (url === undefined || !URL.canParse(url, PARSE_BASE)) return "";
  return new URL(url, PARSE_BASE).pathname;
}

function isJsonContentType(header: string | undefined): boolean {
  const type = header?.split(";")[0]?.trim().toLowerCase();
  return type === "application/json";
}

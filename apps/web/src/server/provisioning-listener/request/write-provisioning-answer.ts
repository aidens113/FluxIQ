import type { ServerResponse } from "node:http";

/** Headers an answer adds beyond the fixed ones. */
export type ProvisioningAnswerHeaders = {
  /** Close the connection after the answer (a refusal sent before the body was read). */
  close?: boolean;
  retryAfterSeconds?: number;
  bearerChallenge?: boolean;
};

/**
 * Writes one JSON answer with `cache-control: no-store`. It never sets a
 * cookie or any CORS header: the listener has no browser callers.
 */
export function writeProvisioningAnswer(response: ServerResponse, status: number, payload: unknown, headers: ProvisioningAnswerHeaders = {}): void {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(body, "utf8"));
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  if (headers.close === true) response.setHeader("connection", "close");
  if (headers.retryAfterSeconds !== undefined) response.setHeader("retry-after", String(headers.retryAfterSeconds));
  if (headers.bearerChallenge === true) response.setHeader("www-authenticate", "Bearer");
  response.end(body);
}

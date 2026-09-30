/**
 * Why a client-gateway WebSocket never reached OPEN.
 *
 * - `open_timeout`: nothing happened before the open deadline -- a gateway that
 *   accepted the connection and never answered the upgrade, or a socket the
 *   browser never started. Before this deadline existed, `connect()` waited on
 *   such a socket for ever, and every caller awaiting it hung with it.
 * - `open_failed`: the socket reported an error before it opened.
 * - `closed_before_open`: the socket closed (by either side) before it opened.
 */
export type FluxIQClientGatewayOpenFailure = "open_timeout" | "open_failed" | "closed_before_open";

/** The failure `FluxIQClientGatewayWebSocketClient.connect` rejects with when its socket never opens. */
export class FluxIQClientGatewayOpenError extends Error {
  readonly code: FluxIQClientGatewayOpenFailure;
  /** The deadline that expired, on `open_timeout` only. */
  readonly timeoutMs: number | undefined;

  constructor(code: FluxIQClientGatewayOpenFailure, options: { timeoutMs?: number; cause?: unknown } = {}) {
    super(openFailureMessage(code, options.timeoutMs), options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "FluxIQClientGatewayOpenError";
    this.code = code;
    this.timeoutMs = options.timeoutMs;
  }
}

function openFailureMessage(code: FluxIQClientGatewayOpenFailure, timeoutMs: number | undefined): string {
  if (code === "open_timeout") return `FluxIQ client gateway WebSocket did not open within ${timeoutMs ?? 0} ms (open_timeout).`;
  if (code === "closed_before_open") return "FluxIQ client gateway WebSocket closed before it opened (closed_before_open).";
  return "FluxIQ client gateway WebSocket failed to open (open_failed).";
}

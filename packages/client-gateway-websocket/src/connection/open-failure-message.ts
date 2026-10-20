import { FluxIQClientGatewayOpenError } from "../open-error.ts";

/**
 * What a person, and the Lab, read as the last error when a socket never
 * opened: the reason by name, so a connect that used to hang says which way it
 * ended. The Lab matches these strings; change them only together with it.
 */
export function clientGatewayOpenFailureMessage(error: unknown): string {
  if (!(error instanceof FluxIQClientGatewayOpenError)) return "WebSocket connection failed.";
  if (error.code === "open_timeout") return `FluxIQ did not open the connection within ${Math.max(1, Math.round((error.timeoutMs ?? 0) / 1000))} s (open_timeout).`;
  if (error.code === "closed_before_open") return "FluxIQ closed the connection before it opened (closed_before_open).";
  return "FluxIQ refused or dropped the connection before it opened (open_failed).";
}

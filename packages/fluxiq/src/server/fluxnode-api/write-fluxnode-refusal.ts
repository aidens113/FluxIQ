import type { ServerResponse } from "node:http";
import { FLUXNODE_ERROR_HTTP_STATUS, type FluxNodeErrorBody } from "@fluxiq/contracts/fluxnode";
import type { FluxNodeHttpRefusal } from "./http-refusal.ts";

/** Answers a refused call in the contracts' error body shape. Never sets an Access-Control header. */
export function writeFluxNodeRefusal(response: ServerResponse, refusal: FluxNodeHttpRefusal): void {
  const body: FluxNodeErrorBody = {
    error: {
      code: refusal.code,
      message: refusal.message,
      ...(refusal.issues && refusal.issues.length > 0 ? { issues: refusal.issues.slice(0, 200) } : {})
    }
  };
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store", ...refusal.headers };
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(refusal.status ?? FLUXNODE_ERROR_HTTP_STATUS[refusal.code], headers);
  response.end(JSON.stringify(body));
}

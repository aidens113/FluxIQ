import type { IncomingMessage, ServerResponse } from "node:http";
import { KeySessionError, type KeySessionService } from "../../platform/keys/index.ts";
import { readProofBody } from "./read-proof-body.ts";

function write(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    pragma: "no-cache",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

/** Thin injected Node handler. Importing this module never starts a listener or enables open-mode authentication. */
export function keysApiHandler(service: Pick<KeySessionService, "exchange">) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url ?? "/", "http://keys.invalid");
      if (url.pathname !== "/api/keys/session" || url.search !== "") {
        write(response, 404, { error: { code: "key.not_found", message: "The requested endpoint does not exist." } });
        return;
      }
      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        write(response, 405, { error: { code: "key.method_not_allowed", message: "This endpoint requires POST." } });
        return;
      }
      const contentType = request.headers["content-type"];
      if (request.headers["fluxiq-client"] !== "sdk" || typeof contentType !== "string" || contentType.split(";", 1)[0]?.trim().toLowerCase() !== "application/json" || (request.headers["content-encoding"] !== undefined && request.headers["content-encoding"] !== "identity")) {
        throw new KeySessionError("key.bad_proof");
      }
      const result = await service.exchange(await readProofBody(request));
      write(response, 200, result);
    } catch (error) {
      if (response.destroyed || response.headersSent) return;
      if (error instanceof KeySessionError) {
        if (error.status === 400) response.setHeader("connection", "close");
        write(response, error.status, { error: { code: error.code, message: error.message, serverTime: error.serverTime } });
      } else {
        write(response, 503, { error: { code: "key.unavailable", message: "Key authentication is temporarily unavailable." } });
      }
    }
  };
}

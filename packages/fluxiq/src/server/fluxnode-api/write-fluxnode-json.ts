import type { ServerResponse } from "node:http";

/** Answers a success: the contracts' body as JSON. */
export function writeFluxNodeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

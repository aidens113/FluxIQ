import type { ProgramRouteResponse } from "../program-route/index.ts";

/** The same JSON answer for the native HTTP server and Next route adapters. */
export function uploadResponse(status: number, body: unknown): ProgramRouteResponse {
  return { status, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

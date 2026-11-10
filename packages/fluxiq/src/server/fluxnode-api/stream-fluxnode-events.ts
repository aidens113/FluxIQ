import type { ServerResponse } from "node:http";
import { FLUXNODE_EVENT_STREAM, formatFluxNodeEventFrame, type FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";

/**
 * Writes a run's events as server-sent events until `ended` (then ends the response) or
 * until the client goes away (then the iteration's signal aborts; the run goes on). A
 * quiet stream sends a comment every `keepAliveMs` so proxies and clients keep it open.
 */
export async function streamFluxNodeEvents(
  response: ServerResponse,
  events: AsyncIterable<FluxNodeRunEvent>,
  controller: AbortController,
  keepAliveMs: number
): Promise<void> {
  response.writeHead(200, { "content-type": FLUXNODE_EVENT_STREAM.contentType, "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
  response.flushHeaders();
  const gone = (): void => controller.abort();
  response.on("close", gone);
  const timer = setInterval(() => {
    if (!response.writableEnded && !response.destroyed) response.write(": keep-alive\n\n");
  }, keepAliveMs);
  timer.unref();
  try {
    for await (const event of events) {
      if (controller.signal.aborted) break;
      if (!response.write(formatFluxNodeEventFrame(event))) await waitForDrain(response);
      if (event.type === "ended") break;
    }
  } finally {
    clearInterval(timer);
    response.off("close", gone);
    if (!response.writableEnded && !response.destroyed) response.end();
  }
}

function waitForDrain(response: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      response.off("drain", done);
      response.off("close", done);
      resolve();
    };
    response.once("drain", done);
    response.once("close", done);
  });
}

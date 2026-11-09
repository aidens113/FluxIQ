// Follows a run's events from the start (or after a sequence number), reconnecting
// with the last id seen when the stream drops, until the `ended` event arrives.

import { FLUXNODE_EVENT_STREAM, type FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import { SdkError } from "../errors/index.ts";
import { readEventStream } from "./read-event-stream.ts";
import type { Transport } from "./transport.ts";

const MAX_RECONNECTS = 5;

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/** Yields every event of the run at `eventsPath`, in order and once each, ending after `ended`. */
export async function* followRun(transport: Transport, eventsPath: string, options: { after?: number; signal?: AbortSignal } = {}): AsyncGenerator<FluxNodeRunEvent> {
  let last = options.after ?? 0;
  let failures = 0;
  for (;;) {
    try {
      const separator = eventsPath.includes("?") ? "&" : "?";
      const headers = { accept: FLUXNODE_EVENT_STREAM.contentType, [FLUXNODE_EVENT_STREAM.lastEventIdHeader]: String(last) };
      const response = await transport.open(`${eventsPath}${separator}${FLUXNODE_EVENT_STREAM.afterQuery}=${last}`, headers, options.signal);
      if (response.body === null) throw new SdkError("connection", "The event stream has no body.");
      for await (const event of readEventStream(response.body)) {
        if (event.seq <= last) continue;
        last = event.seq;
        failures = 0;
        yield event;
        if (event.type === "ended") return;
      }
    } catch (error) {
      const dropped = error instanceof TypeError || (error instanceof SdkError && error.code === "connection");
      if (options.signal?.aborted === true || !dropped) throw error;
    }
    failures += 1;
    if (failures > MAX_RECONNECTS) {
      throw new SdkError("stream_lost", `The event stream ended before the run did, and ${MAX_RECONNECTS} reconnects did not recover it.`, { hint: "The run keeps going in the engine; follow it with `fluxiq inspect <runId>`." });
    }
    await wait(150 * failures, options.signal);
  }
}

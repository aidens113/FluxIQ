// Reads a server-sent event stream into the contracts' run events, one frame at a time.

import { parseFluxNodeEventFrame, type FluxNodeRunEvent } from "@fluxiq/contracts/fluxnode";
import { SdkError } from "../errors/index.ts";

const FRAME_END = /\r?\n\r?\n/u;

function isHeartbeat(frame: string): boolean {
  return frame.split(/\r\n|\r|\n/u).every((line) => line === "" || line.startsWith(":"));
}

/** Yields each event of `body`; ends when the server closes the stream. A frame the contracts refuse is an error. */
export async function* readEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<FluxNodeRunEvent> {
  const decoder = new TextDecoder();
  const reader = body.getReader();
  let buffered = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      let boundary = FRAME_END.exec(buffered);
      while (boundary !== null) {
        const frame = buffered.slice(0, boundary.index);
        buffered = buffered.slice(boundary.index + boundary[0].length);
        if (!isHeartbeat(frame)) {
          const parsed = parseFluxNodeEventFrame(frame);
          if (!parsed.ok) throw new SdkError("protocol", `The event stream sent a frame the FluxNode API does not describe: ${parsed.issues.map((issue) => issue.message).join("; ")}`, { issues: parsed.issues });
          yield parsed.value;
        }
        boundary = FRAME_END.exec(buffered);
      }
    }
  } finally {
    await reader.cancel();
  }
}

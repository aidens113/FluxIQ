// GET runs/{runId}/events: a run's events as server-sent events. Each frame's `id` is
// the event's `seq` and its `event` the event's `type`, so a client that reconnects
// with `Last-Event-ID` (or `?after=<seq>`) gets every event after the last it saw.
// The stream closes after the `ended` event.

import { parseWithZod, type FluxNodeParseResult } from "../issue/index.ts";
import { fluxNodeRunEventSchema, type FluxNodeRunEvent } from "../run/index.ts";

/** The stream's content type, the reconnect header, and the query parameter that does the same. */
export const FLUXNODE_EVENT_STREAM = Object.freeze({
  contentType: "text/event-stream",
  lastEventIdHeader: "Last-Event-ID",
  afterQuery: "after"
} as const);

/** One event as a server-sent event frame, ending in the blank line that closes it. */
export function formatFluxNodeEventFrame(event: FluxNodeRunEvent): string {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Reads one frame (the text between blank lines) back into an event. Comment lines
 * (starting ":") are ignored, several `data:` lines are joined by newlines, and the
 * frame's `id` and `event`, when given, must agree with the event.
 */
export function parseFluxNodeEventFrame(frame: string): FluxNodeParseResult<FluxNodeRunEvent> {
  let id: string | undefined;
  let type: string | undefined;
  const data: string[] = [];
  for (const line of frame.split(/\r\n|\r|\n/u)) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /u, "");
    if (field === "id") id = value;
    else if (field === "event") type = value;
    else if (field === "data") data.push(value);
  }
  if (data.length === 0) return { ok: false, issues: [{ path: "", code: "event_frame.no_data", message: "The frame has no data line." }] };
  let body: unknown;
  try {
    body = JSON.parse(data.join("\n"));
  } catch (error) {
    return { ok: false, issues: [{ path: "", code: "event_frame.not_json", message: `The frame's data is not JSON: ${error instanceof Error ? error.message : "unreadable"}.` }] };
  }
  const parsed = parseWithZod(fluxNodeRunEventSchema, body);
  if (!parsed.ok) return parsed;
  if (id !== undefined && id !== String(parsed.value.seq)) return { ok: false, issues: [{ path: "/seq", code: "event_frame.id_mismatch", message: `The frame's id ${id} is not the event's seq ${parsed.value.seq}.` }] };
  if (type !== undefined && type !== parsed.value.type) return { ok: false, issues: [{ path: "/type", code: "event_frame.type_mismatch", message: `The frame's event "${type}" is not the event's type "${parsed.value.type}".` }] };
  return parsed;
}

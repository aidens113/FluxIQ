// The server messages a replay step is expected to send (traces and offline
// trials, P3): the recorded outbound messages from the step's own event up to
// the next input or command only a caller issues, which starts the next step.
// Core may send any number of replies in between, so they belong to this step.

import type { ClientGatewayTraceEvent } from "../../trace/index.ts";
import { readClientGatewayTraceMessageStamp } from "./message-stamp.ts";
import type { ClientGatewayTraceReplayMessageStamp } from "./sources.ts";

/** Commands a caller issues: never derived by Core, so each starts a step of its own. */
const ISSUED_ONLY_BY_CALLERS: ReadonlySet<string> = new Set(["server.execute_action", "server.start_recording", "server.stop_recording", "server.capture_snapshot", "server.ping"]);

export function clientGatewayTraceStepMessages(events: readonly ClientGatewayTraceEvent[], index: number): ClientGatewayTraceReplayMessageStamp[] {
  const messages: ClientGatewayTraceReplayMessageStamp[] = [];
  for (let at = index; at < events.length; at += 1) {
    const event = events[at];
    if (event === undefined || (at > index && startsStep(event))) break;
    const stamp = event.kind === "outbound" ? readClientGatewayTraceMessageStamp(event) : undefined;
    if (stamp !== undefined) messages.push(stamp);
  }
  return messages;
}

function startsStep(event: ClientGatewayTraceEvent): boolean {
  if (event.kind === "inbound" || event.kind === "artifact") return true;
  return event.kind === "outbound" && event.messageType !== null && ISSUED_ONLY_BY_CALLERS.has(event.messageType);
}

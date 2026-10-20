// The id and time stamp of a server message a recorded outbound event holds
// (traces and offline trials, P3): what a replay feeds back so the message
// Core rebuilds carries them again.

import type { ClientGatewayTraceEvent } from "../../trace/index.ts";
import type { ClientGatewayTraceReplayMessageStamp } from "./sources.ts";

/** `undefined` when the event holds no message with an id. */
export function readClientGatewayTraceMessageStamp(event: ClientGatewayTraceEvent): ClientGatewayTraceReplayMessageStamp | undefined {
  const message = event.payload.encoding === "json" ? event.payload.value : null;
  if (typeof message !== "object" || message === null || Array.isArray(message)) return undefined;
  const id = "id" in message ? message.id : undefined;
  const timestamp = "timestamp" in message ? message.timestamp : undefined;
  if (typeof id !== "string") return undefined;
  return { id, timestamp: typeof timestamp === "number" ? timestamp : null };
}

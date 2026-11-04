// A trace's commands and their answers, read off its events: every recorded
// `server.execute_action` in delivery order, each with the `client.action_result`
// that names it. Read the same way from an exploration and from a Flow's live run.
//
// `firstChild` is where the trace first opened a child episode: a build's first
// trial. Everything before it is the closest thing a saved build has to one
// exploration.

import { readClientGatewayTraceOperation, type ClientGatewayTraceRecordedPayload } from "../trace-matcher/index.ts";
import { readClientGatewayTraceInboundText } from "../trace-replay/index.ts";
import type { ClientGatewayTraceEvent } from "../trace/index.ts";
import type { ClientGatewayTraceStateRecordedCall } from "./types.ts";

export type ClientGatewayTraceStateRecordedCalls = {
  readonly calls: readonly ClientGatewayTraceStateRecordedCall[];
  readonly firstChild: number | null;
};

export function clientGatewayTraceStateRecordedCalls(events: readonly ClientGatewayTraceEvent[]): ClientGatewayTraceStateRecordedCalls {
  const calls: Mutable[] = [];
  const byCommand = new Map<string, Mutable>();
  let firstChild: number | null = null;
  for (const event of events) {
    if (event.kind === "control" && event.messageType === "control.child_episode_opened" && firstChild === null) firstChild = event.sequence;
    if (event.kind === "outbound" && event.messageType === "server.execute_action") {
      const message = event.payload.encoding === "json" ? event.payload.value : null;
      const payload = isRecord(message) ? message.payload : null;
      const operation = readClientGatewayTraceOperation(payload);
      const commandId = isRecord(payload) ? payload.commandId : undefined;
      const metadata = isRecord(payload) ? payload.metadata : undefined;
      const callId = isRecord(metadata) && typeof metadata.callId === "string" ? metadata.callId : null;
      const call: Mutable = { ordinal: calls.length, sequence: event.sequence, operation, callId, answer: null, latencyMs: null, redacted: event.redactions.length > 0, issuedAt: event.time.logicalMs };
      calls.push(call);
      if (typeof commandId === "string") byCommand.set(commandId, call);
      continue;
    }
    if (event.kind !== "inbound" || event.messageType !== "client.action_result") continue;
    const read = readClientGatewayTraceInboundText(event);
    if ("gap" in read) {
      const held = event.correlation.commandId === null ? undefined : byCommand.get(event.correlation.commandId);
      if (held) held.redacted = true;
      continue;
    }
    const payload = answerPayload(read.text);
    if (payload === undefined) continue;
    const call = typeof payload.commandId === "string" ? byCommand.get(payload.commandId) : undefined;
    if (call === undefined || call.answer !== null) continue;
    call.answer = payload;
    call.latencyMs = event.time.logicalMs - call.issuedAt;
    if (event.redactions.length > 0) call.redacted = true;
  }
  return { calls: calls.map(({ issuedAt: _issuedAt, ...call }) => Object.freeze(call)), firstChild };
}

type Mutable = {
  ordinal: number;
  sequence: number;
  operation: ClientGatewayTraceStateRecordedCall["operation"];
  callId: string | null;
  answer: ClientGatewayTraceRecordedPayload | null;
  latencyMs: number | null;
  redacted: boolean;
  issuedAt: number;
};

function answerPayload(text: string): ClientGatewayTraceRecordedPayload | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  if (!isRecord(value)) return undefined;
  return isRecord(value.payload) ? value.payload : undefined;
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

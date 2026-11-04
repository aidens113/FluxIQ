// Reading a trace's commands and answers, and telling Core's bookkeeping from the model's calls.

import { describe, expect, it } from "vitest";
import type { ClientGatewayTraceEvent } from "../../trace/index.ts";
import { clientGatewayTraceStateIsBookkeepingCall } from "../bookkeeping-calls.ts";
import { clientGatewayTraceStateRecordedCalls } from "../recorded-calls.ts";

function event(sequence: number, kind: ClientGatewayTraceEvent["kind"], messageType: string | null, payload: ClientGatewayTraceEvent["payload"], logicalMs = sequence, more: Partial<ClientGatewayTraceEvent> = {}): ClientGatewayTraceEvent {
  return {
    traceId: "trace", eventId: `event-${sequence}`, stream: "gateway", sequence, source: { id: null, sequence: null },
    time: { logicalMs, observedAt: "2026-01-01T00:00:00.000Z", sourceTimestamp: null }, kind, messageType,
    correlation: { commandId: null, recordingId: null, causationEventId: null, owner: null, observationRevision: null, baseRevision: null },
    payloadSchema: null, payload, artifactIds: [], referencedDigests: [], provenance: { episodeId: "episode", origin: "live" }, redactions: [], ...more
  };
}

const command = (sequence: number, commandId: string, actionType: string, callId?: string): ClientGatewayTraceEvent =>
  event(sequence, "outbound", "server.execute_action", { encoding: "json", value: { payload: { commandId, actionType, parameters: {}, ...(callId ? { metadata: { callId } } : {}) } } });

const answer = (sequence: number, commandId: string, status: string, logicalMs: number): ClientGatewayTraceEvent =>
  event(sequence, "inbound", "client.action_result", { encoding: "text", text: JSON.stringify({ payload: { commandId, status } }) }, logicalMs);

describe("a trace's recorded calls", () => {
  it("pairs each command with its answer and the wait between them, and finds the first child episode", () => {
    const { calls, firstChild } = clientGatewayTraceStateRecordedCalls([
      command(1, "c1", "scan", "site-reset.read.1"),
      answer(2, "c1", "ok", 12),
      event(3, "control", "control.child_episode_opened", { encoding: "json", value: {} }),
      command(4, "c2", "pick"),
      answer(5, "c2", "failed", 20),
      event(6, "control", "control.child_episode_opened", { encoding: "json", value: {} })
    ]);
    expect(firstChild).toBe(3);
    expect(calls.map((call) => [call.ordinal, call.operation.actionType, call.callId, call.answer?.status, call.latencyMs])).toEqual([
      [0, "scan", "site-reset.read.1", "ok", 11],
      [1, "pick", null, "failed", 16]
    ]);
  });

  it("keeps a command with no answer, with no answer", () => {
    const { calls } = clientGatewayTraceStateRecordedCalls([command(1, "c1", "scan")]);
    expect(calls[0]).toMatchObject({ answer: null, latencyMs: null, redacted: false });
  });

  it("marks a call whose answer was withheld at capture", () => {
    const withheld = event(2, "inbound", "client.action_result", { encoding: "json", value: { payload: {} } }, 2, {
      redactions: [{ path: "payload.text", reason: "sensitive" }] as unknown as ClientGatewayTraceEvent["redactions"],
      correlation: { commandId: "c1", recordingId: null, causationEventId: null, owner: null, observationRevision: null, baseRevision: null }
    });
    const { calls } = clientGatewayTraceStateRecordedCalls([command(1, "c1", "scan"), withheld]);
    expect(calls[0]).toMatchObject({ answer: null, redacted: true });
  });
});

describe("Core's bookkeeping calls", () => {
  it("are named by their prefixes, and nothing else is", () => {
    for (const callId of ["site-reset.read.3", "result-check.end-view.1", "dryrun.1.2", "rerun.1", "dryrun.1.2.pass.3"]) expect(clientGatewayTraceStateIsBookkeepingCall(callId)).toBe(true);
    for (const callId of [null, "initial.core.run_node", "read_people", "rerunner", "look.feed.1"]) expect(clientGatewayTraceStateIsBookkeepingCall(callId)).toBe(false);
  });
});

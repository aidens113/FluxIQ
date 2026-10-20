// P3: a recorded synthetic session replays through a fresh gateway's own
// intake to `matched`; a mutated recorded input diverges, classified, at the
// delivery point that derived from it; a removed event is a capture gap; and
// the fed ids and clock make every outbound message byte-equal to the
// recorded one once the replay's session id is translated.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayCommandContext,
  ClientGatewayService,
  ClientGatewayTraceMemoryStore,
  ClientGatewayTraceReplayLedger,
  replayClientGatewayTrace,
  type ClientGatewayTraceEvent,
  type ClientGatewayTraceParityReport
} from "../../index.ts";
import { clientMessage, ofKind, openTrace, pairClient, traceScope, waitFor, type OpenTrace } from "../../tests/trace-tap-support.ts";

const VERSION = JSON.stringify(CLIENT_GATEWAY_PROTOCOL_VERSION);
const OWNER = { projectId: "project.parity", runId: "run.parity" };
const BINDING = { projectId: "project.parity", runId: "run.parity", flowId: "flow.1", invocationId: "invoke.1", attemptId: "attempt.1", effectOrdinal: 0 };

type Recorded = { trace: OpenTrace; pressId: string };

/** Commands, a state update, an uploaded artifact, results, a parse failure, an answer that never came, a durable command and a disconnect, recorded live. */
async function recordSession(traceId: string): Promise<Recorded> {
  const scope = traceScope();
  const trace = openTrace(traceId);
  const ledger = new ClientGatewayTraceReplayLedger(Date.now);
  const gateway = new ClientGatewayService({ commandTimeoutMs: 25, trace: scope.source, commandOwner: () => OWNER, resolveCommandLedger: async () => ({ ledger, close: async () => undefined }) });
  const client = await pairClient(gateway, "client.parity");

  const press = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press", parameters: { value: 1 }, timeoutMs: 60_000, metadata: { reason: "kept" } }));
  await gateway.receiveRaw(client.sessionId, JSON.stringify(clientMessage("client.state_update", { state: { step: "one", nested: { list: [1, 2.5] } } })));
  const bytes = new TextEncoder().encode("<doc>observed</doc>");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  expect(gateway.receiveTraceArtifact(client.sessionId, { sha256, mediaType: "text/html", bytes })).toEqual({ status: "accepted", traces: 1 });
  const references = `{"artifacts":[{"sha256":"${sha256}","mediaType":"text/html","byteLength":${bytes.byteLength},"role":"primary"}],"unavailable":0}`;
  await gateway.receiveRaw(client.sessionId, `{"id":"result-1","type":"client.action_result","protocolVersion":${VERSION},"timestamp":1700000000000,"payload":{"commandId":"${press.commandId}","status":"succeeded","payload":{"count":0.0},"metadata":{"reason":"kept","trace":${references}}}}`);
  await expect(press.result).resolves.toMatchObject({ status: "succeeded" });

  await expect(gateway.receiveRaw(client.sessionId, "{\"type\":\"client.state_update\"")).rejects.toThrow();

  const waited = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.wait" }));
  await expect(waited.result).resolves.toMatchObject({ status: "timed_out" });

  const durable = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.save", timeoutMs: 60_000 }, { context: ClientGatewayCommandContext.issue(BINDING) }));
  await waitFor(() => client.sent.some((item) => item.type === "server.execute_action" && item.payload.commandId === durable.commandId));
  await gateway.receiveRaw(client.sessionId, JSON.stringify(clientMessage("client.action_result", { commandId: durable.commandId, status: "succeeded", payload: { saved: true } })));
  await expect(durable.result).resolves.toMatchObject({ status: "completed" });

  gateway.disconnect(client.sessionId, "socket closed");
  await trace.recorder.close({ terminationReason: "completed", terminationDetail: null });
  await gateway.close();
  return { trace, pressId: press.commandId };
}

async function recordedEvents(trace: OpenTrace): Promise<readonly ClientGatewayTraceEvent[]> {
  return trace.store.readEventRange(trace.traceId, 1, Number.MAX_SAFE_INTEGER);
}

/** A copy of `trace`'s store whose events went through `change` (`null` removes one). */
async function copiedStore(trace: OpenTrace, change: (event: ClientGatewayTraceEvent) => ClientGatewayTraceEvent | null): Promise<ClientGatewayTraceMemoryStore> {
  const copy = new ClientGatewayTraceMemoryStore();
  for (const artifact of await trace.store.listArtifacts(trace.traceId)) {
    const bytes = await trace.store.readArtifact(trace.traceId, artifact.id);
    if (bytes !== undefined) await copy.writeArtifact(trace.traceId, artifact.id, bytes);
  }
  const kept: ClientGatewayTraceEvent[] = [];
  for (const event of await recordedEvents(trace)) {
    const changed = change(event);
    if (changed !== null) kept.push(changed);
  }
  await copy.appendEvents(trace.traceId, kept);
  const manifest = await trace.store.readManifest(trace.traceId);
  if (manifest === undefined) throw new Error("the recorded trace has no manifest");
  await copy.writeManifest(manifest);
  return copy;
}

function summary(report: ClientGatewayTraceParityReport): unknown {
  return report.divergences.map((divergence) => ({ sequence: divergence.sequence, class: divergence.class, fields: divergence.fields, detail: divergence.detail }));
}

describe("replaying a recorded session through the gateway's own intake", () => {
  it("matches the recording at every delivery point", async () => {
    const { trace } = await recordSession("trace.parity.matched");
    const events = await recordedEvents(trace);
    expect(events.map((event) => `${event.kind}:${event.messageType ?? ""}`)).toEqual([
      "lifecycle:session.claimed",
      "outbound:server.execute_action",
      "inbound:client.state_update",
      "disposition:client.state_update",
      "artifact:",
      "inbound:client.action_result",
      "disposition:client.action_result",
      "inbound:",
      "disposition:",
      "outbound:server.execute_action",
      "synthesized:server.execute_action",
      "outbound:server.execute_action",
      "inbound:client.action_result",
      "disposition:client.action_result",
      "lifecycle:session.disconnected"
    ]);
    expect(new Set(events.map((event) => event.session))).toEqual(new Set(["session-1", undefined]));

    const report = await replayClientGatewayTrace({ store: trace.store, traceId: trace.traceId });

    expect(summary(report)).toEqual([]);
    expect(report.verdict).toBe("matched");
    expect(report.entries.map((entry) => entry.status)).toEqual(events.map(() => "matched"));
    expect(report.normalizations.map((normalization) => normalization.field)).toEqual(expect.arrayContaining(["session ids in payloads", "payload of an inbound message that did not parse"]));
    expect(report.replayEvents).toHaveLength(events.length);
    expect(report.replayEvents.every((event) => event.provenance.origin === "derived")).toBe(true);
  });

  it("re-sends every outbound message byte for byte, once the replay's session id is translated", async () => {
    const { trace } = await recordSession("trace.parity.bytes");
    const report = await replayClientGatewayTrace({ store: trace.store, traceId: trace.traceId });
    const recorded = ofKind(await recordedEvents(trace), "outbound");
    const replayed = ofKind(report.replayEvents, "outbound");
    expect(replayed).toHaveLength(recorded.length);
    for (const [index, event] of recorded.entries()) {
      const original = event.payload.encoding === "json" ? event.payload.value : null;
      const again = replayed[index]?.payload;
      const replay = again?.encoding === "json" ? again.value : null;
      if (!isEnvelope(original) || !isEnvelope(replay)) throw new Error("an outbound event carries no message");
      expect(replay.id).toBe(original.id);
      expect(replay.timestamp).toBe(original.timestamp);
      expect(JSON.stringify(replay).replaceAll(replay.sessionId, original.sessionId)).toBe(JSON.stringify(original));
    }
  });

  it("classifies a mutated recorded input as a divergence at the delivery point that derived from it", async () => {
    const { trace, pressId } = await recordSession("trace.parity.mutated");
    const mutated = await copiedStore(trace, (event) => {
      if (event.kind !== "inbound" || event.payload.encoding !== "text" || event.correlation.commandId !== pressId) return event;
      return { ...event, payload: { encoding: "text", text: event.payload.text.replace("\"status\":\"succeeded\"", "\"status\":\"failed\"") } };
    });
    const report = await replayClientGatewayTrace({ store: mutated, traceId: trace.traceId });

    expect(report.verdict).toBe("diverged");
    expect(summary(report)).toEqual([
      { sequence: 7, class: "intake_defect", fields: ["payload.value.delivered.result", "payload.value.delivered.event"], detail: expect.stringContaining("the same input, a different derivation") }
    ]);
  });

  it("compares what Core synthesized: a different answer wait is a different derivation of the same inputs", async () => {
    const { trace } = await recordSession("trace.parity.wait");
    const report = await replayClientGatewayTrace({ store: trace.store, traceId: trace.traceId, commandTimeoutMs: 99 });

    expect(summary(report)).toEqual([
      { sequence: 11, class: "intake_defect", fields: ["payload.value.waitMs", "payload.value.result.message"], detail: expect.stringContaining("the same input, a different derivation") }
    ]);
  });

  it("reports a removed event, and what it caused, as a capture gap", async () => {
    const { trace } = await recordSession("trace.parity.removed");
    const removed = await copiedStore(trace, (event) => (event.sequence === 3 ? null : event));
    const report = await replayClientGatewayTrace({ store: removed, traceId: trace.traceId });

    expect(report.verdict).toBe("diverged");
    expect(summary(report)).toEqual([
      { sequence: 3, class: "capture_gap", fields: ["event"], detail: "sequence 3 is missing from the trace" },
      { sequence: 4, class: "capture_gap", fields: ["event"], detail: "the message it answers is missing from the trace" }
    ]);
    expect(report.entries.filter((entry) => entry.status === "matched")).toHaveLength(13);
  });
});

type Envelope = { readonly id: string; readonly timestamp: number; readonly sessionId: string };

function isEnvelope(value: unknown): value is Envelope {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return "id" in value && typeof value.id === "string" && "timestamp" in value && typeof value.timestamp === "number" && "sessionId" in value && typeof value.sessionId === "string";
}

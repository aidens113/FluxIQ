// What a traced result's artifact references become in the trace (traces and
// offline trials, P2): the digests a client says it uploaded land on the
// inbound event that carried them, malformed ones are ignored, consumers still
// never see them, the action stamp names the trace it is recorded into, and a
// trace referencing an artifact that only another trace received reads as
// missing evidence, never complete.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  ClientGatewayService,
  evaluateClientGatewayTraceCompleteness,
  type ClientGatewayClientMessage,
  type ClientGatewayEvent,
  type ClientGatewayServerMessage,
  type ClientGatewayTraceCompleteness,
  type ClientGatewayTraceSink
} from "../index.ts";
import { ClientGatewayTraceTap } from "../service/index.ts";
import { clientMessage, ofKind, openTrace, pairClient, traceScope, type OpenTrace } from "./trace-tap-support.ts";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function reference(sha256: string | number): { sha256: string | number; mediaType: string; byteLength: number; role: string } {
  return { sha256, mediaType: "text/html", byteLength: 6, role: "primary" };
}

async function closeAndEvaluate(trace: OpenTrace): Promise<ClientGatewayTraceCompleteness> {
  const manifest = await trace.recorder.close({ terminationReason: "completed", terminationDetail: null });
  return evaluateClientGatewayTraceCompleteness({
    manifest,
    events: await trace.store.readEventRange(trace.traceId, 1, manifest.completeness.lastSequence),
    availableArtifacts: await trace.store.listArtifacts(trace.traceId),
    compatibility: { status: "compatible" },
    recorderActive: false
  });
}

function stampOf(message: ClientGatewayServerMessage): unknown {
  if (message.type !== "server.execute_action") throw new Error(`expected an action command, got ${message.type}`);
  return message.payload.metadata?.trace;
}

describe("a traced result's artifact references", () => {
  it("land on the inbound event as well-formed digests only, the raw text unchanged, and no consumer sees them", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.references");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.references");
    const seen: ClientGatewayEvent[] = [];
    gateway.onEvent((event) => { seen.push(event); });
    const response = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    const good = "a".repeat(64);
    const artifacts = [reference(good), reference("A".repeat(64)), reference("abc"), reference(7), "not a reference", reference(good), reference("c".repeat(64))];
    const raw = JSON.stringify(clientMessage("client.action_result", { commandId: response.commandId, status: "succeeded", metadata: { kept: true, trace: { artifacts, unavailable: 0 } } }));
    await gateway.receiveRaw(client.sessionId, raw);

    const result = await response.result;
    expect(result.metadata).toEqual({ kept: true });
    expect(JSON.stringify(seen.find((event) => event.type === "client.action_result"))).not.toContain("\"trace\"");
    const events = await trace.events();
    const inbound = ofKind(events, "inbound", "client.action_result");
    expect(inbound[0]?.payload).toEqual({ encoding: "text", text: raw });
    expect(inbound[0]?.referencedDigests).toEqual([good, "c".repeat(64)]);
    expect(ofKind(events, "outbound", "server.execute_action")[0]?.referencedDigests).toEqual([]);
    expect(ofKind(events, "disposition", "client.action_result")[0]?.referencedDigests).toEqual([]);
    await gateway.close();
  });

  it("land on a reconcile answer's event from its landed result", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.reconcile");
    const tap = new ClientGatewayTraceTap({ source: scope.source, clientIdOf: () => undefined });
    const command: Extract<ClientGatewayServerMessage, { type: "server.execute_action" }> = {
      id: "m-1",
      type: "server.execute_action",
      protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      timestamp: 1,
      payload: { commandId: "c-1", actionType: "example.press" }
    };
    scope.within(trace.recorder, () => tap.stampAction(command, null));
    const answer: ClientGatewayClientMessage = clientMessage("client.reconcile_result", {
      commandId: "c-1",
      state: "landed",
      result: { commandId: "c-1", status: "succeeded", metadata: { trace: { artifacts: [{ sha256: "d".repeat(64), mediaType: "text/html", byteLength: 6, role: "primary" }], unavailable: 0 } } }
    });
    const capture = tap.inboundMessage("session-1", answer);
    expect(capture?.targets).toHaveLength(1);
    const events = await trace.events();
    expect(ofKind(events, "inbound", "client.reconcile_result")[0]?.referencedDigests).toEqual(["d".repeat(64)]);
  });
});

describe("the action stamp", () => {
  it("names the trace the command is recorded into as its scope, one scope per trace", async () => {
    const scope = traceScope();
    const first = openTrace("trace.scope.first");
    const second = openTrace("trace.scope.second");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.scope");
    const fromFirst = scope.within(first.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    const fromSecond = scope.within(second.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    expect(stampOf(fromFirst.message)).toEqual({ artifacts: true, scope: "trace.scope.first" });
    expect(stampOf(fromSecond.message)).toEqual({ artifacts: true, scope: "trace.scope.second" });
    await gateway.close();
  });

  it("is left off when the sink cannot say which trace it is, and the command still goes out", async () => {
    const scope = traceScope();
    const live = openTrace("trace.scope.unreadable");
    const unreadable: ClientGatewayTraceSink = {
      record: (input) => live.recorder.record(input),
      recordArtifact: (input) => live.recorder.recordArtifact(input),
      markCheckpoint: (input) => live.recorder.markCheckpoint(input),
      flush: () => live.recorder.flush(),
      close: (input) => live.recorder.close(input),
      status: () => { throw new Error("status unavailable"); }
    };
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.scope.unreadable");
    const response = scope.within(unreadable, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    expect(stampOf(response.message)).toBeUndefined();
    expect(client.sent.at(-1)).toEqual(response.message);
    await gateway.close();
  });
});

describe("an artifact referenced across two traces", () => {
  it("uploaded while only trace A claimed the session: A is complete, B referencing it reports it missing", async () => {
    const scope = traceScope();
    const traceA = openTrace("trace.a");
    const traceB = openTrace("trace.b");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.two-traces");
    const bytes = new TextEncoder().encode("<doc>observed</doc>");
    const sha256 = digest(bytes);
    const references = { artifacts: [reference(sha256)], unavailable: 0 };

    const inA = scope.within(traceA.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    expect(gateway.receiveTraceArtifact(client.sessionId, { sha256, mediaType: "text/html", bytes })).toEqual({ status: "accepted", traces: 1 });
    await gateway.receive(client.sessionId, clientMessage("client.action_result", { commandId: inA.commandId, status: "succeeded", metadata: { trace: references } }));
    await inA.result;
    const inB = scope.within(traceB.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    await gateway.receive(client.sessionId, clientMessage("client.action_result", { commandId: inB.commandId, status: "succeeded", metadata: { trace: references } }));
    await inB.result;

    const eventsB = await traceB.events();
    const resultB = ofKind(eventsB, "inbound", "client.action_result")[0];
    expect(resultB?.referencedDigests).toEqual([sha256]);
    const completenessA = await closeAndEvaluate(traceA);
    const completenessB = await closeAndEvaluate(traceB);
    expect(completenessA).toEqual({ status: "complete", issues: [], limitations: [] });
    expect(completenessB.status).toBe("incomplete");
    expect(completenessB.issues).toEqual([expect.objectContaining({ code: "missing_artifact", range: { from: resultB?.sequence, to: resultB?.sequence }, artifactId: null })]);
    await gateway.close();
  });
});

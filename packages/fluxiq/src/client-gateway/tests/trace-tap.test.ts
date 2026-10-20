// The gateway trace tap (traces and offline trials, P2; D7, D8, D12, D14):
// what a traced episode's trace receives from the gateway, how events are
// routed between two traces, the credential redaction, the action stamp and
// the result strip, and that an untraced gateway behaves exactly as before.

import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ClientGatewayService,
  type ClientGatewayActionResult,
  type ClientGatewayEvent,
  type ClientGatewayServerMessage,
  type ClientGatewayTraceSink
} from "../index.ts";
import { ClientGatewayCommandContext, ClientGatewayCommandLedgerController, ClientGatewayCommandOutcome, type ClientGatewayCommandLedgerPort, type ClientGatewayCommandRecord } from "../service/command-ledger/index.ts";
import { clientMessage, ofKind, openTrace, pairClient, traceScope, waitFor } from "./trace-tap-support.ts";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("the gateway trace tap, unset", () => {
  it("adds nothing: no stamp, no strip of other metadata, artifacts taken by no trace", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000 });
    const client = await pairClient(gateway, "client.inert");
    const response = gateway.executeAction(client.sessionId, { actionType: "example.press", metadata: { reason: "kept" } });
    expect(actionPayload(response.message).metadata).toEqual({ reason: "kept" });
    expect(client.sent.at(-1)).toEqual(response.message);
    await gateway.receive(client.sessionId, clientMessage("client.action_result", { commandId: response.commandId, status: "succeeded", metadata: { reason: "kept" } }));
    await expect(response.result).resolves.toMatchObject({ status: "succeeded", metadata: { reason: "kept" } });
    const bytes = new TextEncoder().encode("<doc/>");
    expect(gateway.receiveTraceArtifact(client.sessionId, { sha256: digest(bytes), mediaType: "text/plain", bytes })).toEqual({ status: "accepted", traces: 0 });
    await gateway.close();
  });

  it("with a source but outside every traced episode, records nothing and stamps nothing", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.idle");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.idle");
    const response = gateway.executeAction(client.sessionId, { actionType: "example.press" });
    expect(actionPayload(response.message)).not.toHaveProperty("metadata");
    await gateway.receive(client.sessionId, clientMessage("client.action_result", { commandId: response.commandId, status: "succeeded" }));
    await response.result;
    expect(await trace.events()).toEqual([]);
    await gateway.close();
  });
});

describe("the gateway trace tap, under a traced episode", () => {
  it("stamps the action it sends, records it, and strips the trace references off its result before anyone reads it", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.stamp");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source, commandOwner: () => ({ projectId: "project.1", runId: "run.1" }) });
    const client = await pairClient(gateway, "client.stamp");
    const seen: ClientGatewayEvent[] = [];
    gateway.onEvent((event) => { seen.push(event); });
    const response = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press", metadata: { reason: "kept" } }));

    expect(actionPayload(response.message).metadata).toEqual({ reason: "kept", trace: { artifacts: true, scope: "trace.stamp" } });
    expect(client.sent.at(-1)).toEqual(response.message);
    const references = { artifacts: [{ sha256: "a".repeat(64), mediaType: "text/html", byteLength: 6, role: "primary" }], unavailable: 0 };
    const raw = JSON.stringify(clientMessage("client.action_result", { commandId: response.commandId, status: "succeeded", metadata: { reason: "kept", trace: references } }));
    await gateway.receiveRaw(client.sessionId, raw);

    const result = await response.result;
    expect(result.metadata).toEqual({ reason: "kept" });
    const emitted = seen.find((event) => event.type === "client.action_result");
    expect(JSON.stringify(emitted)).not.toContain("\"trace\"");
    const events = await trace.events();
    const outbound = ofKind(events, "outbound", "server.execute_action");
    expect(outbound).toHaveLength(1);
    expect(outbound[0]?.correlation).toMatchObject({ commandId: response.commandId, owner: { projectId: "project.1", runId: "run.1" } });
    expect(outbound[0]?.payload).toEqual({ encoding: "json", value: response.message });
    const inbound = ofKind(events, "inbound", "client.action_result");
    expect(inbound[0]?.payload).toEqual({ encoding: "text", text: raw });
    const disposition = ofKind(events, "disposition", "client.action_result");
    expect(disposition[0]?.correlation.causationEventId).toBe(inbound[0]?.eventId);
    expect(disposition[0]?.payload).toEqual({ encoding: "json", value: { disposition: "settled", error: null } });
    await gateway.close();
  });

  it("drops a result's metadata when the trace references were all it held", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.only");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.only");
    const response = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    expect(actionPayload(response.message).metadata).toEqual({ trace: { artifacts: true, scope: "trace.only" } });
    await gateway.receive(client.sessionId, clientMessage("client.action_result", { commandId: response.commandId, status: "succeeded", metadata: { trace: { artifacts: [], unavailable: 1 } } }));
    const result: ClientGatewayActionResult = await response.result;
    expect(result).not.toHaveProperty("metadata");
    await gateway.close();
  });

  it("stamps a durable command after its digest and strips its result, so its receipt and outcome carry no trace", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.durable");
    const ledger = memoryLedger();
    const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invoke.1", attemptId: "attempt.1", effectOrdinal: 0 };
    const context = ClientGatewayCommandContext.issue(owner);
    const observer = { completed: vi.fn(async () => undefined), uncertain: vi.fn(async () => undefined) };
    ClientGatewayCommandOutcome.require(context, observer);
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source, resolveCommandLedger: async () => ({ ledger: ledger.port, outcomeObserver: observer, close: async () => undefined }) });
    const client = await pairClient(gateway, "client.durable");
    const response = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }, { context }));
    await waitFor(() => client.sent.some((item) => item.type === "server.execute_action"));
    const sent = client.sent.find((item) => item.type === "server.execute_action");
    expect(sent?.type === "server.execute_action" ? sent.payload.metadata : undefined).toEqual({ trace: { artifacts: true, scope: "trace.durable" } });
    expect(ledger.saved()?.claim.requestDigest).toBe(ClientGatewayCommandLedgerController.digest({ actionType: "example.press" }));

    await gateway.receive(client.sessionId, clientMessage("client.action_result", { commandId: response.commandId, status: "succeeded", metadata: { trace: { artifacts: [], unavailable: 0 } } }));
    const outcome = await response.result;
    expect(outcome).toMatchObject({ status: "completed" });
    expect(JSON.stringify(outcome)).not.toContain("\"trace\"");
    const events = await trace.events();
    expect(ofKind(events, "outbound", "server.execute_action")[0]?.correlation).toMatchObject({ commandId: response.commandId, owner });
    expect(ofKind(events, "disposition", "client.action_result")[0]?.payload).toEqual({ encoding: "json", value: { disposition: "settled", error: null } });
    await gateway.close();
  });

  it("records an in-process message as it was at entry, whatever happens to the live object afterwards (T04)", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.t04");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.t04");
    const response = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press", parameters: { value: "before" } }));
    const update = clientMessage("client.state_update", { state: { value: "before", nested: { list: [1, 2] } } });
    const original = JSON.stringify(update);
    await gateway.receive(client.sessionId, update);
    update.payload.state = { value: "after" };
    actionPayload(response.message).parameters = { value: "after" };

    const events = await trace.events();
    expect(ofKind(events, "inbound", "client.state_update")[0]?.payload).toEqual({ encoding: "text", text: original });
    expect(ofKind(events, "outbound", "server.execute_action")[0]?.payload).toMatchObject({ value: { payload: { parameters: { value: "before" } } } });
    await gateway.close();
  });
});

describe("routing between two traces", () => {
  it("sends results to the trace of their command, other inbound to the claimants, and drops a trace's claims once it closes", async () => {
    const scope = traceScope();
    const first = openTrace("trace.first");
    const second = openTrace("trace.second");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const one = await pairClient(gateway, "client.one");
    const two = await pairClient(gateway, "client.two");
    const fromFirst = scope.within(first.recorder, () => gateway.executeAction(one.sessionId, { actionType: "example.press" }));
    const fromSecond = scope.within(second.recorder, () => gateway.executeAction(two.sessionId, { actionType: "example.press" }));

    await gateway.receive(one.sessionId, clientMessage("client.state_update", { state: { from: "one" } }));
    await gateway.receive(two.sessionId, clientMessage("client.state_update", { state: { from: "two" } }));
    const alsoSecond = scope.within(second.recorder, () => gateway.executeAction(one.sessionId, { actionType: "example.press" }));
    await gateway.receive(one.sessionId, clientMessage("client.state_update", { state: { from: "one, shared" } }));
    await gateway.receive(one.sessionId, clientMessage("client.action_result", { commandId: alsoSecond.commandId, status: "succeeded" }));
    await gateway.receive(one.sessionId, clientMessage("client.action_result", { commandId: fromFirst.commandId, status: "succeeded" }));
    await gateway.receive(two.sessionId, clientMessage("client.action_result", { commandId: fromSecond.commandId, status: "succeeded" }));

    const firstEvents = await first.events();
    const secondEvents = await second.events();
    const states = (events: typeof firstEvents) => ofKind(events, "inbound", "client.state_update").map((event) => event.payload.encoding === "text" ? (JSON.parse(event.payload.text) as { payload: { state: { from: string } } }).payload.state.from : null);
    expect(states(firstEvents)).toEqual(["one", "one, shared"]);
    expect(states(secondEvents)).toEqual(["two", "one, shared"]);
    expect(ofKind(firstEvents, "inbound", "client.action_result").map((event) => event.correlation.commandId)).toEqual([fromFirst.commandId]);
    expect(ofKind(secondEvents, "inbound", "client.action_result").map((event) => event.correlation.commandId)).toEqual([alsoSecond.commandId, fromSecond.commandId]);

    await first.recorder.close({ terminationReason: "completed", terminationDetail: null });
    const closedAt = first.recorder.status().lastSequence;
    await gateway.receive(one.sessionId, clientMessage("client.state_update", { state: { from: "after close" } }));
    await gateway.receive(one.sessionId, clientMessage("client.state_update", { state: { from: "after close, again" } }));
    expect(first.recorder.status().lastSequence).toBe(closedAt);
    expect(states(await second.events()).slice(-2)).toEqual(["after close", "after close, again"]);
    await gateway.close();
  });

  it("stops offering a trace anything once it has answered closed", async () => {
    const scope = traceScope();
    const live = openTrace("trace.counting");
    let calls = 0;
    let closed = false;
    const counting: ClientGatewayTraceSink = {
      record: (input) => {
        calls += 1;
        return closed ? { status: "refused", reason: "closed" } : live.recorder.record(input);
      },
      recordArtifact: (input) => live.recorder.recordArtifact(input),
      markCheckpoint: (input) => live.recorder.markCheckpoint(input),
      flush: () => live.recorder.flush(),
      close: (input) => live.recorder.close(input),
      status: () => live.recorder.status()
    };
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.counting");
    scope.within(counting, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    closed = true;
    await gateway.receive(client.sessionId, clientMessage("client.state_update", { state: { n: 1 } }));
    const afterRefusal = calls;
    await gateway.receive(client.sessionId, clientMessage("client.state_update", { state: { n: 2 } }));
    await gateway.sendPing(client.sessionId);
    expect(afterRefusal).toBe(2);
    expect(calls).toBe(afterRefusal);
    await gateway.close();
  });

  it("records lifecycle to the claimants and Core-synthesized outcomes to the trace of their command", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.lifecycle");
    let channel: string | undefined;
    const gateway = new ClientGatewayService({ commandTimeoutMs: 20, trace: scope.source, channelScope: { current: () => channel } });
    const client = await pairClient(gateway, "client.lifecycle");
    const timedOut = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    await expect(timedOut.result).resolves.toMatchObject({ status: "timed_out" });
    channel = "scope.elsewhere";
    const refused = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    channel = undefined;
    await refused.result;
    const pending = scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    gateway.disconnect(client.sessionId, "socket closed");
    await gateway.close();
    await pending.result;

    const events = await trace.events();
    const synthesized = ofKind(events, "synthesized");
    expect(synthesized.map((event) => [event.correlation.commandId, (event.payload.encoding === "json" ? event.payload.value : null) as { outcome: string } | null])).toEqual([
      [timedOut.commandId, expect.objectContaining({ outcome: "answer_never_came" })],
      [refused.commandId, expect.objectContaining({ outcome: "refused_unsent", code: expect.any(String) })],
      [pending.commandId, expect.objectContaining({ outcome: "gateway_closed" })]
    ]);
    expect(ofKind(events, "outbound").map((event) => event.correlation.commandId)).not.toContain(refused.commandId);
    expect(ofKind(events, "lifecycle").map((event) => event.messageType)).toEqual(["session.disconnected"]);
  });

  it("takes a trace artifact into every trace claiming the session, and refuses one whose digest does not match", async () => {
    const scope = traceScope();
    const first = openTrace("trace.artifact.first");
    const second = openTrace("trace.artifact.second");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.artifact");
    scope.within(first.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    scope.within(second.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    const bytes = new TextEncoder().encode("<doc>captured</doc>");

    expect(gateway.receiveTraceArtifact(client.sessionId, { sha256: digest(new Uint8Array([1])), mediaType: "text/html", bytes })).toEqual({ status: "refused", reason: "digest_mismatch" });
    expect(gateway.receiveTraceArtifact(client.sessionId, { sha256: digest(bytes), mediaType: "text/html", bytes })).toEqual({ status: "accepted", traces: 2 });
    await first.recorder.flush();
    expect(await first.store.listArtifacts(first.traceId)).toEqual([expect.objectContaining({ sha256: digest(bytes), byteLength: bytes.byteLength })]);
    expect(ofKind(await second.events(), "artifact")).toHaveLength(1);
    await gateway.close();
  });
});

describe("credentials and failures", () => {
  it("never stores a bearer token or a pairing code, raw or structured (D7)", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.credentials");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.credentials");
    scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    const rotated: string[] = [];
    const keepToken = (raw: string) => {
      const sent = JSON.parse(raw) as { type: string; payload: { token?: string } };
      if (sent.payload.token) rotated.push(sent.payload.token);
    };
    const next = gateway.connect({ socket: { send: keepToken } });
    await gateway.receiveRaw(next.sessionId, JSON.stringify(clientMessage("client.hello", { clientId: client.clientId, clientType: "extension", name: client.clientId, token: client.token, metadata: { domainId: "example.domain" } })));
    await gateway.receive(next.sessionId, clientMessage("client.pairing_submit", { pairingCode: "PAIRING-CODE-SECRET" }));

    expect(rotated).toHaveLength(1);
    const events = await trace.events();
    const stored = JSON.stringify(events);
    expect(client.token.length).toBeGreaterThan(8);
    expect(stored).not.toContain(client.token);
    expect(stored).not.toContain(rotated[0]);
    expect(stored).not.toContain("PAIRING-CODE-SECRET");
    const hello = ofKind(events, "inbound", "client.hello")[0];
    expect(hello?.payload).toMatchObject({ encoding: "json", value: { payload: { token: { redacted: "credential" } } } });
    expect(hello?.redactions).toEqual([{ path: "/payload/token", reason: "credential" }]);
    expect(ofKind(events, "outbound", "server.session_ready")[0]?.redactions).toEqual([{ path: "/payload/token", reason: "credential" }]);
    expect(ofKind(events, "inbound", "client.pairing_submit")[0]?.redactions).toEqual([{ path: "/payload/pairingCode", reason: "credential" }]);
    expect(ofKind(events, "lifecycle").map((event) => event.messageType)).toContain("session.disconnected");
    await gateway.close();
  });

  it("records text that did not parse only by its size and digest, with its error's kind, and still throws to the caller", async () => {
    const scope = traceScope();
    const trace = openTrace("trace.failures");
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.failures");
    scope.within(trace.recorder, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));

    const malformed = "{\"type\":\"client.hello\",\"payload\":{\"token\":\"held-back-value\"";
    await expect(gateway.receiveRaw(client.sessionId, malformed)).rejects.toThrow();
    const events = await trace.events();
    const unparsed = events.filter((event) => event.kind === "inbound" && event.messageType === null);
    expect(unparsed[0]?.payload).toMatchObject({ encoding: "json", value: { unparsed: { byteLength: malformed.length, sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) } } });
    expect(unparsed[0]?.redactions).toEqual([{ path: "", reason: "secret" }]);
    const disposition = ofKind(events, "disposition").find((event) => event.correlation.causationEventId === unparsed[0]?.eventId);
    expect(disposition?.payload).toMatchObject({ encoding: "json", value: { disposition: "parse_failed", error: "SyntaxError" } });
    expect(JSON.stringify(events)).not.toContain("held-back-value");
    await gateway.close();
  });

  it("never lets a sink that throws reach the gateway", async () => {
    const scope = traceScope();
    const broken: ClientGatewayTraceSink = {
      record: () => { throw new Error("sink broke"); },
      recordArtifact: () => { throw new Error("sink broke"); },
      markCheckpoint: () => ({ status: "marked" }),
      flush: async () => undefined,
      close: async () => { throw new Error("unused"); },
      status: () => { throw new Error("sink broke"); }
    };
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, trace: scope.source });
    const client = await pairClient(gateway, "client.broken");
    const response = scope.within(broken, () => gateway.executeAction(client.sessionId, { actionType: "example.press" }));
    await gateway.receive(client.sessionId, clientMessage("client.action_result", { commandId: response.commandId, status: "succeeded" }));
    await expect(response.result).resolves.toMatchObject({ status: "succeeded" });
    await gateway.close();
  });
});


function memoryLedger(): { port: ClientGatewayCommandLedgerPort; saved(): ClientGatewayCommandRecord | null } {
  let saved: ClientGatewayCommandRecord | null = null;
  const port: ClientGatewayCommandLedgerPort = {
    claim: async (claim) => {
      const sendAllowed = saved === null;
      saved ??= { claim: structuredClone(claim), claimedAt: Date.now(), state: "pending", receipt: null, committedAt: null, unknownReason: null };
      ClientGatewayCommandLedgerController.validateRecord(claim, saved);
      return { sendAllowed, record: saved };
    },
    commitReceipt: async (claim, receipt) => {
      if (!saved) throw new Error("missing");
      saved = { ...saved, claim, state: "committed", receipt, committedAt: Date.now(), unknownReason: null };
      return saved;
    },
    markUnknown: async (_claim, reason) => {
      if (!saved) throw new Error("missing");
      if (saved.state !== "committed") saved = { ...saved, state: "unknown", unknownReason: reason };
      return saved;
    },
    read: async () => saved
  };
  return { port, saved: () => saved };
}

function actionPayload(message: ClientGatewayServerMessage): Extract<ClientGatewayServerMessage, { type: "server.execute_action" }>["payload"] {
  if (message.type !== "server.execute_action") throw new Error(`expected an action command, got ${message.type}`);
  return message.payload;
}

// The trace contract and the run environment together (traces and offline
// trials, P1/P3/P4 groundwork; lane T U8; tests T07 and T08 at unit level). A
// recording run drives one node through the production executor inside a
// fixture environment while a trace recorder writes down the channel; an
// offline run then drives the same node inside a trace environment whose only
// client is fed from the stored trace, its answers entering Core through
// `receiveRaw`. Nothing on the channel is specific to one domain.
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, ClientGatewayTraceMemoryStore, ClientGatewayTraceRecorder, evaluateClientGatewayTraceCompleteness, type ClientGatewayCapability, type ClientGatewayServerMessage } from "../../../../../client-gateway/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { defineOutput, IoRegistry } from "../../../../../io/index.ts";
import { ClientGatewayRuntimeTransport, RuntimeService } from "../../../../../runtime/index.ts";
import { AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES, type AutomationStudioFlowDocument } from "../../../model/index.ts";
import { runAutomationStudioGraph } from "../../executor.ts";
import { automationStudioRunGraphOptions } from "../../service/runtime-session/index.ts";
import { AutomationStudioChannelScope, AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment, type AutomationStudioScopedRunEnvironment } from "../index.ts";
import { FixtureGatewayClient, type FixtureAnswer } from "./fixture-client.ts";
import { recordingGateway } from "./recording-socket.ts";
import { TraceFedGatewayClient } from "./trace-fed-client.ts";

const ACTION = "fixture.tally.add";
const DOMAIN = "fixture";
const TRACE_ID = "trace.fixture-tally";
const capability: ClientGatewayCapability = { id: "fixture.actions", kind: "action", actionTypes: [ACTION], metadata: { domainId: DOMAIN } };
const hello = { clientType: "custom" as const, name: "Tally client", capabilities: [capability], metadata: { domainId: DOMAIN } };
const START = 1_700_000_000_000;

afterEach(() => {
  vi.restoreAllMocks();
});

function tallyFlow(parameters: JsonObject): AutomationStudioFlowDocument {
  return {
    schemaVersion: "0.1",
    flowId: "flow.fixture-tally",
    ownerKind: "task",
    ownerId: "task.fixture-tally",
    name: "Fixture tally",
    createdAt: 1,
    updatedAt: 1,
    nodes: [{ id: "add", definitionId: "builtin.policy.action", parameterValues: { outputId: ACTION, parameters } }],
    edges: []
  };
}

/** A live client of the same domain and action, paired by a person outside every scope. */
async function pairLive(gateway: ClientGatewayService) {
  const sent: ClientGatewayServerMessage[] = [];
  const session = gateway.connect({
    socket: {
      send: (raw) => {
        sent.push(JSON.parse(raw) as ClientGatewayServerMessage);
      }
    }
  });
  await gateway.receive(session.sessionId, { id: "hello.live", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, payload: { clientId: "client.live", ...hello, name: "Live client" } });
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === session.sessionId)!;
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
  return { commands: () => sent.filter((message) => message.type === "server.execute_action") };
}

async function harness() {
  const gateway = new ClientGatewayService({ commandTimeoutMs: 2_000, channelScope: AutomationStudioChannelScope.gatewaySource });
  const live = await pairLive(gateway);
  const runtimeService = new RuntimeService();
  runtimeService.registerTransport(new ClientGatewayRuntimeTransport({ gateway }));
  const localDispatches: string[] = [];
  const io = new IoRegistry();
  // Reached only when no client serves the output: a run that falls back here never went through the channel.
  io.registerOutput(DOMAIN, defineOutput({
    definition: { id: ACTION, title: "Add to tally" },
    mode: "request",
    dispatch: (request) => {
      localDispatches.push(request.outputId);
      return { ok: false, outputId: request.outputId, error: "dispatched locally" };
    }
  }));
  return { gateway, live, runtimeService, io, localDispatches };
}

type Harness = Awaited<ReturnType<typeof harness>>;

function environmentOf(kind: "trace" | "fixture"): AutomationStudioScopedRunEnvironment {
  return createAutomationStudioScopedRunEnvironment({ kind, clock: new AutomationStudioVirtualClock(START), random: () => 0.5 });
}

function run(h: Harness, environment: AutomationStudioScopedRunEnvironment, parameters: JsonObject) {
  const options = automationStudioRunGraphOptions({ io: { io: h.io, domainId: DOMAIN }, runtimeService: h.runtimeService, signal: new AbortController().signal, authorizedDomainIds: [DOMAIN] });
  options.now = environment.now;
  options.delay = environment.delay;
  options.random = environment.random;
  return environment.within(() => runAutomationStudioGraph(tallyFlow(parameters), options));
}

/**
 * What a run concluded, node by node, without its run-scoped ids or timings.
 * `runtimeCommandId` is the transport's own correlation id, minted fresh per
 * command, so it is the one output a replay cannot and need not reproduce.
 */
function outcome(trace: Awaited<ReturnType<typeof run>>) {
  return { status: trace.status, attempts: trace.attempts.map((attempt) => ({ nodeId: attempt.nodeId, status: attempt.status, outputs: withoutCommandId(attempt.outputs) })) };
}

function withoutCommandId(outputs: unknown): unknown {
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs)) return outputs;
  return Object.fromEntries(Object.entries(outputs).filter(([key]) => key !== "runtimeCommandId"));
}

/** A recording run: the scripted client answers through a wrapper that records the channel into a memory store. */
async function record(h: Harness, answers: readonly FixtureAnswer[], parameters: JsonObject) {
  const environment = environmentOf("fixture");
  const store = new ClientGatewayTraceMemoryStore();
  const recorder = new ClientGatewayTraceRecorder({
    traceId: TRACE_ID,
    episodeId: "run.fixture-tally",
    activity: "test",
    origin: { kind: "live" },
    contractVersions: { protocol: CLIENT_GATEWAY_PROTOCOL_VERSION },
    capabilities: [capability],
    context: { schema: { name: "fixture.context", version: "1" }, value: { parameters } },
    streams: ["gateway"]
  }, { store, now: () => environment.now(), maxBufferedEvents: 1_000, maxBufferedArtifactBytes: 0 });
  const fixture = new FixtureGatewayClient(recordingGateway(h.gateway, recorder), answers);
  fixture.attach(environment.scopeId, hello);
  const trace = await run(h, environment, parameters);
  const manifest = await recorder.close({ terminationReason: "completed", terminationDetail: null });
  const events = await store.readEventRange(TRACE_ID, 1, manifest.completeness.lastSequence);
  const completeness = evaluateClientGatewayTraceCompleteness({ manifest, events, availableArtifacts: [], compatibility: { status: "compatible" }, recorderActive: false });
  return { trace, store, events, completeness, fixture, environment };
}

/** An offline run: a client fed only from the store, attached under a scope of its own. */
async function replay(h: Harness, store: ClientGatewayTraceMemoryStore, runs: readonly JsonObject[]) {
  const environment = environmentOf("trace");
  const client = await TraceFedGatewayClient.load(h.gateway, store, TRACE_ID);
  client.attach(environment.scopeId, hello);
  const traces = [];
  for (const parameters of runs) traces.push(await run(h, environment, parameters));
  await client.settled();
  return { traces, client, environment };
}

function recordedTexts(events: Awaited<ReturnType<typeof record>>["events"]): string[] {
  return events.flatMap((event) => (event.kind === "inbound" && event.payload.encoding === "text" ? [event.payload.text] : []));
}

function commandIds(messages: readonly unknown[]): string[] {
  return messages.flatMap((message) => {
    if (!message || typeof message !== "object" || Reflect.get(message, "type") !== "server.execute_action") return [];
    const payload: unknown = Reflect.get(message, "payload");
    const id: unknown = payload && typeof payload === "object" ? Reflect.get(payload, "commandId") : undefined;
    return typeof id === "string" ? [id] : [];
  });
}

describe("a node run fed from a recorded trace", () => {
  it("records a complete trace and reaches the recording run's outcome offline, through receiveRaw, without reaching any other client", async () => {
    const h = await harness();
    const recorded = await record(h, [
      { actionType: ACTION, parameters: { amount: 2, note: { b: 1, a: 2 } }, occurrence: 1, result: { status: "succeeded", payload: { total: 5 } } }
    ], { amount: 2, note: { a: 2, b: 1 } });
    expect(recorded.trace.status).toBe("succeeded");
    expect(recorded.completeness).toEqual({ status: "complete", issues: [], limitations: [] });
    const outbound = recorded.events.filter((event) => event.kind === "outbound" && event.messageType === "server.execute_action");
    expect(outbound).toHaveLength(1);
    expect(outbound[0]!.payload.encoding).toBe("json");
    const inbound = recorded.events.filter((event) => event.kind === "inbound");
    expect(inbound).toHaveLength(1);
    expect(inbound[0]!.correlation.commandId).toBe(outbound[0]!.correlation.commandId);
    const receiveRaw = vi.spyOn(h.gateway, "receiveRaw");
    const receive = vi.spyOn(h.gateway, "receive");
    const recordingCommands = recorded.fixture.received.length;

    // Parameters in yet another key order are the same call.
    const offline = await replay(h, recorded.store, [{ note: { b: 1, a: 2 }, amount: 2 }]);

    expect(offline.client.errors).toEqual([]);
    expect(outcome(offline.traces[0]!)).toEqual(outcome(recorded.trace));
    expect(offline.traces[0]!.attempts[0]).toMatchObject({ status: "succeeded", outputs: { result: { total: 5 } } });
    const [newId] = commandIds(offline.client.received);
    const oldId = outbound[0]!.correlation.commandId!;
    expect(newId).toBeDefined();
    expect(newId).not.toBe(oldId);
    expect(offline.traces[0]!.attempts[0]!.outputs).toMatchObject({ runtimeCommandId: newId });
    // Only the command id member changed: every other byte is the recorded text.
    const expected = recordedTexts(recorded.events)[0]!.replace(`"commandId":"${oldId}"`, `"commandId":"${newId}"`);
    expect(offline.client.fedTexts).toEqual([expected]);
    expect(receiveRaw.mock.calls.map((call) => call[1])).toEqual([expected]);
    expect(receive).not.toHaveBeenCalled();
    expect(recorded.fixture.received).toHaveLength(recordingCommands);
    expect(h.live.commands()).toEqual([]);
    expect(h.localDispatches).toEqual([]);
  });

  it("answers a candidate whose parameters differ with an evidence-gap failure, never the recorded success, and consumes no recorded answer (T07)", async () => {
    const h = await harness();
    const recorded = await record(h, [
      { actionType: ACTION, parameters: { amount: 2 }, occurrence: 1, result: { status: "succeeded", payload: { total: 5 } } }
    ], { amount: 2 });

    const offline = await replay(h, recorded.store, [{ amount: 3 }, { amount: 2 }]);

    expect(offline.client.errors).toEqual([]);
    const [mismatch, matching] = offline.traces;
    expect(mismatch!.status).not.toBe("succeeded");
    expect(mismatch!.attempts).toHaveLength(1);
    expect(mismatch!.attempts[0]!.status).toBe("failed");
    expect(JSON.stringify(mismatch!.attempts[0])).not.toContain("\"total\":5");
    const gap = JSON.parse(offline.client.fedTexts[0]!) as { payload: { status: string; failure: { code: string; retryable: boolean } } };
    expect(gap.payload).toMatchObject({ status: "failed", failure: { code: "argument_mismatch", retryable: false } });
    expect(AUTOMATION_STUDIO_TRIAL_EVIDENCE_REASON_CODES).toContain(gap.payload.failure.code);
    // The recorded answer is still there for the call it was recorded for.
    expect(outcome(matching!)).toEqual(outcome(recorded.trace));
    expect(h.live.commands()).toEqual([]);
  });

  it("answers two recorded calls with the same action and parameters but different results by occurrence (T08)", async () => {
    const h = await harness();
    const recorded = await record(h, [
      { actionType: ACTION, parameters: { amount: 1 }, occurrence: 1, result: { status: "failed", error: "busy", failure: { category: "timeout", code: "fixture.busy", retryable: true, stage: "dispatch", effect: "unacted" } } },
      { actionType: ACTION, parameters: { amount: 1 }, occurrence: 2, result: { status: "succeeded", payload: { total: 1 } } }
    ], { amount: 1 });
    expect(recorded.trace.attempts.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
    expect(recorded.completeness.status).toBe("complete");

    const offline = await replay(h, recorded.store, [{ amount: 1 }]);

    expect(offline.client.errors).toEqual([]);
    expect(outcome(offline.traces[0]!)).toEqual(outcome(recorded.trace));
    expect(offline.client.fedTexts).toHaveLength(2);
    expect(offline.client.fedTexts.map((text) => text.includes("fixture.busy"))).toEqual([true, false]);
    expect(h.live.commands()).toEqual([]);
  });

  it("answers a call past the recorded occurrences with a missing-transition failure", async () => {
    const h = await harness();
    const recorded = await record(h, [
      { actionType: ACTION, parameters: { amount: 4 }, occurrence: 1, result: { status: "succeeded", payload: { total: 4 } } }
    ], { amount: 4 });

    const offline = await replay(h, recorded.store, [{ amount: 4 }, { amount: 4 }]);

    expect(offline.client.errors).toEqual([]);
    expect(outcome(offline.traces[0]!)).toEqual(outcome(recorded.trace));
    expect(offline.traces[1]!.attempts.map((attempt) => attempt.status)).toEqual(["failed"]);
    expect(JSON.parse(offline.client.fedTexts[1]!)).toMatchObject({ payload: { status: "failed", failure: { code: "missing_transition", retryable: false } } });
  });
});

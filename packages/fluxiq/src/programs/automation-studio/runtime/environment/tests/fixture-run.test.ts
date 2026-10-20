// The non-browser fixture adapter (traces and offline trials, P1; lane T U2b,
// section 5): one node driven through the production executor, the production
// graph options, RuntimeService and Core's gateway transport, inside a scoped
// environment whose only client is a scripted one. It shows the environment
// port seals a run to its own channel (T20 at unit level) and that nothing on
// that channel is specific to one domain.
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayCapability, type ClientGatewayServerMessage } from "../../../../../client-gateway/index.ts";
import type { JsonObject } from "../../../../../core/index.ts";
import { defineOutput, IoRegistry } from "../../../../../io/index.ts";
import { ClientGatewayRuntimeTransport, RuntimeService } from "../../../../../runtime/index.ts";
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import { runAutomationStudioGraph } from "../../executor.ts";
import { automationStudioRunGraphOptions } from "../../service/runtime-session/index.ts";
import { AutomationStudioChannelScope, AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment, type AutomationStudioScopedRunEnvironment } from "../index.ts";
import { FixtureGatewayClient, type FixtureAnswer } from "./fixture-client.ts";

const ACTION = "fixture.tally.add";
const DOMAIN = "fixture";
const capability: ClientGatewayCapability = { id: "fixture.actions", kind: "action", actionTypes: [ACTION], metadata: { domainId: DOMAIN } };
const START = 1_700_000_000_000;

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
  const session = gateway.connect({ socket: { send: (raw) => { sent.push(JSON.parse(raw) as ClientGatewayServerMessage); } } });
  await gateway.receive(session.sessionId, { id: "hello.live", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, payload: { clientId: "client.live", clientType: "custom", name: "Live client", capabilities: [capability], metadata: { domainId: DOMAIN } } });
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === session.sessionId)!;
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
  return { sessionId: session.sessionId, commands: () => sent.filter((message) => message.type === "server.execute_action") };
}

async function harness(answers: readonly FixtureAnswer[]) {
  const gateway = new ClientGatewayService({ commandTimeoutMs: 2_000, channelScope: AutomationStudioChannelScope.gatewaySource });
  const live = await pairLive(gateway);
  const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock: new AutomationStudioVirtualClock(START), random: () => 0.5 });
  const fixture = new FixtureGatewayClient(gateway, answers);
  const scoped = fixture.attach(environment.scopeId, { clientType: "custom", name: "Fixture client", capabilities: [capability], metadata: { domainId: DOMAIN } });
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
  return { gateway, live, environment, fixture, scoped, runtimeService, io, localDispatches };
}

function runOptions(input: { io: IoRegistry; runtimeService: RuntimeService; environment: AutomationStudioScopedRunEnvironment }) {
  const options = automationStudioRunGraphOptions({ io: { io: input.io, domainId: DOMAIN }, runtimeService: input.runtimeService, signal: new AbortController().signal, authorizedDomainIds: [DOMAIN] });
  // Set here, not in the graph options builder, until the wiring unit threads the environment through it.
  options.now = input.environment.now;
  options.delay = input.environment.delay;
  options.random = input.environment.random;
  return options;
}

describe("a node run inside a fixture environment", () => {
  it("takes its result from the fixture client, through the gateway's own intake, and never reaches the live client", async () => {
    const { live, environment, fixture, runtimeService, io, localDispatches } = await harness([
      { actionType: ACTION, parameters: { amount: 2, note: { b: 1, a: 2 } }, occurrence: 1, result: { status: "succeeded", payload: { total: 5 } } }
    ]);

    // Parameters in another key order are the same call.
    const trace = await environment.within(() => runAutomationStudioGraph(tallyFlow({ note: { a: 2, b: 1 }, amount: 2 }), runOptions({ io, runtimeService, environment })));

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts).toHaveLength(1);
    expect(trace.attempts[0]).toMatchObject({ nodeId: "add", status: "succeeded", outputs: { outputId: ACTION, ok: true, runtimeStatus: "succeeded", result: { total: 5 } } });
    expect(trace.startedAt).toBe(START);
    expect(trace.attempts[0]!.startedAt).toBe(START);
    const sent = fixture.received.filter((message) => message.type === "server.execute_action");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ payload: { actionType: ACTION, parameters: { amount: 2, note: { a: 2, b: 1 } } } });
    expect(live.commands()).toEqual([]);
    expect(localDispatches).toEqual([]);
  });

  it("answers a repeated call by its occurrence and takes the retry's backoff from the virtual clock, without wall waiting", async () => {
    const { live, environment, fixture, runtimeService, io } = await harness([
      { actionType: ACTION, parameters: { amount: 1 }, occurrence: 1, result: { status: "failed", error: "busy", failure: { category: "timeout", code: "fixture.busy", retryable: true, stage: "dispatch", effect: "unacted" } } },
      { actionType: ACTION, parameters: { amount: 1 }, occurrence: 2, result: { status: "succeeded", payload: { total: 1 } } }
    ]);
    const wallStarted = Date.now();

    const trace = await environment.within(() => runAutomationStudioGraph(tallyFlow({ amount: 1 }), runOptions({ io, runtimeService, environment })));

    expect(trace.status).toBe("succeeded");
    expect(trace.attempts.map((attempt) => attempt.status)).toEqual(["failed", "succeeded"]);
    expect(fixture.received.filter((message) => message.type === "server.execute_action")).toHaveLength(2);
    // Core's first retry backoff is 250 ms: spent on the virtual clock, not the wall.
    expect(environment.now() - START).toBeGreaterThanOrEqual(250);
    expect(Date.now() - wallStarted).toBeLessThan(environment.now() - START);
    expect(live.commands()).toEqual([]);
  });

  it("refuses inside the scope, unsent and classified, a command addressed to the live session (T20)", async () => {
    const { gateway, live, environment } = await harness([]);

    const result = await environment.within(async () => {
      expect(gateway.snapshot().sessions.map((session) => session.sessionId)).not.toContain(live.sessionId);
      return await gateway.executeAction(live.sessionId, { actionType: ACTION, parameters: { amount: 3 } }).result;
    });

    expect(result).toMatchObject({ status: "failed", failure: { category: "blocked_by_capability_or_policy", code: "channel_scope.outside_scope", retryable: false, effect: "unacted" } });
    expect(live.commands()).toEqual([]);
  });

  it("keeps the scoped session invisible and unreachable outside the scope", async () => {
    const { gateway, live, fixture, scoped } = await harness([
      { actionType: ACTION, parameters: { amount: 4 }, occurrence: 1, result: { status: "succeeded" } }
    ]);

    expect(gateway.snapshot().sessions.map((session) => session.sessionId)).toEqual([live.sessionId]);
    const result = await gateway.executeAction(scoped.sessionId, { actionType: ACTION, parameters: { amount: 4 } }).result;

    expect(result).toMatchObject({ status: "failed", failure: { code: "channel_scope.scoped_session", effect: "unacted" } });
    expect(fixture.received).toEqual([]);
  });

  it("advances its virtual clock by a delay without wall waiting", async () => {
    const { environment } = await harness([]);
    const wallStarted = Date.now();

    await environment.delay(10 * 60_000);

    expect(environment.now()).toBe(START + 10 * 60_000);
    expect(Date.now() - wallStarted).toBeLessThan(1_000);
  });
});

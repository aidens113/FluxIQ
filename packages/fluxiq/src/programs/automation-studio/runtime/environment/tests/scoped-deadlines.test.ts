// T13 (source plan section 10): an answer replayed before and after its
// timeout deadline, inside a scoped environment. The gateway's answer wait --
// and its reconcile question's wait -- for a command sent inside the scope run
// on the environment's virtual timers, so the production timeout path meets
// each answer at its logical time with no wall-clock wait; a live command
// keeps the gateway's own timer. Nothing here names a page or a selector.
import { describe, expect, it } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayActionResponse, type ClientGatewayActionResult, type ClientGatewayCapability, type ClientGatewayServerMessage } from "../../../../../client-gateway/index.ts";
import type { ClientGatewayTimedWait } from "../../../../../client-gateway/service/index.ts";
import { AutomationStudioChannelScope, AutomationStudioVirtualClock, createAutomationStudioScopedRunEnvironment } from "../index.ts";

const ACTION = "synthetic.tally.add";
const PLAIN: ClientGatewayCapability = { id: "synthetic.actions", kind: "action", actionTypes: [ACTION], metadata: { domainId: "synthetic" } };
const ANSWERS: ClientGatewayCapability = { id: "synthetic.reconcile", kind: "action", actionTypes: [ACTION], metadata: { domainId: "synthetic", answersReconcile: true } };
// Long real waits: a wait that ran on the real clock would outlast the test's own time limit.
const ANSWER_WAIT_MS = 60_000;
const RECONCILE_WAIT_MS = 45_000;

function harness(capability: ClientGatewayCapability) {
  const gatewayTimers: ClientGatewayTimedWait[] = [];
  const gateway = new ClientGatewayService({
    commandTimeoutMs: ANSWER_WAIT_MS,
    reconcileAnswerMs: RECONCILE_WAIT_MS,
    channelScope: AutomationStudioChannelScope.gatewaySource,
    startTimer: (wait, delayMs, fire) => {
      gatewayTimers.push(wait);
      const handle = setTimeout(fire, delayMs);
      return { cancel: () => clearTimeout(handle) };
    }
  });
  const clock = new AutomationStudioVirtualClock(1_700_000_000_000);
  const environment = createAutomationStudioScopedRunEnvironment({ kind: "fixture", clock });
  const sent: ClientGatewayServerMessage[] = [];
  const session = gateway.attachScopedSession({ scopeId: environment.scopeId, socket: { send: (raw) => { sent.push(JSON.parse(raw) as ClientGatewayServerMessage); } }, hello: { clientType: "custom", name: "Scripted client", capabilities: [capability] } });
  const send = (parameters: Record<string, number>): Promise<ClientGatewayActionResponse> => environment.within(async () => gateway.executeAction(session.sessionId, { actionType: ACTION, parameters }));
  const answer = (commandId: string, result: Omit<ClientGatewayActionResult, "commandId">) => gateway.receive(session.sessionId, { id: `answer.${commandId}`, type: "client.action_result", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, payload: { ...result, commandId } });
  return { gateway, gatewayTimers, clock, environment, sent, session, send, answer };
}

/** Lets the gateway's own async steps after a fired deadline run, without waiting on any timer. */
async function settleMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
}

describe("T13: a scoped command's answer before and after its gateway deadline", () => {
  it("settles an answer that arrives before the deadline and times out one that would arrive after it, by the production path, with no wall wait", async () => {
    const run = harness(PLAIN);
    const started = Date.now();
    const early = await run.send({ amount: 1 });
    const late = await run.send({ amount: 2 });
    let lateOutcome: ClientGatewayActionResult | undefined;
    void late.result.then((result) => { lateOutcome = result; });

    // The early answer's recorded latency: 1.5 s of virtual time, inside the 60 s wait.
    run.clock.advance(1_500);
    await run.answer(early.commandId, { status: "succeeded", payload: { total: 1 } });
    await expect(early.result).resolves.toMatchObject({ commandId: early.commandId, status: "succeeded", payload: { total: 1 } });
    expect(lateOutcome).toBeUndefined();

    // The late answer's recorded latency, 61 s, is past the deadline: the deadline fires first.
    run.clock.advance(59_500);
    await settleMicrotasks();
    expect(lateOutcome).toEqual({ commandId: late.commandId, status: "timed_out", message: `Client action timed out after ${ANSWER_WAIT_MS}ms.` });
    expect(run.clock.now()).toBe(1_700_000_000_000 + 61_000);

    // Arriving at its logical time, after the deadline, it is late and settles nothing.
    run.clock.advance(1_000);
    await run.answer(late.commandId, { status: "succeeded", payload: { total: 3 } });
    await expect(late.result).resolves.toMatchObject({ status: "timed_out" });
    expect(run.gatewayTimers).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2_000);
    await run.gateway.close();
  });

  it("runs the reconcile question's wait on the same virtual timers before calling the command timed out", async () => {
    const run = harness(ANSWERS);
    const started = Date.now();
    const response = await run.send({ amount: 5 });
    let outcome: ClientGatewayActionResult | undefined;
    void response.result.then((result) => { outcome = result; });

    run.clock.advance(ANSWER_WAIT_MS);
    await settleMicrotasks();
    expect(run.sent.map((message) => message.type)).toEqual(["server.execute_action", "server.reconcile_command"]);
    expect(outcome).toBeUndefined();

    run.clock.advance(RECONCILE_WAIT_MS - 1);
    await settleMicrotasks();
    expect(outcome).toBeUndefined();

    run.clock.advance(1);
    await settleMicrotasks();
    expect(outcome).toMatchObject({ commandId: response.commandId, status: "timed_out", metadata: { reconciled: "unknown" } });
    expect(run.gatewayTimers).toEqual([]);
    expect(Date.now() - started).toBeLessThan(2_000);
    await run.gateway.close();
  });

  it("leaves a live command on the gateway's own timer", async () => {
    const run = harness(PLAIN);
    const liveSent: ClientGatewayServerMessage[] = [];
    const live = run.gateway.connect({ socket: { send: (raw) => { liveSent.push(JSON.parse(raw) as ClientGatewayServerMessage); } } });
    await run.gateway.receive(live.sessionId, { id: "hello.live", type: "client.hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, payload: { clientId: "client.live", clientType: "custom", name: "Live client", capabilities: [PLAIN] } });
    const pairing = run.gateway.snapshot().pairings.find((item) => item.requestedBySessionId === live.sessionId)!;
    await run.gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });

    const response = run.gateway.executeAction(live.sessionId, { actionType: ACTION, parameters: { amount: 9 } });

    expect(run.gatewayTimers).toEqual([{ kind: "answer", commandId: response.commandId }]);
    run.clock.advance(10 * ANSWER_WAIT_MS);
    await run.gateway.receive(live.sessionId, { id: "answer.live", type: "client.action_result", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, payload: { commandId: response.commandId, status: "succeeded" } });
    await expect(response.result).resolves.toMatchObject({ status: "succeeded" });
    await run.gateway.close();
  });
});

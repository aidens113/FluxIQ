// A channel scope's timer source (traces and offline trials, P4, "Virtual
// clock"): a command dispatched inside a scope that has one waits for its
// answer, its durable answer and its reconcile answer on it, read once at
// dispatch; a command outside every scope, or in a scope without one, keeps
// the gateway's own timer. Nothing here names a domain.
import { describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayActionResult, type ClientGatewayCapability, type ClientGatewayClientMessage, type ClientGatewayServerMessage } from "../../index.ts";
import type { ClientGatewayChannelScopeSource } from "../channel-scope/index.ts";
import { ClientGatewayCommandContext as Context, ClientGatewayCommandLedgerController as Rules, ClientGatewayCommandOutcome as Outcome, type ClientGatewayCommandLedgerPort, type ClientGatewayCommandRecord } from "../command-ledger/index.ts";
import type { ClientGatewayServiceOptions, ClientGatewayTimedWait, ClientGatewayTimerSource } from "../types.ts";

const PLAIN: ClientGatewayCapability = { id: "synthetic.actions", kind: "action", actionTypes: ["synthetic.act"] };
const ANSWERS: ClientGatewayCapability = { id: "synthetic.reconcile", kind: "action", actionTypes: ["synthetic.act"], metadata: { answersReconcile: true } };
const owner = { projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invoke.1", attemptId: "node.attempt.1", effectOrdinal: 0 };

type StartedTimer = { wait: ClientGatewayTimedWait; delayMs: number; fire: () => void; cancelled: boolean };

/** A timer source the test fires by hand. */
function handTimers(): { source: ClientGatewayTimerSource; started: StartedTimer[] } {
  const started: StartedTimer[] = [];
  const source: ClientGatewayTimerSource = (wait, delayMs, fire) => {
    const timer: StartedTimer = { wait, delayMs, fire, cancelled: false };
    started.push(timer);
    return { cancel: () => { timer.cancelled = true; } };
  };
  return { source, started };
}

/** A scope the test enters and leaves by hand, carrying a timer source or none. */
function manualScope(): ClientGatewayChannelScopeSource & { enter(scopeId: string | undefined, timers?: ClientGatewayTimerSource): void } {
  let current: string | undefined;
  let timers: ClientGatewayTimerSource | undefined;
  return {
    current: () => current,
    timers: () => timers,
    enter: (scopeId, scopeTimers) => {
      current = scopeId;
      timers = scopeTimers;
    }
  };
}

function message<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `${type}.${Math.random()}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: 0, type, payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

function setup(capability: ClientGatewayCapability, extra: ClientGatewayServiceOptions = {}) {
  const own = handTimers();
  const scoped = handTimers();
  const scope = manualScope();
  const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000, reconcileAnswerMs: 500, channelScope: scope, startTimer: own.source, ...extra });
  const sent: ClientGatewayServerMessage[] = [];
  const session = gateway.attachScopedSession({ scopeId: "scope.a", socket: { send: (raw) => { sent.push(JSON.parse(raw) as ClientGatewayServerMessage); } }, hello: { clientType: "custom", capabilities: [capability] } });
  return { gateway, own, scoped, scope, sent, session };
}

async function turns(): Promise<void> {
  for (let turn = 0; turn < 30; turn += 1) await Promise.resolve();
}

describe("a channel scope's timer source", () => {
  it("runs the answer wait of a command sent inside the scope, read at dispatch, and its expiry times the command out", async () => {
    const run = setup(PLAIN);
    run.scope.enter("scope.a", run.scoped.source);
    const response = run.gateway.executeAction(run.session.sessionId, { actionType: "synthetic.act" });
    run.scope.enter(undefined);

    expect(run.own.started).toEqual([]);
    expect(run.scoped.started.map((timer) => ({ wait: timer.wait, delayMs: timer.delayMs }))).toEqual([{ wait: { kind: "answer", commandId: response.commandId }, delayMs: 1_000 }]);
    run.scoped.started[0]!.fire();
    await expect(response.result).resolves.toEqual({ commandId: response.commandId, status: "timed_out", message: "Client action timed out after 1000ms." });
    await run.gateway.close();
  });

  it("cancels the scoped wait when the answer comes first", async () => {
    const run = setup(PLAIN);
    run.scope.enter("scope.a", run.scoped.source);
    const response = run.gateway.executeAction(run.session.sessionId, { actionType: "synthetic.act" });
    await run.gateway.receive(run.session.sessionId, message("client.action_result", { commandId: response.commandId, status: "succeeded" }));
    await expect(response.result).resolves.toMatchObject({ status: "succeeded" });
    expect(run.scoped.started[0]!.cancelled).toBe(true);
    await run.gateway.close();
  });

  it("runs the reconcile question's wait on the scope's timers too, even when the deadline fires outside the scope", async () => {
    const run = setup(ANSWERS);
    run.scope.enter("scope.a", run.scoped.source);
    const response = run.gateway.executeAction(run.session.sessionId, { actionType: "synthetic.act" });
    run.scope.enter(undefined);
    let outcome: ClientGatewayActionResult | undefined;
    void response.result.then((result) => { outcome = result; });

    run.scoped.started[0]!.fire();
    await turns();
    expect(run.sent.map((item) => item.type)).toEqual(["server.execute_action", "server.reconcile_command"]);
    expect(run.scoped.started.map((timer) => timer.delayMs)).toEqual([1_000, 500]);
    expect(run.own.started).toEqual([]);
    expect(outcome).toBeUndefined();

    run.scoped.started[1]!.fire();
    await turns();
    expect(outcome).toMatchObject({ status: "timed_out", metadata: { reconciled: "unknown" } });
    await run.gateway.close();
  });

  it("leaves a command in a scope without timers, and every live command, on the gateway's own timer", async () => {
    const run = setup(PLAIN);
    run.scope.enter("scope.a");
    const scopedWithout = run.gateway.executeAction(run.session.sessionId, { actionType: "synthetic.act" });
    expect(run.own.started.map((timer) => timer.wait)).toEqual([{ kind: "answer", commandId: scopedWithout.commandId }]);
    expect(run.scoped.started).toEqual([]);
    await run.gateway.close();
  });

  it("runs a durable command's answer wait and its reconcile wait on the scope's timers", async () => {
    let saved: ClientGatewayCommandRecord | null = null;
    const ledger: ClientGatewayCommandLedgerPort = {
      claim: async (claim) => {
        const sendAllowed = saved === null;
        saved ??= { claim: structuredClone(claim), claimedAt: 0, state: "pending", receipt: null, committedAt: null, unknownReason: null };
        Rules.validateRecord(claim, saved);
        return { sendAllowed, record: saved };
      },
      commitReceipt: async (claim, receipt) => {
        saved = { ...saved!, claim, state: "committed", receipt, committedAt: 0, unknownReason: null };
        return saved;
      },
      markUnknown: async (_claim, reason) => {
        if (saved!.state !== "committed") saved = { ...saved!, state: "unknown", unknownReason: reason };
        return saved!;
      },
      read: async () => saved
    };
    const observer = { completed: vi.fn(async () => undefined), uncertain: vi.fn(async () => undefined) };
    const run = setup(ANSWERS, { resolveCommandLedger: async () => ({ ledger, outcomeObserver: observer, close: async () => undefined }) });
    const context = Context.issue(owner);
    Outcome.require(context, observer);

    run.scope.enter("scope.a", run.scoped.source);
    const response = run.gateway.executeAction(run.session.sessionId, { actionType: "synthetic.act" }, { context });
    run.scope.enter(undefined);
    await turns();

    expect(run.own.started).toEqual([]);
    expect(run.scoped.started.map((timer) => ({ wait: timer.wait, delayMs: timer.delayMs }))).toEqual([{ wait: { kind: "answer", commandId: response.commandId }, delayMs: 1_000 }]);
    run.scoped.started[0]!.fire();
    await turns();
    expect(run.sent.map((item) => item.type)).toEqual(["server.execute_action", "server.reconcile_command"]);
    expect(run.scoped.started.map((timer) => timer.delayMs)).toEqual([1_000, 500]);

    run.scoped.started[1]!.fire();
    await expect(response.result).resolves.toEqual({ status: "outcome_unknown" });
    expect(run.own.started).toEqual([]);
    expect(observer.uncertain).toHaveBeenCalledTimes(1);
    await run.gateway.close();
  });
});

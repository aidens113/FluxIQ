// Channel scopes on the gateway (traces and offline trials, P1): a session
// attached under a scope is seen and reached only from inside that scope, and
// a live session only from outside every scope. Nothing here names a domain.
import { describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayService, type ClientGatewayClientMessage, type ClientGatewayServiceOptions } from "../index.ts";
import { ClientGatewayChannelScopeRefusedError, type ClientGatewayChannelScopeSource } from "../service/channel-scope/index.ts";
import { ClientGatewayCommandContext } from "../service/command-ledger/index.ts";

const capability = { id: "synthetic.actions", kind: "action" as const, actionTypes: ["synthetic.act"], metadata: { domainId: "synthetic" } };

/** A scope the test enters and leaves by hand, standing in for the host's async-context scope. */
function manualScope(): ClientGatewayChannelScopeSource & { enter(scopeId: string | undefined): void } {
  let current: string | undefined;
  return { current: () => current, enter: (scopeId) => { current = scopeId; } };
}

function message<TType extends ClientGatewayClientMessage["type"]>(type: TType, payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"]): Extract<ClientGatewayClientMessage, { type: TType }> {
  return { id: `message.${Math.random().toString(36).slice(2)}`, type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

async function pairLive(gateway: ClientGatewayService, clientId: string) {
  const sent: string[] = [];
  const session = gateway.connect({ socket: { send: (raw) => { sent.push(raw); } } });
  await gateway.receive(session.sessionId, message("client.hello", { clientId, clientType: "custom", name: "Live client", capabilities: [capability], metadata: { domainId: "synthetic" } }));
  const pairing = gateway.snapshot().pairings.find((item) => item.requestedBySessionId === session.sessionId)!;
  await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
  return { sessionId: session.sessionId, actions: () => sent.map((raw) => JSON.parse(raw) as { type: string }).filter((item) => item.type === "server.execute_action") };
}

function attachScoped(gateway: ClientGatewayService, scopeId: string, clientId = "client.claimed") {
  const sent: string[] = [];
  const session = gateway.attachScopedSession({ scopeId, socket: { send: (raw) => { sent.push(raw); } }, hello: { clientId, clientType: "custom", name: "Scoped client", token: "token.ignored", capabilities: [capability], metadata: { domainId: "synthetic" } } });
  return { session, actions: () => sent.map((raw) => JSON.parse(raw) as { type: string; payload: { commandId: string } }).filter((item) => item.type === "server.execute_action") };
}

function gatewayWith(options: ClientGatewayServiceOptions = {}) {
  const scope = manualScope();
  return { scope, gateway: new ClientGatewayService({ commandTimeoutMs: 1000, channelScope: scope, ...options }) };
}

describe("ClientGatewayService channel scopes", () => {
  it("attaches a scoped session ready without pairing, under a client id of its own, and never stores it as a trusted client", async () => {
    const store = { load: vi.fn(async () => []), save: vi.fn(async () => undefined) };
    const { gateway } = gatewayWith({ trustedClientStore: store });
    const live = await pairLive(gateway, "client.claimed");
    store.save.mockClear();
    const events: string[] = [];
    gateway.onEvent((event) => { events.push(event.type); });

    const { session } = attachScoped(gateway, "scope.a", "client.claimed");

    expect(session).toMatchObject({ status: "ready", name: "Scoped client", capabilities: [capability], metadata: { domainId: "synthetic" } });
    expect(session.clientId).not.toBe("client.claimed");
    expect(session).not.toHaveProperty("trustedClientId");
    expect(session).not.toHaveProperty("channelScope");
    expect(gateway.isScopedSession(session.sessionId)).toBe(true);
    expect(gateway.isScopedSession(live.sessionId)).toBe(false);
    expect(store.save).not.toHaveBeenCalled();
    expect(gateway.snapshot().trustedClients).toHaveLength(1);
    // Nothing global hears of it: a live listener never learns a scoped session exists.
    expect(events).toEqual([]);
    expect(gateway.snapshot().sessions.find((item) => item.sessionId === live.sessionId)?.status).toBe("ready");
  });

  it("refuses to attach a session without a scope", () => {
    const { gateway } = gatewayWith();
    expect(() => gateway.attachScopedSession({ scopeId: "", socket: { send: () => undefined }, hello: { clientType: "custom" } })).toThrow("client_gateway.channel_scope_required");
  });

  it("shows inside a scope only that scope's sessions, and outside every scope only live ones", async () => {
    const { gateway, scope } = gatewayWith();
    const live = await pairLive(gateway, "client.live");
    const scopedA = attachScoped(gateway, "scope.a").session;
    const scopedB = attachScoped(gateway, "scope.b").session;
    const ids = () => gateway.snapshot().sessions.map((item) => item.sessionId);
    const listed = () => gateway.listSummaryItems({ kind: "sessions" }).items.map((item) => (item as { sessionId: string }).sessionId);

    expect(ids()).toEqual([live.sessionId]);
    expect(listed()).toEqual([live.sessionId]);
    expect(gateway.summary().counts.sessions).toBe(1);
    scope.enter("scope.a");
    expect(ids()).toEqual([scopedA.sessionId]);
    expect(listed()).toEqual([scopedA.sessionId]);
    scope.enter("scope.b");
    expect(ids()).toEqual([scopedB.sessionId]);
    scope.enter("scope.none");
    expect(ids()).toEqual([]);
  });

  it("sends inside a scope to that scope's session, and the answer comes back through the same intake", async () => {
    const { gateway, scope } = gatewayWith();
    const scoped = attachScoped(gateway, "scope.a");
    scope.enter("scope.a");

    const response = gateway.executeAction(scoped.session.sessionId, { actionType: "synthetic.act", parameters: { n: 1 } });
    await Promise.resolve();
    expect(scoped.actions()).toHaveLength(1);
    await gateway.receive(scoped.session.sessionId, message("client.action_result", { commandId: response.commandId, status: "succeeded", payload: { n: 2 } }));

    await expect(response.result).resolves.toMatchObject({ status: "succeeded", payload: { n: 2 } });
  });

  it("refuses, unsent and classified, a command issued inside a scope to a live session or another scope's", async () => {
    const { gateway, scope } = gatewayWith();
    const live = await pairLive(gateway, "client.live");
    const other = attachScoped(gateway, "scope.b");
    scope.enter("scope.a");

    const toLive = await gateway.executeAction(live.sessionId, { actionType: "synthetic.act" }).result;
    const toOther = await gateway.executeAction(other.session.sessionId, { actionType: "synthetic.act" }).result;

    for (const result of [toLive, toOther]) {
      expect(result).toMatchObject({ status: "failed", failure: { category: "blocked_by_capability_or_policy", code: "channel_scope.outside_scope", retryable: false, stage: "dispatch", effect: "unacted" } });
    }
    expect(live.actions()).toEqual([]);
    expect(other.actions()).toEqual([]);
    expect(gateway.snapshot().auditLog.filter((entry) => entry.type === "command.channel_scope_refused")).toHaveLength(2);
  });

  it("refuses, unsent and classified, a command issued outside every scope to a scoped session", async () => {
    const { gateway } = gatewayWith();
    const scoped = attachScoped(gateway, "scope.a");

    const result = await gateway.executeAction(scoped.session.sessionId, { actionType: "synthetic.act" }).result;

    expect(result).toMatchObject({ status: "failed", failure: { code: "channel_scope.scoped_session", effect: "unacted" } });
    expect(scoped.actions()).toEqual([]);
  });

  it("refuses a snapshot request across a scope by throwing the classified refusal, before anything is sent", async () => {
    const { gateway, scope } = gatewayWith();
    const live = await pairLive(gateway, "client.live");
    const scoped = attachScoped(gateway, "scope.a");
    gateway.clearOutbound(live.sessionId);

    await expect(gateway.captureSnapshot(scoped.session.sessionId)).rejects.toMatchObject({ code: "channel_scope.scoped_session" });
    scope.enter("scope.a");
    await expect(gateway.captureSnapshot(live.sessionId)).rejects.toBeInstanceOf(ClientGatewayChannelScopeRefusedError);
    expect(gateway.outbound(live.sessionId)).toEqual([]);
    expect(gateway.outbound(scoped.session.sessionId)).toEqual([]);
  });

  it("refuses a durable command across a scope before it is claimed", async () => {
    const resolveCommandLedger = vi.fn();
    const { gateway, scope } = gatewayWith({ resolveCommandLedger });
    const live = await pairLive(gateway, "client.live");
    scope.enter("scope.a");
    const context = ClientGatewayCommandContext.issue({ projectId: "project.1", runId: "run.1", flowId: "flow.1", invocationId: "invoke.1", attemptId: "attempt.1", effectOrdinal: 0 });

    let thrown: unknown;
    try { gateway.executeAction(live.sessionId, { actionType: "synthetic.act" }, { context }); } catch (error) { thrown = error; }

    expect(thrown).toBeInstanceOf(ClientGatewayChannelScopeRefusedError);
    expect(thrown).toMatchObject({ code: "channel_scope.outside_scope", message: "durable_command.channel_scope.outside_scope" });
    expect(resolveCommandLedger).not.toHaveBeenCalled();
    expect(live.actions()).toEqual([]);
  });

  it("keeps a scoped session unreachable and unseen when the host wired no scope source", async () => {
    const gateway = new ClientGatewayService({ commandTimeoutMs: 1000 });
    const live = await pairLive(gateway, "client.live");
    const scoped = attachScoped(gateway, "scope.a");

    expect(gateway.snapshot().sessions.map((item) => item.sessionId)).toEqual([live.sessionId]);
    await expect(gateway.executeAction(scoped.session.sessionId, { actionType: "synthetic.act" }).result).resolves.toMatchObject({ failure: { code: "channel_scope.scoped_session" } });
  });
});

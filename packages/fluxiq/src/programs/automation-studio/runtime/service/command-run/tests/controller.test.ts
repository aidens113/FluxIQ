import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FluxIQ } from "../../../../../../framework/index.ts";
import { ClientGatewayCommandLedgerController as Rules, ClientGatewayCommandOutcome as Outcome, ClientGatewayCommandContext, type ClientGatewayCommandClaim } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../../../../client-gateway/index.ts";
import { AutomationStudioProjectCommandLedgerStore as Store, type AutomationStudioProjectDatabasePool } from "../../../../storage/project/index.ts";
import { AutomationStudioCommandRunController as Controller, AutomationStudioCommandRunScope, type AutomationStudioCommandRunOwner, type AutomationStudioCommandExecutorOwner, type AutomationStudioCommandEffectProvenance } from "../index.ts";

async function fixture(operation: (controller: Controller, fluxiq: FluxIQ, owner: AutomationStudioCommandRunOwner) => Promise<void>, expectedCloseFailure = false) {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-command-run-")), bootstrap = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
  for (const [key, value] of Object.entries(bootstrap.paths)) { if (key === "domainId" || typeof value !== "string") continue; const relative = path.relative(root, path.resolve(value)); if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Refusing nonowned fixture path"); }
  try { await bootstrap.setup(); } finally { await bootstrap.close(); }
  const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false }), program = fluxiq.programs.automationStudio;
  // Test-only composition supplies the actual private program pool without a product exposure/wiring change.
  const pool = (program as unknown as { projectDatabasePool: AutomationStudioProjectDatabasePool }).projectDatabasePool;
  const controller = new Controller({ pool, getRuntimeSession: (projectId, runId) => program.getRuntimeSession(projectId, runId) });
  try {
    const project = await program.createProject({ name: "Synthetic closed run", domainId: "synthetic.domain" });
    const flow = { schemaVersion: "0.1" as const, flowId: "flow.1", ownerKind: "routine" as const, ownerId: "routine.1", name: "Synthetic root", nodes: [], edges: [], createdAt: 1, updatedAt: 1 };
    const session = await program.startRuntimeSession({ projectId: project.id, runId: "run.1", flow });
    await operation(controller, fluxiq, { projectId: project.id, runId: session.runId, rootFlowId: session.flowId });
  } finally {
    vi.restoreAllMocks(); const closed = await Promise.allSettled([controller.close()]); await fluxiq.close();
    const owned = path.resolve(root); if (path.dirname(owned) !== path.resolve(os.tmpdir()) || !path.basename(owned).startsWith("gateway-command-run-")) throw new Error("Refusing nonowned fixture cleanup"); await rm(owned, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    if (expectedCloseFailure) expect(closed[0]).toMatchObject({ status: "rejected", reason: { message: "command_run.close_failed" } }); else if (closed[0]?.status === "rejected") throw closed[0].reason;
  }
}
function claim(owner: AutomationStudioCommandRunOwner, invocationId = "invoke.1"): ClientGatewayCommandClaim { const binding = { projectId: owner.projectId, runId: owner.runId, flowId: owner.rootFlowId, invocationId, attemptId: "node.attempt.1", effectOrdinal: 0 }; return { binding: { schemaVersion: "gateway_command.v1", ...binding, commandId: Rules.commandId(binding), clientId: "synthetic.client", sessionId: "synthetic.session" }, requestDigest: Rules.digest({ items: ["synthetic"] }) }; }
function receipt(input: ClientGatewayCommandClaim) { return { schemaVersion: "gateway_command_receipt.v1" as const, commandId: input.binding.commandId, requestDigest: input.requestDigest, clientId: input.binding.clientId, sessionId: input.binding.sessionId, status: "succeeded" as const, receivedAt: Date.now(), resultDigest: Rules.digest({ value: "synthetic" }), redaction: "receipt_only" as const }; }
async function consumedFixture(operation: (h: { controller: Controller; scope: AutomationStudioCommandRunScope; owner: AutomationStudioCommandRunOwner; issue(ordinal: number): { capability: object; consumer: object }; handled(capability: object, context: ClientGatewayCommandContext): void; gateway: ClientGatewayService; sessionId: string; sends: string[]; finish(context: ClientGatewayCommandContext): Promise<void>; fluxiq: FluxIQ }) => Promise<void>) {
  await fixture(async (_closed, fluxiq, owner) => {
    const facts = new WeakMap<object, { provenance: AutomationStudioCommandEffectProvenance; handled: WeakSet<ClientGatewayCommandContext>; witness: object }>();
    const executorOwner: AutomationStudioCommandExecutorOwner = { inspectEffect: cap => facts.get(cap)?.provenance ?? null, authorizeHandling: (consumer, cap, context) => { const value = facts.get(cap); return value && value.provenance.consumer === consumer && value.handled.has(context) ? value.witness : null; } };
    const program = fluxiq.programs.automationStudio, pool = (program as unknown as { projectDatabasePool: AutomationStudioProjectDatabasePool }).projectDatabasePool;
    const controller = new Controller({ pool, executorOwner, getRuntimeSession: (projectId, runId) => program.getRuntimeSession(projectId, runId) }), scope = await controller.open(owner), sends: string[] = [];
    const gateway = new ClientGatewayService({ resolveCommandLedger: context => controller.resolve(context) }), session = gateway.connect({ socket: { send: raw => { if (JSON.parse(raw).type === "server.execute_action") sends.push(raw); } } });
    await gateway.receive(session.sessionId, { id: "hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId: "synthetic.client", clientType: "extension", capabilities: [] } });
    const pairing = gateway.snapshot().pairings.find(item => item.requestedBySessionId === session.sessionId)!; await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
    const issue = (ordinal: number) => { const capability = Object.freeze({}), consumer = Object.freeze({}); facts.set(capability, { provenance: { scope, consumer, nodeId: "synthetic.node", executingFlowId: "synthetic.child", executingFlowDigest: Rules.digest({ synthetic: "child" }), invocationId: "synthetic.invocation", attemptId: "synthetic.attempt", effectOrdinal: ordinal }, handled: new WeakSet(), witness: Object.freeze({}) }); return { capability, consumer }; };
    const finish = async (context: ClientGatewayCommandContext) => { const response = gateway.executeAction(session.sessionId, { actionType: "synthetic.action", parameters: { items: [1, 2] } }, { context }); for (let i = 0; i < 100 && sends.length === 0; i++) await new Promise(resolve => setTimeout(resolve, 5)); const lease = await controller.resolve(context); const command = sends.map(raw => JSON.parse(raw)).find(item => item.payload.commandId === response.commandId); expect(command).toBeDefined(); expect(lease.outcomeObserver).toBe(Outcome.observer(context)); await gateway.receive(session.sessionId, { id: `ack.${sends.length}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: response.commandId, status: "succeeded", payload: { records: ["synthetic"] } } }); expect((await response.result).status).toBe("completed"); };
    try { await operation({ controller, scope, owner, issue, handled: (cap, context) => facts.get(cap)!.handled.add(context), gateway, sessionId: session.sessionId, sends, finish, fluxiq }); } finally { await gateway.close(); await controller.close(); }
  });
}
describe("private consumed outcomes with actual program SQLite and gateway", () => {
  it("manual observer call with exact committed receipt/result JSON cannot mint the initial ticket", async () => consumedFixture(async h => {
    const first = h.issue(0), context = await h.controller.issueEffect(h.scope, first.capability), original = Store.prototype.commitReceipt;
    let release!: () => void, committed!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { committed = resolve; });
    vi.spyOn(Store.prototype, "commitReceipt").mockImplementation(async function (this: Store, input, ack) { const result = await original.call(this, input, ack); committed(); await gate; return result; });
    const response = h.gateway.executeAction(h.sessionId, { actionType: "synthetic.action" }, { context }); for (let i = 0; i < 100 && !h.sends.length; i++) await new Promise(resolve => setTimeout(resolve, 5));
    const parsed = { commandId: response.commandId, status: "succeeded" as const, payload: { records: ["synthetic"] } }, receive = h.gateway.receive(h.sessionId, { id: "held.ack", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: parsed }); await ready;
    const exact = { binding: { schemaVersion: "gateway_command.v1" as const, ...ClientGatewayCommandContext.owner(context), commandId: response.commandId, clientId: "synthetic.client", sessionId: h.sessionId }, requestDigest: Rules.digest({ actionType: "synthetic.action" }) }, record = await h.controller.read(h.scope, exact); expect(record?.state).toBe("committed");
    try { await expect(Outcome.observer(context)!.completed({ context, claim: exact, receipt: structuredClone(record!.receipt), result: structuredClone(parsed) })).rejects.toThrow("foreign_completion_proof"); } finally { release(); await receive; }
    expect(await response.result).toEqual({ status: "outcome_unknown" }); h.handled(first.capability, context); await expect(h.controller.consume(first.consumer, context)).rejects.toThrow(); await expect(h.controller.checkpoint(h.scope)).rejects.toThrow(); expect(h.sends).toHaveLength(1);
  }));
  it("permits a second distinct effect only after a genuine live proof and private post-handling witness", async () => consumedFixture(async h => {
    const first = h.issue(0), context = await h.controller.issueEffect(h.scope, first.capability); await h.finish(context); h.handled(first.capability, context); await h.controller.consume(first.consumer, context); await h.controller.checkpoint(h.scope);
    const second = h.issue(1), next = await h.controller.issueEffect(h.scope, second.capability); const response = h.gateway.executeAction(h.sessionId, { actionType: "synthetic.action" }, { context: next });
    for (let i = 0; i < 100 && h.sends.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 5));
    await h.gateway.receive(h.sessionId, { id: "second.ack", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: response.commandId, status: "succeeded" } }); expect((await response.result).status).toBe("completed"); h.handled(second.capability, next); await h.controller.consume(second.consumer, next); await h.controller.checkpoint(h.scope); expect(h.sends).toHaveLength(2);
    const program = h.fluxiq.programs.automationStudio, pool = (program as unknown as { projectDatabasePool: AutomationStudioProjectDatabasePool }).projectDatabasePool;
    const reconstructed = new Controller({ pool, getRuntimeSession: (projectId, runId) => program.getRuntimeSession(projectId, runId) }); try { await expect(reconstructed.open(h.owner)).rejects.toThrow("prior_run_claim"); } finally { await reconstructed.close(); }
  }));
  it.each(["missing_handling", "copied_consumer", "duplicate_consumption", "second_unconsumed", "counterfeit_completion", "receipt_only_replay", "terminal_after_receipt"])("%s cannot clear the scope even with an actual matching committed receipt", async kind => consumedFixture(async h => {
    const first = h.issue(0), context = await h.controller.issueEffect(h.scope, first.capability); await h.finish(context);
    if (kind === "counterfeit_completion") { const observer = Outcome.observer(context)!, original = { binding: { schemaVersion: "gateway_command.v1" as const, ...ClientGatewayCommandContext.owner(context), commandId: Rules.commandId(ClientGatewayCommandContext.owner(context)), clientId: "synthetic.client", sessionId: h.sessionId }, requestDigest: Rules.digest({ actionType: "synthetic.action", parameters: { items: [1, 2] } }) }, record = await h.controller.read(h.scope, original); expect(record?.state).toBe("committed"); await expect(observer.completed({ claim: original, receipt: structuredClone(record!.receipt), result: { commandId: original.binding.commandId, status: "succeeded", payload: { records: ["synthetic"] } } })).rejects.toThrow("foreign_completion_proof"); }
    else if (kind === "receipt_only_replay") { const replay = h.gateway.executeAction(h.sessionId, { actionType: "synthetic.action", parameters: { items: [1, 2] } }, { context }); expect(await replay.result).toEqual({ status: "outcome_unknown" }); h.handled(first.capability, context); await expect(h.controller.consume(first.consumer, context)).rejects.toThrow(); }
    else if (kind === "terminal_after_receipt") { await h.fluxiq.programs.automationStudio.cancelRuntimeSession(h.owner.projectId, h.owner.runId); h.handled(first.capability, context); await expect(h.controller.consume(first.consumer, context)).rejects.toThrow(); }
    else if (kind === "second_unconsumed") await expect(h.controller.issueEffect(h.scope, h.issue(1).capability)).rejects.toThrow("consumption_unsupported");
    else if (kind === "duplicate_consumption") { h.handled(first.capability, context); await h.controller.consume(first.consumer, context); await expect(h.controller.consume(first.consumer, context)).rejects.toThrow("unhandled_outcome"); }
    else { if (kind === "copied_consumer") h.handled(first.capability, context); await expect(h.controller.consume(kind === "copied_consumer" ? { ...first.consumer } : first.consumer, context)).rejects.toThrow("unhandled_outcome"); }
    await expect(h.controller.checkpoint(h.scope)).rejects.toThrow(); expect(h.sends).toHaveLength(1);
  }));
});
describe("actual stored root session closed command run scope", () => {
  it("cannot reopen the identical run to bypass sticky uncertainty when a claim failed before durable insertion", async () => fixture(async (controller, fluxiq, owner) => {
    const scope = await controller.open(owner), input = claim(owner);
    vi.spyOn(Store.prototype, "claimForRun").mockRejectedValueOnce(new Error("synthetic.claim_unavailable"));
    await expect(controller.claim(scope, input)).rejects.toThrow("synthetic.claim_unavailable");
    await expect(controller.checkpoint(scope)).rejects.toThrow();
    expect(await controller.read(scope, input)).toBeNull();
    await expect(controller.open(owner)).rejects.toThrow("scope_already_issued");
    const program = fluxiq.programs.automationStudio, original = await program.getRuntimeSession(owner.projectId, owner.runId);
    await program.cancelRuntimeSession(owner.projectId, owner.runId);
    await program.startRuntimeSession({ projectId: owner.projectId, runId: owner.runId, flow: { ...original!.flow!, name: "Synthetic replaced root" } });
    await expect(controller.open({ ...owner })).rejects.toThrow("scope_already_issued");
    await controller.close(scope); await controller.close(scope);
    await expect(controller.open({ ...owner })).rejects.toThrow("scope_already_issued");
  }));
  it("claims one actual command, never consumes supplied success receipts, refuses second key and reconstructed committed run", async () => fixture(async (controller, fluxiq, owner) => {
    const scope = await controller.open(owner), input = claim(owner); await controller.checkpoint(scope);
    expect((await controller.claim(scope, input)).sendAllowed).toBe(true); await controller.commitReceipt(scope, input, receipt(input));
    await expect(controller.checkpoint(scope)).rejects.toThrow("consumption_unsupported");
    expect(() => controller.claim(scope, claim(owner, "invoke.2"))).toThrow("first_command_only");
    const replay = await controller.claim(scope, input); expect(replay.sendAllowed).toBe(false); expect(replay.record.state).toBe("committed");
    await expect(controller.open(owner)).rejects.toThrow("scope_already_issued");
    const program = fluxiq.programs.automationStudio, pool = (program as unknown as { projectDatabasePool: AutomationStudioProjectDatabasePool }).projectDatabasePool;
    const reconstructed = new Controller({ pool, getRuntimeSession: (projectId, runId) => program.getRuntimeSession(projectId, runId) });
    try { await expect(reconstructed.open(owner)).rejects.toThrow("prior_run_claim"); } finally { await reconstructed.close(); }
  }));
  it("refuses copied/foreign scopes, wrong root/project/run and unsupported IDs", async () => fixture(async (controller, _fluxiq, owner) => {
    const scope = await controller.open(owner), input = claim(owner);
    for (const foreign of [JSON.parse(JSON.stringify(scope)), AutomationStudioCommandRunScope.create()]) expect(() => controller.claim(foreign, input)).toThrow("foreign_scope");
    const other = new Controller({ getRuntimeSession: async () => null }); expect(() => other.claim(scope, input)).toThrow("foreign_scope"); await other.close();
    expect(() => controller.claim(scope, claim({ ...owner, rootFlowId: "flow.child" }))).toThrow("claim_owner_conflict");
    await expect(controller.open({ ...owner, rootFlowId: "flow.wrong" })).rejects.toThrow("invalid_stored_session");
    expect(() => controller.open({ ...owner, runId: "unsupported/run" })).toThrow("invalid_owner_id");
    expect(() => controller.open({ ...owner, consumed: true } as typeof owner)).toThrow("invalid_open_options");
    expect(() => new Controller({ getRuntimeSession: async () => null }).open(owner)).toThrow("storage_unavailable");
  }));
  it.each(["abort", "terminal"])("keeps exact first reconciliation after %s but blocks continuation and another key", async kind => fixture(async (controller, fluxiq, owner) => {
    const abort = new AbortController(), scope = await controller.open({ ...owner, signal: abort.signal }), input = claim(owner); await controller.claim(scope, input);
    if (kind === "abort") abort.abort(); else await fluxiq.programs.automationStudio.cancelRuntimeSession(owner.projectId, owner.runId);
    await expect(controller.checkpoint(scope)).rejects.toThrow();
    expect((await controller.markUnknown(scope, input, "send_uncertain")).state).toBe("unknown");
    expect((await controller.commitReceipt(scope, input, receipt(input))).state).toBe("committed");
    expect((await controller.read(scope, input))?.state).toBe("committed");
    expect(() => controller.read(scope, claim(owner, "invoke.2"))).toThrow("not_first_claim");
    expect(() => controller.claim(scope, claim(owner, "invoke.2"))).toThrow("first_command_only");
    await expect(controller.checkpoint(scope)).rejects.toThrow();
  }));
  it("rejects postawait cancelled opening and closes the actual opened store", async () => fixture(async (controller, fluxiq, owner) => {
    const original = Store.open, closed = vi.fn();
    vi.spyOn(Store, "open").mockImplementation(async options => { const store = await original(options), close = store.close.bind(store); vi.spyOn(store, "close").mockImplementation(async () => { closed(); await close(); }); await fluxiq.programs.automationStudio.cancelRuntimeSession(owner.projectId, owner.runId); return store; });
    await expect(controller.open(owner)).rejects.toThrow("invalid_stored_session"); expect(closed).toHaveBeenCalledTimes(1);
  }));
  it("rejects changed original root fingerprint after an await without inventing node provenance", async () => fixture(async (_controller, fluxiq, owner) => {
    let reads = 0;
    const program = fluxiq.programs.automationStudio, pool = (program as unknown as { projectDatabasePool: AutomationStudioProjectDatabasePool }).projectDatabasePool;
    const controller = new Controller({ pool, getRuntimeSession: async (projectId, runId) => { const stored = await program.getRuntimeSession(projectId, runId); if (++reads > 1 && stored?.flow) return { ...stored, flow: { ...stored.flow, name: "Changed root" } }; return stored; } });
    try { await expect(controller.open(owner)).rejects.toThrow("owner_changed"); } finally { await controller.close(); }
  }));
  it("close invalidates admission immediately and waits for actual delayed claim before lease release", async () => fixture(async (controller, _fluxiq, owner) => {
    const scope = await controller.open(owner), input = claim(owner), original = Store.prototype.claimForRun;
    let release!: () => void, entered!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
    vi.spyOn(Store.prototype, "claimForRun").mockImplementation(async function (this: Store, claim, admission) { entered(); await held; return original.call(this, claim, admission); });
    const pending = controller.claim(scope, input); await started; let ended = false; const closing = controller.close().then(() => { ended = true; });
    expect(() => controller.claim(scope, input)).toThrow("closed"); await Promise.resolve(); expect(ended).toBe(false); release();
    await expect(pending).rejects.toThrow(); await closing; expect(ended).toBe(true);
  }));
  it("close waits pending open and closes rejected lease without registering a scope", async () => fixture(async (controller, _fluxiq, owner) => {
    const original = Store.open; let release!: () => void, entered!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; }); const closed = vi.fn();
    vi.spyOn(Store, "open").mockImplementation(async options => { const store = await original(options), close = store.close.bind(store); vi.spyOn(store, "close").mockImplementation(async () => { closed(); await close(); }); entered(); await held; return store; });
    const opening = controller.open(owner); await started; let ended = false; const closing = controller.close().then(() => { ended = true; }); await Promise.resolve(); expect(ended).toBe(false); release();
    await expect(opening).rejects.toThrow("closed"); await closing; expect(closed).toHaveBeenCalledTimes(1);
  }));
  it("aggregates cleanup error with rejected stale opening and exposes it again from controller drain", async () => fixture(async (controller, fluxiq, owner) => {
    const original = Store.open;
    const spy = vi.spyOn(Store, "open").mockImplementation(async options => { const store = await original(options), close = store.close.bind(store); vi.spyOn(store, "close").mockImplementation(async () => { await close(); throw new Error("synthetic.cleanup_failed"); }); await fluxiq.programs.automationStudio.cancelRuntimeSession(owner.projectId, owner.runId); return store; });
    await expect(controller.open(owner)).rejects.toMatchObject({ message: "command_run.rejected_open_cleanup_failed", errors: [expect.any(Error), expect.objectContaining({ message: "synthetic.cleanup_failed" })] }); spy.mockRestore();
    await expect(controller.close()).rejects.toMatchObject({ message: "command_run.close_failed", errors: [expect.objectContaining({ message: "synthetic.cleanup_failed" })] });
  }, true));
});

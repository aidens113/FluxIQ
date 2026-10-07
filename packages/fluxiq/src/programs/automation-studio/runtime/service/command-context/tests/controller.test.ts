import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FluxIQ } from "../../../../../../framework/index.ts";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayCommandContext, type ClientGatewayClientMessage } from "../../../../../../client-gateway/index.ts";
import { ClientGatewayCommandLedgerController as Rules, type ClientGatewayCommandClaim } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import { AutomationStudioProjectCommandLedgerStore } from "../../../../storage/project/index.ts";
import { AutomationStudioCommandContextController } from "../index.ts";

async function fixture(operation: (fluxiq: FluxIQ, owner: { projectId: string; runId: string; flowId: string; invocationId: string; attemptId: string; effectOrdinal: number }) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "gateway-program-context-"));
  const bootstrap = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
  for (const [key, value] of Object.entries(bootstrap.paths)) {
    if (key === "domainId" || typeof value !== "string") continue;
    const relative = path.relative(root, path.resolve(value));
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("Refusing program fixture paths outside owned root");
  }
  try { await bootstrap.setup(); } finally { await bootstrap.close(); }
  const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
  try {
    const project = await fluxiq.programs.automationStudio.createProject({ name: "Synthetic gateway context", domainId: "synthetic.domain" });
    const flow = { schemaVersion: "0.1" as const, flowId: "flow.1", ownerKind: "routine" as const, ownerId: "routine.1", name: "Synthetic queued Flow", nodes: [], edges: [], createdAt: 1, updatedAt: 1 };
    const session = await fluxiq.programs.automationStudio.startRuntimeSession({ projectId: project.id, runId: "run.1", flow });
    await operation(fluxiq, { projectId: project.id, runId: session.runId, flowId: session.flowId, invocationId: "invoke.1", attemptId: "node.attempt.1", effectOrdinal: 0 });
  } finally {
    vi.restoreAllMocks(); await fluxiq.close();
    const resolved = path.resolve(root); if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("gateway-program-context-")) throw new Error("Refusing cleanup outside owned program context");
    await rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}
async function pair(fluxiq: FluxIQ, sends: unknown[]) {
  const gateway = fluxiq.programs.clientGateway, client = gateway.connect({ socket: { send: raw => { const message = JSON.parse(raw); if (message.type === "server.execute_action") sends.push(message); } } });
  await gateway.receive(client.sessionId, { id: "hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId: "synthetic.client", clientType: "extension", capabilities: [] } });
  await gateway.approvePairing(gateway.snapshot().pairings[0]!.pairingCode, { approvedByUserId: "synthetic.user" }); gateway.clearOutbound(client.sessionId); return client.sessionId;
}
function ack(commandId: string): ClientGatewayClientMessage { return { id: "ack", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId, status: "succeeded", payload: { items: ["synthetic"] } } }; }
describe("actual stored program session, private project pool and production gateway composition", () => {
  it("uses production resolver and real SQL claim before socket and commits exact receipt before public result/event", async () => fixture(async (fluxiq, owner) => {
    const broker = fluxiq.programs.automationStudio.commandContexts, gateway = fluxiq.programs.clientGateway;
    const context = await broker.issue(owner), inspected = await broker.resolve(context); expect(inspected.ledger).toBeInstanceOf(AutomationStudioProjectCommandLedgerStore);
    const command = { actionType: "synthetic.action", parameters: { every: [1, 2] } }, sends: unknown[] = [], sessionId = await pair(fluxiq, sends);
    let claimCommittedBeforeSend = false;
    const ready = gateway.snapshot().sessions.find(session => session.sessionId === sessionId)!;
    const claim: ClientGatewayCommandClaim = { binding: { schemaVersion: "gateway_command.v1", ...owner, commandId: Rules.commandId(owner), clientId: ready.clientId, sessionId }, requestDigest: Rules.digest(command) };
    const originalResolve = broker.resolve.bind(broker);
    vi.spyOn(broker, "resolve").mockImplementation(async issued => {
      const lease = await originalResolve(issued), original = lease.ledger.claim.bind(lease.ledger);
      vi.spyOn(lease.ledger, "claim").mockImplementation(async input => { const result = await original(input); if (result.sendAllowed) { expect((await inspected.ledger.read(claim))?.state).toBe("pending"); claimCommittedBeforeSend = true; } return result; });
      return lease;
    });
    const response = gateway.executeAction(sessionId, command, { context });
    const deadline = Date.now() + 3000;
    while (sends.length === 0) { if (Date.now() > deadline) throw new Error("Owned gateway SQL claim/send deadline"); await new Promise(resolve => setTimeout(resolve, 1)); }
    expect(claimCommittedBeforeSend).toBe(true);
    let eventCommitted = false;
    gateway.onEvent(async event => { if (event.type === "client.action_result") { expect((await inspected.ledger.read(claim))?.state).toBe("committed"); eventCommitted = true; } });
    const resultMessage = ack(response.commandId); await gateway.receive(sessionId, resultMessage);
    const result = await response.result; expect(result).toMatchObject({ status: "completed", result: { status: "succeeded" }, receipt: { resultDigest: Rules.digest(resultMessage.payload) } }); expect(eventCommitted).toBe(true);
    expect(await gateway.executeAction(sessionId, command, { context }).result).toMatchObject({ status: "result_unavailable" }); expect(sends).toHaveLength(1);
    await inspected.close();
  }));
  it("refuses forged/foreign/root-mismatched/terminal stored contexts and missing SQL before send", async () => fixture(async (fluxiq, owner) => {
    const broker = fluxiq.programs.automationStudio.commandContexts, context = await broker.issue(owner), sends: unknown[] = [], sessionId = await pair(fluxiq, sends);
    await expect(broker.resolve(ClientGatewayCommandContext.issue(owner))).rejects.toThrow("stale_or_foreign_owner");
    await expect(broker.issue({ ...owner, projectId: "unknown.project" })).rejects.toThrow(); await expect(broker.issue({ ...owner, flowId: "other.root" })).rejects.toThrow("invalid_stored_session");
    expect(() => fluxiq.programs.clientGateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context: JSON.parse(JSON.stringify(context)) })).toThrow("not_issued");
    await fluxiq.programs.automationStudio.cancelRuntimeSession(owner.projectId, owner.runId);
    await expect(fluxiq.programs.clientGateway.executeAction(sessionId, { actionType: "synthetic.action" }, { context }).result).rejects.toThrow("invalid_stored_session");
    await expect(broker.issue(owner)).rejects.toThrow("invalid_stored_session"); expect(sends).toHaveLength(0);
    const missing = new AutomationStudioCommandContextController({ getRuntimeSession: async () => null }); await expect(missing.issue(owner)).rejects.toThrow("storage_unavailable"); await missing.close();
  }));
  it("cancellation during actual SQL lease opening invalidates context and closes the opened store", async () => fixture(async (fluxiq, owner) => {
    const broker = fluxiq.programs.automationStudio.commandContexts, context = await broker.issue(owner), original = AutomationStudioProjectCommandLedgerStore.open;
    let closed = 0;
    vi.spyOn(AutomationStudioProjectCommandLedgerStore, "open").mockImplementation(async input => {
      const store = await original(input), close = store.close.bind(store);
      vi.spyOn(store, "close").mockImplementation(async () => { closed++; await close(); });
      await fluxiq.programs.automationStudio.cancelRuntimeSession(owner.projectId, owner.runId); return store;
    });
    await expect(broker.resolve(context)).rejects.toThrow("invalid_stored_session"); expect(closed).toBe(1);
  }));
});

// Production order intentionally loads Framework before executor/controller collaborators.
import { FluxIQ } from "../../../../../../framework/index.ts";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, ClientGatewayCommandContext } from "../../../../../../client-gateway/index.ts";
import { defineOutput } from "../../../../../../io/index.ts";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";

const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.production", ownerKind: "routine", ownerId: "routine.synthetic", name: "Synthetic production effects", createdAt: 1, updatedAt: 1, nodes: [
  { id: "first", definitionId: "builtin.policy.action", parameterValues: { outputId: "synthetic.action", parameters: { value: 1 }, timeoutMs: 1000 } },
  { id: "second", definitionId: "builtin.policy.action", parameterValues: { outputId: "synthetic.action", parameters: { value: 2 }, timeoutMs: 1000 } }
], edges: [{ id: "first.second", sourceNodeId: "first", sourcePortId: "success", targetNodeId: "second", targetPortId: "in" }] };
async function fixture(mode: "io" | "runtime", operation: (h: { fluxiq: FluxIQ; projectId: string; sends: unknown[]; contexts: ClientGatewayCommandContext[]; legacy: ReturnType<typeof vi.fn>; acknowledge(value: boolean): void }) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "actual-command-service-")), bootstrap = FluxIQ.create({ rootDir: root, domainId: "synthetic.domain", loadEnv: false, modelProvidersEnabled: false });
  for (const [key, value] of Object.entries(bootstrap.paths)) if (key !== "domainId" && typeof value === "string") { const relative = path.relative(root, path.resolve(value)); if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("nonowned setup path"); }
  try { await bootstrap.setup(); } finally { await bootstrap.close(); }
  const fluxiq = FluxIQ.create({ rootDir: root, domainId: "synthetic.domain", loadEnv: false, modelProvidersEnabled: false }), gateway = fluxiq.programs.clientGateway;
  const sends: unknown[] = [], contexts: ClientGatewayCommandContext[] = [], legacy = vi.fn(() => { throw new Error("legacy action invoked"); }); let ack = true;
  const client = gateway.connect({ socket: { send: raw => { const envelope = JSON.parse(raw); if (envelope.type !== "server.execute_action") return; sends.push(envelope); if (ack) queueMicrotask(() => { void gateway.receive(client.sessionId, { id: `ack.${sends.length}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: envelope.payload.commandId, status: "succeeded", payload: { synthetic: sends.length } } }); }); } } });
  try {
    const dispatch = async (context: ClientGatewayCommandContext, parameters: JsonObject, signal?: AbortSignal) => { contexts.push(context); const response = await gateway.executeAction(client.sessionId, { actionType: "synthetic.action", parameters, timeoutMs: ack ? 1000 : 20 }, { context, ...(signal ? { signal } : {}) }).result; if (response.status !== "completed") throw new Error("synthetic durable unknown"); return response.result; };
    fluxiq.io.registerOutput("synthetic.domain", defineOutput({ definition: { id: "synthetic.action", title: "Synthetic" }, mode: "request", dispatch: legacy, dispatchWithCommandContext: async request => { const result = await dispatch(request.commandContext!, request.payload as JsonObject, request.signal); return { outputId: request.outputId, ok: result.status === "succeeded", ...(result.payload !== undefined ? { payload: result.payload } : {}) }; } }));
    if (mode === "runtime") fluxiq.runtime.registerAdapter({ adapterId: "synthetic.production", label: "Synthetic", transport: "direct", domainId: "synthetic.domain", capabilities: () => [{ id: "synthetic.action", kind: "action", domainId: "synthetic.domain", actionTypes: ["synthetic.action"], outputIds: ["synthetic.action"] }], execute: legacy, executeWithCommandContext: async (command, context) => { const result = await dispatch(context.commandContext!, command.parameters ?? {}, context.signal); return { ...result, commandId: command.commandId! }; } });
    await gateway.receive(client.sessionId, { id: "hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId: "synthetic.client", clientType: "extension", capabilities: [] } });
    const pairing = gateway.snapshot().pairings.find(item => item.requestedBySessionId === client.sessionId)!; await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
    const project = await fluxiq.programs.automationStudio.createProject({ name: "Synthetic required production", domainId: "synthetic.domain" });
    await operation({ fluxiq, projectId: project.id, sends, contexts, legacy, acknowledge: value => { ack = value; } });
  } finally {
    vi.restoreAllMocks(); await fluxiq.close();
    const owned = path.resolve(root); if (path.dirname(owned) !== path.resolve(os.tmpdir()) || !path.basename(owned).startsWith("actual-command-service-")) throw new Error("nonowned fixture cleanup"); await rm(owned, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}
describe("actual runRuntimeSession required-mode production registration", () => {
  for (const mode of ["io", "runtime"] as const) it(`${mode}: real service, framework resolver, gateway and SQL admit two captured effects`, async () => fixture(mode, async h => {
    const program = h.fluxiq.programs.automationStudio;
    const adaptation = vi.spyOn(program, "resolveRuntimeAdaptationContext");
    const result = await program.runRuntimeSession({ projectId: h.projectId, flow, commandOutcomeMode: "required", adaptiveMode: "no_llm_intervention", idempotencyKey: "synthetic.required" });
    expect(result.status, result.trace?.message).toBe("succeeded"); expect(result.metadata?.commandOutcomeMode).toBe("required");
    expect(h.sends).toHaveLength(2); expect(h.legacy).not.toHaveBeenCalled(); expect(adaptation).not.toHaveBeenCalled();
    expect(h.contexts.map(context => ClientGatewayCommandContext.owner(context).flowId)).toEqual([flow.flowId, flow.flowId]);
    expect(new Set(h.contexts.map(context => ClientGatewayCommandContext.owner(context).invocationId)).size).toBe(2);
    await expect(program.runRuntimeSession({ projectId: h.projectId, idempotencyKey: "synthetic.required" })).rejects.toThrow("idempotency_mode_mismatch");
    const stored = await program.getRuntimeSession(h.projectId, result.runId); expect(stored?.status).toBe("succeeded");
    await expect(program.runRuntimeSession({ projectId: h.projectId, runId: result.runId, commandOutcomeMode: "required" })).rejects.toThrow();
    await expect(program.runRuntimeSession({ projectId: h.projectId, runId: result.runId })).rejects.toThrow();
    const next = await program.runRuntimeSession({ projectId: h.projectId, flow, commandOutcomeMode: "required" });
    expect(next.status).toBe("succeeded"); expect(next.runId).not.toBe(result.runId); expect(h.sends).toHaveLength(4);
  }));
  it("real required timeout ends honestly and never dispatches second node or adaptation", async () => fixture("io", async h => {
    h.acknowledge(false); const program = h.fluxiq.programs.automationStudio, adaptation = vi.spyOn(program, "resolveRuntimeAdaptationContext");
    await expect(program.runRuntimeSession({ projectId: h.projectId, flow, commandOutcomeMode: "required" })).rejects.toThrow();
    const sessions = await program.listRuntimeSessions(h.projectId);
    expect(sessions).toHaveLength(1); const result = sessions[0]!;
    expect(result.status).toBe("failed"); expect(result.metadata?.commandOutcomeMode).toBe("required"); expect(h.sends).toHaveLength(1); expect(adaptation).not.toHaveBeenCalled(); expect(h.legacy).not.toHaveBeenCalled();
    expect(result.trace?.values ?? {}).toEqual({});
  }));
  it("invalid/storage/adaptive requests and existing legacy session upgrades refuse before actions", async () => fixture("io", async h => {
    const program = h.fluxiq.programs.automationStudio, start = vi.spyOn(h.fluxiq.programs.automationStudio, "startRuntimeSession");
    await expect(program.runRuntimeSession({ flow, commandOutcomeMode: "required" })).rejects.toThrow("storage_required");
    await expect(program.runRuntimeSession({ projectId: h.projectId, flow, commandOutcomeMode: "bad" as "required" })).rejects.toThrow("invalid_mode");
    await expect(program.runRuntimeSession({ projectId: h.projectId, flow, commandOutcomeMode: "required", adaptiveMode: "adaptive" as "no_llm_intervention" })).rejects.toThrow("adaptive_mode_unsupported");
    expect(start).not.toHaveBeenCalled();
    const existing = await program.startRuntimeSession({ projectId: h.projectId, flow, metadata: { idempotencyKey: "synthetic.legacy" } });
    await expect(program.runRuntimeSession({ projectId: h.projectId, flow, commandOutcomeMode: "required", idempotencyKey: "synthetic.legacy" })).rejects.toThrow("idempotency_mode_mismatch");
    await expect(program.runRuntimeSession({ projectId: h.projectId, runId: existing.runId, commandOutcomeMode: "required" })).rejects.toThrow();
    expect(h.sends).toHaveLength(0);
  }));
  it("actual cancel while ACK is pending preserves durable outcome and late ACK cannot continue", async () => fixture("io", async h => {
    h.acknowledge(false); const program = h.fluxiq.programs.automationStudio, gateway = h.fluxiq.programs.clientGateway;
    const adaptation = vi.spyOn(program, "resolveRuntimeAdaptationContext"), observed = program.runRuntimeSession({ projectId: h.projectId, flow, runId: "run.cancelled", commandOutcomeMode: "required" }).then(() => null, error => error);
    const deadline = Date.now() + 5000;
    while (!h.sends.length) { if (Date.now() > deadline) throw new Error("synthetic first action did not reach gateway"); await new Promise(resolve => setTimeout(resolve, 5)); }
    const actual = (await program.listRuntimeSessions(h.projectId)).find(session => session.status === "running")!;
    expect(actual).toBeDefined();
    const ended = await program.cancelRuntimeSession(h.projectId, actual.runId, "Synthetic explicit cancel");
    expect(ended?.status).toBe("cancelled"); expect(await observed).toBeInstanceOf(Error);
    const client = gateway.snapshot().sessions.find(session => session.clientId === "synthetic.client")!, first = h.sends[0] as { payload: { commandId: string } };
    await gateway.receive(client.sessionId, { id: "late.cancelled", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: first.payload.commandId, status: "succeeded", payload: { synthetic: "late" } } });
    expect(h.sends).toHaveLength(1); expect(adaptation).not.toHaveBeenCalled(); expect(h.legacy).not.toHaveBeenCalled();
    expect((await program.getRuntimeSession(h.projectId, actual.runId))?.status).toBe("cancelled");
  }));

});

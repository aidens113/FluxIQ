// t434: a required run on Core's own `ClientGatewayRuntimeTransport` -- no domain
// runtime adapter, a paired client that names its actions as action types --
// sends its commands and settles. Before, the runtime took that client for no
// match, so the command was never sent and the run stopped as if its answer had
// been lost. A command that provably never left now ends as an act that did not
// happen, never as Outcome uncertain.
import { FluxIQ } from "../../../../../../framework/index.ts";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../../../../client-gateway/index.ts";
import { defineOutput } from "../../../../../../io/index.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";

function flowOf(outputId: string): AutomationStudioFlowDocument {
  return { schemaVersion: "0.1", flowId: "flow.transport", ownerKind: "routine", ownerId: "routine.synthetic", name: "Synthetic transport effects", createdAt: 1, updatedAt: 1, nodes: [
    { id: "first", definitionId: "builtin.policy.action", parameterValues: { outputId, parameters: { value: 1 }, timeoutMs: 10_000 } },
    { id: "second", definitionId: "builtin.policy.action", parameterValues: { outputId, parameters: { value: 2 }, timeoutMs: 10_000 } }
  ], edges: [{ id: "first.second", sourceNodeId: "first", sourcePortId: "success", targetNodeId: "second", targetPortId: "in" }] };
}

type Harness = { fluxiq: FluxIQ; projectId: string; sends: Array<{ payload: { commandId: string; actionType: string } }>; legacy: ReturnType<typeof vi.fn> };

async function fixture(operation: (h: Harness) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "required-transport-")), bootstrap = FluxIQ.create({ rootDir: root, domainId: "synthetic.domain", loadEnv: false, modelProvidersEnabled: false });
  try { await bootstrap.setup(); } finally { await bootstrap.close(); }
  const fluxiq = FluxIQ.create({ rootDir: root, domainId: "synthetic.domain", loadEnv: false, modelProvidersEnabled: false }), gateway = fluxiq.programs.clientGateway;
  const sends: Harness["sends"] = [], legacy = vi.fn(() => { throw new Error("legacy output dispatch invoked"); });
  const client = gateway.connect({ socket: { send: raw => {
    const envelope = JSON.parse(raw);
    if (envelope.type !== "server.execute_action") return;
    sends.push(envelope);
    queueMicrotask(() => { void gateway.receive(client.sessionId, { id: `ack.${sends.length}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: envelope.payload.commandId, status: "succeeded", payload: { synthetic: sends.length } } }); });
  } } });
  try {
    // The output is known to IO only by its definition; nothing but the paired client can perform it.
    fluxiq.io.registerOutput("synthetic.domain", defineOutput({ definition: { id: "synthetic.action", title: "Synthetic" }, mode: "request", dispatch: legacy }));
    await gateway.receive(client.sessionId, { id: "hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId: "synthetic.client", clientType: "extension", capabilities: [{ id: "synthetic.actions", kind: "action", actionTypes: ["synthetic.action"], metadata: { domainId: "synthetic.domain" } }] } });
    const pairing = gateway.snapshot().pairings.find(item => item.requestedBySessionId === client.sessionId)!;
    await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
    const project = await fluxiq.programs.automationStudio.createProject({ name: "Synthetic required transport", domainId: "synthetic.domain" });
    // The Flow a run starts is a stored Flow with written instructions, as Core requires since t519.
    await fluxiq.programs.automationStudio.createFlow({ projectId: project.id, flowId: "flow.transport", name: "Synthetic transport effects" });
    await fluxiq.programs.automationStudio.saveFlowGenerationInstruction({ projectId: project.id, flowId: "flow.transport", instruction: "Send each synthetic action once." });
    await operation({ fluxiq, projectId: project.id, sends, legacy });
  } finally {
    vi.restoreAllMocks();
    await fluxiq.close();
    const owned = path.resolve(root);
    if (path.dirname(owned) !== path.resolve(os.tmpdir()) || !path.basename(owned).startsWith("required-transport-")) throw new Error("nonowned fixture cleanup");
    await rm(owned, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

describe("required run on Core's client gateway runtime transport", () => {
  it("sends each command to the paired client and settles", async () => fixture(async h => {
    const result = await h.fluxiq.programs.automationStudio.runRuntimeSession({ projectId: h.projectId, flow: flowOf("synthetic.action"), commandOutcomeMode: "required", adaptiveMode: "no_llm_intervention" });
    expect(result.status, result.trace?.message).toBe("succeeded");
    expect(h.sends.map(send => send.payload.actionType)).toEqual(["synthetic.action", "synthetic.action"]);
    expect(h.legacy).not.toHaveBeenCalled();
  }), 60_000);

  it("ends a command that never left as an act that did not happen, not as Outcome uncertain", async () => fixture(async h => {
    // Nothing registers this output, so the dispatcher answers without ever sending it.
    const program = h.fluxiq.programs.automationStudio;
    await program.runRuntimeSession({ projectId: h.projectId, flow: flowOf("synthetic.unregistered"), commandOutcomeMode: "required", adaptiveMode: "no_llm_intervention" }).catch(() => undefined);
    const sessions = await program.listRuntimeSessions(h.projectId);
    expect(sessions).toHaveLength(1);
    const result = sessions[0]!;
    expect(result.status).toBe("failed");
    expect(h.sends).toEqual([]);
    expect(h.legacy).not.toHaveBeenCalled();
    const first = result.trace?.attempts?.find(attempt => attempt.nodeId === "first");
    expect(first?.failure).toMatchObject({ code: "output_dispatch.output_not_registered", effect: "unacted" });
    expect(first?.failure?.code).not.toBe("executor.required_outcome_unknown");
    expect(result.trace?.message ?? "").not.toMatch(/Outcome uncertain|never came back/);
    expect(result.trace?.attempts?.some(attempt => attempt.nodeId === "second")).toBe(false);
  }), 60_000);
});

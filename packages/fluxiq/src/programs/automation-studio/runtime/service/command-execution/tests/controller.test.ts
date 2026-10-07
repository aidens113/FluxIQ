import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FluxIQ } from "../../../../../../framework/index.ts";
import { runAutomationStudioGraph } from "../../../executor.ts";
import { ClientGatewayService, CLIENT_GATEWAY_PROTOCOL_VERSION } from "../../../../../../client-gateway/index.ts";
import { ClientGatewayCommandContext } from "../../../../../../client-gateway/service/command-ledger/index.ts";
import { IoRegistry, defineOutput } from "../../../../../../io/index.ts";
import { RuntimeService } from "../../../../../../runtime/index.ts";
import { createIoPolicyEffectDispatcher, createRuntimePolicyEffectDispatcher } from "../../../io-policy.ts";
import type { AutomationStudioProjectDatabasePool } from "../../../../storage/project/index.ts";
import { createBlankAutomationStudioFlowArtifact, createCallFlowNode, createPublishedFlowSnapshot } from "../../../../model/index.ts";
import { runCanonicalAutomationStudioFlow } from "../../../composite-executor.ts";
import type { AutomationStudioFlowDocument } from "../../../../model/index.ts";
import { AutomationStudioCommandRunController, type AutomationStudioCommandEffectProvenance } from "../../command-run/index.ts";
import { AutomationStudioCommandExecutionController as Controller } from "../index.ts";

const flow: AutomationStudioFlowDocument = { schemaVersion: "0.1", flowId: "flow.root", ownerKind: "routine", ownerId: "routine.1", name: "Synthetic two effects", createdAt: 1, updatedAt: 1, nodes: [
  { id: "first", definitionId: "builtin.policy.action", parameterValues: { outputId: "synthetic.action", parameters: { value: 1 }, timeoutMs: 1000 } },
  { id: "second", definitionId: "builtin.policy.action", parameterValues: { outputId: "synthetic.action", parameters: { value: 2 } } }
], edges: [{ id: "first.second", sourceNodeId: "first", sourcePortId: "success", targetNodeId: "second", targetPortId: "in" }] };
async function fixture(operation: (h: { fluxiq: FluxIQ; controller: Controller; io: IoRegistry; runtime: RuntimeService; owner: { projectId: string; runId: string; rootFlowId: string }; contexts: ClientGatewayCommandContext[]; sends: unknown[]; legacy: ReturnType<typeof vi.fn>; acknowledge(value: boolean): void }) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "actual-command-execution-"));
  const bootstrap = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false });
  for (const [key, value] of Object.entries(bootstrap.paths)) if (key !== "domainId" && typeof value === "string") { const relative = path.relative(root, path.resolve(value)); if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("nonowned fixture path"); }
  try { await bootstrap.setup(); } finally { await bootstrap.close(); }
  const fluxiq = FluxIQ.create({ rootDir: root, loadEnv: false, modelProvidersEnabled: false }), program = fluxiq.programs.automationStudio;
  const pool = (program as unknown as { projectDatabasePool: AutomationStudioProjectDatabasePool }).projectDatabasePool;
  const controller = new Controller({ pool, getRuntimeSession: (projectId, runId) => program.getRuntimeSession(projectId, runId) });
  const gateway = new ClientGatewayService({ resolveCommandLedger: context => controller.resolve(context) });
  let ack = true;
  const sends: unknown[] = [], contexts: ClientGatewayCommandContext[] = [], legacy = vi.fn(() => { throw new Error("legacy handler executed"); });
  const session = gateway.connect({ socket: { send: raw => { const envelope = JSON.parse(raw); if (envelope.type !== "server.execute_action") return; sends.push(envelope); if (ack) queueMicrotask(() => { void gateway.receive(session.sessionId, { id: `ack.${sends.length}`, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.action_result", payload: { commandId: envelope.payload.commandId, status: "succeeded", payload: { synthetic: sends.length, records: [{ name: "synthetic record" }] } } }); }); } } });
  const io = new IoRegistry(), runtime = new RuntimeService();
  const invoke = async (context: ClientGatewayCommandContext, parameters: import("../../../../../../core/index.ts").JsonObject) => { contexts.push(context); return await gateway.executeAction(session.sessionId, { actionType: "synthetic.action", parameters, timeoutMs: ack ? 1000 : 20 }, { context }).result; };
  try {
  io.registerOutput("synthetic.domain", defineOutput({ definition: { id: "synthetic.action", title: "Synthetic" }, mode: "request", dispatch: legacy, dispatchWithCommandContext: async request => { const result = await invoke(request.commandContext!, request.payload as import("../../../../../../core/index.ts").JsonObject); if (result.status !== "completed") throw new Error("unknown durable outcome"); return { outputId: request.outputId, ok: result.result.status === "succeeded", ...(result.result.payload !== undefined ? { payload: result.result.payload } : {}) }; } }));
  runtime.registerAdapter({ adapterId: "synthetic.runtime", label: "Synthetic", transport: "direct", domainId: "synthetic.domain", capabilities: () => [{ id: "synthetic.action", kind: "action", domainId: "synthetic.domain", actionTypes: ["synthetic.action"], outputIds: ["synthetic.action"] }], execute: legacy, executeWithCommandContext: async (command, context) => { const result = await invoke(context.commandContext!, command.parameters ?? {}); if (result.status !== "completed") throw new Error("unknown durable outcome"); return { commandId: command.commandId!, status: result.result.status, ...(result.result.payload !== undefined ? { payload: result.result.payload } : {}) }; } });
    await gateway.receive(session.sessionId, { id: "hello", protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), type: "client.hello", payload: { clientId: "synthetic.client", clientType: "extension", capabilities: [] } });
    const pairing = gateway.snapshot().pairings.find(item => item.requestedBySessionId === session.sessionId)!; await gateway.approvePairing(pairing.pairingCode, { approvedByUserId: "synthetic.user" });
    const project = await program.createProject({ name: "Synthetic actual commands", domainId: "synthetic.domain" });
    const stored = await program.startRuntimeSession({ projectId: project.id, runId: "run.synthetic", flow });
    await operation({ fluxiq, controller, io, runtime, owner: { projectId: project.id, runId: stored.runId, rootFlowId: stored.flowId }, contexts, sends, legacy, acknowledge: value => { ack = value; } });
  } finally {
    await gateway.close(); await controller.close(); await fluxiq.close();
    const owned = path.resolve(root); if (path.dirname(owned) !== path.resolve(os.tmpdir()) || !path.basename(owned).startsWith("actual-command-execution-")) throw new Error("nonowned cleanup"); await rm(owned, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}
describe("actual executor private provenance, gateway and SQLite consumption", () => {
  for (const mode of ["io", "runtime"] as const) it(`${mode}: second actual effect is admitted only after first actual handling/SQL consumption`, async () => fixture(async h => {
    const commandRun = await h.controller.open(h.owner);
    const dispatcher = mode === "io" ? createIoPolicyEffectDispatcher(h.io, "synthetic.domain") : createRuntimePolicyEffectDispatcher(h.io, "synthetic.domain", h.runtime);
    const trace = await runAutomationStudioGraph(flow, { commandRun, signal: commandRun.signal, effectDispatcher: dispatcher });
    expect(trace.status, JSON.stringify({ message: trace.message, failures: trace.attempts.map(attempt => attempt.failure) })).toBe("succeeded"); expect(h.sends).toHaveLength(2); expect(h.legacy).not.toHaveBeenCalled();
    expect(h.contexts.map(context => ClientGatewayCommandContext.owner(context).flowId)).toEqual([flow.flowId, flow.flowId]);
    expect(new Set(h.contexts.map(context => ClientGatewayCommandContext.owner(context).invocationId)).size).toBe(2);
    await commandRun.checkpoint();
  }));
  it("timeout fences next-node output/state/recovery and copied consumer cannot issue", async () => fixture(async h => {
    const commandRun = await h.controller.open(h.owner); h.acknowledge(false);
    await expect(commandRun.context(Object.freeze({}), 0)).rejects.toThrow("foreign_node_entry");
    const trace = await runAutomationStudioGraph(flow, { commandRun, signal: commandRun.signal, effectDispatcher: createIoPolicyEffectDispatcher(h.io, "synthetic.domain") });
    expect(trace.status).toBe("failed"); expect(h.sends).toHaveLength(1); expect(trace.values).toEqual({});
    await expect(commandRun.checkpoint()).rejects.toThrow();
  }));
  it("custom native and custom composite implementations refuse before invocation", async () => fixture(async h => {
    const commandRun = await h.controller.open(h.owner), nativeNodeExecutor = vi.fn(async () => ({ result: { status: "success" as const } })), compositeExecutor = vi.fn(async () => ({ result: { status: "success" as const } }));
    const trace = await runAutomationStudioGraph({ ...flow, nodes: [{ id: "custom", definitionId: "custom.code" }], edges: [] }, { commandRun, signal: commandRun.signal, nativeNodeExecutor, compositeExecutor });
    expect(trace.status).toBe("failed"); expect(nativeNodeExecutor).not.toHaveBeenCalled(); expect(compositeExecutor).not.toHaveBeenCalled(); expect(h.sends).toHaveLength(0);
  }));
  it("borrowed capability with equal state/consumer refuses before durable consumption", async () => fixture(async h => {
    const issued: object[] = [], original = AutomationStudioCommandRunController.prototype.issueEffect;
    const spy = vi.spyOn(AutomationStudioCommandRunController.prototype, "issueEffect").mockImplementation(function (this: AutomationStudioCommandRunController, scope, capability) { issued.push(capability); return original.call(this, scope, capability); });
    const consume = vi.spyOn(AutomationStudioCommandRunController.prototype, "consume"), commandRun = await h.controller.open(h.owner);
    try {
      const trace = await runAutomationStudioGraph(flow, { commandRun, signal: commandRun.signal, effectDispatcher: createIoPolicyEffectDispatcher(h.io, "synthetic.domain") });
      expect(trace.status).toBe("succeeded"); expect(consume).toHaveBeenCalledTimes(2);
      const effects = (h.controller as unknown as { effects: WeakMap<object, { consumer: object; provenance: AutomationStudioCommandEffectProvenance }> }).effects;
      const borrowed = Object.freeze({}), originalEffect = effects.get(issued[0]!)!; effects.set(borrowed, originalEffect);
      await expect(commandRun.consume(originalEffect.consumer, borrowed, h.contexts[0]!)).rejects.toThrow("foreign_handling");
      expect(consume).toHaveBeenCalledTimes(2);
    } finally { spy.mockRestore(); consume.mockRestore(); }
  }));
  it("exact per-run close drains existing work, rejects late starts, and preserves other live run", async () => fixture(async h => {
    const first = await h.controller.open(h.owner), stored = await h.fluxiq.programs.automationStudio.startRuntimeSession({ projectId: h.owner.projectId, runId: "run.concurrent", flow });
    const second = await h.controller.open({ ...h.owner, runId: stored.runId });
    let release!: () => void, drained = false;
    const held = first.own(() => new Promise<void>(resolve => { release = resolve; }));
    const closing = h.controller.closeRun(first).then(() => { drained = true; });
    expect(first.signal.aborted).toBe(true); await second.checkpoint();
    const late = vi.fn(async () => undefined); expect(() => first.own(late)).toThrow(); expect(late).not.toHaveBeenCalled();
    await Promise.resolve(); expect(drained).toBe(false); release(); await held; await closing; expect(drained).toBe(true);
    await second.checkpoint(); await expect(h.controller.open(h.owner)).rejects.toThrow();
    expect(() => h.controller.closeRun({ ...second })).toThrow("foreign_run");
  }));

  it("canonical selected child has fresh actual invocation identities and retains original root wire Flow", async () => fixture(async h => {
    const child = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.child", projectId: h.owner.projectId, name: "Synthetic child", now: 1 }), nodes: flow.nodes, edges: flow.edges };
    const parent = { ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.parent", projectId: h.owner.projectId, name: "Synthetic parent", now: 1 }), nodes: [createCallFlowNode({ id: "call", target: { flowId: child.flowId, version: "1.0.0", scope: { kind: "global" } } })] };
    const document: AutomationStudioFlowDocument = { ...flow, flowId: parent.flowId, nodes: parent.nodes, edges: parent.edges };
    const stored = await h.fluxiq.programs.automationStudio.startRuntimeSession({ projectId: h.owner.projectId, runId: "run.child", flow: document });
    const commandRun = await h.controller.open({ ...h.owner, runId: stored.runId, rootFlowId: parent.flowId });
    const trace = await runCanonicalAutomationStudioFlow(parent, [createPublishedFlowSnapshot(child, "1.0.0", 2)], { commandRun, signal: commandRun.signal, effectDispatcher: createIoPolicyEffectDispatcher(h.io, "synthetic.domain") });
    expect(trace.status, trace.message).toBe("succeeded"); expect(h.sends).toHaveLength(2);
    expect(h.contexts.map(context => ClientGatewayCommandContext.owner(context).flowId)).toEqual([parent.flowId, parent.flowId]);
    expect(new Set(h.contexts.map(context => ClientGatewayCommandContext.owner(context).invocationId)).size).toBe(2);
    expect(trace.attempts[0]?.childTrace?.attempts.map(attempt => attempt.nodeId)).toEqual(["first", "second"]);
  }));
  it("configured record persistence failure cannot consume performed receipt or reach next node", async () => fixture(async h => {
    const commandRun = await h.controller.open(h.owner), persist = vi.fn(async () => { throw new Error("synthetic persistence failure"); }), consume = vi.spyOn(AutomationStudioCommandRunController.prototype, "consume");
    try {
      const recordOutput = { datasetId: "synthetic.records", recordsPath: "records", writeMode: "append", schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string", required: true }] } };
      const captured = { ...flow, nodes: [{ ...flow.nodes[0]!, parameterValues: { ...flow.nodes[0]!.parameterValues, recordOutput } }, flow.nodes[1]!] };
      const trace = await runAutomationStudioGraph(captured, { commandRun, signal: commandRun.signal, effectDispatcher: createIoPolicyEffectDispatcher(h.io, "synthetic.domain"), onRecordBatch: persist });
      expect(trace.status).toBe("failed"); expect(persist).toHaveBeenCalledTimes(1); expect(h.sends).toHaveLength(1); expect(consume).not.toHaveBeenCalled(); expect(trace.values).toEqual({});
      await expect(commandRun.checkpoint()).rejects.toThrow();
    } finally { consume.mockRestore(); }
  }));

  it("exact run close retains actual gateway lease until held post-COMMIT observer drains", async () => fixture(async h => {
    const run = await h.controller.open(h.owner);
    let release!: () => void, arrived!: () => void, drained = false;
    const held = new Promise<void>(resolve => { release = resolve; }), observing = new Promise<void>(resolve => { arrived = resolve; });
    // Hold the actual private observer branch without replacing its registered reference or fabricating proof.
    const inner = (h.controller as unknown as { commandRuns: { observe(...args: unknown[]): Promise<void> } }).commandRuns;
    const observe = inner.observe.bind(inner);
    const dispose = vi.spyOn(h.controller as unknown as { disposeRuns(scope?: object): Promise<void> }, "disposeRuns");
    const observingOwner = vi.spyOn(inner, "observe").mockImplementation(async (...args) => { arrived(); await held; await observe(...args); });
    try {
      const executing = runAutomationStudioGraph(flow, { commandRun: run, signal: run.signal, effectDispatcher: createIoPolicyEffectDispatcher(h.io, "synthetic.domain") });
      await observing;
      expect((await executing).status).toBe("failed");
      const closing = h.controller.closeRun(run).then(() => { drained = true; });
      await new Promise(resolve => setTimeout(resolve, 30));
      expect(drained).toBe(false); expect(dispose).not.toHaveBeenCalled(); expect(run.signal.aborted).toBe(true); expect(h.sends).toHaveLength(1);
      release(); await closing;
      expect(drained).toBe(true); expect(dispose).toHaveBeenCalledTimes(1); expect(h.sends).toHaveLength(1);
    } finally { release(); observingOwner.mockRestore(); dispose.mockRestore(); }
  }));

  it("cancelled in-flight actual lease resolution closes rejected lease without leaking its drain pin", async () => fixture(async h => {
    const run = await h.controller.open(h.owner);
    const inner = (h.controller as unknown as { commandRuns: AutomationStudioCommandRunController }).commandRuns;
    const original = inner.resolve.bind(inner);
    let release!: () => void, arrived!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; }), resolving = new Promise<void>(resolve => { arrived = resolve; });
    const leaseClose = vi.fn(async () => undefined);
    const resolve = vi.spyOn(inner, "resolve").mockImplementation(async context => { const lease = await original(context); arrived(); await held; return { ...lease, close: async () => { await lease.close(); await leaseClose(); } }; });
    try {
      const executing = runAutomationStudioGraph(flow, { commandRun: run, signal: run.signal, effectDispatcher: createIoPolicyEffectDispatcher(h.io, "synthetic.domain") });
      await resolving; const closing = h.controller.closeRun(run); release();
      expect((await executing).status).toBe("failed"); await closing;
      expect(leaseClose).toHaveBeenCalledTimes(1); expect(h.sends).toHaveLength(0);
    } finally { release(); resolve.mockRestore(); }
  }));

  it("post-open closed owner preserves original refusal plus cleanup failure and retains it for global close", async () => fixture(async h => {
    const program = h.fluxiq.programs.automationStudio, pool = (program as unknown as { projectDatabasePool: AutomationStudioProjectDatabasePool }).projectDatabasePool;
    const stored = await program.startRuntimeSession({ projectId: h.owner.projectId, runId: "run.openfailure", flow });
    const originalOpen = AutomationStudioCommandRunController.prototype.open, originalClose = AutomationStudioCommandRunController.prototype.close;
    const close = vi.spyOn(AutomationStudioCommandRunController.prototype, "close").mockImplementation(async function (this: AutomationStudioCommandRunController, scope) { await originalClose.call(this, scope); if (scope) throw new Error("synthetic cleanup failure"); });
    let extra!: Controller, observedClose: Promise<unknown> | undefined;
    const open = vi.spyOn(AutomationStudioCommandRunController.prototype, "open").mockImplementation(async function (this: AutomationStudioCommandRunController, owner) { const scope = await originalOpen.call(this, owner); observedClose = extra.close().then(() => null, error => error); return scope; });
    extra = new Controller({ pool, getRuntimeSession: (projectId, runId) => program.getRuntimeSession(projectId, runId) });
    try {
      const error = await extra.open({ ...h.owner, runId: stored.runId }).then(() => null, reason => reason);
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors.map(item => item.message)).toEqual(["command_execution.closed", "synthetic cleanup failure"]);
      expect(await observedClose).toBeInstanceOf(AggregateError);
    } finally { open.mockRestore(); close.mockRestore(); }
  }));

});

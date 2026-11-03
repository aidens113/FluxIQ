// @fluxiq-test-group real-sql
import { afterEach, expect, it, vi } from "vitest";
import type { ClientGatewayStartRecordingRequest } from "@fluxiq/contracts/client-gateway";
import { defineInput, defineOutput, IoRegistry } from "../../../../io/index.ts";
import { AutomationStudioService } from "../../runtime/index.ts";
import { recordingScopeGate, trustedRecordingFixture } from "./trusted-scope/index.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanups.splice(0).map(close => close()));
});

async function fixture(options?: Parameters<typeof trustedRecordingFixture>[0]) {
  const actual = await trustedRecordingFixture(options);
  cleanups.push(actual.close);
  return actual;
}

function outcome<T>(task: Promise<T>) {
  return task.then(value => ({ kind: "fulfilled" as const, value }), error => ({ kind: "rejected" as const, error: error as unknown }));
}

async function reached(gate: ReturnType<typeof recordingScopeGate>, running: Promise<unknown>): Promise<void> {
  await Promise.race([gate.entered, running.then(() => { throw new Error("fixture.original_boundary_not_reached"); })]);
}

it("persists the approved domain/address through real capture, Stop and reopen with the original provider request", async () => {
  const f = await fixture();
  await f.service.createRecording({ projectId: f.decoy.id, recordingId: "same-id", description: "Keep this other demonstration", initialState: { timestamp: 1, namespaces: {} } });
  const calls: { receiver: unknown; request: ClientGatewayStartRecordingRequest; count: number }[] = [];
  const bridge = f.bridge({ provider: function (this: unknown, input) {
    calls.push({ receiver: this, request: input.request, count: arguments.length });
    return { ok: true, projectId: f.project.id };
  } });
  const request = { recordingId: "same-id", projectId: f.decoy.id, description: "Demonstrate the approved device", metadata: { note: "caller data" } };
  await f.gateway.receive(f.session.sessionId, f.message("client.start_recording", request));
  expect(calls).toEqual([{ receiver: bridge, request, count: 1 }]);
  expect(calls[0]?.request).toBe(request);
  expect(f.acknowledgements()).toEqual(["same-id"]);
  const target = { type: "device", id: "original.entity" };
  await f.gateway.receive(f.session.sessionId, f.message("client.recording_entry", { recordingId: "same-id", projectId: f.decoy.id, entry: { type: "action", actionType: "device.change", parameters: { amount: 2 }, target, origin: "operator", startedAt: 2 } }));
  await f.gateway.receive(f.session.sessionId, f.message("client.stop_recording", { recordingId: "same-id", projectId: f.decoy.id, endedAt: Date.now() }));
  const stored = await f.service.getRecordingSession("same-id", f.project.id);
  expect(stored.environment.domainId).toBe("devices");
  expect(stored.metadata.projectId).toBe(f.project.id);
  expect(stored.timeline).toMatchObject([{ type: "action", target, parameters: { amount: 2 } }]);
  expect(stored.endedAt).toBeDefined();
  expect((await f.service.getRecordingSession("same-id", f.decoy.id)).timeline).toEqual([]);
  expect(f.policyCalls.length).toBeGreaterThan(0);
  expect(f.policyCalls.every(call => call.receiver === f.policy)).toBe(true);
  const accepts = f.policyCalls.find(call => call.method === "accepts");
  expect(accepts?.args).toEqual([target]);
  expect(accepts?.args[0]).toBe(target);
  await f.closeService();
  const reopened = new AutomationStudioService({ dataDir: f.directory, seedFixture: false }).bindNativeNodeRuntime(f.native);
  try {
    const recovered = await reopened.getRecordingSession("same-id", f.project.id);
    expect(recovered.environment.domainId).toBe("devices");
    expect(recovered.timeline).toEqual(stored.timeline);
    expect(recovered.endedAt).toBe(stored.endedAt);
    expect((await reopened.getRecordingSession("same-id", f.decoy.id)).timeline).toEqual([]);
  } finally { await reopened.close(); }
}, 60_000);

it.each(["top", "environment", "metadata"] as const)("refuses conflicting %s domain before actual create or Start acknowledgement", async location => {
  const f = await fixture();
  const provider = vi.fn(() => ({ ok: true as const, projectId: f.project.id }));
  f.bridge({ provider });
  const create = vi.spyOn(f.service, "createRecording");
  const request: ClientGatewayStartRecordingRequest = { recordingId: "conflict", projectId: f.project.id, description: "Demonstrate the approved device", ...(location === "top" ? { domainId: "foreign" } : location === "environment" ? { environment: { domainId: "foreign" } } : { metadata: { domainId: "foreign" } }) };
  await f.gateway.receive(f.session.sessionId, f.message("client.start_recording", request));
  expect(create).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
  expect(f.acknowledgements()).toEqual([]);
  expect(f.gateway.outbound(f.session.sessionId).filter(item => item.type === "server.error").map(item => item.payload.code)).toContain("recording.domain_scope_refused");
  await expect(f.service.getRecordingSession("conflict", f.project.id)).rejects.toThrow();
}, 60_000);

it("checks the actual approved project's domain before creating anything", async () => {
  const f = await fixture();
  const foreign = await f.service.createProject({ name: "Different original domain", domainId: "other" });
  f.bridge({ provider: () => ({ ok: true, projectId: foreign.id }) });
  const create = vi.spyOn(f.service, "createRecording");
  await f.gateway.receive(f.session.sessionId, f.message("client.start_recording", { recordingId: "wrong-project", projectId: f.project.id, description: "Demonstrate the device" }));
  expect(create).not.toHaveBeenCalled();
  expect(f.acknowledgements()).toEqual([]);
  expect(f.gateway.outbound(f.session.sessionId).filter(item => item.type === "server.error").map(item => item.payload.code)).toContain("recording.project_scope_refused");
  await expect(f.service.getRecordingSession("wrong-project", foreign.id)).rejects.toThrow();
}, 60_000);

it.each(["revoked", "expired"] as const)("rechecks real %s trust after the original provider await", async disposition => {
  const f = await fixture();
  const gate = recordingScopeGate();
  f.bridge({ provider: async () => {
    await gate.wait();
    return { ok: true, projectId: f.project.id };
  } });
  const create = vi.spyOn(f.service, "createRecording");
  const activate = vi.spyOn(f.gateway, "markActiveRecording");
  const running = outcome(f.gateway.receive(f.session.sessionId, f.message("client.start_recording", { recordingId: "pending", description: "Demonstrate the device" })));
  try {
    await reached(gate, running);
    if (disposition === "revoked") await f.gateway.revokeTrustedClient(f.session.trustedClientId!);
    else f.expire();
  } finally {
    gate.release();
    await running;
  }
  expect((await running).kind).toBe("fulfilled");
  expect(create).not.toHaveBeenCalled();
  expect(activate).not.toHaveBeenCalled();
  expect(f.acknowledgements()).toEqual([]);
  expect(f.gateway.outbound(f.session.sessionId).filter(item => item.type === "server.error").map(item => item.payload.code)).toContain("recording.client_scope_refused");
  await expect(f.service.getRecordingSession("pending", f.project.id)).rejects.toThrow();
}, 60_000);

it("refuses the old session after actual project access is held across a trusted reconnect", async () => {
  const f = await fixture();
  const gate = recordingScopeGate();
  const original = f.service.assertProjectDomainAccess;
  vi.spyOn(f.service, "assertProjectDomainAccess").mockImplementation(async function (this: AutomationStudioService, ...args: Parameters<AutomationStudioService["assertProjectDomainAccess"]>) {
    await original.apply(this, args);
    await gate.wait();
  });
  f.bridge({ provider: () => ({ ok: true, projectId: f.project.id }) });
  const create = vi.spyOn(f.service, "createRecording");
  const running = outcome(f.gateway.receive(f.session.sessionId, f.message("client.start_recording", { recordingId: "old-session", description: "Demonstrate the device" })));
  let nextSession: Awaited<ReturnType<typeof f.reconnect>> | undefined;
  try {
    await reached(gate, running);
    f.gateway.disconnect(f.session.sessionId);
    nextSession = await f.reconnect();
    expect(f.gateway.snapshot().sessions.find(session => session.sessionId === nextSession?.sessionId)?.status).toBe("ready");
  } finally {
    gate.release();
    await running;
  }
  expect((await running).kind).toBe("fulfilled");
  expect(create).not.toHaveBeenCalled();
  expect(f.acknowledgements()).toEqual([]);
  if (!nextSession) throw new Error("fixture.reconnect_missing");
  expect(f.acknowledgements(f.gateway, nextSession.sessionId)).toEqual([]);
  await expect(f.service.getRecordingSession("old-session", f.project.id)).rejects.toThrow();
}, 60_000);

it("never acknowledges or activates a create whose genuine commit returned after trust was revoked", async () => {
  const f = await fixture();
  const gate = recordingScopeGate();
  const original = f.service.createRecording;
  vi.spyOn(f.service, "createRecording").mockImplementation(async function (this: AutomationStudioService, ...args: Parameters<AutomationStudioService["createRecording"]>) {
    const created = await original.apply(this, args);
    await gate.wait();
    return created;
  });
  f.bridge({ provider: () => ({ ok: true, projectId: f.project.id }) });
  const activate = vi.spyOn(f.gateway, "markActiveRecording");
  const start = vi.spyOn(f.gateway, "startRecording");
  const running = outcome(f.gateway.receive(f.session.sessionId, f.message("client.start_recording", { recordingId: "committed", description: "Demonstrate the device" })));
  try {
    await reached(gate, running);
    expect((await f.service.getRecordingSession("committed", f.project.id)).environment.domainId).toBe("devices");
    await f.gateway.revokeTrustedClient(f.session.trustedClientId!);
  } finally {
    gate.release();
    await running;
  }
  const result = await running;
  expect(result.kind).toBe("rejected");
  if (result.kind === "rejected") expect(result.error).toMatchObject({ message: "recording.client_scope_refused" });
  expect(start).not.toHaveBeenCalled();
  expect(activate).not.toHaveBeenCalled();
  expect(f.acknowledgements()).toEqual([]);
  expect(f.gateway.snapshot().sessions.find(session => session.sessionId === f.session.sessionId)?.activeRecordingId ?? null).toBeNull();
  expect((await f.service.getRecordingSession("committed", f.project.id)).timeline).toEqual([]);
}, 60_000);

it("keeps Stop during real pending approval ahead of any Start acknowledgement", async () => {
  const f = await fixture();
  const gate = recordingScopeGate();
  f.bridge({ provider: async () => {
    await gate.wait();
    return { ok: true, projectId: f.project.id };
  } });
  const starting = outcome(f.gateway.receive(f.session.sessionId, f.message("client.start_recording", { recordingId: "stopped", description: "Demonstrate the device" })));
  let stopping: ReturnType<typeof outcome> | undefined;
  try {
    await reached(gate, starting);
    stopping = outcome(f.gateway.receive(f.session.sessionId, f.message("client.stop_recording", { recordingId: "stopped", projectId: f.decoy.id })));
  } finally {
    gate.release();
    await starting;
    await stopping;
  }
  expect((await starting).kind).toBe("fulfilled");
  if (!stopping) throw new Error("fixture.stop_not_entered");
  expect((await stopping).kind).toBe("fulfilled");
  expect(f.acknowledgements()).toEqual([]);
  const recording = await f.service.getRecordingSession("stopped", f.project.id);
  expect(recording.environment.domainId).toBe("devices");
  expect(recording.endedAt).toBeDefined();
  await expect(f.service.getRecordingSession("stopped", f.decoy.id)).rejects.toThrow();
}, 60_000);

it("keeps a real explicitly null approval passive instead of selecting wire IO", async () => {
  const f = await fixture({ domain: null });
  const io = new IoRegistry();
  const project = vi.fn(() => ({ original: "projected" }));
  io.registerOutput("devices", defineOutput({ definition: { id: "activate", title: "Activate" }, mode: "request", dispatch: () => ({ ok: true as const, outputId: "activate" }) }));
  io.registerInput("devices", defineInput({ definition: { id: "bound", title: "Bound", role: "action", outputId: "activate" }, mode: "stream", outputBinding: { outputId: "activate", toPayload: project } }));
  f.bridge({ io, provider: () => ({ ok: true, projectId: f.project.id }) });
  expect(f.gateway.snapshot().trustedClients.find(client => client.trustedClientId === f.session.trustedClientId)?.domainId).toBeNull();
  await f.gateway.receive(f.session.sessionId, f.message("client.start_recording", { recordingId: "passive", description: "Observe the passive client" }));
  await f.gateway.receive(f.session.sessionId, f.message("client.state_update", { state: { original: true } }));
  await f.gateway.receive(f.session.sessionId, f.message("client.recording_event", { eventType: "signal", domainId: "devices", metadata: { inputId: "bound" } }));
  await f.gateway.receive(f.session.sessionId, f.message("client.stop_recording", { recordingId: "passive" }));
  const stored = await f.service.getRecordingSession("passive", f.project.id);
  expect(stored.environment.domainId).toBeNull();
  expect(stored.timeline.map(entry => entry.type)).toEqual(["observation"]);
  expect(project).not.toHaveBeenCalled();
  expect(f.policyCalls).toEqual([]);
}, 60_000);

it("refuses a real required-domain start without its implementation policy", async () => {
  const f = await fixture({ installPolicy: false });
  f.bridge({ provider: () => ({ ok: true, projectId: f.project.id }) });
  const create = vi.spyOn(f.service, "createRecording");
  const result = await outcome(f.gateway.receive(f.session.sessionId, f.message("client.start_recording", { recordingId: "missing-policy", description: "Demonstrate the device" })));
  expect(result.kind).toBe("rejected");
  if (result.kind === "rejected") expect(result.error).toMatchObject({ message: "recording.target_policy_missing" });
  expect(create).toHaveBeenCalledTimes(1);
  expect(f.acknowledgements()).toEqual([]);
  expect(f.gateway.snapshot().sessions.find(session => session.sessionId === f.session.sessionId)?.activeRecordingId ?? null).toBeNull();
  await expect(f.service.getRecordingSession("missing-policy", f.project.id)).rejects.toThrow();
}, 60_000);

it("does not resume persisted legacy trust with no approved domain into recording authority", async () => {
  const f = await fixture();
  f.gateway.disconnect(f.session.sessionId);
  const legacy = await f.legacyGateway();
  f.bridge({ gateway: legacy, provider: () => ({ ok: true, projectId: f.project.id }) });
  const create = vi.spyOn(f.service, "createRecording");
  const next = await f.reconnect(legacy);
  expect(legacy.snapshot().trustedClients[0]?.domainId).toBeUndefined();
  expect(legacy.snapshot().sessions.find(session => session.sessionId === next.sessionId)?.status).toBe("pairing_required");
  await legacy.receive(next.sessionId, f.message("client.start_recording", { recordingId: "legacy", projectId: f.project.id, description: "Cannot reuse unbound trust" }));
  expect(create).not.toHaveBeenCalled();
  expect(f.acknowledgements(legacy, next.sessionId)).toEqual([]);
  await expect(f.service.getRecordingSession("legacy", f.project.id)).rejects.toThrow();
}, 60_000);

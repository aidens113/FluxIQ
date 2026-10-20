// @fluxiq-test-group real-sql
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AutomationStudioService } from "../../../service.ts";
import { IoRegistry } from "../../../../../../io/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../native-node-runtime.ts";
import { FluxIQ } from "../../../../../../framework/index.ts";
import { createRunnableCanonicalFlow } from "../../../tests/service-fixtures.ts";
import type { AutomationStudioFlowInstruction } from "../../../../model/index.ts";
import { GlobalProgramApiRegistry } from "../../../../../_shared/api.ts";
import { registerAutomationStudioApi } from "../../../../api/handlers/index.ts";

const services: AutomationStudioService[] = [];
const folders: string[] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()));
  await Promise.all(folders.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 })));
});
async function subject() {
  const resolver = vi.fn().mockResolvedValue(null);
  const root = await mkdtemp(path.join(os.tmpdir(), "instruction-authority-"));
  folders.push(root);
  const service = new AutomationStudioService({ dataDir: path.join(root, ".fluxiq", "data"), seedFixture: false, llmProviderResolver: resolver });
  services.push(service);
  const project = await service.createProject({ name: "Generic" });
  const flow = await createRunnableCanonicalFlow(service, project.id, { flowId: "flow.task" });
  return { service, resolver, project, flow };
}

describe("persisted automation instructions", () => {
  it("does not release a missing or unreadable durable session through the authority collaborator", async () => {
    const { service, project } = await subject();
    const resume = vi.spyOn(service.runControl, "resume");
    expect(await service.instructionAuthority.resume(project.id, "missing")).toBeNull();
    const failure = new Error("durable session read failed");
    vi.spyOn(service, "getRuntimeSession").mockRejectedValueOnce(failure);
    await expect(service.instructionAuthority.resume(project.id, "unreadable")).rejects.toBe(failure);
    expect(resume).not.toHaveBeenCalled();
  });
  it("refuses an existing saved run without instructions before providers and graph work", async () => {
    const { service, resolver, project, flow } = await subject();
    await expect(service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "no_llm_intervention" })).rejects.toMatchObject({ code: "automation.instructions_required" });
    expect(resolver).not.toHaveBeenCalled();
    expect(await service.listRuntimeSessions(project.id)).toEqual([]);
  });
  it("supports task entry on a populated existing Flow and deterministic execution", async () => {
    const { service, resolver, project, flow } = await subject();
    const before = await service.getFlow(project.id, flow.flowId);
    await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Calculate the requested constant." });
    expect((await service.getFlow(project.id, flow.flowId)).nodes).toEqual(before.nodes);
    expect((await service.instructionAuthority.readiness({ projectId: project.id, flowId: flow.flowId })).ready).toBe(true);
    expect((await service.runRuntimeSession({ projectId: project.id, flowId: flow.flowId, adaptiveMode: "no_llm_intervention" })).status).toBe("succeeded");
    expect(resolver).not.toHaveBeenCalled();
  });
  it("legacy advisory task remains runnable, and disabling it refuses resume and next run", async () => {
    const { service, project, flow } = await subject();
    const instruction: AutomationStudioFlowInstruction = { schemaVersion: "0.1", instructionId: "legacy", title: "Task", body: "Calculate the requested constant.", scope: { kind: "flow", projectId: project.id, flowId: flow.flowId }, priority: 50, status: "active", requirement: "advisory", createdAt: 1, updatedAt: 1 };
    await service.saveFlowInstruction(project.id, instruction);
    const session = await service.startRuntimeSession({ projectId: project.id, flowId: flow.flowId });
    service.runControl.open(project.id, session.runId);
    await service.saveFlowInstruction(project.id, { ...instruction, status: "disabled" });
    await expect(service.instructionAuthority.resume(project.id, session.runId)).rejects.toMatchObject({ code: "automation.instructions_required" });
    await expect(service.runRuntimeSession({ projectId: project.id, runId: session.runId })).rejects.toMatchObject({ code: "automation.instructions_required" });
    service.runControl.close(project.id, session.runId);
  });
  it("projectless public execution and standalone policy activation decline", async () => {
    const { service } = await subject();
    await expect(service.runRuntimeSession({})).rejects.toMatchObject({ code: "automation.instructions_required" });
    await expect(service.approvePolicyProposal({ projectId: "p", proposalId: "proposal" })).rejects.toMatchObject({ code: "automation.instruction_led_authoring_required" });
  });
  it("edits the selected legacy task without duplicating active guidance", async () => {
    const { service, project, flow } = await subject();
    const instruction: AutomationStudioFlowInstruction = { schemaVersion: "0.1", instructionId: "legacy", title: "Task", body: "Calculate the requested constant.", scope: { kind: "flow", projectId: project.id, flowId: flow.flowId }, priority: 50, status: "active", requirement: "advisory", createdAt: 1, updatedAt: 1 };
    await service.saveFlowInstruction(project.id, instruction);
    expect((await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Calculate the revised constant.", instructionId: "legacy" })).instructionId).toBe("legacy");
    expect(await service.getFlowInstructionSet({ projectId: project.id, flowId: flow.flowId })).toHaveLength(1);
  });
  it.each(["flow", "node"] as const)("real diagnostic recording proposal cannot activate as %s", async kind => {
    const { service, project, resolver } = await subject();
    const io = new IoRegistry();
    const dispatched = vi.fn();
    io.registerOutput("generic", { definition: { id: "operate", title: "Operate" }, mode: "request", dispatch: request => {
      dispatched();
      return { ok: true, domainId: "generic", outputId: request.outputId, payload: {} };
    } });
    const native = new AutomationStudioNativeNodeRuntime().register({ schemaVersion: "0.1", sdkVersion: "0.1", packageId: "generic", packageVersion: "1.0.0", domainId: "generic", nodes: [], recordingMappers: [{ id: "generic", version: "1.0.0", description: "Generic mapper", outputIds: ["operate"] }] }, { packageId: "generic", packageVersion: "1.0.0", implementations: {}, recordingMappers: { generic: () => null } });
    service.bindIoRuntime(io, "generic").bindNativeNodeRuntime(native);
    await service.createRecording({ projectId: project.id, recordingId: "demonstration", domainId: "generic", description: "Demonstrates one generic operation.", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId: project.id, recordingId: "demonstration", entry: { type: "action", actionType: "operate", outputId: "operate", parameters: {}, origin: "operator", startedAt: 2 } });
    await service.finalizeRecording({ projectId: project.id, recordingId: "demonstration", endedAt: 3 });
    const { proposals } = await service.createRecordingFlowProposals({ projectId: project.id, recordingId: "demonstration" });
    expect(proposals).toHaveLength(1);
    const write = vi.spyOn(service, "saveFlow");
    const destination = kind === "flow" ? { kind: "flow" as const, name: "Trace shortcut" } : { kind: "node" as const, visibility: "private" as const };
    await expect(service.reviewRecordingFlowProposal({ projectId: project.id, proposalId: proposals[0]!.proposalId, decision: "approved", destination })).rejects.toMatchObject({ code: "automation.instruction_led_authoring_required" });
    await expect(service.approvePolicyProposal({ projectId: project.id, proposalId: "diagnostic-policy" })).rejects.toMatchObject({ code: "automation.instruction_led_authoring_required" });
    expect(write).not.toHaveBeenCalled();
    expect(dispatched).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
    expect(await service.listRecordingDerivedNodeDefinitions(project.id)).toEqual([]);
  });
  it("model-only task save preserves existing person instructions before any providers or actions", async () => {
    const { service, project, flow, resolver } = await subject();
    const task = await service.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Calculate the requested constant." });
    await expect(service.saveFlowGenerationInstruction({ projectId: project.id, flowId: flow.flowId, instruction: "Model-only replacement.", instructionSource: "conversation_argument" })).rejects.toMatchObject({ code: "automation.instructions_required" });
    expect((await service.getFlowInstruction(project.id, task.instructionId))?.body).toBe(task.body);
    expect(resolver).not.toHaveBeenCalled();
    expect(await service.listRuntimeSessions(project.id)).toEqual([]);
  });
  it("API refuses with closed actionable code", async () => {
    const { service, project, flow } = await subject();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, service);
    const response = await registry.call({ programId: "automation-studio", endpoint: "run-runtime-session", scope: {}, actor: { userId: "user", sessionId: "session", roleId: "admin", permissions: ["runtime.control"] }, payload: { projectId: project.id, flowId: flow.flowId } });
    expect(response).toMatchObject({ ok: false, errorCode: "automation.instructions_required" });
  });
  it.each([true, 7, { goal: "A structured value is not written instructions" }])("does not coerce a malformed API body into task authority (%j)", async body => {
    const { service, project, flow, resolver } = await subject();
    const registry = new GlobalProgramApiRegistry();
    registerAutomationStudioApi(registry, service);
    const response = await registry.call({ programId: "automation-studio", endpoint: "save-flow-instruction", scope: {}, actor: { userId: "user", sessionId: "session", roleId: "admin", permissions: ["flows.write"] }, payload: { projectId: project.id, flowId: flow.flowId, title: "Task", body } });
    expect(response.ok).toBe(false);
    expect(await service.getFlowInstructionSet({ projectId: project.id, flowId: flow.flowId })).toEqual([]);
    expect(resolver).not.toHaveBeenCalled();
    expect(await service.listRuntimeSessions(project.id)).toEqual([]);
  });
});

it("description updates preserve durable recording events across reopen", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "instruction-recording-"));
  const first = FluxIQ.create({ rootDir: root, loadEnv: false, envFiles: [], modelProvidersEnabled: false });
  await first.setup({ createGuides: false, createGitkeep: false });
  let projectId = "";
  try {
    const service = first.programs.automationStudio;
    const project = await service.createProject({ name: "Generic" });
    projectId = project.id;
    await expect(service.createRecording({ projectId, recordingId: "missing", initialState: { timestamp: 1, namespaces: {} } })).rejects.toMatchObject({ code: "recording.description_required" });
    await service.createRecording({ projectId, recordingId: "r", description: "Demonstrates one operation.", initialState: { timestamp: 1, namespaces: {} } });
    await service.appendRecordingEvent({ projectId, recordingId: "r", entry: { type: "marker", label: "A recorded boundary", timestamp: 2 } });
    await service.updateRecording({ projectId, recordingId: "r", description: "Demonstrates a completed operation." });
  } finally { await first.close(); }
  const second = FluxIQ.create({ rootDir: root, loadEnv: false, envFiles: [], modelProvidersEnabled: false });
  try {
    await second.setup({ createGuides: false, createGitkeep: false });
    const recording = await second.programs.automationStudio.getRecordingSession("r", projectId);
    expect(recording.description).toBe("Demonstrates a completed operation.");
    expect(recording.timeline).toHaveLength(1);
    const summary = await second.programs.automationStudio.listRecordingSessionSummaryPage(projectId, { limit: 25, offset: 0 });
    expect(summary.recordings[0]?.description).toBe("Demonstrates a completed operation.");
    expect(summary.recordings[0]?.timeline).toEqual([]);
  } finally {
    await second.close();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 25 });
  }
});

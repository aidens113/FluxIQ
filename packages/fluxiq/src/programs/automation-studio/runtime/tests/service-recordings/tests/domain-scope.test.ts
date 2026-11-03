// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { AutomationStudioObjectStore } from "../../../../storage/index.ts";
import { AutomationStudioNativeNodeRuntime } from "../../../../../../runtime/native-execution/index.ts";
import { AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, type AutomationStudioImporterImplementationBundle } from "../../../../../../components/automation/importer/index.ts";
import { isOpaqueRecordingTarget, RecordingIngressShapes as S } from "../../../../../../client-gateway/recording/decoding/index.ts";
import { AutomationStudioService } from "../../../service.ts";

async function withService(run: (input: { service: AutomationStudioService; projectId: string; normalizations: string[] }) => Promise<void>, installPolicy = true) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-recording-domain-"));
  const normalizations: string[] = [];
  const bundle: AutomationStudioImporterImplementationBundle = {
    packageId: "device.package", packageVersion: "1.0.0", implementations: {},
    recordingEntryTargetPreparer(domainId, entry) {
      normalizations.push(domainId);
      return { parameters: entry.parameters, target: entry.target };
    },
    ...(installPolicy ? { recordingTargetPolicy: {
      accepts(value: unknown): value is unknown { return isOpaqueRecordingTarget(value) && value.type === "device"; },
      commandTarget(value: Record<string, unknown>) { return { type: "device", metadata: value }; },
      targetIssues(value: unknown, issuePath: string) {
        return isOpaqueRecordingTarget(value) && S.record(value.metadata) && value.metadata.invalid === true
          ? [{ severity: "error" as const, code: "device.invalid_target", message: "Raw device target is invalid.", path: issuePath }] : [];
      },
      parameterIssues(parameters: Record<string, unknown>, issuePath: string) {
        return parameters.forbidden === true
          ? [{ severity: "error" as const, code: "device.invalid_parameters", message: "Raw device parameters are invalid.", path: issuePath }] : [];
      }
    } } : {})
  };
  const native = new AutomationStudioNativeNodeRuntime().register({ schemaVersion: "0.1", sdkVersion: AUTOMATION_STUDIO_IMPORTER_SDK_VERSION, packageId: bundle.packageId, packageVersion: bundle.packageVersion, domainId: "devices", recordingTargetPolicyRequired: true, nodes: [] }, bundle);
  const service = new AutomationStudioService({ dataDir: directory, seedFixture: false }).bindNativeNodeRuntime(native);
  try {
    const project = await service.createProject({ name: "Domain recording", domainId: "devices" });
    await run({ service, projectId: project.id, normalizations });
  } finally {
    await service.close();
    await rm(directory, { recursive: true, force: true });
  }
}

it("stores the original project's domain and keeps a valid raw entry through the actual storage path", async () => {
  await withService(async ({ service, projectId, normalizations }) => {
    const recording = await service.createRecording({ projectId, recordingId: "valid", description: "Demonstrate a device change.", initialState: { timestamp: 1, namespaces: {} } });
    expect(recording.environment.domainId).toBe("devices");
    const parameters = { amount: 2 };
    await service.appendRecordingEvent({ projectId, recordingId: recording.recordingId, entry: { type: "action", actionType: "device.change", parameters, target: { type: "device" }, origin: "operator", startedAt: 2 } });
    const stored = await service.getRecordingSession(recording.recordingId, projectId);
    expect(stored.timeline).toMatchObject([{ type: "action", actionType: "device.change", parameters, target: { type: "device" } }]);
    expect(normalizations).toEqual(["devices"]);
  });
});

it("refuses the whole direct append batch before normalization or partial storage", async () => {
  await withService(async ({ service, projectId, normalizations }) => {
    await service.createRecording({ projectId, recordingId: "atomic", description: "Demonstrate a device change.", initialState: { timestamp: 1, namespaces: {} } });
    const first = { type: "action" as const, actionType: "device.change", parameters: {}, target: { type: "device" }, origin: "operator" as const, startedAt: 2 };
    await expect(service.appendRecordingEvents({ projectId, recordingId: "atomic", entries: [first, { ...first, parameters: { forbidden: true } }] })).rejects.toThrow("recording.invalid_entry");
    await expect(service.appendRecordingEvent({ projectId, recordingId: "atomic", entry: { ...first, target: { type: "device", metadata: { invalid: true } } } })).rejects.toThrow("recording.invalid_entry");
    expect(normalizations).toEqual([]);
    expect((await service.getRecordingSession("atomic", projectId)).timeline).toEqual([]);
  });
});

it("refuses conflicting project/request/environment scope before creating a recording", async () => {
  await withService(async ({ service, projectId }) => {
    await expect(service.createRecording({ projectId, recordingId: "wrong-domain", description: "Demonstrate a device change.", initialState: { timestamp: 1, namespaces: {} }, domainId: "foreign" })).rejects.toThrow("recording.project_scope_refused");
    await expect(service.createRecording({ projectId, recordingId: "wrong-environment", description: "Demonstrate a device change.", initialState: { timestamp: 1, namespaces: {} }, domainId: "devices", environment: { domainId: "foreign" } })).rejects.toThrow("recording.domain_scope_refused");
    await expect(service.getRecordingSession("wrong-domain", projectId)).rejects.toThrow();
    await expect(service.getRecordingSession("wrong-environment", projectId)).rejects.toThrow();
  });
});

it("refuses a registered required domain without its actual implementation policy", async () => {
  await withService(async ({ service, projectId, normalizations }) => {
    await expect(service.createRecording({ projectId, recordingId: "missing-policy", description: "Demonstrate a device change.", initialState: { timestamp: 1, namespaces: {} } })).rejects.toThrow("recording.target_policy_missing");
    expect(normalizations).toEqual([]);
    await expect(service.getRecordingSession("missing-policy", projectId)).rejects.toThrow();
  }, false);
});

it("rejects invalid confidence for the entire raw batch before object storage or normalization", async () => {
  const putBytes = vi.spyOn(AutomationStudioObjectStore.prototype, "putBytes");
  try {
    await withService(async ({ service, projectId, normalizations }) => {
      await service.createRecording({ projectId, recordingId: "confidence", description: "Demonstrate a device change.", initialState: { timestamp: 1, namespaces: {} } });
      putBytes.mockClear();
      const snapshot = { type: "observation" as const, observationType: "client.state_snapshot", payload: { state: { timestamp: 2, namespaces: {} } } };
      const invalidAction = { type: "action" as const, actionType: "device.change", parameters: {}, target: { type: "device" }, origin: "operator" as const, startedAt: 2, confidence: 2 };
      await expect(service.appendRecordingEvents({ projectId, recordingId: "confidence", entries: [snapshot, invalidAction] })).rejects.toThrow("recording.invalid_entry");
      await expect(service.appendRecordingEvent({ projectId, recordingId: "confidence", entry: { ...snapshot, confidence: 2 } })).rejects.toThrow("recording.invalid_entry");
      expect(putBytes).not.toHaveBeenCalled();
      expect(normalizations).toEqual([]);
      expect((await service.getRecordingSession("confidence", projectId)).timeline).toEqual([]);
    });
  } finally { putBytes.mockRestore(); }
});

it("rejects a malformed initial state from a direct API-style payload before creating any recording", async () => {
  const putBytes = vi.spyOn(AutomationStudioObjectStore.prototype, "putBytes");
  try {
    await withService(async ({ service, projectId }) => {
      putBytes.mockClear();
      await expect(service.createRecording({ projectId, recordingId: "invalid-state", description: "Demonstrate a device change.", initialState: JSON.parse("{}") })).rejects.toThrow("recording.invalid_initial_state");
      expect(putBytes).not.toHaveBeenCalled();
      await expect(service.getRecordingSession("invalid-state", projectId)).rejects.toThrow();
    });
  } finally { putBytes.mockRestore(); }
});

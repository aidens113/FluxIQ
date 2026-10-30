// Covers `remove-recording-entry` in handlers/recordings.ts: the endpoint the
// browser extension's Simple Mode calls to undo one captured step while the
// recording is still open; and `get-recording-capture-policy`, Core's answer to
// what a recording may capture and whether direct requests are allowed.

import { describe, expect, it, vi } from "vitest";

import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../../_shared/api.ts";

import { AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY, type AutomationStudioRecordingCapturePolicy } from "@fluxiq/contracts/automation-studio";

import { AUTOMATION_STUDIO_ENDPOINTS } from "../../contracts.ts";
import { registerAutomationStudioApi } from "../index.ts";
import { registerRecordingEndpoints } from "../recordings.ts";
import type { AutomationStudioApiDependencies } from "../dependencies.ts";

const actor: ProgramApiActor = { sessionId: "session.undo", userId: "user.undo", roleId: "admin", permissions: ["programs.read", "runtime.control"] };

const fullRecording = {
  schemaVersion: "0.1",
  recordingId: "recording.one",
  startedAt: 0,
  environment: { id: "e", label: "E", kind: "browser", domainId: "web-automation" },
  sources: [],
  actionChannels: [],
  initialState: { timestamp: 0, namespaces: { page: { values: { url: { type: "string", value: "https://example.test/private" } } } } },
  timeline: [{ id: "entry.a1", type: "observation", sequence: 0, metadata: { eventId: "event.a" } }],
  notes: [{ id: "note.1", text: "private note" }],
  metadata: {}
};

function registryWith(service: unknown): GlobalProgramApiRegistry {
  const registry = new GlobalProgramApiRegistry();
  registerAutomationStudioApi(registry, service as never);
  return registry;
}

function removeEntry(registry: GlobalProgramApiRegistry, payload: unknown, as: ProgramApiActor = actor) {
  return registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.removeRecordingEntry, scope: {}, actor: as, payload });
}

function serviceWith(removeRecordingEntries: (...args: any[]) => unknown) {
  const remove = vi.fn(removeRecordingEntries);
  return {
    recordingEntryRemoval: { remove },
    removeRecordingEntries: remove,
    summarizeRecordingSession: vi.fn((recording: typeof fullRecording) => ({ ...recording, timeline: [], notes: [], initialState: { timestamp: 0, namespaces: {} }, metadata: { summaryOnly: true } }))
  };
}

describe("removing a recorded step", () => {
  it("is registered, under runtime.control, as authoring rather than destructive", () => {
    expect(registryWith({}).endpoints()).toContainEqual(expect.objectContaining({
      programId: "automation-studio",
      endpoint: "remove-recording-entry",
      permission: "runtime.control",
      classification: "authoring"
    }));
  });

  it("hands the service the recording and event, and answers the count and a summary with no entries", async () => {
    const service = serviceWith(async () => ({ removedCount: 2, recording: fullRecording }));
    const response = await removeEntry(registryWith(service), { projectId: " project.one ", recordingId: "recording.one", eventId: "event.a" });

    expect(service.removeRecordingEntries).toHaveBeenCalledWith({ projectId: "project.one", recordingId: "recording.one", eventId: "event.a" });
    expect(response).toMatchObject({ ok: true, payload: { removedCount: 2, recording: { recordingId: "recording.one", timeline: [], notes: [] } } });
    expect(JSON.stringify(response)).not.toContain("private");
  });

  it("refuses a request that does not name the project, recording and event, and removes nothing", async () => {
    const service = serviceWith(async () => ({ removedCount: 0, recording: fullRecording }));
    const registry = registryWith(service);
    const refusal = { ok: false, error: "Removing a recording entry needs its project, recording and event IDs." };

    expect(await removeEntry(registry, { projectId: "project.one", recordingId: "recording.one" })).toEqual(refusal);
    expect(await removeEntry(registry, { projectId: "project.one", recordingId: "recording.one", eventId: "  " })).toEqual(refusal);
    expect(await removeEntry(registry, { recordingId: "recording.one", eventId: "event.a" })).toEqual(refusal);
    expect(await removeEntry(registry, { projectId: "project.one", recordingId: 3, eventId: "event.a" })).toEqual(refusal);
    expect(await removeEntry(registry, undefined)).toEqual(refusal);
    expect(service.removeRecordingEntries).not.toHaveBeenCalled();
  });

  it("answers a finalized recording's refusal as a failed call", async () => {
    const service = serviceWith(async () => { throw new Error("A finalized recording's entries can no longer be removed."); });
    const response = await removeEntry(registryWith(service), { projectId: "project.one", recordingId: "recording.one", eventId: "event.a" });

    expect(response).toEqual({ ok: false, error: "A finalized recording's entries can no longer be removed." });
  });

  it("requires runtime.control, as appending does", async () => {
    const service = serviceWith(async () => ({ removedCount: 1, recording: fullRecording }));
    const reader: ProgramApiActor = { ...actor, permissions: ["programs.read"] };
    const response = await removeEntry(registryWith(service), { projectId: "project.one", recordingId: "recording.one", eventId: "event.a" }, reader);

    expect(response).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(service.removeRecordingEntries).not.toHaveBeenCalled();
  });
});

describe("reading the recording-capture policy", () => {
  const reader: ProgramApiActor = { ...actor, permissions: ["programs.read"] };

  function readPolicy(registry: GlobalProgramApiRegistry, payload: unknown, as: ProgramApiActor = reader) {
    return registry.call({ programId: "automation-studio", endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRecordingCapturePolicy, scope: {}, actor: as, payload });
  }

  it("is registered as a read under programs.read", () => {
    expect(AUTOMATION_STUDIO_ENDPOINTS.getRecordingCapturePolicy).toBe("get-recording-capture-policy");
    expect(registryWith({}).endpoints()).toContainEqual(expect.objectContaining({
      programId: "automation-studio",
      endpoint: "get-recording-capture-policy",
      permission: "programs.read",
      classification: "read"
    }));
  });

  it("answers Core's default policy, with or without a project, touching no service", async () => {
    const registry = registryWith({});
    const expected = { ok: true, payload: { policy: AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY } };

    expect(await readPolicy(registry, { projectId: "project.one" })).toEqual(expected);
    expect(await readPolicy(registry, {})).toEqual(expected);
    expect(await readPolicy(registry, undefined)).toEqual(expected);
    expect((await readPolicy(registry, {})).payload).toMatchObject({ policy: { directRequests: { allowed: false } } });
  });

  it("asks a policy source, when one is supplied, for the named project", async () => {
    const strict: AutomationStudioRecordingCapturePolicy = {
      ...AUTOMATION_STUDIO_DEFAULT_RECORDING_CAPTURE_POLICY,
      captureInputValues: { allowed: false, default: false }
    };
    const recordingCapturePolicy = vi.fn(async () => strict);
    const registry = new GlobalProgramApiRegistry();
    registerRecordingEndpoints({ registry, service: {} as AutomationStudioApiDependencies["service"], identityAccess: undefined, clientGatewayBridge: undefined, clientGateway: undefined, recordingCapturePolicy });

    expect(await readPolicy(registry, { projectId: " project.one " })).toEqual({ ok: true, payload: { policy: strict } });
    expect(recordingCapturePolicy).toHaveBeenCalledWith("project.one");
    await readPolicy(registry, { projectId: 7 });
    expect(recordingCapturePolicy).toHaveBeenLastCalledWith(null);
  });

  it("refuses a caller without programs.read", async () => {
    const response = await readPolicy(registryWith({}), {}, { ...actor, permissions: [] });
    expect(response).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_RECORDING_ENDPOINTS,
  addAutomationRecordingMarker,
  addAutomationRecordingNote,
  buildAutomationRecordingCleanup,
  createAutomationGatewayRecordingMonitorState,
  createAutomationRecording,
  deleteAutomationRecording,
  deleteAutomationRecordings,
  finalizeAutomationRecording,
  monitorAutomationGatewayRecording,
  normalizeAutomationRecording,
  updateAutomationRecording,
  type AutomationRecordingCommandScope
} from ".";

const scope: AutomationRecordingCommandScope = { projectId: "project.one", generation: 1 };

function createCapabilities(post = vi.fn()) {
  let current = scope;
  return {
    api: { post },
    isCurrent: (candidate: AutomationRecordingCommandScope) =>
      candidate.projectId === current.projectId && candidate.generation === current.generation,
    setCurrent(next: AutomationRecordingCommandScope) {
      current = next;
    }
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Recording lifecycle commands", () => {
  it("creates a Recording with explicit evidence and audit context", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { recording: { recordingId: "recording.one" } } });
    const capabilities = createCapabilities(post);
    await expect(createAutomationRecording({
      scope,
      recordingId: "recording.one",
      taskId: "task.one",
      authorizationPin: "1234",
      environment: { id: "studio", label: "Project One", kind: "studio", domainId: null },
      initialState: { timestamp: 10, namespaces: {} },
      metadata: { createdFrom: "automation-studio-ui" }
    }, capabilities)).resolves.toEqual({
      status: "success",
      value: { recording: { recordingId: "recording.one" }, recordingId: "recording.one" }
    });
    expect(post).toHaveBeenCalledWith(AUTOMATION_RECORDING_ENDPOINTS.create, {
      projectId: "project.one",
      recordingId: "recording.one",
      taskId: "task.one",
      authorizationPin: "1234",
      environment: { id: "studio", label: "Project One", kind: "studio", domainId: null },
      initialState: { timestamp: 10, namespaces: {} },
      metadata: { createdFrom: "automation-studio-ui" }
    }, {});
  });

  it("finalizes and returns the persisted evidence Recording", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { recording: { status: "finalized" } } });
    await expect(finalizeAutomationRecording({
      scope,
      recordingId: "recording.one",
      authorizationPin: "1234"
    }, createCapabilities(post))).resolves.toEqual({
      status: "success",
      value: { recording: { status: "finalized" }, recordingId: "recording.one" }
    });
  });

  it("normalizes the timeline and preserves a non-fatal review failure", async () => {
    const post = vi.fn()
      .mockResolvedValueOnce({ ok: true, payload: { normalizedTimeline: { normalizedTimelineId: "timeline.one" } } })
      .mockResolvedValueOnce({ ok: false, error: "review unavailable" });
    await expect(normalizeAutomationRecording({
      scope,
      recordingId: "recording.one"
    }, createCapabilities(post))).resolves.toEqual({
      status: "success",
      value: {
        timeline: { normalizedTimelineId: "timeline.one" },
        review: null,
        reviewError: "review unavailable",
        recordingId: "recording.one"
      }
    });
    expect(post.mock.calls.map((call) => call[0])).toEqual([
      AUTOMATION_RECORDING_ENDPOINTS.normalize,
      AUTOMATION_RECORDING_ENDPOINTS.normalizationReview
    ]);
  });

  it("updates mutable fields without allowing project identity overrides", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { recording: { name: "Renamed" } } });
    await updateAutomationRecording({
      scope,
      recordingId: "recording.one",
      authorizationPin: "1234",
      changes: { name: "Renamed", projectId: "project.attack", recordingId: "recording.attack" }
    }, createCapabilities(post));
    expect(post).toHaveBeenCalledWith(AUTOMATION_RECORDING_ENDPOINTS.update, {
      name: "Renamed",
      projectId: "project.one",
      recordingId: "recording.one",
      authorizationPin: "1234"
    }, {});
  });

  it("returns explicit validation and request failures", async () => {
    const capabilities = createCapabilities(vi.fn().mockResolvedValue({ ok: false, error: "denied" }));
    await expect(finalizeAutomationRecording({
      scope,
      recordingId: "recording.one",
      authorizationPin: ""
    }, capabilities)).resolves.toMatchObject({ status: "failure", code: "AUTHORIZATION_REQUIRED" });
    await expect(finalizeAutomationRecording({
      scope,
      recordingId: "recording.one",
      authorizationPin: "1234"
    }, capabilities)).resolves.toEqual({ status: "failure", error: "denied" });
  });

  it("returns cancelled before dispatch and after an in-flight request", async () => {
    const before = new AbortController();
    before.abort();
    const post = vi.fn();
    await expect(finalizeAutomationRecording({
      scope,
      recordingId: "recording.one",
      authorizationPin: "1234",
      signal: before.signal
    }, createCapabilities(post))).resolves.toMatchObject({ status: "cancelled" });
    expect(post).not.toHaveBeenCalled();

    const request = deferred<any>();
    const after = new AbortController();
    const result = finalizeAutomationRecording({
      scope,
      recordingId: "recording.one",
      authorizationPin: "1234",
      signal: after.signal
    }, createCapabilities(vi.fn().mockReturnValue(request.promise)));
    after.abort();
    request.resolve({ ok: true, payload: { recording: { recordingId: "recording.one" } } });
    await expect(result).resolves.toMatchObject({ status: "cancelled" });
  });

  it("suppresses a successful response from a stale project generation", async () => {
    const request = deferred<any>();
    const capabilities = createCapabilities(vi.fn().mockReturnValue(request.promise));
    const result = createAutomationRecording({
      scope,
      recordingId: "recording.one",
      taskId: "task.one",
      authorizationPin: "1234",
      environment: {},
      initialState: {}
    }, capabilities);
    capabilities.setCurrent({ projectId: "project.two", generation: 2 });
    request.resolve({ ok: true, payload: { recording: { recordingId: "recording.one" } } });
    await expect(result).resolves.toMatchObject({ status: "stale" });
  });
});

describe("Recording annotations", () => {
  it("trims and appends notes and markers through owned endpoints", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { recording: { recordingId: "recording.one" } } });
    const capabilities = createCapabilities(post);
    await addAutomationRecordingNote({
      scope,
      recordingId: "recording.one",
      linkedEntryId: "entry.one",
      text: "  useful note  ",
      authorizationPin: "1234"
    }, capabilities);
    await addAutomationRecordingMarker({
      scope,
      recordingId: "recording.one",
      linkedEntryId: "entry.one",
      monotonicOffsetMs: 42,
      label: "  checkpoint  ",
      authorizationPin: "1234"
    }, capabilities);
    expect(post.mock.calls).toEqual([
      [AUTOMATION_RECORDING_ENDPOINTS.appendNote, {
        projectId: "project.one",
        recordingId: "recording.one",
        authorizationPin: "1234",
        text: "useful note",
        linkedEntryIds: ["entry.one"]
      }, {}],
      [AUTOMATION_RECORDING_ENDPOINTS.appendMarker, {
        projectId: "project.one",
        recordingId: "recording.one",
        authorizationPin: "1234",
        label: "checkpoint",
        linkedEntryId: "entry.one",
        monotonicOffsetMs: 42
      }, {}]
    ]);
  });

  it("rejects empty annotations without dispatch", async () => {
    const post = vi.fn();
    const capabilities = createCapabilities(post);
    await expect(addAutomationRecordingNote({
      scope,
      recordingId: "recording.one",
      text: " ",
      authorizationPin: "1234"
    }, capabilities)).resolves.toMatchObject({ status: "failure", code: "NOTE_REQUIRED" });
    await expect(addAutomationRecordingMarker({
      scope,
      recordingId: "recording.one",
      label: " ",
      authorizationPin: "1234"
    }, capabilities)).resolves.toMatchObject({ status: "failure", code: "MARKER_REQUIRED" });
    expect(post).not.toHaveBeenCalled();
  });
});

describe("Recording cleanup transaction", () => {
  it("deduplicates recording/proposal cleanup and retains all invalidation scopes", () => {
    expect(buildAutomationRecordingCleanup(
      ["recording.one", "recording.one"],
      ["proposal.one", "proposal.one"]
    )).toEqual({
      recordingIds: ["recording.one"],
      proposalIds: ["proposal.one"],
      invalidationScopes: ["recording", "timeline", "proposal", "summary"],
      invalidationEntityIds: ["recording.one", "proposal.one"]
    });
  });

  it("commits recording and proposal cleanup once, after server deletion", async () => {
    const order: string[] = [];
    const post = vi.fn(async () => {
      order.push("api");
      return {
        ok: true,
        payload: { deletedRecordingId: "recording.one", deletedProposalIds: ["proposal.one"] }
      };
    });
    const cleanup = vi.fn(async () => { order.push("cleanup"); });
    const result = await deleteAutomationRecording({
      scope,
      recordingId: "recording.one",
      authorizationPin: "1234"
    }, { ...createCapabilities(post), cleanup: { commit: cleanup } });
    expect(result).toEqual({
      status: "success",
      value: {
        recordingIds: ["recording.one"],
        proposalIds: ["proposal.one"],
        invalidationScopes: ["recording", "timeline", "proposal", "summary"],
        invalidationEntityIds: ["recording.one", "proposal.one"]
      }
    });
    expect(order).toEqual(["api", "cleanup"]);
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("uses unique requested IDs when a bulk response omits its deleted list", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { deletedProposalIds: [] } });
    const cleanup = vi.fn();
    await deleteAutomationRecordings({
      scope,
      recordingIds: ["recording.one", "recording.one", "recording.two"],
      authorizationPin: "1234"
    }, { ...createCapabilities(post), cleanup: { commit: cleanup } });
    expect(post).toHaveBeenCalledWith(AUTOMATION_RECORDING_ENDPOINTS.deleteMany, {
      projectId: "project.one",
      recordingIds: ["recording.one", "recording.two"],
      authorizationPin: "1234"
    }, {});
    expect(cleanup.mock.calls[0]?.[0].recordingIds).toEqual(["recording.one", "recording.two"]);
  });

  it("does not commit cleanup after cancellation or a stale response", async () => {
    const cancellation = deferred<any>();
    const controller = new AbortController();
    const cleanup = vi.fn();
    const cancelledResult = deleteAutomationRecording({
      scope,
      recordingId: "recording.one",
      authorizationPin: "1234",
      signal: controller.signal
    }, { ...createCapabilities(vi.fn().mockReturnValue(cancellation.promise)), cleanup: { commit: cleanup } });
    controller.abort();
    cancellation.resolve({ ok: true, payload: { deletedRecordingId: "recording.one" } });
    await expect(cancelledResult).resolves.toMatchObject({ status: "cancelled" });

    const staleRequest = deferred<any>();
    const staleCapabilities = createCapabilities(vi.fn().mockReturnValue(staleRequest.promise));
    const staleResult = deleteAutomationRecording({
      scope,
      recordingId: "recording.one",
      authorizationPin: "1234"
    }, { ...staleCapabilities, cleanup: { commit: cleanup } });
    staleCapabilities.setCurrent({ projectId: "project.two", generation: 2 });
    staleRequest.resolve({ ok: true, payload: { deletedRecordingId: "recording.one" } });
    await expect(staleResult).resolves.toMatchObject({ status: "stale" });
    expect(cleanup).not.toHaveBeenCalled();
  });
});

describe("stopped gateway Recording monitor", () => {
  it("publishes each live and stopped transition exactly once", async () => {
    const publish = vi.fn();
    const capabilities = { isCurrent: () => true, publish };
    const initial = createAutomationGatewayRecordingMonitorState();
    const live = await monitorAutomationGatewayRecording({
      scope,
      sessions: [{ activeRecordingId: "recording.one" }],
      state: initial
    }, capabilities);
    expect(live).toMatchObject({ status: "success", value: { transition: { kind: "live", recordingId: "recording.one" } } });
    if (live.status !== "success") throw new Error("Expected live transition");

    const duplicate = await monitorAutomationGatewayRecording({
      scope,
      sessions: [{ activeRecordingId: "recording.one" }],
      state: live.value.state
    }, capabilities);
    expect(duplicate).toMatchObject({ status: "success", value: { transition: { kind: "none" } } });
    if (duplicate.status !== "success") throw new Error("Expected duplicate transition");

    const stopped = await monitorAutomationGatewayRecording({
      scope,
      sessions: [],
      state: duplicate.value.state
    }, capabilities);
    expect(stopped).toMatchObject({ status: "success", value: { transition: { kind: "stopped", recordingId: "recording.one" } } });
    expect(publish.mock.calls.map((call) => call[0].kind)).toEqual(["live", "stopped"]);
  });

  it("publishes nothing for cancelled or stale generations", async () => {
    const publish = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(monitorAutomationGatewayRecording({
      scope,
      sessions: [{ activeRecordingId: "recording.one" }],
      state: createAutomationGatewayRecordingMonitorState(),
      signal: controller.signal
    }, { isCurrent: () => true, publish })).resolves.toMatchObject({ status: "cancelled" });

    let checks = 0;
    await expect(monitorAutomationGatewayRecording({
      scope,
      sessions: [{ activeRecordingId: "recording.one" }],
      state: createAutomationGatewayRecordingMonitorState()
    }, { isCurrent: () => ++checks === 1, publish })).resolves.toMatchObject({ status: "stale" });
    expect(publish).not.toHaveBeenCalled();
  });
});

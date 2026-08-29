import type { StateSnapshot } from "fluxiq/automation-studio";
import { describe, expect, it, vi } from "vitest";
import {
  AUTOMATION_STATE_ENDPOINTS,
  openAutomationStateView,
  resolveAutomationStateIndex,
  type AutomationStateCommandScope,
  type AutomationStatePublication
} from ".";

const scope: AutomationStateCommandScope = { projectId: "project.one", generation: 1 };
const snapshot: StateSnapshot = { id: "state.one", timestamp: 42, namespaces: {} };
const resolved = { stateSnapshotId: "state.one", entryId: "entry.one", stateRef: "state://one" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function createCapabilities(post = vi.fn()) {
  let current = scope;
  const publications: AutomationStatePublication[] = [];
  return {
    api: { post },
    publish: vi.fn((event: AutomationStatePublication) => publications.push(event)),
    publications,
    isCurrent: (candidate: AutomationStateCommandScope) =>
      candidate.projectId === current.projectId && candidate.generation === current.generation,
    setCurrent(next: AutomationStateCommandScope) {
      current = next;
    }
  };
}

describe("State index resolution", () => {
  it("uses one exact bounded index lookup without hydrating detail by default", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { resolved, state: snapshot } });
    const capabilities = createCapabilities(post);
    await expect(resolveAutomationStateIndex({ scope, recordingId: "recording.one", timelineEntryId: "entry.one" }, capabilities)).resolves.toEqual({
      status: "success",
      value: { resolved, state: null }
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(AUTOMATION_STATE_ENDPOINTS.recordingEntry, {
      projectId: "project.one",
      recordingId: "recording.one",
      entryId: "entry.one",
      includeState: false
    }, {});
  });

  it("selects the direct snapshot endpoint and hydrates only on demand", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { resolved, state: snapshot } });
    await expect(resolveAutomationStateIndex({
      scope,
      recordingId: "recording.one",
      stateSnapshotId: "state.one",
      includeState: true
    }, createCapabilities(post))).resolves.toEqual({ status: "success", value: { resolved, state: snapshot } });
    expect(post).toHaveBeenCalledWith(AUTOMATION_STATE_ENDPOINTS.snapshot, {
      projectId: "project.one",
      recordingId: "recording.one",
      stateSnapshotId: "state.one",
      includeState: true
    }, {});
  });

  it("returns validation and indexed lookup failures explicitly", async () => {
    const capabilities = createCapabilities();
    await expect(resolveAutomationStateIndex({ scope, recordingId: "" }, capabilities)).resolves.toMatchObject({
      status: "failure",
      code: "RECORDING_REQUIRED"
    });
    capabilities.api.post.mockResolvedValue({ ok: true, payload: { resolved: null, reason: "not indexed" } });
    await expect(resolveAutomationStateIndex({ scope, recordingId: "recording.one", timelineEntryId: "missing" }, capabilities)).resolves.toEqual({
      status: "failure",
      code: "STATE_NOT_INDEXED",
      error: "not indexed"
    });
  });

  it("returns cancelled and stale outcomes without accepting detail", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled = createCapabilities();
    await expect(resolveAutomationStateIndex({
      scope,
      recordingId: "recording.one",
      timelineEntryId: "entry.one",
      signal: controller.signal
    }, cancelled)).resolves.toMatchObject({ status: "cancelled" });
    expect(cancelled.api.post).not.toHaveBeenCalled();

    const request = deferred<any>();
    const stale = createCapabilities(vi.fn().mockReturnValue(request.promise));
    const outcome = resolveAutomationStateIndex({ scope, recordingId: "recording.one", timelineEntryId: "entry.one", includeState: true }, stale);
    stale.setCurrent({ projectId: "project.two", generation: 2 });
    request.resolve({ ok: true, payload: { resolved, state: snapshot } });
    await expect(outcome).resolves.toMatchObject({ status: "stale" });
  });
});

describe("State view opening", () => {
  it("publishes loading and selection synchronously before deferred detail work", async () => {
    const gate = deferred<void>();
    const post = vi.fn().mockResolvedValue({ ok: true, payload: { resolved, state: snapshot } });
    const capabilities = { ...createCapabilities(post), yieldToDetail: vi.fn(() => gate.promise) };
    const outcome = openAutomationStateView({
      scope,
      request: { flowId: "flow.one", nodeId: "node.one", recordingId: "recording.one", timelineEntryId: "entry.one" }
    }, capabilities);

    expect(capabilities.publications).toEqual([expect.objectContaining({
      kind: "intent",
      loading: true,
      viewId: "state-explorer",
      selection: expect.objectContaining({ kind: "state", id: "state:flow.one:node.one" })
    })]);
    expect(post).not.toHaveBeenCalled();

    gate.resolve();
    await expect(outcome).resolves.toMatchObject({ status: "success", value: { detail: { snapshot } } });
    expect(capabilities.publications.map((event) => event.kind)).toEqual(["intent", "resolved"]);
  });

  it("opens a selection-only State view without doing detail I/O", async () => {
    const capabilities = createCapabilities();
    await expect(openAutomationStateView({ scope, request: { nodeId: "node.one", phase: "action" } }, capabilities)).resolves.toMatchObject({
      status: "success",
      value: { resolved: null, detail: null }
    });
    expect(capabilities.api.post).not.toHaveBeenCalled();
    expect(capabilities.publications.map((event) => event.kind)).toEqual(["intent", "resolved"]);
    expect(capabilities.publications[0]).toMatchObject({ loading: false });
  });

  it("publishes current failures after the intent", async () => {
    const capabilities = createCapabilities(vi.fn().mockResolvedValue({ ok: true, payload: { resolved: null, reason: "missing" } }));
    await expect(openAutomationStateView({
      scope,
      request: { recordingId: "recording.one", timelineEntryId: "entry.missing" }
    }, capabilities)).resolves.toEqual({ status: "failure", code: "STATE_NOT_INDEXED", error: "missing" });
    expect(capabilities.publications.map((event) => event.kind)).toEqual(["intent", "failure"]);
  });

  it("does not publish stale or aborted detail after the synchronous intent", async () => {
    const staleRequest = deferred<any>();
    const stale = createCapabilities(vi.fn().mockReturnValue(staleRequest.promise));
    const staleOutcome = openAutomationStateView({
      scope,
      request: { recordingId: "recording.one", timelineEntryId: "entry.one" }
    }, stale);
    await Promise.resolve();
    stale.setCurrent({ projectId: "project.two", generation: 2 });
    staleRequest.resolve({ ok: true, payload: { resolved, state: snapshot } });
    await expect(staleOutcome).resolves.toMatchObject({ status: "stale" });
    expect(stale.publications.map((event) => event.kind)).toEqual(["intent"]);

    const abortRequest = deferred<any>();
    const controller = new AbortController();
    const aborted = createCapabilities(vi.fn().mockReturnValue(abortRequest.promise));
    const abortOutcome = openAutomationStateView({
      scope,
      request: { recordingId: "recording.one", stateSnapshotId: "state.one" },
      signal: controller.signal
    }, aborted);
    await Promise.resolve();
    controller.abort();
    abortRequest.resolve({ ok: true, payload: { resolved, state: snapshot } });
    await expect(abortOutcome).resolves.toMatchObject({ status: "cancelled" });
    expect(aborted.publications.map((event) => event.kind)).toEqual(["intent"]);
  });
});

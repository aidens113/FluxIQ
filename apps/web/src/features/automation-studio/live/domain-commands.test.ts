import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { AutomationLiveCommandScopeController } from "./command-scope";
import { AutomationLiveDomainCommands } from "./domain-commands";

function createHarness(post = vi.fn()) {
  const scopes = new AutomationLiveCommandScopeController();
  scopes.activate("project.one");
  const api = { get: vi.fn(), post };
  const data = {
    readThrough: vi.fn(async (request: any) => request.load(new AbortController().signal)),
    remember: vi.fn(),
    notifyMutation: vi.fn(),
    openProject: vi.fn(),
    closeProject: vi.fn(),
    loadHydration: vi.fn(),
    loadRuntimeSummary: vi.fn(),
    stats: vi.fn()
  };
  return { scopes, api, data, commands: new AutomationLiveDomainCommands(api as any, data as any, scopes) };
}

describe("Automation Studio live domain commands", () => {
  it("wires Flow and Recording actions through their public command contracts", async () => {
    const post = vi.fn(async (endpoint: string) => {
      if (endpoint === "run-runtime-session") {
        return { ok: true, payload: { runtimeSession: { runId: "run.one", status: "succeeded" } } };
      }
      if (endpoint === "create-recording") {
        return { ok: true, payload: { recording: { recordingId: "recording.one" } } };
      }
      throw new Error("Unexpected endpoint " + endpoint);
    });
    const { commands } = createHarness(post);

    await expect(commands.runFlow({
      flow: { flowId: "flow.one" },
      hasUnsavedChanges: false,
      allowSavedVersionWhenDirty: true,
      allowRequestedDomains: true
    })).resolves.toMatchObject({ status: "success", value: { session: { runId: "run.one" } } });
    await expect(commands.createRecording({
      recordingId: "recording.one",
      taskId: "task.one",
      authorizationPin: "1234",
      environment: {},
      initialState: {}
    })).resolves.toMatchObject({ status: "success", value: { recordingId: "recording.one" } });

    expect(post).toHaveBeenNthCalledWith(1, "run-runtime-session", {
      projectId: "project.one",
      flowId: "flow.one",
      authorizedDomainIds: []
    }, { signal: expect.any(AbortSignal) });
    expect(post).toHaveBeenNthCalledWith(2, "create-recording", expect.objectContaining({
      projectId: "project.one",
      recordingId: "recording.one",
      authorizationPin: "1234"
    }), { signal: expect.any(AbortSignal) });
  });

  it("publishes State loading intent synchronously and suppresses stale project detail", async () => {
    let resolveRequest!: (value: any) => void;
    const request = new Promise<any>((resolve) => { resolveRequest = resolve; });
    const { commands, scopes } = createHarness(vi.fn(() => request));
    const publications: any[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const outcome = commands.openState({
      flowId: "flow.one",
      nodeId: "node.one",
      recordingId: "recording.one",
      timelineEntryId: "entry.one"
    }, (event) => publications.push(event));

    expect(publications).toEqual([expect.objectContaining({ kind: "intent", loading: true })]);
    scopes.activate("project.two");
    resolveRequest({
      ok: true,
      payload: {
        resolved: { stateSnapshotId: "state.one", entryId: "entry.one", stateRef: "state://one" },
        state: { id: "state.one", timestamp: 1, namespaces: {} }
      }
    });
    await expect(outcome).resolves.toMatchObject({ status: "stale" });
    expect(publications.map((event) => event.kind)).toEqual(["intent"]);
    vi.unstubAllGlobals();
  });

  it("aborts the previous generation when projects switch", () => {
    const scopes = new AutomationLiveCommandScopeController();
    scopes.activate("project.one");
    const first = scopes.current()!;
    const firstSignal = scopes.signal();

    scopes.activate("project.two");

    expect(firstSignal.aborted).toBe(true);
    expect(scopes.isCurrent(first)).toBe(false);
    expect(scopes.current()).toMatchObject({ projectId: "project.two", generation: first.generation + 1 });
  });

  it("keeps domain endpoints, browser drafts, and retired Proposal views out of the root", () => {
    const source = readFileSync(new URL("../AutomationStudioLive.tsx", import.meta.url), "utf8");
    const forbidden = [
      "run-runtime-session",
      "get-flow",
      "save-flow",
      "publish-flow",
      "deprecate-flow-publication",
      "create-recording",
      "finalize-recording",
      "normalize-recording",
      "update-recording",
      "delete-recording",
      "append-recording-note",
      "append-recording-marker",
      "get-recording-entry-state",
      "get-state-snapshot",
      "loadAutomationGraphDraft",
      "saveAutomationGraphDraft",
      "removeAutomationGraphDraft",
      "loadAutomationGraphOperationDraft",
      "saveAutomationGraphOperationDraft",
      "removeAutomationGraphOperationDraft",
      "proposal-workbench",
      "proposal-generator",
      "deleteProjectProposals"
    ];
    expect(forbidden.filter((token) => source.includes(token))).toEqual([]);
    expect(source.split(/\r?\n/).length).toBeLessThan(3_468);
  });

  it("keeps the public facade and extracted command owners within the command budget", () => {
    const methods = Object.getOwnPropertyNames(AutomationLiveDomainCommands.prototype)
      .filter((name) => name !== "constructor" && name !== "postProject")
      .sort();
    expect(methods).toEqual([
      "addRecordingMarker",
      "addRecordingNote",
      "createFlowDocument",
      "createFlowSubflow",
      "createRecording",
      "deleteFlowDocument",
      "deleteFlowSubflow",
      "deleteProjectArtifact",
      "deleteRecording",
      "deleteRecordings",
      "deprecateFlow",
      "discardFlowDraft",
      "finalizeRecording",
      "getFlowDocument",
      "loadFlowDetail",
      "loadFlowMetadata",
      "loadLatestNormalizedTimeline",
      "loadNodeDefinitions",
      "loadRecordingDetail",
      "loadRecoverableFlowDraft",
      "normalizeRecording",
      "openState",
      "persistFlowDraft",
      "publishFlow",
      "resolveSubflowEditor",
      "restoreFlowDraft",
      "runFlow",
      "saveFlowDocument",
      "saveFlowDraft",
      "syncProject",
      "updateFlowDraft",
      "updateRecording"
    ]);

    const commandFiles = [
      "./domain-commands.ts",
      "./recording-domain-commands.ts",
      "./state-domain-commands.ts"
    ];
    for (const commandFile of commandFiles) {
      const source = readFileSync(new URL(commandFile, import.meta.url), "utf8");
      expect(source.split(/\r?\n/).length, commandFile).toBeLessThanOrEqual(400);
    }

    const facade = readFileSync(new URL("./domain-commands.ts", import.meta.url), "utf8");
    expect(facade).toContain("AutomationLiveRecordingCommands");
    expect(facade).toContain("AutomationLiveStateCommands");
    expect(facade).not.toContain("createAutomationRecording");
    expect(facade).not.toContain("openAutomationStateView");
  });});

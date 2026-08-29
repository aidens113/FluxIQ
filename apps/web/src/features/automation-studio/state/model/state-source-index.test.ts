import { describe, expect, it } from "vitest";
import { buildNodeStateInputSignature, buildNodeStateViewModel, buildNodeStateViewStateSignature, type BuildNodeStateViewModelInput } from ".";
import { snapshotWithImage, visualSnapshot } from "./state-model-test-fixtures";

describe("State source indexing and signatures", () => {
  it("keeps the input signature stable across unrelated wrapper identity changes", () => {
      const input: BuildNodeStateViewModelInput = {
        selection: { kind: "state", id: "state.one", sourceId: "observed:recording.1:entry.checkpoint", stateSnapshotId: "snapshot.visual", phase: "input" },
        selectedNode: { id: "node.deposit", label: "Deposit Inventory" },
        selectedRecording: { recordingId: "recording.1", updatedAt: 100, timeline: [{ id: "entry.checkpoint", state: visualSnapshot }] },
        selectedTimeline: { recordingId: "recording.1", updatedAt: 100, timeline: [{ id: "entry.checkpoint" }] },
        policy: { id: "policy.one", updatedAt: 100 },
        taskGraph: { flowId: "flow.one", updatedAt: 100, nodes: [{ id: "node.deposit" }], edges: [] },
        pipelineArtifacts: { learnedTaskModels: [{ learnedTaskModelId: "model.one", updatedAt: 100 }] },
        recordings: [{ recordingId: "recording.1", updatedAt: 100, timeline: [{ id: "entry.checkpoint" }] }],
        timelines: [{ recordingId: "recording.1", updatedAt: 100, timeline: [{ id: "entry.checkpoint" }] }],
        runtimeSessions: [{ runId: "run.one", updatedAt: 100, status: "running" }],
        signals: [{ id: "signal.one", updatedAt: 100 }],
        indexedStateSources: [{
          source: { kind: "observed", id: "observed:recording.1:entry.checkpoint", label: "Recording", recordingId: "recording.1", timestamp: 100 } as any,
          snapshot: visualSnapshot as any
        }]
      };
  
      const clonedInput: BuildNodeStateViewModelInput = {
        ...input,
        selectedNode: { ...(input.selectedNode as Record<string, unknown>) },
        recordings: [...input.recordings],
        timelines: [...input.timelines],
        runtimeSessions: [...input.runtimeSessions],
        signals: [...input.signals]
      };
  
      expect(buildNodeStateInputSignature(clonedInput)).toBe(buildNodeStateInputSignature(input));
      expect(buildNodeStateInputSignature({ ...input, selectedNode: { id: "node.other", label: "Other" } })).not.toBe(buildNodeStateInputSignature(input));
      expect(buildNodeStateInputSignature({ ...input, recordings: [{ recordingId: "recording.1", updatedAt: 101, timeline: [{ id: "entry.checkpoint" }] }] })).not.toBe(buildNodeStateInputSignature(input));
      expect(buildNodeStateViewStateSignature({ sourceId: "a", phase: "input" })).toBe(buildNodeStateViewStateSignature({ sourceId: "a", phase: "input" }));
      expect(buildNodeStateViewStateSignature({ sourceId: "a", phase: "input" })).not.toBe(buildNodeStateViewStateSignature({ sourceId: "a", phase: "action" }));
    });

  it("returns an empty state without a selected node or recording", () => {
      const model = buildNodeStateViewModel({
        selection: null,
        selectedNode: null,
        selectedRecording: null,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {},
        recordings: [],
        timelines: [],
        runtimeSessions: [],
        signals: []
      });
  
      expect(model.title).toBe("State View");
      expect(model.sources).toEqual([]);
      expect(model.emptyState?.title).toBe("No state source");
    });

  it("opens for a selected node even when no linked state exists", () => {
      const model = buildNodeStateViewModel({
        selection: { kind: "node", id: "node.deposit" },
        selectedNode: { id: "node.deposit", label: "Deposit Inventory" },
        selectedRecording: null,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {},
        recordings: [],
        timelines: [],
        runtimeSessions: [],
        signals: []
      });
  
      expect(model.title).toBe("Node State: Deposit Inventory");
      expect(model.emptyState?.message).toContain("linked to this node");
    });

  it("builds a visual model from an observed checkpoint with evidence overlays", () => {
      const recording = {
        recordingId: "recording.1",
        initialState: { timestamp: 1, namespaces: {} },
        timeline: [{
          id: "entry.checkpoint",
          type: "state_checkpoint",
          recordingId: "recording.1",
          timestamp: 100,
          state: visualSnapshot
        }]
      };
      const model = buildNodeStateViewModel({
        selection: { kind: "node", id: "node.deposit" },
        selectedNode: { id: "node.deposit", label: "Deposit Inventory" },
        selectedRecording: recording,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {
          nodeEvidenceBindings: [{
            id: "binding.bank.visible",
            nodeId: "node.deposit",
            fact: { namespace: "app", path: "bank.visible" },
            role: "eligibility",
            comparator: { kind: "equals", value: true },
            confidence: 0.98
          }]
        },
        recordings: [recording],
        timelines: [],
        runtimeSessions: [],
        signals: []
      });
  
      expect(model.activeSource?.kind).toBe("observed");
      expect(model.visualFrame?.id).toBe("frame.main");
      expect(model.facts.map((fact) => fact.fullPath)).toEqual(["app.bank.visible", "app.inventory.logs"]);
      expect(model.overlays).toHaveLength(1);
      expect(model.overlays[0]?.tone).toBe("positive");
      expect(model.summary).toMatchObject({ facts: 2, evidence: 1, strong: 1 });
    });

  it("adds a selected action visual target overlay for the acted-upon entity", () => {
      const action = {
        id: "entry.action",
        type: "action",
        actionType: "click",
        recordingId: "recording.1",
        timestamp: 120,
        visualTarget: {
          entityId: "bank.panel",
          entityKind: "region",
          statePath: { namespace: "app", path: "bank.visible" },
          visualFrameId: "frame.main",
          visualLayerId: "bank-region",
          confidence: 0.93
        }
      };
      const recording = {
        recordingId: "recording.1",
        initialState: { timestamp: 1, namespaces: {} },
        timeline: [{
          id: "entry.checkpoint",
          type: "state_checkpoint",
          recordingId: "recording.1",
          timestamp: 100,
          state: visualSnapshot
        }, action]
      };
  
      const model = buildNodeStateViewModel({
        selection: { kind: "timeline", id: "entry.action" },
        selectedNode: null,
        selectedEntry: action,
        selectedRecording: recording,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {},
        recordings: [recording],
        timelines: [],
        runtimeSessions: [],
        signals: []
      });
  
      expect(model.actionVisualTarget).toMatchObject({
        resolution: "exact-layer",
        visualLayerId: "bank-region",
        statePath: { namespace: "app", path: "bank.visible" }
      });
      expect(model.overlays).toContainEqual(expect.objectContaining({
        id: "action-target:entry.action",
        tone: "action-target",
        selected: true,
        factPath: "app.bank.visible",
        confidence: 0.93
      }));
    });

  it("uses the previewed action visual target when the timeline entry is not the global selection", () => {
      const action = {
        id: "entry.action.preview",
        type: "action",
        actionType: "click",
        recordingId: "recording.1",
        startedAt: 110,
        visualTarget: {
          entityId: "bank.panel",
          statePath: { namespace: "app", path: "bank.visible" },
          confidence: 0.88
        }
      };
      const recording = {
        recordingId: "recording.1",
        initialState: { timestamp: 1, namespaces: {} },
        timeline: [action, {
          id: "entry.checkpoint.near",
          type: "state_checkpoint",
          recordingId: "recording.1",
          timestamp: 112,
          state: visualSnapshot
        }]
      };
  
      const model = buildNodeStateViewModel({
        selection: { kind: "recording", id: "recording.1" },
        selectedNode: null,
        selectedEntry: action,
        selectedRecording: recording,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {},
        recordings: [recording],
        timelines: [],
        runtimeSessions: [],
        signals: []
      });
  
      expect(model.activeSource?.id).toBe("observed:recording.1:entry.checkpoint.near");
      expect(model.actionVisualTarget).toMatchObject({
        actionEntryId: "entry.action.preview",
        resolution: "state-path",
        statePath: { namespace: "app", path: "bank.visible" }
      });
      expect(model.overlays).toContainEqual(expect.objectContaining({
        id: "action-target:entry.action.preview",
        tone: "action-target",
        selected: true,
        factPath: "app.bank.visible",
        confidence: 0.88
      }));
    });

  it("builds a visual model from paired client state snapshot observations", () => {
      const recording = {
        recordingId: "recording.client",
        initialState: { timestamp: 1, namespaces: {} },
        timeline: [{
          id: "entry.client-state",
          type: "observation",
          observationType: "client.state_snapshot",
          recordingId: "recording.client",
          timestamp: 100,
          payload: { state: visualSnapshot }
        }]
      };
  
      const model = buildNodeStateViewModel({
        selection: { kind: "recording", id: "recording.client" },
        selectedNode: null,
        selectedRecording: recording,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {},
        recordings: [recording],
        timelines: [],
        runtimeSessions: [],
        signals: []
      });
  
      expect(model.activeSource).toMatchObject({ kind: "observed", timelineEntryId: "entry.client-state" });
      expect(model.visualFrame?.layers[0]).toMatchObject({ kind: "image", contentRef: "automation-object://project/test/sha" });
      expect(model.facts.map((fact) => fact.fullPath)).toEqual(["app.bank.visible", "app.inventory.logs"]);
    });

  it("prefers the observed screenshot linked to the selected node action evidence", () => {
      const firstSnapshot = snapshotWithImage("snapshot.first", 100, "automation-object://project/test/first");
      const secondSnapshot = snapshotWithImage("snapshot.second", 900, "automation-object://project/test/second");
      const recording = {
        recordingId: "recording.client",
        initialState: { timestamp: 1, namespaces: {} },
        timeline: [{
          id: "entry.state.first",
          type: "observation",
          observationType: "client.state_snapshot",
          recordingId: "recording.client",
          timestamp: 100,
          monotonicOffsetMs: 100,
          payload: { state: firstSnapshot }
        }, {
          id: "entry.action.first",
          type: "action",
          actionType: "web.dom.click",
          recordingId: "recording.client",
          timestamp: 180,
          monotonicOffsetMs: 180
        }, {
          id: "entry.state.second",
          type: "observation",
          observationType: "client.state_snapshot",
          recordingId: "recording.client",
          timestamp: 900,
          monotonicOffsetMs: 900,
          payload: { state: secondSnapshot }
        }, {
          id: "entry.action.second",
          type: "action",
          actionType: "web.dom.click",
          recordingId: "recording.client",
          timestamp: 960,
          monotonicOffsetMs: 960
        }]
      };
  
      const model = buildNodeStateViewModel({
        selection: { kind: "node", id: "node.second" },
        selectedNode: {
          id: "node.second",
          label: "Second Action",
          metadata: { evidence: [{ layer: "recording", artifactId: "recording.client", entryId: "entry.action.second" }] }
        },
        selectedRecording: recording,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {},
        recordings: [recording],
        timelines: [],
        runtimeSessions: [],
        signals: []
      });
  
      expect(model.activeSource).toMatchObject({ kind: "observed", timelineEntryId: "entry.state.second" });
      expect(model.visualFrame?.layers[0]).toMatchObject({ kind: "image", contentRef: "automation-object://project/test/second" });
    });

  it("uses action start and snapshot event timestamps before monotonic offsets when pairing state", () => {
      const correctSnapshot = snapshotWithImage("snapshot.correct", 1786949472021, "automation-object://project/test/correct");
      const laterSnapshot = snapshotWithImage("snapshot.later", 1786949473725, "automation-object://project/test/later");
      const recording = {
        recordingId: "recording.client",
        initialState: { timestamp: 1, namespaces: {} },
        timeline: [{
          id: "entry.action.target",
          type: "action",
          actionType: "web.dom.click",
          recordingId: "recording.client",
          startedAt: 1786949472021,
          timestamp: 1786949473115,
          monotonicOffsetMs: 14338
        }, {
          id: "entry.state.correct",
          type: "observation",
          observationType: "client.state_snapshot",
          recordingId: "recording.client",
          timestamp: 1786949472021,
          monotonicOffsetMs: 13244,
          payload: {
            state: correctSnapshot,
            metadata: {
              eventTimestampMs: 1786949472021,
              stateTimestampMs: 1786949472021
            }
          }
        }, {
          id: "entry.state.later",
          type: "observation",
          observationType: "client.state_snapshot",
          recordingId: "recording.client",
          timestamp: 1786949473725,
          monotonicOffsetMs: 14948,
          payload: {
            state: laterSnapshot,
            metadata: {
              eventTimestampMs: 1786949473725,
              stateTimestampMs: 1786949473725
            }
          }
        }]
      };
  
      const model = buildNodeStateViewModel({
        selection: { kind: "node", id: "node.target" },
        selectedNode: {
          id: "node.target",
          label: "Target Action",
          metadata: { evidence: [{ layer: "recording", artifactId: "recording.client", entryId: "entry.action.target" }] }
        },
        selectedRecording: recording,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {},
        recordings: [recording],
        timelines: [],
        runtimeSessions: [],
        signals: []
      });
  
      expect(model.activeSource).toMatchObject({ kind: "observed", timelineEntryId: "entry.state.correct" });
      expect(model.visualFrame?.layers[0]).toMatchObject({ kind: "image", contentRef: "automation-object://project/test/correct" });
    });
});

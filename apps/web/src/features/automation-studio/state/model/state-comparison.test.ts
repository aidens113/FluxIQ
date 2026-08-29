import { describe, expect, it } from "vitest";
import { buildNodeStateInputSignature, buildNodeStateViewModel, buildNodeStateViewStateSignature, type BuildNodeStateViewModelInput } from ".";
import { snapshotWithImage, visualSnapshot } from "./state-model-test-fixtures";

describe("State evidence and runtime comparison", () => {
  it("prefers action-adjacent state over repeated support snapshot evidence", () => {
      const sharedSnapshot = snapshotWithImage("snapshot.shared", 100, "automation-object://project/test/shared");
      const actionSnapshot = snapshotWithImage("snapshot.action", 500, "automation-object://project/test/action");
      const recording = {
        recordingId: "recording.client",
        initialState: { timestamp: 1, namespaces: {} },
        timeline: [{
          id: "entry.state.shared",
          type: "observation",
          observationType: "client.state_snapshot",
          recordingId: "recording.client",
          timestamp: 100,
          payload: { state: sharedSnapshot, metadata: { eventTimestampMs: 100 } }
        }, {
          id: "entry.action.target",
          type: "action",
          actionType: "web.dom.click",
          recordingId: "recording.client",
          startedAt: 500,
          timestamp: 540
        }, {
          id: "entry.state.action",
          type: "observation",
          observationType: "client.state_snapshot",
          recordingId: "recording.client",
          timestamp: 500,
          payload: { state: actionSnapshot, metadata: { eventTimestampMs: 500 } }
        }]
      };
  
      const model = buildNodeStateViewModel({
        selection: { kind: "node", id: "node.target" },
        selectedNode: {
          id: "node.target",
          label: "Target Action",
          metadata: {
            evidence: [
              { layer: "recording", artifactId: "recording.client", entryId: "entry.state.shared", observationId: "entry.state.shared" },
              { layer: "recording", artifactId: "recording.client", entryId: "entry.action.target" }
            ]
          }
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
  
      expect(model.activeSource).toMatchObject({ kind: "observed", timelineEntryId: "entry.state.action" });
      expect(model.visualFrame?.layers[0]).toMatchObject({ kind: "image", contentRef: "automation-object://project/test/action" });
    });

  it("opens an action timeline selection on its adjacent observed snapshot", () => {
      const firstSnapshot = snapshotWithImage("snapshot.first", 100, "automation-object://project/test/first");
      const secondSnapshot = snapshotWithImage("snapshot.second", 900, "automation-object://project/test/second");
      const recording = {
        recordingId: "recording.client",
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
        selection: {
          kind: "state",
          id: "state:timeline:entry.action.second",
          sourceId: "observed:recording.client:entry.state.second",
          recordingId: "recording.client",
          timelineEntryId: "entry.action.second",
          stateSnapshotId: "snapshot.second"
        },
        selectedNode: null,
        selectedRecording: recording,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {},
        recordings: [recording],
        timelines: [],
        runtimeSessions: [],
        signals: [],
        indexedStateSources: [{
          source: {
            kind: "observed",
            id: "observed:recording.client:entry.state.second",
            label: "Recording client @ entry.state.second",
            recordingId: "recording.client",
            timelineEntryId: "entry.state.second",
            stateSnapshotId: "snapshot.second",
            timestamp: secondSnapshot.timestamp
          } as any,
          snapshot: secondSnapshot as any
        }]
      });
  
      expect(model.activeSource).toMatchObject({ kind: "observed", timelineEntryId: "entry.state.second" });
      expect(model.visualFrame?.layers[0]).toMatchObject({ kind: "image", contentRef: "automation-object://project/test/second" });
    });

  it("does not fall back to the first observed source when exact action state is not loaded", () => {
      const firstSnapshot = snapshotWithImage("snapshot.first", 100, "automation-object://project/test/first");
      const secondSnapshot = snapshotWithImage("snapshot.second", 900, "automation-object://project/test/second");
      const recording = {
        recordingId: "recording.client",
        timeline: [{
          id: "entry.state.first",
          type: "observation",
          observationType: "client.state_snapshot",
          recordingId: "recording.client",
          timestamp: 100,
          payload: { state: firstSnapshot }
        }, {
          id: "entry.action.second",
          type: "action",
          actionType: "web.dom.click",
          recordingId: "recording.client",
          startedAt: 900,
          timestamp: 960
        }, {
          id: "entry.state.second",
          type: "observation",
          observationType: "client.state_snapshot",
          recordingId: "recording.client",
          timestamp: 900,
          payload: { state: secondSnapshot, metadata: { eventTimestampMs: 900 } }
        }]
      };
  
      const model = buildNodeStateViewModel({
        selection: {
          kind: "state",
          id: "state:timeline:entry.action.second",
          recordingId: "recording.client",
          timelineEntryId: "entry.action.second"
        },
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
  
      expect(model.activeSource).toBeNull();
      expect(model.emptyState).toMatchObject({ title: "Requested state is not loaded" });
    });

  it("falls back to node order when proposal nodes do not carry explicit state evidence", () => {
      const firstSnapshot = snapshotWithImage("snapshot.first", 100, "automation-object://project/test/first");
      const secondSnapshot = snapshotWithImage("snapshot.second", 900, "automation-object://project/test/second");
      const recording = {
        recordingId: "recording.client",
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
        selection: { kind: "state", id: "state:proposal.1:node.second", nodeId: "node.second", proposalId: "proposal.1", recordingId: "recording.client" },
        selectedNode: { id: "node.second", label: "Second Action" },
        selectedRecording: recording,
        selectedTimeline: null,
        policy: {
          nodes: [
            { id: "node.first", label: "First Action" },
            { id: "node.second", label: "Second Action" }
          ],
          edges: []
        },
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

  it("creates learned aggregate sources without pretending they are snapshots", () => {
      const model = buildNodeStateViewModel({
        selection: { kind: "node", id: "cluster.deposit" },
        selectedNode: { id: "cluster.deposit", label: "Deposit Inventory" },
        selectedRecording: null,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {
          learnedTaskModels: [{
            learnedTaskModelId: "model.deposit",
            sourceRecordings: ["recording.1", "recording.2"],
            actionClusters: [{ id: "cluster.deposit", confidence: 0.91 }]
          }]
        },
        recordings: [],
        timelines: [],
        runtimeSessions: [],
        signals: []
      });
  
      expect(model.activeSource).toMatchObject({ kind: "learned", recordingIds: ["recording.1", "recording.2"] });
      expect(model.visualFrame).toBeUndefined();
      expect(model.emptyState?.title).toBe("No state facts");
      expect(model.summary.confidence).toBe(0.91);
    });

  it("keeps runtime state visually separate and enables actual output phase", () => {
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
        runtimeSessions: [{
          runId: "run.live",
          metadata: { currentState: visualSnapshot }
        }],
        signals: [],
        viewState: { phase: "actual_output" }
      });
  
      expect(model.activeSource?.kind).toBe("runtime");
      expect(model.activePhase).toBe("actual_output");
      expect(model.phases.find((phase) => phase.id === "actual_output")?.available).toBe(true);
    });

  it("compares runtime actual output against expected node evidence", () => {
      const runtimeSnapshot = {
        ...visualSnapshot,
        id: "snapshot.runtime",
        namespaces: {
          app: {
            schemaId: "app",
            schemaVersion: "0.1",
            values: {
              "bank.visible": {
                type: "boolean",
                value: true,
                observedAt: 120,
                presentation: {
                  label: "Bank visible",
                  anchor: { type: "bounds", bounds: { x: 20, y: 30, width: 160, height: 90 } }
                }
              },
              "inventory.empty": {
                type: "boolean",
                value: false,
                observedAt: 120,
                presentation: {
                  label: "Inventory empty",
                  anchor: { type: "bounds", bounds: { x: 200, y: 300, width: 180, height: 90 } }
                }
              },
              "dialog.visible": {
                type: "boolean",
                value: false,
                observedAt: 120
              }
            }
          }
        }
      };
      const model = buildNodeStateViewModel({
        selection: { kind: "node", id: "node.deposit" },
        selectedNode: { id: "node.deposit", label: "Deposit Inventory" },
        selectedRecording: null,
        selectedTimeline: null,
        policy: null,
        taskGraph: null,
        pipelineArtifacts: {
          nodeEvidenceBindings: [{
            id: "binding.bank.visible",
            nodeId: "node.deposit",
            fact: { namespace: "app", path: "bank.visible" },
            role: "expectation",
            comparator: { kind: "equals", value: true },
            confidence: 0.98
          }, {
            id: "binding.inventory.empty",
            nodeId: "node.deposit",
            fact: { namespace: "app", path: "inventory.empty" },
            role: "expectation",
            comparator: { kind: "equals", value: true },
            confidence: 0.93
          }]
        },
        recordings: [],
        timelines: [],
        runtimeSessions: [{ runId: "run.live", currentState: runtimeSnapshot }],
        signals: [],
        viewState: { phase: "actual_output" }
      });
  
      expect(model.runtimeComparison?.matches.map((row) => row.factPath)).toEqual(["app.bank.visible"]);
      expect(model.runtimeComparison?.mismatches.map((row) => row.factPath)).toEqual(["app.inventory.empty"]);
      expect(model.runtimeComparison?.irrelevant.map((row) => row.factPath)).toEqual(["app.dialog.visible"]);
      expect(model.overlays.map((overlay) => overlay.tone)).toEqual(expect.arrayContaining(["positive", "mismatch"]));
      expect(model.summary).toMatchObject({ matches: 1, mismatches: 1 });
    });

  it("does not mutate input snapshots or artifacts", () => {
      const recording = {
        recordingId: "recording.immutable",
        initialState: visualSnapshot,
        timeline: []
      };
      const before = JSON.stringify(recording);
      buildNodeStateViewModel({
        selection: { kind: "recording", id: "recording.immutable" },
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
  
      expect(JSON.stringify(recording)).toBe(before);
    });
});

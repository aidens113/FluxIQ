import { describe, expect, it } from "vitest";
import { buildNodeStateViewModel } from "./view-model";

const visualSnapshot = {
  id: "snapshot.visual",
  timestamp: 100,
  namespaces: {
    app: {
      schemaId: "app",
      schemaVersion: "0.1",
      values: {
        "bank.visible": {
          type: "boolean",
          value: true,
          observedAt: 100,
          confidence: 0.98,
          presentation: {
            label: "Bank visible",
            anchor: { type: "bounds", bounds: { x: 20, y: 30, width: 160, height: 90 } }
          }
        },
        "inventory.logs": {
          type: "integer",
          value: 24,
          observedAt: 100,
          sourceId: "recorder"
        }
      }
    }
  },
  presentation: {
    defaultFrameId: "frame.main",
    visualFrames: [{
      id: "frame.main",
      coordinateSpace: { width: 800, height: 600, unit: "px" },
      layers: [{
        id: "screen",
        kind: "image",
        contentRef: "automation-object://project/test/sha",
        bounds: { x: 0, y: 0, width: 800, height: 600 }
      }, {
        id: "bank-region",
        kind: "region",
        statePath: "app.bank.visible",
        bounds: { x: 20, y: 30, width: 160, height: 90 }
      }]
    }]
  }
};

function snapshotWithImage(id: string, timestamp: number, contentRef: string) {
  return {
    ...visualSnapshot,
    id,
    timestamp,
    presentation: {
      ...visualSnapshot.presentation,
      visualFrames: [{
        ...visualSnapshot.presentation.visualFrames[0]!,
        layers: [{
          ...visualSnapshot.presentation.visualFrames[0]!.layers[0]!,
          contentRef
        }]
      }]
    }
  };
}

describe("node state view model", () => {
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
        sourceId: "observed:recording.client:entry.action.second",
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

    expect(model.activeSource).toMatchObject({ kind: "observed", timelineEntryId: "entry.state.second" });
    expect(model.visualFrame?.layers[0]).toMatchObject({ kind: "image", contentRef: "automation-object://project/test/second" });
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

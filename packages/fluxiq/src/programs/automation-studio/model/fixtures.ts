import type { LearnedTaskModel } from "../learning";
import type { NormalizedTimeline } from "../normalization";
import type { PolicyGraph } from "./policies";
import type { RecordingSession } from "./recordings";
import type { SignalRegistry } from "./signals";

export type AutomationStudioFixture = {
  signalRegistry: SignalRegistry;
  recording: RecordingSession;
  normalizedTimeline: NormalizedTimeline;
  learnedTaskModel: LearnedTaskModel;
  policy: PolicyGraph;
};

export function createAutomationStudioFixture(nowMs = 1_000): AutomationStudioFixture {
  const recordingId = "recording.demo-open-and-confirm";
  const taskId = "task.demo-confirm";

  const signalRegistry: SignalRegistry = {
    schemaVersion: "0.1",
    registryId: "registry.demo",
    definitions: [
      {
        path: "app.dialog.visible",
        type: "boolean",
        namespace: "app",
        description: "Whether the primary confirmation dialog is visible.",
        comparator: { kind: "exact" },
        defaultWeight: 0.8,
        volatility: "normal",
        persistence: "snapshot",
        tags: ["ui", "dialog"]
      },
      {
        path: "app.dialog.ready",
        type: "boolean",
        namespace: "app",
        description: "Whether the dialog has finished loading and can accept input.",
        comparator: { kind: "exact" },
        defaultWeight: 0.7,
        volatility: "normal",
        persistence: "snapshot",
        tags: ["ui", "readiness"],
        derived: true,
        provenance: {
          extractorId: "demo.dialog-readiness",
          extractorVersion: "1.0",
          inputs: ["app.dialog.visible"]
        }
      },
      {
        path: "app.confirmed",
        type: "boolean",
        namespace: "app",
        description: "Whether the task confirmation has completed.",
        comparator: { kind: "exact" },
        defaultWeight: 0.9,
        volatility: "slow",
        persistence: "task",
        tags: ["task", "success"]
      }
    ]
  };

  const initialState = {
    timestamp: nowMs,
    namespaces: {
      app: {
        schemaId: "flux.demo.app",
        schemaVersion: "1.0",
        values: {
          "app.dialog.visible": {
            type: "boolean",
            value: false,
            observedAt: nowMs,
            sourceId: "source.state",
            confidence: 0.99,
            volatility: "normal",
            comparable: true
          },
          "app.confirmed": {
            type: "boolean",
            value: false,
            observedAt: nowMs,
            sourceId: "source.state",
            confidence: 0.99,
            volatility: "slow",
            comparable: true
          }
        }
      }
    }
  } satisfies RecordingSession["initialState"];

  const recording: RecordingSession = {
    schemaVersion: "0.1",
    recordingId,
    taskId,
    startedAt: nowMs,
    endedAt: nowMs + 1_800,
    environment: {
      id: "env.demo",
      label: "Demo Environment",
      kind: "fixture",
      domainId: null,
      capabilities: ["ui.actions", "ui.state"]
    },
    sources: [
      { id: "source.state", label: "Demo State Extractor", kind: "state", schemaId: "flux.demo.app", schemaVersion: "1.0" },
      { id: "source.operator", label: "Operator", kind: "action" },
      { id: "source.notes", label: "Recorder Notes", kind: "note" }
    ],
    actionChannels: [
      { id: "channel.ui", label: "UI Actions", actionTypes: ["ui.click"] }
    ],
    initialState,
    timeline: [
      {
        type: "state_checkpoint",
        id: "entry.initial",
        recordingId,
        timestamp: nowMs,
        monotonicOffsetMs: 0,
        sequence: 0,
        sourceId: "source.state",
        state: initialState
      },
      {
        type: "action",
        id: "entry.open-dialog",
        recordingId,
        timestamp: nowMs + 250,
        monotonicOffsetMs: 250,
        sequence: 1,
        sourceId: "source.operator",
        actionType: "ui.click",
        parameters: { button: "primary" },
        target: { type: "ui_element", id: "open-dialog", label: "Open Dialog" },
        origin: "operator",
        startedAt: nowMs + 250,
        completedAt: nowMs + 280,
        result: { status: "succeeded" }
      },
      {
        type: "state_delta",
        id: "entry.dialog-visible",
        recordingId,
        timestamp: nowMs + 500,
        monotonicOffsetMs: 500,
        sequence: 2,
        sourceId: "source.state",
        deltas: [
          {
            namespace: "app",
            path: "app.dialog.visible",
            change: "became_true",
            previous: { type: "boolean", value: false, observedAt: nowMs, sourceId: "source.state" },
            current: { type: "boolean", value: true, observedAt: nowMs + 500, sourceId: "source.state", confidence: 0.98 }
          },
          {
            namespace: "app",
            path: "app.dialog.ready",
            change: "became_true",
            current: {
              type: "boolean",
              value: true,
              observedAt: nowMs + 500,
              sourceId: "source.state",
              confidence: 0.94,
              provenance: {
                extractorId: "demo.dialog-readiness",
                extractorVersion: "1.0",
                inputs: ["app.dialog.visible"]
              }
            }
          }
        ]
      },
      {
        type: "note",
        id: "entry.wait-note",
        recordingId,
        timestamp: nowMs + 650,
        monotonicOffsetMs: 650,
        sequence: 3,
        sourceId: "source.notes",
        noteId: "note.wait-for-ready"
      },
      {
        type: "action",
        id: "entry.confirm",
        recordingId,
        timestamp: nowMs + 950,
        monotonicOffsetMs: 950,
        sequence: 4,
        sourceId: "source.operator",
        actionType: "ui.click",
        parameters: { button: "primary" },
        target: { type: "ui_element", id: "confirm", label: "Confirm" },
        origin: "operator",
        startedAt: nowMs + 950,
        completedAt: nowMs + 980,
        result: { status: "succeeded" }
      },
      {
        type: "state_delta",
        id: "entry.confirmed",
        recordingId,
        timestamp: nowMs + 1_200,
        monotonicOffsetMs: 1_200,
        sequence: 5,
        sourceId: "source.state",
        deltas: [
          {
            namespace: "app",
            path: "app.confirmed",
            change: "became_true",
            previous: { type: "boolean", value: false, observedAt: nowMs, sourceId: "source.state" },
            current: { type: "boolean", value: true, observedAt: nowMs + 1_200, sourceId: "source.state", confidence: 0.99 }
          }
        ]
      }
    ],
    notes: [
      {
        id: "note.wait-for-ready",
        timestamp: nowMs + 650,
        text: "Wait for the dialog to finish loading before confirming.",
        source: "typed",
        scope: "action",
        linkedEntryIds: ["entry.confirm"],
        confidence: 1
      }
    ],
    metadata: {}
  };

  const normalizedTimeline: NormalizedTimeline = {
    schemaVersion: "0.1",
    normalizedTimelineId: "timeline.demo-open-and-confirm.normalized",
    recordingId,
    taskId,
    sourceRecording: {
      layer: "raw_recording",
      artifactId: recordingId
    },
    initialState,
    timeline: recording.timeline,
    issues: [],
    generatedAt: nowMs + 1_300,
    metadata: {
      domainId: null
    }
  };

  const openToConfirmEdge = {
    id: "edge.open-to-confirm",
    fromNodeId: "node.open-dialog",
    toNodeId: "node.confirm",
    probability: 0.95
  };

  const policy: PolicyGraph = {
    schemaVersion: "0.1",
    policyId: "policy.demo-confirm",
    taskId,
    version: "0.1.0",
    nodes: [
      {
        id: "node.open-dialog",
        label: "Open dialog",
        eligibility: { type: "all", conditions: [{ signalPath: "app.dialog.visible", operator: "equals", expected: false, required: true }] },
        actions: [
          {
            id: "policy-action.open-dialog",
            actionType: "ui.click",
            parameters: { button: "primary" },
            target: { type: "ui_element", id: "open-dialog", label: "Open Dialog" },
            sourceEvidence: [{ layer: "raw_recording", artifactId: recordingId, entryId: "entry.open-dialog" }]
          }
        ],
        successConditions: { type: "all", conditions: [{ signalPath: "app.dialog.visible", operator: "equals", expected: true, required: true }] },
        timeout: { timeoutMs: 2_000, settleMs: 100 },
        retry: { maxAttempts: 1 },
        recovery: { strategy: "rescore_nodes", maxRecoveryAttempts: 2 },
        outgoingEdges: [openToConfirmEdge],
        sourceEvidence: [{ layer: "raw_recording", artifactId: recordingId, entryId: "entry.open-dialog" }],
        generatedMetadata: { generatedBy: "signal_miner", generatedAt: nowMs + 1_500, confidence: 0.8 }
      },
      {
        id: "node.confirm",
        label: "Confirm",
        eligibility: { type: "all", conditions: [{ signalPath: "app.dialog.visible", operator: "equals", expected: true, required: true }] },
        readinessConditions: { type: "all", conditions: [{ signalPath: "app.dialog.ready", operator: "equals", expected: true, required: true }] },
        actions: [
          {
            id: "policy-action.confirm",
            actionType: "ui.click",
            parameters: { button: "primary" },
            target: { type: "ui_element", id: "confirm", label: "Confirm" },
            sourceEvidence: [{ layer: "raw_recording", artifactId: recordingId, entryId: "entry.confirm" }]
          }
        ],
        successConditions: { type: "all", conditions: [{ signalPath: "app.confirmed", operator: "equals", expected: true, required: true }] },
        timeout: { timeoutMs: 2_000, settleMs: 100 },
        retry: { maxAttempts: 1 },
        recovery: { strategy: "pause", maxRecoveryAttempts: 0 },
        outgoingEdges: [],
        sourceEvidence: [
          { layer: "raw_recording", artifactId: recordingId, entryId: "entry.confirm" },
          { layer: "raw_recording", artifactId: recordingId, noteId: "note.wait-for-ready" }
        ],
        generatedMetadata: { generatedBy: "signal_miner", generatedAt: nowMs + 1_500, confidence: 0.85 }
      }
    ],
    edges: [openToConfirmEdge],
    sourceEvidence: [{ layer: "raw_recording", artifactId: recordingId }],
    generatedMetadata: { generatedBy: "signal_miner", generatedAt: nowMs + 1_500, confidence: 0.82 },
    metadata: {}
  };

  const learnedTaskModel: LearnedTaskModel = {
    schemaVersion: "0.1",
    learnedTaskModelId: "model.demo-confirm.0-1-0",
    taskId,
    version: "0.1.0",
    actionClusters: [
      {
        id: "cluster.open-dialog",
        label: "Open dialog",
        actionTemplate: policy.nodes[0]!.actions[0]!,
        positiveRequirements: [
          { signalPath: "app.dialog.visible", operator: "equals", expected: false, required: true }
        ],
        negativeRequirements: [],
        expectedEffects: [
          {
            signalPath: "app.dialog.visible",
            condition: { signalPath: "app.dialog.visible", operator: "equals", expected: true, required: true },
            probability: 0.95,
            evidence: [{ layer: "raw_recording", artifactId: recordingId, entryId: "entry.dialog-visible" }]
          }
        ],
        possibleSideEffects: [],
        confidence: 0.8,
        sourceOccurrences: ["entry.open-dialog"]
      },
      {
        id: "cluster.confirm",
        label: "Confirm",
        actionTemplate: policy.nodes[1]!.actions[0]!,
        positiveRequirements: [
          { signalPath: "app.dialog.ready", operator: "equals", expected: true, required: true }
        ],
        negativeRequirements: [],
        expectedEffects: [
          {
            signalPath: "app.confirmed",
            condition: { signalPath: "app.confirmed", operator: "equals", expected: true, required: true },
            probability: 0.97,
            evidence: [{ layer: "raw_recording", artifactId: recordingId, entryId: "entry.confirmed" }]
          }
        ],
        possibleSideEffects: [],
        confidence: 0.85,
        sourceOccurrences: ["entry.confirm"]
      }
    ],
    transitions: [
      {
        id: "transition.open-to-confirm",
        fromClusterId: "cluster.open-dialog",
        toClusterId: "cluster.confirm",
        probability: 0.95,
        evidence: [{ layer: "raw_recording", artifactId: recordingId }]
      }
    ],
    invariants: [],
    unresolvedQuestions: [],
    sourceRecordings: [recordingId],
    sourceMiningRuns: [],
    generatedAt: nowMs + 1_400,
    metadata: {
      domainId: null
    }
  };

  return { signalRegistry, recording, normalizedTimeline, learnedTaskModel, policy };
}

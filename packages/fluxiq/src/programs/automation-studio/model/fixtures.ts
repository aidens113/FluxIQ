import type { LearnedTaskModel } from "../learning/index.ts";
import type { NormalizedTimeline } from "../normalization/index.ts";
import {
  createBlankAutomationStudioFlowArtifact,
  type AutomationStudioFlowArtifact
} from "./flows.ts";
import type {
  AutomationStudioAdaptationPolicy,
  AutomationStudioFlowAdaptation,
  AutomationStudioFlowChangeProposal,
  AutomationStudioFlowInstruction,
  AutomationStudioFlowRouter,
  AutomationStudioFlowRunDetail,
  AutomationStudioFlowRunSummary,
  AutomationStudioFlowSubflow
} from "./flow-adaptation.ts";
import type { PolicyGraph } from "./policies.ts";
import type { RecordingSession } from "./recordings.ts";
import type { SignalRegistry } from "./signals.ts";

export type AutomationStudioFixture = {
  signalRegistry: SignalRegistry;
  recording: RecordingSession;
  normalizedTimeline: NormalizedTimeline;
  learnedTaskModel: LearnedTaskModel;
  policy: PolicyGraph;
};

export type AutomationStudioFlowExpansionFixture = {
  flow: AutomationStudioFlowArtifact;
  router: AutomationStudioFlowRouter;
  subflows: AutomationStudioFlowSubflow[];
  instructions: AutomationStudioFlowInstruction[];
  changeProposal: AutomationStudioFlowChangeProposal;
  runSummary: AutomationStudioFlowRunSummary;
  runDetail: AutomationStudioFlowRunDetail;
  adaptation: AutomationStudioFlowAdaptation;
  policy: AutomationStudioAdaptationPolicy;
};

export type AutomationStudioLargeProjectFixtureOptions = {
  projectId?: string;
  flowCount?: number;
  subflowsPerFlow?: number;
  runsPerFlow?: number;
  adaptationsPerFlow?: number;
  instructionsPerFlow?: number;
  recordingCount?: number;
  nowMs?: number;
};

export type AutomationStudioLargeProjectFixture = {
  projectId: string;
  flows: AutomationStudioFlowArtifact[];
  routers: AutomationStudioFlowRouter[];
  subflows: AutomationStudioFlowSubflow[];
  instructions: AutomationStudioFlowInstruction[];
  changeProposals: AutomationStudioFlowChangeProposal[];
  runDetails: AutomationStudioFlowRunDetail[];
  adaptations: AutomationStudioFlowAdaptation[];
  policies: AutomationStudioAdaptationPolicy[];
  recordings: RecordingSession[];
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

export function createAutomationStudioFlowExpansionFixture(nowMs = 2_000): AutomationStudioFlowExpansionFixture {
  const projectId = "project.adaptive-demo";
  const flowId = "flow.adaptive-demo";
  const routerId = "router.adaptive-demo";
  const primarySubflowId = "subflow.primary";
  const recoverySubflowId = "subflow.dismiss-popup";
  const instructionId = "instruction.flow.goal";
  const adaptationId = "adaptation.dismiss-popup";
  const proposalId = "proposal.dismiss-popup";
  const runId = "run.adaptive-demo.1";
  const policyId = "adaptation-policy.adaptive-demo";

  const subflows: AutomationStudioFlowSubflow[] = [
    { schemaVersion: "0.1", subflowId: primarySubflowId, flowId, projectId, name: "Primary path", role: "primary", status: "active", tags: ["primary"], createdAt: nowMs, updatedAt: nowMs },
    { schemaVersion: "0.1", subflowId: recoverySubflowId, flowId, projectId, name: "Dismiss popup", role: "recovery", status: "active", tags: ["recovery", "popup"], createdAt: nowMs, updatedAt: nowMs }
  ];

  const router: AutomationStudioFlowRouter = {
    schemaVersion: "0.1",
    routerId,
    flowId,
    projectId,
    name: "Adaptive demo router",
    rules: [
      { schemaVersion: "0.1", ruleId: "route.primary", routerId, name: "Primary route", target: { kind: "subflow", subflowId: primarySubflowId }, order: 0, status: "active", confidence: 0.9, createdAt: nowMs, updatedAt: nowMs }
    ],
    fallback: { kind: "subflow", subflowId: recoverySubflowId },
    status: "active",
    createdAt: nowMs,
    updatedAt: nowMs
  };

  const instructions: AutomationStudioFlowInstruction[] = [
    {
      schemaVersion: "0.1",
      instructionId,
      title: "Prefer deterministic recovery",
      body: "When a popup blocks progress, dismiss it once and retry the original action before asking for manual help.",
      scope: { kind: "flow", projectId, flowId },
      priority: 100,
      status: "active",
      requirement: "advisory",
      tags: ["runtime", "error", "safety"],
      createdAt: nowMs,
      updatedAt: nowMs
    }
  ];

  const changeProposal: AutomationStudioFlowChangeProposal = {
    schemaVersion: "0.1",
    proposalId,
    flowId,
    projectId,
    subflowId: recoverySubflowId,
    sourceRunId: runId,
    sourceAdaptationId: adaptationId,
    sourceInstructionIds: [instructionId],
    mode: "auto",
    status: "auto_approved",
    riskLevel: "low",
    patches: [{ kind: "create_subflow", targetId: recoverySubflowId, summary: "Create a recovery subflow that dismisses a blocking popup." }],
    createdBy: "llm",
    createdAt: nowMs + 10,
    updatedAt: nowMs + 10
  };

  const adaptation: AutomationStudioFlowAdaptation = {
    schemaVersion: "0.1",
    adaptationId,
    flowId,
    projectId,
    subflowId: recoverySubflowId,
    sourceRunId: runId,
    sourceInstructionIds: [instructionId],
    trigger: "popup.visible blocks primary action",
    diagnosis: "A popup blocked the expected primary action target.",
    patch: changeProposal.patches,
    validationResults: [{ runId, status: "succeeded", checkedAt: nowMs + 20 }],
    appliedTo: [{ kind: "subflow", id: recoverySubflowId }],
    status: "validated",
    author: "llm",
    riskLevel: "low",
    proposalId,
    createdAt: nowMs + 10,
    updatedAt: nowMs + 20
  };

  const policy: AutomationStudioAdaptationPolicy = {
    schemaVersion: "0.1",
    policyId,
    scope: { kind: "flow", flowId },
    preset: "adaptive",
    proposalMode: "auto",
    allowRuntimeRecovery: true,
    allowCreateRecoveryPaths: true,
    allowModifySubflows: true,
    allowCreateSubflows: true,
    allowModifyRouter: true,
    allowModifyExpectations: true,
    allowModifyActionTargets: true,
    allowDeleteOrDisableBehavior: false,
    allowExternalSideEffects: false,
    requireApprovalForDestructiveChanges: true,
    requireApprovalForExternalSideEffects: true,
    maxInterventionsPerRun: 3,
    maxEstimatedCostUsdPerRun: 1,
    createdAt: nowMs,
    updatedAt: nowMs
  };

  const runSummary: AutomationStudioFlowRunSummary = {
    schemaVersion: "0.1",
    runId,
    flowId,
    projectId,
    status: "succeeded",
    startedAt: nowMs + 1,
    finishedAt: nowMs + 30,
    updatedAt: nowMs + 30,
    routeDecisionCount: 1,
    subflowEntryCount: 2,
    actionAttemptCount: 3,
    interventionCount: 1,
    adaptationCount: 1,
    tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.01 }
  };

  const runDetail: AutomationStudioFlowRunDetail = {
    schemaVersion: "0.1",
    summary: runSummary,
    inputs: { demo: true },
    routeDecisions: [{ decisionId: "decision.primary", routerId, selectedRuleId: "route.primary", selectedSubflowId: primarySubflowId, decidedAt: nowMs + 2 }],
    subflows: [
      { entryId: "subflow-entry.primary", subflowId: primarySubflowId, enteredAt: nowMs + 3, exitedAt: nowMs + 12, status: "waiting" },
      { entryId: "subflow-entry.recovery", subflowId: recoverySubflowId, enteredAt: nowMs + 13, exitedAt: nowMs + 20, status: "succeeded" }
    ],
    interventions: [
      {
        schemaVersion: "0.1",
        interventionId: "intervention.dismiss-popup",
        runId,
        flowId,
        projectId,
        kind: "runtime_patch",
        reason: "Known Flow structure could not handle a popup.",
        promptVersion: "runtime_patch.v1",
        provider: "fixture",
        model: "fixture",
        instructionIds: [instructionId],
        validation: { ok: true },
        ...(runSummary.tokenUsage ? { tokenUsage: runSummary.tokenUsage } : {}),
        createdAt: nowMs + 12
      }
    ],
    adaptationIds: [adaptationId],
    changeProposalIds: [proposalId]
  };

  const flow = {
    ...createBlankAutomationStudioFlowArtifact({ flowId, projectId, name: "Adaptive demo", now: nowMs }),
    expansion: {
      routerId,
      subflowIds: subflows.map((subflow) => subflow.subflowId),
      instructionIds: instructions.map((instruction) => instruction.instructionId),
      changeProposalIds: [proposalId],
      runIds: [runId],
      adaptationIds: [adaptationId],
      adaptationPolicyId: policyId
    }
  };

  return { flow, router, subflows, instructions, changeProposal, runSummary, runDetail, adaptation, policy };
}

export function createAutomationStudioLargeProjectFixture(options: AutomationStudioLargeProjectFixtureOptions = {}): AutomationStudioLargeProjectFixture {
  const projectId = options.projectId ?? "project.large-adaptive";
  const flowCount = Math.max(1, options.flowCount ?? 8);
  const subflowsPerFlow = Math.max(1, options.subflowsPerFlow ?? 6);
  const runsPerFlow = Math.max(0, options.runsPerFlow ?? 40);
  const adaptationsPerFlow = Math.max(0, options.adaptationsPerFlow ?? 16);
  const instructionsPerFlow = Math.max(0, options.instructionsPerFlow ?? 12);
  const recordingCount = Math.max(0, options.recordingCount ?? 10);
  const nowMs = options.nowMs ?? 50_000;

  const flows: AutomationStudioFlowArtifact[] = [];
  const routers: AutomationStudioFlowRouter[] = [];
  const subflows: AutomationStudioFlowSubflow[] = [];
  const instructions: AutomationStudioFlowInstruction[] = [];
  const changeProposals: AutomationStudioFlowChangeProposal[] = [];
  const runDetails: AutomationStudioFlowRunDetail[] = [];
  const adaptations: AutomationStudioFlowAdaptation[] = [];
  const policies: AutomationStudioAdaptationPolicy[] = [];

  for (let flowIndex = 0; flowIndex < flowCount; flowIndex += 1) {
    const flowId = `flow.large.${flowIndex}`;
    const routerId = `router.large.${flowIndex}`;
    const flowSubflows = Array.from({ length: subflowsPerFlow }, (_, subflowIndex): AutomationStudioFlowSubflow => ({
      schemaVersion: "0.1",
      subflowId: `subflow.large.${flowIndex}.${subflowIndex}`,
      flowId,
      projectId,
      name: subflowIndex === 0 ? `Primary ${flowIndex}` : `Recovery ${flowIndex}.${subflowIndex}`,
      role: subflowIndex === 0 ? "primary" : "recovery",
      status: "active",
      routeTags: [subflowIndex === 0 ? "primary" : "recovery", `flow-${flowIndex}`],
      createdAt: nowMs + flowIndex,
      updatedAt: nowMs + flowIndex
    }));
    subflows.push(...flowSubflows);

    routers.push({
      schemaVersion: "0.1",
      routerId,
      flowId,
      projectId,
      name: `Large router ${flowIndex}`,
      rules: flowSubflows.slice(0, Math.min(flowSubflows.length, 4)).map((subflow, ruleIndex) => ({
        schemaVersion: "0.1",
        ruleId: `route.large.${flowIndex}.${ruleIndex}`,
        routerId,
        name: `Route ${ruleIndex}`,
        target: { kind: "subflow", subflowId: subflow.subflowId },
        condition: { signalPath: `inputs.route${ruleIndex}`, operator: "equals", expected: true },
        order: ruleIndex,
        status: "active",
        createdAt: nowMs + flowIndex,
        updatedAt: nowMs + flowIndex
      })),
      fallback: { kind: "subflow", subflowId: flowSubflows[0]!.subflowId },
      status: "active",
      createdAt: nowMs + flowIndex,
      updatedAt: nowMs + flowIndex
    });

    const flowInstructions = Array.from({ length: instructionsPerFlow }, (_, instructionIndex): AutomationStudioFlowInstruction => ({
      schemaVersion: "0.1",
      instructionId: `instruction.large.${flowIndex}.${instructionIndex}`,
      title: `Instruction ${flowIndex}.${instructionIndex}`,
      body: `Prefer deterministic handling for large fixture flow ${flowIndex}, instruction ${instructionIndex}.`,
      scope: instructionIndex % 3 === 0
        ? { kind: "subflow", projectId, flowId, subflowId: flowSubflows[instructionIndex % flowSubflows.length]!.subflowId }
        : { kind: "flow", projectId, flowId },
      priority: 100 - instructionIndex,
      status: "active",
      requirement: instructionIndex % 5 === 0 ? "required" : "advisory",
      createdAt: nowMs + instructionIndex,
      updatedAt: nowMs + instructionIndex
    }));
    instructions.push(...flowInstructions);

    const flowChangeProposals: AutomationStudioFlowChangeProposal[] = Array.from({ length: Math.max(1, Math.ceil(adaptationsPerFlow / 2)) }, (_, proposalIndex) => ({
      schemaVersion: "0.1",
      proposalId: `proposal.large.${flowIndex}.${proposalIndex}`,
      flowId,
      projectId,
      subflowId: flowSubflows[(proposalIndex + 1) % flowSubflows.length]!.subflowId,
      sourceRunId: `run.large.${flowIndex}.${proposalIndex}`,
      mode: proposalIndex % 3 === 0 ? "manual" : "auto",
      status: proposalIndex % 3 === 0 ? "pending" : "auto_approved",
      riskLevel: proposalIndex % 4 === 0 ? "medium" : "low",
      patches: [{ kind: "edit_subflow", targetId: flowSubflows[(proposalIndex + 1) % flowSubflows.length]!.subflowId, summary: `Tune subflow ${proposalIndex}.` }],
      createdBy: proposalIndex % 2 === 0 ? "llm" : "runtime",
      createdAt: nowMs + proposalIndex,
      updatedAt: nowMs + proposalIndex
    }));
    changeProposals.push(...flowChangeProposals);

    for (let runIndex = 0; runIndex < runsPerFlow; runIndex += 1) {
      const runId = `run.large.${flowIndex}.${runIndex}`;
      runDetails.push({
        schemaVersion: "0.1",
        summary: {
          schemaVersion: "0.1",
          runId,
          flowId,
          projectId,
          status: runIndex % 11 === 0 ? "failed" : "succeeded",
          startedAt: nowMs + runIndex,
          finishedAt: nowMs + runIndex + 5,
          updatedAt: nowMs + runIndex,
          routeDecisionCount: 1,
          subflowEntryCount: 1,
          actionAttemptCount: 2 + (runIndex % 5),
          interventionCount: runIndex % 7 === 0 ? 1 : 0,
          adaptationCount: runIndex % 9 === 0 ? 1 : 0,
          ...(runIndex % 7 === 0 ? { tokenUsage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.002 } } : {})
        },
        inputs: { route: runIndex % 4 },
        routeDecisions: [{ decisionId: `decision.large.${flowIndex}.${runIndex}`, routerId, selectedRuleId: `route.large.${flowIndex}.0`, selectedSubflowId: flowSubflows[0]!.subflowId, decidedAt: nowMs + runIndex }],
        subflows: [{ entryId: `entry.large.${flowIndex}.${runIndex}`, subflowId: flowSubflows[0]!.subflowId, enteredAt: nowMs + runIndex, exitedAt: nowMs + runIndex + 3, status: "succeeded" }],
        interventions: runIndex % 7 === 0 ? [{
          schemaVersion: "0.1",
          interventionId: `intervention.large.${flowIndex}.${runIndex}`,
          runId,
          flowId,
          projectId,
          kind: "diagnosis",
          reason: "Large fixture diagnostic sample.",
          promptVersion: "diagnosis_only_report.v1",
          provider: "fixture",
          model: "fixture",
          tokenUsage: { inputTokens: 20, outputTokens: 10, totalTokens: 30, estimatedCostUsd: 0.002 },
          validation: { ok: true },
          createdAt: nowMs + runIndex
        }] : [],
        adaptationIds: runIndex % 9 === 0 ? [`adaptation.large.${flowIndex}.${runIndex % Math.max(1, adaptationsPerFlow)}`] : [],
        changeProposalIds: runIndex % 9 === 0 ? [flowChangeProposals[runIndex % flowChangeProposals.length]!.proposalId] : []
      });
    }

    for (let adaptationIndex = 0; adaptationIndex < adaptationsPerFlow; adaptationIndex += 1) {
      adaptations.push({
        schemaVersion: "0.1",
        adaptationId: `adaptation.large.${flowIndex}.${adaptationIndex}`,
        flowId,
        projectId,
        subflowId: flowSubflows[(adaptationIndex + 1) % flowSubflows.length]!.subflowId,
        sourceRunId: `run.large.${flowIndex}.${adaptationIndex % Math.max(1, runsPerFlow)}`,
        trigger: `Large fixture trigger ${adaptationIndex}`,
        diagnosis: "Deterministic fixture adaptation used for summary and cost regression tests.",
        patch: [{ kind: "edit_expectation", targetId: `expectation.large.${adaptationIndex}`, summary: "Tighten expected state." }],
        validationResults: [{ runId: `run.validation.${flowIndex}.${adaptationIndex}`, status: "succeeded", checkedAt: nowMs + adaptationIndex }],
        status: adaptationIndex % 4 === 0 ? "applied" : "validated",
        author: adaptationIndex % 2 === 0 ? "llm" : "runtime",
        riskLevel: adaptationIndex % 5 === 0 ? "medium" : "low",
        proposalId: flowChangeProposals[adaptationIndex % flowChangeProposals.length]!.proposalId,
        createdAt: nowMs + adaptationIndex,
        updatedAt: nowMs + adaptationIndex
      });
    }

    policies.push({
      schemaVersion: "0.1",
      policyId: `adaptation-policy.large.${flowIndex}`,
      scope: { kind: "flow", flowId },
      preset: flowIndex % 3 === 0 ? "observe" : "adaptive",
      proposalMode: flowIndex % 3 === 0 ? "manual" : "auto",
      allowRuntimeRecovery: flowIndex % 3 !== 0,
      allowCreateRecoveryPaths: true,
      allowModifySubflows: true,
      allowCreateSubflows: true,
      allowModifyRouter: true,
      allowModifyExpectations: true,
      allowModifyActionTargets: true,
      allowDeleteOrDisableBehavior: false,
      allowExternalSideEffects: false,
      requireApprovalForDestructiveChanges: true,
      requireApprovalForExternalSideEffects: true,
      maxInterventionsPerRun: 2,
      maxEstimatedCostUsdPerRun: 0.25,
      createdAt: nowMs + flowIndex,
      updatedAt: nowMs + flowIndex
    });

    flows.push({
      ...createBlankAutomationStudioFlowArtifact({ flowId, projectId, name: `Large Adaptive Flow ${flowIndex}`, now: nowMs + flowIndex }),
      expansion: {
        routerId,
        subflowIds: flowSubflows.map((subflow) => subflow.subflowId),
        instructionIds: flowInstructions.map((instruction) => instruction.instructionId),
        changeProposalIds: flowChangeProposals.map((proposal) => proposal.proposalId),
        runIds: Array.from({ length: runsPerFlow }, (_, runIndex) => `run.large.${flowIndex}.${runIndex}`),
        adaptationIds: Array.from({ length: adaptationsPerFlow }, (_, adaptationIndex) => `adaptation.large.${flowIndex}.${adaptationIndex}`),
        adaptationPolicyId: `adaptation-policy.large.${flowIndex}`
      }
    });
  }

  const recordingTemplate = createAutomationStudioFixture(nowMs).recording;
  const recordings = Array.from({ length: recordingCount }, (_, recordingIndex): RecordingSession => ({
    ...recordingTemplate,
    recordingId: `recording.large.${recordingIndex}`,
    startedAt: nowMs + recordingIndex,
    metadata: {
      ...(recordingTemplate.metadata ?? {}),
      projectId,
      title: `Large optional recording ${recordingIndex}`,
      updatedAt: nowMs + recordingIndex
    }
  }));

  return { projectId, flows, routers, subflows, instructions, changeProposals, runDetails, adaptations, policies, recordings };
}

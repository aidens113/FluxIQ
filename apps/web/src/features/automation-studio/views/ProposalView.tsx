"use client";

import { CheckCircle2, Link2, ListChecks, RefreshCcw, Save, Sparkles } from "lucide-react";
import type { NodeStatePhase } from "fluxiq/automation-studio";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { JsonObject } from "../../programs/program-api";
import { StatusBadge, StatusText, SummaryStrip } from "../../programs/shared-ui";
import { buildProposalViewModel, type ProposalStepViewModel } from "../evidence/view-model";
import { policyToReactFlowGraph } from "../graph/view-model";
import { AutomationPolicyGraphEditor } from "./GraphEditorViews";
import type { AutomationPolicyNodeData, AutomationSelection } from "../types";

export function AutomationProposalView(props: {
  actionStatus: string;
  pipelineArtifacts: any;
  proposalReview: any;
  proposalTargetFlowId: string | null;
  recordings: any[];
  selectedProposal: any;
  selectedRecording: any;
  onEnsureInspectorAvailable(): void;
  onOpenRecording(recordingId: string): void;
  onOpenState(request: { nodeId?: string; sourceId?: string; phase?: NodeStatePhase; evidenceId?: string; factPath?: string; proposalId?: string; timelineEntryId?: string }): void;
  onPipelineAction(endpoint: string, payload: JsonObject, success: string): Promise<boolean | void>;
  onProposalReviewChange(proposalId: string, review: JsonObject): void;
  onProcessFinalizedRecording(recordingId: string, force?: boolean): Promise<boolean | void>;
  onProcessProposalWithLlm(proposalId: string): void;
  setSelection(selection: AutomationSelection): void;
}) {
  const selectedArtifact = props.selectedProposal;
  const recording = props.selectedRecording ?? props.recordings.find((item) => item.recordingId === (selectedArtifact?.recordingId ?? selectedArtifact?.metadata?.recordingId));
  const recordingFlowProposal = selectedArtifact?.candidates ? selectedArtifact : null;
  const proposal = recordingFlowProposal ? recordingFlowProposalToPolicyProposal(recordingFlowProposal) : selectedArtifact?.policy ? selectedArtifact : (props.pipelineArtifacts?.policyProposals ?? []).find((item: any) => item.metadata?.recordingId === recording?.recordingId);
  const model = buildProposalViewModel({ artifacts: props.pipelineArtifacts, proposal, recording });
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState("");
  const baseGraph = useMemo(() => {
    const next = policyToReactFlowGraph(proposal?.policy, "");
    const proposedIds = new Set((proposal?.patch?.nodes ?? proposal?.policy?.nodes ?? []).map((node: any) => String(node.id)));
    return {
      nodes: next.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          reviewTone: proposedIds.has(node.id) ? "proposed" as const : "existing" as const
        }
      })),
      edges: next.edges
    };
  }, [proposal]);
  const [graph, setGraph] = useState<{ nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] }>(baseGraph);
  const graphRef = useRef(graph);
  const lastRestoredGraphSignatureRef = useRef("");
  useEffect(() => {
    const nextGraph = (
      proposal?.proposalId
      && props.proposalReview
      && props.proposalReview.proposalId === proposal.proposalId
      && props.proposalReview.sourceGeneratedAt === proposal.generatedAt
      && Array.isArray(props.proposalReview.nodes)
      && Array.isArray(props.proposalReview.edges)
    )
      ? { nodes: props.proposalReview.nodes as Array<Node<AutomationPolicyNodeData>>, edges: props.proposalReview.edges as Edge[] }
      : baseGraph;
    const signature = proposalGraphSignature(nextGraph, proposal?.proposalId ?? "", proposal?.generatedAt ?? 0);
    if (signature === lastRestoredGraphSignatureRef.current) return;
    lastRestoredGraphSignatureRef.current = signature;
    graphRef.current = nextGraph;
    setGraph(nextGraph);
  }, [baseGraph, proposal?.generatedAt, proposal?.proposalId, props.proposalReview]);
  const selectedStep = model?.steps.find((step) => step.id === selectedGraphNodeId || `node.${step.id}` === selectedGraphNodeId) ?? model?.steps[0];
  const selectedGraphNode = graph.nodes.find((node) => node.id === selectedGraphNodeId) ?? graph.nodes[0];
  const publishProposalNodeSelection = (node: Node<AutomationPolicyNodeData> | undefined, step: ProposalStepViewModel | undefined) => {
    if (!proposal?.proposalId || !node) return;
    props.setSelection({
      kind: "editor-node",
      id: node.id,
      node: {
        label: node.data.label,
        nodeType: node.data.isStart ? "start" : "policy",
        family: node.data.recovery,
        description: node.data.description,
        ...(node.data.customDescription !== undefined ? { customDescription: node.data.customDescription } : {}),
        ...(node.data.nodeDefinitionId !== undefined ? { nodeDefinitionId: node.data.nodeDefinitionId } : {}),
        ...(node.data.icon !== undefined ? { icon: node.data.icon } : {}),
        inputs: node.data.inputs,
        outputs: node.data.outputs,
        parameters: node.data.parameters,
        parameterValues: node.data.parameterValues,
        metadata: {
          ...(node.data.metadata ?? {}),
          proposalId: proposal.proposalId,
          ...(recording?.recordingId ? { recordingId: recording.recordingId } : {}),
          proposalStep: step ? {
            label: step.label,
            description: step.description,
            actions: step.actions,
            requirements: step.requirements,
            expectedEffects: step.expectedEffects,
            confidence: step.confidence,
            occurrenceCount: step.occurrenceCount,
            ...(step.transition ? { transition: step.transition } : {}),
            evidence: step.evidence.map((signal) => ({ id: signal.id, title: signal.title, relation: signal.relation }))
          } : {
            label: node.data.label,
            description: node.data.description,
            actions: node.data.actionTypes.length ? node.data.actionTypes : ["No action configured"],
            requirements: [],
            expectedEffects: [],
            confidence: typeof node.data.confidence === "number" ? `${Math.round(node.data.confidence * 100)}%` : "-",
            occurrenceCount: 1,
            evidence: []
          }
        },
        actionTypes: node.data.actionTypes
      }
    });
  };
  const updateGraph = (next: { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] }) => {
    graphRef.current = next;
    setGraph(next);
    if (!proposal?.proposalId) return;
    props.onProposalReviewChange(proposal.proposalId, {
      proposalId: proposal.proposalId,
      sourceGeneratedAt: proposal.generatedAt,
      targetFlowId: props.proposalTargetFlowId ?? "",
      nodes: next.nodes as unknown as JsonObject[],
      edges: next.edges as unknown as JsonObject[],
      updatedAt: Date.now(),
      dirty: true
    });
  };
  const updateSelectedNode = (changes: Partial<AutomationPolicyNodeData>) => {
    if (!selectedGraphNode) return;
    updateGraph({
      nodes: graph.nodes.map((node) => node.id === selectedGraphNode.id ? { ...node, data: { ...node.data, ...changes } } : node),
      edges: graph.edges
    });
  };
  useEffect(() => {
    const onProposalNodeUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string; label?: string; customDescription?: string; parameterValues?: JsonObject }>).detail;
      if (!detail?.nodeId || detail.nodeId !== selectedGraphNode?.id) return;
      updateSelectedNode({
        ...(detail.label !== undefined ? { label: detail.label } : {}),
        ...(detail.customDescription !== undefined ? { customDescription: detail.customDescription } : {}),
        ...(detail.parameterValues !== undefined ? { parameterValues: detail.parameterValues } : {})
      });
    };
    window.addEventListener("automation-studio:update-proposal-node", onProposalNodeUpdate);
    window.addEventListener("automation-studio:update-node-parameters", onProposalNodeUpdate);
    return () => {
      window.removeEventListener("automation-studio:update-proposal-node", onProposalNodeUpdate);
      window.removeEventListener("automation-studio:update-node-parameters", onProposalNodeUpdate);
    };
  }, [selectedGraphNode?.id, graph.nodes, graph.edges]);
  const policyOverride = () => proposal ? reactFlowGraphToPolicyOverride(proposal.policy, graphRef.current, proposal.policy?.taskId ?? proposal.proposalId) : null;
  const applyToExistingFlow = () => {
    if (!proposal) return;
    if (!props.proposalTargetFlowId) {
      window.alert("Open a canonical Flow at least once before applying this proposal, or use Save as New Flow.");
      return;
    }
    const override = policyOverride();
    void props.onPipelineAction("approve-policy-proposal", { proposalId: proposal.proposalId, targetFlowId: props.proposalTargetFlowId, requireExistingFlow: true, ...(override ? { policyOverride: override as unknown as JsonObject } : {}) }, "Proposal applied to Flow.");
  };
  const saveAsNewFlow = () => {
    if (!proposal) return;
    if (recordingFlowProposal) {
      const name = window.prompt("Name for the new Flow", `Recorded flow ${recordingFlowProposal.mapper.id}`)?.trim();
      if (!name) return;
      const override = reactFlowGraphToPolicyOverride(proposal.policy, graphRef.current, proposal.policy?.taskId ?? proposal.proposalId);
      void props.onPipelineAction("review-recording-flow-proposal", {
        proposalId: recordingFlowProposal.proposalId,
        decision: "approved",
        destination: { kind: "flow", name },
        policyOverride: override as unknown as JsonObject
      }, "Recording proposal saved as a new Flow.");
      return;
    }
    const raw = window.prompt("Flow ID for the new saved Flow", `flow.${proposal.policy?.taskId ?? proposal.proposalId}`);
    const targetFlowId = raw?.trim();
    if (!targetFlowId) return;
    const override = reactFlowGraphToPolicyOverride(proposal.policy, graphRef.current, proposal.policy?.taskId ?? proposal.proposalId);
    void props.onPipelineAction("approve-policy-proposal", { proposalId: proposal.proposalId, targetFlowId, policyOverride: override as unknown as JsonObject }, "Proposal saved as Flow.");
  };
  const approveRecordingProposalToFlow = () => {
    if (!recordingFlowProposal || !proposal) return;
    if (!props.proposalTargetFlowId) {
      window.alert("Open a canonical Flow at least once before approving this recording proposal.");
      return;
    }
    const override = reactFlowGraphToPolicyOverride(proposal.policy, graphRef.current, proposal.policy?.taskId ?? proposal.proposalId);
    void props.onPipelineAction("review-recording-flow-proposal", {
      proposalId: recordingFlowProposal.proposalId,
      decision: "approved",
      destination: { kind: "flow", flowId: props.proposalTargetFlowId },
      policyOverride: override as unknown as JsonObject
    }, "Recording proposal approved into a Flow.");
  };
  return (
    <section className="automation-proposal-workspace">
      <header className="automation-proposal-header">
        <div>
          <strong>{recordingFlowProposal ? `Recording Flow Proposal: ${recordingFlowProposal.mapper.id}` : model ? `Policy Flow Proposal: ${model.title}` : "Recording Proposals"}</strong>
          <span>{recordingFlowProposal ? `${recordingFlowProposal.candidates.length} proposed action nodes from ${recordingFlowProposal.recordingId}` : model ? `Source recording ${model.source}` : "Select a generated proposal from the sidebar."}</span>
        </div>
        <div className="automation-pipeline-controls">
          <button className="button" disabled={!recording} onClick={() => recording && props.onOpenRecording(recording.recordingId)} type="button"><Link2 size={13} aria-hidden />Open Source Recording</button>
          <button className="button" disabled={!recording} onClick={() => recording && void props.onProcessFinalizedRecording(recording.recordingId, true)} type="button"><RefreshCcw size={13} aria-hidden />Regenerate Proposal</button>
          <button className="button button-primary" disabled={!proposal} onClick={recordingFlowProposal ? approveRecordingProposalToFlow : applyToExistingFlow} type="button"><CheckCircle2 size={13} aria-hidden />{recordingFlowProposal ? "Approve to Open Flow" : "Apply to Open Flow"}</button>
          <button className="button" disabled={!proposal} onClick={saveAsNewFlow} type="button"><Save size={13} aria-hidden />Save as New Flow</button>
          <button className="button" disabled={!proposal || Boolean(recordingFlowProposal)} onClick={() => proposal && props.onProcessProposalWithLlm(proposal.proposalId)} type="button"><Sparkles size={13} aria-hidden />Process With LLM</button>
          <button className="button" disabled={!proposal || !selectedGraphNodeId} onClick={() => proposal && selectedGraphNodeId && props.onOpenState({ nodeId: selectedGraphNodeId, ...(proposal.proposalId ? { proposalId: proposal.proposalId } : {}), phase: "input" })} type="button"><ListChecks size={13} aria-hidden />Open Node State</button>
        </div>
        {props.actionStatus ? <StatusText value={props.actionStatus} /> : null}
      </header>
      <section className="automation-proposal-body">
        {!model && !recordingFlowProposal ? <div className="automation-project-empty compact"><strong>No proposal selected</strong><span>Finalized recordings generate proposals automatically. Regenerate from a source recording if needed.</span></div> : null}
        {model ? <>
          <section className="automation-proposal-summary-panel">
            <div>
              <span>Proposal</span>
              <strong>{model.title}</strong>
              <p>{model.summary}</p>
            </div>
            <StatusBadge value={model.status} />
          </section>
          <SummaryStrip items={[["Unique steps", model.steps.length], ["Recorded items", model.rawStepCount], ["Evidence signals", model.evidenceCount], ["Generated", model.generated]]} />
          <section className="automation-proposal-graph-review">
            <AutomationPolicyGraphEditor
              className="proposal-review"
              editableNodeIds={(proposal?.patch?.nodes ?? proposal?.policy?.nodes ?? []).map((node: any) => String(node.id))}
              edges={graph.edges}
              mode="proposal-review"
              nodes={graph.nodes}
              selectedNodeId={selectedGraphNodeId}
              showPalette
              onGraphChange={updateGraph}
              onNodeSelect={(node) => {
                setSelectedGraphNodeId(node.id);
                const step = model.steps.find((candidate) => candidate.id === node.id || `node.${candidate.id}` === node.id);
                publishProposalNodeSelection(node, step);
                props.onEnsureInspectorAvailable();
              }}
            />
          </section>
        </> : null}
      </section>
    </section>
  );
}

function recordingFlowProposalToPolicyProposal(proposal: any): any {
  const policy = {
    schemaVersion: "0.1",
    policyId: `policy.${proposal?.proposalId ?? "recording-proposal"}`,
    taskId: proposal?.recordingId ?? proposal?.proposalId ?? "recording-proposal",
    sourceEvidence: [{ layer: "recording", artifactId: proposal?.recordingId ?? "" }],
    nodes: (proposal?.candidates ?? []).map((candidate: any, index: number) => ({
      id: recordingCandidateNodeId(candidate, index),
      label: candidate.label ?? candidate.outputId,
      description: `Recorded action for ${candidate.outputId}.`,
      actions: [{
        id: `action.${index + 1}`,
        actionType: candidate.outputId,
        outputId: candidate.outputId,
        parameters: candidate.parameters ?? {}
      }],
      sourceEvidence: candidate.evidence ?? [],
      timeout: { timeoutMs: candidate.expectedConfirmation?.timeoutMs ?? 5_000 },
      retry: { maxAttempts: 1, backoffMs: 500 },
      recovery: { strategy: "pause" },
      successConditions: { type: "all", conditions: [] },
      failureConditions: { type: "none", conditions: [] },
      generatedMetadata: { generatedBy: "recording_mapper", generatedAt: proposal.generatedAt ?? Date.now(), confidence: candidate.confidence ?? 0.5 },
      metadata: {
        parameters: recordingCandidateParameters(candidate),
        parameterValues: {
          outputId: candidate.outputId,
          parameters: candidate.parameters ?? {},
          ...(candidate.expectedConfirmation ? { confirmationInputId: candidate.expectedConfirmation.inputId, confirmationTimeoutMs: candidate.expectedConfirmation.timeoutMs ?? 5_000 } : {})
        },
        recordingProposalId: proposal.proposalId,
        recordingCandidateId: candidate.candidateId,
        mapperId: proposal.mapper?.id,
        sourceObservationIds: candidate.sourceObservationIds ?? [],
        evidence: candidate.evidence ?? [],
        policyStateEligible: false
      }
    })),
    edges: (proposal?.candidates ?? []).slice(1).map((candidate: any, index: number) => ({
      id: `edge.recorded.${index + 1}`,
      fromNodeId: recordingCandidateNodeId(proposal.candidates[index], index),
      toNodeId: recordingCandidateNodeId(candidate, index + 1),
      label: "Next"
    })),
    metadata: {
      source: "recording_flow_proposal",
      recordingProposalId: proposal?.proposalId,
      recordingId: proposal?.recordingId,
      mapperId: proposal?.mapper?.id,
      mapperVersion: proposal?.mapper?.version
    }
  };
  return {
    proposalId: proposal?.proposalId,
    status: proposal?.status,
    generatedAt: proposal?.generatedAt,
    recordingId: proposal?.recordingId,
    policy,
    patch: { targetTaskId: policy.taskId, mergeStrategy: "append_or_branch", nodes: policy.nodes, edges: policy.edges },
    metadata: policy.metadata
  };
}

function recordingCandidateNodeId(candidate: any, index: number): string {
  return `recorded.${safeNodeSegment(candidate?.candidateId ?? String(index + 1))}`;
}

function recordingCandidateParameters(candidate: any) {
  const payload = candidate?.parameters && typeof candidate.parameters === "object" && !Array.isArray(candidate.parameters) ? candidate.parameters : {};
  return [
    { id: "parameters", label: "Output payload", description: "Values passed to this recorded output action.", valueType: "object", defaultValue: payload },
    ...(candidate?.expectedConfirmation ? [
      { id: "confirmationInputId", label: "Confirmation input", description: "Action input stream that confirms the output occurred.", valueType: "string", defaultValue: candidate.expectedConfirmation.inputId ?? "", ui: { control: "identifier", placeholder: "Registered action input ID" } },
      { id: "confirmationTimeoutMs", label: "Confirmation timeout", description: "How long to wait for confirmation.", valueType: "number", defaultValue: candidate.expectedConfirmation.timeoutMs ?? 5_000 }
    ] : [])
  ];
}

function safeNodeSegment(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "candidate";
}

function reactFlowGraphToPolicyOverride(basePolicy: any, graph: { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] }, targetTaskId: string) {
  const baseNodesById = new Map((basePolicy?.nodes ?? []).map((node: any) => [node.id, node]));
  const targetPolicyId = basePolicy?.taskId === targetTaskId
    ? basePolicy?.policyId ?? `policy.${targetTaskId}.proposal`
    : `policy.${targetTaskId}.proposal`;
  const nodes = graph.nodes.map((node, index) => {
    const existing = baseNodesById.get(node.id) as any;
    const actions = proposalPolicyActionsFromNode(node, existing);
    return {
      ...(existing ?? {
        id: node.id,
        label: node.data.label,
        description: node.data.description,
        eligibility: { type: "all", conditions: [] },
        successConditions: { type: "all", conditions: [] },
        failureConditions: { type: "none", conditions: [] },
        timeout: { timeoutMs: node.data.timeoutMs ?? 5000 },
        retry: { maxAttempts: 1, backoffMs: 500 },
        recovery: { strategy: "pause" },
        outgoingEdges: [],
        sourceEvidence: [],
        generatedMetadata: { generatedBy: "proposal_editor", generatedAt: Date.now(), confidence: node.data.confidence ?? 0.5 }
      }),
      id: node.id,
      label: node.data.label,
      description: node.data.customDescription || node.data.description,
      actions,
      timeout: { ...((existing as any)?.timeout ?? {}), timeoutMs: Number(node.data.parameterValues?.timeoutMs ?? node.data.timeoutMs ?? (existing as any)?.timeout?.timeoutMs ?? 5000) },
      metadata: {
        ...((existing as any)?.metadata ?? {}),
        ...(node.data.customDescription !== undefined ? { customDescription: node.data.customDescription } : {}),
        ...(node.data.nodeDefinitionId !== undefined ? { nodeDefinitionId: node.data.nodeDefinitionId } : {}),
        ...(node.data.nodeDefinitionVersion !== undefined ? { nodeDefinitionVersion: node.data.nodeDefinitionVersion } : {}),
        parameters: node.data.parameters as unknown as JsonObject[],
        parameterValues: node.data.parameterValues,
        position: node.position,
        proposalEdited: true,
        order: index
      }
    };
  });
  const edges = graph.edges.map((edge, index) => ({
    id: edge.id,
    fromNodeId: edge.source,
    toNodeId: edge.target,
    label: String(edge.label ?? edge.data?.label ?? "Next"),
    probability: typeof edge.data?.probability === "number" ? edge.data.probability : undefined,
    metadata: { ...(edge.data as JsonObject | undefined), order: index }
  }));
  return {
    ...(basePolicy ?? {}),
    policyId: targetPolicyId,
    taskId: targetTaskId,
    nodes: nodes.map((node) => ({ ...node, outgoingEdges: edges.filter((edge) => edge.fromNodeId === node.id) })),
    edges,
    metadata: {
      ...(basePolicy?.metadata ?? {}),
      proposalEdited: true
    }
  };
}

function proposalPolicyActionsFromNode(node: Node<AutomationPolicyNodeData>, existing: any): any[] {
  const values = node.data.parameterValues ?? {};
  const outputId = typeof values.outputId === "string" && values.outputId.trim()
    ? values.outputId
    : existing?.actions?.[0]?.outputId ?? existing?.actions?.[0]?.actionType ?? node.data.actionTypes[0] ?? "";
  if (!outputId && !node.data.actionTypes.length) return [];
  const actionTypes = node.data.actionTypes.length ? node.data.actionTypes : [String(outputId)];
  return actionTypes.map((actionType, actionIndex) => ({
    ...(existing?.actions?.[actionIndex] ?? {}),
    id: existing?.actions?.[actionIndex]?.id ?? `action.${node.id}.${actionIndex + 1}`,
    actionType,
    outputId: actionIndex === 0 ? outputId : existing?.actions?.[actionIndex]?.outputId,
    parameters: actionIndex === 0 ? values.parameters ?? existing?.actions?.[actionIndex]?.parameters ?? {} : existing?.actions?.[actionIndex]?.parameters ?? {},
    ...(actionIndex === 0 && typeof values.confirmationInputId === "string" && values.confirmationInputId ? { confirmationInputId: values.confirmationInputId, confirmationTimeoutMs: Number(values.confirmationTimeoutMs ?? 5_000) } : {})
  }));
}

function proposalGraphSignature(graph: { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] }, proposalId: string, generatedAt: number): string {
  return JSON.stringify({
    proposalId,
    generatedAt,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
      label: node.data.label,
      description: node.data.description,
      customDescription: node.data.customDescription,
      parameterValues: node.data.parameterValues
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label ?? edge.data?.label
    }))
  });
}

"use client";

import { CheckCircle2, Link2, RefreshCcw, Save, Sparkles } from "lucide-react";
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
  onOpenRecording(recordingId: string): void;
  onPipelineAction(endpoint: string, payload: JsonObject, success: string): Promise<boolean | void>;
  onProposalReviewChange(proposalId: string, review: JsonObject): void;
  onProcessFinalizedRecording(recordingId: string, force?: boolean): Promise<boolean | void>;
  onProcessProposalWithLlm(proposalId: string): void;
  setSelection(selection: AutomationSelection): void;
}) {
  const selectedArtifact = props.selectedProposal;
  const recording = props.selectedRecording ?? props.recordings.find((item) => item.recordingId === (selectedArtifact?.recordingId ?? selectedArtifact?.metadata?.recordingId));
  const proposal = selectedArtifact?.policy ? selectedArtifact : (props.pipelineArtifacts?.policyProposals ?? []).find((item: any) => item.metadata?.recordingId === recording?.recordingId);
  const recordingFlowProposal = selectedArtifact?.candidates ? selectedArtifact : null;
  const model = buildProposalViewModel({ artifacts: props.pipelineArtifacts, proposal, recording });
  const [selectedGraphNodeId, setSelectedGraphNodeId] = useState("");
  const recordingFlowGraph = useMemo(() => recordingFlowProposalToGraph(recordingFlowProposal), [recordingFlowProposal]);
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
  const publishProposalStepSelection = (node: Node<AutomationPolicyNodeData> | undefined, step: ProposalStepViewModel | undefined) => {
    if (!proposal?.proposalId || !step) return;
    props.setSelection({
      kind: "proposal-step",
      id: step.id,
      proposalId: proposal.proposalId,
      ...(recording?.recordingId ? { recordingId: recording.recordingId } : {}),
      step: {
        label: step.label,
        description: step.description,
        actions: step.actions,
        requirements: step.requirements,
        expectedEffects: step.expectedEffects,
        confidence: step.confidence,
        occurrenceCount: step.occurrenceCount,
        ...(step.transition ? { transition: step.transition } : {}),
        evidence: step.evidence.map((signal) => ({ id: signal.id, title: signal.title, relation: signal.relation }))
      },
      ...(node ? { node: { label: node.data.label, description: node.data.description, ...(node.data.customDescription !== undefined ? { customDescription: node.data.customDescription } : {}) } } : {})
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
      const detail = (event as CustomEvent<{ nodeId?: string; label?: string; customDescription?: string }>).detail;
      if (!detail?.nodeId || detail.nodeId !== selectedGraphNode?.id) return;
      updateSelectedNode({
        ...(detail.label !== undefined ? { label: detail.label } : {}),
        ...(detail.customDescription !== undefined ? { customDescription: detail.customDescription } : {})
      });
    };
    window.addEventListener("automation-studio:update-proposal-node", onProposalNodeUpdate);
    return () => window.removeEventListener("automation-studio:update-proposal-node", onProposalNodeUpdate);
  }, [selectedGraphNode?.id, graph.nodes, graph.edges]);
  const policyOverride = () => proposal ? reactFlowGraphToPolicyOverride(proposal.policy, graphRef.current, proposal.policy?.taskId ?? proposal.proposalId) : null;
  const applyToExistingFlow = () => {
    if (!proposal) return;
    if (!props.proposalTargetFlowId) {
      window.alert("Open an existing canonical Flow before applying this proposal, or use Save as New Flow.");
      return;
    }
    const override = policyOverride();
    void props.onPipelineAction("approve-policy-proposal", { proposalId: proposal.proposalId, targetFlowId: props.proposalTargetFlowId, requireExistingFlow: true, ...(override ? { policyOverride: override as unknown as JsonObject } : {}) }, "Proposal applied to Flow.");
  };
  const saveAsNewFlow = () => {
    if (!proposal) return;
    const raw = window.prompt("Flow ID for the new saved Flow", `flow.${proposal.policy?.taskId ?? proposal.proposalId}`);
    const targetFlowId = raw?.trim();
    if (!targetFlowId) return;
    const override = reactFlowGraphToPolicyOverride(proposal.policy, graphRef.current, proposal.policy?.taskId ?? proposal.proposalId);
    void props.onPipelineAction("approve-policy-proposal", { proposalId: proposal.proposalId, targetFlowId, policyOverride: override as unknown as JsonObject }, "Proposal saved as Flow.");
  };
  const approveRecordingProposalToFlow = () => {
    if (!recordingFlowProposal) return;
    const flowId = window.prompt("Existing destination Flow ID (leave blank to create a new Flow)", "")?.trim();
    void props.onPipelineAction("review-recording-flow-proposal", {
      proposalId: recordingFlowProposal.proposalId,
      decision: "approved",
      destination: { kind: "flow", ...(flowId ? { flowId } : { name: `Recorded flow ${recordingFlowProposal.mapper.id}` }) }
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
          <button className="button button-primary" disabled={recordingFlowProposal ? recordingFlowProposal.status !== "proposed" : !proposal} onClick={recordingFlowProposal ? approveRecordingProposalToFlow : applyToExistingFlow} type="button"><CheckCircle2 size={13} aria-hidden />{recordingFlowProposal ? "Approve to Flow" : "Apply to Open Flow"}</button>
          <button className="button" disabled={!proposal || Boolean(recordingFlowProposal)} onClick={saveAsNewFlow} type="button"><Save size={13} aria-hidden />Save as New Flow</button>
          <button className="button" disabled={!proposal} onClick={() => proposal && props.onProcessProposalWithLlm(proposal.proposalId)} type="button"><Sparkles size={13} aria-hidden />Process With LLM</button>
        </div>
        {props.actionStatus ? <StatusText value={props.actionStatus} /> : null}
      </header>
      <section className="automation-proposal-body">
        {recordingFlowProposal ? <>
          <section className="automation-proposal-summary-panel">
            <div>
              <span>Recording mapper - {recordingFlowProposal.mapper.id} {recordingFlowProposal.mapper.version}</span>
              <strong>{recordingFlowProposal.candidates.length} proposed action nodes</strong>
              <p>Select a node to inspect output parameters, confirmation, observations, and evidence in the global inspector.</p>
              {recordingFlowProposal.invalidation?.reasons?.length ? <p>{recordingFlowProposal.invalidation.reasons.join(" ")}</p> : null}
            </div>
            <div className="automation-pipeline-controls">
              <StatusBadge value={recordingFlowProposal.status} />
              <button className="button" disabled={recordingFlowProposal.status !== "proposed"} onClick={() => void props.onPipelineAction("review-recording-flow-proposal", { proposalId: recordingFlowProposal.proposalId, decision: "approved", destination: { kind: "node", visibility: "private" } }, "Private recording node approved.")} type="button">Private Node</button>
              <button className="button" disabled={recordingFlowProposal.status !== "proposed"} onClick={() => void props.onPipelineAction("review-recording-flow-proposal", { proposalId: recordingFlowProposal.proposalId, decision: "approved", destination: { kind: "node", visibility: "public" } }, "Public recording node approved.")} type="button">Public Node</button>
              <button className="button" disabled={recordingFlowProposal.status !== "proposed"} onClick={() => void props.onPipelineAction("review-recording-flow-proposal", { proposalId: recordingFlowProposal.proposalId, decision: "rejected" }, "Recording proposal rejected.")} type="button">Reject</button>
            </div>
          </section>
          <section className="automation-proposal-graph-review">
            <AutomationPolicyGraphEditor
              className="proposal-review"
              editableNodeIds={recordingFlowGraph.nodes.map((node) => node.id)}
              edges={recordingFlowGraph.edges}
              mode="proposal-review"
              nodes={recordingFlowGraph.nodes}
              selectedNodeId={selectedGraphNodeId}
              onNodeSelect={(node) => {
                setSelectedGraphNodeId(node.id);
                const candidate = recordingFlowProposal.candidates[recordingFlowGraph.nodes.findIndex((item) => item.id === node.id)];
                publishRecordingCandidateSelection(props.setSelection, recordingFlowProposal, candidate, node);
              }}
            />
          </section>
        </> : null}
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
                publishProposalStepSelection(node, step);
              }}
            />
          </section>
        </> : null}
      </section>
    </section>
  );
}

function recordingFlowProposalToGraph(proposal: any): { nodes: Array<Node<AutomationPolicyNodeData>>; edges: Edge[] } {
  if (!proposal?.candidates?.length) return { nodes: [], edges: [] };
  const policy = {
    nodes: proposal.candidates.map((candidate: any, index: number) => ({
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
    edges: proposal.candidates.slice(1).map((candidate: any, index: number) => ({
      id: `edge.recorded.${index + 1}`,
      fromNodeId: recordingCandidateNodeId(proposal.candidates[index], index),
      toNodeId: recordingCandidateNodeId(candidate, index + 1),
      label: "Next"
    }))
  };
  const graph = policyToReactFlowGraph(policy, "");
  return {
    nodes: graph.nodes.map((node) => ({ ...node, data: { ...node.data, reviewTone: "proposed" as const } })),
    edges: graph.edges
  };
}

function publishRecordingCandidateSelection(setSelection: (selection: AutomationSelection) => void, proposal: any, candidate: any, node: Node<AutomationPolicyNodeData>): void {
  if (!candidate) return;
  setSelection({
    kind: "editor-node",
    id: node.id,
    node: {
      label: candidate.label ?? candidate.outputId,
      nodeType: "policy",
      family: "recording-proposal",
      description: `Recorded action candidate from mapper ${proposal.mapper?.id ?? "unknown"}.`,
      actionTypes: [candidate.outputId],
      inputs: node.data.inputs,
      outputs: node.data.outputs,
      parameters: node.data.parameters,
      parameterValues: {
        outputId: candidate.outputId,
        parameters: candidate.parameters ?? {},
        ...(candidate.expectedConfirmation ? { confirmationInputId: candidate.expectedConfirmation.inputId, confirmationTimeoutMs: candidate.expectedConfirmation.timeoutMs ?? 5_000 } : {})
      },
      metadata: {
        recordingProposalId: proposal.proposalId,
        recordingId: proposal.recordingId,
        candidateId: candidate.candidateId,
        confidence: candidate.confidence,
        outputId: candidate.outputId,
        expectedConfirmation: candidate.expectedConfirmation ?? null,
        sourceObservationIds: candidate.sourceObservationIds ?? [],
        evidence: candidate.evidence ?? [],
        policyStateEligible: false
      }
    }
  });
}

function recordingCandidateNodeId(candidate: any, index: number): string {
  return `recorded.${safeNodeSegment(candidate?.candidateId ?? String(index + 1))}`;
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
    return {
      ...(existing ?? {
        id: node.id,
        label: node.data.label,
        description: node.data.description,
        eligibility: { type: "all", conditions: [] },
        actions: node.data.actionTypes.length ? node.data.actionTypes.map((actionType, actionIndex) => ({ id: `action.${node.id}.${actionIndex + 1}`, actionType, parameters: {} })) : [],
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
      metadata: {
        ...((existing as any)?.metadata ?? {}),
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
      customDescription: node.data.customDescription
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label ?? edge.data?.label
    }))
  });
}

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
  proposalTargetTaskId: string | null;
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
  const proposal = props.selectedProposal;
  const recording = props.selectedRecording ?? props.recordings.find((item) => item.recordingId === proposal?.metadata?.recordingId);
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
      targetTaskId: props.proposalTargetTaskId ?? proposal.policy?.taskId ?? proposal.proposalId,
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
  const policyOverride = () => proposal ? reactFlowGraphToPolicyOverride(proposal.policy, graphRef.current, props.proposalTargetTaskId ?? proposal.policy?.taskId) : null;
  const applyToExistingTask = () => {
    if (!proposal) return;
    if (!props.proposalTargetTaskId) {
      window.alert("Open an existing saved task before applying this proposal, or use Save as New Task.");
      return;
    }
    const override = policyOverride();
    void props.onPipelineAction("approve-policy-proposal", { proposalId: proposal.proposalId, targetTaskId: props.proposalTargetTaskId, requireExistingTask: true, ...(override ? { policyOverride: override as unknown as JsonObject } : {}) }, "Proposal applied to task.");
  };
  const saveAsNewTask = () => {
    if (!proposal) return;
    const raw = window.prompt("Task ID for the new saved task", proposal.policy?.taskId ?? `task.${proposal.proposalId}`);
    const targetTaskId = raw?.trim();
    if (!targetTaskId) return;
    const override = reactFlowGraphToPolicyOverride(proposal.policy, graphRef.current, targetTaskId);
    void props.onPipelineAction("approve-policy-proposal", { proposalId: proposal.proposalId, targetTaskId, policyOverride: override as unknown as JsonObject }, "Proposal saved as task.");
  };
  return (
    <section className="automation-proposal-workspace">
      <header className="automation-proposal-header">
        <div>
          <strong>{model ? `Task Proposal: ${model.title}` : "Task Proposal"}</strong>
          <span>{model ? `Source recording ${model.source}` : "Select a generated proposal from the sidebar."}</span>
        </div>
        <div className="automation-pipeline-controls">
          <button className="button" disabled={!recording} onClick={() => recording && props.onOpenRecording(recording.recordingId)} type="button"><Link2 size={13} aria-hidden />Open Source Recording</button>
          <button className="button" disabled={!recording} onClick={() => recording && void props.onProcessFinalizedRecording(recording.recordingId, true)} type="button"><RefreshCcw size={13} aria-hidden />Regenerate Proposal</button>
          <button className="button button-primary" disabled={!proposal} onClick={applyToExistingTask} type="button"><CheckCircle2 size={13} aria-hidden />Apply to Open Task</button>
          <button className="button" disabled={!proposal} onClick={saveAsNewTask} type="button"><Save size={13} aria-hidden />Save as New Task</button>
          <button className="button" disabled={!proposal} onClick={() => proposal && props.onProcessProposalWithLlm(proposal.proposalId)} type="button"><Sparkles size={13} aria-hidden />Process With LLM</button>
        </div>
        {props.actionStatus ? <StatusText value={props.actionStatus} /> : null}
      </header>
      <section className="automation-proposal-body">
        {!model ? <div className="automation-project-empty compact"><strong>No proposal selected</strong><span>Finalized recordings generate proposals automatically. Regenerate from a source recording if needed.</span></div> : null}
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

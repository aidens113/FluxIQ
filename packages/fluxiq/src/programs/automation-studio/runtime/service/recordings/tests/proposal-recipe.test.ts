import { expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../../../model/index.ts";
import type { RecordingFlowActionCandidate, RecordingFlowProposalArtifact } from "../../../recording-flow-proposal.ts";
import { appendRecordingProposalToFlow } from "../proposal-candidates.ts";

it("retains exact Studio collision IDs, editor coordinates, property order and artifact metadata around the canonical recipe", () => {
  const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.actual", projectId: "project.actual", name: "Actual", now: 1, metadata: { recordingProposalIds: ["proposal.old", "proposal.old"] } });
  flow.nodes.push({ id: "recorded.candidate.actual", definitionId: "existing" });
  const candidate: RecordingFlowActionCandidate = { candidateId: "candidate.actual", actionEntryId: "entry.actual", sourceObservationIds: ["entry.actual"], sourceInputIds: [], outputId: "action.actual", parameters: { raw: true }, confidence: 0.9, evidence: [], policyStateEligible: false };
  const proposal: RecordingFlowProposalArtifact = { schemaVersion: "0.1", proposalId: "proposal.actual", projectId: "project.actual", recordingId: "recording.actual", domainId: "domain.actual", mapper: { id: "mapper.actual", version: "1.0.0", packageId: "package.actual", packageVersion: "1.0.0" }, status: "proposed", candidates: [candidate, candidate], generatedAt: 1, updatedAt: 1 };
  const bytes = JSON.stringify(flow);
  const appended = appendRecordingProposalToFlow(flow, proposal);
  expect(appended.nodes.slice(1).map((node) => [node.id, node.position])).toEqual([["recorded.candidate.actual.2", { x: 120, y: 240 }], ["recorded.candidate.actual.3", { x: 460, y: 240 }]]);
  expect(JSON.stringify(appended.nodes[1])).toBe('{"id":"recorded.candidate.actual.2","definitionId":"builtin.policy.action","label":"action.actual","parameterValues":{"outputId":"action.actual","parameters":{"raw":true}},"position":{"x":120,"y":240},"metadata":{"recordingProposalId":"proposal.actual","recordingCandidateId":"candidate.actual","mapperId":"mapper.actual","mapperVersion":"1.0.0","actionEntryId":"entry.actual","timelineEntryId":"entry.actual","sourceObservationIds":["entry.actual"],"evidence":[],"rawEvidenceImmutable":true,"manualProvenance":[]}}');
  expect(appended.edges).toEqual([{ id: "recorded-edge.proposal.actual.1", sourceNodeId: "recorded.candidate.actual.2", targetNodeId: "recorded.candidate.actual.3", sourcePortId: "success", targetPortId: "ready", metadata: { recordingProposalId: "proposal.actual" } }]);
  expect(appended.metadata?.recordingProposalIds).toEqual(["proposal.old", "proposal.actual"]);
  expect(JSON.stringify(flow)).toBe(bytes);
});

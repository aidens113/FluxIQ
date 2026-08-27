import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationProposalView, proposalNodeStateRequest } from "./ProposalView";

describe("AutomationProposalView state linking", () => {
  it("renders recording flow proposals that are missing mapper metadata", () => {
    const html = renderToStaticMarkup(createElement(AutomationProposalView, {
      actionStatus: "",
      pipelineArtifacts: {
          recordingFlowProposals: [{
            proposalId: "proposal.partial",
            recordingId: "recording.web",
            status: "proposed",
            generatedAt: 1,
            candidates: []
          }]
      },
      proposalReview: null,
      recordings: [{ recordingId: "recording.web" }],
      selectedProposal: { proposalId: "proposal.partial", recordingId: "recording.web", candidates: [] },
      selectedRecording: { recordingId: "recording.web" },
      onEnsureInspectorAvailable: () => undefined,
      setSelection: () => undefined
    }));

    expect(html).toContain("Recording Flow Proposal: unknown mapper");
    expect(html).toContain("Legacy proposal");
    expect(html).not.toContain("Approve to Open Flow");
    expect(html).not.toContain("Generate Direct Proposal");
    expect(html).toContain("Legacy proposal");
    expect(html).not.toContain("Approve to Open Flow");
    expect(html).not.toContain("Generate Direct Proposal");
  });

  it("does not let an empty saved review hide a full refreshed proposal graph", () => {
    const html = renderToStaticMarkup(createElement(AutomationProposalView, {
      actionStatus: "",
      pipelineArtifacts: {
        recordingFlowProposals: []
      },
      proposalReview: {
        proposalId: "proposal.full",
        sourceGeneratedAt: 123,
        nodes: [],
        edges: []
      },
      recordings: [{ recordingId: "recording.web" }],
      selectedProposal: {
        proposalId: "proposal.full",
        recordingId: "recording.web",
        status: "proposed",
        generatedAt: 123,
        policy: {
          taskId: "recording.web",
          nodes: [{
            id: "node.click-submit",
            label: "Click submit",
            description: "Click submit",
            actions: [{ actionType: "web.dom.click" }],
            metadata: {}
          }],
          edges: []
        },
        metadata: { recordingId: "recording.web" }
      },
      selectedRecording: { recordingId: "recording.web" },
      onEnsureInspectorAvailable: () => undefined,
      setSelection: () => undefined
    }));

    expect(html).toContain("Click submit");
  });

  it("opens proposal node state at the node's source recording entry", () => {
    const request = proposalNodeStateRequest({
      node: {
        id: "recorded.candidate-one",
        data: {
          label: "Click submit",
          description: "Click submit",
          actionTypes: ["web.dom.click"],
          recovery: "pause",
          evidenceCount: 1,
          readinessCount: 0,
          successCount: 0,
          inputs: [],
          outputs: [],
          parameters: [],
          parameterValues: {},
          isStart: true,
          metadata: {
            actionEntryId: "entry.action.submit",
            timelineEntryId: "entry.action.submit",
            sourceObservationIds: ["entry.action.submit"],
            recordingId: "recording.web"
          }
        },
        position: { x: 0, y: 0 }
      } as any,
      proposal: { proposalId: "proposal.web", recordingId: "recording.web" },
      recording: { recordingId: "recording.web" },
      phase: "input"
    });

    expect(request).toEqual({
      nodeId: "recorded.candidate-one",
      proposalId: "proposal.web",
      recordingId: "recording.web",
      timelineEntryId: "entry.action.submit",
      phase: "input"
    });
  });

  it("prefers explicit action timeline metadata over source observation arrays", () => {
    const request = proposalNodeStateRequest({
      node: {
        id: "recorded.candidate-three",
        data: {
          label: "Click menu",
          description: "Click menu",
          actionTypes: ["web.dom.click"],
          recovery: "pause",
          evidenceCount: 1,
          readinessCount: 0,
          successCount: 0,
          inputs: [],
          outputs: [],
          parameters: [],
          parameterValues: {},
          isStart: false,
          metadata: {
            timelineEntryId: "entry.action.menu",
            sourceObservationIds: ["entry.shared.snapshot", "entry.action.menu"]
          }
        },
        position: { x: 0, y: 0 }
      } as any,
      proposal: { proposalId: "proposal.web", recordingId: "recording.web" }
    });

    expect(request.timelineEntryId).toBe("entry.action.menu");
    expect(request.sourceId).toBeUndefined();
  });

  it("uses candidate actionEntryId when source observations start with shared state", () => {
    const request = proposalNodeStateRequest({
      node: {
        id: "recorded.candidate-four",
        data: {
          label: "Click continue",
          description: "Click continue",
          actionTypes: ["web.dom.click"],
          recovery: "pause",
          evidenceCount: 2,
          readinessCount: 0,
          successCount: 0,
          inputs: [],
          outputs: [],
          parameters: [],
          parameterValues: {},
          isStart: false,
          metadata: {
            actionEntryId: "entry.action.continue",
            timelineEntryId: "entry.action.continue",
            sourceObservationIds: ["entry.state.shared", "entry.action.continue"],
            evidence: [{ layer: "recording", entryId: "entry.state.shared" }]
          }
        },
        position: { x: 0, y: 0 }
      } as any,
      proposal: { proposalId: "proposal.web", recordingId: "recording.web" }
    });

    expect(request.timelineEntryId).toBe("entry.action.continue");
    expect(request.sourceId).toBeUndefined();
  });

  it("uses explicit state snapshot ids without also sending timeline ids", () => {
    const request = proposalNodeStateRequest({
      node: {
        id: "recorded.candidate-state-linked",
        data: {
          label: "Click linked",
          description: "Click linked",
          actionTypes: ["web.dom.click"],
          recovery: "pause",
          evidenceCount: 1,
          readinessCount: 0,
          successCount: 0,
          inputs: [],
          outputs: [],
          parameters: [],
          parameterValues: {},
          isStart: false,
          metadata: {
            actionEntryId: "entry.action.linked",
            timelineEntryId: "entry.action.linked",
            stateSnapshotId: "web.snapshot.linked",
            stateRef: "automation-object://project/demo/state",
            sourceObservationIds: ["entry.state.shared", "entry.action.linked"]
          }
        },
        position: { x: 0, y: 0 }
      } as any,
      proposal: { proposalId: "proposal.web", recordingId: "recording.web" }
    });

    expect(request.stateSnapshotId).toBe("web.snapshot.linked");
    expect(request.timelineEntryId).toBe("entry.action.linked");
  });

  it("does not use evidence entry IDs as state navigation", () => {
    const request = proposalNodeStateRequest({
      node: {
        id: "recorded.candidate-two",
        data: {
          label: "Click cancel",
          description: "Click cancel",
          actionTypes: ["web.dom.click"],
          recovery: "pause",
          evidenceCount: 1,
          readinessCount: 0,
          successCount: 0,
          inputs: [],
          outputs: [],
          parameters: [],
          parameterValues: {},
          isStart: false,
          metadata: {
            evidence: [{ layer: "recording", entryId: "entry.action.cancel" }]
          }
        },
        position: { x: 0, y: 0 }
      } as any,
      proposal: { proposalId: "proposal.web", metadata: { recordingId: "recording.web" } }
    });

    expect(request.timelineEntryId).toBeUndefined();
    expect(request.sourceId).toBeUndefined();
  });
});

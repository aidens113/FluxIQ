import { describe, expect, it } from "vitest";
import {
  automationStudioFlowNeedsDetail,
  automationStudioGatewayActivitySnapshot,
  flowSummariesToCatalogEntries,
  proposalArtifactKind,
  proposalSummariesToPolicyArtifacts,
  proposalSummariesToRecordingFlowArtifacts,
  recordingSummariesToRecordingStubs,
  runtimeSummaryToSessionStub
} from "./project-summary-converters";

describe("project summary converters", () => {
  it("creates bounded summary-only recording and runtime stubs", () => {
    const [recording] = recordingSummariesToRecordingStubs([{
      recordingId: "recording.one",
      domainId: "web",
      startedAt: 10,
      eventCount: 4
    }]);
    expect(recording).toMatchObject({
      recordingId: "recording.one",
      environment: { id: "web", domainId: "web" },
      metadata: { summaryOnly: true, eventCount: 4 },
      timeline: []
    });
    expect(runtimeSummaryToSessionStub({ runId: "run.one", status: "complete", updatedAt: 20 })).toEqual({
      runId: "run.one",
      targetKind: undefined,
      targetId: undefined,
      status: "complete",
      updatedAt: 20,
      metadata: { summaryOnly: true }
    });
  });

  it("routes proposal summaries to their matching artifact collections", () => {
    const summaries = [
      { proposalId: "policy.one", recordingId: "recording.one", kind: "llm_assisted", status: "approved", generatedAt: 10, mode: "adaptive" },
      { proposalId: "flow.one", recordingId: "recording.one", kind: "recording_flow", status: "generated", generatedAt: 20 }
    ];
    expect(proposalSummariesToPolicyArtifacts(summaries)).toMatchObject([{
      proposalId: "policy.one",
      status: "approved",
      metadata: { summaryOnly: true, generationMode: "adaptive" }
    }]);
    expect(proposalSummariesToRecordingFlowArtifacts(summaries)).toMatchObject([{
      proposalId: "flow.one",
      status: "proposed",
      candidates: [],
      metadata: { summaryOnly: true }
    }]);
  });

  it("rebuilds canonical Flow catalog entries from compact summaries", () => {
    const [entry] = flowSummariesToCatalogEntries([{
      flowId: "flow.parent",
      projectId: "project.one",
      name: "Parent",
      updatedAt: 50,
      hierarchySubflows: [{ subflowId: "subflow.child", name: "Child", parentCategoryId: "category.one" }]
    }]);
    expect(entry).toMatchObject({
      source: "canonical",
      readOnly: false,
      flow: {
        flowId: "flow.parent",
        nodes: [],
        metadata: {
          summaryOnly: true,
          hierarchySubflows: [{
            subflowId: "subflow.child",
            name: "Child",
            parentCategoryId: "category.one",
            metadata: { subflowCategoryId: "category.one" }
          }]
        }
      }
    });
    expect(automationStudioFlowNeedsDetail(entry.flow, "flow-nodes", undefined)).toBe(true);
    expect(proposalArtifactKind({ metadata: { summaryOnly: true, generationMode: "adaptive" } })).toBe("policy");
  });

  it("keeps only bounded gateway activity required by Studio", () => {
    const snapshot = automationStudioGatewayActivitySnapshot({
      sessions: [{ sessionId: "session.one", activeRecordingId: "recording.one", ignored: true }],
      auditLog: [
        { id: "ignored", type: "other" },
        { id: "required", type: "recording.project_required", message: "Choose a project" }
      ]
    });
    expect(snapshot).toEqual({
      sessions: [{ id: "session.one", activeRecordingId: "recording.one" }],
      auditLog: [{ id: "required", type: "recording.project_required", message: "Choose a project" }]
    });
  });
});

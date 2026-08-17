import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAutomationStudioFileStorePaths,
  emptyFlowSummaryIndex,
  emptyObjectIndex,
  emptyProposalSummaryIndex,
  emptyRecordingSummaryIndex,
  emptyRuntimeSummaryIndex,
  emptyAutomationStudioRootIndex,
  projectSummaryFromProject,
  proposalSummaryFromPolicyProposal,
  proposalSummaryFromRecordingFlowProposal
} from "./file-store.ts";

describe("Automation Studio file-store contracts", () => {
  it("builds canonical project-owned artifact paths", () => {
    const paths = createAutomationStudioFileStorePaths(path.join("root", "automation-studio"));

    expect(paths.rootIndex()).toBe(path.join("root", "automation-studio", "index.json"));
    expect(paths.projectFile("Project One")).toBe(path.join("root", "automation-studio", "projects", "project_one", "project.json"));
    expect(paths.indexFile("Project One", "proposals")).toBe(path.join("root", "automation-studio", "projects", "project_one", "indexes", "proposals.json"));
    expect(paths.recordingIndexFile("Project One", "client recording/1")).toBe(path.join("root", "automation-studio", "projects", "project_one", "recordings", "client_recording_1", "index.json"));
    expect(paths.recordingFile("Project One", "client recording/1")).toBe(path.join("root", "automation-studio", "projects", "project_one", "recordings", "client_recording_1", "recording.json"));
    expect(paths.recordingTimelineFile("Project One", "client recording/1")).toBe(path.join("root", "automation-studio", "projects", "project_one", "recordings", "client_recording_1", "timeline.jsonl"));
    expect(paths.recordingSnapshotFile("Project One", "client recording/1", "snapshot:42")).toBe(path.join("root", "automation-studio", "projects", "project_one", "recordings", "client_recording_1", "snapshots", "snapshot_42.json"));
    expect(paths.proposalFile("Project One", "client recording/1", "proposal:best")).toBe(path.join("root", "automation-studio", "projects", "project_one", "proposals", "client_recording_1", "proposal_best", "proposal.json"));
    expect(paths.flowFile("Project One", "flow/main")).toBe(path.join("root", "automation-studio", "projects", "project_one", "flows", "flow_main", "flow.json"));
    expect(paths.flowPublicationFile("Project One", "flow/main", "1.0.0")).toBe(path.join("root", "automation-studio", "projects", "project_one", "flows", "flow_main", "publications", "1.0.0.json"));
    expect(paths.runtimeRunFile("Project One", "run/main")).toBe(path.join("root", "automation-studio", "projects", "project_one", "runtime", "runs", "run_main", "run.json"));
    expect(paths.sharedObjectRoot("Project One")).toBe(path.join("root", "automation-studio", "projects", "project_one", "objects", "shared"));
  });

  it("creates empty indexes with explicit schema versions", () => {
    expect(emptyAutomationStudioRootIndex()).toEqual({ schemaVersion: "0.1", projects: [] });
    expect(emptyRecordingSummaryIndex()).toEqual({ schemaVersion: "0.1", recordings: [] });
    expect(emptyProposalSummaryIndex()).toEqual({ schemaVersion: "0.1", proposals: [] });
    expect(emptyFlowSummaryIndex()).toEqual({ schemaVersion: "0.1", flows: [] });
    expect(emptyRuntimeSummaryIndex()).toEqual({ schemaVersion: "0.1", runs: [] });
    expect(emptyObjectIndex()).toEqual({ schemaVersion: "0.1", objects: [] });
  });

  it("maps project and proposal documents into lightweight summaries", () => {
    expect(projectSummaryFromProject({
      id: "project.one",
      name: "Project One",
      description: "Example",
      domainId: "web",
      createdAt: 10,
      updatedAt: 20
    }, { recordings: 1, proposals: 2, flows: 3 })).toEqual({
      projectId: "project.one",
      name: "Project One",
      description: "Example",
      domainId: "web",
      createdAt: 10,
      updatedAt: 20,
      counts: { recordings: 1, proposals: 2, flows: 3 }
    });

    expect(proposalSummaryFromPolicyProposal({
      schemaVersion: "0.1",
      proposalId: "proposal.policy",
      learnedTaskModelId: "model.one",
      summary: "Generated proposal",
      policy: { policyId: "policy.one", taskId: "task.one", nodes: [{ id: "node.one" }], edges: [] } as any,
      patch: { targetTaskId: "task.one", mergeStrategy: "append_or_branch", nodes: [], edges: [] } as any,
      status: "proposed",
      generatedAt: 100,
      metadata: { recordingId: "recording.one", generationMode: "direct" }
    })).toMatchObject({
      proposalId: "proposal.policy",
      recordingId: "recording.one",
      kind: "direct",
      status: "generated",
      nodeCount: 1,
      mode: "direct"
    });

    expect(proposalSummaryFromRecordingFlowProposal({
      schemaVersion: "0.1",
      proposalId: "proposal.flow",
      projectId: "project.one",
      recordingId: "recording.one",
      domainId: "web",
      mapper: { id: "mapper.web", version: "1.0.0", packageId: "pkg.web", packageVersion: "1.0.0" },
      status: "invalidated",
      candidates: [{ candidateId: "candidate.one", actionEntryId: "entry.action.one", sourceObservationIds: [], sourceInputIds: [], outputId: "click", parameters: {}, confidence: 1, evidence: [], policyStateEligible: false }],
      invalidation: { invalidatedAt: 300, reasons: ["missing output"], affectedFlowIds: [] },
      generatedAt: 200,
      updatedAt: 300
    })).toMatchObject({
      proposalId: "proposal.flow",
      recordingId: "recording.one",
      kind: "recording_flow",
      status: "invalidated",
      nodeCount: 1,
      issueCount: 1,
      lastValidatedAt: 300
    });
  });
});

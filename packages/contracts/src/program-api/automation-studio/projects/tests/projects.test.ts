// The projects inputs: each accepts the request its handler reads, with a plain refusal otherwise.
import { describe, expect, it } from "vitest";
import * as inputs from "../index.ts";

describe("projects inputs", () => {
  it("accept the minimal request of each endpoint", () => {
    const p = { projectId: "p" };
    const rec = { ...p, recordingId: "r" };
    const examples: Array<[{ parse(payload: unknown): unknown }, Record<string, unknown>]> = [
      [inputs.listProjectsInput, {}], [inputs.createProjectInput, { name: "Weekly" }],
      [inputs.updateProjectInput, { ...p, name: "Renamed", categoryId: null }], [inputs.deleteProjectInput, p],
      [inputs.listProjectProblemsInput, { ...p, limit: 10 }],
      [inputs.createProjectCategoryInput, { name: "Work" }], [inputs.updateProjectCategoryInput, { categoryId: "c", name: "Home" }],
      [inputs.deleteProjectCategoryInput, { categoryId: "c" }],
      [inputs.listConversationsInput, { projectId: null }], [inputs.listConversationsInput, { ...p, subjectKind: "flow", subjectId: "f", status: "open" }],
      [inputs.getConversationInput, { ...p, conversationId: "c" }],
      [inputs.getRecordingCapturePolicyInput, {}], [inputs.getRecordingInput, rec],
      [inputs.updateRecordingInput, { ...rec, archived: true }], [inputs.deleteRecordingInput, rec],
      [inputs.deleteRecordingsInput, { ...p, recordingIds: ["r"] }],
      [inputs.getProposalInput, { ...p, proposalId: "x" }], [inputs.generateRecordingProposalInput, { ...rec, mode: "direct" }],
      [inputs.reviewRecordingFlowProposalInput, { ...p, proposalId: "x", decision: "approved" }],
      [inputs.clientGatewaySnapshotInput, {}], [inputs.listClientGatewayItemsInput, { kind: "trustedClients" }],
      [inputs.revokeClientTrustInput, { trustedClientId: "t" }]
    ];
    for (const [input, example] of examples) expect(() => input.parse(example)).not.toThrow();
  });

  it("refuse a missing id, a wrong choice and an empty list with the field named", () => {
    expect(inputs.createProjectInput.read({})).toEqual({ ok: false, error: expect.stringContaining("name") });
    expect(inputs.getRecordingInput.read({ projectId: "p" })).toEqual({ ok: false, error: expect.stringContaining("recordingId") });
    expect(inputs.listConversationsInput.read({ projectId: "p", status: "closed" }).ok).toBe(false);
    expect(inputs.deleteRecordingsInput.read({ projectId: "p", recordingIds: [] }).ok).toBe(false);
    expect(inputs.reviewRecordingFlowProposalInput.read({ projectId: "p", proposalId: "x", decision: "maybe" }).ok).toBe(false);
    expect(inputs.listClientGatewayItemsInput.read({ kind: "everything" }).ok).toBe(false);
  });
});

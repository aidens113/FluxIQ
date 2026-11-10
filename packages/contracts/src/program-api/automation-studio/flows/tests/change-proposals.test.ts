// The change-proposal inputs: each accepts the request its handler reads.
import { describe, expect, it } from "vitest";
import { getFlowChangeProposalInput, listFlowChangeProposalsInput } from "../index.ts";

describe("Flow change proposal inputs", () => {
  it("list needs only a project", () => {
    expect(listFlowChangeProposalsInput.parse({ projectId: "p", flowId: "f", limit: 5 })).toEqual({ projectId: "p", flowId: "f", limit: 5 });
    expect(listFlowChangeProposalsInput.read({}).ok).toBe(false);
  });

  it("get needs the proposal", () => {
    expect(getFlowChangeProposalInput.parse({ projectId: "p", flowId: "f", proposalId: "x" }).proposalId).toBe("x");
    expect(getFlowChangeProposalInput.read({ projectId: "p", flowId: "f" })).toEqual({ ok: false, error: expect.stringContaining("proposalId") });
  });
});

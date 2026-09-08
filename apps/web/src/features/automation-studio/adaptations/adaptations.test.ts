import { describe, expect, it, vi } from "vitest";
import { adaptationChangedFields, adaptationObjectTarget, adaptationReviewActions } from "./adaptation-model";
import { reviewFlowAdaptation } from "./adaptation-commands";
describe("adaptation domain", () => {
  it("presents changed fields and valid review actions", () => {
    expect(adaptationChangedFields({ enabled: false }, { enabled: true })).toEqual([{ path: "enabled", before: "No", after: "Yes" }]);
    expect(adaptationObjectTarget("edit_subflow", "s")).toMatchObject({ view: "subflows", targetId: "s" });
    expect(adaptationReviewActions("proposed")).toContain("approve");
    expect(adaptationReviewActions("proposed", "flow_bootstrap")).toEqual(["approve", "reject"]);
    expect(adaptationReviewActions("validated", "flow_bootstrap")).toEqual(["apply", "reject"]);
    expect(adaptationReviewActions("applied", "flow_bootstrap")).toEqual(["revert"]);
  });
  it("owns review mutations", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true });
    await reviewFlowAdaptation({ post } as any, { action: "approve" });
    expect(post).toHaveBeenCalledWith("review-flow-adaptation", { action: "approve" });
  });
});

import { describe, expect, it, vi } from "vitest";
import { adaptationChangedFields, adaptationObjectTarget, adaptationReviewActions } from "./adaptation-model";
import { reviewFlowAdaptation } from "./adaptation-commands";
describe("adaptation domain", () => {
  it("presents changed fields and valid review actions", () => {
    expect(adaptationChangedFields({ enabled: false }, { enabled: true })).toEqual([{ path: "enabled", before: "No", after: "Yes" }]);
    expect(adaptationObjectTarget("edit_subflow", "s")).toMatchObject({ view: "subflows", targetId: "s" });
    expect(adaptationReviewActions("proposed")).toContain("approve");
  });
  it("owns review mutations", async () => {
    const post = vi.fn().mockResolvedValue({ ok: true });
    await reviewFlowAdaptation({ post } as any, { action: "approve" });
    expect(post).toHaveBeenCalledWith("review-flow-adaptation", { action: "approve" });
  });
});

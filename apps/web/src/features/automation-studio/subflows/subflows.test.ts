import { describe, expect, it, vi } from "vitest";
import { readSubflowDirectoryUrlState, routerReferencesForSubflow, subflowReadiness } from "./subflow-directory-model";
import { applySubflowDirectoryAction } from "./subflow-commands";
import { SubflowDirectoryContent } from "./SubflowsView";

describe("subflow domain", () => {
  it("bounds SQL directory pages and reports readiness", () => {
    expect(readSubflowDirectoryUrlState({ limit: 50, offset: 100 })).toMatchObject({ limit: 50, offset: 100 });
    expect(subflowReadiness({ status: "active", graphFlowId: "graph", localInstructionIds: ["i"] }).label).toBe("Ready");
  });

  it("derives Router references and owns mutations", async () => {
    expect(routerReferencesForSubflow({ rules: [{ ruleId: "r", target: { kind: "subflow", subflowId: "s" } }] }, "s")).toHaveLength(1);
    const post = vi.fn().mockResolvedValue({ ok: true });
    await applySubflowDirectoryAction({ post } as any, "archive", { subflowId: "s" });
    expect(post).toHaveBeenCalledWith("archive-flow-subflow", { subflowId: "s" });
    expect(SubflowDirectoryContent.toString()).toContain("subscribeToAutomationStudioMutations");
    expect(SubflowDirectoryContent.toString()).toContain("commitAutomationStudioMutation");
    expect(SubflowDirectoryContent.toString()).toContain("commands.applyAction");
  });
});
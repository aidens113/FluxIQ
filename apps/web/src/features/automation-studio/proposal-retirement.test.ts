import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

describe("proposal UI retirement", () => {
  it("keeps Adaptations as the only normal generated-change review surface", () => {
    const types = source("./types.ts");
    const renderer = source("./views/Renderer.tsx");
    const workspaceViews = source("./views/WorkspaceViews.tsx");
    const live = source("./AutomationStudioLive.tsx");
    const hierarchy = source("./hierarchy/model.ts");
    const generator = source("./views/ProposalGeneratorView.tsx");
    const workbench = source("./views/ProposalView.tsx");

    expect(types).not.toContain('"change-proposals"');
    expect(renderer).not.toContain("AutomationChangeProposalsWorkspace");
    expect(workspaceViews).not.toContain("AutomationChangeProposalsWorkspace");
    expect(hierarchy).not.toContain("proposalHierarchyNodes");
    expect(live).not.toContain('"create-recording-flow-proposals"');
    expect(live).not.toContain('"generate-recording-proposal"');
    expect(generator).not.toContain("onGenerate");
    expect(generator).not.toContain("Generate Assisted Proposal");
    expect(workbench).not.toContain("onPipelineAction");
    expect(workbench).not.toContain("Save as New Flow");
    expect(renderer).toContain('view.type === "adaptations"');
    expect(hierarchy).toContain('{ id: "adaptations", label: "Adaptations"');
  });
});
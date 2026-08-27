import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationProposalView } from "./ProposalView";

describe("AutomationProposalView compatibility", () => {
  it("keeps persisted proposals readable without a mutation path", () => {
    const html = renderToStaticMarkup(
      <AutomationProposalView
        actionStatus=""
        pipelineArtifacts={{ policyProposals: [] }}
        proposalReview={null}
        recordings={[]}
        selectedProposal={null}
        selectedRecording={null}
        onEnsureInspectorAvailable={() => undefined}
        setSelection={() => undefined}
      />
    );
    const source = AutomationProposalView.toString();

    expect(html).toContain("Legacy proposal");
    expect(html).toContain("compatibility view is read-only");
    expect(html).toContain("Open Adaptations");
    expect(html).toContain("Open Recordings");
    expect(html).toContain("No proposal selected");
    expect(source).toContain("editableNodeIds: []");
    expect(source).toContain("showPalette: false");
    expect(source).not.toContain("window.prompt");
    expect(source).not.toContain("onPipelineAction");
    expect(source).not.toContain("GenerateDirectProposal");
    expect(source).not.toContain("Process With LLM");
    expect(source).not.toContain("Save as New Flow");
  });
});
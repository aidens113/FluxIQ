import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationProposalGeneratorView } from "./ProposalGeneratorView";

describe("AutomationProposalGeneratorView", () => {
  it("renders LLM-assisted generation above direct generation", () => {
    const html = renderToStaticMarkup(
      <AutomationProposalGeneratorView
        actionStatus=""
        generationBusy={false}
        proposals={[]}
        recordingProcessing={null}
        selectedRecording={{ recordingId: "recording.one", startedAt: 1, endedAt: 2, metadata: { name: "Checkout flow" } }}
        onGenerateAssisted={async () => true}
        onGenerateDirect={async () => true}
      />
    );

    expect(html.indexOf("LLM-Assisted")).toBeGreaterThan(-1);
    expect(html.indexOf("OR")).toBeGreaterThan(html.indexOf("LLM-Assisted"));
    expect(html.indexOf("Direct Generation")).toBeGreaterThan(html.indexOf("OR"));
    expect(html).toContain("Generate Assisted Proposal");
    expect(html).toContain("Generate Direct Proposal");
  });
});

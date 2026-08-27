import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationProposalGeneratorView } from "./ProposalGeneratorView";

describe("AutomationProposalGeneratorView", () => {
  it("renders restored legacy tabs as read-only compatibility content", () => {
    const html = renderToStaticMarkup(
      <AutomationProposalGeneratorView selectedRecording={{ recordingId: "recording.one", metadata: { name: "Checkout flow" } }} />
    );

    expect(html).toContain("Legacy Proposal Generator");
    expect(html).toContain("Read-only compatibility view");
    expect(html).toContain("Recording-driven proposal generation is retired");
    expect(html).toContain("Open Adaptations");
    expect(html).toContain("Open Recordings");
    expect(html).toContain("recordingId=recording.one");
    expect(html).not.toContain("Generate Assisted Proposal");
    expect(html).not.toContain("Generate Direct Proposal");
    expect(AutomationProposalGeneratorView.toString()).not.toContain("onGenerate");
  });
});
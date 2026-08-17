import { describe, expect, it } from "vitest";
import { proposalHierarchyNodes } from "./model";

describe("proposalHierarchyNodes", () => {
  it("groups proposal attempts under their source recording folder", () => {
    const nodes = proposalHierarchyNodes([
      { recordingId: "recording.one", startedAt: 1, metadata: { clientName: "Browser" } }
    ], [
      { proposalId: "proposal.direct", recordingId: "recording.one", metadata: { generationMode: "direct" } },
      { proposalId: "proposal.assisted", recordingId: "recording.one", metadata: { generationMode: "llm_assisted", title: "Clean checkout" } }
    ]);

    const client = nodes.find((node) => node.kind === "folder" && node.label === "Browser");
    const folder = nodes.find((node) => node.kind === "folder" && node.sourceId === "recording.one");
    const proposals = nodes.filter((node) => node.kind === "proposal");

    expect(client).toMatchObject({ kind: "folder", parentId: null });
    expect(folder).toMatchObject({ kind: "folder", parentId: client?.id, sourceId: "recording.one" });
    expect(proposals).toHaveLength(2);
    expect(proposals.every((node) => node.parentId === folder?.id)).toBe(true);
    expect(proposals.map((node) => node.label)).toContain("Clean checkout");
    expect(proposals.map((node) => node.label)).toContain("Direct: proposal.direct");
  });
});

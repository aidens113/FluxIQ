import { describe, expect, it } from "vitest";
import { createAutomationStudioFixture } from "./fixtures";
import { validatePolicyGraph, validateRecordingSession, validateSignalRegistry } from "./validation";

describe("automation studio canonical model", () => {
  it("represents a domain-neutral recording, signal registry, and policy graph", () => {
    const fixture = createAutomationStudioFixture(10_000);

    expect(validateSignalRegistry(fixture.signalRegistry)).toEqual({ ok: true, issues: [] });
    expect(validateRecordingSession(fixture.recording)).toEqual({ ok: true, issues: [] });
    expect(validatePolicyGraph(fixture.policy)).toEqual({ ok: true, issues: [] });
  });

  it("keeps raw evidence linked without overwriting the recording", () => {
    const { policy, recording } = createAutomationStudioFixture();
    const confirmNode = policy.nodes.find((node) => node.id === "node.confirm");

    expect(confirmNode?.sourceEvidence).toContainEqual({
      layer: "raw_recording",
      artifactId: recording.recordingId,
      entryId: "entry.confirm"
    });
    expect(recording.timeline.find((entry) => entry.id === "entry.confirm")?.type).toBe("action");
  });

  it("reports structural issues before mining or runtime consume artifacts", () => {
    const { policy, recording, signalRegistry } = createAutomationStudioFixture();

    const invalidRecording = {
      ...recording,
      timeline: [
        recording.timeline[1]!,
        {
          ...recording.timeline[2]!,
          sequence: 1
        }
      ]
    };
    const invalidPolicy = {
      ...policy,
      edges: [
        {
          id: "edge.missing",
          fromNodeId: "node.open-dialog",
          toNodeId: "node.missing",
          probability: 1.2
        }
      ]
    };
    const invalidRegistry = {
      ...signalRegistry,
      definitions: [
        signalRegistry.definitions[0]!,
        {
          ...signalRegistry.definitions[0]!,
          defaultWeight: 2
        }
      ]
    };

    expect(validateRecordingSession(invalidRecording).issues.map((issue) => issue.code)).toContain("timeline.sequence_not_increasing");
    expect(validatePolicyGraph(invalidPolicy).issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["policy.edge_missing_to_node", "policy.invalid_edge_probability"])
    );
    expect(validateSignalRegistry(invalidRegistry).issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["signal.duplicate_path", "signal.invalid_weight"])
    );
  });
});

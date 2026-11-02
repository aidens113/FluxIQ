import { describe, expect, it } from "vitest";
import { compositeNodeDefinitionId, createBlankAutomationStudioFlowArtifact, createPublishedFlowSnapshot, projectPublishedFlowSnapshotToNodeDefinition } from "../index.ts";

describe("published Flow composites", () => {
const scope = { kind: "domain" as const, domainId: "example" };
const publishedFlow = () => ({
    ...createBlankAutomationStudioFlowArtifact({ flowId: "flow.shared", projectId: "project.shared", name: "Shared", scope, now: 1 }),
    interface: {
      inputs: [{ id: "input", name: "input", valueType: { kind: "string" as const } }],
      outputs: [{ id: "output", name: "output", valueType: { kind: "boolean" as const } }]
    }
  });

it("projects an immutable published snapshot into a typed, scoped composite node", () => {
    const snapshot = createPublishedFlowSnapshot(publishedFlow(), "1.0.0", 20);
    const definition = projectPublishedFlowSnapshotToNodeDefinition(snapshot);
    expect(snapshot.flowDigest).toMatch(/^sha256:/);
    expect(definition).toMatchObject({
      id: compositeNodeDefinitionId({ flowId: "flow.shared", version: "1.0.0" }),
      source: { kind: "composite", flowId: "flow.shared", version: "1.0.0" },
      availability: scope
    });
    expect(definition.inputs[0]).toMatchObject({ id: "input", valueType: "string" });
  });

  it("adds publication and display metadata without changing executable identity", () => {
    const flow = publishedFlow();
    const first = createPublishedFlowSnapshot(flow, "1.0.0", 20, { publishedBy: "publisher.first", changelog: "First" });
    const second = createPublishedFlowSnapshot({ ...flow, name: "Renamed", description: "Display text" }, "1.0.0", 99, { publishedBy: "publisher.second", changelog: "Second" });
    expect(first.flowDigest).toBe(second.flowDigest);
    expect(first).toMatchObject({ schemaVersion: "0.1", name: "Shared", publishedAt: 20, publishedBy: "publisher.first", changelog: "First" });
    expect(second).toMatchObject({ name: "Renamed", description: "Display text", publishedAt: 99, publishedBy: "publisher.second", changelog: "Second" });
    expect(first.nodes).not.toBe(flow.nodes);
    expect(first.interface).not.toBe(flow.interface);
  });
});

import { describe, expect, it } from "vitest";
import { graphSignature } from "./GraphEditorViews";

describe("Automation graph editor render-cost guards", () => {
  it("does not include full node payloads or bulky metadata in graph signatures", () => {
    const signature = graphSignature([
      {
        id: "node.large",
        type: "automationPolicy",
        position: { x: 10, y: 20 },
        data: {
          label: "Large node",
          nodeDefinitionId: "builtin.policy.action",
          inputs: [{ id: "in", value: "ignored-large-input".repeat(200) }],
          outputs: [{ id: "out", value: "ignored-large-output".repeat(200) }],
          parameters: [{ id: "selector", schema: "ignored-large-schema".repeat(200) }],
          metadata: {
            ownerKind: "flow",
            ownerId: "flow.large",
            rawRecordingPayload: "ignored-large-metadata".repeat(500)
          }
        }
      }
    ] as any, []);

    expect(signature).toContain("node.large");
    expect(signature).toContain("selector");
    expect(signature).not.toContain("ignored-large-input");
    expect(signature).not.toContain("ignored-large-output");
    expect(signature).not.toContain("ignored-large-schema");
    expect(signature).not.toContain("ignored-large-metadata");
  });
});

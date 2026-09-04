import { describe, expect, it } from "vitest";
import { automationInspectorReferenceOptions } from "./reference-options";

describe("automationInspectorReferenceOptions", () => {
  it("exposes registered signals as state parameter paths", () => {
    const options = automationInspectorReferenceOptions({
      flow: null,
      nodeDefinitions: [],
      policies: [],
      pipelineArtifacts: {},
      signals: [{ path: "app.currentMessage", type: "string", metadata: { label: "Current message" } }]
    });

    expect(options.state).toEqual([{ id: "app.currentMessage", label: "Current message", detail: "string" }]);
  });
});

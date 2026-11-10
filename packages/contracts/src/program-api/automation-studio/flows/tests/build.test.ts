// The build inputs: stopping and explaining a build, and the model-readiness check that takes no fields.
import { describe, expect, it } from "vitest";
import { cancelFlowBootstrapInput, getFlowBootstrapFailureInput, getFlowBootstrapGenerationReadinessInput } from "../index.ts";

describe("Flow build inputs", () => {
  it("cancel and failure need a project and a Flow", () => {
    expect(cancelFlowBootstrapInput.parse({ projectId: "p", flowId: "f" })).toEqual({ projectId: "p", flowId: "f" });
    expect(getFlowBootstrapFailureInput.read({ flowId: "f" }).ok).toBe(false);
  });

  it("readiness takes no fields", () => {
    expect(getFlowBootstrapGenerationReadinessInput.parse({})).toEqual({});
    expect(getFlowBootstrapGenerationReadinessInput.jsonSchema().type).toBe("object");
  });
});

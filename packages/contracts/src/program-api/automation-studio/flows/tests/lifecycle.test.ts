// The Flow lifecycle inputs: each accepts the request its handler reads, with a plain refusal otherwise.
import { describe, expect, it } from "vitest";
import { deleteFlowInput, deprecateFlowPublicationInput, inspectFlowDependenciesInput, listFlowPublicationsInput, publishFlowInput } from "../index.ts";

describe("Flow lifecycle inputs", () => {
  it("delete and dependency inspection need a project and a Flow", () => {
    expect(deleteFlowInput.parse({ projectId: "p", flowId: "f" })).toEqual({ projectId: "p", flowId: "f" });
    expect(inspectFlowDependenciesInput.read({ projectId: "p" })).toEqual({ ok: false, error: expect.stringContaining("flowId") });
  });

  it("publish needs a version and takes an optional changelog", () => {
    expect(publishFlowInput.parse({ projectId: "p", flowId: "f", version: "1.0.0", changelog: "First." })).toEqual({ projectId: "p", flowId: "f", version: "1.0.0", changelog: "First." });
    expect(publishFlowInput.read({ projectId: "p", flowId: "f" }).ok).toBe(false);
  });

  it("listing versions works for a whole project, and deprecating needs a version", () => {
    expect(listFlowPublicationsInput.parse({ projectId: "p" })).toEqual({ projectId: "p" });
    expect(deprecateFlowPublicationInput.parse({ projectId: "p", flowId: "f", version: "1.0.0", reason: "Old." }).reason).toBe("Old.");
    expect(deprecateFlowPublicationInput.read({ projectId: "p", flowId: "f" }).ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { createBlankAutomationStudioFlowArtifact } from "../../index.ts";
import { validateExecutableFlow } from "../../../../../flows/executable/validation/index.ts";
import { validateAutomationStudioFlow } from "../flow.ts";

describe("Studio Flow validation envelope", () => {
  it("composes the framework validator without changing a valid result", () => {
    const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.envelope", projectId: "project", name: "Envelope", now: 1 });
    expect(validateAutomationStudioFlow(flow)).toEqual(validateExecutableFlow(flow));
  });
  it("retains project, source and timestamp checks in their established order", () => {
    const flow = createBlankAutomationStudioFlowArtifact({ flowId: "", projectId: "", name: "", now: 2 });
    flow.updatedAt = 1;
    flow.source = { mode: "code", moduleId: "" };
    expect(validateAutomationStudioFlow(flow).issues.map(issue => issue.code)).toEqual(["flow.missing_id", "flow.missing_project_id", "flow.missing_name", "flow.updated_before_created", "flow.missing_code_module", "flow.incomplete_code_compilation"]);
  });
  it("keeps public publication policy outside executable validation", () => {
    const flow = createBlankAutomationStudioFlowArtifact({ flowId: "flow.public", projectId: "project", name: "Public", now: 1 });
    flow.visibility = "public";
    expect(validateExecutableFlow(flow)).toEqual({ ok: true, issues: [] });
    expect(validateAutomationStudioFlow(flow).issues).toMatchObject([{ code: "flow.public_requires_published_version" }]);
  });
});

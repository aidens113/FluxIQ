import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_AUTHORING_MODE_ENV, resolveAutomationStudioBuildAuthoringMode } from "../index.ts";

const env = (mode?: string) => (mode === undefined ? {} : { [AUTOMATION_STUDIO_AUTHORING_MODE_ENV]: mode });

describe("the authoring mode a build runs in", () => {
  it("builds a creation in the configured mode", () => {
    expect(resolveAutomationStudioBuildAuthoringMode("create", env())).toBe("project");
    expect(resolveAutomationStudioBuildAuthoringMode("create", env("project"))).toBe("project");
    expect(resolveAutomationStudioBuildAuthoringMode("create", env("candidate"))).toBe("candidate");
    expect(resolveAutomationStudioBuildAuthoringMode("create", env("legacy"))).toBe("legacy");
  });

  it("extends as a candidate build when the configured mode is project, which cannot extend yet", () => {
    expect(resolveAutomationStudioBuildAuthoringMode("extend", env())).toBe("candidate");
    expect(resolveAutomationStudioBuildAuthoringMode("extend", env("project"))).toBe("candidate");
    expect(resolveAutomationStudioBuildAuthoringMode("extend", env("candidate"))).toBe("candidate");
  });

  it("leaves legacy alone, so an opted-out Core extends as legacy", () => {
    expect(resolveAutomationStudioBuildAuthoringMode("extend", env("legacy"))).toBe("legacy");
  });

  it("refuses a misconfigured setting rather than guessing", () => {
    expect(() => resolveAutomationStudioBuildAuthoringMode("extend", env("sometimes"))).toThrow(/FLUXIQ_AUTHORING_MODE must be one of/u);
  });
});

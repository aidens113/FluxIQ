import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_AUTHORING_MODE_DEFAULT, AUTOMATION_STUDIO_AUTHORING_MODE_ENV, AUTOMATION_STUDIO_AUTHORING_MODES, isAutomationStudioAuthoringMode, resolveAutomationStudioAuthoringMode } from "../index.ts";

describe("authoring mode", () => {
  it("defaults to project when unset or blank (since A8 frozen pair 8)", () => {
    expect(AUTOMATION_STUDIO_AUTHORING_MODE_DEFAULT).toBe("project");
    expect(resolveAutomationStudioAuthoringMode({})).toBe("project");
    expect(resolveAutomationStudioAuthoringMode({ [AUTOMATION_STUDIO_AUTHORING_MODE_ENV]: "" })).toBe("project");
    expect(resolveAutomationStudioAuthoringMode({ [AUTOMATION_STUDIO_AUTHORING_MODE_ENV]: "  " })).toBe("project");
  });

  it.each(AUTOMATION_STUDIO_AUTHORING_MODES)("reads %s", (mode) => {
    expect(resolveAutomationStudioAuthoringMode({ [AUTOMATION_STUDIO_AUTHORING_MODE_ENV]: ` ${mode} ` })).toBe(mode);
  });

  it.each(["Candidate", "configured", "draft", "1", "true"])("refuses %s rather than falling back", (value) => {
    expect(() => resolveAutomationStudioAuthoringMode({ [AUTOMATION_STUDIO_AUTHORING_MODE_ENV]: value })).toThrow(/FLUXIQ_AUTHORING_MODE must be one of legacy, candidate/u);
  });

  it("recognizes only the exact mode spellings", () => {
    expect(isAutomationStudioAuthoringMode("legacy")).toBe(true);
    expect(isAutomationStudioAuthoringMode("candidate")).toBe(true);
    for (const value of ["LEGACY", " candidate", "", null, undefined, 1]) expect(isAutomationStudioAuthoringMode(value)).toBe(false);
  });
});
